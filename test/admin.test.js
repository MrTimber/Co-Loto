import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openStore, GRID_LIFETIME_MS, STATS_LIFETIME_MS, dayOf } from '../src/store.js';
import { pagePath, deviceOf, referrerHost, isBot } from '../src/stats.js';

const grid = (id, numbers, bonus, extra = {}) => ({ id, numbers, bonus, players: ['Alice', 'Bob'], rounds: 7, participants: [{ token: `t-${id}`, name: 'Alice' }], ...extra });

test('le superadmin est le plus ancien compte qui a son adresse, vérifiée', async () => {
  const store = await openStore({ superadminEmail: 'Boss@Example.com' });
  const now = Date.UTC(2026, 9, 9);
  // Adresse non vérifiée (Microsoft, ou modifiée à la main) : jamais superadmin.
  const fake = await store.upsertUser({ provider: 'microsoft', providerId: 'm', name: 'Faux', email: 'boss@example.com', emailVerified: false }, now);
  assert.equal(fake.role, undefined);
  const boss = await store.upsertUser({ provider: 'google', providerId: 'g', name: 'Boss', email: 'boss@example.com', emailVerified: true }, now + 1);
  assert.equal(boss.role, 'superadmin');
  assert.equal(boss.created, true);
  const second = await store.upsertUser({ provider: 'github', providerId: 'h', name: 'Boss bis', email: 'BOSS@example.com', emailVerified: true }, now + 2);
  assert.equal(second.role, undefined); // un seul superadmin
  assert.equal((await store.upsertUser({ provider: 'google', providerId: 'g', name: 'Boss' }, now + 3)).created, false);

  assert.equal(await store.setAdmin(second.id, true), true);
  assert.equal((await store.getUser(second.id)).role, 'admin');
  const users = await store.listUsers(now);
  assert.deepEqual(users.map((u) => u.role ?? null), ['admin', 'superadmin', null]); // du plus récent au plus ancien
  assert.equal(users.find((u) => u.id === boss.id).lastLoginAt, new Date(now + 3).toISOString());

  // Sans variable : aucun superadmin.
  const plain = await openStore();
  assert.equal((await plain.upsertUser({ provider: 'google', providerId: 'g', name: 'Boss', email: 'boss@example.com', emailVerified: true })).role, undefined);
  store.close();
  plain.close();
});

test('les numéros des grilles sont gardés 3 ans, sans les joueurs', async () => {
  const store = await openStore();
  const now = Date.UTC(2026, 9, 9, 12);
  await store.saveGrid(grid('a', [1, 2, 3, 4, 5], [6], { drawDate: '2026-10-10' }), now);
  await store.saveGrid(grid('b', [1, 2, 3, 4, 5, 9], [7], { drawDate: '2026-10-12' }), now + 86_400_000);
  await store.saveGrid(grid('c', [10, 20, 30, 40, 50], [2, 3], { gameType: 'euromillions' }), now);

  const day = dayOf(now);
  const loto = await store.gridStats({ gameType: 'loto', from: day, to: dayOf(now + 86_400_000) });
  assert.equal(loto.length, 2);
  assert.deepEqual(loto[0], { day, drawDate: '2026-10-10', numbers: [1, 2, 3, 4, 5], bonus: [6], players: 2, rounds: 7 });
  assert.equal((await store.gridStats({ gameType: 'loto', drawDate: '2026-10-12' })).length, 1);
  assert.deepEqual(await store.statsDrawDates('loto'), [{ date: '2026-10-12', grids: 1 }, { date: '2026-10-10', grids: 1 }]);

  // Après 30 jours, la grille et ses joueurs sont effacés, ses numéros restent.
  await store.purgeExpired(now + GRID_LIFETIME_MS + 86_400_000 * 2);
  assert.equal(await store.getGrid('a', now), null);
  assert.equal((await store.gridStats({ gameType: 'loto', from: day, to: dayOf(now + 86_400_000) })).length, 2);
  await store.purgeExpired(now + STATS_LIFETIME_MS + 1);
  assert.equal((await store.gridStats({ gameType: 'loto', from: day, to: dayOf(now + 86_400_000) })).length, 1);
  store.close();
});

test('mesure d’audience : un visiteur compté une fois par jour, empreintes effacées le lendemain', async () => {
  const store = await openStore();
  const now = Date.UTC(2026, 9, 9, 12);
  await store.recordPageView({ path: '/', device: 'mobile', referrer: 'google.com', visitor: '1.2.3.4|Firefox' }, now);
  await store.recordPageView({ path: '/salon', device: 'mobile', visitor: '1.2.3.4|Firefox' }, now + 1000);
  await store.recordPageView({ path: '/', device: 'ordinateur', visitor: '5.6.7.8|Chrome' }, now + 2000);
  await store.recordPageView({ path: '/', device: 'mobile', visitor: '1.2.3.4|Firefox' }, now + 86_400_000);
  const day = dayOf(now);
  const counters = await store.counters(day, day);
  const count = (metric, key = '') => counters.find((c) => c.metric === metric && c.key === key)?.count;
  assert.equal(count('visitors'), 2);
  assert.equal(count('page', '/'), 2);
  assert.equal(count('page', '/salon'), 1);
  assert.equal(count('device', 'mobile'), 2);
  assert.equal(count('referrer', 'google.com'), 1);
  assert.equal((await store.counters(dayOf(now + 86_400_000), dayOf(now + 86_400_000))).find((c) => c.metric === 'visitors').count, 1);
  store.close();
});

test('pages comptées, appareils, sites d’origine et robots', () => {
  assert.equal(pagePath('/'), '/');
  assert.equal(pagePath('/salon/abc_-1'), '/salon');
  assert.equal(pagePath('/grille/xyz'), '/grille');
  assert.equal(pagePath('/admin'), null);
  assert.equal(pagePath('/style.css'), null);
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablette');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'ordinateur');
  const own = new Set(['co-loto.com']);
  assert.equal(referrerHost('https://www.google.com/search?q=x', own), 'google.com');
  assert.equal(referrerHost('https://co-loto.com/salon/x', own), null);
  assert.equal(referrerHost('pas une adresse', own), null);
  assert.equal(isBot('Googlebot/2.1'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot('Mozilla/5.0 (Windows NT 10.0)'), false);
});

let server;
let baseUrl;
let store;
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130';

before(async () => {
  store = await openStore({ superadminEmail: 'boss@example.com' });
  server = createApp({ store, env: { AUTH_DEV_LOGIN: '1', PUBLIC_URL: 'https://co-loto.example' } }).httpServer;
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

const request = (path, { cookie, ...options } = {}) =>
  fetch(baseUrl + path, { redirect: 'manual', ...options, headers: { 'user-agent': BROWSER, ...options.headers, ...(cookie && { cookie }) } });
const login = async (query) => (await request(`/auth/dev?${new URLSearchParams(query)}`)).headers.getSetCookie().find((c) => c.startsWith('coloto_session=')).split(';')[0];
const json = async (path, options) => (await request(path, options)).json();
const putAdmin = (id, admin, cookie) =>
  request(`/api/admin/utilisateurs/${id}/admin`, { method: 'PUT', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ admin }) });

const ADMIN_URLS = ['/admin', '/admin/utilisateurs', '/admin/numeros', '/admin/static/admin.js', '/admin/static/menu.js', '/admin/static/admin.css', '/api/admin/apercu', '/api/admin/utilisateurs', '/api/admin/frequentation', '/api/admin/numeros'];

test('un visiteur ou un joueur classique ne voit rien de l’administration', async () => {
  const player = await login({ nom: 'Joueur', email: 'joueur@example.com' });
  for (const cookie of [undefined, player]) {
    for (const url of ADMIN_URLS) {
      const res = await request(url, { cookie });
      assert.equal(res.status, 404, `${url} ${cookie ? 'connecté' : 'anonyme'}`);
      assert.doesNotMatch(await res.text(), /Administration|superadmin/i, url);
    }
  }
  const account = await json('/api/compte', { cookie: player });
  assert.deepEqual(Object.keys(account.user).sort(), ['email', 'emailConsent', 'emailVerified', 'name', 'provider']);
  // Les scripts publics ne contiennent pas les entrées du menu d'administration.
  assert.doesNotMatch(await (await request('/js/header.js')).text(), /Tableau de bord|Utilisateurs|Fréquentation/);
});

test('le superadmin nomme et retire les administrateurs, sans jamais perdre son rôle', async () => {
  const boss = await login({ nom: 'Boss', email: 'boss@example.com' });
  const bossAccount = (await json('/api/compte', { cookie: boss })).user;
  assert.equal(bossAccount.admin, true);
  assert.equal(bossAccount.superadmin, true);
  for (const url of ADMIN_URLS) assert.equal((await request(url, { cookie: boss })).status, 200, url);
  assert.equal((await request('/admin/inconnue', { cookie: boss })).status, 404);

  const helper = await login({ nom: 'Aide', email: 'aide@example.com' });
  const { users, me, superadminEmail } = await json('/api/admin/utilisateurs', { cookie: boss });
  assert.equal(superadminEmail, 'boss@example.com');
  const helperId = users.find((u) => u.name === 'Aide').id;
  assert.equal(users.find((u) => u.id === me).role, 'superadmin');

  assert.equal((await putAdmin(me, false, boss)).status, 400); // le superadmin reste admin
  assert.equal((await putAdmin(helperId, 'oui', boss)).status, 400);
  assert.equal((await putAdmin('inconnu', true, boss)).status, 404);
  const promoted = await putAdmin(helperId, true, boss);
  assert.equal(promoted.status, 200);
  assert.equal((await promoted.json()).role, 'admin');

  // Un admin voit l'administration mais ne gère pas les rôles.
  const helperAccount = (await json('/api/compte', { cookie: helper })).user;
  assert.equal(helperAccount.admin, true);
  assert.equal(helperAccount.superadmin, undefined);
  assert.equal((await request('/api/admin/utilisateurs', { cookie: helper })).status, 200);
  assert.equal((await putAdmin(me, false, helper)).status, 403);
  assert.equal((await putAdmin(helperId, false, helper)).status, 403);

  assert.equal((await putAdmin(helperId, false, boss)).status, 200);
  assert.equal((await request('/api/admin/apercu', { cookie: helper })).status, 404);
});

test('un admin consulte les grilles d’un joueur, la fréquentation et les numéros joués', async () => {
  const boss = await login({ nom: 'Boss', email: 'boss@example.com' });
  const player = await login({ nom: 'Lucie' });
  const lucie = (await json('/api/admin/utilisateurs', { cookie: boss })).users.find((u) => u.name === 'Lucie');
  await store.saveGrid(grid('g1', [1, 2, 3, 4, 5], [6], { drawDate: '2026-10-14' }));
  await store.claimGrid(lucie.id, 'g1', 't-g1');
  const grids = await json(`/api/admin/utilisateurs/${lucie.id}/grilles`, { cookie: boss });
  assert.deepEqual(grids.map((g) => g.id), ['g1']);
  assert.equal((await json('/api/admin/utilisateurs', { cookie: boss })).users.find((u) => u.name === 'Lucie').grids, 1);
  assert.ok(player);

  // Pages vues : les visites des robots, des fichiers et de l'administration ne comptent pas.
  await request('/', { headers: { accept: 'text/html', referer: 'https://www.qwant.com/' } });
  await request('/grille/g1', { headers: { accept: 'text/html' } });
  await request('/', { headers: { accept: 'text/html', 'user-agent': 'Googlebot/2.1' } });
  await request('/style.css');
  await request('/'); // contrôle de santé, sans demander de HTML
  await new Promise((r) => setTimeout(r, 100));
  const traffic = await json('/api/admin/frequentation?jours=7', { cookie: boss });
  assert.equal(traffic.days.length, 7);
  assert.equal(traffic.days.at(-1).views, 2);
  assert.equal(traffic.days.at(-1).visitors, 1);
  assert.deepEqual(traffic.referrers, [{ key: 'qwant.com', count: 1 }]);
  assert.deepEqual(traffic.pages.map((p) => p.key).sort(), ['/', '/grille']);
  assert.equal(traffic.days.at(-1).gamesFinished, 1);

  const numbers = await json('/api/admin/numeros?jeu=loto', { cookie: boss });
  assert.equal(numbers.grids, 1);
  assert.equal(numbers.numbers.length, 49);
  assert.deepEqual(numbers.numbers.filter((n) => n.count).map((n) => n.number), [1, 2, 3, 4, 5]);
  assert.equal(numbers.bonus.length, 10);
  assert.deepEqual(numbers.drawDates, [{ date: '2026-10-14', grids: 1 }]);
  assert.equal((await json('/api/admin/numeros?jeu=loto&tirage=2026-10-14', { cookie: boss })).grids, 1);
  assert.equal((await json('/api/admin/numeros?jeu=euromillions', { cookie: boss })).numbers.length, 50);
  assert.equal((await request('/api/admin/numeros?du=2025-01-01&au=2026-06-01', { cookie: boss })).status, 400); // plus d'un an
  assert.equal((await request('/api/admin/numeros?du=2026-02-01&au=2026-01-01', { cookie: boss })).status, 400);
  assert.equal((await request('/api/admin/numeros?tirage=demain', { cookie: boss })).status, 400);

  const overview = await json('/api/admin/apercu', { cookie: boss });
  assert.equal(overview.month.gamesFinished, 1);
  assert.equal(overview.activeGrids, 1);
  assert.equal(typeof overview.live.connections, 'number');
});
