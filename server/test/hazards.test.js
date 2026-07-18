// server/test/hazards.test.js — environmental hazards (F2)

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { generateArena, generateHazards, isSolid, mulberry32 } = require('../src/arena');
const { createTurret, updateTurrets, applyBlackholes, updateWave } = require('../src/hazards');
const { updateBullets } = require('../src/weapons');
const Game = require('../src/game');

const { TILE, TILE_SIZE: TS, ARENA_COLS: COLS, ARENA_ROWS: ROWS, ARENA_WIDTH: W, ARENA_HEIGHT: H } = CONFIG;

function makeShip(x, y, id = 's1') {
  return { id, x, y, vx: 0, vy: 0, alive: true, invulnerable: false };
}

function makeBullet(x, y, vx, vy, ownerId) {
  return {
    id: 1, ownerId, weapon: 0, x, y, vx, vy,
    damage: 8, size: 4, homing: false, erratic: false, aoe: null,
    lifetime: CONFIG.BULLET_LIFETIME,
  };
}

function flatArena() {
  const tiles = Array.from({ length: ROWS }, () => new Array(COLS).fill(TILE.FLOOR));
  return { tiles };
}

test('generateHazards: seeded generation places 4-8 mines on valid floor tiles', () => {
  const arena = generateArena();
  const rng = mulberry32(12345);
  const hz = generateHazards(arena.tiles, arena.spawnPoints, arena.powerupSpots, rng);

  assert.ok(hz.mines.length >= 4 && hz.mines.length <= 8);
  const spawnTiles = arena.spawnPoints.map(sp => ({ c: Math.floor(sp.x / TS), r: Math.floor(sp.y / TS) }));
  for (const m of hz.mines) {
    const c = Math.floor(m.x / TS), r = Math.floor(m.y / TS);
    assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, 'mine on floor tile');
    assert.ok(c > 0 && c < COLS - 1 && r > 0 && r < ROWS - 1, 'mine inside bounds');
    for (const st of spawnTiles) {
      assert.ok(Math.abs(st.c - c) > 1 || Math.abs(st.r - r) > 1, 'mine outside spawn 3x3 clearing');
    }
    for (const spot of arena.powerupSpots) {
      assert.ok(Math.hypot(spot.x - m.x, spot.y - m.y) >= TS, 'mine not on a powerup spot');
    }
  }
});

test('generateHazards: 30 generations keep turrets/blackholes/wave valid', () => {
  for (let n = 0; n < 30; n++) {
    const arena = generateArena();
    const hz = arena.hazards;
    const spawnTiles = arena.spawnPoints.map(sp => ({ c: Math.floor(sp.x / TS), r: Math.floor(sp.y / TS) }));

    assert.ok(hz.turrets.length <= 2);
    for (const t of hz.turrets) {
      const c = Math.floor(t.x / TS), r = Math.floor(t.y / TS);
      assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, 'turret on floor tile');
      assert.ok(t.type === 'missile' || t.type === 'mortar');
      for (const st of spawnTiles) {
        assert.ok(Math.hypot(st.c - c, st.r - r) >= 5, 'turret >= 5 tiles from any spawn');
      }
    }

    assert.ok(hz.blackholes.length <= 1);
    for (const b of hz.blackholes) {
      assert.ok(b.x > 0 && b.x < W && b.y > 0 && b.y < H, 'blackhole inside bounds');
      assert.ok(!isSolid(arena.tiles[Math.floor(b.y / TS)][Math.floor(b.x / TS)]), 'blackhole not on a wall');
    }

    if (hz.wave) {
      assert.ok(hz.wave.axis === 'x' || hz.wave.axis === 'y');
      assert.strictEqual(hz.wave.interval, CONFIG.HAZARDS.WAVE.INTERVAL);
    }
  }
});

test('updateTurrets: fires at an in-range ship after aligning', () => {
  const t = createTurret({ type: 'missile', x: 100, y: 100 }, 'turret-0');
  const ships = { s1: makeShip(300, 100) };
  const dt = 1 / 60;
  let bullets = [];
  for (let i = 0; i < 60 * 5 && bullets.length === 0; i++) {
    bullets = updateTurrets([t], ships, dt).bullets;
  }
  assert.ok(bullets.length > 0, 'turret should fire within 5s');
  const b = bullets[0];
  assert.strictEqual(b.ownerId, 'turret-0');
  assert.strictEqual(b.weapon, 3, 'missile turret reuses weapon id 3');
  assert.strictEqual(b.homing, true);
});

test('updateTurrets: mortar turret fires aoe shells with weapon id 6', () => {
  const t = createTurret({ type: 'mortar', x: 100, y: 100 }, 'turret-1');
  const ships = { s1: makeShip(250, 100) };
  const dt = 1 / 60;
  let bullets = [];
  for (let i = 0; i < 60 * 6 && bullets.length === 0; i++) {
    bullets = updateTurrets([t], ships, dt).bullets;
  }
  assert.ok(bullets.length > 0, 'mortar turret should fire within 6s');
  assert.strictEqual(bullets[0].weapon, 6);
  assert.ok(bullets[0].aoe && bullets[0].aoe.radius === CONFIG.HAZARDS.TURRET_MORTAR.AOE.radius);
});

test('updateTurrets: no fire when the ship is out of range', () => {
  const t = createTurret({ type: 'missile', x: 100, y: 100 }, 'turret-0');
  const ships = { s1: makeShip(100 + CONFIG.HAZARDS.TURRET_MISSILE.RANGE + 50, 100) };
  for (let i = 0; i < 60 * 3; i++) {
    const { bullets } = updateTurrets([t], ships, 1 / 60);
    assert.strictEqual(bullets.length, 0);
  }
});

test('updateTurrets: dead turret never fires', () => {
  const t = createTurret({ type: 'missile', x: 100, y: 100 }, 'turret-0');
  t.alive = false;
  const ships = { s1: makeShip(200, 100) };
  for (let i = 0; i < 60 * 3; i++) {
    const { bullets } = updateTurrets([t], ships, 1 / 60);
    assert.strictEqual(bullets.length, 0);
  }
});

test('applyBlackholes: pulls ships toward the hole, damages inside damage radius', () => {
  const bh = [{ x: 0, y: 0 }];
  const near = makeShip(100, 0, 'near');   // inside pull radius
  const core = makeShip(10, 0, 'core');    // inside damage radius
  const far  = makeShip(500, 0, 'far');    // outside pull radius
  const ships = { near, core, far };
  const dt = 0.1;

  const damages = applyBlackholes(bh, ships, dt);

  assert.ok(near.vx < 0, 'ship inside pull radius gains velocity toward the hole');
  assert.ok(core.vx < 0);
  assert.strictEqual(far.vx, 0, 'ship outside radius untouched');
  assert.strictEqual(far.vy, 0);
  assert.strictEqual(damages.length, 1, 'only the ship inside damage radius is damaged');
  assert.strictEqual(damages[0].ship, core);
  assert.ok(Math.abs(damages[0].dmg - CONFIG.HAZARDS.BLACKHOLE.DPS * dt) < 1e-9);
});

test('updateWave: spawns, moves, damages+pushes ships, deactivates after crossing', () => {
  const ws = { axis: 'x', interval: 18, timer: 0.01, active: null };
  const arena = flatArena();
  const ship = makeShip(0, 600, 's1');

  // Front spawns when the timer expires
  let res = updateWave(ws, { s1: ship }, arena, 0.02);
  assert.ok(ws.active, 'front should spawn');
  assert.strictEqual(res.events.length, 1);
  assert.strictEqual(res.events[0].kind, 'wave_spawn');
  assert.strictEqual(res.events[0].axis, 'x');
  const dir = ws.active.dir;
  assert.ok(dir === 1 || dir === -1);

  // Ship on the front takes damage and a push along the wave direction
  ship.x = ws.active.pos;
  const vxBefore = ship.vx;
  res = updateWave(ws, { s1: ship }, arena, 1 / 60);
  assert.strictEqual(res.damages.length, 1);
  assert.strictEqual(res.damages[0].ship, ship);
  assert.ok(Math.abs(res.damages[0].dmg - CONFIG.HAZARDS.WAVE.DAMAGE / 60) < 1e-9);
  const expectedPush = dir * CONFIG.HAZARDS.WAVE.PUSH / 60;
  assert.ok(Math.abs(ship.vx - (vxBefore + expectedPush)) < 1e-9, 'push applied as velocity impulse');

  // The front moves in its direction
  const prevPos = ws.active.pos;
  updateWave(ws, {}, arena, 0.5);
  assert.ok((ws.active.pos - prevPos) * dir > 0, 'front advances along dir');

  // It deactivates after crossing the whole arena
  let steps = 0;
  while (ws.active && steps < 10000) {
    updateWave(ws, {}, arena, 0.05);
    steps++;
  }
  assert.ok(!ws.active, 'front should deactivate after exiting the arena');
});

test('updateBullets: bullet aimed at a turret yields turret_hit and is destroyed', () => {
  const arena = flatArena();
  const turret = createTurret({ type: 'missile', x: 400, y: 300 }, 'turret-0');
  let survived = [makeBullet(100, 300, 300, 0, 'p1')];
  let events = [];
  for (let i = 0; i < 120 && events.length === 0; i++) {
    const res = updateBullets(survived, {}, arena, 1 / 60, [turret]);
    survived = res.survived;
    events = res.events;
  }
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'turret_hit');
  assert.strictEqual(events[0].turret, turret);
  assert.strictEqual(survived.length, 0, 'bullet destroyed on turret impact');
});

test('updateBullets: turret-own bullet passes through its turret', () => {
  const arena = flatArena();
  const turret = createTurret({ type: 'missile', x: 400, y: 300 }, 'turret-0');
  let survived = [makeBullet(100, 300, 300, 0, 'turret-0')];
  let sawTurretHit = false;
  for (let i = 0; i < 120; i++) {
    const res = updateBullets(survived, {}, arena, 1 / 60, [turret]);
    survived = res.survived;
    if (res.events.some(e => e.kind === 'turret_hit')) sawTurretHit = true;
    if (survived.length === 0) break;
  }
  assert.ok(!sawTurretHit, 'no turret_hit for the owner turret');
  assert.ok(survived.length === 1 && survived[0].x > 400 + 16, 'bullet flew past the turret');
});

test('Game: explosions damage and destroy turrets', () => {
  const game = new Game({ state: 'playing' }, [{ id: 'p1', name: 'P1', ship: 0 }], () => {});
  const turret = createTurret({ type: 'mortar', x: 800, y: 600 }, 'turret-test');
  game.turrets.push(turret);

  const hp0 = turret.hp;
  game._explodeAt(800, 600, 70, 35, null);
  assert.ok(turret.hp < hp0, 'explosion damages the turret');

  game._damageTurret(turret, 999, 'p1');
  assert.ok(!turret.alive, 'turret destroyed at 0 hp');
  assert.strictEqual(turret.hp, 0);
  assert.ok(game.events.some(e => e.kind === 'turret_destroyed' && e.id === 'turret-test'));
  assert.ok(game.events.some(e => e.kind === 'explosion' && e.size === 'large'));
});
