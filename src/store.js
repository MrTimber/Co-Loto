// Stockage des grilles terminées et des comptes : base Turso en production, fichier SQLite local sinon.
import { createClient } from '@libsql/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { todayInFrance } from './games.js';

export const GRID_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// Statistiques anonymes (numéros joués, fréquentation) : gardées 3 ans.
export const STATS_LIFETIME_MS = 3 * 365 * 24 * 60 * 60 * 1000;

// Jour (AAAA-MM-JJ, heure de Paris) d'un instant en millisecondes.
export const dayOf = (ms) => todayInFrance(new Date(ms));

// Les jetons (session, participation) ne sont jamais stockés en clair.
const hash = (token) => createHash('sha256').update(String(token)).digest('base64url');

function toUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    emailConsent: Boolean(row.email_consent),
    // Seulement pour un administrateur : 'superadmin' ou 'admin'.
    ...(row.role && { role: row.role }),
  };
}

function toGrid(row) {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    drawDate: row.draw_date,
    gameType: row.game_type,
    numbers: JSON.parse(row.numbers),
    bonus: row.bonus ? JSON.parse(row.bonus) : [row.chance],
    players: JSON.parse(row.players),
    rounds: row.rounds,
  };
}

function gridStatsInsert({ gameType = 'loto', numbers, bonus, players, rounds, drawDate = null }, createdAt) {
  return {
    sql: `INSERT INTO grid_stats (created_at, day, game_type, draw_date, numbers, bonus, players, rounds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [createdAt, dayOf(createdAt), gameType, drawDate, JSON.stringify(numbers), JSON.stringify(bonus), players.length, rounds],
  };
}

// Base Turso si ses deux variables sont définies, sinon fichier SQLite local (développement, tests).
export function databaseFrom(env = process.env) {
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) return { url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN };
  return { file: env.DATABASE_FILE ?? 'data/co-loto.db' };
}

// `superadminEmail` : adresse du superadmin. Son compte est le plus ancien qui a cette adresse,
// vérifiée par le fournisseur de connexion (un seul compte, même s'il n'existe pas encore).
export async function openStore({ url, authToken, file = ':memory:', superadminEmail = null } = {}) {
  if (!url && file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = createClient(url ? { url, authToken } : { url: file === ':memory:' ? ':memory:' : `file:${file}` });
  const run = (sql, ...args) => db.execute({ sql, args });
  const first = async (sql, ...args) => (await run(sql, ...args)).rows[0];
  const changes = (result) => Number(result.rowsAffected);

  await run(`
    CREATE TABLE IF NOT EXISTS grids (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      draw_date TEXT,
      numbers TEXT NOT NULL,
      chance INTEGER NOT NULL,
      players TEXT NOT NULL,
      rounds INTEGER NOT NULL
    )
  `);
  // Colonnes ajoutées avec l'Euromillions et EuroDreams : les grilles plus anciennes sont des grilles de Loto.
  const columns = new Set((await run('PRAGMA table_info(grids)')).rows.map((c) => c.name));
  if (!columns.has('game_type')) await run("ALTER TABLE grids ADD COLUMN game_type TEXT NOT NULL DEFAULT 'loto'");
  if (!columns.has('bonus')) await run('ALTER TABLE grids ADD COLUMN bonus TEXT');
  const gridStatsExisted = Boolean(await first("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'grid_stats'"));
  // Comptes : identifiant chez le fournisseur, pseudo et email (jamais le vrai nom).
  // `email_consent` : accord explicite pour recevoir les résultats par email.
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        email_consent INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        UNIQUE (provider, provider_id)
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS grid_players (
        token_hash TEXT PRIMARY KEY,
        grid_id TEXT NOT NULL,
        name TEXT NOT NULL,
        user_id TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS grid_players_user ON grid_players (user_id)',
      // Numéros de chaque grille terminée, sans pseudo ni lien vers les joueurs ou la grille :
      // gardés 3 ans pour les statistiques. `day` : jour de création (heure de Paris).
      `CREATE TABLE IF NOT EXISTS grid_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        day TEXT NOT NULL,
        game_type TEXT NOT NULL,
        draw_date TEXT,
        numbers TEXT NOT NULL,
        bonus TEXT NOT NULL,
        players INTEGER NOT NULL,
        rounds INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS grid_stats_day ON grid_stats (game_type, day)',
      'CREATE INDEX IF NOT EXISTS grid_stats_draw ON grid_stats (game_type, draw_date)',
      // Compteurs quotidiens de fréquentation et d'activité (pages vues, visiteurs, salons créés…).
      `CREATE TABLE IF NOT EXISTS stats_counters (
        day TEXT NOT NULL,
        metric TEXT NOT NULL,
        key TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (day, metric, key)
      )`,
      // Visiteurs du jour : empreinte de l'adresse IP et du navigateur, mélangée à un sel tiré au sort
      // chaque jour. Sels et empreintes sont effacés le lendemain : les visites d'un jour à l'autre
      // ne peuvent pas être reliées, et aucune adresse IP n'est enregistrée.
      `CREATE TABLE IF NOT EXISTS stats_visitors (
        day TEXT NOT NULL,
        hash TEXT NOT NULL,
        PRIMARY KEY (day, hash)
      )`,
      'CREATE TABLE IF NOT EXISTS stats_salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL)',
    ],
    'write',
  );
  const userColumns = new Set((await run('PRAGMA table_info(users)')).rows.map((c) => c.name));
  if (!userColumns.has('is_admin')) await run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  if (!userColumns.has('last_login_at')) await run('ALTER TABLE users ADD COLUMN last_login_at INTEGER');
  // Première mise en place des statistiques : les grilles encore conservées y sont reprises.
  if (!gridStatsExisted) {
    const { rows } = await run('SELECT * FROM grids');
    if (rows.length) await db.batch(rows.map((row) => gridStatsInsert(toGrid(row), Number(row.created_at))), 'write');
  }

  // Le rôle est calculé à chaque lecture : le superadmin suit la variable d'environnement.
  // Le premier paramètre de chaque requête qui lit USER_COLUMNS est donc l'adresse du superadmin.
  const superadmin = typeof superadminEmail === 'string' && superadminEmail.trim() ? superadminEmail.trim() : null;
  const USER_COLUMNS = `users.id, users.provider, users.name, users.email, users.email_verified, users.email_consent,
    CASE
      WHEN users.id = (SELECT s.id FROM users s WHERE s.email_verified = 1 AND lower(s.email) = lower(?) ORDER BY s.created_at, s.id LIMIT 1) THEN 'superadmin'
      WHEN users.is_admin = 1 THEN 'admin'
    END AS role`;
  const selectUser = (provider, providerId) =>
    first(`SELECT ${USER_COLUMNS} FROM users WHERE provider = ? AND provider_id = ?`, superadmin, provider, providerId);

  const bump = (day, metric, key = '') => ({
    sql: `INSERT INTO stats_counters (day, metric, key, count) VALUES (?, ?, ?, 1)
      ON CONFLICT (day, metric, key) DO UPDATE SET count = count + 1`,
    args: [day, metric, String(key)],
  });

  // Sel du jour, gardé en mémoire et dans la base (le serveur peut redémarrer dans la journée).
  let salt = { day: null, value: null };
  async function dailySalt(day) {
    if (salt.day !== day) {
      await run('INSERT OR IGNORE INTO stats_salts (day, salt) VALUES (?, ?)', day, randomBytes(32).toString('base64url'));
      salt = { day, value: (await first('SELECT salt FROM stats_salts WHERE day = ?', day)).salt };
    }
    return salt.value;
  }

  return {
    // `bonus` : numéros complémentaires (numéro chance, étoiles ou numéro Dream).
    // `participants` : jeton et pseudo de chaque joueur, pour rattacher plus tard la grille à son compte.
    async saveGrid({ id, gameType = 'loto', numbers, bonus, players, rounds, drawDate = null, participants = [] }, now = Date.now()) {
      await db.batch(
        [
          {
            sql: `INSERT OR REPLACE INTO grids (id, created_at, expires_at, draw_date, game_type, numbers, bonus, chance, players, rounds)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              now,
              now + GRID_LIFETIME_MS,
              drawDate,
              gameType,
              JSON.stringify(numbers),
              JSON.stringify(bonus),
              bonus[0], // ancienne colonne, conservée pour les bases existantes
              JSON.stringify(players),
              rounds,
            ],
          },
          gridStatsInsert({ gameType, numbers, bonus, players, rounds, drawDate }, now),
          bump(dayOf(now), 'game_finished', gameType),
          ...participants.map(({ token, name }) => ({
            sql: 'INSERT OR IGNORE INTO grid_players (token_hash, grid_id, name) VALUES (?, ?, ?)',
            args: [hash(token), id, name],
          })),
        ],
        'write',
      );
    },
    async getGrid(id, now = Date.now()) {
      const row = await first('SELECT * FROM grids WHERE id = ? AND expires_at > ?', id, now);
      return row ? toGrid(row) : null;
    },
    // Retrouve le compte lié à un fournisseur, ou le crée avec ce pseudo et cet email.
    // Ensuite, pseudo et email ne changent que depuis l'espace du joueur (l'email du
    // fournisseur ne sert qu'à compléter un compte qui n'en a pas).
    // `created` indique un nouveau compte.
    async upsertUser({ provider, providerId, name, email = null, emailVerified = false }, now = Date.now()) {
      const existing = await selectUser(provider, providerId);
      if (existing) {
        if (email) await run('UPDATE users SET email = ?, email_verified = ? WHERE id = ? AND email IS NULL', email, emailVerified ? 1 : 0, existing.id);
        await run('UPDATE users SET last_login_at = ? WHERE id = ?', now, existing.id);
      } else {
        await run(
          'INSERT INTO users (id, provider, provider_id, name, email, email_verified, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          randomUUID(), provider, providerId, name, email, email && emailVerified ? 1 : 0, now, now,
        );
      }
      await db.batch([bump(dayOf(now), existing ? 'login' : 'signup', provider)], 'write');
      return { ...toUser(await selectUser(provider, providerId)), created: !existing };
    },
    // Une adresse modifiée à la main n'est plus considérée comme vérifiée.
    async updateUser(id, { name, email, emailConsent }) {
      await run(
        `UPDATE users SET name = ?, email = ?, email_consent = ?,
          email_verified = CASE WHEN email IS ? THEN email_verified ELSE 0 END
        WHERE id = ?`,
        name, email, email && emailConsent ? 1 : 0, email, id,
      );
    },
    async createSession(userId, now = Date.now()) {
      const token = randomBytes(32).toString('base64url');
      await run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', hash(token), userId, now + SESSION_LIFETIME_MS);
      return token;
    },
    async getSessionUser(token, now = Date.now()) {
      if (!token) return null;
      const row = await first(
        `SELECT ${USER_COLUMNS} FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
        superadmin, hash(token), now,
      );
      return row ? toUser(row) : null;
    },
    async deleteSession(token) {
      if (token) await run('DELETE FROM sessions WHERE token_hash = ?', hash(token));
    },
    // Rattache une grille au compte grâce au jeton de participation gardé par le navigateur.
    async claimGrid(userId, gridId, playerToken, now = Date.now()) {
      if (typeof playerToken !== 'string' || typeof gridId !== 'string') return false;
      const result = await run(
        `UPDATE grid_players SET user_id = ?
        WHERE token_hash = ? AND grid_id = ? AND (user_id IS NULL OR user_id = ?)
          AND EXISTS (SELECT 1 FROM grids WHERE grids.id = grid_players.grid_id AND grids.expires_at > ?)`,
        userId, hash(playerToken), gridId, userId, now,
      );
      return changes(result) > 0;
    },
    async listUserGrids(userId, now = Date.now()) {
      const { rows } = await run(
        `SELECT grids.*, grid_players.name AS player_name FROM grid_players JOIN grids ON grids.id = grid_players.grid_id
        WHERE grid_players.user_id = ? AND grids.expires_at > ? ORDER BY grids.created_at DESC`,
        userId, now,
      );
      return rows.map((row) => ({ ...toGrid(row), playerName: row.player_name }));
    },
    async forgetUserGrid(userId, gridId) {
      return changes(await run('UPDATE grid_players SET user_id = NULL WHERE user_id = ? AND grid_id = ?', userId, gridId)) > 0;
    },
    async deleteUser(userId) {
      await db.batch(
        [
          { sql: 'UPDATE grid_players SET user_id = NULL WHERE user_id = ?', args: [userId] },
          { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [userId] },
          { sql: 'DELETE FROM users WHERE id = ?', args: [userId] },
        ],
        'write',
      );
    },
    async purgeExpired(now = Date.now()) {
      const today = dayOf(now);
      const [grids] = await db.batch(
        [
          { sql: 'DELETE FROM grids WHERE expires_at <= ?', args: [now] },
          'DELETE FROM grid_players WHERE grid_id NOT IN (SELECT id FROM grids)',
          { sql: 'DELETE FROM sessions WHERE expires_at <= ?', args: [now] },
          { sql: 'DELETE FROM grid_stats WHERE created_at <= ?', args: [now - STATS_LIFETIME_MS] },
          { sql: 'DELETE FROM stats_counters WHERE day <= ?', args: [dayOf(now - STATS_LIFETIME_MS)] },
          { sql: 'DELETE FROM stats_visitors WHERE day < ?', args: [today] },
          { sql: 'DELETE FROM stats_salts WHERE day < ?', args: [today] },
        ],
        'write',
      );
      return changes(grids);
    },

    // --- Statistiques ---

    // Une page vue : `visitor` (adresse IP et navigateur) n'est jamais enregistré tel quel.
    async recordPageView({ path, device, referrer = null, visitor }, now = Date.now()) {
      const day = dayOf(now);
      const visitorHash = hash(`${await dailySalt(day)}|${visitor}`);
      const [, , , added] = await db.batch(
        [
          bump(day, 'page', path),
          bump(day, 'device', device),
          referrer ? bump(day, 'referrer', referrer) : 'SELECT 1',
          { sql: 'INSERT OR IGNORE INTO stats_visitors (day, hash) VALUES (?, ?)', args: [day, visitorHash] },
        ],
        'write',
      );
      if (changes(added) > 0) await db.batch([bump(day, 'visitors')], 'write');
    },
    async countEvent(metric, key = '', now = Date.now()) {
      await db.batch([bump(dayOf(now), metric, key)], 'write');
    },
    // Compteurs du jour `from` au jour `to` inclus, par jour.
    async counters(from, to) {
      const { rows } = await run('SELECT day, metric, key, count FROM stats_counters WHERE day >= ? AND day <= ? ORDER BY day', from, to);
      return rows.map((r) => ({ day: r.day, metric: r.metric, key: r.key, count: Number(r.count) }));
    },
    // Numéros des grilles d'un jeu, créées du jour `from` au jour `to`, ou pour le tirage `drawDate`.
    async gridStats({ gameType, from, to, drawDate }) {
      const { rows } = drawDate
        ? await run('SELECT * FROM grid_stats WHERE game_type = ? AND draw_date = ?', gameType, drawDate)
        : await run('SELECT * FROM grid_stats WHERE game_type = ? AND day >= ? AND day <= ?', gameType, from, to);
      return rows.map((r) => ({
        day: r.day,
        drawDate: r.draw_date,
        numbers: JSON.parse(r.numbers),
        bonus: JSON.parse(r.bonus),
        players: Number(r.players),
        rounds: Number(r.rounds),
      }));
    },
    // Dates de tirage qui ont au moins une grille, la plus récente d'abord.
    async statsDrawDates(gameType) {
      const { rows } = await run(
        'SELECT draw_date, COUNT(*) AS grids FROM grid_stats WHERE game_type = ? AND draw_date IS NOT NULL GROUP BY draw_date ORDER BY draw_date DESC',
        gameType,
      );
      return rows.map((r) => ({ date: r.draw_date, grids: Number(r.grids) }));
    },
    async statsSummary(now = Date.now()) {
      const sinceDay = dayOf(now - 29 * 86_400_000);
      const [users, grids, stats] = await db.batch(
        [
          {
            sql: `SELECT COUNT(*) AS total, SUM(created_at > ?) AS recent, SUM(is_admin) AS admins,
              SUM(email IS NOT NULL AND email_consent = 1) AS consents FROM users`,
            args: [now - 30 * 86_400_000],
          },
          { sql: 'SELECT COUNT(*) AS total FROM grids WHERE expires_at > ?', args: [now] },
          { sql: 'SELECT game_type, COUNT(*) AS total, SUM(day >= ?) AS recent, AVG(players) AS players, AVG(rounds) AS rounds FROM grid_stats GROUP BY game_type', args: [sinceDay] },
        ],
        'read',
      );
      const u = users.rows[0];
      return {
        users: { total: Number(u.total), recent: Number(u.recent ?? 0), admins: Number(u.admins ?? 0), emailConsents: Number(u.consents ?? 0) },
        activeGrids: Number(grids.rows[0].total),
        games: stats.rows.map((r) => ({
          gameType: r.game_type,
          total: Number(r.total),
          recent: Number(r.recent ?? 0),
          averagePlayers: Number(r.players),
          averageRounds: Number(r.rounds),
        })),
      };
    },

    // --- Administration ---

    superadminEmail: superadmin,
    async getUser(id) {
      const row = await first(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, superadmin, id);
      return row ? toUser(row) : null;
    },
    async listUsers(now = Date.now()) {
      const { rows } = await run(
        `SELECT ${USER_COLUMNS}, users.created_at, users.last_login_at,
          (SELECT COUNT(*) FROM grid_players JOIN grids ON grids.id = grid_players.grid_id
            WHERE grid_players.user_id = users.id AND grids.expires_at > ?) AS grids
        FROM users ORDER BY users.created_at DESC`,
        superadmin, now,
      );
      return rows.map((row) => ({
        ...toUser(row),
        createdAt: new Date(row.created_at).toISOString(),
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
        grids: Number(row.grids),
      }));
    },
    async setAdmin(id, admin) {
      return changes(await run('UPDATE users SET is_admin = ? WHERE id = ?', admin ? 1 : 0, id)) > 0;
    },
    close() {
      db.close();
    },
  };
}
