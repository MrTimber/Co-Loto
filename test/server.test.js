import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { openStore } from '../src/store.js';

let server;
let baseUrl;
let rooms;
const clients = [];

before(async () => {
  const created = createApp({ store: openStore(), offlineGraceMs: 200 });
  server = created.httpServer;
  rooms = created.rooms;
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  for (const c of clients) c.close();
  server.close();
});

async function api(path, body) {
  const res = await fetch(baseUrl + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  return { status: res.status, body: await res.json() };
}

function client() {
  const socket = connect(baseUrl, { transports: ['websocket'], forceNew: true });
  socket.states = [];
  socket.on('room:state', (state) => socket.states.push(state));
  clients.push(socket);
  return socket;
}

const emit = (socket, event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve));
const lastState = (socket) => socket.states.at(-1);
const waitFor = async (check, timeout = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('Délai dépassé');
    await new Promise((r) => setTimeout(r, 10));
  }
};

test('création de salon : validation des paramètres', async () => {
  assert.equal((await api('/api/rooms', { name: 'Alice', maxPlayers: 13 })).status, 400);
  assert.equal((await api('/api/rooms', { name: '' })).status, 400);
  assert.equal((await api('/api/rooms', { name: 'Alice', drawDate: '2020-01-01' })).status, 400);
  assert.equal((await api('/api/rooms', { name: 'Alice', gameType: 'keno' })).status, 400);
});

test('une partie complète, du salon à la grille consultable', async () => {
  const created = await api('/api/rooms', { name: 'Alice', maxPlayers: 2, visibility: 'public' });
  assert.equal(created.status, 201);
  const { roomId, token } = created.body;

  const lobbies = await api('/api/lobbies');
  assert.ok(lobbies.body.some((l) => l.id === roomId && l.host === 'Alice'));

  const alice = client();
  assert.equal((await emit(alice, 'room:join', { roomId, token })).ok, true);
  assert.equal((await emit(alice, 'game:start')).ok, false); // seule

  const bob = client();
  const intruder = client();
  assert.equal((await emit(bob, 'room:join', { roomId })).code, 'name_required');
  assert.equal((await emit(bob, 'room:join', { roomId, name: 'Bob' })).ok, true);
  assert.equal((await emit(intruder, 'room:join', { roomId, name: 'Chloé' })).code, 'room_full');
  assert.equal((await api('/api/lobbies')).body.some((l) => l.id === roomId), false);

  assert.equal((await emit(bob, 'game:start')).code, 'not_host');
  assert.equal((await emit(alice, 'game:start')).ok, true);
  await waitFor(() => lastState(bob)?.status === 'playing');

  for (const n of [3, 14, 15, 26, 49]) {
    assert.equal((await emit(alice, 'game:pick', { number: n })).ok, true);
    assert.equal((await emit(bob, 'game:pick', { number: n })).ok, true);
  }
  await waitFor(() => lastState(alice)?.phase === 'chance');
  assert.deepEqual(lastState(alice).validated.numbers, [3, 14, 15, 26, 49]);

  await emit(alice, 'game:pick', { number: 8 });
  await waitFor(() => lastState(bob)?.players.find((p) => p.name === 'Alice').hasPicked);
  await emit(bob, 'game:pick', { number: 8 });
  await waitFor(() => lastState(alice)?.status === 'finished');

  const grid = await api(`/api/grilles/${roomId}`);
  assert.equal(grid.status, 200);
  assert.deepEqual(grid.body.numbers, [3, 14, 15, 26, 49]);
  assert.equal(grid.body.gameType, 'loto');
  assert.deepEqual(grid.body.bonus, [8]);
  assert.deepEqual(grid.body.players, ['Alice', 'Bob']);
  assert.equal(grid.body.rounds, 6);

  const page = await fetch(`${baseUrl}/grille/${roomId}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Co-Loto/);
});

test('un joueur qui se reconnecte avec son jeton retrouve sa place', async () => {
  const { roomId, token } = (await api('/api/rooms', { name: 'Alice' })).body;
  const first = client();
  await emit(first, 'room:join', { roomId, token });
  first.close();
  const second = client();
  const res = await emit(second, 'room:join', { roomId, token });
  assert.equal(res.ok, true);
  await waitFor(() => lastState(second)?.me?.name === 'Alice');
  assert.equal(lastState(second).players.length, 1);
});

test('un joueur déconnecté trop longtemps est retiré, et un salon vide est fermé', async () => {
  const { roomId, token } = (await api('/api/rooms', { name: 'Alice' })).body;
  const alice = client();
  await emit(alice, 'room:join', { roomId, token });
  const bob = client();
  await emit(bob, 'room:join', { roomId, name: 'Bob' });
  alice.close();
  await waitFor(() => lastState(bob)?.players.length === 1);
  assert.equal(lastState(bob).hostId, lastState(bob).me.id);
  assert.equal((await emit(bob, 'room:leave')).ok, true);
  assert.equal(rooms.has(roomId), false);
});

test('une partie d’Euromillions enregistre ses 2 étoiles', async () => {
  const { roomId, token } = (await api('/api/rooms', { name: 'Alice', maxPlayers: 2, gameType: 'euromillions', visibility: 'public' })).body;
  assert.equal((await api('/api/lobbies')).body.find((l) => l.id === roomId).gameType, 'euromillions');
  const alice = client();
  await emit(alice, 'room:join', { roomId, token });
  const bob = client();
  await emit(bob, 'room:join', { roomId, name: 'Bob' });
  await emit(alice, 'game:start');
  for (const n of [5, 10, 20, 40, 50, 2, 11]) {
    await emit(alice, 'game:pick', { number: n });
    await emit(bob, 'game:pick', { number: n });
  }
  await waitFor(() => lastState(alice)?.status === 'finished');
  assert.equal(lastState(alice).gameType, 'euromillions');
  const grid = await api(`/api/grilles/${roomId}`);
  assert.deepEqual(grid.body.numbers, [5, 10, 20, 40, 50]);
  assert.deepEqual(grid.body.bonus, [2, 11]);
  assert.equal(grid.body.gameType, 'euromillions');
});

test('les règles des jeux sont servies au navigateur', async () => {
  const res = await fetch(`${baseUrl}/js/games.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(await res.text(), /eurodreams/);
});

test('une grille inconnue renvoie 404', async () => {
  assert.equal((await api('/api/grilles/inconnue')).status, 404);
});
