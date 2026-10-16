// Règles des parties à distance (asynchrones), sans aucune dépendance réseau.
// Chaque joueur classe des numéros par ordre de préférence ; la partie est ensuite simulée
// tour par tour, comme une partie en direct où chacun jouerait ses numéros dans cet ordre.

import { GAMES, getGame, minRanking, RANKING_VARIANTS } from './games.js';
import { GameError, MIN_PLAYERS, MAX_PLAYERS_LIMIT } from './game.js';

export const DEFAULT_ASYNC_PLAYERS = 3;

export function validatePlayerCount(players) {
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS_LIMIT) {
    throw new GameError('invalid_players', `Le nombre de joueurs doit être compris entre ${MIN_PLAYERS} et ${MAX_PLAYERS_LIMIT}.`);
  }
  return players;
}

export function validateVariant(variant) {
  if (!RANKING_VARIANTS.includes(variant)) throw new GameError('invalid_variant', 'Choisissez le classement complet ou le classement rapide.');
  return variant;
}

export function validateGameType(gameType) {
  if (!getGame(gameType)) throw new GameError('invalid_game_type', 'Choisissez le Loto, l’Euromillions ou EuroDreams.');
  return gameType;
}

// Vérifie le classement d'un joueur pour une partie de `players` joueurs : pour chaque phase,
// des numéros distincts du jeu, au moins le minimum demandé. Renvoie le classement nettoyé.
export function validateRanking(gameType, ranking, players, variant = 'full') {
  const rules = GAMES[gameType];
  const clean = {};
  for (const phase of rules.phases) {
    const list = ranking?.[phase.key];
    if (!Array.isArray(list)) throw new GameError('invalid_ranking', `Classez vos ${phase.many}.`);
    if (list.some((n) => !Number.isInteger(n) || n < phase.min || n > phase.max)) {
      throw new GameError('invalid_ranking', `Les ${phase.many} vont de ${phase.min} à ${phase.max}.`);
    }
    if (new Set(list).size !== list.length) {
      throw new GameError('invalid_ranking', `Chaque ${phase.one} ne peut être classé${phase.feminine ? 'e' : ''} qu'une fois.`);
    }
    const min = minRanking(phase, players, variant);
    if (list.length < min) {
      throw new GameError('ranking_too_short', `Classez au moins ${min} ${phase.many} (vous en avez classé ${list.length}).`);
    }
    clean[phase.key] = [...list];
  }
  return clean;
}

// Simule la partie : au tour k, chaque joueur joue le k-ième numéro de son classement. Un numéro
// est validé dès qu'il figure dans les k premiers de tous les joueurs. Comme en direct, plusieurs
// numéros validés au même tour sont tous gardés, et les numéros complémentaires suivent les numéros
// (les tours continuent d'être comptés). Si les classements ne suffisent pas : avec `complete`
// (classement rapide), les places restantes vont aux numéros classés par le plus de joueurs, puis
// au meilleur rang moyen, puis au plus petit ; sinon la simulation renvoie null.
export function simulate(gameType, rankings, { complete = false } = {}) {
  const rules = GAMES[gameType];
  const validated = {};
  const validatedRounds = []; // tours où des numéros ont été validés : { round, phase, numbers }
  let round = 0;
  for (const phase of rules.phases) {
    const lists = rankings.map((r) => r[phase.key]);
    const seen = lists.map(() => new Set());
    const found = [];
    for (let k = 0; found.length < phase.count; k++) {
      if (lists.every((list) => k >= list.length)) {
        if (!complete) return null;
        const extra = bestRanked(lists, found).slice(0, phase.count - found.length);
        if (extra.length < phase.count - found.length) return null;
        found.push(...extra);
        validatedRounds.push({ round: null, phase: phase.key, numbers: [...extra].sort((a, b) => a - b), completed: true });
        break;
      }
      round += 1;
      lists.forEach((list, i) => {
        if (k < list.length) seen[i].add(list[k]);
      });
      const newly = [...seen[0]].filter((n) => !found.includes(n) && seen.every((s) => s.has(n))).sort((a, b) => a - b);
      if (newly.length) {
        found.push(...newly);
        validatedRounds.push({ round, phase: phase.key, numbers: newly });
      }
    }
    validated[phase.key] = found.sort((a, b) => a - b);
  }
  return { validated, rounds: round, validatedRounds };
}

// Numéros classés par au moins un joueur et pas encore validés, du mieux au moins bien classé.
function bestRanked(lists, excluded) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((n, rank) => {
      if (excluded.includes(n)) return;
      const score = scores.get(n) ?? { players: 0, ranks: 0 };
      score.players += 1;
      score.ranks += rank;
      scores.set(n, score);
    });
  }
  return [...scores]
    .sort(([a, sa], [b, sb]) => sb.players - sa.players || sa.ranks / sa.players - sb.ranks / sb.players || a - b)
    .map(([n]) => n);
}

// Instant (en millisecondes) d'une heure de Paris, par exemple la fin des prises de jeu d'un tirage.
export function parisTime(date, time) {
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(asUtc)
      .map((p) => [p.type, p.value]),
  );
  const wallClock = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return asUtc - (wallClock - asUtc);
}
