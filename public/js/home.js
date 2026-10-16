import { saveToken, formatDrawDate, escapeHtml, rulesFor, applyTheme, describeGame, countLabel, VARIANTS, NAME_KEY } from './common.js';
import { GAMES, upcomingDrawDates, minRanking } from './games.js';

const form = document.getElementById('create-form');
const errorBox = document.getElementById('create-error');
const select = form.elements.maxPlayers;

for (let n = 2; n <= 12; n++) select.add(new Option(`${n} joueurs`, n, n === 12, n === 12));
for (let n = 2; n <= 12; n++) form.elements.players.add(new Option(`${n} joueurs`, n, n === 3, n === 3));
form.elements.name.value = localStorage.getItem(NAME_KEY) ?? '';

// Le formulaire en cours de saisie est gardé pendant la session : revenir à l'accueil
// (par le logo, par exemple) ne ramène pas au Loto et n'efface pas les choix déjà faits.
const DRAFT_KEY = 'coloto:create-form';
const DRAFT_FIELDS = ['mode', 'name', 'gameType', 'maxPlayers', 'players', 'variant', 'visibility', 'drawDate'];
function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) ?? {};
  } catch {
    return {};
  }
}
function saveDraft() {
  const data = Object.fromEntries(new FormData(form));
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(DRAFT_FIELDS.map((key) => [key, data[key]]))));
  } catch {
    // stockage indisponible (navigation privée…) : le formulaire repart de zéro
  }
}
// Une valeur n'est reprise que si elle figure parmi les choix proposés.
function restoreField(key, value) {
  const field = form.elements[key];
  if (typeof value !== 'string') return;
  if (field instanceof RadioNodeList) {
    const radio = [...field].find((r) => r.value === value);
    if (radio) radio.checked = true;
  } else if (field instanceof HTMLSelectElement) {
    if ([...field.options].some((o) => o.value === value)) field.value = value;
  } else if (field) {
    field.value = value;
  }
}
const draft = loadDraft();
for (const key of ['mode', 'name', 'gameType', 'maxPlayers', 'players', 'variant', 'visibility']) restoreField(key, draft[key]);

// En direct, les joueurs se retrouvent dans un salon et jouent tour par tour. À distance, le créateur
// envoie un lien unique à chaque joueur, qui classe ses numéros quand il veut : le pseudo est choisi
// en ouvrant son lien, le nombre de joueurs est exact et la partie est toujours privée.
const isAsync = () => form.elements.mode.value === 'async';
function selectMode() {
  const remote = isAsync();
  document.getElementById('name-field').hidden = remote;
  form.elements.name.required = !remote;
  document.getElementById('max-players-field').hidden = remote;
  document.getElementById('players-field').hidden = !remote;
  document.getElementById('variant-field').hidden = !remote;
  document.getElementById('visibility-field').hidden = remote;
  document.getElementById('mode-hint').textContent = remote
    ? 'Chaque joueur reçoit son propre lien et classe ses numéros par ordre de préférence. Quand tout le monde a répondu, la partie est simulée tour par tour.'
    : 'Les joueurs se retrouvent dans un salon et choisissent un numéro à chaque tour.';
  form.querySelector('button[type="submit"]').textContent = remote ? 'Créer la partie' : 'Ouvrir le salon';
}
form.elements.mode.forEach((radio) => radio.addEventListener('change', selectMode));
selectMode();

// Le nombre de numéros à classer dépend du jeu, du nombre de joueurs et du classement choisi.
function describeVariants() {
  const rules = rulesFor(form.elements.gameType.value);
  const players = Number(form.elements.players.value);
  for (const [key, variant] of Object.entries(VARIANTS)) {
    const counts = rules.phases.map((phase) => countLabel(phase, minRanking(phase, players, key))).join(' et ');
    form.querySelector(`[data-variant="${key}"]`).textContent = `${variant.name} : ${counts} à classer`;
  }
  document.getElementById('variant-hint').textContent = VARIANTS[form.elements.variant.value].hint;
}
form.addEventListener('change', describeVariants);

const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Seuls les jours de tirage du jeu sont proposés, groupés par mois. Une date déjà
// choisie reste sélectionnée si le nouveau jeu est tiré ce jour-là, sinon elle est effacée.
function fillDrawDates(rules) {
  const drawSelect = form.elements.drawDate;
  const previous = drawSelect.value;
  drawSelect.replaceChildren(new Option('Pas encore décidé', ''));
  let group = null;
  for (const value of upcomingDrawDates(rules)) {
    const date = new Date(`${value}T12:00:00Z`);
    const month = monthFormat.format(date);
    if (group?.label !== month) {
      group = document.createElement('optgroup');
      group.label = month;
      drawSelect.append(group);
    }
    group.append(new Option(formatDrawDate(value), value, false, value === previous));
  }
}

// Le choix du jeu change le fond de page, le principe affiché et les jours de tirage.
function selectGame() {
  const rules = rulesFor(form.elements.gameType.value);
  applyTheme(rules.id);
  document.getElementById('header-badge').textContent = rules.name;
  const summary = describeGame(rules);
  document.getElementById('game-summary').textContent = summary[0].toUpperCase() + summary.slice(1);
  document.getElementById('draw-days').textContent = `${rules.theName} est tiré ${rules.drawDays}.`;
  fillDrawDates(rules);
}
form.elements.gameType.forEach((radio) => radio.addEventListener('change', selectGame));
selectGame();
restoreField('drawDate', draft.drawDate);
describeVariants();
form.addEventListener('input', saveDraft);
form.addEventListener('change', saveDraft);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  data.maxPlayers = Number(data.maxPlayers);
  const button = form.querySelector('button');
  button.disabled = true;
  if (isAsync()) {
    try {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameType: data.gameType, players: Number(data.players), variant: data.variant, drawDate: data.drawDate }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      // Le lien de sa place sert aussi à rattacher plus tard la grille à son compte.
      saveToken(body.gameId, body.link);
      location.href = `/partie/${body.link}`;
    } catch (err) {
      errorBox.textContent = err.message || 'Impossible de créer la partie.';
      button.disabled = false;
    }
    return;
  }
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    localStorage.setItem(NAME_KEY, data.name);
    saveToken(body.roomId, body.token);
    location.href = `/salon/${body.roomId}`;
  } catch (err) {
    errorBox.textContent = err.message || 'Impossible de créer le salon.';
    button.disabled = false;
  }
});

function lobbyBadge(gameType) {
  const rules = GAMES[gameType];
  return rules ? `<span class="game-badge" data-game="${rules.id}">${escapeHtml(rules.name)}</span> ` : '';
}

async function refreshLobbies() {
  const list = document.getElementById('lobbies');
  try {
    const lobbies = await (await fetch('/api/lobbies')).json();
    list.innerHTML = lobbies.length
      ? lobbies
          .map(
            (l) => `<li><a href="/salon/${encodeURIComponent(l.id)}">
              <strong>${lobbyBadge(l.gameType)}salon de ${escapeHtml(l.host)}</strong>
              <span>${l.players}/${l.maxPlayers} joueurs${l.drawDate ? ` · tirage du ${formatDrawDate(l.drawDate)}` : ''}</span>
            </a></li>`,
          )
          .join('')
      : '<li class="muted">Aucun salon public en attente pour le moment.</li>';
  } catch {
    list.innerHTML = '<li class="muted">Liste indisponible.</li>';
  }
}

await refreshLobbies();
setInterval(refreshLobbies, 5000);
