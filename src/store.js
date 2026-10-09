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
  const insert = db.prepare(`
    INSERT OR REPLACE INTO grids (id, created_at, expires_at, draw_date, numbers, chance, players, rounds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const select = db.prepare('SELECT * FROM grids WHERE id = ? AND expires_at > ?');
  const purge = db.prepare('DELETE FROM grids WHERE expires_at <= ?');

  return {
    saveGrid({ id, numbers, chance, players, rounds, drawDate = null }, now = Date.now()) {
      insert.run(id, now, now + GRID_LIFETIME_MS, drawDate, JSON.stringify(numbers), chance, JSON.stringify(players), rounds);
    },
    getGrid(id, now = Date.now()) {
      const row = select.get(id, now);
      if (!row) return null;
      return {
        id: row.id,
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        drawDate: row.draw_date,
        numbers: JSON.parse(row.numbers),
        chance: row.chance,
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
