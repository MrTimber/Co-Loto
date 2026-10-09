// Date de tirage optionnelle : chaque jeu a ses jours de tirage.
import { GAMES, DEFAULT_GAME } from './games.js';

const MAX_DAYS_AHEAD = 365;

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
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = (date.getTime() - today) / 86_400_000;
  if (days < 0) throw new Error('La date de tirage est déjà passée.');
  if (days > MAX_DAYS_AHEAD) throw new Error("La date de tirage doit être dans moins d'un an.");
  return value;
}
