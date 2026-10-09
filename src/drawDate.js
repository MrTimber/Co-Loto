// Date de tirage optionnelle : le Loto est tiré les lundis, mercredis et samedis.
export const DRAW_WEEKDAYS = [1, 3, 6];
const MAX_DAYS_AHEAD = 365;

export function validateDrawDate(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('La date de tirage doit être au format AAAA-MM-JJ.');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("La date de tirage n'est pas valide.");
  }
  if (!DRAW_WEEKDAYS.includes(date.getUTCDay())) {
    throw new Error('Le Loto est tiré le lundi, le mercredi et le samedi.');
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = (date.getTime() - today) / 86_400_000;
  if (days < 0) throw new Error('La date de tirage est déjà passée.');
  if (days > MAX_DAYS_AHEAD) throw new Error("La date de tirage doit être dans moins d'un an.");
  return value;
}
