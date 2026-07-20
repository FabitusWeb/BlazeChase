// Smoke test client rendering (temporaneo — da eliminare dopo l'uso)
'use strict';

function makeCtx() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: null, strokeStyle: null, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    shadowColor: '', shadowBlur: 0,
    clearRect() {}, fillRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, clip() {}, rect() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {},
    save() {}, restore() {}, translate() {}, rotate() {}, transform() {},
    setTransform() {},
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    drawImage() {}, fillText() {},
    measureText: () => ({ width: 10 }),
  };
}

class FakeOffscreenCanvas {
  constructor(w, h) { this.width = w; this.height = h; this._ctx = makeCtx(); }
  getContext() { return this._ctx; }
}
globalThis.OffscreenCanvas = FakeOffscreenCanvas;
globalThis.CONFIG = require('../shared/config.js');

const { TILE } = CONFIG;

function fakeArena() {
  const rows = CONFIG.ARENA_ROWS, cols = CONFIG.ARENA_COLS;
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) row.push(TILE.WALL_SOLID);
      else if (r === 10 && c === 10) row.push(TILE.WALL_DEST);
      else if (r === 15 && c > 3 && c < 8) row.push(TILE.ACID);
      else if (r === 20 && c === 20) row.push(TILE.REFUEL);
      else row.push(TILE.FLOOR);
    }
    tiles.push(row);
  }
  const wallHP = tiles.map(row => row.map(() => CONFIG.WALL_DEST_HP));
  return { tiles, wallHP, theme: 'INDUSTRIAL', spawnPoints: [], powerupSpots: [], hazards: { mines: [], turrets: [], blackholes: [], wave: null } };
}

(async () => {
  const { ArenaRenderer } = await import('../client/js/arena.js');
  const { Renderer }      = await import('../client/js/renderer.js');

  // HiDPI 2×
  const arena = new ArenaRenderer(fakeArena(), 2);
  if (arena.arenaCanvas.width !== CONFIG.ARENA_WIDTH * 2) throw new Error('arena HiDPI: canvas non scalata');
  arena.updateTile(10, 10, TILE.DEBRIS, 0);
  console.log('arena.js HiDPI OK — canvas', arena.arenaCanvas.width + 'x' + arena.arenaCanvas.height);

  const canvas = { getContext: () => makeCtx(), width: 1600, height: 1200 };
  const renderer = new Renderer(canvas, fakeArena(), 2);
  const state = {
    players: [{ id: 'p0', name: 'T', shipId: 0, x: 300, y: 300, angle: 0.5, vx: 10, vy: 5,
      alive: true, thrusting: true, dashing: false, dodging: false, invulnerable: false,
      hitFlashTimer: 0, angularVel: 1, weapon: 1, weapons: { 0: -1, 1: 50 }, shield: 20, ammo: 100,
      modifiers: { seeking: 0, doubleshot: 0, tripleshot: 0, rapidfire: 0 },
      pshieldPool: 5, dashCooldown: 0.5, dodgeCooldown: 0.5,
      kills: 1, deaths: 0, speedBoostTimer: 1, onRefuel: true, respawnTimer: 0 }],
    bullets: [{ id: 1, weapon: 3, x: 300, y: 300, vx: 100, vy: 0, size: 8 }],
    powerups: [], mines: [],
    soloInfo: { mode: 'skirmish', lives: 3, aiRemaining: 1, wave: null, score: 0, objective: null },
  };
  for (let f = 0; f < 4; f++) renderer.frame(0.05, state, 'p0', [], []);
  console.log('renderer.js HiDPI OK');

  // net.js: nave locale senza interpolazione
  const { NetClient } = await import('../client/js/net.js');
  const net = new NetClient();
  net.myId = 'me';
  const mk = (x, ts) => ({ type: 'state', tick: 1, timestamp: ts, players: [{ id: 'me', x, y: 0, angle: 0 }, { id: 'ai', x, y: 0, angle: 0 }], bullets: [], powerups: [] });
  net.stateBuffer.push(mk(0, 1000), mk(100, 1050));
  const out = net.getInterpolatedState();
  if (out.players.find(p => p.id === 'me').x !== 100) throw new Error('nave locale interpolata (dovrebbe usare ultimo stato)');
  console.log('net.js OK — nave locale senza interpolazione');

  console.log('SMOKE TEST SUPERATO');
})().catch(e => { console.error('SMOKE TEST FALLITO:', e); process.exit(1); });
