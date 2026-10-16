import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, validateRanking, parisTime } from '../src/async.js';
import { GAMES, minRanking } from '../src/games.js';
import { GameError } from '../src/game.js';

const throwsCode = (fn, code) => assert.throws(fn, (err) => err instanceof GameError && err.code === code);
const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

test('minRanking garantit assez de numéros communs', () => {
  const [numbers, chance] = GAMES.loto.phases;
  assert.equal(minRanking(numbers, 2), 27);
  assert.equal(minRanking(numbers, 3), 35);
  assert.equal(minRanking(numbers, 12), 46);
  assert.equal(minRanking(chance, 2), 6);
  assert.equal(minRanking(GAMES.eurodreams.phases[1], 12), 5);
});

test('simulate valide un numéro dès qu’il est dans les k premiers de chacun', () => {
  const alice = { numbers: [1, 2, 3, 4, 5, 6], chance: [1, 2] };
  const bob = { numbers: [2, 1, 4, 3, 6, 5], chance: [2, 1] };
  const result = simulate('loto', [alice, bob]);
  assert.deepEqual(result.validated, { numbers: [1, 2, 3, 4, 5, 6], chance: [1, 2] });
  // Tour 2 : 1 et 2 ; tour 4 : 3 et 4 ; tour 6 : 5 et 6 (un de trop, gardé) ; tour 8 : 1 et 2 (chance).
  assert.deepEqual(result.validatedRounds, [
    { round: 2, phase: 'numbers', numbers: [1, 2] },
    { round: 4, phase: 'numbers', numbers: [3, 4] },
    { round: 6, phase: 'numbers', numbers: [5, 6] },
    { round: 8, phase: 'chance', numbers: [1, 2] },
  ]);
  assert.equal(result.rounds, 8);
});

test('simulate se termine toujours avec des classements de longueur minimale', () => {
  for (const [gameType, rules] of Object.entries(GAMES)) {
    for (const players of [2, 3, 5, 12]) {
      // Classements les plus défavorables : chacun commence par des numéros différents.
      const rankings = range(0, players - 1).map((i) =>
        Object.fromEntries(
          rules.phases.map((phase) => {
            const all = range(phase.min, phase.max);
            const shift = (i * Math.ceil(all.length / players)) % all.length;
            const rotated = [...all.slice(shift), ...all.slice(0, shift)];
            return [phase.key, rotated.slice(0, minRanking(phase, players))];
          }),
        ),
      );
      const result = simulate(gameType, rankings);
      assert.ok(result, `${gameType} à ${players}`);
      for (const phase of rules.phases) assert.ok(result.validated[phase.key].length >= phase.count);
    }
  }
});

test('simulate renvoie null si les classements ne suffisent pas', () => {
  assert.equal(simulate('loto', [{ numbers: [1, 2], chance: [1] }, { numbers: [3, 4], chance: [1] }]), null);
});

test('validateRanking vérifie le classement', () => {
  const numbers = range(1, 27);
  const chance = range(1, 6);
  assert.deepEqual(validateRanking('loto', { numbers, chance }, 2), { numbers, chance });
  throwsCode(() => validateRanking('loto', { numbers: numbers.slice(1), chance }, 2), 'ranking_too_short');
  throwsCode(() => validateRanking('loto', { numbers: [...numbers, 1], chance }, 2), 'invalid_ranking');
  throwsCode(() => validateRanking('loto', { numbers: [...numbers, 50], chance }, 2), 'invalid_ranking');
  throwsCode(() => validateRanking('loto', { numbers }, 2), 'invalid_ranking');
});

test('parisTime donne l’instant d’une heure de Paris', () => {
  assert.equal(new Date(parisTime('2026-10-17', '20:15')).toISOString(), '2026-10-17T18:15:00.000Z'); // heure d'été
  assert.equal(new Date(parisTime('2026-12-19', '20:15')).toISOString(), '2026-12-19T19:15:00.000Z');
});

test('classement rapide : 2 fois le nombre à trouver, grille complétée par les mieux classés', () => {
  const [numbers, chance] = GAMES.loto.phases;
  assert.equal(minRanking(numbers, 12, 'quick'), 10);
  assert.equal(minRanking(chance, 3, 'quick'), 2);
  assert.equal(minRanking(GAMES.euromillions.phases[1], 3, 'quick'), 4);
  const alice = { numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], chance: [1, 2] };
  const bob = { numbers: [1, 11, 12, 13, 14, 15, 16, 17, 18, 2], chance: [3, 4] };
  assert.equal(simulate('loto', [alice, bob]), null);
  const result = simulate('loto', [alice, bob], { complete: true });
  // 1 et 2 validés ; puis, parmi les numéros classés par un seul joueur : 11 (2e de Bob),
  // puis 3 et 12 (3es), à égalité devant 4 (4e d'Alice).
  assert.deepEqual(result.validated.numbers, [1, 2, 3, 11, 12]);
  assert.deepEqual(result.validatedRounds.at(-2), { round: null, phase: 'numbers', numbers: [3, 11, 12], completed: true });
  // Numéro chance : aucun en commun, le mieux classé l'emporte (1 et 3 ex aequo : le plus petit).
  assert.deepEqual(result.validated.chance, [1]);
  throwsCode(() => validateRanking('loto', { numbers: [1, 2, 3], chance: [1, 2] }, 2, 'quick'), 'ranking_too_short');
  assert.ok(validateRanking('loto', alice, 12, 'quick'));
});
