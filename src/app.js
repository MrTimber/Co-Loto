// Serveur HTTP + temps réel (Socket.IO) de Co-Loto.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  GameError,
  DEFAULT_GAME,
  DEFAULT_MAX_PLAYERS,
  GAMES,
  createGame,
  addPlayer,
  removePlayer,
  startGame,
  pick,
  findPlayer,
  viewFor,
} from './game.js';
import { validateDrawDate } from './drawDate.js';
import { createAuth } from './auth.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const GAMES_MODULE = fileURLToPath(new URL('./games.js', import.meta.url));

const newId = (bytes) => randomBytes(bytes).toString('base64url');

function isOnline(room, playerId) {
  for (const socket of room.sockets) if (socket.data.playerId === playerId) return true;
  return false;
}

function broadcast(room) {
  for (const socket of room.sockets) {
    const view = viewFor(room.game, socket.data.playerId);
    view.roomId = room.id;
    view.players = view.players.map((p) => ({ ...p, online: isOnline(room, p.id) }));
    socket.emit('room:state', view);
  }
}

// Exécute une action et renvoie le résultat (ou l'erreur) via l'accusé de réception.
function handle(ack, action) {
  const reply = typeof ack === 'function' ? ack : () => {};
  try {
    const result = action();
    reply({ ok: true, ...result });
  } catch (err) {
    if (!(err instanceof GameError)) console.error(err);
    reply(err instanceof GameError ? { ok: false, code: err.code, error: err.message } : { ok: false, error: 'Erreur inattendue.' });
  }
}

export function createApp({
  store,
  offlineGraceMs = 90_000,
  finishedRoomTtlMs = 10 * 60_000,
  maxRooms = 1000,
  rng = Math.random,
  env = process.env,
} = {}) {
  const rooms = new Map();

  const app = express();
  app.disable('x-powered-by');
  // Derrière le proxy HTTPS de l'hébergeur : nécessaire pour les cookies « Secure ».
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4kb' }));
  app.use(createAuth({ store, env }).router);
  // Les règles des jeux sont partagées avec le navigateur.
  app.get('/js/games.js', (req, res) => res.sendFile(GAMES_MODULE));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.get('/salon/:id', (req, res) => res.sendFile('salon.html', { root: PUBLIC_DIR }));
  app.get('/grille/:id', (req, res) => res.sendFile('grille.html', { root: PUBLIC_DIR }));

  app.get('/api/lobbies', (req, res) => {
    const lobbies = [];
    for (const [id, room] of rooms) {
      const { game } = room;
      if (game.visibility !== 'public' || game.status !== 'lobby' || game.players.length >= game.maxPlayers) continue;
      lobbies.push({
        id,
        gameType: game.gameType,
        host: findPlayer(game, game.hostId)?.name ?? '',
        players: game.players.length,
        maxPlayers: game.maxPlayers,
        drawDate: game.drawDate,
        participants: [...room.tokens].map(([token, playerId]) => ({ token, name: findPlayer(game, playerId)?.name })).filter((p) => p.name),
      });
    }
    res.json(lobbies);
  });

  app.post('/api/rooms', (req, res) => {
    if (rooms.size >= maxRooms) {
      return res.status(503).json({ error: 'Trop de salons sont ouverts, réessayez dans quelques minutes.' });
    }
    const { name, gameType = DEFAULT_GAME, maxPlayers = DEFAULT_MAX_PLAYERS, visibility = 'private', drawDate } = req.body ?? {};
    try {
      const game = createGame({ gameType, maxPlayers: Number(maxPlayers), visibility });
      game.drawDate = validateDrawDate(drawDate, new Date(), game.gameType);
      const id = newId(9);
      const room = { id, game, tokens: new Map(), sockets: new Set(), offlineTimers: new Map(), closeTimer: null };
      const { playerId, token } = joinAsNewPlayer(room, name);
      rooms.set(id, room);
      res.status(201).json({ roomId: id, playerId, token });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/grilles/:id', (req, res) => {
    const grid = store.getGrid(req.params.id);
    if (!grid) return res.status(404).json({ error: "Cette grille n'existe pas ou a expiré (30 jours)." });
    res.json(grid);
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer);

  function joinAsNewPlayer(room, name) {
    const playerId = newId(6);
    const token = newId(18);
    addPlayer(room.game, { id: playerId, name });
    room.tokens.set(token, playerId);
    // Le joueur doit se connecter en temps réel avant la fin du délai de grâce.
    scheduleOfflineRemoval(room, playerId);
    return { playerId, token };
  }

  function scheduleOfflineRemoval(room, playerId) {
    clearTimeout(room.offlineTimers.get(playerId));
    const timer = setTimeout(() => {
      room.offlineTimers.delete(playerId);
      if (!isOnline(room, playerId)) dropPlayer(room, playerId);
    }, offlineGraceMs);
    timer.unref?.();
    room.offlineTimers.set(playerId, timer);
  }

  function dropPlayer(room, playerId) {
    for (const [token, id] of room.tokens) if (id === playerId) room.tokens.delete(token);
    clearTimeout(room.offlineTimers.get(playerId));
    room.offlineTimers.delete(playerId);
    removePlayer(room.game, playerId, rng);
    afterChange(room);
  }

  function afterChange(room) {
    const { game } = room;
    if (game.players.length === 0 || game.status === 'abandoned') {
      closeRoom(room);
      return;
    }
    if (game.status === 'finished' && !room.closeTimer) {
      store.saveGrid({
        id: room.id,
        gameType: game.gameType,
        numbers: game.validated.numbers,
        bonus: game.validated[GAMES[game.gameType].phases[1].key],
        players: game.players.map((p) => p.name),
        rounds: game.rounds.length,
        drawDate: game.drawDate,
        participants: [...room.tokens].map(([token, playerId]) => ({ token, name: findPlayer(game, playerId)?.name })).filter((p) => p.name),
      });
      for (const timer of room.offlineTimers.values()) clearTimeout(timer);
      room.offlineTimers.clear();
      room.closeTimer = setTimeout(() => closeRoom(room), finishedRoomTtlMs);
      room.closeTimer.unref?.();
    }
    broadcast(room);
  }

  function closeRoom(room) {
    for (const timer of room.offlineTimers.values()) clearTimeout(timer);
    clearTimeout(room.closeTimer);
    for (const socket of room.sockets) {
      socket.emit('room:closed');
      socket.leave(room.id);
      socket.data = {};
    }
    rooms.delete(room.id);
  }

  function detach(socket) {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    room.sockets.delete(socket);
    socket.leave(room.id);
    const { playerId } = socket.data;
    socket.data = {};
    if (room.game.status !== 'finished' && findPlayer(room.game, playerId) && !isOnline(room, playerId)) {
      scheduleOfflineRemoval(room, playerId);
    }
    broadcast(room);
  }

  function currentRoom(socket) {
    const room = rooms.get(socket.data.roomId);
    if (!room || !socket.data.playerId) throw new GameError('no_room', "Vous n'êtes dans aucun salon.");
    return room;
  }

  io.on('connection', (socket) => {
    socket.data = {};

    socket.on('room:join', (payload, ack) =>
      handle(ack, () => {
        const { roomId, token, name } = payload ?? {};
        const room = rooms.get(roomId);
        if (!room) throw new GameError('room_not_found', "Ce salon n'existe pas ou n'est plus ouvert.");
        if (socket.data.roomId) detach(socket);

        let playerId = typeof token === 'string' ? room.tokens.get(token) : undefined;
        let newToken = null;
        if (!playerId) {
          if (name === undefined) throw new GameError('name_required', 'Choisissez un pseudo pour rejoindre le salon.');
          ({ playerId, token: newToken } = joinAsNewPlayer(room, name));
        }
        clearTimeout(room.offlineTimers.get(playerId));
        room.offlineTimers.delete(playerId);
        socket.data = { roomId: room.id, playerId };
        room.sockets.add(socket);
        socket.join(room.id);
        broadcast(room);
        return { playerId, token: newToken ?? token };
      }),
    );

    socket.on('game:start', (ack) =>
      handle(ack, () => {
        const room = currentRoom(socket);
        startGame(room.game, socket.data.playerId);
        afterChange(room);
      }),
    );

    socket.on('game:pick', (payload, ack) =>
      handle(ack, () => {
        const room = currentRoom(socket);
        pick(room.game, socket.data.playerId, payload?.number, rng);
        afterChange(room);
      }),
    );

    socket.on('room:leave', (ack) =>
      handle(ack, () => {
        const room = currentRoom(socket);
        const { playerId } = socket.data;
        for (const other of room.sockets) {
          if (other.data.playerId === playerId) {
            room.sockets.delete(other);
            other.leave(room.id);
            other.data = {};
          }
        }
        if (room.game.status === 'finished') broadcast(room);
        else dropPlayer(room, playerId);
      }),
    );

    socket.on('disconnect', () => detach(socket));
  });

  const purgeTimer = setInterval(() => store.purgeExpired(), 6 * 60 * 60_000);
  purgeTimer.unref();
  httpServer.on('close', () => {
    clearInterval(purgeTimer);
    for (const room of rooms.values()) closeRoom(room);
  });

  return { app, io, httpServer, rooms };
}
