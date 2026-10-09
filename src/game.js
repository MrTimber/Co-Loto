// Logique de jeu de Co-Loto, sans aucune dépendance réseau.
// Toutes les fonctions modifient l'objet `game` passé en paramètre.

import { GAMES, DEFAULT_GAME, getGame, findPhase } from './games.js';

export { GAMES, DEFAULT_GAME };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS_LIMIT = 12;
export const DEFAULT_MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 24;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const emptyPicks = (rules) => Object.fromEntries(rules.phases.map((p) => [p.key, []]));
const copyPicks = (picks) => Object.fromEntries(Object.entries(picks).map(([key, list]) => [key, [...list]]));

export function createGame({ gameType = DEFAULT_GAME, maxPlayers = DEFAULT_MAX_PLAYERS, visibility = 'private', drawDate = null } = {}) {
  const rules = getGame(gameType);
  if (!rules) throw new GameError('invalid_game_type', 'Choisissez le Loto, l’Euromillions ou EuroDreams.');
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS_LIMIT) {
    throw new GameError('invalid_max_players', `Le nombre de joueurs doit être compris entre ${MIN_PLAYERS} et ${MAX_PLAYERS_LIMIT}.`);
  }
  if (visibility !== 'public' && visibility !== 'private') {
    throw new GameError('invalid_visibility', 'La visibilité doit être « public » ou « private ».');
  }
  return {
    status: 'lobby', // lobby | playing | finished | abandoned
    gameType,
    phase: null, // clé d'une des phases du jeu (numbers, puis chance, stars ou dream)
    round: 0,
    maxPlayers,
    visibility,
    drawDate,
    hostId: null,
    players: [],
    validated: emptyPicks(rules),
    lastRound: null,
    rounds: [],
  };
}

export function normalizeName(name) {
  if (typeof name !== 'string') throw new GameError('invalid_name', 'Le pseudo est obligatoire.');
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new GameError('invalid_name', 'Le pseudo est obligatoire.');
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new GameError('invalid_name', `Le pseudo ne doit pas dépasser ${MAX_NAME_LENGTH} caractères.`);
  }
  return trimmed;
}

export function findPlayer(game, playerId) {
  return game.players.find((p) => p.id === playerId) ?? null;
}

export function addPlayer(game, { id, name }) {
  if (game.status !== 'lobby') throw new GameError('already_started', 'La partie a déjà commencé.');
  if (game.players.length >= game.maxPlayers) throw new GameError('room_full', 'Le salon est complet.');
  const cleanName = normalizeName(name);
  if (game.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new GameError('name_taken', 'Ce pseudo est déjà utilisé dans ce salon.');
  }
  const player = { id, name: cleanName, picks: emptyPicks(GAMES[game.gameType]), pending: null };
  game.players.push(player);
  if (!game.hostId) game.hostId = id;
  return player;
}

export function startGame(game, playerId) {
  if (game.status !== 'lobby') throw new GameError('already_started', 'La partie a déjà commencé.');
  if (game.hostId !== playerId) throw new GameError('not_host', 'Seul le créateur du salon peut lancer la partie.');
  if (game.players.length < MIN_PLAYERS) {
    throw new GameError('not_enough_players', `Il faut au moins ${MIN_PLAYERS} joueurs pour lancer la partie.`);
  }
  game.status = 'playing';
  game.phase = GAMES[game.gameType].phases[0].key;
  game.round = 1;
}

// Enregistre (ou remplace) le choix du joueur pour le tour en cours.
// Quand tous les joueurs ont choisi, le tour est évalué.
export function pick(game, playerId, number) {
  if (game.status !== 'playing') throw new GameError('not_playing', "La partie n'est pas en cours.");
  const player = findPlayer(game, playerId);
  if (!player) throw new GameError('not_a_player', 'Vous ne participez pas à cette partie.');
  const { min, max } = phaseRules(game);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new GameError('invalid_number', `Choisissez un numéro entre ${min} et ${max}.`);
  }
  if (player.picks[game.phase].includes(number)) {
    throw new GameError('already_picked', 'Vous avez déjà choisi ce numéro.');
  }
  player.pending = number;
  return maybeEndRound(game);
}

export function removePlayer(game, playerId) {
  const index = game.players.findIndex((p) => p.id === playerId);
  if (index === -1) return null;
  game.players.splice(index, 1);
  if (game.hostId === playerId) game.hostId = game.players[0]?.id ?? null;
  if (game.status === 'playing') {
    if (game.players.length === 0) {
      game.status = 'abandoned';
      return null;
    }
    return maybeEndRound(game);
  }
  return null;
}

function maybeEndRound(game) {
  if (game.players.some((p) => p.pending === null)) return null;
  return endRound(game);
}

function endRound(game) {
  const phase = game.phase;
  const roundPicks = {};
  for (const player of game.players) {
    player.picks[phase].push(player.pending);
    roundPicks[player.id] = player.pending;
    player.pending = null;
  }

  const validated = game.validated[phase];
  const candidates = commonPicks(game.players, phase).filter((n) => !validated.includes(n));
  const { count } = phaseRules(game);
  // Plusieurs numéros peuvent devenir unanimes au même tour : ils sont tous gardés, même
  // au-delà du nombre prévu. Les joueurs choisiront à la fin de jouer une grille multiple
  // ou d'écarter les numéros en trop.
  const newlyValidated = candidates;
  validated.push(...newlyValidated);
  validated.sort((a, b) => a - b);

  const result = { round: game.round, phase, picks: roundPicks, newlyValidated: [...newlyValidated].sort((a, b) => a - b) };
  game.rounds.push(result);
  game.lastRound = result;

  if (validated.length >= count) {
    const phases = GAMES[game.gameType].phases;
    const next = phases[phases.findIndex((p) => p.key === phase) + 1];
    if (next) {
      game.phase = next.key;
    } else {
      game.status = 'finished';
      game.phase = null;
      return result;
    }
  }
  game.round += 1;
  return result;
}

function phaseRules(game) {
  return findPhase(GAMES[game.gameType], game.phase);
}

export function commonPicks(players, phase) {
  if (players.length === 0) return [];
  const [first, ...others] = players;
  return first.picks[phase].filter((n) => others.every((p) => p.picks[phase].includes(n))).sort((a, b) => a - b);
}

// Vue de la partie envoyée à un joueur : les choix des autres restent secrets.
export function viewFor(game, viewerId) {
  const me = findPlayer(game, viewerId);
  return {
    status: game.status,
    gameType: game.gameType,
    phase: game.phase,
    round: game.round,
    maxPlayers: game.maxPlayers,
    visibility: game.visibility,
    drawDate: game.drawDate,
    hostId: game.hostId,
    players: game.players.map((p) => ({ id: p.id, name: p.name, hasPicked: p.pending !== null })),
    validated: copyPicks(game.validated),
    lastRound: game.lastRound
      ? { round: game.lastRound.round, phase: game.lastRound.phase, newlyValidated: game.lastRound.newlyValidated }
      : null,
    me: me ? { id: me.id, name: me.name, picks: copyPicks(me.picks), pending: me.pending } : null,
  };
}
