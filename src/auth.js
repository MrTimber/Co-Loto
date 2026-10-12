// Connexion avec un compte Google, Microsoft, GitHub, Discord ou Facebook (OAuth 2.0 avec PKCE,
// bibliothèque openid-client).
// Chaque fournisseur n'est proposé que si ses identifiants sont définis dans l'environnement :
// sans aucun, le site fonctionne comme avant, sans compte.
import express from 'express';
import * as oidc from 'openid-client';
import { loginCodeEmail, verificationEmail } from './mail.js';
import { LOGIN_CODE_LIFETIME_MS } from './store.js';

const SESSION_COOKIE = 'coloto_session';
const OAUTH_COOKIE = 'coloto_oauth';
const OAUTH_MAX_AGE_MS = 10 * 60_000;
const NAME_MAX_LENGTH = 24; // comme le pseudo des parties
const EMAIL_MAX_LENGTH = 254;
const FACEBOOK_API_VERSION = 'v23.0';
// Annuaire des comptes Microsoft personnels (outlook.com, hotmail.com…), dont l'adresse est vérifiée par Microsoft.
const MICROSOFT_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

async function getJson(fetchImpl, url, accessToken) {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, 'user-agent': 'Co-Loto', accept: 'application/json' } });
  if (!res.ok) throw new Error(`Profil indisponible (${res.status})`);
  return res.json();
}

// Adresse email renvoyée par le fournisseur, et s'il l'a vérifiée.
const emailOf = (email, verified) => (typeof email === 'string' ? { email, emailVerified: Boolean(verified) } : { email: null, emailVerified: false });

const CODE_COOKIE = 'coloto_code';

// `server` : adresse de découverte OpenID Connect, ou points d'accès OAuth 2.0 déclarés à la main.
// `profile` renvoie l'identifiant, l'email et, quand le fournisseur en a un, un pseudo
// (jamais le vrai nom ni le prénom).
export const PROVIDERS = {
  google: {
    label: 'Google',
    envPrefix: 'GOOGLE',
    server: { discovery: () => 'https://accounts.google.com' },
    scopes: 'openid email',
    profile: async (tokens) => {
      const claims = tokens.claims();
      return { id: claims.sub, ...emailOf(claims.email, claims.email_verified) };
    },
  },
  microsoft: {
    label: 'Microsoft',
    envPrefix: 'MICROSOFT',
    server: { discovery: (env) => `https://login.microsoftonline.com/${env.MICROSOFT_TENANT || 'common'}/v2.0` },
    scopes: 'openid email',
    profile: async (tokens) => {
      // Seule l'adresse d'un compte personnel est vérifiée par Microsoft ; celle d'un compte
      // professionnel peut être saisie librement par l'administrateur de l'annuaire : elle est non vérifiée.
      const claims = tokens.claims();
      return { id: claims.sub, ...emailOf(claims.email, claims.tid === MICROSOFT_CONSUMER_TENANT) };
    },
  },
  github: {
    label: 'GitHub',
    envPrefix: 'GITHUB',
    server: {
      // Valeur du paramètre `iss` que GitHub ajoute au retour de connexion (RFC 9207) :
      // elle doit être identique, sinon le retour est refusé.
      issuer: 'https://github.com/login/oauth',
      authorization_endpoint: 'https://github.com/login/oauth/authorize',
      token_endpoint: 'https://github.com/login/oauth/access_token',
    },
    scopes: 'user:email',
    profile: async (tokens, fetchImpl) => {
      const user = await getJson(fetchImpl, 'https://api.github.com/user', tokens.access_token);
      const emails = await getJson(fetchImpl, 'https://api.github.com/user/emails', tokens.access_token);
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : null;
      return { id: String(user.id), pseudo: user.login, ...emailOf(primary?.email, primary?.verified) };
    },
  },
  discord: {
    label: 'Discord',
    envPrefix: 'DISCORD',
    server: {
      issuer: 'https://discord.com',
      authorization_endpoint: 'https://discord.com/oauth2/authorize',
      token_endpoint: 'https://discord.com/api/oauth2/token',
    },
    scopes: 'identify email',
    profile: async (tokens, fetchImpl) => {
      const user = await getJson(fetchImpl, 'https://discord.com/api/users/@me', tokens.access_token);
      return { id: String(user.id), pseudo: user.username, ...emailOf(user.email, user.verified) };
    },
  },
  facebook: {
    label: 'Facebook',
    envPrefix: 'FACEBOOK',
    server: {
      issuer: 'https://www.facebook.com',
      authorization_endpoint: `https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth`,
      token_endpoint: `https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token`,
    },
    scopes: 'email',
    profile: async (tokens, fetchImpl) => {
      // Seuls l'identifiant et l'email sont demandés ; Facebook ne renvoie que des adresses confirmées.
      const user = await getJson(fetchImpl, `https://graph.facebook.com/${FACEBOOK_API_VERSION}/me?fields=id,email`, tokens.access_token);
      return { id: String(user.id), ...emailOf(user.email, true) };
    },
  },
};

// Fournisseurs activés, dans l'ordre d'affichage. Le compte de test (`AUTH_DEV_LOGIN=1`)
// sert au développement local ; il est toujours refusé sur Render.
export function enabledProviders(env) {
  const ids = Object.keys(PROVIDERS).filter((id) => {
    const { envPrefix } = PROVIDERS[id];
    return env[`${envPrefix}_CLIENT_ID`] && env[`${envPrefix}_CLIENT_SECRET`];
  });
  if (env.AUTH_DEV_LOGIN === '1' && !env.RENDER) ids.push('dev');
  return ids;
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // cookie mal formé : ignoré
    }
  }
  return cookies;
}

export function cleanName(name) {
  return String(name ?? '').split(/\s/).filter(Boolean).join(' ').slice(0, NAME_MAX_LENGTH);
}

// Vérification simple de la forme d'une adresse email (sans expression régulière coûteuse).
export function isEmail(value) {
  if (typeof value !== 'string' || value.length > EMAIL_MAX_LENGTH || /\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0]) return false;
  const domain = parts[1];
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

const DEFAULT_RETURN = '/mon-espace';
const STATIC_RETURNS = new Map(['/', '/mon-espace', '/confidentialite'].map((path) => [path, path]));

// `findRoomId` : identifiant d'un salon ouvert, ou undefined.
// « alice@example.com » devient « a•••@example.com ».
export function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 1)}•••@${domain ?? ''}`;
}

// `mailer` : envoi des emails (voir mail.js), null s'il est indisponible.
export function createAuth({ store, env = process.env, mailer = null, findRoomId = () => undefined, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const providers = enabledProviders(env);

  // Adresse de retour après connexion : une page connue de ce site, reconstruite à partir
  // de nos propres données (jamais l'adresse reçue telle quelle).
  async function returnPath(value) {
    if (typeof value !== 'string') return DEFAULT_RETURN;
    const known = STATIC_RETURNS.get(value);
    if (known) return known;
    const grid = /^\/grille\/([\w-]{1,40})$/.exec(value);
    const gridId = grid && (await store.getGrid(grid[1]))?.id;
    if (gridId) return `/grille/${gridId}`;
    const room = /^\/salon\/([\w-]{1,40})$/.exec(value);
    const roomId = room && findRoomId(room[1]);
    if (roomId) return `/salon/${roomId}`;
    return DEFAULT_RETURN;
  }
  const router = express.Router();

  const cookieOptions = (req, maxAge, path = '/') => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge, path });

  // Adresse publique du site, pour l'URL de rappel déclarée chez chaque fournisseur.
  function baseUrl(req) {
    const configured = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL;
    let url = configured || `${req.protocol}://${req.get('host')}`;
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  const callbackUrl = (req, providerId) => `${baseUrl(req)}/auth/${providerId}/callback`;

  // Configuration de chaque fournisseur, préparée une seule fois (la découverte OpenID Connect
  // interroge le fournisseur ; en cas d'échec, elle sera retentée à la connexion suivante).
  const configurations = new Map();
  function configuration(providerId) {
    if (!configurations.has(providerId)) {
      const { envPrefix, server } = PROVIDERS[providerId];
      const clientId = env[`${envPrefix}_CLIENT_ID`];
      const secret = env[`${envPrefix}_CLIENT_SECRET`];
      const ready = server.discovery
        ? oidc.discovery(new URL(server.discovery(env)), clientId, secret)
        : Promise.resolve(new oidc.Configuration(server, clientId, secret));
      configurations.set(providerId, ready.catch((err) => {
        configurations.delete(providerId);
        throw err;
      }));
    }
    return configurations.get(providerId);
  }

  function currentUser(req) {
    return store.getSessionUser(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  }

  // Pseudo d'un nouveau compte : celui du fournisseur s'il en a un (GitHub, Discord),
  // sinon celui que le joueur utilise déjà dans ses parties.
  const openSession = async (req, res, user) =>
    res.cookie(SESSION_COOKIE, await store.createSession(user.id), cookieOptions(req, 30 * 24 * 60 * 60_000));

  // Connecte le joueur et renvoie l'adresse où le rediriger. Un joueur déjà connecté qui se connecte
  // avec un autre fournisseur lui lie ce fournisseur. Si un compte a déjà l'adresse non vérifiée
  // que donne le fournisseur, un code est d'abord envoyé à cette adresse.
  async function logIn(req, res, { provider, providerId, pseudo, email = null, emailVerified = false, retour }) {
    const name = cleanName(pseudo) || 'Joueur';
    const linkTo = (await currentUser(req))?.id;
    const user = await store.upsertUser({ provider, providerId, name, email, emailVerified, linkTo });
    if (!user.needsCode) {
      await openSession(req, res, user);
      return retour;
    }
    if (!mailer) return `/connexion?erreur=email&retour=${encodeURIComponent(retour)}`;
    const { token, code } = await store.createLoginCode({ provider, providerId, name, email, retour });
    await mailer.send({ to: email, ...loginCodeEmail(code) });
    res.cookie(CODE_COOKIE, token, cookieOptions(req, LOGIN_CODE_LIFETIME_MS));
    return '/code-connexion';
  }

  async function requireUser(req, res, next) {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Connectez-vous pour retrouver vos grilles.' });
    req.user = user;
    next();
  }

  router.get('/auth/dev', async (req, res, next) => {
    if (!providers.includes('dev')) return next();
    // `verifiee=0` simule un fournisseur qui n'a pas vérifié l'adresse.
    const pseudo = cleanName(req.query.nom) || 'Testeur';
    const email = isEmail(req.query.email) ? req.query.email : null;
    const retour = await returnPath(req.query.retour);
    res.redirect(await logIn(req, res, { provider: 'dev', providerId: pseudo, pseudo, email, emailVerified: Boolean(email) && req.query.verifiee !== '0', retour }));
  });

  router.get('/auth/:provider', async (req, res, next) => {
    const providerId = req.params.provider;
    if (!providers.includes(providerId) || providerId === 'dev') return next();
    let config;
    try {
      config = await configuration(providerId);
    } catch (err) {
      console.error(`${PROVIDERS[providerId].label} injoignable :`, String(err.message).replaceAll(/[\r\n]/g, ' '));
      return res.redirect(`/connexion?erreur=1&retour=${encodeURIComponent(await returnPath(req.query.retour))}`);
    }
    const state = oidc.randomState();
    const verifier = oidc.randomPKCECodeVerifier();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl(req, providerId),
      scope: PROVIDERS[providerId].scopes,
      state,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    const pending = { provider: providerId, state, verifier, retour: await returnPath(req.query.retour), pseudo: cleanName(req.query.pseudo) };
    res.cookie(OAUTH_COOKIE, Buffer.from(JSON.stringify(pending)).toString('base64url'), cookieOptions(req, OAUTH_MAX_AGE_MS, '/auth'));
    res.redirect(url.toString());
  });

  router.get('/auth/:provider/callback', async (req, res, next) => {
    const providerId = req.params.provider;
    if (!providers.includes(providerId) || providerId === 'dev') return next();
    let pending = null;
    try {
      pending = JSON.parse(Buffer.from(parseCookies(req.headers.cookie)[OAUTH_COOKIE] ?? '', 'base64url').toString());
    } catch {
      // cookie absent ou illisible : traité comme une tentative invalide
    }
    res.clearCookie(OAUTH_COOKIE, { path: '/auth' });
    const retour = await returnPath(pending?.retour);
    const failed = () => res.redirect(`/connexion?erreur=1&retour=${encodeURIComponent(retour)}`);
    if (pending?.provider !== providerId || typeof req.query.state !== 'string' || req.query.state !== pending.state || typeof pending.verifier !== 'string') {
      return failed();
    }
    try {
      const provider = PROVIDERS[providerId];
      const config = await configuration(providerId);
      // Adresse de rappel reconstruite avec l'adresse publique (le site est derrière un proxy HTTPS).
      const currentUrl = new URL(callbackUrl(req, providerId));
      currentUrl.search = new URL(req.originalUrl, 'http://localhost').search;
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, { pkceCodeVerifier: pending.verifier, expectedState: pending.state });
      const profile = await provider.profile(tokens, fetchImpl);
      if (!profile.id) throw new Error('Identifiant manquant');
      const email = isEmail(profile.email) ? profile.email : null;
      res.redirect(
        await logIn(req, res, {
          provider: providerId,
          providerId: profile.id,
          pseudo: cleanName(profile.pseudo) || cleanName(pending.pseudo),
          email,
          emailVerified: Boolean(email) && profile.emailVerified,
          retour,
        }),
      );
    } catch (err) {
      // Message nettoyé : il peut contenir une réponse du fournisseur.
      console.error(`Connexion ${PROVIDERS[providerId].label} impossible :`, String(err.message).replaceAll(/[\r\n]/g, ' '));
      failed();
    }
  });

  // Code reçu par email pour terminer une connexion (voir logIn).
  router.get('/api/connexion/code', async (req, res) => {
    const pending = await store.getLoginCode(parseCookies(req.headers.cookie)[CODE_COOKIE]);
    res.set('cache-control', 'no-store');
    if (!pending) return res.status(404).json({ error: 'Aucune connexion en attente : reconnectez-vous.' });
    res.json({ email: maskEmail(pending.email) });
  });

  router.post('/api/connexion/code', async (req, res) => {
    const result = await store.checkLoginCode(parseCookies(req.headers.cookie)[CODE_COOKIE], req.body?.code);
    if (result.error === 'invalid') return res.status(400).json({ error: 'Ce code est incorrect.' });
    if (result.error) {
      res.clearCookie(CODE_COOKIE, { path: '/' });
      return res.status(410).json({ error: 'Ce code a expiré ou a été mal saisi trop de fois. Reconnectez-vous pour en recevoir un nouveau.' });
    }
    const { provider, providerId, name, email, retour } = result.pending;
    // Le code prouve que le joueur reçoit les emails de cette adresse : elle est vérifiée.
    const user = await store.upsertUser({ provider, providerId, name, email, emailVerified: true });
    await openSession(req, res, user);
    res.clearCookie(CODE_COOKIE, { path: '/' });
    res.json({ retour: await returnPath(retour) });
  });

  // Lien de vérification de l'adresse du compte.
  router.post('/api/compte/verification', requireUser, async (req, res) => {
    if (!mailer) return res.status(503).json({ error: 'L’envoi d’emails n’est pas disponible pour le moment.' });
    const created = await store.createVerification(req.user.id);
    if (!created) return res.status(400).json({ error: 'Votre adresse est déjà vérifiée.' });
    if (created.tooSoon) return res.status(429).json({ error: 'Un email vient d’être envoyé : patientez une minute avant d’en demander un autre.' });
    try {
      await mailer.send({ to: created.email, ...verificationEmail(baseUrl(req), created.token) });
    } catch (err) {
      console.error('Envoi de l’email de vérification impossible :', String(err.message).replaceAll(/[\r\n]/g, ' '));
      return res.status(502).json({ error: 'L’email n’a pas pu être envoyé, réessayez plus tard.' });
    }
    res.json({ ok: true });
  });

  router.get('/verifier-email', async (req, res) => {
    const ok = await store.verifyEmail(req.query.jeton);
    res.redirect(`/mon-espace?verification=${ok ? 'ok' : 'echec'}`);
  });

  router.post('/auth/deconnexion', async (req, res) => {
    await store.deleteSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/api/compte', async (req, res) => {
    const user = await currentUser(req);
    res.set('cache-control', 'no-store');
    res.json({
      user: user && {
        name: user.name,
        provider: user.provider,
        providers: user.providers,
        email: user.email,
        emailVerified: user.emailVerified,
        emailConsent: user.emailConsent,
        ...(user.reviewGrids && { reviewGrids: true }),
        // Seulement pour un administrateur (rien n'est indiqué aux autres comptes).
        ...(user.role && { admin: true }),
        ...(user.role === 'superadmin' && { superadmin: true }),
      },
      providers: providers.map((id) => ({ id, label: PROVIDERS[id]?.label ?? 'Compte de test' })),
      emailVerification: Boolean(mailer),
    });
  });

  // Modification du pseudo et de l'accord pour recevoir les résultats. L'adresse email, elle,
  // vient du fournisseur de connexion et ne se modifie pas.
  router.patch('/api/compte', requireUser, async (req, res) => {
    const { name, emailConsent = false } = req.body ?? {};
    const pseudo = cleanName(name);
    if (!pseudo) return res.status(400).json({ error: 'Choisissez un pseudo.' });
    if (emailConsent === true && !req.user.emailVerified) {
      return res.status(400).json({ error: 'Vérifiez d’abord votre adresse email pour recevoir les résultats.' });
    }
    await store.updateUser(req.user.id, { name: pseudo, emailConsent: emailConsent === true });
    res.json({ ok: true });
  });

  router.delete('/api/compte', requireUser, async (req, res) => {
    await store.deleteUser(req.user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/api/compte/grilles', requireUser, async (req, res) => {
    res.set('cache-control', 'no-store');
    res.json(await store.listUserGrids(req.user.id));
  });

  router.post('/api/compte/grilles', requireUser, async (req, res) => {
    const { gridId, token } = req.body ?? {};
    if (!(await store.claimGrid(req.user.id, gridId, token))) {
      return res.status(404).json({ error: 'Cette grille est introuvable, expirée ou déjà liée à un autre compte.' });
    }
    res.json({ ok: true });
  });

  router.delete('/api/compte/grilles/:id', requireUser, async (req, res) => {
    await store.forgetUserGrid(req.user.id, req.params.id);
    res.status(204).end();
  });

  // Le joueur a relu les grilles reprises avec son compte : l'avertissement n'est plus affiché.
  router.delete('/api/compte/grilles-a-verifier', requireUser, async (req, res) => {
    await store.dismissGridsReview(req.user.id);
    res.status(204).end();
  });

  return { router, providers, currentUser };
}
