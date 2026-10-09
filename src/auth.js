// Connexion avec un compte Google, Microsoft, GitHub ou Discord (OAuth 2.0, bibliothèque Arctic).
// Chaque fournisseur n'est proposé que si ses identifiants sont définis dans l'environnement :
// sans aucun, le site fonctionne comme avant, sans compte.
import express from 'express';
import { Google, MicrosoftEntraId, GitHub, Discord, generateState, generateCodeVerifier, decodeIdToken } from 'arctic';

const SESSION_COOKIE = 'coloto_session';
const OAUTH_COOKIE = 'coloto_oauth';
const OAUTH_MAX_AGE_MS = 10 * 60_000;
const NAME_MAX_LENGTH = 40;

async function getJson(fetchImpl, url, accessToken) {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, 'user-agent': 'Co-Loto', accept: 'application/json' } });
  if (!res.ok) throw new Error(`Profil indisponible (${res.status})`);
  return res.json();
}

// `pkce` : le fournisseur attend un code_verifier. `profile` ne garde que l'identifiant et le nom affiché.
export const PROVIDERS = {
  google: {
    label: 'Google',
    envPrefix: 'GOOGLE',
    pkce: true,
    scopes: ['openid', 'profile'],
    client: (id, secret, callback) => new Google(id, secret, callback),
    profile: async (tokens) => {
      const claims = decodeIdToken(tokens.idToken());
      return { id: claims.sub, name: claims.given_name ?? claims.name };
    },
  },
  microsoft: {
    label: 'Microsoft',
    envPrefix: 'MICROSOFT',
    pkce: true,
    scopes: ['openid', 'profile'],
    client: (id, secret, callback, env) => new MicrosoftEntraId(env.MICROSOFT_TENANT || 'common', id, secret, callback),
    profile: async (tokens) => {
      const claims = decodeIdToken(tokens.idToken());
      return { id: claims.sub, name: claims.name };
    },
  },
  github: {
    label: 'GitHub',
    envPrefix: 'GITHUB',
    pkce: false,
    scopes: [],
    client: (id, secret, callback) => new GitHub(id, secret, callback),
    profile: async (tokens, fetchImpl) => {
      const user = await getJson(fetchImpl, 'https://api.github.com/user', tokens.accessToken());
      return { id: String(user.id), name: user.name || user.login };
    },
  },
  discord: {
    label: 'Discord',
    envPrefix: 'DISCORD',
    pkce: true,
    scopes: ['identify'],
    client: (id, secret, callback) => new Discord(id, secret, callback),
    profile: async (tokens, fetchImpl) => {
      const user = await getJson(fetchImpl, 'https://discord.com/api/users/@me', tokens.accessToken());
      return { id: String(user.id), name: user.global_name || user.username };
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

function cleanName(name) {
  const text = String(name ?? '').replaceAll(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return text || 'Joueur';
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

  function oauthClient(req, providerId) {
    const provider = PROVIDERS[providerId];
    const callback = `${baseUrl(req)}/auth/${providerId}/callback`;
    return provider.client(env[`${provider.envPrefix}_CLIENT_ID`], env[`${provider.envPrefix}_CLIENT_SECRET`], callback, env);
  }

  function currentUser(req) {
    return store.getSessionUser(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  }

  function logIn(req, res, { provider, providerId, name }) {
    const user = store.upsertUser({ provider, providerId, name: cleanName(name) });
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
    logIn(req, res, { provider: 'dev', providerId: cleanName(req.query.nom ?? 'Testeur'), name: req.query.nom ?? 'Testeur' });
    res.redirect(returnPath(req.query.retour));
  });

  router.get('/auth/:provider', (req, res, next) => {
    const providerId = req.params.provider;
    if (!providers.includes(providerId) || providerId === 'dev') return next();
    const { pkce, scopes } = PROVIDERS[providerId];
    const state = generateState();
    const verifier = pkce ? generateCodeVerifier() : null;
    const client = oauthClient(req, providerId);
    const url = pkce ? client.createAuthorizationURL(state, verifier, scopes) : client.createAuthorizationURL(state, scopes);
    const pending = { provider: providerId, state, verifier, retour: returnPath(req.query.retour) };
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
    if (pending?.provider !== providerId || typeof req.query.state !== 'string' || req.query.state !== pending.state || typeof req.query.code !== 'string') {
      return failed();
    }
    try {
      const provider = PROVIDERS[providerId];
      const client = oauthClient(req, providerId);
      const tokens = provider.pkce
        ? await client.validateAuthorizationCode(req.query.code, pending.verifier)
        : await client.validateAuthorizationCode(req.query.code);
      const profile = await provider.profile(tokens, fetchImpl);
      if (!profile.id) throw new Error('Identifiant manquant');
      logIn(req, res, { provider: providerId, providerId: profile.id, name: profile.name });
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
      user: user && { name: user.name, provider: user.provider },
      providers: providers.map((id) => ({ id, label: PROVIDERS[id]?.label ?? 'Compte de test' })),
    });
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
