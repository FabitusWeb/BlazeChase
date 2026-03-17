// server/src/powerups.js — Power-up spawn, update, pickup

'use strict';

const CONFIG = require('./config');

let powerupIdCounter = 1;

/**
 * Create a powerup at world position.
 */
function createPowerup(x, y, typeId) {
  const def = CONFIG.POWERUPS[typeId];
  return {
    id:       powerupIdCounter++,
    x, y,
    typeId,
    name:     def.name,
    color:    def.color,
    icon:     def.icon,
    effect:   def.effect,
    value:    def.value,
    lifetime: CONFIG.POWERUP_LIFETIME,
    bobPhase: Math.random() * Math.PI * 2,
  };
}

/**
 * Update powerup spawn timers and existing powerups.
 * Returns { powerups, spawned, events }
 */
function updatePowerups(powerups, spawnTimers, powerupSpots, dt) {
  const survived = [];
  const events   = [];

  // Age existing powerups
  for (const p of powerups) {
    p.lifetime -= dt;
    p.bobPhase += dt * 2;
    if (p.lifetime > 0) survived.push(p);
  }

  // Advance spawn timers and create new powerups at fixed spots
  for (let i = 0; i < spawnTimers.length; i++) {
    spawnTimers[i] -= dt;
    if (spawnTimers[i] <= 0) {
      spawnTimers[i] = CONFIG.POWERUP_RESPAWN + Math.random() * 5;
      const spot = powerupSpots[i % powerupSpots.length];
      // Don't spawn if one already exists near this spot
      const nearby = survived.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < 60);
      if (!nearby) {
        const typeId = Math.floor(Math.random() * CONFIG.POWERUPS.length);
        const pu = createPowerup(spot.x, spot.y, typeId);
        survived.push(pu);
        events.push({ kind: 'powerup_spawned', powerup: pu });
      }
    }
  }

  return { powerups: survived, events };
}

/**
 * Check if any ship picks up any powerup.
 * Mutates ship state and removes picked-up powerups.
 * Returns { powerups, events }
 */
function checkPickups(powerups, ships) {
  const remaining = [];
  const events    = [];

  for (const p of powerups) {
    let picked = false;
    for (const ship of Object.values(ships)) {
      if (!ship.alive) continue;
      const dist = Math.hypot(ship.x - p.x, ship.y - p.y);
      if (dist < CONFIG.SHIP_RADIUS + 18) {
        applyPowerup(ship, p);
        events.push({ kind: 'powerup_pickup', powerupId: p.id, playerId: ship.id, ptype: p.name });
        picked = true;
        break;
      }
    }
    if (!picked) remaining.push(p);
  }

  return { powerups: remaining, events };
}

function applyPowerup(ship, p) {
  const def = CONFIG.SHIPS[ship.shipId];
  switch (p.effect) {
    case 'shield':
      ship.shield = Math.min(def.shield, ship.shield + p.value);
      break;
    case 'ammo':
      ship.ammo = Math.min(def.ammo, ship.ammo + p.value);
      break;
    case 'weapon':
      // Give a random non-blaster weapon
      ship.weapon = 1 + Math.floor(Math.random() * (CONFIG.WEAPONS.length - 1));
      break;
    case 'pshield':
      ship.pshieldTimer = Math.max(ship.pshieldTimer, p.value);
      break;
    case 'speed':
      ship.speedBoostTimer = Math.max(ship.speedBoostTimer, p.value);
      break;
  }
}

module.exports = { createPowerup, updatePowerups, checkPickups };
