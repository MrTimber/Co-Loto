// Espace d'administration : pages, scripts et API réservés aux administrateurs.
// Pour tout autre visiteur, ces adresses n'existent pas (404) : rien n'y révèle l'administration.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { GAMES, getGame } from './games.js';
import { dayOf, PLAY_MODES } from './store.js';

const ADMIN_DIR = fileURLToPath(new URL('../admin/', import.meta.url));
const SECTIONS = ['utilisateurs', 'frequentation', 'numeros'];
const DAY_MS = 86_400_000;
const MAX_PERIOD_DAYS = 366;
const PERIODS = [7, 30, 90, 365];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (value) => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function dayRange(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

// Totaux par clé, du plus grand au plus petit.
function totals(rows) {
  const sums = new Map();
  for (const { key, count } of rows) sums.set(key, (sums.get(key) ?? 0) + count);
  return [...sums].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function frequencies(phase, lists) {
  const counts = new Map();
  for (let n = phase.min; n <= phase.max; n++) counts.set(n, 0);
  for (const list of lists) for (const n of list) if (counts.has(n)) counts.set(n, counts.get(n) + 1);
  return [...counts].map(([number, count]) => ({ number, count }));
}

// `live()` : salons ouverts en ce moment.
export function createAdmin({ store, currentUser, live = () => ({}), now = () => Date.now() }) {
  const router = express.Router();

  async function adminUser(req) {
    const user = await currentUser(req);
    return user?.role ? user : null;
  }

  // Pages et scripts : un visiteur qui n'est pas administrateur obtient la page 404 habituelle.
  const adminOnly = async (req, res, next) => {
    req.admin = await adminUser(req);
    if (!req.admin) return next('router');
    res.set({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    next();
  };
  const api = async (req, res, next) => {
    req.admin = await adminUser(req);
    if (!req.admin) return res.status(404).json({ error: 'Introuvable.' });
    res.set({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    next();
  };

  router.get(['/admin', '/admin/:section'], adminOnly, (req, res, next) => {
    if (req.params.section && !SECTIONS.includes(req.params.section)) return next();
    res.sendFile('index.html', { root: ADMIN_DIR });
  });
  router.use('/admin/static', adminOnly, express.static(ADMIN_DIR, { index: false }));

  router.get('/api/admin/apercu', api, async (req, res) => {
    const today = dayOf(now());
    const from = addDays(today, -29);
    const counters = await store.counters(from, today);
    const sum = (metric, since = from) => counters.filter((c) => c.metric === metric && c.day >= since).reduce((s, c) => s + c.count, 0);
    res.json({
      live: live(),
      ...(await store.statsSummary(now())),
      visits: {
        today: { views: sum('page', today), visitors: sum('visitors', today) },
        week: { views: sum('page', addDays(today, -6)), visitors: sum('visitors', addDays(today, -6)) },
        month: { views: sum('page'), visitors: sum('visitors') },
      },
      month: { roomsCreated: sum('room_created'), gamesFinished: sum('game_finished'), signups: sum('signup'), logins: sum('login') },
      superadminEmail: store.superadminEmail,
    });
  });

  router.get('/api/admin/frequentation', api, async (req, res) => {
    const days = PERIODS.includes(Number(req.query.jours)) ? Number(req.query.jours) : 30;
    const to = dayOf(now());
    const from = addDays(to, 1 - days);
    const counters = await store.counters(from, to);
    const of = (metric) => counters.filter((c) => c.metric === metric);
    const daily = (metric) => {
      const byDay = new Map();
      for (const c of of(metric)) byDay.set(c.day, (byDay.get(c.day) ?? 0) + c.count);
      return byDay;
    };
    const views = daily('page');
    const visitors = daily('visitors');
    const created = daily('room_created');
    const finished = daily('game_finished');
    res.json({
      from,
      to,
      days: dayRange(from, to).map((day) => ({
        day,
        views: views.get(day) ?? 0,
        visitors: visitors.get(day) ?? 0,
        roomsCreated: created.get(day) ?? 0,
        gamesFinished: finished.get(day) ?? 0,
      })),
      pages: totals(of('page')),
      referrers: totals(of('referrer')).slice(0, 20),
      devices: totals(of('device')),
      roomsCreated: totals(of('room_created')),
      gamesFinished: totals(of('game_finished')),
      roomModes: totals(of('room_mode')),
      gridModes: await store.gridModes(from, to),
      signups: totals(of('signup')),
      logins: totals(of('login')),
    });
  });

  router.get('/api/admin/numeros', api, async (req, res) => {
    const game = getGame(req.query.jeu) ?? GAMES.loto;
    const mode = PLAY_MODES.includes(req.query.mode) ? req.query.mode : null;
    const today = dayOf(now());
    let { du: from, au: to, tirage: drawDate } = req.query;
    if (drawDate !== undefined) {
      if (!isDate(drawDate)) return res.status(400).json({ error: 'Date de tirage invalide.' });
      from = to = undefined;
    } else {
      if (to === undefined) to = today;
      if (from === undefined) from = addDays(to, -29);
      if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'Dates invalides.' });
      if (from > to) return res.status(400).json({ error: 'La date de début doit précéder la date de fin.' });
      if (daysBetween(from, to) >= MAX_PERIOD_DAYS) return res.status(400).json({ error: 'La période ne peut pas dépasser un an.' });
    }
    const grids = await store.gridStats({ gameType: game.id, from, to, drawDate, mode });
    const [numbers, bonus] = game.phases;
    const average = (key) => (grids.length ? grids.reduce((s, g) => s + g[key], 0) / grids.length : 0);
    res.json({
      gameType: game.id,
      mode,
      from: from ?? null,
      to: to ?? null,
      drawDate: drawDate ?? null,
      grids: grids.length,
      averagePlayers: average('players'),
      averageRounds: average('rounds'),
      numbers: frequencies(numbers, grids.map((g) => g.numbers)),
      bonus: frequencies(bonus, grids.map((g) => g.bonus)),
      drawDates: await store.statsDrawDates(game.id, mode),
    });
  });

  router.get('/api/admin/utilisateurs', api, async (req, res) => {
    res.json({ users: await store.listUsers(now()), superadminEmail: store.superadminEmail, me: req.admin.id });
  });

  router.get('/api/admin/utilisateurs/:id/grilles', api, async (req, res) => {
    if (!(await store.getUser(req.params.id))) return res.status(404).json({ error: 'Ce compte n’existe plus.' });
    res.json(await store.listUserGrids(req.params.id, now()));
  });

  // Seul le superadmin nomme ou retire les administrateurs ; son propre rôle ne peut pas être retiré.
  router.put('/api/admin/utilisateurs/:id/admin', api, async (req, res) => {
    if (req.admin.role !== 'superadmin') return res.status(403).json({ error: 'Seul le superadmin peut modifier les administrateurs.' });
    const { admin } = req.body ?? {};
    if (typeof admin !== 'boolean') return res.status(400).json({ error: 'Valeur invalide.' });
    const target = await store.getUser(req.params.id);
    if (!target) return res.status(404).json({ error: 'Ce compte n’existe plus.' });
    if (target.role === 'superadmin') return res.status(400).json({ error: 'Le superadmin reste toujours administrateur.' });
    if (admin && !target.emailVerified) return res.status(400).json({ error: 'Le rôle admin ne peut être donné qu’à un compte dont l’adresse email est vérifiée.' });
    await store.setAdmin(target.id, admin);
    res.json(await store.getUser(target.id));
  });

  return { router };
}
