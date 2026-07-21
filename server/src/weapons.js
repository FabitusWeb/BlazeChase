// server/src/weapons.js — Weapons, bullets, beams, mines, hit detection

'use strict';

const CONFIG = require('./config');
const { isSolidAt, getTileAt } = require('./physics');

let bulletIdCounter = 1;
let mineIdCounter   = 1;

const EMPTY_RESULT = () => ({ bullets: [], beams: [], mines: [] });

/**
 * Attempt to fire for a ship.
 * @param {object} ship  — mutable ship state (uses ship.weapons inventory)
 * @param {object} input — { fire, ... }
 * @param {object} ctx   — { ships, arena } (needed for beam hitscan)
 * @returns {{ bullets: Array, beams: Array, mines: Array }}
 */
function fireBullets(ship, input, ctx = {}) {
  if (!ship.alive || !input.fire) return EMPTY_RESULT();
  if (ship.fireTimer > 0) return EMPTY_RESULT();

  // ── Resolve weapon + ammo from the inventory ─────────────
  // Ammo -1 = infinite. Fall back to blaster (0) when the selected
  // weapon is not owned or lacks ammo for a shot.
  let wDef = CONFIG.WEAPONS[ship.weapon];
  let ammo = ship.weapons ? ship.weapons[ship.weapon] : undefined;
  if (!wDef || ammo === undefined || (ammo !== -1 && ammo < wDef.ammoCost)) {
    ship.weapon = 0;
    wDef = CONFIG.WEAPONS[0];
    ammo = ship.weapons[0];
  }

  // Deduct ammo (never for infinite weapons)
  if (ammo !== -1) {
    ship.weapons[ship.weapon] = Math.max(0, ammo - wDef.ammoCost);
  }

  // Fire rate (rapidfire modifier halves it)
  const mods = ship.modifiers || {};
  ship.fireTimer = wDef.fireRate * (mods.rapidfire > 0 ? 0.5 : 1);

  // ── Beam weapon (LASER CANNON) — hitscan, no projectile ──
  if (wDef.beam) {
    return { bullets: [], beams: [fireBeam(ship, wDef, ctx)], mines: [] };
  }

  // ── Mine layer (MINES) — no projectile ───────────────────
  if (wDef.lay === 'mine') {
    const mine = {
      id:       mineIdCounter++,
      x:        ship.x,
      y:        ship.y,
      ownerId:  ship.id,
      armTimer: CONFIG.MINE.ARM_TIME,
    };
    return { bullets: [], beams: [], mines: [mine] };
  }

  // ── Projectile weapons ───────────────────────────────────
  let count = wDef.count;
  if (mods.tripleshot > 0)      count *= 3;
  else if (mods.doubleshot > 0) count *= 2;

  const homing = wDef.homing || mods.seeking > 0;
  const angles = getBulletAngles(wDef, ship.angle, count);

  const bullets = [];
  for (let i = 0; i < angles.length; i++) {
    const angle  = angles[i];
    const offset = getParallelOffset(wDef.id, i, angles.length);
    const offsetX = Math.cos(angle + Math.PI / 2) * offset;
    const offsetY = Math.sin(angle + Math.PI / 2) * offset;

    bullets.push({
      id:       bulletIdCounter++,
      ownerId:  ship.id,
      weapon:   ship.weapon,
      x:        ship.x + Math.cos(angle) * 20 + offsetX,
      y:        ship.y + Math.sin(angle) * 20 + offsetY,
      vx:       Math.cos(angle) * wDef.speed,
      vy:       Math.sin(angle) * wDef.speed,
      damage:   wDef.damage,
      size:     wDef.size,
      homing,
      erratic:  !!wDef.erratic,
      aoe:      wDef.aoe ? { radius: wDef.aoe.radius, damage: wDef.aoe.damage } : null,
      lifetime: CONFIG.BULLET_LIFETIME,
    });
  }

  return { bullets, beams: [], mines: [] };
}

/**
 * Bullet angles for a shot: single-bullet weapons get random jitter
 * within ±spread, multi-bullet shots fan symmetrically by spread steps.
 */
function getBulletAngles(wDef, baseAngle, count) {
  if (count <= 1) {
    return [baseAngle + (Math.random() - 0.5) * wDef.spread * 2];
  }
  const angles = [];
  for (let i = 0; i < count; i++) {
    angles.push(baseAngle + (i - (count - 1) / 2) * wDef.spread);
  }
  return angles;
}

/**
 * Lateral offset for DOUBLE-style parallel barrels.
 */
function getParallelOffset(weaponId, bulletIndex, count) {
  if (weaponId === 1) { // DOUBLE: offset left/right
    return (bulletIndex - (count - 1) / 2) * 16;
  }
  return 0;
}

/**
 * Hitscan beam: march from the ship nose along ship.angle (4px steps),
 * stop at the first solid tile or first hittable enemy ship.
 */
function fireBeam(ship, wDef, ctx) {
  const ships = ctx.ships || {};
  const arena = ctx.arena;
  const dx = Math.cos(ship.angle);
  const dy = Math.sin(ship.angle);

  const x1 = ship.x + dx * 20;
  const y1 = ship.y + dy * 20;
  let x2 = x1 + dx * wDef.beam.length;
  let y2 = y1 + dy * wDef.beam.length;
  let hitShipId = null;

  const step = 4;
  let stop = false;
  for (let d = 0; d <= wDef.beam.length && !stop; d += step) {
    const px = x1 + dx * d;
    const py = y1 + dy * d;
    if (arena && isSolidAt(arena.tiles, px, py)) {
      x2 = px; y2 = py;
      break;
    }
    for (const s of Object.values(ships)) {
      if (s.id === ship.id || !s.alive || s.invulnerable) continue;
      if (Math.hypot(s.x - px, s.y - py) <= CONFIG.SHIP_RADIUS + 4) {
        x2 = px; y2 = py;
        hitShipId = s.id;
        stop = true;
        break;
      }
    }
  }

  return { x1, y1, x2, y2, hitShipId, weapon: wDef.id, ownerId: ship.id };
}

/**
 * Update all mines for one tick.
 * Returns { survived, events } — events: { kind:'mine_explode', mine, x, y }
 * Once armed, a mine explodes when ANY alive ship (owner included,
 * Chase Ace 2 style) comes within CONFIG.MINE.TRIGGER_RADIUS.
 */
function updateMines(mines, ships, dt) {
  const survived = [];
  const events   = [];

  for (const m of mines) {
    if (m.armTimer > 0) {
      m.armTimer -= dt;
      survived.push(m);
      continue;
    }
    let triggered = false;
    for (const ship of Object.values(ships)) {
      if (!ship.alive) continue;
      if (Math.hypot(ship.x - m.x, ship.y - m.y) <= CONFIG.MINE.TRIGGER_RADIUS) {
        triggered = true;
        break;
      }
    }
    if (triggered) {
      events.push({ kind: 'mine_explode', mine: m, x: m.x, y: m.y });
    } else {
      survived.push(m);
    }
  }

  return { survived, events };
}

/**
 * Pure AoE damage computation (Chase Ace 2 style: owner included).
 * Returns [{ ship, dmg }] for every alive, non-invulnerable ship in
 * radius; damage falls off linearly to 50% at the edge.
 * Does NOT apply damage — the caller applies it and handles kills.
 */
function explode(x, y, radius, damage, ownerId, ships) {
  const hits = [];
  for (const ship of Object.values(ships)) {
    if (!ship.alive || ship.invulnerable) continue;
    const dist = Math.hypot(ship.x - x, ship.y - y);
    if (dist > radius) continue;
    hits.push({ ship, dmg: Math.round(damage * (1 - 0.5 * dist / radius)) });
  }
  return hits;
}

/**
 * Update all bullets for one tick.
 * Returns { survived, events }
 * events: array of { kind:'bullet_hit'|'wall_hit'|'turret_hit'|'button_hit'|'piston_hit', bullet, ship?, turret?, tx?, ty? }
 * Turrets (optional) are destructible targets; a turret's own bullets pass through it.
 * Pistons (optional) are moving solid blocks — bullets die on them like on walls.
 * Trigger buttons (arena.hazards.buttons, F7b): ANY bullet (ships', AI's,
 * turrets') entering a button tile triggers it and is destroyed.
 */
function updateBullets(bullets, ships, arena, dt, turrets = [], pistons = []) {
  const survived = [];
  const events   = [];

  for (const b of bullets) {
    b.lifetime -= dt;
    if (b.lifetime <= 0) continue;

    // Erratic sputter (charge rockets): random heading jitter ±0.3 rad
    if (b.erratic) {
      const spd = Math.hypot(b.vx, b.vy);
      const cur = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 0.6;
      b.vx = Math.cos(cur) * spd;
      b.vy = Math.sin(cur) * spd;
    }

    // Homing logic (missiles / seeking modifier)
    if (b.homing) {
      const target = findNearestEnemy(b, ships);
      if (target) {
        const dx = target.x - b.x;
        const dy = target.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          const desired = Math.atan2(dy, dx);
          let current   = Math.atan2(b.vy, b.vx);
          let diff = desired - current;
          // Normalize to -PI..PI
          while (diff >  Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turnRate = 3.0 * dt;
          current += Math.max(-turnRate, Math.min(turnRate, diff));
          const spd = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(current) * spd;
          b.vy = Math.sin(current) * spd;
        }
      }
    }

    // Move bullet
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Wall collision
    if (isSolidAt(arena.tiles, b.x, b.y)) {
      const col = Math.floor(b.x / CONFIG.TILE_SIZE);
      const row = Math.floor(b.y / CONFIG.TILE_SIZE);
      const tileType = getTileAt(arena.tiles, b.x, b.y);
      events.push({ kind: 'wall_hit', bullet: b, tx: col, ty: row, tileType });
      continue; // bullet destroyed
    }

    // Piston blocks (moving solids): bullet dies like on a wall
    let pistonHit = false;
    for (const p of pistons) {
      const half = CONFIG.TILE_SIZE / 2;
      if (Math.abs(b.x - p.x) <= half && Math.abs(b.y - p.y) <= half) {
        events.push({ kind: 'piston_hit', bullet: b });
        pistonHit = true;
        break;
      }
    }
    if (pistonHit) continue;

    // Trigger buttons: any bullet entering the tile fires the trigger
    const buttons = arena.hazards && arena.hazards.buttons;
    if (buttons && buttons.length > 0) {
      const col = Math.floor(b.x / CONFIG.TILE_SIZE);
      const row = Math.floor(b.y / CONFIG.TILE_SIZE);
      let buttonHit = false;
      for (const btn of buttons) {
        if (btn.c === col && btn.r === row) {
          events.push({ kind: 'button_hit', bullet: b, tx: col, ty: row });
          buttonHit = true;
          break;
        }
      }
      if (buttonHit) continue; // bullet destroyed
    }

    // Turret collision (a turret never hits itself)
    let turretHit = false;
    for (const t of turrets) {
      if (!t.alive) continue;
      if (t.id === b.ownerId) continue;
      if (Math.hypot(t.x - b.x, t.y - b.y) < 16 + b.size) {
        events.push({ kind: 'turret_hit', bullet: b, turret: t });
        turretHit = true;
        break;
      }
    }
    if (turretHit) continue;

    // Ship collision
    let hit = false;
    for (const ship of Object.values(ships)) {
      if (ship.id === b.ownerId) continue;
      if (!ship.alive) continue;
      if (ship.invulnerable) continue;

      const dx   = ship.x - b.x;
      const dy   = ship.y - b.y;
      const dist = Math.hypot(dx, dy);
      const hitRadius = CONFIG.SHIP_RADIUS + b.size;

      if (dist < hitRadius) {
        events.push({ kind: 'bullet_hit', bullet: b, ship });
        hit = true;
        break;
      }
    }
    if (hit) continue;

    survived.push(b);
  }

  return { survived, events };
}

function findNearestEnemy(bullet, ships) {
  let nearest = null;
  let minDist = Infinity;
  for (const ship of Object.values(ships)) {
    if (ship.id === bullet.ownerId) continue;
    if (!ship.alive) continue;
    const d = Math.hypot(ship.x - bullet.x, ship.y - bullet.y);
    if (d < minDist) { minDist = d; nearest = ship; }
  }
  return nearest;
}

module.exports = { fireBullets, updateBullets, updateMines, explode };
