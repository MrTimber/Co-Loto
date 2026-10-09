import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDrawDate } from '../src/drawDate.js';
import { GAMES, upcomingDrawDates } from '../src/games.js';

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

test('les jours de tirage dépendent du jeu', () => {
  assert.equal(validateDrawDate('2026-10-13', now, 'euromillions'), '2026-10-13'); // mardi
  assert.equal(validateDrawDate('2026-10-16', now, 'euromillions'), '2026-10-16'); // vendredi
  assert.throws(() => validateDrawDate('2026-10-10', now, 'euromillions'), /L'Euromillions est tiré le mardi et le vendredi/);
  assert.equal(validateDrawDate('2026-10-12', now, 'eurodreams'), '2026-10-12'); // lundi
  assert.equal(validateDrawDate('2026-10-15', now, 'eurodreams'), '2026-10-15'); // jeudi
  assert.throws(() => validateDrawDate('2026-10-14', now, 'eurodreams'), /EuroDreams est tiré le lundi et le jeudi/);
});

test("les dates proposées sont les jours de tirage du jeu, d'aujourd'hui à dans un an", () => {
  const loto = upcomingDrawDates(GAMES.loto, now);
  assert.deepEqual(loto.slice(0, 4), ['2026-10-10', '2026-10-12', '2026-10-14', '2026-10-17']);
  assert.deepEqual(upcomingDrawDates(GAMES.euromillions, now).slice(0, 3), ['2026-10-09', '2026-10-13', '2026-10-16']);
  assert.deepEqual(upcomingDrawDates(GAMES.eurodreams, now).slice(0, 3), ['2026-10-12', '2026-10-15', '2026-10-19']);
  for (const game of Object.values(GAMES)) {
    for (const date of upcomingDrawDates(game, now)) assert.equal(validateDrawDate(date, now, game.id), date);
  }
  assert.ok(loto.at(-1) <= '2027-10-09');
});

test("« aujourd'hui » s'entend à l'heure de Paris", () => {
  const tuesdayNightInParis = new Date('2026-10-12T22:30:00Z'); // mardi 13 octobre, 0 h 30 à Paris
  assert.equal(upcomingDrawDates(GAMES.euromillions, tuesdayNightInParis)[0], '2026-10-13');
  assert.throws(() => validateDrawDate('2026-10-12', tuesdayNightInParis), /passée/);
});
