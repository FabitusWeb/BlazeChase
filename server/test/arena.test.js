// server/test/arena.test.js — smoke test generazione arena

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { generateArena, isSolid } = require('../src/arena');

const { TILE, ARENA_ROWS: ROWS, ARENA_COLS: COLS } = CONFIG;

test('genera arene con bordi solidi e struttura valida', () => {
  for (let n = 0; n < 20; n++) {
    const arena = generateArena();

    // Dimensioni
    assert.strictEqual(arena.tiles.length, ROWS);
    assert.strictEqual(arena.tiles[0].length, COLS);
    assert.strictEqual(arena.wallHP.length, ROWS);

    // Tema valido
    assert.ok(CONFIG.THEME_NAMES.includes(arena.theme));

    // Bordi tutti solidi
    for (let c = 0; c < COLS; c++) {
      assert.strictEqual(arena.tiles[0][c], TILE.WALL_SOLID);
      assert.strictEqual(arena.tiles[ROWS - 1][c], TILE.WALL_SOLID);
    }
    for (let r = 0; r < ROWS; r++) {
      assert.strictEqual(arena.tiles[r][0], TILE.WALL_SOLID);
      assert.strictEqual(arena.tiles[r][COLS - 1], TILE.WALL_SOLID);
    }

    // 4 spawn points, su tile calpestabile
    assert.strictEqual(arena.spawnPoints.length, 4);
    for (const sp of arena.spawnPoints) {
      const tc = Math.floor(sp.x / CONFIG.TILE_SIZE);
      const tr = Math.floor(sp.y / CONFIG.TILE_SIZE);
      assert.ok(!isSolid(arena.tiles[tr][tc]), `spawn ${tr},${tc} deve essere libero`);
    }

    // Power-up spots presenti e dentro l'arena
    assert.strictEqual(arena.powerupSpots.length, 8);
    for (const spot of arena.powerupSpots) {
      assert.ok(spot.x > 0 && spot.x < CONFIG.ARENA_WIDTH);
      assert.ok(spot.y > 0 && spot.y < CONFIG.ARENA_HEIGHT);
    }

    // Muri distruttibili hanno HP, gli altri tile no
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (arena.tiles[r][c] === TILE.WALL_DEST) {
          assert.ok(arena.wallHP[r][c] > 0);
        }
      }
    }
  }
});
