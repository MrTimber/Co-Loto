// En-tête : lien « Se connecter » ou « Mes grilles » (seulement si la connexion est proposée).
import { getAccount, claimStoredGrids, currentPath, el } from './account.js';

const header = document.querySelector('.site-header');
const { user, providers } = await getAccount();
if (header && (user || providers.length)) {
  const nav = el('nav', 'account');
  nav.setAttribute('aria-label', 'Compte');
  if (user) {
    const link = el('a', '', 'Mes grilles');
    link.href = '/mes-grilles';
    nav.append(link);
  } else if (location.pathname !== '/connexion') {
    const link = el('a', '', 'Se connecter');
    link.href = `/connexion?retour=${encodeURIComponent(currentPath())}`;
    nav.append(link);
  }
  header.append(nav);
  // Grilles jouées sur cet appareil avant la connexion : ajoutées à « Mes grilles ».
  if (user) await claimStoredGrids();
}
