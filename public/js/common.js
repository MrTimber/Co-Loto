import { GAMES, DEFAULT_GAME, getGame } from './games.js';

// Pseudo des parties, gardé par le navigateur.
export const NAME_KEY = 'coloto:name';

// Jeton de participation à chaque partie jouée sur cet appareil.
const TOKEN_PREFIX = 'coloto:token:';

export function saveToken(roomId, token) {
  localStorage.setItem(TOKEN_PREFIX + roomId, token);
}

export function loadToken(roomId) {
  return localStorage.getItem(TOKEN_PREFIX + roomId);
}

export function forgetToken(roomId) {
  localStorage.removeItem(TOKEN_PREFIX + roomId);
}

// Les parties qui ont un jeton sur cet appareil.
export function storedTokenIds() {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(TOKEN_PREFIX))
    .map((key) => key.slice(TOKEN_PREFIX.length));
}

// Sur smartphone et tablette, le menu de partage du système (SMS, WhatsApp, email…) remplace
// le bouton « Envoyer par email ». Il fonctionne aussi dans le navigateur, pas seulement dans
// l'application installée (il demande une connexion HTTPS).
export const prefersShareSheet = () => Boolean(navigator.share) && matchMedia('(pointer: coarse)').matches;

// Construction nœud par nœud : aucune donnée reçue n'est interprétée comme du HTML.
export function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatDrawDate(value) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// « 12 octobre 2026 », pour un instant (date de création d'une grille…).
export function formatDay(value) {
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
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

// Mêmes boules que gridBalls, en nœuds.
export function ballNodes(numbers, bonus) {
  return [...numbers.map((n) => el('span', 'ball validated', String(n))), ...bonus.map((n) => el('span', 'ball bonus', String(n)))];
}

export function gridBalls(numbers, bonus) {
  return numbers.map((n) => ball(n, 'validated')).join('') + bonus.map((n) => ball(n, 'bonus')).join('');
}

// Modes des parties à distance : classique (grille garantie) ou éclair (grille complétée au besoin).
export const VARIANTS = {
  full: {
    name: 'Mode classique',
    hint: 'Chacun classe assez de numéros pour que la grille soit trouvée à coup sûr : un numéro n’y entre que si tout le monde l’a choisi. Plus long à remplir, mais la grille est un vrai consensus.',
  },
  quick: {
    name: 'Mode éclair',
    hint: 'Chacun ne classe que deux fois le nombre de numéros à trouver. Si les classements ne suffisent pas à remplir la grille, elle est complétée par les numéros choisis par le plus de joueurs, puis par les mieux classés.',
  },
};

// Modes de jeu, pour l'administration : en direct, ou à distance en mode classique ou éclair.
export const PLAY_MODES = { live: 'En direct', full: 'À distance, classique', quick: 'À distance, éclair' };

// « 16 octobre à 06:22 », pour une réponse à une partie à distance.
export function formatMoment(value) {
  const date = new Date(value);
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Places d'une partie à distance : qui a répondu et quand (les classements restent secrets).
export function seatItems(seats, mySeat) {
  return seats
    .filter((s) => !s.removed)
    .map((s) => {
      const who = s.name ? el('strong', '', s.name) : el('span', 'muted', s.seat === 0 ? 'Créateur' : `Joueur ${s.seat + 1}`);
      const tags = [];
      if (s.seat === 0) tags.push(el('span', 'tag', 'créateur'));
      if (s.seat === mySeat) tags.push(el('span', 'tag', 'vous'));
      const status = s.submittedAt
        ? el('span', 'pick-status done', `a classé ses numéros le ${formatMoment(s.submittedAt)}`)
        : el('span', 'pick-status', 'n’a pas encore répondu');
      const item = el('li', '', who, ' ', ...tags.flatMap((t) => [t, ' ']), status);
      item.dataset.seat = s.seat;
      return item;
    });
}
