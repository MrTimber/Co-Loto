// En-tête : menu burger pour tout le monde, quelle que soit la taille de l'écran. Il commence par
// « Accueil » et « Mes parties en cours », et se termine par « Se connecter » (si la connexion est
// proposée) ou « Se déconnecter » ; entre les deux, « Mon espace » et, pour un administrateur, les entrées de l'administration
// (chargées depuis l'espace d'administration).
import { getAccount, claimStoredGrids, currentPath, logoutButton } from './account.js';
import { el } from './common.js';

const header = document.querySelector('.site-header');
const here = location.pathname.replace(/\/$/, '') || '/';

// La page où l'on est déjà n'est pas un lien : le logo sur l'accueil, l'entrée surlignée du menu.
function pageLink(href, label) {
  const link = el('a', '', label);
  if (here === href) link.setAttribute('aria-current', 'page');
  else link.href = href;
  return link;
}

const logo = header?.querySelector('.logo');
if (logo && here === '/') logo.removeAttribute('href');

const { user, providers } = await getAccount();
if (header) {
  const links = el('div', 'account-links');
  links.id = 'account-menu';
  links.append(pageLink('/', 'Accueil'), pageLink('/mes-parties', 'Mes parties en cours'));
  if (user) links.append(pageLink('/mon-espace', 'Mon espace'));
  if (user?.admin) {
    try {
      const { adminLinks } = await import('/admin/static/menu.js');
      links.append(...adminLinks(el, pageLink));
    } catch {
      // rôle retiré entre-temps : menu habituel
    }
  }
  if (user) {
    links.append(logoutButton('menu-end'));
  } else if (providers.length) {
    const login = pageLink('/connexion', 'Se connecter');
    login.classList.add('menu-end');
    if (login.hasAttribute('href')) login.href = `/connexion?retour=${encodeURIComponent(currentPath())}`;
    links.append(login);
  }
  const nav = el('nav', 'account menu');
  nav.setAttribute('aria-label', 'Compte');
  const toggle = el('button', 'menu-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Menu');
  toggle.setAttribute('aria-controls', links.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  nav.append(toggle, links);
  header.append(nav);
  // Grilles jouées sur cet appareil avant la connexion : ajoutées à « Mon espace ».
  if (user) await claimStoredGrids();
}
