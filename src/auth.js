// Connexion avec un compte Google, Microsoft, GitHub ou Discord (OAuth 2.0 avec PKCE,
// bibliothèque openid-client).
// Chaque fournisseur n'est proposé que si ses identifiants sont définis dans l'environnement :
// sans aucun, le site fonctionne comme avant, sans compte.
import express from 'express';
import * as oidc from 'openid-client';

const SESSION_COOKIE = 'coloto_session';
const OAUTH_COOKIE = 'coloto_oauth';
const OAUTH_MAX_AGE_MS = 10 * 60_000;
const NAME_MAX_LENGTH = 24; // comme le pseudo des parties
const EMAIL_MAX_LENGTH = 254;

async function getJson(fetchImpl, url, accessToken) {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, 'user-agent': 'Co-Loto', accept: 'application/json' } });
  if (!res.ok) throw new Error(`Profil indisponible (${res.status})`);
  return res.json();
}

// Adresse email vérifiée renvoyée par le fournisseur, sinon null.
const verifiedEmail = (email, verified) => (verified && typeof email === 'string' ? email : null);

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
      return { id: claims.sub, email: verifiedEmail(claims.email, claims.email_verified) };
    },
  },
  microsoft: {
    label: 'Microsoft',
    envPrefix: 'MICROSOFT',
    server: { discovery: (env) => `https://login.microsoftonline.com/${env.MICROSOFT_TENANT || 'common'}/v2.0` },
    scopes: 'openid email',
    profile: async (tokens) => {
      // Microsoft ne garantit pas que l'adresse a été vérifiée : elle est gardée comme non vérifiée.
      const claims = tokens.claims();
      return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null, emailVerified: false };
    },
  },
  github: {
    label: 'GitHub',
    envPrefix: 'GITHUB',
    server: {
      issuer: 'https://github.com',
      authorization_endpoint: 'https://github.com/login/oauth/authorize',
      token_endpoint: 'https://github.com/login/oauth/access_token',
    },
    scopes: 'user:email',
    profile: async (tokens, fetchImpl) => {
      const user = await getJson(fetchImpl, 'https://api.github.com/user', tokens.access_token);
      const emails = await getJson(fetchImpl, 'https://api.github.com/user/emails', tokens.access_token);
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : null;
      return { id: String(user.id), pseudo: user.login, email: verifiedEmail(primary?.email, primary?.verified) };
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
      return { id: String(user.id), pseudo: user.username, email: verifiedEmail(user.email, user.verified) };
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

const DEFAULT_RETURN = '/mes-grilles';
const STATIC_RETURNS = new Map(['/', '/mes-grilles', '/confidentialite'].map((path) => [path, path]));

// `findRoomId` : identifiant d'un salon ouvert, ou undefined.
export function createAuth({ store, env = process.env, findRoomId = () => undefined, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const providers = enabledProviders(env);

  // Adresse de retour après connexion : une page connue de ce site, reconstruite à partir
  // de nos propres données (jamais l'adresse reçue telle quelle).
  function returnPath(value) {
    if (typeof value !== 'string') return DEFAULT_RETURN;
    const known = STATIC_RETURNS.get(value);
    if (known) return known;
    const grid = /^\/grille\/([\w-]{1,40})$/.exec(value);
    const gridId = grid && store.getGrid(grid[1])?.id;
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
  function logIn(req, res, { provider, providerId, pseudo, email = null, emailVerified = Boolean(email) }) {
    const user = store.upsertUser({ provider, providerId, name: cleanName(pseudo) || 'Joueur', email, emailVerified });
    res.cookie(SESSION_COOKIE, store.createSession(user.id), cookieOptions(req, 30 * 24 * 60 * 60_000));
  }

  function requireUser(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Connectez-vous pour retrouver vos grilles.' });
    req.user = user;
    next();
  }

  router.get('/auth/dev', (req, res, next) => {
    if (!providers.includes('dev')) return next();
    const pseudo = cleanName(req.query.nom) || 'Testeur';
    logIn(req, res, { provider: 'dev', providerId: pseudo, pseudo, email: isEmail(req.query.email) ? req.query.email : null });
    res.redirect(returnPath(req.query.retour));
  });

  router.get('/auth/:provider', async (req, res, next) => {
    const providerId = req.params.provider;
    if (!providers.includes(providerId) || providerId === 'dev') return next();
    let config;
    try {
      config = await configuration(providerId);
    } catch (err) {
      console.error(`${PROVIDERS[providerId].label} injoignable :`, String(err.message).replaceAll(/[\r\n]/g, ' '));
      return res.redirect(`/connexion?erreur=1&retour=${encodeURIComponent(returnPath(req.query.retour))}`);
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
    const pending = { provider: providerId, state, verifier, retour: returnPath(req.query.retour), pseudo: cleanName(req.query.pseudo) };
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
    const retour = returnPath(pending?.retour);
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
      logIn(req, res, {
        provider: providerId,
        providerId: profile.id,
        pseudo: cleanName(profile.pseudo) || cleanName(pending.pseudo),
        email: isEmail(profile.email) ? profile.email : null,
        emailVerified: profile.emailVerified,
      });
      res.redirect(retour);
    } catch (err) {
      // Message nettoyé : il peut contenir une réponse du fournisseur.
      console.error(`Connexion ${PROVIDERS[providerId].label} impossible :`, String(err.message).replaceAll(/[\r\n]/g, ' '));
      failed();
    }
  });

  router.post('/auth/deconnexion', (req, res) => {
    store.deleteSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/api/compte', (req, res) => {
    const user = currentUser(req);
    res.set('cache-control', 'no-store');
    res.json({
      user: user && {
        name: user.name,
        provider: user.provider,
        email: user.email,
        emailVerified: user.emailVerified,
        emailConsent: user.emailConsent,
      },
      providers: providers.map((id) => ({ id, label: PROVIDERS[id]?.label ?? 'Compte de test' })),
    });
  });

  // Modification du pseudo, de l'email et de l'accord pour recevoir les résultats.
  router.patch('/api/compte', requireUser, (req, res) => {
    const { name, email = '', emailConsent = false } = req.body ?? {};
    const pseudo = cleanName(name);
    if (!pseudo) return res.status(400).json({ error: 'Choisissez un pseudo.' });
    const address = typeof email === 'string' ? email.trim() : '';
    if (address && !isEmail(address)) return res.status(400).json({ error: 'Cette adresse email ne semble pas valide.' });
    if (emailConsent === true && !address) return res.status(400).json({ error: 'Indiquez une adresse email pour recevoir les résultats.' });
    store.updateUser(req.user.id, { name: pseudo, email: address || null, emailConsent: emailConsent === true });
    res.json({ ok: true });
  });

  router.delete('/api/compte', requireUser, (req, res) => {
    store.deleteUser(req.user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/api/compte/grilles', requireUser, (req, res) => {
    res.set('cache-control', 'no-store');
    res.json(store.listUserGrids(req.user.id));
  });

  router.post('/api/compte/grilles', requireUser, (req, res) => {
    const { gridId, token } = req.body ?? {};
    if (!store.claimGrid(req.user.id, gridId, token)) {
      return res.status(404).json({ error: 'Cette grille est introuvable, expirée ou déjà liée à un autre compte.' });
    }
    res.json({ ok: true });
  });

  router.delete('/api/compte/grilles/:id', requireUser, (req, res) => {
    store.forgetUserGrid(req.user.id, req.params.id);
    res.status(204).end();
  });

  return { router, providers };
}
