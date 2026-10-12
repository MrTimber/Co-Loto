// Stockage des grilles terminées et des comptes : base Turso en production, fichier SQLite local sinon.
import { createClient } from '@libsql/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { todayInFrance } from './games.js';

export const GRID_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// Statistiques anonymes (numéros joués, fréquentation) : gardées 3 ans.
// Pseudo d'un compte quand ni les parties ni le service de connexion n'en donnent un.
export const DEFAULT_NAME = 'Joueur';
export const STATS_LIFETIME_MS = 3 * 365 * 24 * 60 * 60 * 1000;
// Code de connexion envoyé par email, et lien de vérification d'une adresse.
export const LOGIN_CODE_LIFETIME_MS = 15 * 60 * 1000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_MS = 60 * 1000;

// Jour (AAAA-MM-JJ, heure de Paris) d'un instant en millisecondes.
export const dayOf = (ms) => todayInFrance(new Date(ms));

// Les jetons (session, participation) ne sont jamais stockés en clair.
const hash = (token) => createHash('sha256').update(String(token)).digest('base64url');

function toUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    // Tous les fournisseurs liés au compte (même adresse email), dans l'ordre de leur première connexion.
    providers: row.providers ? [...new Set(String(row.providers).split(','))] : [row.provider],
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.email && row.email_verified),
    emailConsent: Boolean(row.email_consent),
    // Des grilles viennent d'un compte à l'adresse non vérifiée : certaines peuvent être à quelqu'un d'autre.
    ...(row.review_grids && { reviewGrids: true }),
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

// Mise à niveau des comptes : une adresse email n'appartient qu'à un compte. Pour chaque adresse
// partagée, le compte gardé est le plus ancien qui l'a vérifiée (sinon le plus ancien). Les autres
// comptes qui l'ont vérifiée y sont fusionnés (fournisseurs, grilles, sessions, rôle). Ceux qui ne
// l'ont pas vérifiée y laissent leurs grilles, mais pas leurs fournisseurs ni leurs sessions : sans
// preuve, ils devront entrer un code envoyé à l'adresse. Sans compte vérifié, seul le plus ancien
// garde l'adresse.
async function mergeAccountsByEmail(db, firstRun) {
  if (firstRun) {
    await db.execute('INSERT OR IGNORE INTO user_logins (provider, provider_id, user_id, created_at) SELECT provider, provider_id, id, created_at FROM users');
  }
  const { rows } = await db.execute(
    `SELECT id, lower(email) AS address, email_verified, is_admin, email_consent FROM users
    WHERE lower(email) IN (SELECT lower(email) FROM users WHERE email IS NOT NULL GROUP BY lower(email) HAVING COUNT(*) > 1)
    ORDER BY lower(email), email_verified DESC, created_at, id`,
  );
  const keepers = new Map();
  for (const row of rows) {
    const keep = keepers.get(row.address);
    if (!keep) {
      keepers.set(row.address, { id: row.id, verified: Boolean(row.email_verified) });
      continue;
    }
    if (!row.email_verified && !keep.verified) {
      await db.execute({ sql: 'UPDATE users SET email = NULL, email_consent = 0 WHERE id = ?', args: [row.id] });
      continue;
    }
    if (!row.email_verified) {
      await db.batch(
        [
          { sql: 'UPDATE users SET review_grids = 1 WHERE id = ? AND EXISTS (SELECT 1 FROM grid_players WHERE user_id = ?)', args: [keep.id, row.id] },
          { sql: 'UPDATE OR IGNORE grid_players SET user_id = ? WHERE user_id = ?', args: [keep.id, row.id] },
          { sql: 'DELETE FROM user_logins WHERE user_id = ?', args: [row.id] },
          { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [row.id] },
          { sql: 'DELETE FROM users WHERE id = ?', args: [row.id] },
        ],
        'write',
      );
      continue;
    }
    await db.batch(
      [
        { sql: 'UPDATE user_logins SET user_id = ? WHERE user_id = ?', args: [keep.id, row.id] },
        { sql: 'UPDATE OR IGNORE grid_players SET user_id = ? WHERE user_id = ?', args: [keep.id, row.id] },
        { sql: 'UPDATE sessions SET user_id = ? WHERE user_id = ?', args: [keep.id, row.id] },
        { sql: 'UPDATE users SET is_admin = MAX(is_admin, ?), email_consent = MAX(email_consent, ?) WHERE id = ?', args: [row.is_admin, row.email_consent, keep.id] },
        { sql: 'DELETE FROM users WHERE id = ?', args: [row.id] },
      ],
      'write',
    );
  }
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email))');
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

// `superadminEmail` : adresse du superadmin, que son compte existe déjà ou non.
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
  const loginsExisted = Boolean(await first("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_logins'"));
  const gridStatsExisted = Boolean(await first("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'grid_stats'"));
  // Comptes : pseudo et email (jamais le vrai nom). L'adresse email vient toujours d'un fournisseur
  // de connexion et identifie le compte : un seul compte peut l'avoir. `email_verified` : adresse
  // vérifiée par le fournisseur, par un code ou par un lien envoyé à cette adresse.
  // `user_logins` : les fournisseurs liés à chaque compte (`users.provider` garde le premier).
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
      `CREATE TABLE IF NOT EXISTS user_logins (
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (provider, provider_id)
      )`,
      'CREATE INDEX IF NOT EXISTS user_logins_user ON user_logins (user_id)',
      // Codes de connexion (`login`) et liens de vérification (`verify`), stockés hachés.
      `CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        user_id TEXT,
        email TEXT NOT NULL,
        code_hash TEXT,
        payload TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
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
  // Grilles reprises avec un compte à l'adresse non vérifiée : le joueur est invité à les relire.
  if (!userColumns.has('review_grids')) await run('ALTER TABLE users ADD COLUMN review_grids INTEGER NOT NULL DEFAULT 0');
  // L'accord pour recevoir les résultats exige une adresse vérifiée : un accord donné avant cette
  // règle sur une adresse non prouvée a pu l'être par quelqu'un d'autre que son propriétaire.
  await run('UPDATE users SET email_consent = 0 WHERE email_consent = 1 AND (email IS NULL OR email_verified = 0)');
  await mergeAccountsByEmail(db, !loginsExisted);
  // Première mise en place des statistiques : les grilles encore conservées y sont reprises.
  if (!gridStatsExisted) {
    const { rows } = await run('SELECT * FROM grids');
    if (rows.length) await db.batch(rows.map((row) => gridStatsInsert(toGrid(row), Number(row.created_at))), 'write');
  }

  // Le rôle est calculé à chaque lecture : le superadmin suit la variable d'environnement.
  // Le premier paramètre de chaque requête qui lit USER_COLUMNS est donc l'adresse du superadmin.
  const superadmin = typeof superadminEmail === 'string' && superadminEmail.trim() ? superadminEmail.trim() : null;
  const USER_COLUMNS = `users.id, users.provider, users.name, users.email, users.email_consent,
    (SELECT group_concat(provider) FROM (SELECT provider FROM user_logins WHERE user_id = users.id ORDER BY created_at, provider)) AS providers,
    users.email_verified, users.review_grids,
    -- Un rôle n'est effectif qu'avec une adresse vérifiée.
    CASE
      WHEN users.email_verified = 0 THEN NULL
      WHEN users.email IS NOT NULL AND lower(users.email) = lower(?) THEN 'superadmin'
      WHEN users.is_admin = 1 THEN 'admin'
    END AS role`;
  const selectUser = async (id) => {
    const row = await first(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, superadmin, id);
    return row ? toUser(row) : null;
  };
  const userByEmail = (email) => first('SELECT id, email_verified FROM users WHERE lower(email) = lower(?)', email);

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
    // Connexion avec un fournisseur.
    // 1. Fournisseur déjà lié à un compte : ce compte.
    // 2. Un compte a déjà cette adresse : si le fournisseur ne l'a pas vérifiée, renvoie
    //    { needsCode: true } : la connexion attend un code envoyé à cette adresse (puis reprend avec
    //    emailVerified). Sinon le fournisseur est lié à ce compte, dont l'adresse devient vérifiée.
    //    Si elle ne l'était pas, ses autres fournisseurs et ses sessions sont retirés : seul celui qui
    //    prouve posséder l'adresse peut encore y accéder. S'il a des grilles, le joueur est invité à
    //    retirer celles qui ne sont pas les siennes (un usurpateur aurait pu en ajouter).
    // 3. Sinon le compte `linkTo` (joueur déjà connecté qui ajoute un fournisseur), ou un nouveau compte.
    // `created` : nouveau compte.
    async upsertUser({ provider, providerId, name, email = null, emailVerified = false, linkTo = null }, now = Date.now()) {
      const verified = emailVerified ? 1 : 0;
      let userId = (await first('SELECT user_id FROM user_logins WHERE provider = ? AND provider_id = ?', provider, providerId))?.user_id;
      let created = false;
      if (!userId) {
        const holder = email ? await userByEmail(email) : null;
        if (holder && !verified) return { needsCode: true, email };
        if (holder && !holder.email_verified && holder.id !== linkTo) {
          await db.batch(
            [
              { sql: 'DELETE FROM user_logins WHERE user_id = ?', args: [holder.id] },
              { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [holder.id] },
              { sql: 'DELETE FROM email_tokens WHERE user_id = ?', args: [holder.id] },
              // Le pseudo aussi pouvait venir de quelqu'un d'autre : celui de cette connexion le remplace.
              { sql: 'UPDATE users SET name = ?, review_grids = EXISTS (SELECT 1 FROM grid_players WHERE user_id = ?) WHERE id = ?', args: [name, holder.id, holder.id] },
            ],
            'write',
          );
        }
        if (holder) userId = holder.id;
        userId ??= linkTo && (await selectUser(linkTo))?.id;
        if (!userId) {
          userId = randomUUID();
          created = true;
          await run(
            'INSERT INTO users (id, provider, provider_id, name, email, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            userId, provider, providerId, name, email, email ? verified : 0, now,
          );
        }
        await run('INSERT OR IGNORE INTO user_logins (provider, provider_id, user_id, created_at) VALUES (?, ?, ?, ?)', provider, providerId, userId, now);
      }
      if (email) {
        const holder = await userByEmail(email);
        if (!holder) {
          // Un compte sans adresse prend celle du fournisseur.
          await run('UPDATE users SET email = ?, email_verified = ? WHERE id = ? AND email IS NULL', email, verified, userId);
        } else if (holder.id === userId && verified) {
          await run('UPDATE users SET email_verified = 1 WHERE id = ?', userId);
        }
      }
      await db.batch(
        [
          { sql: 'UPDATE users SET last_login_at = ? WHERE id = ?', args: [now, userId] },
          // Un compte resté au pseudo par défaut prend celui de cette connexion.
          { sql: 'UPDATE users SET name = ? WHERE id = ? AND name = ? AND ? <> ?', args: [name, userId, DEFAULT_NAME, name, DEFAULT_NAME] },
          bump(dayOf(now), created ? 'signup' : 'login', provider),
        ],
        'write',
      );
      return { ...(await selectUser(userId)), created };
    },
    // Pseudo et accord d'envoi des résultats (qui demande une adresse vérifiée). L'adresse, elle,
    // vient toujours du fournisseur de connexion.
    async dismissGridsReview(id) {
      await run('UPDATE users SET review_grids = 0 WHERE id = ?', id);
    },
    async updateUser(id, { name, emailConsent }) {
      await run(
        'UPDATE users SET name = ?, email_consent = CASE WHEN email IS NOT NULL AND email_verified = 1 THEN ? ELSE 0 END WHERE id = ?',
        name, emailConsent ? 1 : 0, id,
      );
    },

    // Connexion en attente d'un code envoyé par email. `pending` : la connexion à reprendre.
    // Renvoie le jeton (gardé dans un cookie) et le code (envoyé par email).
    async createLoginCode(pending, now = Date.now()) {
      const token = randomBytes(24).toString('base64url');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await run(
        `INSERT INTO email_tokens (token_hash, kind, email, code_hash, payload, created_at, expires_at)
        VALUES (?, 'login', ?, ?, ?, ?, ?)`,
        hash(token), pending.email, hash(`${token}|${code}`), JSON.stringify(pending), now, now + LOGIN_CODE_LIFETIME_MS,
      );
      return { token, code };
    },
    async getLoginCode(token, now = Date.now()) {
      if (typeof token !== 'string') return null;
      const row = await first("SELECT email FROM email_tokens WHERE token_hash = ? AND kind = 'login' AND expires_at > ?", hash(token), now);
      return row ? { email: row.email } : null;
    },
    // Renvoie la connexion en attente si le code est bon ; un code ne sert qu'une fois,
    // et il est annulé après trop d'essais.
    async checkLoginCode(token, code, now = Date.now()) {
      if (typeof token !== 'string') return { error: 'expired' };
      const row = await first("SELECT * FROM email_tokens WHERE token_hash = ? AND kind = 'login' AND expires_at > ?", hash(token), now);
      if (!row || row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return { error: 'expired' };
      const given = String(code ?? '').replaceAll(/\s/g, '');
      if (hash(`${token}|${given}`) !== row.code_hash) {
        await run('UPDATE email_tokens SET attempts = attempts + 1 WHERE token_hash = ?', row.token_hash);
        return { error: row.attempts + 1 >= LOGIN_CODE_MAX_ATTEMPTS ? 'expired' : 'invalid' };
      }
      await run('DELETE FROM email_tokens WHERE token_hash = ?', row.token_hash);
      return { pending: JSON.parse(row.payload) };
    },
    // Lien de vérification de l'adresse du compte (au plus un par minute).
    async createVerification(userId, now = Date.now()) {
      const user = await first('SELECT email, email_verified FROM users WHERE id = ?', userId);
      if (!user?.email || user.email_verified) return null;
      const recent = await first("SELECT 1 FROM email_tokens WHERE kind = 'verify' AND user_id = ? AND created_at > ?", userId, now - VERIFICATION_RESEND_MS);
      if (recent) return { tooSoon: true };
      const token = randomBytes(32).toString('base64url');
      await run(
        "INSERT INTO email_tokens (token_hash, kind, user_id, email, created_at, expires_at) VALUES (?, 'verify', ?, ?, ?, ?)",
        hash(token), userId, user.email, now, now + VERIFICATION_LIFETIME_MS,
      );
      return { token, email: user.email };
    },
    // Vérifie l'adresse si le lien est valable et que le compte a toujours cette adresse.
    async verifyEmail(token, now = Date.now()) {
      if (typeof token !== 'string') return false;
      const row = await first("SELECT user_id, email FROM email_tokens WHERE token_hash = ? AND kind = 'verify' AND expires_at > ?", hash(token), now);
      if (!row) return false;
      const result = await run('UPDATE users SET email_verified = 1 WHERE id = ? AND lower(email) = lower(?)', row.user_id, row.email);
      await run("DELETE FROM email_tokens WHERE kind = 'verify' AND user_id = ?", row.user_id);
      return changes(result) > 0;
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
          { sql: 'DELETE FROM user_logins WHERE user_id = ?', args: [userId] },
          { sql: 'DELETE FROM email_tokens WHERE user_id = ?', args: [userId] },
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
          { sql: 'DELETE FROM email_tokens WHERE expires_at <= ?', args: [now] },
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
            sql: `SELECT COUNT(*) AS total, SUM(created_at > ?) AS recent, SUM(is_admin = 1 AND email_verified = 1) AS admins,
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
    getUser: selectUser,
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
    // Le rôle admin n'est donné qu'à un compte dont l'adresse est vérifiée.
    async setAdmin(id, admin) {
      return changes(await run('UPDATE users SET is_admin = ? WHERE id = ? AND (? = 0 OR (email IS NOT NULL AND email_verified = 1))', admin ? 1 : 0, id, admin ? 1 : 0)) > 0;
    },
    close() {
      db.close();
    },
  };
}
