// server/src/index.js — HTTP static server + WebSocket server + Room management

'use strict';

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('./config');
const Game   = require('./game');

const PORT = process.env.PORT || CONFIG.WS_PORT;

// ── Static file serving ──────────────────────────────────────────────────────

const CLIENT_DIR = path.resolve(__dirname, '../../client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(CLIENT_DIR, urlPath);
  // Security: prevent path traversal
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':  mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ── Room management ───────────────────────────────────────────────────────────

// rooms: Map<code, { code, hostId, players: Map<id,ws>, game: Game|null, state: 'lobby'|'playing' }>
const rooms   = new Map();
// clients: Map<ws, { id, name, ship, roomCode, ready }>
const clients = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room, msg, excludeId = null) {
  const data = JSON.stringify(msg);
  for (const [id, ws] of room.players) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function lobbySnapshot(room) {
  const players = [];
  for (const [id, ws] of room.players) {
    const c = clients.get(ws);
    if (c) players.push({ id, name: c.name, ship: c.ship, ready: c.ready });
  }
  return { type: 'lobby', players, hostId: room.hostId, code: room.code };
}

function removeClientFromRoom(ws) {
  const client = clients.get(ws);
  if (!client || !client.roomCode) return;

  const room = rooms.get(client.roomCode);
  if (!room) return;

  room.players.delete(client.id);

  if (room.players.size === 0) {
    if (room.game) room.game.stop();
    rooms.delete(room.code);
    return;
  }

  // Transfer host if needed
  if (room.hostId === client.id) {
    room.hostId = room.players.keys().next().value;
  }

  // Stop game if in progress
  if (room.state === 'playing' && room.game) {
    room.game.stop();
    room.state = 'lobby';
    // Reset ready flags for remaining players
    for (const [, rws] of room.players) {
      const rc = clients.get(rws);
      if (rc) rc.ready = false;
    }
  }

  broadcastRoom(room, lobbySnapshot(room));
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const id = uuidv4();
  clients.set(ws, { id, name: 'Player', ship: 0, roomCode: null, ready: false });

  send(ws, { type: 'welcome', id });

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const client = clients.get(ws);
    if (!client) return;

    switch (msg.type) {
      case 'join':       handleJoin(ws, client, msg); break;
      case 'ready':      handleReady(ws, client); break;
      case 'input':      handleInput(ws, client, msg); break;
      case 'ship_select':handleShipSelect(ws, client, msg); break;
      case 'rematch':    handleRematch(ws, client); break;
      case 'play_solo':  handlePlaySolo(ws, client, msg); break;
    }
  });

  ws.on('close', () => {
    removeClientFromRoom(ws);
    clients.delete(ws);
  });

  ws.on('error', () => {
    removeClientFromRoom(ws);
    clients.delete(ws);
  });
});

// ── Message handlers ──────────────────────────────────────────────────────────

function handleJoin(ws, client, msg) {
  // Validate and sanitize name
  const name = String(msg.name || 'Player').slice(0, 16).trim() || 'Player';
  const ship = Math.max(0, Math.min(CONFIG.SHIPS.length - 1, parseInt(msg.ship) || 0));

  client.name = name;
  client.ship = ship;

  let room;
  const code = msg.code ? String(msg.code).toUpperCase().trim() : null;

  if (code) {
    // Join existing room
    room = rooms.get(code);
    if (!room) { send(ws, { type: 'error', msg: 'Room not found' }); return; }
    if (room.state === 'playing') { send(ws, { type: 'error', msg: 'Game in progress' }); return; }
    if (room.players.size >= 4) { send(ws, { type: 'error', msg: 'Room full' }); return; }
  } else {
    // Create new room
    const newCode = generateRoomCode();
    room = { code: newCode, hostId: client.id, players: new Map(), game: null, state: 'lobby' };
    rooms.set(newCode, room);
  }

  // Leave previous room if any
  if (client.roomCode) removeClientFromRoom(ws);

  room.players.set(client.id, ws);
  client.roomCode = room.code;
  client.ready = false;

  broadcastRoom(room, lobbySnapshot(room));
}

function handleShipSelect(ws, client, msg) {
  const ship = Math.max(0, Math.min(CONFIG.SHIPS.length - 1, parseInt(msg.ship) || 0));
  client.ship = ship;
  client.ready = false;
  const room = rooms.get(client.roomCode);
  if (room) broadcastRoom(room, lobbySnapshot(room));
}

function handleReady(ws, client) {
  const room = rooms.get(client.roomCode);
  if (!room || room.state !== 'lobby') return;

  client.ready = true;
  broadcastRoom(room, lobbySnapshot(room));

  // Check if all players are ready (minimum 1 player allowed for testing)
  const allReady = [...room.players.values()].every(pws => clients.get(pws)?.ready);
  if (allReady && room.players.size >= 1) {
    startCountdown(room);
  }
}

function startCountdown(room) {
  room.state = 'countdown';
  let count = 3;

  broadcastRoom(room, { type: 'countdown', value: count });

  const tick = setInterval(() => {
    count--;
    broadcastRoom(room, { type: 'countdown', value: count });
    if (count <= 0) {
      clearInterval(tick);
      startGame(room);
    }
  }, 1000);
}

function startGame(room) {
  room.state = 'playing';

  // Build player list for game
  const players = [];
  for (const [id, ws] of room.players) {
    const c = clients.get(ws);
    if (c) players.push({ id, name: c.name, ship: c.ship });
  }

  room.game = new Game(room, players, (msg) => broadcastRoom(room, msg));
  room.game.start();
}

function handleInput(ws, client, msg) {
  const room = rooms.get(client.roomCode);
  if (!room || room.state !== 'playing' || !room.game) return;
  room.game.receiveInput(client.id, msg);
}

function handleRematch(ws, client) {
  const room = rooms.get(client.roomCode);
  if (!room || room.state !== 'lobby') return;
  // Reset ready flags
  for (const [, rws] of room.players) {
    const rc = clients.get(rws);
    if (rc) rc.ready = false;
  }
  broadcastRoom(room, lobbySnapshot(room));
}

function handlePlaySolo(ws, client, msg) {
  const name       = String(msg.name || 'Player').slice(0, 16).trim() || 'Player';
  const ship       = Math.max(0, Math.min(CONFIG.SHIPS.length - 1, parseInt(msg.ship) || 0));
  const difficulty = ['easy', 'medium', 'hard'].includes(msg.difficulty) ? msg.difficulty : 'easy';

  client.name = name;
  client.ship = ship;

  // Leave any previous room
  if (client.roomCode) removeClientFromRoom(ws);

  // Create a private solo room
  const code = generateRoomCode();
  const room = { code, hostId: client.id, players: new Map(), game: null, state: 'playing', soloRoom: true };
  room.players.set(client.id, ws);
  rooms.set(code, room);
  client.roomCode = code;
  client.ready    = false;

  // Start game immediately — no countdown
  const players = [{ id: client.id, name, ship }];
  room.game = new Game(room, players, (m) => broadcastRoom(room, m), { soloMode: true, difficulty });
  room.game.start();
}

// Expose callback so Game can call it on round end
// (Game calls broadcast directly via the callback passed in startGame)

// ── Heartbeat interval ────────────────────────────────────────────────────────

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, CONFIG.HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeatInterval));

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`BlazeChase server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  console.log(`Serving client files from: ${CLIENT_DIR}`);
});
