// Date de tirage optionnelle : chaque jeu a ses jours de tirage.
import { GAMES, DEFAULT_GAME, MAX_DRAW_DAYS_AHEAD, todayInFrance } from './games.js';

export function validateDrawDate(value, now = new Date(), gameType = DEFAULT_GAME) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('La date de tirage doit être au format AAAA-MM-JJ.');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("La date de tirage n'est pas valide.");
  }
  const game = GAMES[gameType];
  if (!game.drawWeekdays.includes(date.getUTCDay())) {
    throw new Error(`${game.theName} est tiré ${game.drawDays}.`);
  }
  const days = (date.getTime() - new Date(`${todayInFrance(now)}T00:00:00Z`).getTime()) / 86_400_000;
  if (days < 0) throw new Error('La date de tirage est déjà passée.');
  if (days > MAX_DRAW_DAYS_AHEAD) throw new Error("La date de tirage doit être dans moins d'un an.");
  return value;
}
