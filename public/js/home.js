import { saveToken, formatDrawDate, escapeHtml } from './common.js';

const form = document.getElementById('create-form');
const errorBox = document.getElementById('create-error');
const select = form.elements.maxPlayers;

for (let n = 2; n <= 12; n++) select.add(new Option(`${n} joueurs`, n, n === 3, n === 3));
form.elements.name.value = localStorage.getItem('coloto:name') ?? '';
form.elements.drawDate.min = new Date().toISOString().slice(0, 10);

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
              <strong>Salon de ${escapeHtml(l.host)}</strong>
              <span>${l.players}/${l.maxPlayers} joueurs${l.drawDate ? ` · tirage du ${formatDrawDate(l.drawDate)}` : ''}</span>
            </a></li>`,
          )
          .join('')
      : '<li class="muted">Aucun salon public en attente pour le moment.</li>';
  } catch {
    list.innerHTML = '<li class="muted">Liste indisponible.</li>';
  }
}

refreshLobbies();
setInterval(refreshLobbies, 5000);
