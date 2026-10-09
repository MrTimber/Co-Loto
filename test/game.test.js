import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startGame, pick, removePlayer, viewFor, commonPicks, GameError } from '../src/game.js';
import { GAMES, gridCost } from '../src/games.js';

function setup(names = ['Alice', 'Bob'], options = {}) {
  const game = createGame({ maxPlayers: Math.max(3, names.length), ...options });
  for (const name of names) addPlayer(game, { id: name.toLowerCase(), name });
  return game;
}

// Joue un tour : chaque joueur choisit le numéro indiqué.
function playRound(game, picks) {
  let result = null;
  for (const [id, n] of Object.entries(picks)) result = pick(game, id, n) ?? result;
  return result;
}

const throwsCode = (fn, code) => assert.throws(fn, (err) => err instanceof GameError && err.code === code);

test('createGame valide le nombre de joueurs (2 à 12, 12 par défaut)', () => {
  assert.equal(createGame().maxPlayers, 12);
  assert.equal(createGame({ maxPlayers: 12 }).maxPlayers, 12);
  throwsCode(() => createGame({ maxPlayers: 1 }), 'invalid_max_players');
  throwsCode(() => createGame({ maxPlayers: 13 }), 'invalid_max_players');
  throwsCode(() => createGame({ maxPlayers: 2.5 }), 'invalid_max_players');
});

test('le premier joueur devient le créateur et le salon a une capacité maximale', () => {
  const game = createGame({ maxPlayers: 2 });
  addPlayer(game, { id: 'a', name: 'Alice' });
  addPlayer(game, { id: 'b', name: 'Bob' });
  assert.equal(game.hostId, 'a');
  throwsCode(() => addPlayer(game, { id: 'c', name: 'Chloé' }), 'room_full');
});

test('les pseudos sont nettoyés et doivent être uniques', () => {
  const game = createGame();
  assert.equal(addPlayer(game, { id: 'a', name: '  Alice   Martin ' }).name, 'Alice Martin');
  throwsCode(() => addPlayer(game, { id: 'b', name: 'alice martin' }), 'name_taken');
  throwsCode(() => addPlayer(game, { id: 'c', name: '   ' }), 'invalid_name');
  throwsCode(() => addPlayer(game, { id: 'd', name: 'x'.repeat(25) }), 'invalid_name');
});

test('seul le créateur peut lancer la partie, à partir de 2 joueurs', () => {
  const game = setup(['Alice']);
  throwsCode(() => startGame(game, 'alice'), 'not_enough_players');
  addPlayer(game, { id: 'bob', name: 'Bob' });
  throwsCode(() => startGame(game, 'bob'), 'not_host');
  startGame(game, 'alice');
  assert.equal(game.status, 'playing');
  assert.equal(game.phase, 'numbers');
  assert.equal(game.round, 1);
  throwsCode(() => addPlayer(game, { id: 'c', name: 'Chloé' }), 'already_started');
});

test('un tour se termine quand tous les joueurs ont choisi', () => {
  const game = setup();
  startGame(game, 'alice');
  assert.equal(pick(game, 'alice', 7), null);
  assert.equal(game.round, 1);
  const result = pick(game, 'bob', 12);
  assert.deepEqual(result.picks, { alice: 7, bob: 12 });
  assert.deepEqual(result.newlyValidated, []);
  assert.equal(game.round, 2);
});

test("un joueur peut changer d'avis tant que le tour n'est pas terminé", () => {
  const game = setup();
  startGame(game, 'alice');
  pick(game, 'alice', 7);
  pick(game, 'alice', 8);
  pick(game, 'bob', 8);
  assert.deepEqual(game.validated.numbers, [8]);
  assert.deepEqual(game.players[0].picks.numbers, [8]);
});

test('un numéro ne peut pas être choisi deux fois par le même joueur, ni hors limites', () => {
  const game = setup();
  startGame(game, 'alice');
  playRound(game, { alice: 7, bob: 12 });
  throwsCode(() => pick(game, 'alice', 7), 'already_picked');
  throwsCode(() => pick(game, 'alice', 0), 'invalid_number');
  throwsCode(() => pick(game, 'alice', 50), 'invalid_number');
  throwsCode(() => pick(game, 'alice', '5'), 'invalid_number');
  throwsCode(() => pick(game, 'zoé', 5), 'not_a_player');
});

test('un numéro choisi par tous, tous tours confondus, est validé', () => {
  const game = setup(['Alice', 'Bob', 'Chloé']);
  startGame(game, 'alice');
  playRound(game, { alice: 7, bob: 12, chloé: 30 });
  playRound(game, { alice: 12, bob: 30, chloé: 1 });
  assert.deepEqual(game.validated.numbers, []);
  const result = playRound(game, { alice: 30, bob: 2, chloé: 3 });
  assert.deepEqual(result.newlyValidated, [30]);
  assert.deepEqual(game.validated.numbers, [30]);
  assert.deepEqual(commonPicks(game.players, 'numbers'), [30]);
});

test('après 5 numéros, la partie passe au numéro chance puis se termine', () => {
  const game = setup();
  startGame(game, 'alice');
  for (const n of [5, 9, 23, 41, 49]) playRound(game, { alice: n, bob: n });
  assert.deepEqual(game.validated.numbers, [5, 9, 23, 41, 49]);
  assert.equal(game.phase, 'chance');
  assert.equal(game.status, 'playing');
  // Les numéros chance vont de 1 à 10, et les choix repartent de zéro.
  throwsCode(() => pick(game, 'alice', 11), 'invalid_number');
  playRound(game, { alice: 5, bob: 3 });
  assert.equal(game.status, 'playing');
  playRound(game, { alice: 3, bob: 10 });
  assert.equal(game.status, 'finished');
  assert.equal(game.phase, null);
  assert.deepEqual(game.validated.chance, [3]);
  assert.equal(game.rounds.length, 7);
  throwsCode(() => pick(game, 'alice', 4), 'not_playing');
});

test('les numéros unanimes au même tour sont tous gardés, même au-delà du nombre prévu', () => {
  const game = setup();
  startGame(game, 'alice');
  for (const n of [1, 2, 3, 4]) playRound(game, { alice: n, bob: n });
  playRound(game, { alice: 10, bob: 20 });
  // Au tour suivant, 10 et 20 deviennent unanimes en même temps alors qu'il ne reste qu'une place.
  const result = playRound(game, { alice: 20, bob: 10 });
  assert.deepEqual(result.newlyValidated, [10, 20]);
  assert.deepEqual(game.validated.numbers, [1, 2, 3, 4, 10, 20]);
  assert.equal(game.phase, 'chance');
  // De même pour les numéros chance : la partie se termine avec les deux.
  playRound(game, { alice: 3, bob: 7 });
  playRound(game, { alice: 7, bob: 3 });
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.validated.chance, [3, 7]);
});

test('le départ d’un joueur débloque le tour si tous les autres ont choisi', () => {
  const game = setup(['Alice', 'Bob', 'Chloé']);
  startGame(game, 'alice');
  pick(game, 'alice', 7);
  pick(game, 'bob', 7);
  const result = removePlayer(game, 'chloé');
  assert.deepEqual(result.newlyValidated, [7]);
  assert.equal(game.round, 2);
});

test('le départ d’un joueur peut rendre unanime un numéro déjà choisi par les autres', () => {
  const game = setup(['Alice', 'Bob', 'Chloé']);
  startGame(game, 'alice');
  playRound(game, { alice: 7, bob: 7, chloé: 8 });
  pick(game, 'alice', 9);
  pick(game, 'bob', 9);
  const result = removePlayer(game, 'chloé');
  assert.deepEqual(result.newlyValidated, [7, 9]);
});

test('le rôle de créateur est transmis si le créateur part, et la partie est abandonnée si tout le monde part', () => {
  const game = setup(['Alice', 'Bob']);
  removePlayer(game, 'alice');
  assert.equal(game.hostId, 'bob');
  addPlayer(game, { id: 'chloé', name: 'Chloé' });
  startGame(game, 'bob');
  removePlayer(game, 'bob');
  removePlayer(game, 'chloé');
  assert.equal(game.status, 'abandoned');
});

test('la vue d’un joueur cache les choix des autres', () => {
  const game = setup();
  startGame(game, 'alice');
  playRound(game, { alice: 7, bob: 12 });
  pick(game, 'bob', 30);
  const view = viewFor(game, 'alice');
  assert.deepEqual(view.me.picks.numbers, [7]);
  assert.equal(view.me.pending, null);
  assert.deepEqual(
    view.players.map((p) => [p.name, p.hasPicked]),
    [
      ['Alice', false],
      ['Bob', true],
    ],
  );
  assert.equal(JSON.stringify(view).includes('30'), false);
  assert.equal(view.lastRound.picks, undefined);
});

test('le type de jeu est validé, le Loto par défaut', () => {
  assert.equal(createGame().gameType, 'loto');
  throwsCode(() => createGame({ gameType: 'keno' }), 'invalid_game_type');
  throwsCode(() => createGame({ gameType: 'toString' }), 'invalid_game_type');
});

test('Euromillions : 5 numéros de 1 à 50, puis 2 étoiles de 1 à 12', () => {
  const game = setup(['Alice', 'Bob'], { gameType: 'euromillions' });
  startGame(game, 'alice');
  for (const n of [1, 12, 23, 34, 50]) playRound(game, { alice: n, bob: n });
  assert.deepEqual(game.validated.numbers, [1, 12, 23, 34, 50]);
  assert.equal(game.phase, 'stars');
  throwsCode(() => pick(game, 'alice', 13), 'invalid_number');
  playRound(game, { alice: 12, bob: 12 });
  assert.equal(game.status, 'playing');
  assert.equal(game.phase, 'stars');
  playRound(game, { alice: 3, bob: 3 });
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.validated.stars, [3, 12]);
  assert.deepEqual(viewFor(game, 'alice').validated, { numbers: [1, 12, 23, 34, 50], stars: [3, 12] });
});

test('EuroDreams : 6 numéros de 1 à 40, puis 1 numéro Dream de 1 à 5', () => {
  const game = setup(['Alice', 'Bob'], { gameType: 'eurodreams' });
  startGame(game, 'alice');
  throwsCode(() => pick(game, 'alice', 41), 'invalid_number');
  for (const n of [2, 4, 8, 16, 32]) playRound(game, { alice: n, bob: n });
  assert.equal(game.phase, 'numbers');
  playRound(game, { alice: 40, bob: 40 });
  assert.equal(game.phase, 'dream');
  throwsCode(() => pick(game, 'alice', 6), 'invalid_number');
  playRound(game, { alice: 5, bob: 5 });
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.validated, { numbers: [2, 4, 8, 16, 32, 40], dream: [5] });
});

test('gridCost : grille simple, grille multiple et limites de chaque jeu (règlements FDJ)', () => {
  const { loto, euromillions, eurodreams } = GAMES;
  assert.deepEqual(gridCost(loto, 5, 1), { status: 'simple', combinations: 1, price: 2.2 });
  assert.deepEqual(gridCost(loto, 8, 3), { status: 'multiple', combinations: 168, price: 369.6 });
  assert.equal(gridCost(loto, 9, 2).status, 'not_allowed');
  assert.equal(gridCost(loto, 10, 1).status, 'not_allowed');
  assert.equal(gridCost(loto, 4, 1).status, 'too_few');
  assert.deepEqual(gridCost(euromillions, 6, 12), { status: 'multiple', combinations: 396, price: 990 });
  assert.deepEqual(gridCost(euromillions, 10, 2), { status: 'multiple', combinations: 252, price: 630 });
  assert.equal(gridCost(euromillions, 7, 7).status, 'not_allowed');
  assert.equal(gridCost(euromillions, 5, 1).status, 'too_few');
  assert.deepEqual(gridCost(eurodreams, 7, 2), { status: 'multiple', combinations: 14, price: 35 });
  assert.deepEqual(gridCost(eurodreams, 9, 3), { status: 'multiple', combinations: 252, price: 630 });
  assert.deepEqual(gridCost(eurodreams, 10, 1), { status: 'multiple', combinations: 210, price: 525 });
  assert.equal(gridCost(eurodreams, 10, 2).status, 'not_allowed');
});
