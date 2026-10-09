import { getAccount, claimStoredGrids, providerButtons, el } from './account.js';
import { rulesFor, formatDrawDate } from './common.js';

const card = document.getElementById('my-grids');
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
    el('p', 'small muted', `Avec ${grid.players.join(', ')}${grid.drawDate ? ` · tirage du ${formatDrawDate(grid.drawDate)}` : ''}`),
    remove,
  );
  item.dataset.game = rules.id;
  remove.addEventListener('click', async () => {
    const res = await fetch(`/api/compte/grilles/${encodeURIComponent(grid.id)}`, { method: 'DELETE' });
    if (res.ok) item.remove();
  });
  return item;
}

function accountActions(user) {
  const logout = el('button', '', 'Se déconnecter');
  logout.type = 'button';
  logout.addEventListener('click', async () => {
    await fetch('/auth/deconnexion', { method: 'POST' });
    location.href = '/';
  });
  const remove = el('button', 'link', 'Supprimer mon compte');
  remove.type = 'button';
  remove.addEventListener('click', async () => {
    if (!confirm('Supprimer votre compte ? Les grilles restent consultables par leur lien, mais elles ne seront plus listées ici.')) return;
    await fetch('/api/compte', { method: 'DELETE' });
    location.href = '/';
  });
  const privacy = el('a', '', 'Confidentialité');
  privacy.href = '/confidentialite';
  return [
    el('p', 'small muted', `Connecté en tant que ${user.name}. `, privacy),
    el('div', 'actions', logout, remove),
  ];
}

const { user, providers } = await getAccount();
if (user) {
  await claimStoredGrids();
  const res = await fetch('/api/compte/grilles');
  const grids = res.ok ? await res.json() : [];
  card.replaceChildren(el('h1', '', 'Mes grilles'));
  if (grids.length) {
    card.append(el('ul', 'my-grids', ...grids.map(gridItem)));
  } else {
    card.append(el('p', 'muted', 'Aucune grille pour l’instant. Les grilles que vous co-créez en étant connecté apparaissent ici pendant 30 jours.'));
  }
  card.append(...accountActions(user));
} else {
  card.replaceChildren(
    el('h1', '', 'Mes grilles'),
    el('p', '', 'Connectez-vous pour retrouver les grilles que vous avez co-créées, pendant 30 jours.'),
    providers.length ? providerButtons(providers, '/mes-grilles') : el('p', 'muted', 'La connexion n’est pas encore disponible sur ce site.'),
  );
}
