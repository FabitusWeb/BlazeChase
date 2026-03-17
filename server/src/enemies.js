// server/src/enemies.js — AI-controlled ships for solo mode

'use strict';

const CONFIG = require('./config');
const { isSolidAt } = require('./physics');

const TAU = Math.PI * 2;

// Difficulty profiles
const DIFF = {
  easy:   { speedMult: 0.55, aimSpread: 0.6,  reactionTime: 0.9,  dodgeChance: 0.0, shootInterval: 0.9,  turnMult: 0.7 },
  medium: { speedMult: 0.78, aimSpread: 0.28, reactionTime: 0.45, dodgeChance: 0.2, shootInterval: 0.5,  turnMult: 0.9 },
  hard:   { speedMult: 1.0,  aimSpread: 0.08, reactionTime: 0.18, dodgeChance: 0.5, shootInterval: 0.25, turnMult: 1.1 },
};

/**
 * Create an AI ship state.
 * @param {string} id
 * @param {object} spawnPoint
 * @param {number} shipId
 * @param {string} difficulty
 */
function createAIShip(id, spawnPoint, shipId, difficulty) {
  const def    = CONFIG.SHIPS[shipId];
  const diff   = DIFF[difficulty] || DIFF.easy;
  return {
    id,
    name:            ['ALPHA', 'BETA', 'GAMMA', 'DELTA'][Math.floor(Math.random() * 4)] + '-' + difficulty.toUpperCase().slice(0,1),
    shipId,
    isAI:            true,
    difficulty,
    diff,

    x:               spawnPoint.x,
    y:               spawnPoint.y,
    vx:              0,
    vy:              0,
    angle:           Math.random() * TAU,
    angularVel:      0,
    shield:          def.shield,
    ammo:            def.ammo,
    weapon:          0,
    fireTimer:       0,
    dashTimer:       0,
    dashCooldown:    0,
    dodgeTimer:      0,
    dodgeCooldown:   0,
    invulnTimer:     CONFIG.RESPAWN_INVULN,
    invulnerable:    true,
    hitFlashTimer:   0,
    pshieldTimer:    0,
    speedBoostTimer: 0,
    dashing:         false,
    dodging:         false,
    thrusting:       false,
    onAcid:          false,
    onRefuel:        false,
    alive:           true,
    respawnTimer:    0,
    kills:           0,
    deaths:          0,

    // AI state
    _state:          'hunt',    // hunt | strafe | retreat | reposition
    _stateTimer:     0,
    _shootTimer:     Math.random() * diff.shootInterval,
    _dodgeTimer:     0,
    _targetId:       null,
    _strafeDir:      1,
    _reactionDelay:  0,
  };
}

/**
 * Update all AI ships for one tick.
 * @param {object[]} aiShips  — array of AI ship state objects
 * @param {object}   ships    — all ships (AI + player) by id
 * @param {object}   arena
 * @param {number}   dt
 * @returns {Array} newBullets
 */
function updateAI(aiShips, ships, arena, dt) {
  const newBullets = [];

  for (const ai of aiShips) {
    if (!ai.alive) continue;

    const diff = DIFF[ai.difficulty] || DIFF.easy;
    const def  = CONFIG.SHIPS[ai.shipId];

    // Timers
    if (ai.fireTimer    > 0) ai.fireTimer    -= dt;
    if (ai.dashTimer    > 0) ai.dashTimer    -= dt;
    if (ai.dashCooldown > 0) ai.dashCooldown -= dt;
    if (ai.dodgeTimer   > 0) ai.dodgeTimer   -= dt;
    if (ai.dodgeCooldown> 0) ai.dodgeCooldown-= dt;
    if (ai.invulnTimer  > 0) ai.invulnTimer  -= dt;
    if (ai.hitFlashTimer> 0) ai.hitFlashTimer -= dt;
    if (ai._shootTimer  > 0) ai._shootTimer  -= dt;
    if (ai._reactionDelay > 0) ai._reactionDelay -= dt;

    ai.dashing      = ai.dashTimer    > 0;
    ai.dodging      = ai.dodgeTimer   > 0;
    ai.invulnerable = ai.invulnTimer  > 0;

    // State timer
    ai._stateTimer -= dt;
    if (ai._stateTimer <= 0) {
      _chooseState(ai);
    }

    // Find nearest human target
    let target = null;
    let minDist = Infinity;
    for (const [sid, ship] of Object.entries(ships)) {
      if (ship.isAI || !ship.alive) continue;
      const d = Math.hypot(ship.x - ai.x, ship.y - ai.y);
      if (d < minDist) { minDist = d; target = ship; }
    }

    if (!target || ai._reactionDelay > 0) {
      // Idle wander
      _wander(ai, arena, dt, def, diff);
      continue;
    }

    const dx    = target.x - ai.x;
    const dy    = target.y - ai.y;
    const dist  = Math.hypot(dx, dy);
    const angleToTarget = Math.atan2(dy, dx);

    // Input to simulate for physics
    const input = { up: false, down: false, left: false, right: false, fire: false, dash: false, dodge: false };

    switch (ai._state) {
      case 'hunt':
        _steerToward(ai, angleToTarget, input, dt, diff);
        if (dist > 160) input.up = true;
        if (dist < 80) { ai._state = 'strafe'; ai._stateTimer = 1.0 + Math.random(); }
        _tryShoot(ai, target, input, diff, dt, newBullets);
        break;

      case 'strafe':
        // Circle around target
        const strafeAngle = angleToTarget + Math.PI / 2 * ai._strafeDir;
        _steerToward(ai, strafeAngle, input, dt, diff);
        input.up = true;
        if (dist > 220) { ai._state = 'hunt'; ai._stateTimer = 1.0; }
        if (dist < 50)  { ai._state = 'retreat'; ai._stateTimer = 0.8; }
        _tryShoot(ai, target, input, diff, dt, newBullets);
        break;

      case 'retreat':
        // Move away from target
        _steerToward(ai, angleToTarget + Math.PI, input, dt, diff);
        input.up = true;
        if (dist > 180) { ai._state = 'hunt'; ai._stateTimer = 1.5; }
        _tryShoot(ai, target, input, diff, dt, newBullets);
        break;

      case 'reposition':
        _wander(ai, arena, dt, def, diff);
        break;
    }

    // Dodge incoming bullets — hard AI only
    if (ai.difficulty === 'hard' && ai.dodgeCooldown <= 0 && Math.random() < diff.dodgeChance * dt * 3) {
      const perpAngle = ai.angle + Math.PI / 2;
      const dir = Math.random() > 0.5 ? 1 : -1;
      ai.vx += Math.cos(perpAngle) * dir * CONFIG.DODGE_SPEED;
      ai.vy += Math.sin(perpAngle) * dir * CONFIG.DODGE_SPEED;
      ai.dodgeTimer    = CONFIG.DODGE_DURATION;
      ai.dodgeCooldown = CONFIG.DODGE_COOLDOWN;
      ai.invulnTimer   = Math.max(ai.invulnTimer, CONFIG.DODGE_INVULN);
    }

    // Apply physics manually (simpler version for AI)
    _applyAIPhysics(ai, input, arena, dt, def, diff);
  }

  return newBullets;
}

function _chooseState(ai) {
  const r = Math.random();
  if (r < 0.5)      { ai._state = 'hunt';        ai._stateTimer = 1.5 + Math.random() * 1.5; }
  else if (r < 0.75){ ai._state = 'strafe';      ai._stateTimer = 1.0 + Math.random(); ai._strafeDir = Math.random() > 0.5 ? 1 : -1; }
  else if (r < 0.9) { ai._state = 'retreat';     ai._stateTimer = 0.8 + Math.random() * 0.5; }
  else              { ai._state = 'reposition';  ai._stateTimer = 1.2 + Math.random(); }
}

function _steerToward(ai, targetAngle, input, dt, diff) {
  let diff2 = targetAngle - ai.angle;
  while (diff2 >  Math.PI) diff2 -= TAU;
  while (diff2 < -Math.PI) diff2 += TAU;

  const turnRate = CONFIG.SHIPS[ai.shipId].turn * diff.turnMult;
  if (diff2 > 0.08)       { input.right = true; ai.angle += Math.min(diff2, turnRate * dt); }
  else if (diff2 < -0.08) { input.left  = true; ai.angle -= Math.min(-diff2, turnRate * dt); }
  ai.angle = ((ai.angle % TAU) + TAU) % TAU;
}

function _tryShoot(ai, target, input, diff, dt, newBullets) {
  if (ai._shootTimer > 0) return;

  // Check roughly facing target
  const dx = target.x - ai.x;
  const dy = target.y - ai.y;
  const angleToTarget = Math.atan2(dy, dx);
  let angleDiff = angleToTarget - ai.angle;
  while (angleDiff >  Math.PI) angleDiff -= TAU;
  while (angleDiff < -Math.PI) angleDiff += TAU;

  if (Math.abs(angleDiff) > 0.5) return;  // not facing target

  const wDef = CONFIG.WEAPONS[ai.weapon];
  ai._shootTimer = diff.shootInterval;
  if (ai.ammo >= wDef.ammoCost) ai.ammo -= wDef.ammoCost;

  // Aim with spread based on difficulty
  const aimAngle = ai.angle + (Math.random() - 0.5) * diff.aimSpread * 2;

  const { v4: uuidv4 } = require('uuid');
  newBullets.push({
    id:       Math.floor(Math.random() * 1e9),
    ownerId:  ai.id,
    weapon:   ai.weapon,
    x:        ai.x + Math.cos(aimAngle) * 20,
    y:        ai.y + Math.sin(aimAngle) * 20,
    vx:       Math.cos(aimAngle) * wDef.speed,
    vy:       Math.sin(aimAngle) * wDef.speed,
    damage:   wDef.damage,
    size:     wDef.size,
    homing:   false,
    lifetime: CONFIG.BULLET_LIFETIME,
  });
}

function _applyAIPhysics(ai, input, arena, dt, def, diff) {
  const maxSpeed = def.speed * diff.speedMult;

  if (input.up) {
    ai.vx += Math.cos(ai.angle) * CONFIG.SHIP_ACCEL * dt;
    ai.vy += Math.sin(ai.angle) * CONFIG.SHIP_ACCEL * dt;
  }

  // Friction
  const frict = Math.pow(CONFIG.SHIP_FRICTION, dt * 60);
  ai.vx *= frict;
  ai.vy *= frict;

  // Speed cap
  const speed = Math.hypot(ai.vx, ai.vy);
  if (speed > maxSpeed) {
    ai.vx = (ai.vx / speed) * maxSpeed;
    ai.vy = (ai.vy / speed) * maxSpeed;
  }

  ai.thrusting = input.up;
  ai.angularVel = input.left ? -1 : input.right ? 1 : 0;

  // Move + wall avoidance
  const newX = ai.x + ai.vx * dt;
  const newY = ai.y + ai.vy * dt;
  const r = CONFIG.SHIP_RADIUS;

  // X axis
  if (isSolidAt(arena.tiles, newX + (ai.vx > 0 ? r : -r), ai.y)) {
    ai.vx = 0;
    // Steer away from wall — add reaction
    ai._reactionDelay = 0.15;
    ai.angle += (Math.random() > 0.5 ? 1 : -1) * Math.PI * 0.5;
  } else {
    ai.x = newX;
  }

  if (isSolidAt(arena.tiles, ai.x, newY + (ai.vy > 0 ? r : -r))) {
    ai.vy = 0;
    ai._reactionDelay = 0.15;
    ai.angle += (Math.random() > 0.5 ? 1 : -1) * Math.PI * 0.5;
  } else {
    ai.y = newY;
  }

  // Bounds clamp
  ai.x = Math.max(CONFIG.SHIP_RADIUS, Math.min(CONFIG.ARENA_WIDTH  - CONFIG.SHIP_RADIUS, ai.x));
  ai.y = Math.max(CONFIG.SHIP_RADIUS, Math.min(CONFIG.ARENA_HEIGHT - CONFIG.SHIP_RADIUS, ai.y));
}

function _wander(ai, arena, dt, def, diff) {
  ai.angle += 0.8 * dt;
  ai.vx += Math.cos(ai.angle) * CONFIG.SHIP_ACCEL * 0.3 * dt;
  ai.vy += Math.sin(ai.angle) * CONFIG.SHIP_ACCEL * 0.3 * dt;
  const frict = Math.pow(CONFIG.SHIP_FRICTION, dt * 60);
  ai.vx *= frict; ai.vy *= frict;
  ai.x += ai.vx * dt; ai.y += ai.vy * dt;
  ai.x = Math.max(CONFIG.SHIP_RADIUS, Math.min(CONFIG.ARENA_WIDTH  - CONFIG.SHIP_RADIUS, ai.x));
  ai.y = Math.max(CONFIG.SHIP_RADIUS, Math.min(CONFIG.ARENA_HEIGHT - CONFIG.SHIP_RADIUS, ai.y));
}

module.exports = { createAIShip, updateAI };
