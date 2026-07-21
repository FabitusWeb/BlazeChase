// server/test/doors-pistons.test.js — porte + bottoni trigger, one-way, pistoni (F7b)

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { TILE } = CONFIG;
const { getArena } = require('../src/arenas');
const { createDoorState, toggleDoorGroup, updateDoors, createPiston, updatePistons } = require('../src/hazards');
const { updateShip, createShip } = require('../src/physics');
const Game = require('../src/game');

const TS = CONFIG.TILE_SIZE;

// ── Parser ────────────────────────────────────────────────

test('ca-chase has a door group with a linked trigger button', () => {
  const arena = getArena('ca-chase');
  assert.ok(arena.hazards.doors.length > 0, 'nessuna porta nel layout');
  assert.ok(arena.hazards.buttons.length > 0, 'nessun bottone nel layout');
  const groups = new Set(arena.hazards.doors.map(d => d.group));
  for (const b of arena.hazards.buttons) {
    assert.ok(groups.has(b.group), `bottone collegato a gruppo ${b.group} senza porte`);
  }
  for (const d of arena.hazards.doors) {
    assert.strictEqual(arena.tiles[d.r][d.c], TILE.DOOR);
  }
});

test('ca-interconnection-void has a piston', () => {
  const arena = getArena('ca-interconnection-void');
  assert.strictEqual(arena.hazards.pistons.length, 1);
  assert.ok(['x', 'y'].includes(arena.hazards.pistons[0].axis));
});

test('one-way tiles carry an allowed direction in oneWayDir', () => {
  const arena = getArena('ca-rooms-of-chaos');
  assert.ok(arena.hazards.oneWays.length >= 2, 'attesi almeno 2 one-way');
  for (const w of arena.hazards.oneWays) {
    const dir = arena.oneWayDir[w.r][w.c];
    assert.ok(dir && Math.abs(dir.dx) + Math.abs(dir.dy) === 1, `direzione one-way non valida in ${w.r},${w.c}`);
    assert.strictEqual(arena.tiles[w.r][w.c], TILE.ONEWAY);
  }
});

// ── Doors ─────────────────────────────────────────────────

function doorFixture() {
  const doorTiles = [{ c: 5, r: 5, x: 5 * TS + TS / 2, y: 5 * TS + TS / 2, group: 3 }];
  const tiles = Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(TILE.FLOOR));
  tiles[5][5] = TILE.DOOR;
  return { doorTiles, tiles, doorState: createDoorState(doorTiles) };
}

test('button toggle opens the door (tile becomes floor), re-toggle closes it', () => {
  const { doorTiles, tiles, doorState } = doorFixture();
  const open = toggleDoorGroup(doorState, 3);
  assert.strictEqual(open, true);
  // Animazione fino a frac 1
  for (let i = 0; i < 60; i++) updateDoors(doorState, doorTiles, tiles, {}, 0.05);
  assert.strictEqual(doorState[3].frac, 1);
  assert.strictEqual(tiles[5][5], TILE.FLOOR, 'porta aperta deve diventare pavimento');

  const open2 = toggleDoorGroup(doorState, 3);
  assert.strictEqual(open2, false);
  updateDoors(doorState, doorTiles, tiles, {}, 0.05);
  assert.strictEqual(tiles[5][5], TILE.DOOR, 'porta in chiusura torna solida subito');
});

test('toggle on unknown group returns null', () => {
  const { doorState } = doorFixture();
  assert.strictEqual(toggleDoorGroup(doorState, 99), null);
});

test('Game: shooting the button toggles the door (event door)', (t) => {
  const msgs = [];
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    m => msgs.push(m), { arenaId: 'ca-chase' });
  t.after(() => g.stop());

  const btn = g.buttons[0];
  const group = btn.group;
  const openBefore = g.doorState[group].open;
  g._processBulletEvent({ kind: 'button_hit', bullet: { x: btn.x, y: btn.y, weapon: 0, damage: 8 }, tx: btn.c, ty: btn.r });

  assert.strictEqual(g.doorState[group].open, !openBefore);
  const ev = g.events.find(e => e.kind === 'door');
  assert.ok(ev, 'evento door non emesso');
  assert.strictEqual(ev.group, group);
});

// ── One-way physics ───────────────────────────────────────

function oneWayArena(dir) {
  const tiles = Array.from({ length: CONFIG.ARENA_ROWS }, (_, r) =>
    Array.from({ length: CONFIG.ARENA_COLS }, (_, c) =>
      (r === 0 || c === 0 || r === CONFIG.ARENA_ROWS - 1 || c === CONFIG.ARENA_COLS - 1) ? TILE.WALL_SOLID : TILE.FLOOR));
  tiles[5][5] = TILE.ONEWAY;
  const oneWayDir = Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(null));
  oneWayDir[5][5] = dir;
  return { tiles, wallHP: tiles.map(row => row.map(() => 0)), oneWayDir };
}

test('one-way blocks against the direction, lets through with it', () => {
  // One-way: attraversabile solo andando a destra (dx=1)
  const arena = oneWayArena({ dx: 1, dy: 0 });

  // Nave a sinistra del tile che va a destra (direzione consentita)
  const through = createShip({ id: 'p1', name: 'T', ship: 0 }, { x: 5 * TS - TS / 2, y: 5 * TS + TS / 2 }, 0);
  through.angle = 0;
  const inputRight = { up: true, down: false, left: false, right: false, fire: false, dash: false, dodge: false };
  for (let i = 0; i < 90; i++) updateShip(through, inputRight, 1 / 60, arena);
  assert.ok(through.x > 5 * TS + TS, `non ha attraversato il one-way nella direzione consentita (x=${through.x.toFixed(0)})`);

  // Nave a destra del tile che va a sinistra (contro la direzione)
  const blocked = createShip({ id: 'p2', name: 'T', ship: 0 }, { x: 6 * TS + TS / 2, y: 5 * TS + TS / 2 }, 0);
  blocked.angle = Math.PI;
  for (let i = 0; i < 90; i++) updateShip(blocked, inputRight, 1 / 60, arena);
  assert.ok(blocked.x > 5 * TS + TS / 2, `ha attraversato il one-way contro direzione (x=${blocked.x.toFixed(0)})`);
});

// ── Pistons ───────────────────────────────────────────────

test('piston moves along its axis and reverses at range limits', () => {
  const p = createPiston({ x: 500, y: 500, axis: 'x' });
  const ships = {};
  const tiles = Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(TILE.FLOOR));
  const arena = { tiles };

  const x0 = p.x;
  // Avanza
  for (let i = 0; i < 20; i++) updatePistons([p], ships, arena, 0.05);
  assert.ok(p.x > x0, 'pistone fermo');
  // Arriva al limite e inverte
  for (let i = 0; i < 200; i++) updatePistons([p], ships, arena, 0.05);
  assert.ok(Math.abs(p.offset) <= CONFIG.HAZARDS.PISTON.RANGE * TS + 1);
  assert.ok(p.pauseTimer >= -0.05, `pauseTimer ${p.pauseTimer} fuori range`);
});

test('piston crushes a ship pinned against a wall', () => {
  const p = createPiston({ x: 500, y: 500, axis: 'x' });
  const tiles = Array.from({ length: CONFIG.ARENA_ROWS }, () => new Array(CONFIG.ARENA_COLS).fill(TILE.FLOOR));
  // Muro proprio a destra del pistone (mezza tile di scarto)
  tiles[Math.floor(500 / TS)][Math.floor((500 + TS) / TS)] = TILE.WALL_SOLID;
  const arena = { tiles };

  const ship = createShip({ id: 'p1', name: 'T', ship: 0 }, { x: 500 + TS / 2, y: 500 }, 0);
  const ships = { p1: ship };
  const { damages } = updatePistons([p], ships, arena, 0.05);
  assert.ok(damages.length > 0, 'nessun danno da schiacciamento');
  assert.ok(damages[0].dmg > 0);
});

// ── Game wiring ───────────────────────────────────────────

test('Game broadcasts doors and pistons in state', (t) => {
  const msgs = [];
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    m => msgs.push(m), { arenaId: 'ca-chase' });
  t.after(() => g.stop());
  g._broadcastState();
  const state = msgs.find(m => m.type === 'state');
  assert.ok(Array.isArray(state.doors));
  assert.ok(Array.isArray(state.pistons));
  assert.ok(state.doors.length > 0, 'doors non nello state');
});
