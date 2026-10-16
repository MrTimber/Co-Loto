// Partie à distance : le joueur ouvre son lien unique, choisit son pseudo (ou utilise celui de
// son compte) et classe ses numéros par ordre de préférence. Le créateur y trouve aussi les liens
// à envoyer aux autres joueurs.
import { saveToken, el, rulesFor, applyTheme, formatDrawDate, formatMoment, countLabel, seatItems, VARIANTS, NAME_KEY } from './common.js';
import { getAccount, providerButtons } from './account.js';

const link = decodeURIComponent(location.pathname.split('/').pop());
const $ = (id) => document.getElementById(id);
const DRAFT_KEY = `coloto:classement:${link}`;

let state = null;
let ranking = null; // { [phase]: [numéros dans l'ordre de préférence] }

function showMessage(text) {
  $('message-text').textContent = text;
  $('message-link').hidden = false;
  $('view-message').hidden = false;
  $('view-game').hidden = true;
}

// Le classement en cours de saisie est gardé sur l'appareil jusqu'à son envoi.
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(ranking));
  } catch {
    // stockage indisponible : tant pis pour le brouillon
  }
}
function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

async function load() {
  const res = await fetch(`/api/parties/${encodeURIComponent(link)}`).catch(() => null);
  const body = await res?.json().catch(() => null);
  if (!res?.ok) return showMessage(body?.error ?? 'Impossible de charger la partie.');
  state = body;
  saveToken(state.id, link);
  if (state.status === 'finished') return location.replace(`/grille/${encodeURIComponent(state.id)}`);
  render();
}

function render() {
  const rules = rulesFor(state.gameType);
  applyTheme(rules.id);
  $('header-badge').textContent = rules.name;
  $('header-badge').hidden = false;
  $('view-message').hidden = true;
  $('view-game').hidden = false;
  $('game-title').textContent = `Partie ${rules.ofName} à distance`;
  const draw = state.drawDate ? ` · tirage prévu le ${formatDrawDate(state.drawDate)}` : '';
  $('game-info').textContent = `${state.players} joueurs · ${VARIANTS[state.variant].name.toLowerCase()}${draw} · réponses attendues jusqu'au ${formatMoment(state.deadline)}`;
  $('variant-hint').textContent = `${VARIANTS[state.variant].hint} Quand tout le monde a répondu, la partie est simulée tour par tour : à chaque tour, chacun joue le numéro suivant de son classement.`;
  $('seats').replaceChildren(...seatItems(state.seats, state.me.seat));
  renderMyLink(rules);
  renderInvitations(rules);
  if (state.me.removed) {
    $('ranking-form').replaceChildren(el('p', '', 'Le créateur vous a retiré de cette partie.'));
  } else if (state.status === 'expired') {
    $('ranking-form').replaceChildren(el('p', '', 'La date limite est passée avant que tout le monde ait répondu : la partie est terminée sans grille.'));
  } else {
    void renderRankingForm(rules);
  }
}

// Champ du lien et boutons pour le copier, l'envoyer par email ou le partager.
function linkBox(url, label, { subject, text }) {
  const input = el('input');
  input.readOnly = true;
  input.value = url;
  input.setAttribute('aria-label', label);
  const copy = el('button', 'small', 'Copier le lien');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Lien copié !';
    } catch {
      input.select();
    }
  });
  const mail = el('a', 'button small', 'Envoyer par email');
  mail.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text} : ${url}`)}`;
  const actions = el('div', 'invite-actions', copy, mail);
  if (navigator.share) {
    const share = el('button', 'small', 'Partager…');
    share.type = 'button';
    share.addEventListener('click', () => navigator.share({ title: 'Co-Loto', text, url }).catch(() => {}));
    actions.append(share);
  }
  return { input, actions };
}

// Son propre lien, pour revenir à la partie : sans compte, c'est le seul moyen de la retrouver
// depuis un autre appareil (ou après avoir effacé les données du navigateur).
function renderMyLink(rules) {
  const show = state.status === 'waiting' && !state.me.removed;
  $('my-link').hidden = !show;
  if (!show) return;
  const { input, actions } = linkBox(`${location.origin}/partie/${encodeURIComponent(link)}`, 'Votre lien personnel', {
    subject: `Co-Loto : mon lien pour la partie ${rules.ofName} à distance`,
    text: 'Mon lien personnel pour revenir à la partie Co-Loto (à ne pas partager)',
  });
  const hint = state.me.isHost
    ? 'Gardez ce lien pour vous : c’est lui qui vous permet de suivre la partie et de retrouver les liens des joueurs. Copiez-le ou envoyez-le-vous par email.'
    : 'Gardez ce lien pour vous : il vous permet de revenir à la partie et de modifier votre classement. Copiez-le ou envoyez-le-vous par email.';
  $('my-link').replaceChildren(el('h2', '', 'Votre lien personnel'), el('p', 'small', hint), input, actions);
}

// Le créateur voit le lien de chaque place, à copier, partager ou envoyer par email.
function renderInvitations(rules) {
  const isHost = state.me.isHost && state.status === 'waiting';
  $('invitations').hidden = !isHost;
  if (!isHost) return;
  const answered = state.seats.filter((s) => !s.removed && s.submittedAt).length;
  const canRemove = answered >= 2;
  const text = `Viens co-créer une grille ${rules.ofName} avec moi sur Co-Loto : classe tes numéros quand tu veux avec ce lien, il est rien qu'à toi`;
  const items = state.seats
    .filter((s) => s.seat !== 0 && !s.removed)
    .map((s) => {
      const url = `${location.origin}/partie/${encodeURIComponent(s.link)}`;
      const title = el('p', 'invite-title', el('strong', '', s.name ?? `Joueur ${s.seat + 1}`), ' ', s.submittedAt ? el('span', 'tag ok', 'a répondu') : el('span', 'tag warn', 'en attente'));
      const { input, actions } = linkBox(url, `Lien du joueur ${s.seat + 1}`, { subject: `Co-Loto : une grille ${rules.ofName} à co-créer`, text });
      if (!s.submittedAt) {
        const remove = el('button', 'link small', 'Retirer ce joueur');
        remove.type = 'button';
        remove.disabled = !canRemove;
        remove.addEventListener('click', () => removeSeat(s.seat));
        actions.append(remove);
      }
      return el('li', '', title, input, actions);
    });
  $('invite-list').replaceChildren(...items);
  const waiting = state.seats.some((s) => !s.removed && !s.submittedAt && s.seat !== 0);
  $('remove-hint').textContent = waiting
    ? canRemove
      ? 'Un joueur ne répond pas ? Vous pouvez le retirer : la grille sera calculée sans lui.'
      : 'Dès que 2 joueurs auront répondu, vous pourrez retirer un joueur qui ne répond pas.'
    : '';
}

async function removeSeat(seat) {
  if (!confirm('Retirer ce joueur ? La grille sera calculée sans lui.')) return;
  $('invite-error').textContent = '';
  const res = await fetch(`/api/parties/${encodeURIComponent(link)}/places/${seat}`, { method: 'DELETE' }).catch(() => null);
  const body = await res?.json().catch(() => null);
  if (!res?.ok) {
    $('invite-error').textContent = body?.error ?? 'Impossible de retirer ce joueur.';
    return;
  }
  if (body.finished) return location.assign(`/grille/${encodeURIComponent(body.gridId)}`);
  await load();
}

let account = null;

async function renderRankingForm(rules) {
  account ??= await getAccount();
  const { user, providers } = account;
  const submitted = Boolean(state.me.submittedAt);
  // Classement enregistré, sinon brouillon de cet appareil, sinon vide.
  if (!ranking) {
    const draft = loadDraft();
    const source = state.me.ranking ?? draft ?? {};
    ranking = Object.fromEntries(rules.phases.map((p) => [p.key, Array.isArray(source[p.key]) ? source[p.key].filter((n) => Number.isInteger(n) && n >= p.min && n <= p.max) : []]));
  }

  $('ranking-status').hidden = !submitted;
  if (submitted) {
    $('ranking-status').textContent = `✓ Votre classement est enregistré (${formatMoment(state.me.submittedAt)}). Vous pouvez le modifier tant que tout le monde n'a pas répondu.`;
  }
  $('submit-ranking').textContent = submitted ? 'Modifier mon classement' : 'Envoyer mon classement';

  // Pseudo : celui du compte si l'on est connecté, sinon à choisir (ou se connecter).
  const identity = $('identity');
  if (user && (!state.me.name || submitted)) {
    identity.replaceChildren(el('p', '', 'Vous jouez en tant que ', el('strong', '', state.me.name ?? user.name), ' (votre compte).'));
  } else if (!identity.querySelector('input')) {
    const input = el('input');
    input.name = 'name';
    input.required = true;
    input.maxLength = 24;
    input.autocomplete = 'nickname';
    input.value = state.me.name ?? localStorage.getItem(NAME_KEY) ?? '';
    identity.replaceChildren(el('label', '', 'Votre pseudo', input));
    if (!user && providers.length) {
      identity.append(el('p', 'small muted', 'Ou connectez-vous pour jouer avec le pseudo de votre compte et retrouver la partie dans votre espace :'), providerButtons(providers));
    }
  }

  // Une grille par phase : chaque numéro touché prend le rang suivant ; le toucher à nouveau le retire.
  $('phases').replaceChildren(...rules.phases.map((phase, index) => phaseSection(phase, index > 0)));

  const emailBox = $('email-option');
  if (user?.emailVerified) {
    if (!emailBox.querySelector('input')) {
      const box = el('input');
      box.type = 'checkbox';
      box.name = 'emailResult';
      box.checked = submitted ? state.me.emailResult : true;
      emailBox.replaceChildren(el('label', 'inline', box, ` Recevoir la grille par email (${user.email}) quand tout le monde aura répondu`));
    }
  } else if (user) {
    emailBox.replaceChildren(el('p', 'small muted', 'Vérifiez votre adresse email dans « Mon espace » pour recevoir la grille par email.'));
  } else {
    emailBox.replaceChildren(el('p', 'small muted', 'Connectez-vous avec une adresse vérifiée pour recevoir la grille par email.'));
  }
}

function phaseSection(phase, isBonus) {
  const min = state.minimums[phase.key];
  const list = ranking[phase.key];
  const counter = el('p', 'small ranking-count');
  const grid = el('div', `grid${isBonus ? ' bonus' : ''}`);
  grid.style.setProperty('--columns', phase.columns);
  const order = el('ol', 'ranking-order');
  const update = () => {
    const missing = Math.max(0, min - list.length);
    counter.textContent = missing
      ? `${list.length} classé${phase.feminine ? 'e' : ''}${list.length > 1 ? 's' : ''} · encore ${countLabel(phase, missing)} au moins`
      : `${list.length} classé${phase.feminine ? 'e' : ''}${list.length > 1 ? 's' : ''} ✓`;
    counter.classList.toggle('done', !missing);
    for (const cell of grid.children) {
      const n = Number(cell.dataset.number);
      const rank = list.indexOf(n);
      cell.classList.toggle('ranked', rank !== -1);
      cell.setAttribute('aria-pressed', String(rank !== -1));
      cell.querySelector('.rank').textContent = rank === -1 ? '' : rank + 1;
      cell.setAttribute('aria-label', rank === -1 ? String(n) : `${n}, classé${phase.feminine ? 'e' : ''} ${rank + 1}${rank === 0 ? (phase.feminine ? 're' : 'er') : 'e'}`);
    }
    order.replaceChildren(...list.map((n) => el('li', '', String(n))));
    saveDraft();
  };
  for (let n = phase.min; n <= phase.max; n++) {
    const cell = el('button', 'cell', String(n), el('span', 'rank'));
    cell.lastChild.setAttribute('aria-hidden', 'true');
    cell.type = 'button';
    cell.dataset.number = n;
    cell.addEventListener('click', () => {
      const at = list.indexOf(n);
      if (at === -1) list.push(n);
      else list.splice(at, 1);
      update();
    });
    grid.append(cell);
  }
  const undo = el('button', 'small', 'Retirer le dernier');
  undo.type = 'button';
  undo.addEventListener('click', () => {
    list.pop();
    update();
  });
  const clear = el('button', 'link small', 'Tout effacer');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    if (list.length && confirm(`Effacer votre classement des ${phase.many} ?`)) {
      list.length = 0;
      update();
    }
  });
  const section = el(
    'section',
    `ranking-phase game-grid${isBonus ? ' bonus' : ''}`,
    el('h3', '', `Vos ${phase.many}`),
    el('p', 'small', `Touchez au moins ${countLabel(phase, min)} par ordre de préférence : votre préféré${phase.feminine ? 'e' : ''} d'abord. Touchez un${phase.feminine ? 'e' : ''} ${phase.one} classé${phase.feminine ? 'e' : ''} pour le retirer.`),
    counter,
    grid,
    el('div', 'actions', undo, clear),
    el('details', 'small', el('summary', '', 'Voir l’ordre de mon classement'), order),
  );
  update();
  return section;
}

$('ranking-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('ranking-error').textContent = '';
  const form = event.target;
  const name = form.elements.name?.value;
  if (name) localStorage.setItem(NAME_KEY, name);
  const button = $('submit-ranking');
  button.disabled = true;
  const res = await fetch(`/api/parties/${encodeURIComponent(link)}/classement`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, ranking, emailResult: form.elements.emailResult?.checked ?? false }),
  }).catch(() => null);
  const body = await res?.json().catch(() => null);
  button.disabled = false;
  if (!res?.ok) {
    $('ranking-error').textContent = body?.error ?? 'Envoi impossible, réessayez.';
    return;
  }
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // rien à effacer
  }
  if (body.finished) return location.assign(`/grille/${encodeURIComponent(body.gridId)}`);
  ranking = null;
  $('identity').replaceChildren();
  $('email-option').replaceChildren();
  await load();
  $('ranking-status').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

await load();
