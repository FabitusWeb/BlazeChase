// server/test/gravity-wormhole.test.js — gravity zones + wormholes (F7a)

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { getArena } = require('../src/arenas');
const { applyGravity, updateWormholes } = require('../src/hazards');
const Game = require('../src/game');

const TS = CONFIG.TILE_SIZE;
const center = (c, r) => ({ x: c * TS + TS / 2, y: r * TS + TS / 2 });

function makeShip(x, y) {
  return { id: 's1', x, y, vx: 0, vy: 0, alive: true, isAI: false };
}

// ── Parser ────────────────────────────────────────────────

test('black-hole-sun has gravity zones pointing at the black hole', () => {
  const arena = getArena('black-hole-sun');
  assert.strictEqual(arena.hazards.gravity.length, 4);
  const bh = arena.hazards.blackholes[0];
  for (const g of arena.hazards.gravity) {
    // each gravity zone must point (roughly) toward the black hole
    const toBhX = Math.sign(bh.x - g.x);
    const toBhY = Math.sign(bh.y - g.y);
    assert.ok(g.dx === toBhX || g.dy === toBhY,
      `gravity at ${g.x},${g.y} does not point to the black hole`);
  }
});

test('the-maze has exactly one wormhole pair', () => {
  const arena = getArena('the-maze');
  assert.strictEqual(arena.hazards.wormholes.length, 2);
  assert.strictEqual(arena.hazards.wormholes[0].id, arena.hazards.wormholes[1].id);
});

test('gravity and wormhole tiles stay walkable floor', () => {
  for (const id of ['black-hole-sun', 'the-maze']) {
    const arena = getArena(id);
    for (const g of arena.hazards.gravity) {
      const c = Math.floor(g.x / TS), r = Math.floor(g.y / TS);
      assert.strictEqual(arena.tiles[r][c], CONFIG.TILE.FLOOR, `${id}: gravity tile not floor`);
    }
    for (const w of arena.hazards.wormholes) {
      const c = Math.floor(w.x / TS), r = Math.floor(w.y / TS);
      assert.strictEqual(arena.tiles[r][c], CONFIG.TILE.FLOOR, `${id}: wormhole tile not floor`);
    }
  }
});

// ── Gravity ───────────────────────────────────────────────

test('gravity zone pushes a ship inside it', () => {
  const z = { ...center(5, 5), dx: 1, dy: 0 };
  const inside  = makeShip(z.x, z.y);
  const outside = makeShip(z.x + TS * 2, z.y);
  const ships = { inside, outside };
  applyGravity([z], ships, 0.1);
  assert.ok(inside.vx > 0, 'ship inside gained no velocity');
  assert.strictEqual(outside.vx, 0, 'ship outside was affected');
});

// ── Wormholes ─────────────────────────────────────────────

test('ship teleports from one end to the other', () => {
  const a = center(2, 2), b = center(10, 10);
  const ship = makeShip(a.x, a.y);
  const ships = { s1: ship };
  const { events } = updateWormholes([{ id: '1', ...a }, { id: '1', ...b }], ships, 0.016);
  assert.strictEqual(ship.x, b.x);
  assert.strictEqual(ship.y, b.y);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'wormhole');
});

test('cooldown prevents immediate teleport back', () => {
  const a = center(2, 2), b = center(10, 10);
  const ship = makeShip(a.x, a.y);
  const ships = { s1: ship };
  const wh = [{ id: '1', ...a }, { id: '1', ...b }];
  updateWormholes(wh, ships, 0.016);   // teleport to b, cooldown set
  const { events } = updateWormholes(wh, ships, 0.016);  // still cooling down
  assert.strictEqual(ship.x, b.x, 'teleported back during cooldown');
  assert.strictEqual(events.length, 0);
});

test('teleport works again after cooldown expires', () => {
  const a = center(2, 2), b = center(10, 10);
  const ship = makeShip(a.x, a.y);
  const ships = { s1: ship };
  const wh = [{ id: '1', ...a }, { id: '1', ...b }];
  updateWormholes(wh, ships, 0.016);
  // Burn the cooldown
  for (let i = 0; i < 80; i++) updateWormholes(wh, ships, 0.016);
  assert.strictEqual(ship.x, a.x, 'did not teleport back after cooldown');
});

test('incomplete pair is inert', () => {
  const a = center(2, 2);
  const ship = makeShip(a.x, a.y);
  const { events } = updateWormholes([{ id: '1', ...a }], { s1: ship }, 0.016);
  assert.strictEqual(ship.x, a.x);
  assert.strictEqual(events.length, 0);
});

// ── Game integration ──────────────────────────────────────

test('Game wires gravity and wormholes from the arena', (t) => {
  const msgs = [];
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    m => msgs.push(m), { arenaId: 'the-maze' });
  t.after(() => g.stop());
  assert.strictEqual(g.wormholes.length, 2);

  const g2 = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    () => {}, { arenaId: 'black-hole-sun' });
  t.after(() => g2.stop());
  assert.strictEqual(g2.gravity.length, 4);
});

test('wormhole teleports the human ship during _update', (t) => {
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    () => {}, { arenaId: 'the-maze' });
  t.after(() => g.stop());
  const ship = g.ships['p1'];
  const [a, b] = g.wormholes;
  ship.x = a.x; ship.y = a.y;
  g._update(0.016);
  assert.strictEqual(ship.x, b.x);
  assert.strictEqual(ship.y, b.y);
});
