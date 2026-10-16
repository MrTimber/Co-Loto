// « Mes parties en cours » : les salons en direct où cet appareil joue encore, et les parties à
// distance (celles ouvertes sur cet appareil et celles du compte connecté).
import { storedTokenIds, loadToken, el, rulesFor, formatDrawDate, formatMoment, seatItems, VARIANTS } from './common.js';
import { getAccount, providerButtons } from './account.js';

const card = document.getElementById('my-games');

function liveItem(game, rules) {
  const link = el('a', '', game.status === 'lobby' ? `Salon ${rules.ofName}` : `Partie ${rules.ofName} en direct`);
  link.href = game.url;
  const state = game.status === 'lobby' ? `en attente des joueurs (${game.players.length}/${game.maxPlayers})` : `tour ${game.round}`;
  const players = game.players.map((p) => `${p.name}${p.me ? ' (vous)' : ''}`).join(', ');
  return [
    el('p', '', el('strong', '', link), ' ', el('span', 'tag', 'en direct')),
    el('p', 'small muted', `${state} · avec ${players}${game.drawDate ? ` · tirage du ${formatDrawDate(game.drawDate)}` : ''}`),
    el('p', 'small muted', 'Revenez-y vite : un joueur absent plus de 90 secondes quitte la partie.'),
  ];
}

function asyncItem(game, rules) {
  const link = el('a', '', `Partie ${rules.ofName} à distance`);
  link.href = game.url;
  const answered = game.seats.filter((s) => !s.removed && s.submittedAt).length;
  const todo = game.me.submittedAt ? 'vous avez répondu' : 'à vous de classer vos numéros';
  return [
    el('p', '', el('strong', '', link), ' ', el('span', game.me.submittedAt ? 'tag ok' : 'tag warn', todo)),
    el(
      'p',
      'small muted',
      `${VARIANTS[game.variant].name} · créée le ${formatMoment(game.createdAt)} · ${answered}/${game.players} joueurs ont répondu`,
      game.drawDate ? ` · tirage du ${formatDrawDate(game.drawDate)}` : '',
      ` · réponses jusqu'au ${formatMoment(game.deadline)}`,
    ),
    el('ul', 'players', ...seatItems(game.seats, game.me.seat)),
  ];
}

const parties = storedTokenIds().map((id) => ({ id, token: loadToken(id) }));
const [res, { user, providers }] = await Promise.all([
  fetch('/api/mes-parties', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parties }) }).catch(() => null),
  getAccount(),
]);
const games = res?.ok ? await res.json() : null;
card.replaceChildren(el('h1', '', 'Mes parties en cours'));
if (!games) {
  card.append(el('p', 'muted', 'Liste indisponible, réessayez dans un instant.'));
} else if (games.length) {
  card.append(
    el(
      'ul',
      'my-games',
      ...games.map((game) => {
        const rules = rulesFor(game.gameType);
        const item = el('li', '', ...(game.kind === 'live' ? liveItem(game, rules) : asyncItem(game, rules)));
        item.dataset.game = rules.id;
        return item;
      }),
    ),
  );
} else {
  card.append(el('p', 'muted', 'Aucune partie en cours. Les grilles terminées sont dans « Mon espace ».'));
}
if (!user && providers.length) {
  card.append(
    el('p', 'small muted', 'Cette liste vient de cet appareil. Connectez-vous pour retrouver aussi vos parties à distance ouvertes ailleurs.'),
    providerButtons(providers, '/mes-parties'),
  );
}
