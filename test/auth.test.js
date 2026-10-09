import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { openStore, GRID_LIFETIME_MS } from '../src/store.js';
import { enabledProviders, parseCookies, cleanName, isEmail } from '../src/auth.js';

test('comptes, sessions et grilles rattachées dans le stockage', async () => {
  const store = await openStore();
  const now = Date.UTC(2026, 9, 9);
  await store.saveGrid({ id: 'g1', numbers: [1, 2, 3, 4, 5], bonus: [6], players: ['Alice', 'Bob'], rounds: 6, participants: [{ token: 'ta', name: 'Alice' }, { token: 'tb', name: 'Bob' }] }, now);

  const alice = await store.upsertUser({ provider: 'github', providerId: '42', name: 'Alice' }, now);
  assert.equal(alice.email, null);
  // Connexion suivante : même compte, le pseudo choisi est gardé, l'email du fournisseur complète le compte.
  const again = await store.upsertUser({ provider: 'github', providerId: '42', name: 'alice-gh', email: 'alice@example.com', emailVerified: true }, now);
  assert.equal(again.id, alice.id);
  assert.equal(again.name, 'Alice');
  assert.equal(again.email, 'alice@example.com');
  assert.equal(again.emailVerified, true);
  const bob = await store.upsertUser({ provider: 'google', providerId: '42', name: 'Bob' }, now);
  assert.notEqual(bob.id, alice.id);

  const session = await store.createSession(alice.id, now);
  assert.equal((await store.getSessionUser(session, now + 1000)).name, 'Alice');

  await store.updateUser(alice.id, { name: 'Ali', email: 'alice@example.com', emailConsent: true });
  assert.deepEqual(await store.getSessionUser(session, now), { id: alice.id, provider: 'github', name: 'Ali', email: 'alice@example.com', emailVerified: true, emailConsent: true });
  await store.updateUser(alice.id, { name: 'Ali', email: 'autre@example.com', emailConsent: true });
  assert.equal((await store.getSessionUser(session, now)).emailVerified, false); // adresse changée à la main
  await store.updateUser(alice.id, { name: 'Ali', email: null, emailConsent: true });
  assert.equal((await store.getSessionUser(session, now)).emailConsent, false); // pas d'envoi sans adresse
  assert.equal(await store.getSessionUser('inconnu', now), null);

  assert.equal(await store.claimGrid(alice.id, 'g1', 'mauvais', now), false);
  assert.equal(await store.claimGrid(alice.id, 'autre', 'ta', now), false);
  assert.equal(await store.claimGrid(alice.id, 'g1', 'ta', now), true);
  assert.equal(await store.claimGrid(alice.id, 'g1', 'ta', now), true); // sans effet, déjà à elle
  assert.equal(await store.claimGrid(bob.id, 'g1', 'ta', now), false); // déjà liée à un autre compte
  const [grid] = await store.listUserGrids(alice.id, now);
  assert.equal(grid.id, 'g1');
  assert.equal(grid.playerName, 'Alice');
  assert.deepEqual(await store.listUserGrids(bob.id, now), []);

  assert.equal(await store.forgetUserGrid(alice.id, 'g1'), true);
  assert.deepEqual(await store.listUserGrids(alice.id, now), []);
  assert.equal(await store.claimGrid(bob.id, 'g1', 'tb', now), true);

  // Au bout de 30 jours, la grille et ses liens disparaissent, et ne peuvent plus être rattachés.
  assert.deepEqual(await store.listUserGrids(bob.id, now + GRID_LIFETIME_MS), []);
  assert.equal(await store.claimGrid(alice.id, 'g1', 'ta', now + GRID_LIFETIME_MS), false);
  await store.purgeExpired(now + GRID_LIFETIME_MS);

  await store.deleteUser(alice.id);
  assert.equal(await store.getSessionUser(session, now), null);
  store.close();
});

test('fournisseurs activés selon les variables d’environnement', () => {
  assert.deepEqual(enabledProviders({}), []);
  assert.deepEqual(enabledProviders({ GITHUB_CLIENT_ID: 'a' }), []);
  assert.deepEqual(
    enabledProviders({ FACEBOOK_CLIENT_ID: 'e', FACEBOOK_CLIENT_SECRET: 'f', DISCORD_CLIENT_ID: 'a', DISCORD_CLIENT_SECRET: 'b', GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 'd' }),
    ['google', 'discord', 'facebook'],
  );
  assert.deepEqual(enabledProviders({ AUTH_DEV_LOGIN: '1' }), ['dev']);
  assert.deepEqual(enabledProviders({ AUTH_DEV_LOGIN: '1', RENDER: 'true' }), []);
});

test('pseudo et adresse email', () => {
  assert.equal(cleanName('  Jean   Michel \n '), 'Jean Michel');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  assert.equal(cleanName(undefined), '');
  for (const ok of ['a@b.fr', 'prenom.nom+loto@exemple.co.uk']) assert.equal(isEmail(ok), true, ok);
  for (const bad of ['', 'a', 'a@b', '@b.fr', 'a@.fr', 'a@b.', 'a b@c.fr', 'a@b@c.fr', 42, `${'a'.repeat(250)}@b.fr`]) assert.equal(isEmail(bad), false, bad);
});

test('lecture des cookies', () => {
  assert.deepEqual(parseCookies('a=1; b=%C3%A9; c=%E0; bad'), { a: '1', b: 'é' });
});

let server;
let baseUrl;
const clients = [];
const env = {
  AUTH_DEV_LOGIN: '1',
  GITHUB_CLIENT_ID: 'id-github',
  GITHUB_CLIENT_SECRET: 'secret-github',
  FACEBOOK_CLIENT_ID: 'id-facebook',
  FACEBOOK_CLIENT_SECRET: 'secret-facebook',
  PUBLIC_URL: 'https://co-loto.example',
};

before(async () => {
  server = createApp({ store: await openStore(), env }).httpServer;
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  for (const c of clients) c.close();
  server.close();
});

const request = (path, { cookie, ...options } = {}) =>
  fetch(baseUrl + path, { redirect: 'manual', ...options, headers: { ...options.headers, ...(cookie && { cookie }) } });
const sessionCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith('coloto_session='))?.split(';')[0];
const emit = (socket, event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve));

function client() {
  const socket = connect(baseUrl, { transports: ['websocket'], forceNew: true });
  socket.states = [];
  socket.on('room:state', (state) => socket.states.push(state));
  clients.push(socket);
  return socket;
}

async function playGame() {
  const created = await (await request('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice', maxPlayers: 2 }) })).json();
  const alice = client();
  await emit(alice, 'room:join', { roomId: created.roomId, token: created.token });
  const bob = client();
  const bobJoin = await emit(bob, 'room:join', { roomId: created.roomId, name: 'Bob' });
  await emit(alice, 'game:start');
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await emit(alice, 'game:pick', { number: n });
    await emit(bob, 'game:pick', { number: n });
  }
  const start = Date.now();
  while (alice.states.at(-1)?.status !== 'finished') {
    if (Date.now() - start > 2000) throw new Error('Partie non terminée');
    await new Promise((r) => setTimeout(r, 10));
  }
  return { roomId: created.roomId, aliceToken: created.token, bobToken: bobJoin.token };
}

test('un joueur anonyme se connecte après la partie et retrouve la grille dans « Mes grilles »', async () => {
  const { roomId, aliceToken, bobToken } = await playGame();

  const anonymous = await (await request('/api/compte')).json();
  assert.equal(anonymous.user, null);
  assert.deepEqual(anonymous.providers.map((p) => p.id), ['github', 'facebook', 'dev']);
  assert.equal((await request('/api/compte/grilles')).status, 401);

  const login = await request(`/auth/dev?nom=Alice&retour=${encodeURIComponent(`/grille/${roomId}`)}`);
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), `/grille/${roomId}`);
  const cookie = sessionCookie(login);
  assert.match(login.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/);
  assert.equal((await (await request('/api/compte', { cookie })).json()).user.name, 'Alice');

  const claim = (body) => request('/api/compte/grilles', { method: 'POST', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await claim({ gridId: roomId, token: 'faux' })).status, 404);
  assert.equal((await claim({ gridId: roomId, token: aliceToken })).status, 200);

  const grids = await (await request('/api/compte/grilles', { cookie })).json();
  assert.equal(grids.length, 1);
  assert.equal(grids[0].id, roomId);
  assert.equal(grids[0].playerName, 'Alice');
  assert.deepEqual(grids[0].players, ['Alice', 'Bob']);

  // Le jeton de Bob ne peut pas être revendiqué par un autre compte une fois rattaché.
  const bobCookie = sessionCookie(await request('/auth/dev?nom=Bob'));
  assert.equal((await request('/api/compte/grilles', { method: 'POST', cookie: bobCookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gridId: roomId, token: bobToken }) })).status, 200);
  assert.equal((await claim({ gridId: roomId, token: bobToken })).status, 404);

  assert.equal((await request(`/api/compte/grilles/${roomId}`, { method: 'DELETE', cookie })).status, 204);
  assert.deepEqual(await (await request('/api/compte/grilles', { cookie })).json(), []);

  // Pseudo, email et accord d'envoi modifiables depuis l'espace du joueur.
  const patch = (body) => request('/api/compte', { method: 'PATCH', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await patch({ name: '  ' })).status, 400);
  assert.equal((await patch({ name: 'Alice', email: 'pas-un-email' })).status, 400);
  assert.equal((await patch({ name: 'Alice', emailConsent: true })).status, 400);
  assert.equal((await patch({ name: 'Alice la chanceuse', email: 'alice@example.com', emailConsent: true })).status, 200);
  const updated = (await (await request('/api/compte', { cookie })).json()).user;
  assert.deepEqual(updated, { name: 'Alice la chanceuse', provider: 'dev', email: 'alice@example.com', emailVerified: false, emailConsent: true });

  assert.equal((await request('/auth/deconnexion', { method: 'POST', cookie })).status, 204);
  assert.equal((await (await request('/api/compte', { cookie })).json()).user, null);

  assert.equal((await request('/api/compte', { method: 'DELETE', cookie: bobCookie })).status, 204);
  assert.equal((await request('/api/compte/grilles', { cookie: bobCookie })).status, 401);
});

test('connexion GitHub : redirection, contrôle de l’état et création du compte', async (t) => {
  const start = await request('/auth/github?retour=/mes-grilles');
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get('location'));
  assert.equal(location.origin + location.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(location.searchParams.get('client_id'), 'id-github');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://co-loto.example/auth/github/callback');
  assert.equal(location.searchParams.get('scope'), 'user:email');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const challenge = location.searchParams.get('code_challenge');
  const state = location.searchParams.get('state');
  const oauthCookie = start.headers.getSetCookie()[0].split(';')[0];

  // État absent ou différent : la connexion est refusée.
  const forged = await request('/auth/github/callback?code=abc&state=autre', { cookie: oauthCookie });
  assert.equal(forged.headers.get('location'), '/connexion?erreur=1&retour=%2Fmes-grilles');
  assert.equal(sessionCookie(forged), undefined);

  let tokenRequest;
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://github.com/login/oauth/access_token') {
      tokenRequest = new URLSearchParams(String(init.body));
      return Response.json({ access_token: 'jeton', token_type: 'bearer' });
    }
    if (url === 'https://api.github.com/user') return Response.json({ id: 1234, login: 'octocat', name: 'Vrai Nom' });
    if (url === 'https://api.github.com/user/emails') {
      return Response.json([{ email: 'secondaire@example.com', primary: false, verified: true }, { email: 'octo@example.com', primary: true, verified: true }]);
    }
    return realFetch(input, init);
  };
  const callback = await request(`/auth/github/callback?code=abc&state=${state}`, { cookie: oauthCookie });
  assert.equal(callback.headers.get('location'), '/mes-grilles');
  // Le code est échangé avec le vérificateur PKCE correspondant et la même adresse de rappel.
  assert.equal(tokenRequest.get('code'), 'abc');
  assert.equal(tokenRequest.get('redirect_uri'), 'https://co-loto.example/auth/github/callback');
  assert.equal(createHash('sha256').update(tokenRequest.get('code_verifier')).digest('base64url'), challenge);
  const cookie = sessionCookie(callback);
  const account = await (await request('/api/compte', { cookie })).json();
  // Le pseudo GitHub est repris, jamais le vrai nom ; l'email principal vérifié est gardé.
  assert.deepEqual(account.user, { name: 'octocat', provider: 'github', email: 'octo@example.com', emailVerified: true, emailConsent: false });

  assert.equal((await request('/auth/google')).status, 404); // fournisseur non configuré
});

test('après connexion, retour uniquement vers une page connue du site', async () => {
  const { roomId } = await (await request('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }) })).json();
  const cases = {
    '/': '/',
    [`/salon/${roomId}`]: `/salon/${roomId}`,
    '/salon/inconnu': '/mes-grilles',
    '/grille/inconnue': '/mes-grilles',
    '//evil.example': '/mes-grilles',
    '/\\evil.example': '/mes-grilles',
    'https://evil.example': '/mes-grilles',
  };
  for (const [retour, expected] of Object.entries(cases)) {
    const res = await request(`/auth/dev?retour=${encodeURIComponent(retour)}`);
    assert.equal(res.headers.get('location'), expected, retour);
  }
});

test('connexion Facebook : seul l’email est demandé, le pseudo vient des parties', async (t) => {
  const start = await request('/auth/facebook?retour=/mes-grilles&pseudo=Lulu');
  const location = new URL(start.headers.get('location'));
  assert.equal(location.origin + location.pathname, 'https://www.facebook.com/v23.0/dialog/oauth');
  assert.equal(location.searchParams.get('scope'), 'email');
  const oauthCookie = start.headers.getSetCookie()[0].split(';')[0];

  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let profileUrl;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://graph.facebook.com/v23.0/oauth/access_token') return Response.json({ access_token: 'jeton', token_type: 'bearer', expires_in: 3600 });
    if (url.startsWith('https://graph.facebook.com/v23.0/me')) {
      profileUrl = url;
      return Response.json({ id: '987', email: 'lulu@example.com' });
    }
    return realFetch(input, init);
  };
  const callback = await request(`/auth/facebook/callback?code=abc&state=${location.searchParams.get('state')}`, { cookie: oauthCookie });
  assert.equal(callback.headers.get('location'), '/mes-grilles');
  assert.equal(new URL(profileUrl).searchParams.get('fields'), 'id,email');
  const account = await (await request('/api/compte', { cookie: sessionCookie(callback) })).json();
  assert.deepEqual(account.user, { name: 'Lulu', provider: 'facebook', email: 'lulu@example.com', emailVerified: true, emailConsent: false });
});
