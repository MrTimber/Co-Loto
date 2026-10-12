// Espace d'administration : tableau de bord, utilisateurs, fréquentation et numéros joués.
// Tout est construit nœud par nœud : aucune donnée reçue n'est interprétée comme du HTML.
import { el, formatDrawDate, formatDay, ballNodes } from '/js/common.js';
import { GAMES, todayInFrance } from '/js/games.js';
import { ADMIN_PAGES } from './menu.js';

const view = document.getElementById('admin-view');
const section = location.pathname.split('/')[2] ?? '';
const PROVIDERS = { google: 'Google', microsoft: 'Microsoft', github: 'GitHub', discord: 'Discord', facebook: 'Facebook', dev: 'Compte de test' };
const PAGE_NAMES = { '/': 'Accueil', '/salon': 'Salons', '/grille': 'Grilles co-créées', '/connexion': 'Connexion', '/mon-espace': 'Mon espace', '/confidentialite': 'Confidentialité' };
const number = new Intl.NumberFormat('fr-FR');
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const shortDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const gameName = (id) => GAMES[id]?.name ?? id;
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function getJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Chargement impossible.');
  return body;
}

function button(label, className = '') {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
}

// Liste déroulante : `choices` est une liste de [valeur, libellé].
function selectOf(choices, selected) {
  const select = el('select');
  for (const [value, label] of choices) {
    const option = el('option', '', label);
    option.value = String(value);
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

// Onglets
const tabs = document.getElementById('admin-tabs');
for (const [href, label] of ADMIN_PAGES) {
  const link = el('a', '', label);
  link.href = href;
  if (location.pathname.replace(/\/$/, '') === href) link.setAttribute('aria-current', 'page');
  tabs.append(link);
}

// --- Éléments de présentation ---

function tile(label, value, detail) {
  return el('div', 'tile', el('p', 'tile-label', label), el('p', 'tile-value', value), detail ? el('p', 'tile-detail', detail) : '');
}

function panel(title, ...children) {
  return el('section', 'card admin-panel', el('h2', '', title), ...children);
}

// Histogramme d'une série : chaque barre porte sa valeur au survol, et un tableau donne les chiffres exacts.
function barChart(points, { label, unit = '' }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const bars = el('div', 'bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${label} : ${points.map((p) => `${p.label} ${p.value}`).join(', ')}`);
  for (const p of points) {
    const bar = el('span', 'bar');
    bar.style.setProperty('--h', `${(p.value / max) * 100}%`);
    const tip = `${p.label} : ${number.format(p.value)}${unit}`;
    bar.title = tip;
    bar.dataset.tip = tip;
    bars.append(el('span', 'bar-slot', bar));
  }
  const axis = el('div', 'bars-axis small muted', el('span', '', points[0]?.label ?? ''), el('span', '', points.at(-1)?.label ?? ''));
  const table = el('table', 'data-table');
  table.append(el('thead', '', el('tr', '', el('th', '', 'Période'), el('th', '', label))));
  table.append(el('tbody', '', ...points.map((p) => el('tr', '', el('td', '', p.label), el('td', '', number.format(p.value))))));
  return el(
    'figure',
    'chart',
    el('figcaption', '', label, el('span', 'muted', ` · max ${number.format(max)}${unit}`)),
    el('div', 'bars-frame', el('span', 'bars-max small muted', number.format(max)), bars),
    axis,
    el('details', 'small', el('summary', '', 'Voir les chiffres'), table),
  );
}

// Liste classée avec une barre proportionnelle.
function rankList(rows, names = {}, empty = 'Aucune donnée sur cette période.') {
  if (!rows.length) return el('p', 'muted small', empty);
  const max = Math.max(...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return el(
    'ul',
    'rank',
    ...rows.map((r) => {
      const meter = el('span', 'rank-meter');
      meter.style.setProperty('--w', `${(r.count / max) * 100}%`);
      return el(
        'li',
        '',
        el('span', 'rank-label', names[r.key] ?? r.key ?? '—'),
        el('span', 'rank-value', number.format(r.count), el('span', 'muted', ` · ${percent.format(r.count / total)}`)),
        meter,
      );
    }),
  );
}

// --- Tableau de bord ---

async function renderOverview() {
  const data = await getJson('/api/admin/apercu');
  const { live, visits, month, users } = data;
  const conversion = month.roomsCreated ? `${percent.format(month.gamesFinished / month.roomsCreated)} des salons créés` : null;
  view.replaceChildren(
    panel(
      'En ce moment',
      el(
        'div',
        'tiles',
        tile('Salons en attente', number.format(live.rooms.lobby)),
        tile('Parties en cours', number.format(live.rooms.playing)),
        tile('Joueurs dans les salons', number.format(live.players)),
        tile('Connexions temps réel', number.format(live.connections)),
      ),
      Object.keys(live.games).length
        ? el('p', 'small muted', 'Salons ouverts par jeu : ', Object.entries(live.games).map(([g, n]) => `${gameName(g)} ${n}`).join(', '))
        : '',
    ),
    panel(
      'Visites',
      el(
        'div',
        'tiles',
        tile('Aujourd’hui', number.format(visits.today.visitors), `visiteurs · ${number.format(visits.today.views)} pages vues`),
        tile('7 derniers jours', number.format(visits.week.visitors), `visites · ${number.format(visits.week.views)} pages vues`),
        tile('30 derniers jours', number.format(visits.month.visitors), `visites · ${number.format(visits.month.views)} pages vues`),
      ),
      el('p', 'small muted', 'Un visiteur est compté une fois par jour : sur 7 ou 30 jours, c’est la somme des visiteurs de chaque jour.'),
    ),
    panel(
      '30 derniers jours',
      el(
        'div',
        'tiles',
        tile('Salons créés', number.format(month.roomsCreated)),
        tile('Grilles co-créées', number.format(month.gamesFinished), conversion),
        tile('Nouveaux comptes', number.format(month.signups)),
        tile('Connexions', number.format(month.logins)),
      ),
    ),
    panel(
      'Comptes',
      el(
        'div',
        'tiles',
        tile('Comptes', number.format(users.total), `${number.format(users.recent)} créés en 30 jours`),
        tile('Administrateurs', number.format(users.admins + (data.superadminEmail ? 1 : 0)), 'superadmin compris'),
        tile('Résultats par email', number.format(users.emailConsents), 'comptes qui l’acceptent'),
        tile('Grilles consultables', number.format(data.activeGrids), 'créées il y a moins de 30 jours'),
      ),
      el('p', 'small muted', data.superadminEmail ? `Superadmin : ${data.superadminEmail}` : 'Aucun superadmin défini (variable SUPERADMIN_EMAIL).'),
    ),
    panel(
      'Grilles par jeu',
      data.games.length
        ? el(
            'table',
            'data-table wide',
            el('thead', '', el('tr', '', ...['Jeu', 'Sur 30 jours', 'Sur 3 ans', 'Joueurs en moyenne', 'Tours en moyenne'].map((h) => el('th', '', h)))),
            el(
              'tbody',
              '',
              ...data.games.map((g) =>
                el(
                  'tr',
                  '',
                  el('td', '', gameName(g.gameType)),
                  el('td', '', number.format(g.recent)),
                  el('td', '', number.format(g.total)),
                  el('td', '', decimal.format(g.averagePlayers)),
                  el('td', '', decimal.format(g.averageRounds)),
                ),
              ),
            ),
          )
        : el('p', 'muted small', 'Aucune grille co-créée pour l’instant.'),
      el('p', 'small muted', 'Les numéros des grilles sont gardés 3 ans pour les statistiques, sans les pseudos ni aucun lien vers les joueurs.'),
    ),
  );
}

// --- Utilisateurs ---

function roleTag(user) {
  if (user.role === 'superadmin') return el('span', 'tag role', 'Superadmin');
  if (user.role === 'admin') return el('span', 'tag role', 'Admin');
  return '';
}

function userGrids(grids) {
  if (!grids.length) return el('p', 'small muted', 'Aucune grille consultable (les grilles sont effacées 30 jours après leur création).');
  return el(
    'ul',
    'user-grids',
    ...grids.map((grid) => {
      const link = el('a', '', `${gameName(grid.gameType)} du ${formatDay(grid.createdAt)}`);
      link.href = `/grille/${encodeURIComponent(grid.id)}`;
      const balls = el('span', 'summary', ...ballNodes(grid.numbers, grid.bonus));
      const item = el('li', '', link, balls, el('span', 'small muted', `Pseudo : ${grid.playerName} · avec ${grid.players.join(', ')}`));
      item.dataset.game = grid.gameType;
      return item;
    }),
  );
}

function userItem(user, { canManage }) {
  const details = [
    user.providers.map((p) => PROVIDERS[p] ?? p).join(', '),
    user.email ? `${user.email} (${user.emailVerified ? 'vérifiée' : 'non vérifiée'})` : 'sans email',
    user.emailConsent ? 'accepte les résultats par email' : null,
    `inscrit le ${formatDay(user.createdAt)}`,
    user.lastLoginAt ? `dernière connexion le ${formatDay(user.lastLoginAt)}` : null,
  ].filter(Boolean);
  const gridsButton = button(user.grids ? `Voir ses grilles (${user.grids})` : 'Aucune grille', 'small');
  gridsButton.disabled = !user.grids;
  gridsButton.setAttribute('aria-expanded', 'false');
  const gridsBox = el('div', 'user-grids-box');
  gridsBox.hidden = true;
  const actions = el('div', 'actions', gridsButton);
  const status = el('p', 'small error');
  status.setAttribute('role', 'alert');
  const item = el('li', 'user', el('p', 'user-name', user.name, ' ', roleTag(user)), el('p', 'small muted', details.join(' · ')), actions, status, gridsBox);
  item.dataset.search = `${user.name} ${user.email ?? ''} ${user.providers.join(' ')}`.toLowerCase();

  gridsButton.addEventListener('click', async () => {
    const open = gridsBox.hidden;
    gridsBox.hidden = !open;
    gridsButton.setAttribute('aria-expanded', String(open));
    if (open && !gridsBox.childElementCount) {
      try {
        gridsBox.append(userGrids(await getJson(`/api/admin/utilisateurs/${encodeURIComponent(user.id)}/grilles`)));
      } catch (err) {
        gridsBox.append(el('p', 'small error', err.message));
      }
    }
  });

  if (canManage && user.role !== 'superadmin') {
    const toggle = button(user.role === 'admin' ? 'Retirer le rôle admin' : 'Nommer admin', 'small');
    // Le rôle admin n'est donné qu'à un compte dont l'adresse est vérifiée.
    if (user.role !== 'admin' && !user.emailVerified) {
      toggle.disabled = true;
      toggle.title = 'Adresse email non vérifiée';
    }
    toggle.addEventListener('click', async () => {
      const makeAdmin = user.role !== 'admin';
      const question = makeAdmin ? `Nommer ${user.name} administrateur ? Il verra les comptes, leurs emails et les statistiques.` : `Retirer le rôle admin à ${user.name} ?`;
      if (!confirm(question)) return;
      try {
        const updated = await getJson(`/api/admin/utilisateurs/${encodeURIComponent(user.id)}/admin`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ admin: makeAdmin }),
        });
        item.replaceWith(userItem({ ...user, role: updated.role ?? null }, { canManage }));
      } catch (err) {
        status.textContent = err.message;
      }
    });
    actions.append(toggle);
  }
  return item;
}

async function renderUsers() {
  const { users, superadminEmail, me } = await getJson('/api/admin/utilisateurs');
  const canManage = users.find((u) => u.id === me)?.role === 'superadmin';
  const search = el('input');
  Object.assign(search, { type: 'search', placeholder: 'Pseudo, email ou fournisseur', autocomplete: 'off' });
  const list = el('ul', 'users', ...users.map((u) => userItem(u, { canManage })));
  const count = el('p', 'small muted');
  const update = () => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    for (const item of list.children) {
      item.hidden = Boolean(query) && !item.dataset.search.includes(query);
      if (!item.hidden) shown++;
    }
    count.textContent = query ? `${shown} compte${shown > 1 ? 's' : ''} sur ${users.length}` : `${users.length} compte${users.length > 1 ? 's' : ''}`;
  };
  search.addEventListener('input', update);
  update();
  const superadminExists = users.some((u) => u.role === 'superadmin');
  view.replaceChildren(
    panel(
      'Utilisateurs',
      el(
        'p',
        'small muted',
        superadminEmail
          ? `Superadmin : ${superadminEmail}${superadminExists ? '' : ' (pas encore actif : le compte qui a cette adresse n’existe pas encore ou ne l’a pas vérifiée)'}.`
          : 'Aucun superadmin défini (variable SUPERADMIN_EMAIL).',
        canManage ? ' Vous pouvez nommer ou retirer les administrateurs.' : ' Seul le superadmin peut nommer ou retirer les administrateurs.',
      ),
      el('label', 'search', 'Rechercher', search),
      count,
      users.length ? list : el('p', 'muted', 'Aucun compte pour l’instant.'),
    ),
  );
}

// --- Fréquentation ---

// Au-delà d'un mois, les jours sont regroupés par semaine pour rester lisibles.
function buckets(days, key) {
  if (days.length <= 31) return days.map((d) => ({ label: shortDate(d.day), value: d[key] }));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    weeks.push({ label: `sem. du ${shortDate(slice[0].day)}`, value: slice.reduce((s, d) => s + d[key], 0) });
  }
  return weeks;
}

async function renderTraffic(days = 30) {
  const data = await getJson(`/api/admin/frequentation?jours=${days}`);
  const select = selectOf([[7, '7 derniers jours'], [30, '30 derniers jours'], [90, '3 derniers mois'], [365, '12 derniers mois']], days);
  select.addEventListener('change', () => renderTraffic(Number(select.value)).catch(showError));
  const grouping = data.days.length > 31 ? ' (par semaine)' : ' (par jour)';
  const games = Object.fromEntries(Object.values(GAMES).map((g) => [g.id, g.name]));
  view.replaceChildren(
    el('div', 'filters', el('label', '', 'Période', select)),
    panel(
      'Visites',
      barChart(buckets(data.days, 'visitors'), { label: `Visiteurs${grouping}` }),
      barChart(buckets(data.days, 'views'), { label: `Pages vues${grouping}` }),
      el(
        'p',
        'small muted',
        'Mesure faite par le site lui-même, sans cookie ni outil externe. Un visiteur est compté une fois par jour grâce à une empreinte anonyme qui change chaque jour ; les robots ne sont pas comptés.',
      ),
    ),
    panel('Activité', barChart(buckets(data.days, 'gamesFinished'), { label: `Grilles co-créées${grouping}` })),
    el(
      'div',
      'columns',
      panel('Pages les plus vues', rankList(data.pages, PAGE_NAMES)),
      panel('Sites d’origine', rankList(data.referrers, {}, 'Aucun visiteur venu d’un autre site sur cette période.')),
      panel('Appareils', rankList(data.devices, { mobile: 'Mobile', tablette: 'Tablette', ordinateur: 'Ordinateur' })),
      panel('Salons créés par jeu', rankList(data.roomsCreated, games)),
      panel('Grilles co-créées par jeu', rankList(data.gamesFinished, games)),
      panel('Nouveaux comptes', rankList(data.signups, PROVIDERS)),
      panel('Connexions', rankList(data.logins, PROVIDERS)),
    ),
  );
}

// --- Numéros joués ---

function numberChart(rows, grids, phase, gameType, bonus) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = [...rows].sort((a, b) => b.count - a.count || a.number - b.number).filter((r) => r.count > 0).slice(0, bonus ? 3 : 10);
  const bars = el('div', 'bars numbers');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${phase.many} : ${rows.map((r) => `${r.number} joué ${r.count} fois`).join(', ')}`);
  for (const r of rows) {
    const bar = el('span', 'bar');
    bar.style.setProperty('--h', `${(r.count / max) * 100}%`);
    const tip = `${r.number} : ${number.format(r.count)} grille${r.count > 1 ? 's' : ''}${grids ? ` (${percent.format(r.count / grids)})` : ''}`;
    bar.title = tip;
    bar.dataset.tip = tip;
    bars.append(el('span', 'bar-slot', bar, el('span', 'bar-label', String(r.number))));
  }
  const figure = el(
    'figure',
    'chart',
    el('figcaption', '', `Fréquence de chaque ${phase.one}`),
    el('div', 'bars-frame', el('span', 'bars-max small muted', number.format(max)), bars),
  );
  const ranking = top.length
    ? el(
        'ol',
        'top-numbers',
        ...top.map((r) =>
          el(
            'li',
            '',
            el('span', `ball ${bonus ? 'bonus' : 'validated'}`, String(r.number)),
            el('span', 'small', `${number.format(r.count)} fois`, el('br'), el('span', 'muted', percent.format(r.count / grids))),
          ),
        ),
      )
    : el('p', 'muted small', 'Aucune grille sur cette période.');
  const box = el('div', 'number-stats', el('h3', '', bonus ? `${phase.many[0].toUpperCase()}${phase.many.slice(1)} les plus joués` : 'Numéros les plus joués'), ranking, figure);
  box.dataset.game = gameType;
  return box;
}

const numbersState = { game: 'loto', mode: 'period', from: addDays(todayInFrance(), -29), to: todayInFrance(), draw: '' };

async function renderNumbers() {
  const s = numbersState;
  const params = new URLSearchParams({ jeu: s.game });
  if (s.mode === 'draw' && s.draw) params.set('tirage', s.draw);
  else {
    params.set('du', s.from);
    params.set('au', s.to);
  }
  const data = await getJson(`/api/admin/numeros?${params}`);
  const rules = GAMES[data.gameType];

  const game = selectOf(Object.values(GAMES).map((g) => [g.id, g.name]), s.game);
  game.addEventListener('change', () => {
    Object.assign(s, { game: game.value, draw: '' });
    refresh();
  });

  const mode = selectOf([['period', 'Une période'], ['draw', 'Un tirage']], s.mode);
  mode.addEventListener('change', () => {
    s.mode = mode.value;
    if (s.mode === 'draw' && !s.draw) s.draw = data.drawDates[0]?.date ?? '';
    refresh();
  });

  const filters = el('div', 'filters', el('label', '', 'Jeu', game), el('label', '', 'Grilles de', mode));
  if (s.mode === 'draw') {
    const draw = selectOf(data.drawDates.map((d) => [d.date, `${formatDrawDate(d.date)} (${d.grids})`]), s.draw);
    if (!data.drawDates.length) draw.append(el('option', '', 'Aucune grille pour ce jeu'));
    draw.disabled = !data.drawDates.length;
    draw.addEventListener('change', () => {
      s.draw = draw.value;
      refresh();
    });
    filters.append(el('label', '', 'Tirage', draw));
  } else {
    const from = el('input');
    const to = el('input');
    Object.assign(from, { type: 'date', value: s.from, max: todayInFrance() });
    Object.assign(to, { type: 'date', value: s.to, max: todayInFrance() });
    const apply = () => {
      if (!from.value || !to.value) return;
      Object.assign(s, { from: from.value, to: to.value });
      refresh();
    };
    from.addEventListener('change', apply);
    to.addEventListener('change', apply);
    const presets = el(
      'div',
      'presets',
      ...[['Aujourd’hui', 0], ['7 jours', 6], ['30 jours', 29], ['3 mois', 90], ['1 an', 364]].map(([label, back]) => {
        const preset = button(label, 'small');
        const today = todayInFrance();
        preset.setAttribute('aria-pressed', String(s.to === today && s.from === addDays(today, -back)));
        preset.addEventListener('click', () => {
          Object.assign(s, { from: addDays(today, -back), to: today });
          refresh();
        });
        return preset;
      }),
    );
    filters.append(el('label', '', 'Du', from), el('label', '', 'Au', to), presets);
  }

  const scope = data.drawDate
    ? `pour le tirage du ${formatDrawDate(data.drawDate)}`
    : data.from === data.to
      ? `créées le ${formatDrawDate(data.from)}`
      : `créées du ${shortDate(data.from)} ${data.from.slice(0, 4)} au ${shortDate(data.to)} ${data.to.slice(0, 4)}`;
  const [numbersPhase, bonusPhase] = rules.phases;
  view.replaceChildren(
    filters,
    panel(
      `${rules.name} : grilles ${scope}`,
      el(
        'div',
        'tiles',
        tile('Grilles', number.format(data.grids)),
        tile('Joueurs par grille', data.grids ? decimal.format(data.averagePlayers) : '—', 'en moyenne'),
        tile('Tours par grille', data.grids ? decimal.format(data.averageRounds) : '—', 'en moyenne'),
      ),
      numberChart(data.numbers, data.grids, numbersPhase, rules.id, false),
      numberChart(data.bonus, data.grids, bonusPhase, rules.id, true),
      el('p', 'small muted', 'Chaque numéro validé compte une fois par grille (y compris les numéros en surnombre). Les grilles sont gardées 3 ans, sans les pseudos des joueurs.'),
    ),
  );
}

function showError(err) {
  view.replaceChildren(el('p', 'error', err.message || 'Chargement impossible.'));
}

function refresh() {
  renderNumbers().catch(showError);
}

const RENDERERS = { '': renderOverview, utilisateurs: renderUsers, frequentation: () => renderTraffic(), numeros: renderNumbers };
(RENDERERS[section] ?? renderOverview)().catch(showError);
