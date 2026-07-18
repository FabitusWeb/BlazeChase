// server/test/weapons.test.js — smoke test armi e proiettili

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { createShip } = require('../src/physics');
const { fireBullets, updateBullets } = require('../src/weapons');

const { TILE, TILE_SIZE } = CONFIG;

const PLAYER = { id: 'p1', name: 'Test', ship: 0 };
const SPAWN  = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE };

// Arena 10x10 con bordo solido
function makeArena() {
  const tiles = Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) =>
      (r === 0 || r === 9 || c === 0 || c === 9) ? TILE.WALL_SOLID : TILE.FLOOR
    )
  );
  return { tiles, wallHP: Array.from({ length: 10 }, () => new Array(10).fill(0)) };
}

function makeBullet(overrides = {}) {
  return {
    id: 1, ownerId: 'shooter', weapon: 0,
    x: 5 * TILE_SIZE, y: 5 * TILE_SIZE,
    vx: 600, vy: 0,
    damage: 8, size: 4, homing: false,
    lifetime: CONFIG.BULLET_LIFETIME,
    ...overrides,
  };
}

test('fireBullets spara col blaster (ammo infinita)', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.angle = 0;
  const { bullets, beams, mines } = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(bullets.length, 1);
  assert.strictEqual(beams.length, 0);
  assert.strictEqual(mines.length, 0);
  assert.strictEqual(ship.weapons[0], -1); // blaster infinito: non consuma
  assert.ok(ship.fireTimer > 0);
  assert.strictEqual(bullets[0].ownerId, ship.id);
});

test('fireBullets rispetta il fire rate', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  const again = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(again.bullets.length, 0);
});

test('arma con inventario consuma ammo per-arma', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.weapon = 1;              // DOUBLE, costo 2, count 2
  ship.weapons[1] = 10;
  const { bullets } = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(bullets.length, 2);
  assert.strictEqual(ship.weapons[1], 8);
  assert.strictEqual(ship.weapons[0], -1);
});

test('senza ammo per l\'arma selezionata torna al blaster', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.weapon = 1;      // DOUBLE, costo 2
  ship.weapons[1] = 1;  // insufficiente
  const { bullets } = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(ship.weapon, 0);
  assert.strictEqual(bullets.length, 1);
  assert.strictEqual(ship.weapons[0], -1);
});

test('arma non posseduta torna al blaster', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  ship.weapon = 5;      // PLASMA non in inventario
  const { bullets } = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(ship.weapon, 0);
  assert.strictEqual(bullets.length, 1);
});

test('nave morta o senza fire non spara', () => {
  const ship = createShip(PLAYER, SPAWN, 0);
  assert.strictEqual(fireBullets(ship, { fire: false }, { ships: {}, arena: makeArena() }).bullets.length, 0);
  ship.alive = false;
  assert.strictEqual(fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() }).bullets.length, 0);
});

test('proiettile contro muro genera wall_hit', () => {
  const arena = makeArena();
  const b = makeBullet({ x: 8.8 * TILE_SIZE, vx: 600 }); // verso il muro a col 9
  const { survived, events } = updateBullets([b], {}, arena, 1 / 60);
  assert.strictEqual(survived.length, 0);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'wall_hit');
});

test('proiettile contro nave nemica genera bullet_hit', () => {
  const arena = makeArena();
  const enemy = createShip({ id: 'enemy', name: 'E', ship: 0 }, SPAWN, 0);
  enemy.invulnerable = false;
  enemy.invulnTimer = 0;
  const b = makeBullet({ x: enemy.x - 15, vx: 600 });
  const ships = { enemy };
  const { survived, events } = updateBullets([b], ships, arena, 1 / 60);
  assert.strictEqual(survived.length, 0);
  assert.strictEqual(events[0].kind, 'bullet_hit');
  assert.strictEqual(events[0].ship.id, 'enemy');
});

test('proiettile scaduto viene rimosso', () => {
  const arena = makeArena();
  const b = makeBullet({ lifetime: 0.001 });
  const { survived, events } = updateBullets([b], {}, arena, 1 / 60);
  assert.strictEqual(survived.length, 0);
  assert.strictEqual(events.length, 0);
});

test('proiettile non colpisce il proprietario né navi invulnerabili', () => {
  const arena = makeArena();
  const self = createShip({ id: 'shooter', name: 'S', ship: 0 }, SPAWN, 0);
  const invuln = createShip({ id: 'inv', name: 'I', ship: 0 }, SPAWN, 0);
  invuln.invulnerable = true;
  const b = makeBullet({ x: SPAWN.x - 30, vx: 600 });
  const { survived, events } = updateBullets([b], { shooter: self, inv: invuln }, arena, 1 / 60);
  assert.strictEqual(events.length, 0);
  assert.strictEqual(survived.length, 1);
});
