import { escapeHtml, formatDrawDate, ball } from './common.js';

const id = decodeURIComponent(location.pathname.split('/').pop());
const card = document.getElementById('grid-card');
const dateFormat = { day: 'numeric', month: 'long', year: 'numeric' };

try {
  const res = await fetch(`/api/grilles/${encodeURIComponent(id)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  const created = new Date(body.createdAt).toLocaleDateString('fr-FR', dateFormat);
  const expires = new Date(body.expiresAt).toLocaleDateString('fr-FR', dateFormat);
  card.innerHTML = `
    <h1>Grille co-créée</h1>
    <div class="summary big">${body.numbers.map((n) => ball(n, 'validated')).join('')}${ball(body.chance, 'chance')}</div>
    <p>Choisie par ${listNames(body.players)} en ${body.rounds} tours, le ${created}.</p>
    ${body.drawDate ? `<p>Tirage prévu : ${formatDrawDate(body.drawDate)}. La vérification des résultats arrivera dans une prochaine version.</p>` : ''}
    <p class="muted small">Cette page reste consultable jusqu'au ${expires}.</p>`;
} catch (err) {
  card.innerHTML = `<h1>Grille introuvable</h1><p class="muted">${escapeHtml(err.message || 'Impossible de charger la grille.')}</p>`;
}

function listNames(names) {
  const bold = names.map((n) => `<strong>${escapeHtml(n)}</strong>`);
  return bold.length > 1 ? `${bold.slice(0, -1).join(', ')} et ${bold.at(-1)}` : bold.join('');
}
