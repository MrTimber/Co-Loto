import { getAccount, providerButtons } from './account.js';
import { el } from './common.js';

const params = new URLSearchParams(location.search);
const retour = params.get('retour') || '/mon-espace';
const box = document.getElementById('login-providers');

if (params.has('erreur')) {
  document.getElementById('login-error').textContent =
    params.get('erreur') === 'email'
      ? 'Un compte existe déjà avec l’adresse email de ce service, mais elle n’a pas pu être confirmée par email. Connectez-vous avec le service habituel de ce compte.'
      : 'La connexion n’a pas abouti. Vous pouvez réessayer.';
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
