// En-tête : lien « Se connecter » ou « Mon espace » (seulement si la connexion est proposée).
// Sur petit écran, les liens sont regroupés dans un menu burger ; un administrateur a toujours
// le menu burger, avec ses entrées en plus (chargées depuis l'espace d'administration).
import { getAccount, claimStoredGrids, currentPath, el } from './account.js';

const header = document.querySelector('.site-header');
const { user, providers } = await getAccount();
if (header && (user || providers.length)) {
  const links = el('div', 'account-links');
  links.id = 'account-menu';
  if (user) {
    const link = el('a', '', 'Mon espace');
    link.href = '/mon-espace';
    links.append(link);
  } else if (location.pathname !== '/connexion') {
    const link = el('a', '', 'Se connecter');
    link.href = `/connexion?retour=${encodeURIComponent(currentPath())}`;
    links.append(link);
  }
  if (user?.admin) {
    try {
      const { adminLinks } = await import('/admin/static/menu.js');
      links.append(...adminLinks(el));
    } catch {
      // rôle retiré entre-temps : menu habituel
    }
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
      nav.classList.toggle('menu', Boolean(user?.admin) || small.matches);
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
