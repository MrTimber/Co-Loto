import { getAccount, claimStoredGrids, providerButtons, el } from './account.js';
import { rulesFor, formatDrawDate } from './common.js';

const card = document.getElementById('my-grids');
const PROVIDER_NAMES = { google: 'Google', microsoft: 'Microsoft', github: 'GitHub', discord: 'Discord', facebook: 'Facebook', dev: 'le compte de test' };
const dateFormat = { day: 'numeric', month: 'long', year: 'numeric' };

function balls(numbers, extra) {
  return numbers.map((n) => el('span', `ball ${extra}`, String(n)));
}

function gridItem(grid) {
  const rules = rulesFor(grid.gameType);
  const created = new Date(grid.createdAt).toLocaleDateString('fr-FR', dateFormat);
  const link = el('a', '', `${rules.name} du ${created}`);
  link.href = `/grille/${encodeURIComponent(grid.id)}`;
  const remove = el('button', 'link small', 'Retirer');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Retirer la grille ${rules.name} du ${created} de mes grilles`);
  const item = el(
    'li',
    'my-grid',
    el('p', 'my-grid-title', link),
    el('div', 'summary', ...balls(grid.numbers, 'validated'), ...balls(grid.bonus, 'bonus')),
    el('p', 'small muted', `Avec ${grid.players.join(', ')}`, grid.drawDate ? ` · tirage du ${formatDrawDate(grid.drawDate)}` : ''),
    remove,
  );
  item.dataset.game = rules.id;
  remove.addEventListener('click', async () => {
    const res = await fetch(`/api/compte/grilles/${encodeURIComponent(grid.id)}`, { method: 'DELETE' });
    if (res.ok) item.remove();
  });
  return item;
}

function profileForm(user) {
  const form = el('form', 'profile');
  const field = (label, input) => el('label', '', label, input);
  const name = el('input');
  Object.assign(name, { name: 'name', required: true, maxLength: 24, autocomplete: 'nickname', value: user.name });
  const email = el('input');
  Object.assign(email, { name: 'email', type: 'email', maxLength: 254, autocomplete: 'email', value: user.email ?? '' });
  const consent = el('input');
  Object.assign(consent, { name: 'emailConsent', type: 'checkbox', checked: user.emailConsent });
  const status = el('output', 'small');
  const save = el('button', 'primary', 'Enregistrer');
  save.type = 'submit';
  form.append(
    el('h2', '', 'Mon compte'),
    field('Pseudo', name),
    field('Adresse email', email),
    el('label', 'inline', consent, ' M\u2019envoyer par email le résultat de mes grilles qui ont une date de tirage'),
    el('p', 'small muted', 'L\u2019envoi des résultats arrivera dans une prochaine version. Vous pouvez retirer cet accord à tout moment.'),
    el('div', 'actions', save, status),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.className = 'small';
    const res = await fetch('/api/compte', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.value, email: email.value, emailConsent: consent.checked }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok) {
      status.textContent = 'Enregistré.';
      localStorage.setItem('coloto:name', name.value.trim());
    } else {
      status.className = 'small error';
      status.textContent = body?.error ?? 'Enregistrement impossible, réessayez.';
    }
  });
  return form;
}

function accountActions(user) {
  const logout = el('button', '', 'Se déconnecter');
  logout.type = 'button';
  logout.addEventListener('click', async () => {
    await fetch('/auth/deconnexion', { method: 'POST' });
    location.href = '/';
  });
  const remove = el('button', 'link danger', 'Supprimer mon compte');
  remove.type = 'button';
  remove.addEventListener('click', async () => {
    if (!confirm('Supprimer votre compte ? Les grilles restent consultables par leur lien, mais elles ne seront plus listées ici.')) return;
    await fetch('/api/compte', { method: 'DELETE' });
    location.href = '/';
  });
  const privacy = el('a', '', 'Confidentialité');
  privacy.href = '/confidentialite';
  return [
    el('p', 'small muted', `Connecté avec ${PROVIDER_NAMES[user.provider] ?? user.provider}. `, privacy),
    el('div', 'actions', logout),
    el('div', 'danger-zone', remove),
  ];
}

const { user, providers } = await getAccount();
if (user) {
  await claimStoredGrids();
  const res = await fetch('/api/compte/grilles');
  const grids = res.ok ? await res.json() : [];
  card.replaceChildren(el('h1', '', 'Mon espace'), el('h2', '', 'Mes grilles'));
  if (grids.length) {
    card.append(el('ul', 'my-grids', ...grids.map(gridItem)));
  } else {
    card.append(el('p', 'muted', 'Aucune grille pour l’instant. Les grilles que vous co-créez en étant connecté apparaissent ici pendant 30 jours.'));
  }
  card.append(profileForm(user), ...accountActions(user));
} else {
  card.replaceChildren(
    el('h1', '', 'Mon espace'),
    el('p', '', 'Connectez-vous pour retrouver les grilles que vous avez co-créées, pendant 30 jours.'),
    providers.length ? providerButtons(providers, '/mon-espace') : el('p', 'muted', 'La connexion n’est pas encore disponible sur ce site.'),
  );
}
