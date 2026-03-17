// server/src/weapons.js — Weapons, bullets, hit detection

'use strict';

const CONFIG = require('./config');
const { isSolidAt, getTileAt } = require('./physics');

let bulletIdCounter = 1;

/**
 * Attempt to fire bullets for a ship.
 * Returns array of new bullet objects (may be empty).
 */
function fireBullets(ship, input) {
  if (!ship.alive || !input.fire) return [];
  if (ship.fireTimer > 0) return [];

  const wDef = CONFIG.WEAPONS[ship.weapon];
  const isBlaster = ship.weapon === 0;

  // Ammo check: blaster can always fire (slower when dry)
  if (!isBlaster && ship.ammo < wDef.ammoCost) {
    // Try to fire blaster as fallback
    ship.weapon = 0;
    return fireBullets(ship, input);
  }

  const baseFireRate = (isBlaster && ship.ammo < wDef.ammoCost) ? wDef.fireRate * 2 : wDef.fireRate;
  ship.fireTimer = baseFireRate;

  // Deduct ammo
  if (ship.ammo >= wDef.ammoCost) {
    ship.ammo -= wDef.ammoCost;
    ship.ammo  = Math.max(0, ship.ammo);
  }

  const bullets = [];
  const angles  = getBulletAngles(ship.weapon, ship.angle);

  for (const angle of angles) {
    const offsetX = Math.cos(angle + Math.PI/2) * getParallelOffset(ship.weapon, angles.indexOf(angle));
    const offsetY = Math.sin(angle + Math.PI/2) * getParallelOffset(ship.weapon, angles.indexOf(angle));

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
      homing:   wDef.homing,
      lifetime: CONFIG.BULLET_LIFETIME,
    });
  }

  return bullets;
}

function getBulletAngles(weaponId, baseAngle) {
  const wDef = CONFIG.WEAPONS[weaponId];
  switch (weaponId) {
    case 0: // BLASTER
    case 3: // MISSILE
    case 4: // RAPID
    case 5: // PLASMA
      return [baseAngle + (Math.random() - 0.5) * wDef.spread * 2];
    case 1: // DOUBLE — 2 parallel bullets
      return [baseAngle, baseAngle];
    case 2: // SPREAD — 3 bullets in fan
      return [baseAngle - wDef.spread, baseAngle, baseAngle + wDef.spread];
    default:
      return [baseAngle];
  }
}

function getParallelOffset(weaponId, bulletIndex) {
  if (weaponId === 1) { // DOUBLE: offset left/right
    return (bulletIndex === 0 ? -8 : 8);
  }
  return 0;
}

/**
 * Update all bullets for one tick.
 * Returns { survived, events }
 * events: array of { kind:'bullet_hit'|'wall_hit', bullet, ship?, tx?, ty? }
 */
function updateBullets(bullets, ships, arena, dt) {
  const survived = [];
  const events   = [];

  for (const b of bullets) {
    b.lifetime -= dt;
    if (b.lifetime <= 0) continue;

    // Homing logic (missiles)
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

module.exports = { fireBullets, updateBullets };
