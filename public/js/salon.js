import { saveToken, loadToken, forgetToken, escapeHtml, formatDrawDate, ball, rulesFor, applyTheme, countLabel, gridBalls } from './common.js';
import { renderGridAccountOffer } from './account.js';

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
// À la fin d'un tour, son résultat reste affiché un instant avant de passer au tour suivant
// (ou à la grille finale) : on voit ainsi l'animation du dernier numéro validé.
const ROUND_END_PAUSE = 2000;
let seenRound; // dernier tour terminé déjà connu (undefined tant qu'aucun état n'est reçu)
let roundEndTimer = null;

socket.on('room:state', (next) => {
  state = next;
  const ended = next.me ? (next.lastRound?.round ?? null) : undefined;
  const isNewRoundEnd = seenRound !== undefined && ended !== null && ended !== seenRound;
  if (ended !== undefined) seenRound = ended;
  if (isNewRoundEnd) {
    renderRoundEnd();
    roundEndTimer = setTimeout(() => {
      roundEndTimer = null;
      render();
    }, ROUND_END_PAUSE);
  } else if (!roundEndTimer) {
    render();
  }
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
const inviteText = (rules) => `Viens co-créer une grille ${rules.ofName} avec moi`;
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
    navigator.share({ title: 'Co-Loto', text: inviteText(rulesFor(state?.gameType)), url: inviteUrl }).catch(() => {}),
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
  applyTheme(state.gameType);
  $('header-badge').textContent = rulesFor(state.gameType).name;
  $('header-badge').hidden = false;
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
      const status = showPick ? pickStatus(p.hasPicked) : '';
      return `<li>${escapeHtml(p.name)} ${tags.join(' ')} ${status}</li>`;
    })
    .join('');
}

function pickStatus(hasPicked) {
  return hasPicked ? '<span class="pick-status done">a choisi</span>' : '<span class="pick-status">réfléchit…</span>';
}

function lobbyHint(isHost) {
  if (!isHost) return 'En attente du lancement de la partie par le créateur du salon.';
  if (state.players.length < 2) return 'Invitez au moins une personne pour lancer la partie.';
  return 'Vous pouvez lancer la partie quand tout le monde est là.';
}

function renderLobby() {
  show('lobby');
  const isHost = state.hostId === state.me.id;
  const draw = state.drawDate ? ` · tirage prévu le ${formatDrawDate(state.drawDate)}` : '';
  const rules = rulesFor(state.gameType);
  $('mail-link').href = `mailto:?subject=${encodeURIComponent(inviteText(rules))}&body=${encodeURIComponent(
    `Rejoins mon salon Co-Loto pour choisir nos numéros ensemble : ${inviteUrl}`,
  )}`;
  $('lobby-info').textContent = `${rules.name} · ${state.visibility === 'public' ? 'Salon public' : 'Salon privé'} · ${state.players.length}/${state.maxPlayers} joueurs${draw}`;
  $('lobby-players').innerHTML = playerList(state.players, { showPick: false });
  $('start-game').hidden = !isHost;
  $('start-game').disabled = state.players.length < 2;
  $('lobby-hint').textContent = lobbyHint(isHost);
}

function renderGame() {
  show('game');
  const rules = rulesFor(state.gameType);
  const phaseIndex = rules.phases.findIndex((p) => p.key === state.phase);
  const phase = rules.phases[phaseIndex];
  const validated = state.validated[phase.key];
  const waiting = state.players.filter((p) => !p.hasPicked).length;
  $('round-label').textContent = `${rules.name} · Tour ${state.round} · ${capitalize(phase.many)} (${validated.length}/${phase.count})`;
  const waitingFor = waiting > 1 ? `${waiting} joueurs` : '1 joueur';
  $('round-hint').textContent = waiting ? ` · en attente de ${waitingFor}` : '';
  $('game-players').innerHTML = playerList(state.players, { showPick: true });

  $('last-round').hidden = true;

  const isBonus = phaseIndex > 0;
  $('grid-hint').textContent =
    state.me.pending !== null
      ? `Vous avez choisi le ${state.me.pending}. Vous pouvez changer d'avis jusqu'à la fin du tour.`
      : `Choisissez ${article(phase)} ${phase.one} entre ${phase.min} et ${phase.max} que vous n'avez pas encore choisi${e(phase)}.`;
  $('collective-hint').textContent = collectiveHint(phase, isBonus, validated);
  $('collective-hint').hidden = !isBonus;
  renderGrid(phase, isBonus, validated);
}

function renderRoundEnd() {
  applyTheme(state.gameType);
  show('game');
  const rules = rulesFor(state.gameType);
  const last = state.lastRound;
  const phaseIndex = rules.phases.findIndex((p) => p.key === last.phase);
  const phase = rules.phases[phaseIndex];
  const validated = state.validated[phase.key];
  // Le cadre du tour et les consignes gardent leur contenu (masqué) pour que rien ne bouge à l'écran.
  $('last-round').innerHTML = `<span>${roundResult(last.newlyValidated, phase, phaseIndex > 0)}</span>`;
  $('last-round').hidden = false;
  renderGrid(phase, phaseIndex > 0, validated);
}

function roundResult(numbers, phase, isBonus) {
  if (numbers.length === 0) {
    const none = phase.feminine ? 'Aucune' : 'Aucun';
    return `Fin du tour : ${none} ${phase.one} validé${e(phase)} à ce tour.`;
  }
  const balls = numbers.map((n) => ball(n, isBonus ? 'bonus' : 'validated')).join(' ');
  return `Fin du tour : ${balls} validé${e(phase)}${numbers.length > 1 ? 's' : ''} par tout le monde !`;
}

// Une seule grille réunit ses propres choix et les numéros validés par tout le monde.
// Elle n'affiche que la phase en cours : les numéros, puis les numéros complémentaires.
// Les cases sont créées une fois par phase puis mises à jour, pour que l'animation
// d'un numéro qui vient d'être validé ne se rejoue pas à chaque mise à jour du salon.
let gridPhase = null;
let seenValidated = new Set();

function renderGrid(phase, isBonus, validated) {
  const grid = $('grid');
  if (gridPhase !== phase.key) {
    gridPhase = phase.key;
    seenValidated = new Set(validated);
    grid.closest('.game-grid').classList.toggle('bonus', isBonus);
    grid.classList.toggle('bonus', isBonus);
    grid.style.setProperty('--columns', phase.columns);
    grid.replaceChildren(...range(phase.min, phase.max).map(createCell));
  }
  const mine = state.me.picks[phase.key];
  for (const cell of grid.children) {
    const n = Number(cell.dataset.number);
    const isValidated = validated.includes(n);
    const isPicked = mine.includes(n) && !isValidated;
    const isPending = state.me.pending === n;
    cell.classList.toggle('picked', isPicked);
    cell.classList.toggle('validated', isValidated);
    cell.classList.toggle('pending', isPending);
    cell.disabled = isPicked || isValidated;
    cell.setAttribute('aria-pressed', String(isPending));
    cell.setAttribute('aria-label', cellLabel(n, isValidated, isPicked));
    if (isValidated && !seenValidated.has(n)) {
      seenValidated.add(n);
      cell.classList.add('just-validated');
    }
  }
}

function createCell(n) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'cell';
  cell.dataset.number = n;
  cell.textContent = n;
  cell.addEventListener('animationend', () => cell.classList.remove('just-validated'));
  return cell;
}

function cellLabel(n, isValidated, isPicked) {
  if (isValidated) return `${n}, validé par tout le monde`;
  if (isPicked) return `${n}, déjà choisi`;
  return String(n);
}

// Pendant les numéros, le compteur du bandeau de tour suffit : le rappel ne sert qu'aux numéros complémentaires.
function collectiveHint(phase, isBonus, validated) {
  if (!isBonus) return '';
  const remaining = phase.count - validated.length;
  if (remaining > 1) return `Les ${countLabel(phase, remaining)} validé${e(phase)}s par tout le monde termineront la grille.`;
  let subject = phase.feminine ? 'La' : 'Le';
  if (phase.count > 1) subject = phase.feminine ? 'La dernière' : 'Le dernier';
  return `${subject} ${phase.one} validé${e(phase)} par tout le monde terminera la grille.`;
}

let offerShown = false;

function renderFinished() {
  show('finished');
  const rules = rulesFor(state.gameType);
  const [numbers, bonus] = rules.phases;
  $('finished-title').textContent = `Votre grille ${rules.name} est prête ! 🎉`;
  $('final-grid').innerHTML = gridBalls(state.validated[numbers.key], state.validated[bonus.key]);
  const url = `${location.origin}/grille/${encodeURIComponent(roomId)}`;
  $('grid-link').href = url;
  $('grid-link').textContent = url;
  if (!offerShown) {
    offerShown = true;
    void renderGridAccountOffer($('account-offer'), roomId);
  }
}

const gridUrl = () => $('grid-link').href;

async function copyGridLink() {
  try {
    await navigator.clipboard.writeText(gridUrl());
    $('grid-link-status').textContent = 'Lien copié ! Collez-le où vous voulez pour le partager.';
  } catch {
    // Presse-papiers indisponible (contexte non sécurisé, refus…) : on sélectionne le lien pour une copie manuelle.
    getSelection().selectAllChildren($('grid-link'));
    $('grid-link-status').textContent = 'Le lien est sélectionné : copiez-le avec Ctrl+C (ou un appui long).';
  }
}

$('copy-grid-link').addEventListener('click', copyGridLink);
if (navigator.share) {
  $('share-grid').hidden = false;
  $('share-grid').addEventListener('click', async () => {
    const rules = rulesFor(state.gameType);
    try {
      await navigator.share({ title: 'Co-Loto', text: `Notre grille ${rules.name} co-créée sur Co-Loto`, url: gridUrl() });
      $('grid-link-status').textContent = 'Lien partagé !';
    } catch (err) {
      if (err.name !== 'AbortError') await copyGridLink();
    }
  });
}

$('grid').addEventListener('click', (event) => {
  const cell = event.target.closest('button[data-number]');
  if (!cell || cell.disabled || roundEndTimer) return;
  act('game:pick', { number: Number(cell.dataset.number) }, 'game-error');
});

const e = (phase) => (phase.feminine ? 'e' : '');
const article = (phase) => (phase.feminine ? 'une' : 'un');
const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

function range(min, max) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}
