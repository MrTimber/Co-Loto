// Entrées du menu réservées aux administrateurs (servies seulement à eux, voir src/admin.js).
export const ADMIN_PAGES = [
  ['/admin', 'Tableau de bord'],
  ['/admin/utilisateurs', 'Utilisateurs'],
  ['/admin/frequentation', 'Fréquentation'],
  ['/admin/numeros', 'Numéros joués'],
];

export function adminLinks(el, pageLink) {
  return [el('p', 'menu-heading', 'Administration'), ...ADMIN_PAGES.map(([href, label]) => pageLink(href, label))];
}
