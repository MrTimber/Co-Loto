import { GAMES, DEFAULT_GAME, getGame } from './games.js';

export function saveToken(roomId, token) {
  localStorage.setItem(`coloto:token:${roomId}`, token);
}

export function loadToken(roomId) {
  return localStorage.getItem(`coloto:token:${roomId}`);
}

export function forgetToken(roomId) {
  localStorage.removeItem(`coloto:token:${roomId}`);
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatDrawDate(value) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function ball(number, extra = '') {
  return `<span class="ball ${extra}">${number}</span>`;
}

export function rulesFor(gameType) {
  return getGame(gameType) ?? GAMES[DEFAULT_GAME];
}

// Le fond de page reprend le dégradé du jeu choisi.
export function applyTheme(gameType) {
  document.body.dataset.game = rulesFor(gameType).id;
}

export function countLabel(phase, n = phase.count) {
  return `${n} ${n > 1 ? phase.many : phase.one}`;
}

// « 5 numéros, puis le numéro chance », « 5 numéros, puis 2 étoiles »…
export function describeGame(rules) {
  const [numbers, bonus] = rules.phases;
  const bonusLabel = bonus.count === 1 ? 'le ' + bonus.one : countLabel(bonus);
  return `${countLabel(numbers)}, puis ${bonusLabel}`;
}

export function gridBalls(numbers, bonus) {
  return numbers.map((n) => ball(n, 'validated')).join('') + bonus.map((n) => ball(n, 'bonus')).join('');
}
