// server/test/feel.test.js — turbo continuo (SHIFT) + selezione arma diretta (F5c)

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { updateShip, createShip } = require('../src/physics');
const { generateArena } = require('../src/arena');
const Game = require('../src/game');

function makePlayerShip() {
  const ship = createShip({ id: 'p1', name: 'T', ship: 0 }, { x: 400, y: 400 }, 0);
  ship.angle = 0;   // deterministico: dritto lungo +x
  return ship;
}

// Arena vuota (solo pavimento + bordi) per test di velocità senza collisioni
function emptyArena() {
  const tiles = Array.from({ length: CONFIG.ARENA_ROWS }, (_, r) =>
    Array.from({ length: CONFIG.ARENA_COLS }, (_, c) =>
      (r === 0 || c === 0 || r === CONFIG.ARENA_ROWS - 1 || c === CONFIG.ARENA_COLS - 1)
        ? CONFIG.TILE.WALL_SOLID : CONFIG.TILE.FLOOR));
  const wallHP = tiles.map(row => row.map(() => 0));
  return { tiles, wallHP };
}

test('SHIFT tenuto = turbo continuo: la nave supera la velocità base', () => {
  const ship = makePlayerShip();
  const arena = emptyArena();
  const def = CONFIG.SHIPS[0];
  const input = { up: true, down: false, left: false, right: false, fire: false, dash: true, dodge: false };

  for (let i = 0; i < 120; i++) updateShip(ship, input, 1 / 60, arena);  // 2s di spinta+turbo

  const speed = Math.hypot(ship.vx, ship.vy);
  assert.ok(ship.dashing, 'dashing deve essere attivo finché SHIFT è tenuto');
  assert.ok(speed > def.speed * 1.2, `speed ${speed.toFixed(0)} non supera la base ${def.speed} (turbo assente)`);
  assert.ok(speed <= def.speed * CONFIG.TURBO_FACTOR * 1.05, `speed ${speed.toFixed(0)} oltre il cap turbo`);
});

test('senza SHIFT la velocità si ferma al cap base', () => {
  const ship = makePlayerShip();
  const arena = emptyArena();
  const def = CONFIG.SHIPS[0];
  const input = { up: true, down: false, left: false, right: false, fire: false, dash: false, dodge: false };

  for (let i = 0; i < 120; i++) updateShip(ship, input, 1 / 60, arena);

  const speed = Math.hypot(ship.vx, ship.vy);
  assert.ok(!ship.dashing);
  assert.ok(speed <= def.speed * 1.05, `speed ${speed.toFixed(0)} oltre il cap base ${def.speed}`);
});

test('turbo non blocca rotazione e fruscio (si guida mentre si boosta)', () => {
  const ship = makePlayerShip();
  const arena = emptyArena();
  const angle0 = ship.angle;
  const input = { up: false, down: false, left: false, right: true, fire: false, dash: true, dodge: false };
  updateShip(ship, input, 0.1, arena);
  assert.notStrictEqual(ship.angle, angle0, 'la rotazione è bloccata durante il turbo');
});

test('selezione diretta arma con weaponSelect (tasti 1-9)', (t) => {
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }], () => {}, { arenaId: 'open-field' });
  t.after(() => g.stop());
  const ship = g.ships['p1'];
  ship.weapons = { 0: -1, 5: 40, 9: 100 };   // blaster + plasma + laser
  ship.weapon = 0;

  g.inputBuffer['p1'].weaponSelect = 2;   // seconda arma posseduta
  g._update(0.016);
  assert.strictEqual(ship.weapon, 5);

  g.inputBuffer['p1'].weaponSelect = 3;
  g._update(0.016);
  assert.strictEqual(ship.weapon, 9);

  g.inputBuffer['p1'].weaponSelect = 7;   // oltre l'inventario: ignora
  g._update(0.016);
  assert.strictEqual(ship.weapon, 9);
});

test('Q continua a ciclare le armi possedute', (t) => {
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }], () => {}, { arenaId: 'open-field' });
  t.after(() => g.stop());
  const ship = g.ships['p1'];
  ship.weapons = { 0: -1, 5: 40 };
  ship.weapon = 0;

  g.inputBuffer['p1'].switchWeapon = true;
  g._update(0.016);
  assert.strictEqual(ship.weapon, 5);
  g.inputBuffer['p1'].switchWeapon = false;
  g._update(0.016);
  g.inputBuffer['p1'].switchWeapon = true;
  g._update(0.016);
  assert.strictEqual(ship.weapon, 0);
});
