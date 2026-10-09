import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, GRID_LIFETIME_MS } from '../src/store.js';

test('une grille est consultable pendant 30 jours puis purgée', () => {
  const store = openStore();
  const now = Date.UTC(2026, 9, 9);
  store.saveGrid({ id: 'abc', gameType: 'euromillions', numbers: [1, 2, 3, 4, 5], bonus: [7, 11], players: ['Alice', 'Bob'], rounds: 9, drawDate: '2026-10-13' }, now);

  const grid = store.getGrid('abc', now + 1000);
  assert.deepEqual(grid.numbers, [1, 2, 3, 4, 5]);
  assert.equal(grid.gameType, 'euromillions');
  assert.deepEqual(grid.bonus, [7, 11]);
  assert.deepEqual(grid.players, ['Alice', 'Bob']);
  assert.equal(grid.drawDate, '2026-10-13');
  assert.equal(grid.expiresAt, new Date(now + GRID_LIFETIME_MS).toISOString());

  assert.equal(store.getGrid('abc', now + GRID_LIFETIME_MS), null);
  assert.equal(store.getGrid('inconnue', now), null);
  assert.equal(store.purgeExpired(now + GRID_LIFETIME_MS), 1);
  store.close();
});

test('une base créée avant le multi-jeux est mise à niveau : ses grilles sont des grilles de Loto', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'coloto-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE grids (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, draw_date TEXT,
    numbers TEXT NOT NULL, chance INTEGER NOT NULL, players TEXT NOT NULL, rounds INTEGER NOT NULL)`);
  old.prepare('INSERT INTO grids VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('old', 0, Date.now() + 1000, null, '[1,2,3,4,5]', 9, '["Alice"]', 6);
  old.close();
  const store = openStore(file);
  const grid = store.getGrid('old');
  assert.equal(grid.gameType, 'loto');
  assert.deepEqual(grid.bonus, [9]);
  store.close();
});
