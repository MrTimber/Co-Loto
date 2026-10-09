import { gridCost } from './games.js';
import { countLabel } from './common.js';

// Quand plusieurs numéros ont été validés au même tour, la grille peut en compter plus que prévu.
// Chacun choisit alors, de son côté, les numéros à jouer : tous (grille multiple, plus chère)
// ou seulement le nombre classique (grille simple). Co-Loto ne fait qu'informer : rien n'est parié ici.

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

// « 7 numéros au lieu de 5 », pour chaque phase en surnombre.
export function overflowSummary(rules, validated) {
  return rules.phases
    .filter((phase) => validated[phase.key].length > phase.count)
    .map((phase) => `${countLabel(phase, validated[phase.key].length)} au lieu de ${phase.count}`);
}

const joinParts = (parts) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts[0]);

// Affiche les numéros à cocher ou décocher à la place de la grille finale. Renvoie false
// (et n'affiche rien) quand la grille a exactement le nombre de numéros prévu.
export function renderPlayOptions(container, rules, validated) {
  const overflow = overflowSummary(rules, validated);
  container.hidden = overflow.length === 0;
  if (container.hidden) {
    container.replaceChildren();
    return false;
  }

  const [main, extra] = rules.phases;
  const kept = new Set(rules.phases.flatMap((phase) => validated[phase.key].map((n) => `${phase.key}:${n}`)));
  const status = el('p', 'play-status');
  status.setAttribute('aria-live', 'polite');

  const toggles = rules.phases.flatMap((phase, index) =>
    validated[phase.key].map((n) => {
      const button = el('button', `ball toggle ${index > 0 ? 'bonus' : 'validated'}`, String(n));
      button.type = 'button';
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', `${phase.one} ${n}`);
      button.addEventListener('click', () => {
        const key = `${phase.key}:${n}`;
        if (kept.has(key)) kept.delete(key);
        else kept.add(key);
        button.setAttribute('aria-pressed', String(kept.has(key)));
        update();
      });
      return button;
    }),
  );

  const keptCount = (phase) => validated[phase.key].filter((n) => kept.has(`${phase.key}:${n}`)).length;

  function update() {
    const numbers = keptCount(main);
    const bonus = keptCount(extra);
    const cost = gridCost(rules, numbers, bonus);
    const selection = `${countLabel(main, numbers)} et ${countLabel(extra, bonus)}`;
    status.classList.toggle('warn', cost.status === 'too_few' || cost.status === 'not_allowed');
    if (cost.status === 'simple') {
      status.textContent = `Grille simple : ${euros.format(cost.price)} par tirage.`;
    } else if (cost.status === 'multiple') {
      status.textContent = `Grille multiple de ${selection} : ${cost.combinations} combinaisons, ${euros.format(cost.price)} par tirage.`;
    } else if (cost.status === 'too_few') {
      status.textContent = `Gardez au moins ${countLabel(main)} et ${countLabel(extra)}.`;
    } else {
      status.textContent = `${rules.theName} n'autorise pas de grille multiple de ${selection}. ${limitText(rules, numbers)}`;
    }
  }

  container.replaceChildren(
    el('div', 'summary big', ...toggles),
    el('p', '', `Plusieurs numéros ont été validés au même tour : votre grille compte ${joinParts(overflow)}.`),
    el(
      'p',
      'small',
      'Vous pouvez tous les jouer en grille multiple, plus chère, ou en écarter pour jouer une grille simple : touchez un numéro pour l’écarter ou le reprendre.',
    ),
    status,
    el(
      'p',
      'muted small',
      `Prix d'une grille simple : ${euros.format(rules.price)}, sans option. Limites et prix d'après le règlement FDJ ; le montant exact s'affiche au moment de jouer.`,
    ),
  );
  update();
  return true;
}

// « Avec 9 numéros, 1 numéro chance au plus. » ou « 9 numéros au plus en grille multiple. »
function limitText(rules, numbers) {
  const [main, extra] = rules.phases;
  const maxBonus = rules.multiple[numbers];
  if (maxBonus) return `Avec ${countLabel(main, numbers)}, ${countLabel(extra, maxBonus)} au plus.`;
  const maxNumbers = Math.max(...Object.keys(rules.multiple).map(Number));
  return `${countLabel(main, maxNumbers)} au plus en grille multiple.`;
}
