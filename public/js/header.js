// En-tête : lien « Se connecter » ou « Mon espace » (seulement si la connexion est proposée).
// Une personne connectée a toujours le menu burger : « Accueil », « Mon espace », puis « Se déconnecter » ; un administrateur
// y trouve ses entrées en plus (chargées depuis l'espace d'administration). Pour les visiteurs, le lien
// n'est regroupé dans un menu burger que sur petit écran.
import { getAccount, claimStoredGrids, currentPath, el } from './account.js';

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
if (header && (user || providers.length)) {
  const links = el('div', 'account-links');
  links.id = 'account-menu';
  if (user) {
    links.append(pageLink('/', 'Accueil'), pageLink('/mon-espace', 'Mon espace'));
  } else if (location.pathname !== '/connexion') {
    const link = el('a', '', 'Se connecter');
    link.href = `/connexion?retour=${encodeURIComponent(currentPath())}`;
    links.append(link);
  }
  if (user?.admin) {
    try {
      const { adminLinks } = await import('/admin/static/menu.js');
      links.append(...adminLinks(el, pageLink));
    } catch {
      // rôle retiré entre-temps : menu habituel
    }
  }
  if (user) {
    const logout = el('button', 'menu-logout', 'Se déconnecter');
    logout.type = 'button';
    logout.addEventListener('click', async () => {
      await fetch('/auth/deconnexion', { method: 'POST' });
      location.href = '/';
    });
    links.append(logout);
  }
  if (links.childElementCount) {
    const nav = el('nav', 'account');
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
    const small = matchMedia('(max-width: 600px)');
    const useMenu = () => {
      nav.classList.toggle('menu', Boolean(user) || small.matches);
      if (!nav.classList.contains('menu')) setOpen(false);
    };
    useMenu();
    small.addEventListener('change', useMenu);
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
  }
  // Grilles jouées sur cet appareil avant la connexion : ajoutées à « Mon espace ».
  if (user) await claimStoredGrids();
}
