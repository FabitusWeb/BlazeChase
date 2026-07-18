// server/test/physics.test.js — smoke test fisica navi

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { createShip, updateShip } = require('../src/physics');

const { TILE, TILE_SIZE } = CONFIG;

// Arena minimale 10x10: bordo solido, interno floor
function makeArena(floorTile = TILE.FLOOR) {
  const tiles = Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) =>
      (r === 0 || r === 9 || c === 0 || c === 9) ? TILE.WALL_SOLID : floorTile
    )
  );
  return {
    tiles,
    wallHP: Array.from({ length: 10 }, () => new Array(10).fill(0)),
    spawnPoints: [{ x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }],
  };
}

const PLAYER = { id: 'p1', name: 'Test', ship: 0 };
const SPAWN  = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE };

test('createShip inizializza da definizione nave', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  const def  = CONFIG.SHIPS[0];
  assert.strictEqual(ship.shield, def.shield);
  assert.strictEqual(ship.ammo, def.ammo);
  assert.strictEqual(ship.alive, true);
  assert.strictEqual(ship.weapon, 0);
  assert.strictEqual(ship.x, SPAWN.x);
});

test('thrust accelera nella direzione di prua', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.angle = 0; // verso +X
  ship.invulnTimer = 0;
  const arena = makeArena();
  for (let i = 0; i < 30; i++) updateShip(ship, { up: true }, 1 / 60, arena);
  assert.ok(ship.vx > 0, `vx atteso > 0, ottenuto ${ship.vx}`);
  assert.ok(Math.abs(ship.vy) < 1);
  assert.ok(ship.thrusting);
});

test('attrito rallenta la nave senza input', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.vx = 200; ship.vy = 0;
  ship.invulnTimer = 0;
  const arena = makeArena();
  const before = Math.hypot(ship.vx, ship.vy);
  for (let i = 0; i < 30; i++) updateShip(ship, {}, 1 / 60, arena);
  const after = Math.hypot(ship.vx, ship.vy);
  assert.ok(after < before, `atteso ${after} < ${before}`);
});

test('il muro ferma la nave', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  // Vicino al bordo destro (colonna 9 = muro), in movimento verso destra
  ship.x = 8.7 * TILE_SIZE;
  ship.y = 5 * TILE_SIZE;
  ship.vx = 500; ship.vy = 0;
  ship.angle = 0;
  ship.invulnTimer = 0;
  const arena = makeArena();
  updateShip(ship, {}, 1 / 60, arena);
  assert.ok(ship.x + CONFIG.SHIP_RADIUS <= 9 * TILE_SIZE + 0.01, `x=${ship.x}`);
  assert.strictEqual(ship.vx, 0);
});

test('acido danneggia lo scudo', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.invulnTimer = 0;
  ship.invulnerable = false;
  const arena = makeArena(TILE.ACID);
  const before = ship.shield;
  updateShip(ship, {}, 1 / 60, arena);
  assert.ok(ship.shield < before);
  assert.ok(ship.onAcid);
});

test('refuel rigenera scudo e ammo', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.shield = 10;
  ship.ammo = 10;
  ship.invulnTimer = 0;
  const arena = makeArena(TILE.REFUEL);
  updateShip(ship, {}, 1 / 60, arena);
  assert.ok(ship.shield > 10);
  assert.ok(ship.ammo > 10);
  assert.ok(ship.onRefuel);
});

test('respawn ripristina nave al termine del timer', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  const arena = makeArena();
  ship.alive = false;
  ship.shield = 0;
  ship.ammo = 0;
  ship.respawnTimer = 0.01;
  updateShip(ship, {}, 1 / 60, arena);
  assert.strictEqual(ship.alive, true);
  assert.strictEqual(ship.shield, CONFIG.SHIPS[0].shield);
  assert.strictEqual(ship.ammo, CONFIG.SHIPS[0].ammo);
});
