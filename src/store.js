// Stockage des grilles terminées et des comptes : base Turso en production, fichier SQLite local sinon.
import { createClient } from '@libsql/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const GRID_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

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

// Base Turso si ses deux variables sont définies, sinon fichier SQLite local (développement, tests).
export function databaseFrom(env = process.env) {
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) return { url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN };
  return { file: env.DATABASE_FILE ?? 'data/co-loto.db' };
}

export async function openStore({ url, authToken, file = ':memory:' } = {}) {
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
    ],
    'write',
  );

  const USER_COLUMNS = 'users.id, users.provider, users.name, users.email, users.email_verified, users.email_consent';
  const selectUser = (provider, providerId) =>
    first(`SELECT ${USER_COLUMNS} FROM users WHERE provider = ? AND provider_id = ?`, provider, providerId);

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
    async upsertUser({ provider, providerId, name, email = null, emailVerified = false }, now = Date.now()) {
      const existing = await selectUser(provider, providerId);
      if (existing) {
        if (email) await run('UPDATE users SET email = ?, email_verified = ? WHERE id = ? AND email IS NULL', email, emailVerified ? 1 : 0, existing.id);
      } else {
        await run(
          'INSERT INTO users (id, provider, provider_id, name, email, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          randomUUID(), provider, providerId, name, email, email && emailVerified ? 1 : 0, now,
        );
      }
      return toUser(await selectUser(provider, providerId));
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
        hash(token), now,
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
      const [grids] = await db.batch(
        [
          { sql: 'DELETE FROM grids WHERE expires_at <= ?', args: [now] },
          'DELETE FROM grid_players WHERE grid_id NOT IN (SELECT id FROM grids)',
          { sql: 'DELETE FROM sessions WHERE expires_at <= ?', args: [now] },
        ],
        'write',
      );
      return changes(grids);
    },
    close() {
      db.close();
    },
  };
}
