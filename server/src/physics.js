// server/src/physics.js — Ship movement, collision resolution, environment effects

'use strict';

const CONFIG = require('./config');
const { TILE, TILE_SIZE } = CONFIG;
const { isSolid } = require('./arena');

const TAU = Math.PI * 2;

/**
 * Update a single ship for one physics tick.
 * @param {object} ship  — mutable ship state
 * @param {object} input — { up, down, left, right, fire, dash, dodge, switchWeapon }
 * @param {number} dt    — seconds since last tick
 * @param {object} arena — { tiles, wallHP }
 */
function updateShip(ship, input, dt, arena) {
  if (!ship.alive) {
    ship.respawnTimer -= dt;
    if (ship.respawnTimer <= 0) {
      respawnShip(ship, arena);
    }
    return;
  }

  const def = CONFIG.SHIPS[ship.shipId];

  // ── Timers ───────────────────────────────────────────────
  if (ship.fireTimer   > 0) ship.fireTimer   -= dt;
  if (ship.dashTimer   > 0) ship.dashTimer   -= dt;
  if (ship.dashCooldown > 0) ship.dashCooldown -= dt;
  if (ship.dodgeTimer  > 0) ship.dodgeTimer  -= dt;
  if (ship.dodgeCooldown > 0) ship.dodgeCooldown -= dt;
  if (ship.invulnTimer  > 0) ship.invulnTimer  -= dt;
  if (ship.hitFlashTimer > 0) ship.hitFlashTimer -= dt;
  if (ship.pshieldTimer > 0) ship.pshieldTimer -= dt;
  if (ship.speedBoostTimer > 0) ship.speedBoostTimer -= dt;

  ship.dashing = ship.dashTimer > 0;
  ship.dodging = ship.dodgeTimer > 0;
  ship.invulnerable = ship.invulnTimer > 0;

  const speedMult = ship.speedBoostTimer > 0 ? 1.4 : 1.0;
  const maxSpeed  = def.speed * speedMult;

  // ── Dodge initiation ────────────────────────────────────
  if (input.dodge && !ship.dodging && ship.dodgeCooldown <= 0) {
    // Lateral burst (perpendicular to facing direction)
    const perpAngle = ship.angle + Math.PI / 2;
    const dir = input.left ? -1 : 1;
    ship.vx += Math.cos(perpAngle) * dir * CONFIG.DODGE_SPEED;
    ship.vy += Math.sin(perpAngle) * dir * CONFIG.DODGE_SPEED;
    ship.dodgeTimer    = CONFIG.DODGE_DURATION;
    ship.dodgeCooldown = CONFIG.DODGE_COOLDOWN;
    ship.invulnTimer   = Math.max(ship.invulnTimer, CONFIG.DODGE_INVULN);
  }

  // ── Dash initiation ─────────────────────────────────────
  if (input.dash && !ship.dashing && ship.dashCooldown <= 0 && !ship.dodging) {
    ship.vx = Math.cos(ship.angle) * CONFIG.DASH_SPEED;
    ship.vy = Math.sin(ship.angle) * CONFIG.DASH_SPEED;
    ship.dashTimer    = CONFIG.DASH_DURATION;
    ship.dashCooldown = CONFIG.DASH_COOLDOWN;
  }

  // ── Rotation (only when not dashing) ────────────────────
  if (!ship.dashing) {
    if (input.left)  ship.angle -= def.turn * dt;
    if (input.right) ship.angle += def.turn * dt;
    ship.angle = ((ship.angle % TAU) + TAU) % TAU;
  }

  // ── Thrust ──────────────────────────────────────────────
  if (!ship.dashing) {
    let accel = CONFIG.SHIP_ACCEL;
    if (ship.onAcid) accel *= CONFIG.ACID_SLOW;

    if (input.up) {
      ship.vx += Math.cos(ship.angle) * accel * dt;
      ship.vy += Math.sin(ship.angle) * accel * dt;
    }
    if (input.down) {
      ship.vx -= Math.cos(ship.angle) * accel * 0.5 * dt;
      ship.vy -= Math.sin(ship.angle) * accel * 0.5 * dt;
    }
  }

  // ── Friction ────────────────────────────────────────────
  if (!ship.dashing) {
    const frict = Math.pow(CONFIG.SHIP_FRICTION, dt * 60);
    ship.vx *= frict;
    ship.vy *= frict;
  }

  // ── Speed cap ───────────────────────────────────────────
  const speed = Math.hypot(ship.vx, ship.vy);
  const cap   = ship.dashing ? CONFIG.DASH_SPEED * 1.1 : maxSpeed;
  if (speed > cap) {
    ship.vx = (ship.vx / speed) * cap;
    ship.vy = (ship.vy / speed) * cap;
  }

  // ── Angular velocity for client skid marks ──────────────
  ship.angularVel = 0;
  if (input.left)  ship.angularVel = -def.turn;
  if (input.right) ship.angularVel =  def.turn;

  // ── Movement + Collision ─────────────────────────────────
  const newX = ship.x + ship.vx * dt;
  ship.x = resolveAxisX(ship, newX, arena.tiles);

  const newY = ship.y + ship.vy * dt;
  ship.y = resolveAxisY(ship, newY, arena.tiles);

  // ── Environment effects ──────────────────────────────────
  const tileUnder = getTileAt(arena.tiles, ship.x, ship.y);
  ship.onAcid   = (tileUnder === TILE.ACID);
  ship.onRefuel = (tileUnder === TILE.REFUEL);

  ship.acidKill = false;
  if (ship.onAcid && !ship.invulnerable) {
    ship.shield -= CONFIG.ACID_DAMAGE * dt;
    if (ship.shield <= 0) {
      ship.shield = 0;
      ship.acidKill = true;
    }
  }

  if (ship.onRefuel) {
    const maxShield = CONFIG.SHIPS[ship.shipId].shield;
    const maxAmmo   = CONFIG.SHIPS[ship.shipId].ammo;
    ship.shield = Math.min(maxShield, ship.shield + CONFIG.REFUEL_SHIELD_RATE * dt);
    ship.ammo   = Math.min(maxAmmo,   ship.ammo   + CONFIG.REFUEL_AMMO_RATE   * dt);
  }

  // ── Thrust flag for rendering ────────────────────────────
  ship.thrusting = !!input.up;
}

/**
 * Resolve X-axis tile collision.
 */
function resolveAxisX(ship, newX, tiles) {
  const r = CONFIG.SHIP_RADIUS;
  // Test leading edges
  if (ship.vx > 0) {
    // Moving right — test right edge
    if (isSolidAt(tiles, newX + r, ship.y - r * 0.6) ||
        isSolidAt(tiles, newX + r, ship.y + r * 0.6)) {
      const col = Math.floor((newX + r) / TILE_SIZE);
      ship.vx = 0;
      return col * TILE_SIZE - r - 0.1;
    }
  } else if (ship.vx < 0) {
    // Moving left — test left edge
    if (isSolidAt(tiles, newX - r, ship.y - r * 0.6) ||
        isSolidAt(tiles, newX - r, ship.y + r * 0.6)) {
      const col = Math.floor((newX - r) / TILE_SIZE) + 1;
      ship.vx = 0;
      return col * TILE_SIZE + r + 0.1;
    }
  }
  return newX;
}

/**
 * Resolve Y-axis tile collision.
 */
function resolveAxisY(ship, newY, tiles) {
  const r = CONFIG.SHIP_RADIUS;
  if (ship.vy > 0) {
    if (isSolidAt(tiles, ship.x - r * 0.6, newY + r) ||
        isSolidAt(tiles, ship.x + r * 0.6, newY + r)) {
      const row = Math.floor((newY + r) / TILE_SIZE);
      ship.vy = 0;
      return row * TILE_SIZE - r - 0.1;
    }
  } else if (ship.vy < 0) {
    if (isSolidAt(tiles, ship.x - r * 0.6, newY - r) ||
        isSolidAt(tiles, ship.x + r * 0.6, newY - r)) {
      const row = Math.floor((newY - r) / TILE_SIZE) + 1;
      ship.vy = 0;
      return row * TILE_SIZE + r + 0.1;
    }
  }
  return newY;
}

function isSolidAt(tiles, wx, wy) {
  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  const ROWS = CONFIG.ARENA_ROWS;
  const COLS = CONFIG.ARENA_COLS;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
  const t = tiles[row][col];
  return isSolid(t);
}

function getTileAt(tiles, wx, wy) {
  const col = Math.floor(wx / TILE_SIZE);
  const row = Math.floor(wy / TILE_SIZE);
  if (row < 0 || row >= CONFIG.ARENA_ROWS || col < 0 || col >= CONFIG.ARENA_COLS) return TILE.WALL_SOLID;
  return tiles[row][col];
}

/**
 * Ship-ship collision pushback.
 */
function resolveShipCollisions(ships) {
  const minDist = CONFIG.SHIP_RADIUS * 2;
  const keys = Object.keys(ships);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = ships[keys[i]];
      const b = ships[keys[j]];
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist && dist > 0.01) {
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        // Exchange some velocity
        const relVx = a.vx - b.vx;
        const relVy = a.vy - b.vy;
        const dot = relVx * nx + relVy * ny;
        if (dot > 0) {
          a.vx -= dot * nx * 0.5;
          a.vy -= dot * ny * 0.5;
          b.vx += dot * nx * 0.5;
          b.vy += dot * ny * 0.5;
        }
      }
    }
  }
}

function respawnShip(ship, arena) {
  const sp = arena.spawnPoints[Math.floor(Math.random() * arena.spawnPoints.length)];
  ship.x = sp.x + (Math.random() - 0.5) * 40;
  ship.y = sp.y + (Math.random() - 0.5) * 40;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = Math.random() * Math.PI * 2;
  ship.alive = true;
  ship.invulnTimer = CONFIG.RESPAWN_INVULN;
  ship.invulnerable = true;
  // Restore ship to full shield/ammo on respawn
  const def = CONFIG.SHIPS[ship.shipId];
  ship.shield = def.shield;
  ship.ammo   = def.ammo;
  ship.weapon = 0; // Reset to blaster
}

/**
 * Create initial ship state from player info.
 */
function createShip(player, spawnPoint, shipIndex) {
  const def = CONFIG.SHIPS[player.ship || 0];
  return {
    id:             player.id,
    name:           player.name,
    shipId:         player.ship || 0,
    x:              spawnPoint.x,
    y:              spawnPoint.y,
    vx:             0,
    vy:             0,
    angle:          Math.random() * Math.PI * 2,
    angularVel:     0,
    shield:         def.shield,
    ammo:           def.ammo,
    weapon:         0,
    fireTimer:      0,
    dashTimer:      0,
    dashCooldown:   0,
    dodgeTimer:     0,
    dodgeCooldown:  0,
    invulnTimer:    CONFIG.RESPAWN_INVULN,
    invulnerable:   true,
    hitFlashTimer:  0,
    pshieldTimer:   0,
    speedBoostTimer: 0,
    dashing:        false,
    dodging:        false,
    thrusting:      false,
    onAcid:         false,
    onRefuel:       false,
    alive:          true,
    respawnTimer:   0,
    kills:          0,
    deaths:         0,
  };
}

module.exports = { updateShip, resolveShipCollisions, createShip, isSolidAt, getTileAt };
