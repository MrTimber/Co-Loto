// Parties à distance (asynchrones) : API de création, de classement et de suivi.
// Le créateur envoie un lien unique à chaque joueur ; chacun classe ses numéros quand il veut.
// Quand tout le monde a répondu, la partie est simulée et la grille enregistrée.
import { randomBytes } from 'node:crypto';
import express from 'express';
import { GAMES, minRanking } from './games.js';
import { GameError, MIN_PLAYERS, normalizeName } from './game.js';
import { DEFAULT_ASYNC_PLAYERS, validatePlayerCount, validateGameType, validateVariant, validateRanking, simulate, parisTime } from './async.js';
import { validateDrawDate } from './drawDate.js';
import { asyncResultEmail } from './mail.js';

const newId = (bytes) => randomBytes(bytes).toString('base64url');

const activeSeats = (seats) => seats.filter((s) => !s.removed);
const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());

// En attente, terminée, ou expirée (date limite passée sans que tout le monde ait répondu).
function statusOf(game, now) {
  if (game.status === 'waiting' && now > game.deadline) return 'expired';
  return game.status;
}

// Ce que voit le joueur de la place `link` : les classements des autres restent secrets,
// seul le créateur voit les liens des places (pour les envoyer ou relancer).
export function asyncView({ game, seats }, link, now = Date.now()) {
  const me = seats.find((s) => s.link === link);
  const isHost = me.seat === 0;
  const players = activeSeats(seats).length;
  const rules = GAMES[game.gameType];
  return {
    id: game.id,
    gameType: game.gameType,
    variant: game.variant,
    drawDate: game.drawDate,
    createdAt: iso(game.createdAt),
    deadline: iso(game.deadline),
    status: statusOf(game, now),
    players,
    minimums: Object.fromEntries(rules.phases.map((phase) => [phase.key, minRanking(phase, players, game.variant)])),
    me: {
      seat: me.seat,
      isHost,
      removed: me.removed,
      name: me.name,
      ranking: me.ranking,
      emailResult: me.emailResult,
      submittedAt: iso(me.submittedAt),
    },
    seats: seats.map((s) => ({
      seat: s.seat,
      name: s.submittedAt === null ? null : s.name,
      submittedAt: iso(s.submittedAt),
      removed: s.removed,
      ...(isHost && { link: s.link }),
    })),
  };
}

// Pseudo d'un compte dans la partie : un numéro est ajouté s'il est déjà pris par un autre joueur.
function uniqueName(name, taken) {
  const lower = new Set(taken.map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name.slice(0, 20)} (${i})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export function createAsyncGames({ store, mailer, currentUser, baseUrl }) {
  const router = express.Router();

  function fail(res, err) {
    if (!(err instanceof GameError)) {
      console.error(err);
      return res.status(500).json({ error: 'Erreur inattendue.' });
    }
    res.status(err.status ?? 400).json({ error: err.message, code: err.code });
  }

  async function load(link, now = Date.now()) {
    const found = await store.getAsyncGame(link, now);
    if (!found) throw Object.assign(new GameError('not_found', "Cette partie n'existe pas ou a expiré (30 jours)."), { status: 404 });
    return found;
  }

  function requireWaiting(game, now = Date.now()) {
    const status = statusOf(game, now);
    if (status === 'finished') throw Object.assign(new GameError('finished', 'La partie est terminée.'), { status: 409 });
    if (status === 'expired') throw Object.assign(new GameError('expired', 'La date limite pour répondre est passée.'), { status: 409 });
  }

  // Quand toutes les places encore en jeu ont répondu, simule la partie et enregistre la grille.
  async function maybeFinish(link, req) {
    const { game, seats } = await load(link);
    const active = activeSeats(seats);
    if (game.status !== 'waiting' || active.length < MIN_PLAYERS || active.some((s) => s.submittedAt === null)) return false;
    const result = simulate(game.gameType, active.map((s) => s.ranking), { complete: game.variant === 'quick' });
    if (!result || !(await store.finishAsyncGame(game.id))) return false;
    const rules = GAMES[game.gameType];
    const [main, extra] = rules.phases;
    await store.saveGrid({
      id: game.id,
      gameType: game.gameType,
      numbers: result.validated[main.key],
      bonus: result.validated[extra.key],
      players: active.map((s) => s.name),
      rounds: result.rounds,
      drawDate: game.drawDate,
      participants: active.map((s) => ({ token: s.link, name: s.name, userId: s.userId })),
      mode: 'async',
      validatedRounds: result.validatedRounds,
    });
    await sendResults(req, game, active, rules, result.validated[main.key], result.validated[extra.key]);
    return true;
  }

  // Email du résultat aux joueurs connectés qui l'ont demandé, si leur adresse est vérifiée.
  async function sendResults(req, game, seats, rules, numbers, bonus) {
    if (!mailer) return;
    for (const seat of seats) {
      if (!seat.userId || !seat.emailResult) continue;
      try {
        const user = await store.getUser(seat.userId);
        if (!user?.email || !user.emailVerified) continue;
        await mailer.send({ to: user.email, ...asyncResultEmail(baseUrl(req), game.id, rules, numbers, bonus) });
      } catch (err) {
        console.error('Envoi du résultat impossible :', err.message);
      }
    }
  }

  router.post('/api/parties', async (req, res) => {
    const { gameType = 'loto', players = DEFAULT_ASYNC_PLAYERS, variant = 'full', drawDate } = req.body ?? {};
    try {
      validateGameType(gameType);
      validateVariant(variant);
      const count = validatePlayerCount(Number(players));
      let date;
      try {
        date = validateDrawDate(drawDate, new Date(), gameType);
      } catch (err) {
        throw new GameError('invalid_draw_date', err.message);
      }
      const id = newId(9);
      const links = Array.from({ length: count }, () => newId(12));
      const deadline = date ? parisTime(date, GAMES[gameType].betsCloseAt) : null;
      await store.createAsyncGame({ id, gameType, variant, drawDate: date, deadline, links });
      const user = await currentUser(req);
      if (user) await store.claimAsyncSeat(links[0], user.id);
      store.countEvent('room_created', gameType).catch((err) => console.error('Statistiques indisponibles :', err.message));
      res.status(201).json({ gameId: id, link: links[0] });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/api/parties/:link', async (req, res) => {
    res.set('cache-control', 'no-store');
    try {
      // La place n'est rattachée à un compte qu'à l'envoi du classement : ouvrir le lien d'un autre
      // joueur (le créateur qui le vérifie, par exemple) ne la lui prend pas.
      res.json(asyncView(await load(req.params.link), req.params.link));
    } catch (err) {
      fail(res, err);
    }
  });

  // Classement du joueur (il peut le modifier tant que la partie attend).
  router.put('/api/parties/:link/classement', async (req, res) => {
    try {
      const { game, seats } = await load(req.params.link);
      requireWaiting(game);
      const me = seats.find((s) => s.link === req.params.link);
      if (me.removed) throw new GameError('removed', 'Le créateur vous a retiré de cette partie.');
      const others = activeSeats(seats).filter((s) => s !== me);
      const takenNames = others.filter((s) => s.submittedAt !== null).map((s) => s.name);
      const { name, ranking, emailResult } = req.body ?? {};
      const user = await currentUser(req);
      let userId = me.userId;
      let pseudo;
      if (user && (!me.userId || me.userId === user.id)) {
        if (others.some((s) => s.userId === user.id)) throw new GameError('already_seated', 'Votre compte a déjà une place dans cette partie.');
        userId = user.id;
        pseudo = uniqueName(user.name, takenNames);
      } else {
        pseudo = normalizeName(name);
        if (takenNames.some((n) => n.toLowerCase() === pseudo.toLowerCase())) {
          throw new GameError('name_taken', 'Ce pseudo est déjà utilisé dans cette partie.');
        }
      }
      const clean = validateRanking(game.gameType, ranking, activeSeats(seats).length, game.variant);
      // L'envoi du résultat demande un compte connecté dont l'adresse est vérifiée.
      const wantsEmail = emailResult === true && Boolean(user?.emailVerified) && userId === user?.id;
      if (!(await store.saveAsyncRanking(me.link, { name: pseudo, userId, ranking: clean, emailResult: wantsEmail }))) {
        throw Object.assign(new GameError('finished', 'La partie est terminée.'), { status: 409 });
      }
      const finished = await maybeFinish(me.link, req);
      res.json({ ok: true, finished, gridId: finished ? game.id : null });
    } catch (err) {
      fail(res, err);
    }
  });

  // Le créateur retire un joueur qui n'a pas répondu, à condition qu'au moins 2 joueurs aient répondu.
  router.delete('/api/parties/:link/places/:seat', async (req, res) => {
    try {
      const { game, seats } = await load(req.params.link);
      const me = seats.find((s) => s.link === req.params.link);
      if (me.seat !== 0) throw Object.assign(new GameError('not_host', 'Seul le créateur peut retirer un joueur.'), { status: 403 });
      requireWaiting(game);
      const seat = Number(req.params.seat);
      const target = seats.find((s) => s.seat === seat);
      if (!target || target.removed || target.seat === 0) throw new GameError('invalid_seat', 'Cette place ne peut pas être retirée.');
      if (target.submittedAt !== null) throw new GameError('already_submitted', 'Ce joueur a déjà classé ses numéros.');
      if (activeSeats(seats).filter((s) => s.submittedAt !== null).length < MIN_PLAYERS) {
        throw new GameError('not_enough_answers', `Il faut qu'au moins ${MIN_PLAYERS} joueurs aient répondu pour retirer un joueur absent.`);
      }
      await store.removeAsyncSeat(game.id, seat);
      const finished = await maybeFinish(me.link, req);
      res.json({ ok: true, finished, gridId: finished ? game.id : null });
    } catch (err) {
      fail(res, err);
    }
  });

  // Parties à distance en cours : celles du compte connecté et celles des liens `links` gardés
  // par l'appareil. Pour la page « Mes parties en cours ».
  async function ongoing(user, links, now = Date.now()) {
    const found = user ? await store.listUserAsyncGames(user.id, now) : [];
    const seen = new Set(found.map((f) => f.game.id));
    for (const link of links) {
      const game = await store.getAsyncGame(link, now);
      if (!game || seen.has(game.game.id) || game.game.status !== 'waiting') continue;
      if (game.seats.find((s) => s.link === link).removed) continue;
      seen.add(game.game.id);
      found.push({ ...game, link });
    }
    return found
      .map(({ game, link, seats }) => {
        const { gameType, variant, drawDate, createdAt, deadline, status, players, me, seats: places } = asyncView({ game, seats }, link, now);
        return {
          kind: 'async',
          url: `/partie/${link}`,
          gameType,
          variant,
          drawDate,
          createdAt,
          deadline,
          status,
          players,
          me: { seat: me.seat, isHost: me.isHost, submittedAt: me.submittedAt },
          // Les liens des autres places restent sur la page de la partie.
          seats: places.map(({ seat, name, submittedAt, removed }) => ({ seat, name, submittedAt, removed })),
        };
      })
      .filter((g) => g.status === 'waiting');
  }

  return { router, ongoing };
}
