// server/test/path-vehicles.test.js — path vehicles su binario (F7c)

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { TILE } = CONFIG;
const { getArena } = require('../src/arenas');
const { createPathVehicle, updatePathVehicles } = require('../src/hazards');
const { createShip } = require('../src/physics');
const Game = require('../src/game');

const TS = CONFIG.TILE_SIZE;

test('ca-chase has a path vehicle with waypoints on walkable tiles', () => {
  const arena = getArena('ca-chase');
  assert.strictEqual(arena.hazards.pathVehicles.length, 1);
  const pv = arena.hazards.pathVehicles[0];
  assert.ok(pv.points.length >= 2);
  for (const p of pv.points) {
    const c = Math.floor(p.x / TS), r = Math.floor(p.y / TS);
    assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, `waypoint ${c},${r} non calpestabile`);
  }
  assert.ok(pv.speed > 0);
});

test('path vehicle advances along the path and loops', () => {
  const v = createPathVehicle({
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    speed: 60,
  });
  const arena = { tiles: Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(TILE.FLOOR)) };

  // 1s: deve essere a ~60px sul primo segmento
  for (let i = 0; i < 20; i++) updatePathVehicles([v], {}, arena, 0.05);
  assert.ok(v.x > 40 && v.y === 0, `posizione inattesa ${v.x},${v.y}`);

  // Abbastanza tempo per completare il giro: torna al punto di partenza
  let back = false;
  for (let i = 0; i < 400 && !back; i++) {
    updatePathVehicles([v], {}, arena, 0.05);
    if (v.seg === 0 && Math.hypot(v.x - 0, v.y - 0) < 5) back = true;
  }
  assert.ok(back, 'il veicolo non completa il loop');
});

test('path vehicle angle follows the travel direction', () => {
  const v = createPathVehicle({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], speed: 60 });
  const arena = { tiles: Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(TILE.FLOOR)) };
  updatePathVehicles([v], {}, arena, 0.05);
  assert.ok(Math.abs(v.angle) < 0.01, `angolo atteso ~0, trovato ${v.angle}`);
});

test('path vehicle crushes a ship pinned against a wall', () => {
  const v = createPathVehicle({ points: [{ x: 500, y: 500 }, { x: 500, y: 500 }], speed: 0 });
  const tiles = Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(TILE.FLOOR));
  tiles[Math.floor(500 / TS)][Math.floor((500 + TS) / TS)] = TILE.WALL_SOLID;
  const ship = createShip({ id: 'p1', name: 'T', ship: 0 }, { x: 500 + TS / 2, y: 500 }, 0);
  const { damages } = updatePathVehicles([v], { p1: ship }, { tiles }, 0.05);
  assert.ok(damages.length > 0, 'nessun danno da schiacciamento');
});

test('Game wires and broadcasts path vehicles', (t) => {
  const msgs = [];
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    m => msgs.push(m), { arenaId: 'ca-chase' });
  t.after(() => g.stop());
  assert.strictEqual(g.pathVehicles.length, 1);

  const x0 = g.pathVehicles[0].x, y0 = g.pathVehicles[0].y;
  for (let i = 0; i < 60; i++) g._update(1 / 60);
  assert.ok(g.pathVehicles[0].x !== x0 || g.pathVehicles[0].y !== y0, 'veicolo fermo nel game loop');

  g._broadcastState();
  const state = msgs.find(m => m.type === 'state');
  assert.ok(Array.isArray(state.pathVehicles));
  assert.strictEqual(state.pathVehicles.length, 1);

  const arenaMsg = { ...g._arenaMessage() };
  assert.ok(arenaMsg.hazards.pathVehicles[0].points.length >= 2);
});
