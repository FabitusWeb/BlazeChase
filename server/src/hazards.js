// server/src/hazards.js — Environmental hazards (stub, expandable)

'use strict';

// Hazards are defined at arena generation time.
// Currently implemented: acid pools (handled in physics.js via tile type).
// This module is a placeholder for future hazards: turrets, black holes, etc.

function updateHazards(hazards, ships, dt) {
  // Future: turret AI, black hole gravity, energy waves
  return [];
}

module.exports = { updateHazards };
