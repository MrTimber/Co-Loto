import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, GRID_LIFETIME_MS } from '../src/store.js';

test('une grille est consultable pendant 30 jours puis purgée', () => {
  const store = openStore();
  const now = Date.UTC(2026, 9, 9);
  store.saveGrid({ id: 'abc', numbers: [1, 2, 3, 4, 5], chance: 7, players: ['Alice', 'Bob'], rounds: 9, drawDate: '2026-10-10' }, now);

  const grid = store.getGrid('abc', now + 1000);
  assert.deepEqual(grid.numbers, [1, 2, 3, 4, 5]);
  assert.equal(grid.chance, 7);
  assert.deepEqual(grid.players, ['Alice', 'Bob']);
  assert.equal(grid.drawDate, '2026-10-10');
  assert.equal(grid.expiresAt, new Date(now + GRID_LIFETIME_MS).toISOString());

  assert.equal(store.getGrid('abc', now + GRID_LIFETIME_MS), null);
  assert.equal(store.getGrid('inconnue', now), null);
  assert.equal(store.purgeExpired(now + GRID_LIFETIME_MS), 1);
  store.close();
});
