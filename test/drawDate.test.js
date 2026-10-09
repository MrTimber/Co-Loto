import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDrawDate } from '../src/drawDate.js';

const now = new Date('2026-10-09T10:00:00Z'); // un vendredi

test('la date de tirage est optionnelle', () => {
  assert.equal(validateDrawDate(undefined, now), null);
  assert.equal(validateDrawDate('', now), null);
});

test('la date de tirage doit être un lundi, mercredi ou samedi à venir', () => {
  assert.equal(validateDrawDate('2026-10-10', now), '2026-10-10'); // samedi
  assert.equal(validateDrawDate('2026-10-12', now), '2026-10-12'); // lundi
  assert.equal(validateDrawDate('2026-10-14', now), '2026-10-14'); // mercredi
  assert.throws(() => validateDrawDate('2026-10-13', now), /lundi/); // mardi
  assert.throws(() => validateDrawDate('2026-10-07', now), /passée/);
  assert.throws(() => validateDrawDate('2027-12-04', now), /an/);
  assert.throws(() => validateDrawDate('2026-02-30', now), /valide/);
  assert.throws(() => validateDrawDate('10/10/2026', now), /format/);
});
