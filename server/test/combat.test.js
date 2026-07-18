// server/test/combat.test.js — AoE, mine, beam e modificatori d'arma

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { createShip } = require('../src/physics');
const { fireBullets, updateBullets, updateMines, explode } = require('../src/weapons');

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

function makeShip(id, x, y, overrides = {}) {
  const ship = createShip({ id, name: id, ship: 0 }, { x, y }, 0);
  ship.angle = 0;
  ship.invulnerable = false;
  ship.invulnTimer = 0;
  return Object.assign(ship, overrides);
}

// ── explode() — AoE pura ─────────────────────────────────────

test('explode: danno con falloff lineare (50% al bordo)', () => {
  const near = makeShip('near', 100, 100);
  const far  = makeShip('far', 100 + 60, 100); // dist = radius
  const hits = explode(100, 100, 60, 40, 'x', { near, far });
  const hNear = hits.find(h => h.ship.id === 'near');
  const hFar  = hits.find(h => h.ship.id === 'far');
  assert.strictEqual(hNear.dmg, 40);                    // dist 0 → pieno
  assert.strictEqual(hFar.dmg, Math.round(40 * 0.5));   // dist = radius → 50%
});

test('explode: include il proprietario, salta invulnerabili e fuori raggio', () => {
  const owner  = makeShip('owner', 100, 100);
  const invuln = makeShip('inv', 105, 100, { invulnerable: true });
  const away   = makeShip('away', 100 + 200, 100);
  const dead   = makeShip('dead', 100, 100, { alive: false });
  const hits = explode(100, 100, 60, 40, 'owner', { owner, invuln, away, dead });
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].ship.id, 'owner'); // CA2: anche il proprietario
});

// ── Mine ─────────────────────────────────────────────────────

test('mina: si arma dopo ARM_TIME e innesca su nave vicina (owner incluso)', () => {
  const layer = makeShip('layer', 200, 200);
  layer.weapon = 10;
  layer.weapons[10] = 10;
  const { mines } = fireBullets(layer, { fire: true }, { ships: { layer }, arena: makeArena() });
  assert.strictEqual(mines.length, 1);
  assert.strictEqual(mines[0].armTimer, CONFIG.MINE.ARM_TIME);
  assert.strictEqual(layer.weapons[10], 9);

  // Non ancora armata: nessuna esplosione anche con nave sopra
  let r = updateMines(mines, { layer }, CONFIG.MINE.ARM_TIME - 0.1);
  assert.strictEqual(r.events.length, 0);
  assert.strictEqual(r.survived.length, 1);

  // Il timer arriva a zero: la mina si arma (innesco dal tick successivo)
  r = updateMines(r.survived, { layer }, 0.2);
  assert.strictEqual(r.events.length, 0);
  assert.strictEqual(r.survived.length, 1);
  assert.ok(r.survived[0].armTimer <= 0);

  // Armata: il proprietario stesso la innesca (come in CA2)
  r = updateMines(r.survived, { layer }, 1 / 60);
  assert.strictEqual(r.events.length, 1);
  assert.strictEqual(r.events[0].kind, 'mine_explode');
  assert.strictEqual(r.events[0].mine.ownerId, 'layer');
  assert.strictEqual(r.survived.length, 0);
});

test('mina armata non innesca senza navi in raggio', () => {
  const far = makeShip('far', 800, 800);
  const mine = { id: 1, x: 200, y: 200, ownerId: 'other', armTimer: 0 };
  const r = updateMines([mine], { far }, 1 / 60);
  assert.strictEqual(r.events.length, 0);
  assert.strictEqual(r.survived.length, 1);
});

// ── Beam (LASER CANNON) ──────────────────────────────────────

test('beam: hitscan colpisce nave nemica e si ferma su di essa', () => {
  const arena  = makeArena();
  const shooter = makeShip('shooter', 200, 200);
  shooter.weapon = 9;
  shooter.weapons[9] = 120;
  const enemy = makeShip('enemy', 300, 200);

  const { beams, bullets } = fireBullets(shooter, { fire: true }, { ships: { shooter, enemy }, arena });
  assert.strictEqual(bullets.length, 0);
  assert.strictEqual(beams.length, 1);
  assert.strictEqual(beams[0].hitShipId, 'enemy');
  assert.ok(beams[0].x2 <= 300);        // si ferma sul bersaglio
  assert.ok(beams[0].x2 > 200);         // parte dal muso
  assert.strictEqual(shooter.weapons[9], 118); // ammoCost 2
});

test('beam: si ferma al muro se nessuna nave in traiettoria', () => {
  const arena   = makeArena();
  const shooter = makeShip('shooter', 200, 200);
  shooter.weapon = 9;
  shooter.weapons[9] = 120;

  const { beams } = fireBullets(shooter, { fire: true }, { ships: { shooter }, arena });
  assert.strictEqual(beams.length, 1);
  assert.strictEqual(beams[0].hitShipId, null);
  // Muro a col 9 → x = 360; il fascio deve fermarsi lì (±1 step di 4px)
  assert.ok(beams[0].x2 >= 360 - TILE_SIZE && beams[0].x2 <= 360 + 4);
  assert.ok(beams[0].x2 < 200 + CONFIG.WEAPONS[9].beam.length);
});

// ── AoE su proiettile (MORTAR) ───────────────────────────────

test('mortar: il proiettile porta aoe e wall_hit lo conserva', () => {
  const arena   = makeArena();
  const shooter = makeShip('shooter', 200, 200);
  shooter.weapon = 6;
  shooter.weapons[6] = 20;

  const { bullets } = fireBullets(shooter, { fire: true }, { ships: { shooter }, arena });
  assert.strictEqual(bullets.length, 1);
  assert.deepStrictEqual(bullets[0].aoe, { radius: 60, damage: 25 });

  // Impatto su muro → l'evento conserva il riferimento al proiettile (con aoe)
  bullets[0].x = 8.9 * TILE_SIZE;
  bullets[0].y = 200;
  bullets[0].vx = 600;
  bullets[0].vy = 0;
  const { events } = updateBullets(bullets, {}, arena, 1 / 60);
  assert.strictEqual(events[0].kind, 'wall_hit');
  assert.deepStrictEqual(events[0].bullet.aoe, { radius: 60, damage: 25 });
});

// ── Modificatori ─────────────────────────────────────────────

test('doubleshot raddoppia i proiettili, tripleshot triplica (e vince)', () => {
  const ship = makeShip('p', 200, 200);
  ship.modifiers.doubleshot = 5;
  let r = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(r.bullets.length, 2);

  const ship2 = makeShip('p2', 200, 200);
  ship2.modifiers.doubleshot = 5;
  ship2.modifiers.tripleshot = 5;
  r = fireBullets(ship2, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(r.bullets.length, 3); // triple vince su double
});

test('seeking rende i proiettili homing', () => {
  const ship = makeShip('p', 200, 200);
  ship.modifiers.seeking = 5;
  const { bullets } = fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.strictEqual(bullets[0].homing, true);
});

test('rapidfire dimezza il fireTimer', () => {
  const ship = makeShip('p', 200, 200);
  ship.modifiers.rapidfire = 5;
  fireBullets(ship, { fire: true }, { ships: {}, arena: makeArena() });
  assert.ok(Math.abs(ship.fireTimer - CONFIG.WEAPONS[0].fireRate * 0.5) < 1e-9);
});

test('erratic: il proiettile mantiene la velocità ma jittera la rotta', () => {
  const arena = makeArena();
  const b = {
    id: 1, ownerId: 'x', weapon: 8,
    x: 200, y: 200, vx: 380, vy: 0,
    damage: 10, size: 5, homing: false, erratic: true, aoe: null,
    lifetime: CONFIG.BULLET_LIFETIME,
  };
  const { survived } = updateBullets([b], {}, arena, 1 / 60);
  assert.strictEqual(survived.length, 1);
  const spd = Math.hypot(survived[0].vx, survived[0].vy);
  assert.ok(Math.abs(spd - 380) < 1e-6);
});
