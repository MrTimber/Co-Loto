import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openStore } from '../src/store.js';
import { GAMES, minRanking } from '../src/games.js';

let server;
let baseUrl;
const sent = [];

before(async () => {
  const mailer = { send: async (message) => sent.push(message) };
  const created = createApp({ store: await openStore(), env: { AUTH_DEV_LOGIN: '1' }, mailer });
  server = created.httpServer;
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = { ...(body && { 'content-type': 'application/json' }), ...(cookie && { cookie }) };
  const res = await fetch(baseUrl + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

async function login(name, email) {
  const res = await fetch(`${baseUrl}/auth/dev?nom=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`, { redirect: 'manual' });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
// Classement « du plus petit au plus grand », décalé de `shift`, de la longueur minimale.
function ranking(gameType, players, shift = 0) {
  return Object.fromEntries(
    GAMES[gameType].phases.map((phase) => {
      const all = range(phase.min, phase.max);
      const s = shift % all.length;
      return [phase.key, [...all.slice(s), ...all.slice(0, s)].slice(0, minRanking(phase, players))];
    }),
  );
}

test('création d’une partie à distance : validation', async () => {
  assert.equal((await api('/api/parties', { method: 'POST', body: { players: 1 } })).status, 400);
  assert.equal((await api('/api/parties', { method: 'POST', body: { players: 13 } })).status, 400);
  assert.equal((await api('/api/parties', { method: 'POST', body: { gameType: 'keno' } })).status, 400);
  assert.equal((await api('/api/parties', { method: 'POST', body: { drawDate: '2020-01-01' } })).status, 400);
  assert.equal((await api('/api/parties', { method: 'POST', body: { variant: 'autre' } })).status, 400);
  const quick = await api('/api/parties', { method: 'POST', body: { variant: 'quick', gameType: 'eurodreams', players: 4 } });
  const view = (await api(`/api/parties/${quick.body.link}`)).body;
  assert.equal(view.variant, 'quick');
  assert.deepEqual(view.minimums, { numbers: 12, dream: 2 });
  assert.equal((await api('/api/parties/inconnu')).status, 404);
});

test('une partie à distance complète, des liens à la grille et à l’email', async () => {
  const alice = await login('Alice', 'alice@example.com');
  const created = await api('/api/parties', { method: 'POST', body: { gameType: 'euromillions', players: 3 }, cookie: alice });
  assert.equal(created.status, 201);
  const { gameId, link } = created.body;

  const host = await api(`/api/parties/${link}`, { cookie: alice });
  assert.equal(host.body.status, 'waiting');
  assert.equal(host.body.players, 3);
  assert.deepEqual(host.body.minimums, { numbers: 35, stars: 9 });
  assert.equal(host.body.me.isHost, true);
  const [, bobLink, chloeLink] = host.body.seats.map((s) => s.link);
  assert.ok(bobLink && chloeLink);

  // Un invité ne voit pas les liens des autres places.
  const bobView = await api(`/api/parties/${bobLink}`);
  assert.equal(bobView.body.me.isHost, false);
  assert.equal(bobView.body.seats[0].link, undefined);

  // Classement trop court, puis classement valable avec le pseudo du compte.
  const tooShort = await api(`/api/parties/${link}/classement`, { method: 'PUT', cookie: alice, body: { ranking: { numbers: [1, 2], stars: [1] } } });
  assert.equal(tooShort.body.code, 'ranking_too_short');
  let res = await api(`/api/parties/${link}/classement`, { method: 'PUT', cookie: alice, body: { name: 'ignoré', ranking: ranking('euromillions', 3), emailResult: true } });
  assert.equal(res.body.finished, false);

  // « Mes parties en cours » montre la partie et qui a répondu : au compte d'Alice, et à l'appareil de Bob.
  const mine = await api('/api/mes-parties', { method: 'POST', cookie: alice, body: {} });
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].kind, 'async');
  assert.equal(mine.body[0].gameType, 'euromillions');
  assert.deepEqual(mine.body[0].seats.map((s) => s.name), ['Alice', null, null]);
  assert.equal(mine.body[0].seats[1].link, undefined);
  const bobs = await api('/api/mes-parties', { method: 'POST', body: { parties: [{ id: gameId, token: bobLink }, { id: 'x', token: 'inconnu' }] } });
  assert.deepEqual(bobs.body.map((g) => g.url), [`/partie/${bobLink}`]);

  // Pseudo déjà pris ; puis Bob répond sans compte.
  assert.equal((await api(`/api/parties/${bobLink}/classement`, { method: 'PUT', body: { name: 'alice', ranking: ranking('euromillions', 3) } })).body.code, 'name_taken');
  res = await api(`/api/parties/${bobLink}/classement`, { method: 'PUT', body: { name: 'Bob', ranking: ranking('euromillions', 3, 3), emailResult: true } });
  assert.equal(res.body.finished, false);

  // Chloé ne répond pas : seul le créateur peut la retirer.
  assert.equal((await api(`/api/parties/${bobLink}/places/2`, { method: 'DELETE' })).status, 403);
  res = await api(`/api/parties/${link}/places/2`, { method: 'DELETE' });
  assert.equal(res.body.finished, true);
  assert.equal(res.body.gridId, gameId);

  const grid = await api(`/api/grilles/${gameId}`);
  assert.equal(grid.body.mode, 'async');
  assert.deepEqual(grid.body.players, ['Alice', 'Bob']);
  assert.ok(grid.body.numbers.length >= 5);
  assert.ok(grid.body.validatedRounds.length > 0);
  assert.equal((await api(`/api/parties/${link}`)).body.status, 'finished');
  assert.equal((await api(`/api/parties/${chloeLink}/classement`, { method: 'PUT', body: { name: 'Chloé', ranking: ranking('euromillions', 3) } })).status, 409);

  // La grille est dans l'espace d'Alice, et seule Alice (connectée, adresse vérifiée) reçoit l'email.
  assert.ok((await api('/api/compte/grilles', { cookie: alice })).body.some((g) => g.id === gameId));
  assert.deepEqual((await api('/api/mes-parties', { method: 'POST', cookie: alice, body: {} })).body, []);
  assert.deepEqual(sent.map((m) => m.to), ['alice@example.com']);
  assert.match(sent[0].text, new RegExp(`/grille/${gameId}`));
});

test('le classement peut être modifié et l’email refusé', async () => {
  const dan = await login('Dan', 'dan@example.com');
  const { link } = (await api('/api/parties', { method: 'POST', body: { players: 2 } })).body;
  const other = (await api(`/api/parties/${link}`)).body.seats[1].link;
  const before = sent.length;
  await api(`/api/parties/${link}/classement`, { method: 'PUT', body: { name: 'Eve', ranking: ranking('loto', 2) } });
  await api(`/api/parties/${link}/classement`, { method: 'PUT', body: { name: 'Eva', ranking: ranking('loto', 2, 1) } });
  assert.equal((await api(`/api/parties/${link}`)).body.me.name, 'Eva');
  const res = await api(`/api/parties/${other}/classement`, { method: 'PUT', cookie: dan, body: { ranking: ranking('loto', 2, 5), emailResult: false } });
  assert.equal(res.body.finished, true);
  assert.equal(sent.length, before);
});

test('« Mes parties en cours » liste aussi le salon en direct de l’appareil', async () => {
  const { roomId, token } = (await api('/api/rooms', { method: 'POST', body: { name: 'Gus' } })).body;
  const res = await api('/api/mes-parties', { method: 'POST', body: { parties: [{ id: roomId, token }, { id: roomId, token: 'faux' }] } });
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].kind, 'live');
  assert.equal(res.body[0].url, `/salon/${roomId}`);
  assert.equal(res.body[0].isHost, true);
});
