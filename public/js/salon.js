import { saveToken, loadToken, forgetToken, escapeHtml, formatDrawDate, ball } from './common.js';

const roomId = decodeURIComponent(location.pathname.split('/').pop());
const socket = io({ transports: ['websocket', 'polling'] });
const $ = (id) => document.getElementById(id);
const views = ['message', 'join', 'lobby', 'game', 'finished'];
let state = null;

function show(name) {
  for (const v of views) $(`view-${v}`).hidden = v !== name;
}

function showMessage(text) {
  $('message-text').textContent = text;
  $('message-link').hidden = false;
  show('message');
}

function join(payload) {
  socket.emit('room:join', { roomId, ...payload }, (res) => {
    if (res.ok) {
      saveToken(roomId, res.token);
      return;
    }
    if (res.code === 'name_required') return show('join');
    if (res.code === 'room_not_found') {
      forgetToken(roomId);
      return checkFinishedGrid();
    }
    if (!$('view-join').hidden) {
      $('join-error').textContent = res.error;
      return;
    }
    if (res.code === 'already_started') return checkFinishedGrid('La partie a déjà commencé sans vous.');
    showMessage(res.error);
  });
}

async function checkFinishedGrid(fallback = "Ce salon n'existe pas ou n'est plus ouvert.") {
  const res = await fetch(`/api/grilles/${encodeURIComponent(roomId)}`);
  if (res.ok) location.replace(`/grille/${encodeURIComponent(roomId)}`);
  else showMessage(fallback);
}

socket.on('connect', () => {
  $('connection').textContent = '';
  const token = loadToken(roomId);
  join(token ? { token } : {});
});
socket.on('disconnect', () => {
  $('connection').textContent = 'Connexion perdue, reconnexion…';
});
socket.on('room:state', (next) => {
  state = next;
  render();
});
socket.on('room:closed', () => showMessage('Ce salon a été fermé.'));

$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  $('join-error').textContent = '';
  const name = event.target.elements.name.value;
  localStorage.setItem('coloto:name', name);
  join({ name });
});
$('join-form').elements.name.value = localStorage.getItem('coloto:name') ?? '';

const inviteUrl = `${location.origin}/salon/${encodeURIComponent(roomId)}`;
$('invite-link').value = inviteUrl;
$('mail-link').href = `mailto:?subject=${encodeURIComponent('Viens co-créer une grille de Loto avec moi')}&body=${encodeURIComponent(
  `Rejoins mon salon Co-Loto pour choisir nos numéros ensemble : ${inviteUrl}`,
)}`;
$('copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteUrl);
    $('copy-link').textContent = 'Lien copié !';
  } catch {
    $('invite-link').select();
  }
});
if (navigator.share) {
  $('share-link').hidden = false;
  $('share-link').addEventListener('click', () =>
    navigator.share({ title: 'Co-Loto', text: 'Viens co-créer une grille de Loto avec moi', url: inviteUrl }).catch(() => {}),
  );
}

function act(event, payload, errorId) {
  $(errorId).textContent = '';
  const callback = (res) => {
    if (!res.ok) $(errorId).textContent = res.error;
  };
  if (payload === undefined) socket.emit(event, callback);
  else socket.emit(event, payload, callback);
}

$('start-game').addEventListener('click', () => act('game:start', undefined, 'lobby-error'));
$('leave-lobby').addEventListener('click', () => {
  socket.emit('room:leave', () => {
    forgetToken(roomId);
    location.href = '/';
  });
});

function render() {
  if (!state?.me) return;
  if (state.status === 'lobby') renderLobby();
  else if (state.status === 'playing') renderGame();
  else if (state.status === 'finished') renderFinished();
}

function playerList(players, { showPick }) {
  return players
    .map((p) => {
      const tags = [];
      if (p.id === state.hostId) tags.push('<span class="tag">créateur</span>');
      if (p.id === state.me.id) tags.push('<span class="tag">vous</span>');
      if (!p.online) tags.push('<span class="tag warn">hors ligne</span>');
      const status = showPick ? `<span class="pick-status ${p.hasPicked ? 'done' : ''}">${p.hasPicked ? 'a choisi' : 'réfléchit…'}</span>` : '';
      return `<li>${escapeHtml(p.name)} ${tags.join(' ')} ${status}</li>`;
    })
    .join('');
}

function renderLobby() {
  show('lobby');
  const isHost = state.hostId === state.me.id;
  const draw = state.drawDate ? ` · tirage prévu le ${formatDrawDate(state.drawDate)}` : '';
  $('lobby-info').textContent = `${state.visibility === 'public' ? 'Salon public' : 'Salon privé'} · ${state.players.length}/${state.maxPlayers} joueurs${draw}`;
  $('lobby-players').innerHTML = playerList(state.players, { showPick: false });
  $('start-game').hidden = !isHost;
  $('start-game').disabled = state.players.length < 2;
  $('lobby-hint').textContent = isHost
    ? state.players.length < 2
      ? 'Invitez au moins une personne pour lancer la partie.'
      : 'Vous pouvez lancer la partie quand tout le monde est là.'
    : 'En attente du lancement de la partie par le créateur du salon.';
}

function renderGame() {
  show('game');
  const phase = state.phase;
  const max = phase === 'numbers' ? 49 : 10;
  const waiting = state.players.filter((p) => !p.hasPicked).length;
  $('round-label').textContent = `Tour ${state.round} · ${phase === 'numbers' ? `numéros (${state.validated.numbers.length}/5)` : 'numéro chance'}`;
  $('round-hint').textContent = waiting ? ` · en attente de ${waiting} joueur${waiting > 1 ? 's' : ''}` : '';
  $('game-players').innerHTML = playerList(state.players, { showPick: true });

  const last = state.lastRound;
  const hasNews = Boolean(last?.newlyValidated.length);
  $('last-round').hidden = !hasNews;
  if (hasNews) {
    $('last-round').innerHTML = `Tour ${last.round} : ${last.newlyValidated.map((n) => ball(n, last.phase === 'chance' ? 'chance' : 'validated')).join(' ')} validé${last.newlyValidated.length > 1 ? 's' : ''} par tout le monde !`;
  }

  const mine = state.me.picks[phase];
  const validated = state.validated[phase];
  $('personal-hint').textContent =
    state.me.pending !== null
      ? `Vous avez choisi le ${state.me.pending}. Vous pouvez changer d'avis jusqu'à la fin du tour.`
      : `Choisissez un ${phase === 'numbers' ? 'numéro entre 1 et 49' : 'numéro chance entre 1 et 10'} que vous n'avez pas encore choisi.`;
  const grid = $('personal-grid');
  grid.classList.toggle('chance', phase === 'chance');
  grid.innerHTML = range(max)
    .map((n) => {
      const classes = ['cell'];
      if (mine.includes(n)) classes.push('picked');
      if (validated.includes(n)) classes.push('validated');
      if (state.me.pending === n) classes.push('pending');
      const disabled = mine.includes(n) ? 'disabled' : '';
      return `<button type="button" class="${classes.join(' ')}" data-number="${n}" ${disabled} aria-pressed="${state.me.pending === n}">${n}</button>`;
    })
    .join('');

  renderCollective(phase, max, validated);
}

// La grille collective n'affiche que la phase en cours : les 49 numéros, puis les 10 numéros chance.
function renderCollective(phase, max, validated) {
  $('collective-hint').textContent =
    phase === 'numbers'
      ? `Numéros validés par tout le monde : ${validated.length} sur 5.`
      : 'Le numéro chance validé par tout le monde terminera la grille.';
  const grid = $('collective-grid');
  grid.classList.toggle('chance', phase === 'chance');
  const validatedClass = phase === 'chance' ? 'chance-validated' : 'validated';
  grid.innerHTML = range(max)
    .map((n) => `<span class="cell ${validated.includes(n) ? validatedClass : ''}">${n}</span>`)
    .join('');
}

function renderFinished() {
  show('finished');
  const { numbers, chance } = state.validated;
  $('final-grid').innerHTML = numbers.map((n) => ball(n, 'validated')).join('') + ball(chance[0], 'chance');
  const url = `${location.origin}/grille/${encodeURIComponent(roomId)}`;
  $('grid-link').href = url;
  $('grid-link').textContent = url;
}

$('personal-grid').addEventListener('click', (event) => {
  const cell = event.target.closest('button[data-number]');
  if (!cell || cell.disabled) return;
  act('game:pick', { number: Number(cell.dataset.number) }, 'game-error');
});

function range(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}
