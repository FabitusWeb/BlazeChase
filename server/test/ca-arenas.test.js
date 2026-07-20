// server/test/ca-arenas.test.js — Chase Ace Deluxe homage arenas ('ca-*')
// Every ca-* layout must parse, have >= 4 spawns, >= 1 powerup spot,
// valid wormhole pairs, and pass flood-fill connectivity.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { LAYOUTS, parseArena, getArena, arenaList } = require('../src/arenas');

const { TILE, ARENA_ROWS: ROWS, ARENA_COLS: COLS, TILE_SIZE: TS } = CONFIG;

const CA_LAYOUTS = LAYOUTS.filter(l => l.id.startsWith('ca-'));

function tileOf(pos) {
  return { c: Math.floor(pos.x / TS), r: Math.floor(pos.y / TS) };
}

/**
 * Flood fill from spawn 0 over non-solid tiles, treating WALL_DEST as
 * passable (destructible). Returns the set of reachable "r,c" keys.
 * (Same helper as in arenas.test.js.)
 */
function reachableSet(arena) {
  const start = tileOf(arena.spawnPoints[0]);
  const passable = (r, c) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS &&
    arena.tiles[r][c] !== TILE.WALL_SOLID && arena.tiles[r][c] !== TILE.GLASS;
  const seen = new Set();
  const queue = [[start.r, start.c]];
  seen.add(start.r + ',' + start.c);
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const rr = r + dr, cc = c + dc;
      const key = rr + ',' + cc;
      if (!seen.has(key) && passable(rr, cc)) {
        seen.add(key);
        queue.push([rr, cc]);
      }
    }
  }
  return seen;
}

test('6 Chase Ace Deluxe homage arenas are present', () => {
  assert.strictEqual(CA_LAYOUTS.length, 6);
  const ids = CA_LAYOUTS.map(l => l.id);
  assert.deepStrictEqual(ids.sort(), [
    'ca-chase',
    'ca-crashsite',
    'ca-interconnection-void',
    'ca-rooms-of-chaos',
    'ca-tripple-a',
    'ca-violent-skew',
  ]);
});

test('every ca-* arena parses without throwing and has valid metadata', () => {
  for (const layout of CA_LAYOUTS) {
    const arena = parseArena(layout);
    assert.strictEqual(arena.tiles.length, ROWS, `${layout.id}: rows`);
    assert.strictEqual(arena.tiles[0].length, COLS, `${layout.id}: cols`);
    assert.ok(CONFIG.THEME_NAMES.includes(arena.theme), `${layout.id}: theme`);
    assert.ok(['EASY', 'MEDIUM', 'HARD'].includes(layout.difficulty), `${layout.id}: difficulty`);
  }
  // resolvable through getArena / listed in arenaList
  const listed = new Set(arenaList().map(a => a.id));
  for (const layout of CA_LAYOUTS) {
    assert.ok(listed.has(layout.id), `${layout.id}: listed`);
    assert.doesNotThrow(() => getArena(layout.id), `${layout.id}: getArena`);
  }
});

test('every ca-* arena has >= 4 spawns on clear floor and >= 1 powerup spot', () => {
  for (const layout of CA_LAYOUTS) {
    const arena = parseArena(layout);
    assert.ok(arena.spawnPoints.length >= 4, `${layout.id}: >= 4 spawns`);
    for (const sp of arena.spawnPoints) {
      const { r, c } = tileOf(sp);
      assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, `${layout.id}: spawn on FLOOR`);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          assert.strictEqual(arena.tiles[r+dr][c+dc], TILE.FLOOR,
            `${layout.id}: spawn 3x3 clear at ${r+dr},${c+dc}`);
        }
      }
    }
    assert.ok(arena.powerupSpots.length >= 1, `${layout.id}: >= 1 powerup spot`);
    assert.ok(arena.powerupSpots.length >= 4, `${layout.id}: >= 4 powerup spots`);
    for (const p of arena.powerupSpots) {
      const { r, c } = tileOf(p);
      assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, `${layout.id}: powerup spot on FLOOR`);
    }
  }
});

test('every ca-* wormhole id has exactly 2 endpoints', () => {
  for (const layout of CA_LAYOUTS) {
    const arena = parseArena(layout);
    const byId = {};
    for (const w of arena.hazards.wormholes) (byId[w.id] = byId[w.id] || []).push(w);
    for (const id in byId) {
      assert.strictEqual(byId[id].length, 2, `${layout.id}: wormhole '${id}' pair complete`);
    }
  }
});

test('every ca-* arena is fully connected (D treated as passable)', () => {
  for (const layout of CA_LAYOUTS) {
    const arena = parseArena(layout);
    const reach = reachableSet(arena);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = arena.tiles[r][c];
        if (t === TILE.FLOOR || t === TILE.ACID || t === TILE.REFUEL) {
          assert.ok(reach.has(r + ',' + c), `${layout.id}: tile ${r},${c} unreachable`);
        }
      }
    }
    const isReachable = (pos) => {
      const { r, c } = tileOf(pos);
      return reach.has(r + ',' + c);
    };
    for (const sp of arena.spawnPoints)   assert.ok(isReachable(sp), `${layout.id}: spawn unreachable`);
    for (const p of arena.powerupSpots)   assert.ok(isReachable(p), `${layout.id}: powerup spot unreachable`);
    for (const m of arena.hazards.mines)  assert.ok(isReachable(m), `${layout.id}: mine unreachable`);
    for (const t of arena.hazards.turrets) assert.ok(isReachable(t), `${layout.id}: turret unreachable`);
  }
});

test('ca-* arenas cover the homage mix (turrets, wormholes, gravity, hazards)', () => {
  const all = CA_LAYOUTS.map(l => ({ id: l.id, arena: parseArena(l) }));
  assert.ok(all.some(a => a.arena.hazards.turrets.length >= 2), 'at least one turret arena');
  assert.ok(all.some(a => a.arena.hazards.wormholes.length >= 2), 'at least one wormhole arena');
  assert.ok(all.some(a => a.arena.hazards.gravity.length >= 3), 'at least one gravity arena');
  assert.ok(all.some(a => a.arena.tiles.flat().includes(TILE.ACID)), 'at least one acid arena');
});
