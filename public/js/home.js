import { saveToken, formatDrawDate, escapeHtml, rulesFor, applyTheme, describeGame } from './common.js';
import { GAMES, upcomingDrawDates } from './games.js';

const form = document.getElementById('create-form');
const errorBox = document.getElementById('create-error');
const select = form.elements.maxPlayers;

for (let n = 2; n <= 12; n++) select.add(new Option(`${n} joueurs`, n, n === 3, n === 3));
form.elements.name.value = localStorage.getItem('coloto:name') ?? '';

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
  document.getElementById('game-summary').textContent = `${describeGame(rules)[0].toUpperCase()}${describeGame(rules).slice(1)}`;
  document.getElementById('draw-days').textContent = `(optionnel : ${rules.theName} est tiré ${rules.drawDays})`;
  fillDrawDates(rules);
}
form.elements.gameType.forEach((radio) => radio.addEventListener('change', selectGame));
selectGame();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  data.maxPlayers = Number(data.maxPlayers);
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    localStorage.setItem('coloto:name', data.name);
    saveToken(body.roomId, body.token);
    location.href = `/salon/${body.roomId}`;
  } catch (err) {
    errorBox.textContent = err.message || 'Impossible de créer le salon.';
    button.disabled = false;
  }
});

async function refreshLobbies() {
  const list = document.getElementById('lobbies');
  try {
    const lobbies = await (await fetch('/api/lobbies')).json();
    list.innerHTML = lobbies.length
      ? lobbies
          .map(
            (l) => `<li><a href="/salon/${encodeURIComponent(l.id)}">
              <strong>${escapeHtml(GAMES[l.gameType]?.name ?? '')} · salon de ${escapeHtml(l.host)}</strong>
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
