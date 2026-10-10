import { getAccount, providerButtons, el } from './account.js';

const params = new URLSearchParams(location.search);
const retour = params.get('retour') || '/mon-espace';
const box = document.getElementById('login-providers');

if (params.has('erreur')) {
  document.getElementById('login-error').textContent = 'La connexion n’a pas abouti. Vous pouvez réessayer.';
}

const { user, providers } = await getAccount();
if (user) {
  const link = el('a', '', 'Mon espace');
  link.href = '/mon-espace';
  box.replaceChildren(el('p', '', `Vous êtes déjà connecté en tant que ${user.name}. Retrouvez vos grilles dans `, link, '.'));
} else if (providers.length) {
  box.replaceChildren(providerButtons(providers, retour));
} else {
  box.replaceChildren(el('p', 'muted', 'La connexion n’est pas encore disponible sur ce site.'));
}
