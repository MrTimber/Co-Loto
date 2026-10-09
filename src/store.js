// Stockage des grilles terminées dans SQLite (module intégré à Node.js).
import { DatabaseSync } from 'node:sqlite';
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

export function openStore(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
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
  const columns = new Set(db.prepare('PRAGMA table_info(grids)').all().map((c) => c.name));
  if (!columns.has('game_type')) db.exec("ALTER TABLE grids ADD COLUMN game_type TEXT NOT NULL DEFAULT 'loto'");
  if (!columns.has('bonus')) db.exec('ALTER TABLE grids ADD COLUMN bonus TEXT');
  // Comptes : identifiant chez le fournisseur, pseudo et email (jamais le vrai nom).
  // `email_consent` : accord explicite pour recevoir les résultats par email.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      email_consent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE (provider, provider_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grid_players (
      token_hash TEXT PRIMARY KEY,
      grid_id TEXT NOT NULL,
      name TEXT NOT NULL,
      user_id TEXT
    );
    CREATE INDEX IF NOT EXISTS grid_players_user ON grid_players (user_id);
  `);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO grids (id, created_at, expires_at, draw_date, game_type, numbers, bonus, chance, players, rounds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const select = db.prepare('SELECT * FROM grids WHERE id = ? AND expires_at > ?');
  const purge = db.prepare('DELETE FROM grids WHERE expires_at <= ?');
  const insertPlayer = db.prepare('INSERT OR IGNORE INTO grid_players (token_hash, grid_id, name) VALUES (?, ?, ?)');
  const USER_COLUMNS = 'users.id, users.provider, users.name, users.email, users.email_verified, users.email_consent';
  const selectUser = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE provider = ? AND provider_id = ?`);
  const insertUser = db.prepare(`
    INSERT INTO users (id, provider, provider_id, name, email, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const setProviderEmail = db.prepare('UPDATE users SET email = ?, email_verified = ? WHERE id = ? AND email IS NULL');
  const updateUserStmt = db.prepare(`
    UPDATE users SET name = ?, email = ?, email_consent = ?,
      email_verified = CASE WHEN email IS ? THEN email_verified ELSE 0 END
    WHERE id = ?
  `);
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const selectSession = db.prepare(`
    SELECT ${USER_COLUMNS} FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);
  const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const claim = db.prepare(`
    UPDATE grid_players SET user_id = ?
    WHERE token_hash = ? AND grid_id = ? AND (user_id IS NULL OR user_id = ?)
      AND EXISTS (SELECT 1 FROM grids WHERE grids.id = grid_players.grid_id AND grids.expires_at > ?)
  `);
  const selectUserGrids = db.prepare(`
    SELECT grids.*, grid_players.name AS player_name FROM grid_players JOIN grids ON grids.id = grid_players.grid_id
    WHERE grid_players.user_id = ? AND grids.expires_at > ? ORDER BY grids.created_at DESC
  `);
  const unclaim = db.prepare('UPDATE grid_players SET user_id = NULL WHERE user_id = ? AND grid_id = ?');
  const unclaimAll = db.prepare('UPDATE grid_players SET user_id = NULL WHERE user_id = ?');
  const deleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');
  const purgePlayers = db.prepare('DELETE FROM grid_players WHERE grid_id NOT IN (SELECT id FROM grids)');
  const purgeSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    // `bonus` : numéros complémentaires (numéro chance, étoiles ou numéro Dream).
    // `participants` : jeton et pseudo de chaque joueur, pour rattacher plus tard la grille à son compte.
    saveGrid({ id, gameType = 'loto', numbers, bonus, players, rounds, drawDate = null, participants = [] }, now = Date.now()) {
      insert.run(
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
      );
      for (const { token, name } of participants) insertPlayer.run(hash(token), id, name);
    },
    getGrid(id, now = Date.now()) {
      const row = select.get(id, now);
      return row ? toGrid(row) : null;
    },
    // Retrouve le compte lié à un fournisseur, ou le crée avec ce pseudo et cet email.
    // Ensuite, pseudo et email ne changent que depuis l'espace du joueur (l'email du
    // fournisseur ne sert qu'à compléter un compte qui n'en a pas).
    upsertUser({ provider, providerId, name, email = null, emailVerified = false }, now = Date.now()) {
      const existing = selectUser.get(provider, providerId);
      if (existing) {
        if (email) setProviderEmail.run(email, emailVerified ? 1 : 0, existing.id);
        return toUser(selectUser.get(provider, providerId));
      }
      const id = randomUUID();
      insertUser.run(id, provider, providerId, name, email, email && emailVerified ? 1 : 0, now);
      return toUser(selectUser.get(provider, providerId));
    },
    // Une adresse modifiée à la main n'est plus considérée comme vérifiée.
    updateUser(id, { name, email, emailConsent }) {
      updateUserStmt.run(name, email, email && emailConsent ? 1 : 0, email, id);
    },
    createSession(userId, now = Date.now()) {
      const token = randomBytes(32).toString('base64url');
      insertSession.run(hash(token), userId, now + SESSION_LIFETIME_MS);
      return token;
    },
    getSessionUser(token, now = Date.now()) {
      if (!token) return null;
      const row = selectSession.get(hash(token), now);
      return row ? toUser(row) : null;
    },
    deleteSession(token) {
      if (token) deleteSessionStmt.run(hash(token));
    },
    // Rattache une grille au compte grâce au jeton de participation gardé par le navigateur.
    claimGrid(userId, gridId, playerToken, now = Date.now()) {
      if (typeof playerToken !== 'string' || typeof gridId !== 'string') return false;
      return Number(claim.run(userId, hash(playerToken), gridId, userId, now).changes) > 0;
    },
    listUserGrids(userId, now = Date.now()) {
      return selectUserGrids.all(userId, now).map((row) => ({ ...toGrid(row), playerName: row.player_name }));
    },
    forgetUserGrid(userId, gridId) {
      return Number(unclaim.run(userId, gridId).changes) > 0;
    },
    deleteUser(userId) {
      unclaimAll.run(userId);
      deleteUserSessions.run(userId);
      deleteUserStmt.run(userId);
    },
    purgeExpired(now = Date.now()) {
      const removed = Number(purge.run(now).changes);
      purgePlayers.run();
      purgeSessions.run(now);
      return removed;
    },
    close() {
      db.close();
    },
  };
}
