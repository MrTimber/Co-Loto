import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openStore, GRID_LIFETIME_MS, STATS_LIFETIME_MS, dayOf } from '../src/store.js';
import { pagePath, deviceOf, referrerHost, isBot } from '../src/stats.js';

const grid = (id, numbers, bonus, extra = {}) => ({ id, numbers, bonus, players: ['Alice', 'Bob'], rounds: 7, participants: [{ token: `t-${id}`, name: 'Alice' }], ...extra });

test('une adresse email = un seul compte ; rôles réservés aux adresses vérifiées', async () => {
  const store = await openStore({ superadminEmail: 'Boss@Example.com' });
  const now = Date.UTC(2026, 9, 9);
  // Adresse non vérifiée (compte Microsoft professionnel…) : gardée comme telle, jamais superadmin.
  const fake = await store.upsertUser({ provider: 'microsoft', providerId: 'm', name: 'Faux', email: 'boss@example.com', emailVerified: false }, now);
  assert.equal(fake.email, 'boss@example.com');
  assert.equal(fake.emailVerified, false);
  assert.equal(fake.role, undefined);
  // Même adresse, non vérifiée, avec un autre fournisseur : il faut un code envoyé par email.
  assert.deepEqual(await store.upsertUser({ provider: 'discord', providerId: 'x', name: 'Autre', email: 'BOSS@example.com', emailVerified: false }, now), {
    needsCode: true,
    email: 'BOSS@example.com',
  });
  // Adresse vérifiée : connexion au compte existant, dont l'adresse devient vérifiée. Ses autres
  // services et ses sessions sont retirés : sans preuve, il faudra désormais un code.
  const fakeSession = await store.createSession(fake.id, now);
  const boss = await store.upsertUser({ provider: 'google', providerId: 'g', name: 'Boss', email: 'boss@example.com', emailVerified: true }, now + 1);
  assert.equal(boss.id, fake.id);
  assert.equal(boss.role, 'superadmin');
  assert.equal(boss.created, false);
  assert.equal(boss.emailVerified, true);
  assert.equal(boss.reviewGrids, undefined); // aucune grille à relire
  assert.deepEqual(boss.providers, ['google']);
  assert.equal(await store.getSessionUser(fakeSession, now + 1), null);
  assert.deepEqual(await store.upsertUser({ provider: 'microsoft', providerId: 'm', name: 'Faux', email: 'boss@example.com', emailVerified: false }, now + 1), {
    needsCode: true,
    email: 'boss@example.com',
  });
  // Même adresse vérifiée avec un autre fournisseur : même compte, le fournisseur y est lié.
  const again = await store.upsertUser({ provider: 'github', providerId: 'h', name: 'Boss bis', email: 'BOSS@example.com', emailVerified: true }, now + 2);
  assert.equal(again.id, boss.id);
  assert.equal(again.created, false);
  assert.equal(again.name, 'Boss'); // pseudo de la connexion qui a prouvé l'adresse
  assert.deepEqual(again.providers, ['google', 'github']);
  assert.equal((await store.upsertUser({ provider: 'github', providerId: 'h', name: 'x' }, now + 3)).id, boss.id);
  // Après un code bon, la connexion reprend avec une adresse vérifiée : le fournisseur est lié.
  const { token, code } = await store.createLoginCode({ provider: 'discord', providerId: 'x', name: 'Autre', email: 'boss@example.com', retour: '/' }, now);
  assert.deepEqual(await store.getLoginCode(token, now), { email: 'boss@example.com' });
  assert.deepEqual(await store.checkLoginCode(token, '000000' === code ? '111111' : '000000', now), { error: 'invalid' });
  const { pending } = await store.checkLoginCode(token, code, now);
  assert.equal(pending.providerId, 'x');
  assert.deepEqual(await store.checkLoginCode(token, code, now), { error: 'expired' }); // une seule fois
  assert.equal((await store.upsertUser({ ...pending, emailVerified: true }, now)).id, boss.id);

  // Un joueur connecté sans adresse qui se connecte avec un autre service : le service est lié, l'adresse ajoutée.
  const lulu = await store.upsertUser({ provider: 'discord', providerId: 'd', name: 'Lulu' }, now);
  const linked = await store.upsertUser({ provider: 'facebook', providerId: 'f', name: 'x', email: 'lulu@example.com', emailVerified: false, linkTo: lulu.id }, now + 4);
  assert.equal(linked.id, lulu.id);
  assert.equal(linked.email, 'lulu@example.com');
  assert.equal(linked.emailVerified, false);

  // Un compte resté au pseudo par défaut prend celui de la connexion suivante, pas un compte qui a un pseudo.
  const anon = await store.upsertUser({ provider: 'google', providerId: 'anon', name: 'Joueur' }, now);
  assert.equal((await store.upsertUser({ provider: 'google', providerId: 'anon', name: 'Joueur' }, now)).name, 'Joueur');
  assert.equal((await store.upsertUser({ provider: 'google', providerId: 'anon', name: 'Zoé' }, now)).name, 'Zoé');
  assert.equal((await store.upsertUser({ provider: 'google', providerId: 'anon', name: 'Autre' }, now)).name, 'Zoé');
  await store.deleteUser(anon.id);

  // Rôle admin : seulement avec une adresse vérifiée.
  assert.equal(await store.setAdmin(lulu.id, true), false);
  const verification = await store.createVerification(lulu.id, now);
  assert.deepEqual(await store.createVerification(lulu.id, now + 1000), { tooSoon: true });
  assert.equal(await store.verifyEmail('faux', now), false);
  assert.equal(await store.verifyEmail(verification.token, now + 1000), true);
  assert.equal((await store.getUser(lulu.id)).emailVerified, true);
  assert.equal(await store.createVerification(lulu.id, now), null); // déjà vérifiée
  assert.equal(await store.setAdmin(lulu.id, true), true);
  assert.equal((await store.getUser(lulu.id)).role, 'admin');
  const users = await store.listUsers(now);
  assert.deepEqual(users.map((u) => u.role).sort(), ['admin', 'superadmin']);
  assert.equal(users.find((u) => u.id === boss.id).lastLoginAt, new Date(now).toISOString());

  // Sans variable : aucun superadmin.
  const plain = await openStore();
  assert.equal((await plain.upsertUser({ provider: 'google', providerId: 'g', name: 'Boss', email: 'boss@example.com', emailVerified: true })).role, undefined);
  store.close();
  plain.close();
});

test('mise à niveau : un seul compte par adresse', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'coloto-')), 'comptes.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0, email_consent INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE (provider, provider_id));
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE grid_players (token_hash TEXT PRIMARY KEY, grid_id TEXT NOT NULL, name TEXT NOT NULL, user_id TEXT);`);
  const insert = old.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('u0', 'discord', 'd', 'Ancien', 'alice@example.com', 0, 0, 0);
  insert.run('u1', 'google', 'g', 'Alice', 'alice@example.com', 1, 0, 1);
  insert.run('u2', 'github', 'h', 'Alice GH', 'Alice@Example.com', 1, 1, 2);
  insert.run('u3', 'microsoft', 'm', 'Moi', 'seule@example.com', 0, 1, 3);
  old.prepare('INSERT INTO grid_players VALUES (?, ?, ?, ?)').run('t', 'g1', 'Alice', 'u2');
  old.prepare('INSERT INTO grid_players VALUES (?, ?, ?, ?)').run('t0', 'g0', 'Ancien', 'u0');
  old.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('s0', 'u0', Date.now() + 100_000);
  old.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('s', 'u2', Date.now() + 100_000);
  old.close();

  const store = await openStore({ file });
  const users = await store.listUsers();
  assert.equal(users.length, 2);
  const alice = users.find((u) => u.id === 'u1');
  assert.deepEqual(alice.providers, ['google', 'github']); // comptes vérifiés fusionnés
  assert.equal(alice.emailConsent, true);
  // Le compte non vérifié laisse ses grilles, à relire, mais pas son service : il faudra un code.
  assert.equal(alice.reviewGrids, true);
  assert.deepEqual(await store.upsertUser({ provider: 'discord', providerId: 'd', name: 'x', email: 'alice@example.com' }), {
    needsCode: true,
    email: 'alice@example.com',
  });
  assert.equal(users.find((u) => u.id === 'u3').email, 'seule@example.com'); // gardée, non vérifiée
  assert.equal(users.find((u) => u.id === 'u3').emailVerified, false);
  assert.equal(users.find((u) => u.id === 'u3').emailConsent, false); // accord retiré sans adresse vérifiée
  assert.equal((await store.upsertUser({ provider: 'github', providerId: 'h', name: 'x' })).id, 'u1');
  store.close();
  // Une seconde ouverture ne change plus rien.
  const reopened = await openStore({ file });
  assert.equal((await reopened.listUsers()).length, 2);
  reopened.close();
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
  // Sans date de tirage prévue : compté pour le prochain tirage au moment où la grille est terminée
  // (vendredi 14 h à Paris : le tirage Euromillions du soir).
  assert.equal((await store.gridStats({ gameType: 'euromillions', drawDate: '2026-10-09' })).length, 1);
  assert.deepEqual(await store.statsDrawDates('euromillions'), [{ date: '2026-10-09', grids: 1 }]);

  // Après 30 jours, la grille et ses joueurs sont effacés, ses numéros restent.
  await store.purgeExpired(now + GRID_LIFETIME_MS + 86_400_000 * 2);
  assert.equal(await store.getGrid('a', now), null);
  assert.equal((await store.gridStats({ gameType: 'loto', from: day, to: dayOf(now + 86_400_000) })).length, 2);
  await store.purgeExpired(now + STATS_LIFETIME_MS + 1);
  assert.equal((await store.gridStats({ gameType: 'loto', from: day, to: dayOf(now + 86_400_000) })).length, 1);
  store.close();
});

test('les grilles déjà comptées reçoivent un tirage pour les statistiques', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'coloto-')), 'stats.db');
  const first = await openStore({ file });
  await first.saveGrid(grid('a', [1, 2, 3, 4, 5], [6]), Date.UTC(2026, 9, 10, 19)); // samedi 21 h à Paris
  first.close();
  const old = new DatabaseSync(file);
  old.exec('UPDATE grid_stats SET stats_draw_date = NULL');
  old.close();
  const store = await openStore({ file });
  assert.deepEqual(await store.statsDrawDates('loto'), [{ date: '2026-10-12', grids: 1 }]); // tirage du samedi passé : lundi
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
const mails = [];
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130';

before(async () => {
  store = await openStore({ superadminEmail: 'boss@example.com' });
  server = createApp({ store, env: { AUTH_DEV_LOGIN: '1', PUBLIC_URL: 'https://co-loto.example' }, mailer: { send: async (m) => mails.push(m) } }).httpServer;
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
  assert.deepEqual(Object.keys(account.user).sort(), ['email', 'emailConsent', 'emailVerified', 'name', 'provider', 'providers']);
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

test('connexion avec une adresse non vérifiée déjà utilisée : code envoyé par email', async () => {
  const owner = await login({ nom: 'Proprio', email: 'proprio@example.com' });
  const ownerId = (await json('/api/compte', { cookie: owner })).user;
  assert.ok(ownerId);
  // Un autre service donne la même adresse sans l'avoir vérifiée.
  const start = await request(`/auth/dev?${new URLSearchParams({ nom: 'Intrus', email: 'proprio@example.com', verifiee: '0', retour: '/mon-espace' })}`);
  assert.equal(start.headers.get('location'), '/code-connexion');
  assert.equal(start.headers.getSetCookie().some((c) => c.startsWith('coloto_session=')), false);
  const codeCookie = start.headers.getSetCookie().find((c) => c.startsWith('coloto_code=')).split(';')[0];
  const mail = mails.at(-1);
  assert.equal(mail.to, 'proprio@example.com');
  const code = /(\d{6})/.exec(mail.subject)[1];
  assert.deepEqual(await json('/api/connexion/code', { cookie: codeCookie }), { email: 'p•••@example.com' });
  const send = (value) => request('/api/connexion/code', { method: 'POST', cookie: codeCookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: value }) });
  assert.equal((await send(code === '123456' ? '654321' : '123456')).status, 400);
  const ok = await send(code);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { retour: '/mon-espace' });
  const cookie = ok.headers.getSetCookie().find((c) => c.startsWith('coloto_session=')).split(';')[0];
  const account = (await json('/api/compte', { cookie })).user;
  assert.equal(account.name, 'Proprio');
  assert.deepEqual(account.providers, ['dev']);
  assert.equal((await send(code)).status, 410);

  // Aucun compte avec cette adresse : compte créé, adresse non vérifiée, puis vérifiée par lien.
  const fresh = await login({ nom: 'Nouveau', email: 'nouveau@example.com', verifiee: '0' });
  const user = (await json('/api/compte', { cookie: fresh })).user;
  assert.equal(user.email, 'nouveau@example.com');
  assert.equal(user.emailVerified, false);
  const patch = (body) => request('/api/compte', { method: 'PATCH', cookie: fresh, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await patch({ name: 'Nouveau', emailConsent: true })).status, 400); // adresse non vérifiée
  assert.equal((await request('/api/compte/verification', { method: 'POST', cookie: fresh })).status, 200);
  assert.equal((await request('/api/compte/verification', { method: 'POST', cookie: fresh })).status, 429);
  const link = /https:\/\/co-loto\.example\/verifier-email\?jeton=(\S+)/.exec(mails.at(-1).text);
  assert.equal(mails.at(-1).to, 'nouveau@example.com');
  const verified = await request(`/verifier-email?jeton=${link[1]}`);
  assert.equal(verified.headers.get('location'), '/mon-espace?verification=ok');
  assert.equal((await json('/api/compte', { cookie: fresh })).user.emailVerified, true);
  assert.equal((await request(`/verifier-email?jeton=${link[1]}`)).headers.get('location'), '/mon-espace?verification=echec');
  assert.equal((await patch({ name: 'Nouveau', emailConsent: true })).status, 200);
});

test('une adresse prouvée rejoint le compte qui l’avait sans l’avoir vérifiée', async () => {
  // Quelqu'un crée un compte avec une adresse non vérifiée et y ajoute une grille.
  const squatter = await login({ nom: 'Usurpateur', email: 'vrai@example.com', verifiee: '0' });
  await store.saveGrid(grid('gs', [1, 2, 3, 4, 5], [6]));
  const claim = await request('/api/compte/grilles', { method: 'POST', cookie: squatter, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gridId: 'gs', token: 't-gs' }) });
  assert.equal(claim.status, 200);
  // La vraie propriétaire se connecte avec un service qui a vérifié l'adresse : même compte, adresse vérifiée.
  const owner = await login({ nom: 'Vraie', email: 'vrai@example.com' });
  const account = (await json('/api/compte', { cookie: owner })).user;
  assert.equal(account.emailVerified, true);
  assert.equal(account.name, 'Vraie');
  assert.equal(account.reviewGrids, true);
  assert.deepEqual((await json('/api/compte/grilles', { cookie: owner })).map((g) => g.id), ['gs']);
  // L'usurpateur perd l'accès : sa session est fermée, et son service demande maintenant un code.
  assert.equal((await json('/api/compte', { cookie: squatter })).user, null);
  const again = await request(`/auth/dev?${new URLSearchParams({ nom: 'Usurpateur', email: 'vrai@example.com', verifiee: '0' })}`);
  assert.equal(again.headers.get('location'), '/code-connexion');
  // Grilles relues : l'avertissement disparaît.
  assert.equal((await request('/api/compte/grilles-a-verifier', { method: 'DELETE', cookie: owner })).status, 204);
  assert.equal((await json('/api/compte', { cookie: owner })).user.reviewGrids, undefined);
});

test('le rôle admin n’est donné qu’à une adresse vérifiée', async () => {
  const boss = await login({ nom: 'Boss', email: 'boss@example.com' });
  await login({ nom: 'Douteux', email: 'douteux@example.com', verifiee: '0' });
  const users = (await json('/api/admin/utilisateurs', { cookie: boss })).users;
  const target = users.find((u) => u.name === 'Douteux');
  assert.equal(target.emailVerified, false);
  assert.equal((await putAdmin(target.id, true, boss)).status, 400);
  // Un superadmin dont l'adresse n'est pas vérifiée n'a aucun rôle.
  const local = await openStore({ superadminEmail: 'chef@example.com' });
  const chef = await local.upsertUser({ provider: 'microsoft', providerId: 'c', name: 'Chef', email: 'chef@example.com', emailVerified: false });
  assert.equal(chef.role, undefined);
  local.close();
});
