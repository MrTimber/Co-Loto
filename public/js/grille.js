import { formatDrawDate, rulesFor, applyTheme } from './common.js';
import { renderGridAccountOffer } from './account.js';
import { renderPlayOptions } from './play-options.js';

const id = decodeURIComponent(location.pathname.split('/').pop());
const card = document.getElementById('grid-card');
const dateFormat = { day: 'numeric', month: 'long', year: 'numeric' };

// La page est construite nœud par nœud : aucune donnée reçue n'est interprétée comme du HTML.
function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function balls(numbers, extra) {
  return numbers.map((n) => el('span', `ball ${extra}`, String(n)));
}

function listNames(names) {
  const bold = names.map((n) => el('strong', '', n));
  return bold.flatMap((node, i) => {
    if (i === 0) return [node];
    return [i === bold.length - 1 ? ' et ' : ', ', node];
  });
}

try {
  const res = await fetch(`/api/grilles/${encodeURIComponent(id)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  const rules = rulesFor(body.gameType);
  applyTheme(rules.id);
  const badge = document.getElementById('header-badge');
  badge.textContent = rules.name;
  badge.hidden = false;
  document.title = `Co-Loto · Votre grille ${rules.name}`;
  const created = new Date(body.createdAt).toLocaleDateString('fr-FR', dateFormat);
  const expires = new Date(body.expiresAt).toLocaleDateString('fr-FR', dateFormat);
  const [numbers, bonus] = rules.phases;
  const options = el('div', 'play-options');
  const overflow = renderPlayOptions(options, rules, { [numbers.key]: body.numbers, [bonus.key]: body.bonus });
  card.replaceChildren(
    el('h1', '', `Votre grille ${rules.name}`),
    overflow ? options : el('div', 'summary big', ...balls(body.numbers, 'validated'), ...balls(body.bonus, 'bonus')),
    el('p', '', 'Co-créée par ', ...listNames(body.players), ` en ${body.rounds} tours, le ${created}.`),
  );
  if (body.drawDate) {
    card.append(el('p', '', `Tirage prévu : ${formatDrawDate(body.drawDate)}. La vérification des résultats arrivera dans une prochaine version.`));
  }
  card.append(el('p', 'muted small', `Cette page reste consultable jusqu'au ${expires}.`));
  await renderGridAccountOffer(document.getElementById('account-offer'), id);
} catch (err) {
  card.replaceChildren(el('h1', '', 'Grille introuvable'), el('p', 'muted', err.message || 'Impossible de charger la grille.'));
}
