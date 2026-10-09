// Compte facultatif : boutons de connexion, encart de fin de partie,
// et rattachement des grilles jouées sur cet appareil au compte connecté.
import { loadToken } from './common.js';

let accountPromise = null;

export function getAccount() {
  accountPromise ??= fetch('/api/compte')
    .then((res) => (res.ok ? res.json() : { user: null, providers: [] }))
    .catch(() => ({ user: null, providers: [] }));
  return accountPromise;
}

export function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

export const currentPath = () => location.pathname + location.search;

// Un bouton par fournisseur ; on revient sur `retour` une fois connecté.
export function providerButtons(providers, retour = currentPath()) {
  return el('div', 'providers', ...providers.map((p) => {
    const link = el('a', `button provider provider-${p.id}`, `Continuer avec ${p.label}`);
    link.href = `/auth/${p.id}?retour=${encodeURIComponent(retour)}`;
    return link;
  }));
}

// Rattache au compte la grille `gridId` si ce navigateur y a participé.
export async function claimGrid(gridId) {
  const token = loadToken(gridId);
  if (!token) return false;
  const res = await fetch('/api/compte/grilles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gridId, token }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

// Toutes les parties jouées sur cet appareil (une partie encore en cours est simplement ignorée).
export async function claimStoredGrids() {
  const ids = Object.keys(localStorage)
    .filter((key) => key.startsWith('coloto:token:'))
    .map((key) => key.slice('coloto:token:'.length));
  await Promise.all(ids.map(claimGrid));
}

// Encart affiché sous une grille terminée : soit « elle est dans vos grilles »,
// soit une invitation à se connecter pour la retrouver.
export async function renderGridAccountOffer(container, gridId) {
  const { user, providers } = await getAccount();
  if (!user && !providers.length) return;
  if (user) {
    const claimed = await claimGrid(gridId);
    if (!claimed) return;
    const link = el('a', '', 'Mes grilles');
    link.href = '/mes-grilles';
    container.replaceChildren(el('p', 'small', '✓ Cette grille est enregistrée dans ', link, '.'));
  } else {
    if (!loadToken(gridId)) return;
    const privacy = el('a', '', 'Données conservées');
    privacy.href = '/confidentialite';
    container.replaceChildren(
      el('h2', '', 'Retrouvez cette grille dans votre espace'),
      el('p', 'small muted', 'Connectez-vous pour la garder dans « Mes grilles » et la retrouver depuis n’importe quel appareil.'),
      providerButtons(providers, `/grille/${encodeURIComponent(gridId)}`),
      el('p', 'small muted', privacy, ' : seulement votre nom affiché et un identifiant technique.'),
    );
  }
  container.hidden = false;
}
