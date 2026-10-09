// Stockage des grilles terminées dans SQLite (module intégré à Node.js).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const GRID_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

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
  const columns = db.prepare('PRAGMA table_info(grids)').all().map((c) => c.name);
  if (!columns.includes('game_type')) db.exec("ALTER TABLE grids ADD COLUMN game_type TEXT NOT NULL DEFAULT 'loto'");
  if (!columns.includes('bonus')) db.exec('ALTER TABLE grids ADD COLUMN bonus TEXT');
  const insert = db.prepare(`
    INSERT OR REPLACE INTO grids (id, created_at, expires_at, draw_date, game_type, numbers, bonus, chance, players, rounds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const select = db.prepare('SELECT * FROM grids WHERE id = ? AND expires_at > ?');
  const purge = db.prepare('DELETE FROM grids WHERE expires_at <= ?');

  return {
    // `bonus` : numéros complémentaires (numéro chance, étoiles ou numéro Dream).
    saveGrid({ id, gameType = 'loto', numbers, bonus, players, rounds, drawDate = null }, now = Date.now()) {
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
    },
    getGrid(id, now = Date.now()) {
      const row = select.get(id, now);
      if (!row) return null;
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
    },
    purgeExpired(now = Date.now()) {
      return Number(purge.run(now).changes);
    },
    close() {
      db.close();
    },
  };
}
