import { formatDrawDate, formatDay, rulesFor, applyTheme, ballNodes, el } from './common.js';
import { renderGridAccountOffer } from './account.js';
import { renderPlayOptions } from './play-options.js';

const id = decodeURIComponent(location.pathname.split('/').pop());
const card = document.getElementById('grid-card');

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
  const created = formatDay(body.createdAt);
  const expires = formatDay(body.expiresAt);
  const [numbers, bonus] = rules.phases;
  const options = el('div', 'play-options');
  const overflow = renderPlayOptions(options, rules, { [numbers.key]: body.numbers, [bonus.key]: body.bonus });
  card.replaceChildren(
    el('h1', '', `Votre grille ${rules.name}`),
    overflow ? options : el('div', 'summary big', ...ballNodes(body.numbers, body.bonus)),
    body.mode === 'async'
      ? el('p', '', 'Co-créée à distance par ', ...listNames(body.players), ` le ${created} : chacun a classé ses numéros, et la partie a été simulée en ${body.rounds} tours.`)
      : el('p', '', 'Co-créée par ', ...listNames(body.players), ` en ${body.rounds} tours, le ${created}.`),
  );
  if (body.mode === 'async' && body.validatedRounds.length) {
    // Tour simulé où chaque numéro a été validé.
    card.append(
      el('details', 'small', el('summary', '', 'Voir à quel tour chaque numéro a été validé'),
        el('ul', 'validated-rounds', ...body.validatedRounds.map((r) => {
          const phaseIndex = rules.phases.findIndex((p) => p.key === r.phase);
          const phase = rules.phases[phaseIndex];
          const label = r.completed ? `${phase.many[0].toUpperCase()}${phase.many.slice(1)} complété${phase.feminine ? 'e' : ''}s : ` : `Tour ${r.round} : `;
          return el('li', '', label, ...r.numbers.map((n) => el('span', `ball ${phaseIndex > 0 ? 'bonus' : 'validated'}`, String(n))));
        }))),
    );
    // Mode éclair : numéros ajoutés parce que la simulation n'a pas rempli la grille.
    const completed = body.validatedRounds.filter((r) => r.completed).flatMap((r) => r.numbers);
    if (completed.length) {
      card.append(el('p', 'small muted', `Les classements n'ont pas suffi à tout trouver ensemble : ${completed.join(', ')} ${completed.length > 1 ? 'ont été ajoutés' : 'a été ajouté'} parce que ${completed.length > 1 ? 'ce sont les numéros les mieux classés' : 'c’est le numéro le mieux classé'} par l'ensemble des joueurs.`));
    }
  }
  if (body.drawDate) {
    card.append(el('p', '', `Tirage prévu : ${formatDrawDate(body.drawDate)}. La vérification des résultats arrivera dans une prochaine version.`));
  }
  card.append(el('p', 'muted small', `Cette page reste consultable jusqu'au ${expires}.`));
  await renderGridAccountOffer(document.getElementById('account-offer'), id);
} catch (err) {
  card.replaceChildren(el('h1', '', 'Grille introuvable'), el('p', 'muted', err.message || 'Impossible de charger la grille.'));
}
