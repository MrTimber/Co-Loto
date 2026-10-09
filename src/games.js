// Les jeux de tirage proposés. Ce module est aussi servi tel quel au navigateur (/js/games.js).
// Chaque jeu enchaîne deux phases : les numéros, puis les numéros complémentaires.
// Règles vérifiées dans les règlements homologués par l'ANJ (grille simple).

export const GAMES = {
  loto: {
    id: 'loto',
    name: 'Loto',
    theName: 'Le Loto',
    ofName: 'de Loto',
    drawWeekdays: [1, 3, 6],
    drawDays: 'le lundi, le mercredi et le samedi',
    phases: [
      { key: 'numbers', min: 1, max: 49, count: 5, columns: 7, one: 'numéro', many: 'numéros' },
      { key: 'chance', min: 1, max: 10, count: 1, columns: 5, one: 'numéro chance', many: 'numéros chance' },
    ],
  },
  euromillions: {
    id: 'euromillions',
    name: 'Euromillions',
    theName: "L'Euromillions",
    ofName: "d'Euromillions",
    drawWeekdays: [2, 5],
    drawDays: 'le mardi et le vendredi',
    phases: [
      { key: 'numbers', min: 1, max: 50, count: 5, columns: 7, one: 'numéro', many: 'numéros' },
      { key: 'stars', min: 1, max: 12, count: 2, columns: 6, one: 'étoile', many: 'étoiles', feminine: true },
    ],
  },
  eurodreams: {
    id: 'eurodreams',
    name: 'EuroDreams',
    theName: 'EuroDreams',
    ofName: "d'EuroDreams",
    drawWeekdays: [1, 4],
    drawDays: 'le lundi et le jeudi',
    phases: [
      { key: 'numbers', min: 1, max: 40, count: 6, columns: 8, one: 'numéro', many: 'numéros' },
      { key: 'dream', min: 1, max: 5, count: 1, columns: 5, one: 'numéro Dream', many: 'numéros Dream' },
    ],
  },
};

export const DEFAULT_GAME = 'loto';

export function getGame(id) {
  return Object.hasOwn(GAMES, id) ? GAMES[id] : null;
}

export function findPhase(game, key) {
  return game.phases.find((p) => p.key === key) ?? null;
}

// Les tirages ont lieu en France : « aujourd'hui » s'entend à l'heure de Paris.
export const MAX_DRAW_DAYS_AHEAD = 365;

export function todayInFrance(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
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
