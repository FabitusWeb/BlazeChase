// server/src/hazards.js — Environmental hazards: turrets, black holes, energy waves

'use strict';

const CONFIG = require('./config');

const TURRET_CFG = {
  missile: CONFIG.HAZARDS.TURRET_MISSILE,
  mortar:  CONFIG.HAZARDS.TURRET_MORTAR,
};

// Turret bullets reuse existing WEAPONS ids so the client colors work
const TURRET_WEAPON = { missile: 3, mortar: 6 };

const TURN_RATE = 4.0;        // rad/s turret tracking speed
const ALIGN_TOLERANCE = 0.15; // rad — fire only when aimed at the target

/**
 * Create a turret from an arena hazard definition { type, x, y }.
 */
function createTurret(def, id) {
  const cfg = TURRET_CFG[def.type];
  return {
    id,
    type: def.type,
    x:    def.x,
    y:    def.y,
    hp:        cfg.HP,
    angle:     Math.random() * Math.PI * 2,
    fireTimer: Math.random() * cfg.FIRE_RATE,
    alive:     true,
  };
}

/**
 * Update all turrets for one tick: track the nearest ship in range and
 * fire when aligned. Returns { bullets }.
 */
function updateTurrets(turrets, ships, dt) {
  const bullets = [];

  for (const t of turrets) {
    if (!t.alive) continue;
    const cfg = TURRET_CFG[t.type];
    t.fireTimer -= dt;

    // Nearest alive ship within range
    let target = null;
    let minDist = Infinity;
    for (const ship of Object.values(ships)) {
      if (!ship.alive) continue;
      const d = Math.hypot(ship.x - t.x, ship.y - t.y);
      if (d <= cfg.RANGE && d < minDist) { minDist = d; target = ship; }
    }
    if (!target) continue;

    // Rotate toward the target (shortest arc, capped turn rate)
    const desired = Math.atan2(target.y - t.y, target.x - t.x);
    let diff = desired - t.angle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = TURN_RATE * dt;
    t.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

    // Fire when aligned and the fire timer expired
    if (Math.abs(diff) <= ALIGN_TOLERANCE && t.fireTimer <= 0) {
      t.fireTimer = cfg.FIRE_RATE;
      bullets.push({
        id:       Math.floor(Math.random() * 1e9),
        ownerId:  t.id,
        weapon:   TURRET_WEAPON[t.type],
        x:        t.x + Math.cos(t.angle) * 18,
        y:        t.y + Math.sin(t.angle) * 18,
        vx:       Math.cos(t.angle) * cfg.BULLET_SPEED,
        vy:       Math.sin(t.angle) * cfg.BULLET_SPEED,
        damage:   cfg.DAMAGE,
        size:     7,
        homing:   cfg.HOMING || false,
        erratic:  false,
        aoe:      cfg.AOE ? { radius: cfg.AOE.radius, damage: cfg.AOE.damage } : null,
        lifetime: CONFIG.BULLET_LIFETIME,
      });
    }
  }

  return { bullets };
}

/**
 * Black hole gravity: pull every alive ship within PULL_RADIUS toward the
 * hole (stronger when closer). Ships inside DAMAGE_RADIUS take damage.
 * Returns damages: [{ ship, dmg }] — the caller applies them.
 */
function applyBlackholes(blackholes, ships, dt) {
  const damages = [];
  const cfg = CONFIG.HAZARDS.BLACKHOLE;

  for (const bh of blackholes) {
    for (const ship of Object.values(ships)) {
      if (!ship.alive) continue;
      const dx   = bh.x - ship.x;
      const dy   = bh.y - ship.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= cfg.PULL_RADIUS) continue;

      if (dist > 0) {
        const force = cfg.PULL_FORCE * (1 - dist / cfg.PULL_RADIUS);
        ship.vx += (dx / dist) * force * dt;
        ship.vy += (dy / dist) * force * dt;
      }
      if (dist < cfg.DAMAGE_RADIUS) {
        damages.push({ ship, dmg: cfg.DPS * dt });
      }
    }
  }

  return damages;
}

/**
 * Gravity zones (CA style): single-tile areas that push ships in a fixed
 * direction { x, y, dx, dy } (dx/dy unit axis). Mutates ship velocities.
 */
function applyGravity(zones, ships, dt) {
  const half  = CONFIG.TILE_SIZE / 2;
  const force = CONFIG.HAZARDS.GRAVITY.FORCE;

  for (const z of zones) {
    for (const ship of Object.values(ships)) {
      if (!ship.alive) continue;
      if (Math.abs(ship.x - z.x) > half || Math.abs(ship.y - z.y) > half) continue;
      ship.vx += z.dx * force * dt;
      ship.vy += z.dy * force * dt;
    }
  }
}

/**
 * Wormholes: paired teleport points { id, x, y }. A ship entering RADIUS of
 * one end pops out at the other, with a per-ship cooldown to avoid loops.
 * Returns { events: [{ kind:'wormhole', shipId, fromX, fromY, toX, toY }] }.
 */
function updateWormholes(wormholes, ships, dt) {
  const events = [];
  const cfg = CONFIG.HAZARDS.WORMHOLE;

  // Cooldown tick (per ship)
  for (const ship of Object.values(ships)) {
    if (ship._wormCd > 0) ship._wormCd -= dt;
  }

  // Group endpoints by id (only complete pairs are active)
  const byId = {};
  for (const w of wormholes) {
    (byId[w.id] = byId[w.id] || []).push(w);
  }

  for (const ship of Object.values(ships)) {
    if (!ship.alive || (ship._wormCd || 0) > 0) continue;
    for (const id in byId) {
      const pair = byId[id];
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      let from = null, to = null;
      if (Math.hypot(ship.x - a.x, ship.y - a.y) <= cfg.RADIUS)      { from = a; to = b; }
      else if (Math.hypot(ship.x - b.x, ship.y - b.y) <= cfg.RADIUS) { from = b; to = a; }
      if (!from) continue;

      ship.x = to.x;
      ship.y = to.y;
      ship._wormCd = cfg.COOLDOWN;
      events.push({
        kind: 'wormhole', shipId: ship.id,
        fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
      });
      break;
    }
  }

  return { events };
}

/**
 * Periodic energy wave sweeping the arena along one axis.
 * waveState: { axis, interval, timer, active: null | { pos, dir } }
 * Returns { damages: [{ ship, dmg }], events: [{ kind:'wave_spawn', ... }] }.
 */
function updateWave(waveState, ships, arena, dt) {
  const damages = [];
  const events  = [];
  const cfg   = CONFIG.HAZARDS.WAVE;
  const limit = waveState.axis === 'x' ? CONFIG.ARENA_WIDTH : CONFIG.ARENA_HEIGHT;

  if (!waveState.active) {
    waveState.timer -= dt;
    if (waveState.timer <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const pos = dir === 1 ? CONFIG.TILE_SIZE : limit - CONFIG.TILE_SIZE;
      waveState.active = { pos, dir };
      waveState.timer  = waveState.interval;
      events.push({ kind: 'wave_spawn', axis: waveState.axis, pos, dir });
    }
    return { damages, events };
  }

  // Advance the front
  const front = waveState.active;
  front.pos += front.dir * cfg.SPEED * dt;

  // Damage and push ships caught by the front
  for (const ship of Object.values(ships)) {
    if (!ship.alive) continue;
    const coord = waveState.axis === 'x' ? ship.x : ship.y;
    if (Math.abs(coord - front.pos) > cfg.WIDTH / 2) continue;
    damages.push({ ship, dmg: cfg.DAMAGE * dt });
    if (waveState.axis === 'x') ship.vx += front.dir * cfg.PUSH * dt;
    else                        ship.vy += front.dir * cfg.PUSH * dt;
  }

  // Deactivate when the front exits the arena
  if (front.pos < 0 || front.pos > limit) {
    waveState.active = null;
  }

  return { damages, events };
}

module.exports = { createTurret, updateTurrets, applyBlackholes, applyGravity, updateWave, updateWormholes };
