// server/src/arena.js — Arena tilemap generation

'use strict';

const CONFIG = require('./config');
const { TILE, ARENA_COLS: COLS, ARENA_ROWS: ROWS } = CONFIG;

/**
 * Generate a structured arena tilemap.
 * Returns { tiles, wallHP, theme, spawnPoints, powerupSpots }
 */
function generateArena() {
  const themeIdx  = Math.floor(Math.random() * CONFIG.THEME_NAMES.length);
  const theme     = CONFIG.THEME_NAMES[themeIdx];

  // tiles[row][col] = tile type (int)
  const tiles = Array.from({ length: ROWS }, () => new Array(COLS).fill(TILE.FLOOR));

  // wallHP[row][col] = remaining HP (only for destructible walls)
  const wallHP = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

  // ── Outer border: indestructible walls ───────────────────
  for (let c = 0; c < COLS; c++) {
    tiles[0][c]        = TILE.WALL_SOLID;
    tiles[ROWS-1][c]   = TILE.WALL_SOLID;
  }
  for (let r = 0; r < ROWS; r++) {
    tiles[r][0]        = TILE.WALL_SOLID;
    tiles[r][COLS-1]   = TILE.WALL_SOLID;
  }

  // ── Four quadrant rooms with internal walls ───────────────
  // Quadrants (excluding outer border):
  //   TL: rows 1–13, cols 1–18
  //   TR: rows 1–13, cols 21–38
  //   BL: rows 16–28, cols 1–18
  //   BR: rows 16–28, cols 21–38
  // Center open zone: rows 12–17, cols 16–23

  const quadrants = [
    { r1:2,  c1:2,  r2:12, c2:17 },  // TL
    { r1:2,  c1:22, r2:12, c2:37 },  // TR
    { r1:17, c1:2,  r2:27, c2:17 },  // BL
    { r1:17, c1:22, r2:27, c2:37 },  // BR
  ];

  // Corridors connecting quadrants to center (already open — just ensure no walls there)
  // Horizontal corridors: rows 13–16
  // Vertical corridors: cols 18–21
  // Center: rows 12–17, cols 17–22

  const rng = mulberry32(Date.now());

  for (const q of quadrants) {
    placeQuadrantWalls(tiles, wallHP, q, rng);
  }

  // Place special tiles in each quadrant
  const specials = [TILE.ACID, TILE.REFUEL, TILE.ACID, TILE.REFUEL];
  for (let i = 0; i < quadrants.length; i++) {
    const q = quadrants[i];
    const tr = randInt(rng, q.r1 + 1, q.r2 - 1);
    const tc = randInt(rng, q.c1 + 1, q.c2 - 1);
    if (tiles[tr][tc] === TILE.FLOOR) {
      tiles[tr][tc] = specials[i];
    }
  }

  // ── Internal corridor walls ───────────────────────────────
  // Vertical divider (partial) — leave corridors open
  // Left side divider between TL and BL
  for (let r = 5; r <= 10; r++) {
    if (tiles[r][10] === TILE.FLOOR) tiles[r][10] = TILE.WALL_SOLID;
  }
  // Right side divider between TR and BR
  for (let r = 5; r <= 10; r++) {
    if (tiles[r][29] === TILE.FLOOR) tiles[r][29] = TILE.WALL_SOLID;
  }
  for (let r = 18; r <= 23; r++) {
    if (tiles[r][10] === TILE.FLOOR) tiles[r][10] = TILE.WALL_SOLID;
  }
  for (let r = 18; r <= 23; r++) {
    if (tiles[r][29] === TILE.FLOOR) tiles[r][29] = TILE.WALL_SOLID;
  }

  // ── Spawn points (4 corners, offset 3 tiles from corner) ──
  const spawnPoints = [
    { x: 4 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: 3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 },   // TL
    { x: (COLS-4) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: 3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 }, // TR
    { x: 4 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: (ROWS-4) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 }, // BL
    { x: (COLS-4) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y: (ROWS-4) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2 }, // BR
  ];

  // Make sure spawn areas are clear
  for (const sp of spawnPoints) {
    const tc = Math.floor(sp.x / CONFIG.TILE_SIZE);
    const tr = Math.floor(sp.y / CONFIG.TILE_SIZE);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = tr + dr, cc = tc + dc;
        if (rr > 0 && rr < ROWS-1 && cc > 0 && cc < COLS-1) {
          if (tiles[rr][cc] !== TILE.WALL_SOLID) tiles[rr][cc] = TILE.FLOOR;
        }
      }
    }
  }

  // ── Power-up spawn spots ───────────────────────────────────
  const powerupSpots = [
    { x: 19.5 * CONFIG.TILE_SIZE, y:  7 * CONFIG.TILE_SIZE },  // center-top
    { x: 19.5 * CONFIG.TILE_SIZE, y: 22 * CONFIG.TILE_SIZE },  // center-bottom
    { x:  9   * CONFIG.TILE_SIZE, y: 14 * CONFIG.TILE_SIZE },  // mid-left
    { x: 30   * CONFIG.TILE_SIZE, y: 14 * CONFIG.TILE_SIZE },  // mid-right
    { x: 14   * CONFIG.TILE_SIZE, y:  5 * CONFIG.TILE_SIZE },  // TL inner
    { x: 25   * CONFIG.TILE_SIZE, y:  5 * CONFIG.TILE_SIZE },  // TR inner
    { x: 14   * CONFIG.TILE_SIZE, y: 24 * CONFIG.TILE_SIZE },  // BL inner
    { x: 25   * CONFIG.TILE_SIZE, y: 24 * CONFIG.TILE_SIZE },  // BR inner
  ];

  return { tiles, wallHP, theme, spawnPoints, powerupSpots };
}

function placeQuadrantWalls(tiles, wallHP, q, rng) {
  const { r1, c1, r2, c2 } = q;
  const width  = c2 - c1;
  const height = r2 - r1;

  // Place 2-3 solid wall segments as cover
  const numSolid = 2 + (rng() > 0.6 ? 1 : 0);
  for (let i = 0; i < numSolid; i++) {
    const wr = randInt(rng, r1 + 2, r2 - 2);
    const wc = randInt(rng, c1 + 2, c2 - 2);
    const len = 2 + Math.floor(rng() * 3);
    const horiz = rng() > 0.5;
    for (let j = 0; j < len; j++) {
      const rr = horiz ? wr : wr + j;
      const cc = horiz ? wc + j : wc;
      if (rr >= r1 && rr <= r2 && cc >= c1 && cc <= c2) {
        tiles[rr][cc] = TILE.WALL_SOLID;
      }
    }
  }

  // Place 1-2 destructible wall segments
  const numDest = 1 + (rng() > 0.5 ? 1 : 0);
  for (let i = 0; i < numDest; i++) {
    const wr = randInt(rng, r1 + 1, r2 - 1);
    const wc = randInt(rng, c1 + 1, c2 - 1);
    const len = 2 + Math.floor(rng() * 2);
    const horiz = rng() > 0.5;
    for (let j = 0; j < len; j++) {
      const rr = horiz ? wr : wr + j;
      const cc = horiz ? wc + j : wc;
      if (rr >= r1 && rr <= r2 && cc >= c1 && cc <= c2 && tiles[rr][cc] === TILE.FLOOR) {
        tiles[rr][cc] = TILE.WALL_DEST;
        wallHP[rr][cc] = CONFIG.WALL_DEST_HP;
      }
    }
  }
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Simple deterministic RNG (Mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Check if a tile is solid (blocks movement).
 */
function isSolid(tile) {
  return tile === TILE.WALL_SOLID || tile === TILE.WALL_DEST || tile === TILE.GLASS;
}

/**
 * Get tile at world position.
 */
function getTile(tiles, wx, wy) {
  const col = Math.floor(wx / CONFIG.TILE_SIZE);
  const row = Math.floor(wy / CONFIG.TILE_SIZE);
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return TILE.WALL_SOLID;
  return tiles[row][col];
}

module.exports = { generateArena, isSolid, getTile };
