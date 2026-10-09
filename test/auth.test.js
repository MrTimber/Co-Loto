import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { openStore, GRID_LIFETIME_MS } from '../src/store.js';
import { enabledProviders, safeReturnPath, parseCookies } from '../src/auth.js';

test('comptes, sessions et grilles rattachées dans le stockage', () => {
  const store = openStore();
  const now = Date.UTC(2026, 9, 9);
  store.saveGrid({ id: 'g1', numbers: [1, 2, 3, 4, 5], bonus: [6], players: ['Alice', 'Bob'], rounds: 6, participants: [{ token: 'ta', name: 'Alice' }, { token: 'tb', name: 'Bob' }] }, now);

  const alice = store.upsertUser({ provider: 'github', providerId: '42', name: 'Alice' }, now);
  assert.equal(store.upsertUser({ provider: 'github', providerId: '42', name: 'Alice D.' }, now).id, alice.id);
  const bob = store.upsertUser({ provider: 'google', providerId: '42', name: 'Bob' }, now);
  assert.notEqual(bob.id, alice.id);

  const session = store.createSession(alice.id, now);
  assert.equal(store.getSessionUser(session, now + 1000).name, 'Alice D.');
  assert.equal(store.getSessionUser('inconnu', now), null);

  assert.equal(store.claimGrid(alice.id, 'g1', 'mauvais', now), false);
  assert.equal(store.claimGrid(alice.id, 'autre', 'ta', now), false);
  assert.equal(store.claimGrid(alice.id, 'g1', 'ta', now), true);
  assert.equal(store.claimGrid(alice.id, 'g1', 'ta', now), true); // sans effet, déjà à elle
  assert.equal(store.claimGrid(bob.id, 'g1', 'ta', now), false); // déjà liée à un autre compte
  const [grid] = store.listUserGrids(alice.id, now);
  assert.equal(grid.id, 'g1');
  assert.equal(grid.playerName, 'Alice');
  assert.deepEqual(store.listUserGrids(bob.id, now), []);

  assert.equal(store.forgetUserGrid(alice.id, 'g1'), true);
  assert.deepEqual(store.listUserGrids(alice.id, now), []);
  assert.equal(store.claimGrid(bob.id, 'g1', 'tb', now), true);

  // Au bout de 30 jours, la grille et ses liens disparaissent, et ne peuvent plus être rattachés.
  assert.deepEqual(store.listUserGrids(bob.id, now + GRID_LIFETIME_MS), []);
  assert.equal(store.claimGrid(alice.id, 'g1', 'ta', now + GRID_LIFETIME_MS), false);
  store.purgeExpired(now + GRID_LIFETIME_MS);

  store.deleteUser(alice.id);
  assert.equal(store.getSessionUser(session, now), null);
  store.close();
});

test('fournisseurs activés selon les variables d’environnement', () => {
  assert.deepEqual(enabledProviders({}), []);
  assert.deepEqual(enabledProviders({ GITHUB_CLIENT_ID: 'a' }), []);
  assert.deepEqual(
    enabledProviders({ DISCORD_CLIENT_ID: 'a', DISCORD_CLIENT_SECRET: 'b', GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 'd' }),
    ['google', 'discord'],
  );
  assert.deepEqual(enabledProviders({ AUTH_DEV_LOGIN: '1' }), ['dev']);
  assert.deepEqual(enabledProviders({ AUTH_DEV_LOGIN: '1', RENDER: 'true' }), []);
});

test('adresse de retour limitée au site, lecture des cookies', () => {
  assert.equal(safeReturnPath('/grille/abc?x=1'), '/grille/abc?x=1');
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'grille', undefined, `/${'a'.repeat(300)}`]) {
    assert.equal(safeReturnPath(bad), '/mes-grilles');
  }
  assert.deepEqual(parseCookies('a=1; b=%C3%A9; c=%E0; bad'), { a: '1', b: 'é' });
});

let server;
let baseUrl;
const clients = [];
const env = {
  AUTH_DEV_LOGIN: '1',
  GITHUB_CLIENT_ID: 'id-github',
  GITHUB_CLIENT_SECRET: 'secret-github',
  PUBLIC_URL: 'https://co-loto.example',
};

before(async () => {
  server = createApp({ store: openStore(), env }).httpServer;
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
  assert.deepEqual(anonymous.providers.map((p) => p.id), ['github', 'dev']);
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
  const state = location.searchParams.get('state');
  const oauthCookie = start.headers.getSetCookie()[0].split(';')[0];

  // État absent ou différent : la connexion est refusée.
  const forged = await request('/auth/github/callback?code=abc&state=autre', { cookie: oauthCookie });
  assert.equal(forged.headers.get('location'), '/connexion?erreur=1&retour=%2Fmes-grilles');
  assert.equal(sessionCookie(forged), undefined);

  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'jeton', token_type: 'bearer' });
    if (url === 'https://api.github.com/user') return Response.json({ id: 1234, login: 'octocat', name: null, email: 'ne-pas-garder@example.com' });
    return realFetch(input, init);
  };
  const callback = await request(`/auth/github/callback?code=abc&state=${state}`, { cookie: oauthCookie });
  assert.equal(callback.headers.get('location'), '/mes-grilles');
  const cookie = sessionCookie(callback);
  const account = await (await request('/api/compte', { cookie })).json();
  assert.deepEqual(account.user, { name: 'octocat', provider: 'github' });

  assert.equal((await request('/auth/google')).status, 404); // fournisseur non configuré
});
