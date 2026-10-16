// Les jeux de tirage proposés. Ce module est aussi servi tel quel au navigateur (/js/games.js).
// Chaque jeu enchaîne deux phases : les numéros, puis les numéros complémentaires.
// Règles vérifiées dans les règlements homologués par l'ANJ (grille simple).
// Grilles multiples (règlements FDJ, limites confirmées sur le site de la FDJ) :
// `price` est la mise d'une combinaison simple, sans option (2nd tirage, Etoile+) ;
// `multiple` donne, pour chaque nombre de numéros cochés, le nombre maximal de numéros complémentaires.

export const GAMES = {
  loto: {
    id: 'loto',
    name: 'Loto',
    theName: 'Le Loto',
    ofName: 'de Loto',
    drawWeekdays: [1, 3, 6],
    drawDays: 'le lundi, le mercredi et le samedi',
    betsCloseAt: '20:15', // fin des prises de jeu pour le tirage du jour (heure de Paris)
    phases: [
      { key: 'numbers', min: 1, max: 49, count: 5, columns: 7, one: 'numéro', many: 'numéros' },
      { key: 'chance', min: 1, max: 10, count: 1, columns: 5, one: 'numéro chance', many: 'numéros chance' },
    ],
    price: 2.2,
    multiple: { 5: 10, 6: 10, 7: 8, 8: 3, 9: 1 },
  },
  euromillions: {
    id: 'euromillions',
    name: 'Euromillions',
    theName: "L'Euromillions",
    ofName: "d'Euromillions",
    drawWeekdays: [2, 5],
    drawDays: 'le mardi et le vendredi',
    betsCloseAt: '20:15',
    phases: [
      { key: 'numbers', min: 1, max: 50, count: 5, columns: 7, one: 'numéro', many: 'numéros' },
      { key: 'stars', min: 1, max: 12, count: 2, columns: 6, one: 'étoile', many: 'étoiles', feminine: true },
    ],
    price: 2.5, // My Million compris
    multiple: { 5: 12, 6: 12, 7: 6, 8: 4, 9: 3, 10: 2 },
  },
  eurodreams: {
    id: 'eurodreams',
    name: 'EuroDreams',
    theName: 'EuroDreams',
    ofName: "d'EuroDreams",
    drawWeekdays: [1, 4],
    drawDays: 'le lundi et le jeudi',
    betsCloseAt: '20:00',
    phases: [
      { key: 'numbers', min: 1, max: 40, count: 6, columns: 8, one: 'numéro', many: 'numéros' },
      { key: 'dream', min: 1, max: 5, count: 1, columns: 5, one: 'numéro Dream', many: 'numéros Dream' },
    ],
    price: 2.5,
    multiple: { 6: 5, 7: 5, 8: 5, 9: 3, 10: 1 },
  },
};

export const DEFAULT_GAME = 'loto';

export function getGame(id) {
  return Object.hasOwn(GAMES, id) ? GAMES[id] : null;
}

export function findPhase(game, key) {
  return game.phases.find((p) => p.key === key) ?? null;
}

// Partie à distance : chaque joueur classe au moins ce nombre de numéros de la phase, par ordre
// de préférence. Classement complet (`full`) : avec `players` classements de cette longueur, au
// moins `count` numéros sont communs à tous, la partie simulée tour par tour se termine donc à coup
// sûr. Classement rapide (`quick`) : deux fois le nombre à trouver ; la grille est complétée si la
// simulation ne suffit pas (voir async.js).
export const RANKING_VARIANTS = ['full', 'quick'];

export function minRanking(phase, players, variant = 'full') {
  const size = phase.max - phase.min + 1;
  if (variant === 'quick') return Math.min(size, 2 * phase.count);
  return Math.min(size, Math.ceil((phase.count + (players - 1) * size) / players));
}

function binomial(n, k) {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

// Ce que coûte une grille de `numbers` numéros et `bonus` numéros complémentaires :
// une grille multiple équivaut à toutes les grilles simples qu'on peut y former.
// `status` : simple, multiple, too_few (pas assez de numéros) ou not_allowed (au-delà des limites du jeu).
export function gridCost(game, numbers, bonus) {
  const [main, extra] = game.phases;
  if (numbers < main.count || bonus < extra.count) return { status: 'too_few' };
  if (numbers === main.count && bonus === extra.count) return { status: 'simple', combinations: 1, price: game.price };
  if (!(bonus <= (game.multiple[numbers] ?? 0))) return { status: 'not_allowed' };
  const combinations = binomial(numbers, main.count) * binomial(bonus, extra.count);
  return { status: 'multiple', combinations, price: Math.round(combinations * game.price * 100) / 100 };
}

// Les tirages ont lieu en France : « aujourd'hui » s'entend à l'heure de Paris.
export const MAX_DRAW_DAYS_AHEAD = 365;

export function todayInFrance(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

// Prochain tirage auquel une grille peut encore être jouée à l'instant `now` : celui du jour
// jusqu'à la fin des prises de jeu, sinon le suivant (AAAA-MM-JJ).
export function nextDrawDate(game, now = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const start = new Date(`${todayInFrance(now)}T00:00:00Z`);
  for (let day = time < game.betsCloseAt ? 0 : 1; ; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);
    if (game.drawWeekdays.includes(date.getUTCDay())) return date.toISOString().slice(0, 10);
  }
}

// Les dates de tirage du jeu (AAAA-MM-JJ), d'aujourd'hui à dans un an.
export function upcomingDrawDates(game, now = new Date()) {
  const start = new Date(`${todayInFrance(now)}T00:00:00Z`);
  const dates = [];
  for (let day = 0; day <= MAX_DRAW_DAYS_AHEAD; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);
    if (game.drawWeekdays.includes(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}
