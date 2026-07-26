// server/test/collision-walls.test.js — fix playtest: la spinta nave-nave
// non deve mai infilare una nave dentro un tile solido

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { resolveShipCollisions, isSolidAt } = require('../src/physics');

const { TILE, ARENA_COLS: COLS, ARENA_ROWS: ROWS, TILE_SIZE: TS } = CONFIG;

function makeArena() {
  const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE.FLOOR));
  // Colonna di muro a x=10 (pixel 400-440)
  for (let r = 0; r < ROWS; r++) tiles[r][10] = TILE.WALL_SOLID;
  return { tiles };
}

test('la spinta nave-nave non finisce dentro il muro', () => {
  const arena = makeArena();
  // A e B si sovrappongono di molto vicino al muro (col 10 → pixel 400-440):
  // dist=10 → overlap=9 → senza clamp B finirebbe a x=404 (dentro il muro)
  const a = { alive: true, x: 385, y: 200, vx: 200, vy: 0 };
  const b = { alive: true, x: 395, y: 200, vx: 0, vy: 0 };
  resolveShipCollisions({ a, b }, arena);
  assert.ok(!isSolidAt(arena.tiles, a.x, a.y), `A finita nel muro (${a.x},${a.y})`);
  assert.ok(!isSolidAt(arena.tiles, b.x, b.y), `B finita nel muro (${b.x},${b.y})`);
  assert.ok(b.x < 400, 'B è stata trattenuta fuori dal muro dal clamp');
});

test('senza arena la collisione resta quella di sempre (retrocompatibilità)', () => {
  const a = { alive: true, x: 100, y: 100, vx: 0, vy: 0 };
  const b = { alive: true, x: 110, y: 100, vx: 0, vy: 0 };
  resolveShipCollisions({ a, b });   // niente arena: niente clamp
  assert.ok(b.x > 110, 'separazione avvenuta');
});
