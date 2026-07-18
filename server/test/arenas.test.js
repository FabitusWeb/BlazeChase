// server/test/arenas.test.js — handcrafted ASCII arena layouts + parser

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { generateArena, isSolid } = require('../src/arena');
const { LAYOUTS, parseArena, getArena, arenaList } = require('../src/arenas');

const { TILE, ARENA_ROWS: ROWS, ARENA_COLS: COLS, TILE_SIZE: TS } = CONFIG;

function tileOf(pos) {
  return { c: Math.floor(pos.x / TS), r: Math.floor(pos.y / TS) };
}

/**
 * Flood fill from spawn 0 over non-solid tiles, treating WALL_DEST as
 * passable (destructible). Returns the set of reachable "r,c" keys.
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

function assertFullyConnected(arena, label) {
  const reach = reachableSet(arena);
  const isReachable = (pos) => {
    const { r, c } = tileOf(pos);
    return reach.has(r + ',' + c);
  };

  // Every walkable tile (FLOOR/ACID/REFUEL) must be reachable
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = arena.tiles[r][c];
      if (t === TILE.FLOOR || t === TILE.ACID || t === TILE.REFUEL) {
        assert.ok(reach.has(r + ',' + c), `${label}: tile ${r},${c} (type ${t}) unreachable`);
      }
    }
  }

  // Every gameplay position must be reachable
  for (const sp of arena.spawnPoints)  assert.ok(isReachable(sp), `${label}: spawn unreachable`);
  for (const p of arena.powerupSpots)  assert.ok(isReachable(p), `${label}: powerup spot unreachable`);
  for (const m of arena.hazards.mines) assert.ok(isReachable(m), `${label}: mine unreachable`);
  for (const t of arena.hazards.turrets)   assert.ok(isReachable(t), `${label}: turret unreachable`);
  for (const b of arena.hazards.blackholes) assert.ok(isReachable(b), `${label}: black hole unreachable`);
}

function assertValidArena(arena, label) {
  // Dimensions
  assert.strictEqual(arena.tiles.length, ROWS, `${label}: row count`);
  assert.strictEqual(arena.tiles[0].length, COLS, `${label}: col count`);
  assert.strictEqual(arena.wallHP.length, ROWS, `${label}: wallHP rows`);

  // Theme
  assert.ok(CONFIG.THEME_NAMES.includes(arena.theme), `${label}: valid theme`);

  // Solid border
  for (let c = 0; c < COLS; c++) {
    assert.strictEqual(arena.tiles[0][c], TILE.WALL_SOLID, `${label}: top border`);
    assert.strictEqual(arena.tiles[ROWS-1][c], TILE.WALL_SOLID, `${label}: bottom border`);
  }
  for (let r = 0; r < ROWS; r++) {
    assert.strictEqual(arena.tiles[r][0], TILE.WALL_SOLID, `${label}: left border`);
    assert.strictEqual(arena.tiles[r][COLS-1], TILE.WALL_SOLID, `${label}: right border`);
  }

  // Spawns: at least 4, on FLOOR, 3x3 surroundings clear
  assert.ok(arena.spawnPoints.length >= 4, `${label}: >= 4 spawns`);
  for (const sp of arena.spawnPoints) {
    const { r, c } = tileOf(sp);
    assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, `${label}: spawn tile is FLOOR`);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        assert.strictEqual(arena.tiles[r+dr][c+dc], TILE.FLOOR,
          `${label}: spawn 3x3 clear at ${r+dr},${c+dc}`);
      }
    }
  }

  // Powerup spots: at least 4, on FLOOR
  assert.ok(arena.powerupSpots.length >= 4, `${label}: >= 4 powerup spots`);
  for (const p of arena.powerupSpots) {
    const { r, c } = tileOf(p);
    assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, `${label}: powerup spot on FLOOR`);
  }

  // Hazards on FLOOR tiles and in bounds
  const hazardPositions = [
    ...arena.hazards.mines,
    ...arena.hazards.turrets,
    ...arena.hazards.blackholes,
  ];
  for (const h of hazardPositions) {
    assert.ok(h.x > 0 && h.x < CONFIG.ARENA_WIDTH, `${label}: hazard x in bounds`);
    assert.ok(h.y > 0 && h.y < CONFIG.ARENA_HEIGHT, `${label}: hazard y in bounds`);
    const { r, c } = tileOf(h);
    assert.strictEqual(arena.tiles[r][c], TILE.FLOOR, `${label}: hazard on FLOOR at ${r},${c}`);
  }
  for (const t of arena.hazards.turrets) {
    assert.ok(t.type === 'missile' || t.type === 'mortar', `${label}: turret type valid`);
  }

  // Destructible walls have HP
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (arena.tiles[r][c] === TILE.WALL_DEST) {
        assert.strictEqual(arena.wallHP[r][c], CONFIG.WALL_DEST_HP, `${label}: D tile has HP`);
      }
    }
  }
}

// ── Layout parsing & validity ─────────────────────────────────

test('all 9 handcrafted layouts parse and are structurally valid', () => {
  assert.strictEqual(LAYOUTS.length, 9);
  for (const layout of LAYOUTS) {
    const arena = parseArena(layout);
    assertValidArena(arena, layout.id);
  }
});

test('layout difficulties: 3 EASY, 3 MEDIUM, 3 HARD', () => {
  const count = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const l of LAYOUTS) count[l.difficulty]++;
  assert.deepStrictEqual(count, { EASY: 3, MEDIUM: 3, HARD: 3 });
});

// ── Connectivity ──────────────────────────────────────────────

test('all handcrafted layouts are fully connected (D treated as passable)', () => {
  for (const layout of LAYOUTS) {
    assertFullyConnected(parseArena(layout), layout.id);
  }
});

test('10 random procedural arenas are fully connected', () => {
  for (let i = 0; i < 10; i++) {
    assertFullyConnected(generateArena(), `procedural#${i}`);
  }
});

// ── getArena / arenaList ──────────────────────────────────────

test("getArena('random') returns a valid procedural arena", () => {
  const arena = getArena('random');
  assertValidArena(arena, 'random');
  assert.strictEqual(arena.spawnPoints.length, 4);
});

test('getArena(<id>) parses the right layout', () => {
  for (const layout of LAYOUTS) {
    const a = getArena(layout.id);
    const b = parseArena(layout);
    assert.deepStrictEqual(a.tiles, b.tiles, layout.id);
    assert.strictEqual(a.theme, layout.theme);
    assert.strictEqual(a.spawnPoints.length, layout.map.join('').split('S').length - 1);
  }
});

test('getArena throws on unknown id', () => {
  assert.throws(() => getArena('no-such-arena'), /Unknown arena id/);
});

test('parseArena validates input', () => {
  const base = LAYOUTS[0];
  // Wrong row count
  assert.throws(() => parseArena({ ...base, map: base.map.slice(0, 10) }), /30 rows/);
  // Wrong row width
  assert.throws(() => parseArena({ ...base, map: [base.map[0] + '#', ...base.map.slice(1)] }), /40 chars/);
  // Unknown char
  const badChar = base.map.slice();
  badChar[5] = badChar[5].slice(0, 5) + 'X' + badChar[5].slice(6);
  assert.throws(() => parseArena({ ...base, map: badChar }), /unknown char/);
  // Too few spawns
  const noSpawns = base.map.map(row => row.replaceAll('S', '.'));
  assert.throws(() => parseArena({ ...base, map: noSpawns }), /4 spawn/);
});

test('arenaList() returns 9 entries with unique ids and valid metadata', () => {
  const list = arenaList();
  assert.strictEqual(list.length, 9);
  const ids = new Set(list.map(a => a.id));
  assert.strictEqual(ids.size, 9);
  for (const a of list) {
    assert.ok(a.name && typeof a.name === 'string');
    assert.ok(['EASY', 'MEDIUM', 'HARD'].includes(a.difficulty));
    assert.ok(CONFIG.THEME_NAMES.includes(a.theme));
  }
});
