import { getAccount, claimStoredGrids, providerButtons, logoutButton } from './account.js';
import { rulesFor, formatDrawDate, formatDay, ballNodes, el, NAME_KEY } from './common.js';

const card = document.getElementById('my-grids');
const PROVIDER_NAMES = { google: 'Google', microsoft: 'Microsoft', github: 'GitHub', discord: 'Discord', facebook: 'Facebook', dev: 'le compte de test' };

function gridItem(grid) {
  const rules = rulesFor(grid.gameType);
  const created = formatDay(grid.createdAt);
  const link = el('a', '', `${rules.name} du ${created}`);
  link.href = `/grille/${encodeURIComponent(grid.id)}`;
  const remove = el('button', 'link small', 'Retirer');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Retirer la grille ${rules.name} du ${created} de mes grilles`);
  const item = el(
    'li',
    'my-grid',
    el('p', 'my-grid-title', link),
    el('div', 'summary', ...ballNodes(grid.numbers, grid.bonus)),
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

const providerNames = (ids) => ids.map((id) => PROVIDER_NAMES[id] ?? id).join(', ');

// L'adresse email vient du service de connexion : affichée, jamais modifiable.
// Une adresse non vérifiée peut l'être grâce à un lien envoyé par email.
function emailInfo(user, providers, canVerify) {
  if (user.email) {
    const badge = user.emailVerified ? el('span', 'tag ok', 'Vérifiée') : el('span', 'tag warn', 'Non vérifiée');
    const box = el('div', 'field', el('p', 'field-label', 'Adresse email'), el('p', 'field-value', user.email, ' ', badge));
    if (user.emailVerified) {
      box.append(el('p', 'small muted', 'Fournie par le service de connexion, elle identifie votre compte.'));
    } else {
      box.append(el('p', 'small muted', 'Le service de connexion ne l’a pas vérifiée. Vérifiez-la pour recevoir les résultats par email.'));
      if (canVerify) {
        const verify = el('button', 'small', 'Vérifier mon adresse');
        verify.type = 'button';
        const status = el('output', 'small');
        verify.addEventListener('click', async () => {
          verify.disabled = true;
          const res = await fetch('/api/compte/verification', { method: 'POST' }).catch(() => null);
          const body = await res?.json().catch(() => ({}));
          status.className = res?.ok ? 'small' : 'small error';
          status.textContent = res?.ok ? `Un email vient d’être envoyé à ${user.email} : ouvrez le lien qu’il contient.` : (body?.error ?? 'Envoi impossible, réessayez.');
          if (!res?.ok) verify.disabled = false;
        });
        box.append(el('div', 'actions', verify, status));
      }
    }
    return box;
  }
  const others = providers.filter((p) => !user.providers.includes(p.id));
  return el(
    'div',
    'field',
    el('p', 'field-label', 'Adresse email'),
    el('p', 'small muted', 'Votre compte n’a pas d’adresse email : le service utilisé ne l’a pas fournie. Connectez-vous ici avec un autre service pour l’ajouter.'),
    others.length ? providerButtons(others, '/mon-espace') : '',
  );
}

function profileForm(user, providers, canVerify) {
  const form = el('form', 'profile');
  const field = (label, input) => el('label', '', label, input);
  const name = el('input');
  Object.assign(name, { name: 'name', required: true, maxLength: 24, autocomplete: 'nickname', value: user.name });
  const consent = el('input');
  Object.assign(consent, { name: 'emailConsent', type: 'checkbox', checked: user.emailConsent, disabled: !user.emailVerified });
  const consentLabel = el('label', 'inline', consent, ' M\u2019envoyer par email le résultat de mes grilles qui ont une date de tirage');
  // Case désactivée sans adresse vérifiée : texte grisé et infobulle, au survol (case ou texte) et au toucher.
  if (!user.emailVerified) {
    const tip = el('span', 'tooltip', 'Option disponible une fois votre adresse email vérifiée.');
    tip.id = 'consent-tip';
    tip.setAttribute('role', 'tooltip');
    consent.setAttribute('aria-describedby', tip.id);
    consentLabel.classList.add('disabled', 'has-tooltip');
    consentLabel.append(tip);
    consentLabel.addEventListener('click', () => consentLabel.classList.toggle('tip-open'));
    document.addEventListener('click', (event) => {
      if (!consentLabel.contains(event.target)) consentLabel.classList.remove('tip-open');
    });
  }
  const status = el('output', 'small');
  const save = el('button', 'primary', 'Enregistrer');
  save.type = 'submit';
  form.append(
    el('h2', '', 'Mon compte'),
    field('Pseudo', name),
    emailInfo(user, providers, canVerify),
    consentLabel,
    el('p', 'small muted', 'L\u2019envoi des résultats arrivera dans une prochaine version. Vous pouvez retirer cet accord à tout moment.'),
    el('div', 'actions', save, status),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.className = 'small';
    const res = await fetch('/api/compte', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.value, emailConsent: consent.checked }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok) {
      status.textContent = 'Enregistré.';
      localStorage.setItem(NAME_KEY, name.value.trim());
    } else {
      status.className = 'small error';
      status.textContent = body?.error ?? 'Enregistrement impossible, réessayez.';
    }
  });
  return form;
}

function accountActions(user) {
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
    el('p', 'small muted', `Connexion avec ${providerNames(user.providers)}. `, privacy),
    el('div', 'actions', logoutButton()),
    el('div', 'danger-zone', remove),
  ];
}

// Le compte existait avec cette adresse avant qu'elle soit vérifiée : quelqu'un d'autre a pu
// l'utiliser et y ajouter des grilles.
function reviewWarning() {
  const done = el('button', 'small', 'J’ai vérifié mes grilles');
  done.type = 'button';
  const box = el(
    'div',
    'banner warn',
    el('p', '', 'Votre adresse email est maintenant vérifiée, et ce compte l’utilisait déjà. Si quelqu’un d’autre avait utilisé votre adresse, certaines grilles ci-dessous peuvent ne pas être les vôtres : retirez-les avec « Retirer ».'),
    el('div', 'actions', done),
  );
  done.addEventListener('click', async () => {
    const res = await fetch('/api/compte/grilles-a-verifier', { method: 'DELETE' }).catch(() => null);
    if (res?.ok) box.remove();
  });
  return box;
}

const { user, providers, emailVerification } = await getAccount();
const verification = new URLSearchParams(location.search).get('verification');
if (verification) history.replaceState(null, '', location.pathname);
if (user) {
  await claimStoredGrids();
  const res = await fetch('/api/compte/grilles');
  const grids = res.ok ? await res.json() : [];
  card.replaceChildren(el('h1', '', 'Mon espace'));
  if (verification === 'ok') card.append(el('p', 'banner', '✓ Votre adresse email est vérifiée.'));
  if (verification === 'echec') card.append(el('p', 'banner warn', 'Ce lien de vérification n’est plus valable. Demandez-en un nouveau ci-dessous.'));
  card.append(el('h2', '', 'Mes grilles'));
  if (user.reviewGrids && grids.length) card.append(reviewWarning());
  if (grids.length) {
    card.append(el('ul', 'my-grids', ...grids.map(gridItem)));
  } else {
    card.append(el('p', 'muted', 'Aucune grille pour l’instant. Les grilles que vous co-créez en étant connecté apparaissent ici pendant 30 jours.'));
  }
  card.append(profileForm(user, providers, emailVerification), ...accountActions(user));
} else {
  card.replaceChildren(
    el('h1', '', 'Mon espace'),
    el('p', '', 'Connectez-vous pour retrouver les grilles que vous avez co-créées, pendant 30 jours.'),
    providers.length ? providerButtons(providers, '/mon-espace') : el('p', 'muted', 'La connexion n’est pas encore disponible sur ce site.'),
  );
}
