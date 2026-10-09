// Logique de jeu de Co-Loto, sans aucune dépendance réseau.
// Toutes les fonctions modifient l'objet `game` passé en paramètre.

export const PHASES = {
  numbers: { min: 1, max: 49, count: 5 },
  chance: { min: 1, max: 10, count: 1 },
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS_LIMIT = 12;
export const DEFAULT_MAX_PLAYERS = 3;
export const MAX_NAME_LENGTH = 24;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createGame({ maxPlayers = DEFAULT_MAX_PLAYERS, visibility = 'private', drawDate = null } = {}) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS_LIMIT) {
    throw new GameError('invalid_max_players', `Le nombre de joueurs doit être compris entre ${MIN_PLAYERS} et ${MAX_PLAYERS_LIMIT}.`);
  }
  if (visibility !== 'public' && visibility !== 'private') {
    throw new GameError('invalid_visibility', 'La visibilité doit être « public » ou « private ».');
  }
  return {
    status: 'lobby', // lobby | playing | finished | abandoned
    phase: null, // numbers | chance
    round: 0,
    maxPlayers,
    visibility,
    drawDate,
    hostId: null,
    players: [],
    validated: { numbers: [], chance: [] },
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
  const player = { id, name: cleanName, picks: { numbers: [], chance: [] }, pending: null };
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
  game.phase = 'numbers';
  game.round = 1;
}

// Enregistre (ou remplace) le choix du joueur pour le tour en cours.
// Quand tous les joueurs ont choisi, le tour est évalué.
export function pick(game, playerId, number, rng = Math.random) {
  if (game.status !== 'playing') throw new GameError('not_playing', "La partie n'est pas en cours.");
  const player = findPlayer(game, playerId);
  if (!player) throw new GameError('not_a_player', 'Vous ne participez pas à cette partie.');
  const { min, max } = PHASES[game.phase];
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new GameError('invalid_number', `Choisissez un numéro entre ${min} et ${max}.`);
  }
  if (player.picks[game.phase].includes(number)) {
    throw new GameError('already_picked', 'Vous avez déjà choisi ce numéro.');
  }
  player.pending = number;
  return maybeEndRound(game, rng);
}

export function removePlayer(game, playerId, rng = Math.random) {
  const index = game.players.findIndex((p) => p.id === playerId);
  if (index === -1) return null;
  game.players.splice(index, 1);
  if (game.hostId === playerId) game.hostId = game.players[0]?.id ?? null;
  if (game.status === 'playing') {
    if (game.players.length === 0) {
      game.status = 'abandoned';
      return null;
    }
    return maybeEndRound(game, rng);
  }
  return null;
}

function maybeEndRound(game, rng) {
  if (game.players.some((p) => p.pending === null)) return null;
  return endRound(game, rng);
}

function endRound(game, rng) {
  const phase = game.phase;
  const roundPicks = {};
  for (const player of game.players) {
    player.picks[phase].push(player.pending);
    roundPicks[player.id] = player.pending;
    player.pending = null;
  }

  const validated = game.validated[phase];
  const candidates = commonPicks(game.players, phase).filter((n) => !validated.includes(n));
  const slots = PHASES[phase].count - validated.length;
  // Plusieurs numéros peuvent devenir unanimes au même tour : s'il y en a plus
  // que de places restantes, un tirage au sort départage les candidats.
  const newlyValidated = candidates.length > slots ? shuffle(candidates, rng).slice(0, slots) : candidates;
  validated.push(...newlyValidated);
  validated.sort((a, b) => a - b);

  const result = { round: game.round, phase, picks: roundPicks, newlyValidated: [...newlyValidated].sort((a, b) => a - b) };
  game.rounds.push(result);
  game.lastRound = result;

  if (validated.length >= PHASES[phase].count) {
    if (phase === 'numbers') {
      game.phase = 'chance';
    } else {
      game.status = 'finished';
      game.phase = null;
      return result;
    }
  }
  game.round += 1;
  return result;
}

export function commonPicks(players, phase) {
  if (players.length === 0) return [];
  const [first, ...others] = players;
  return first.picks[phase].filter((n) => others.every((p) => p.picks[phase].includes(n))).sort((a, b) => a - b);
}

function shuffle(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Vue de la partie envoyée à un joueur : les choix des autres restent secrets.
export function viewFor(game, viewerId) {
  const me = findPlayer(game, viewerId);
  return {
    status: game.status,
    phase: game.phase,
    round: game.round,
    maxPlayers: game.maxPlayers,
    visibility: game.visibility,
    drawDate: game.drawDate,
    hostId: game.hostId,
    players: game.players.map((p) => ({ id: p.id, name: p.name, hasPicked: p.pending !== null })),
    validated: { numbers: [...game.validated.numbers], chance: [...game.validated.chance] },
    lastRound: game.lastRound
      ? { round: game.lastRound.round, phase: game.lastRound.phase, newlyValidated: game.lastRound.newlyValidated }
      : null,
    me: me ? { id: me.id, name: me.name, picks: { numbers: [...me.picks.numbers], chance: [...me.picks.chance] }, pending: me.pending } : null,
  };
}
