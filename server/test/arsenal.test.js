// server/test/arsenal.test.js — armi CA (F11a): sneaky missile, centerblast,
// sticky bomb, lazer trap

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const { fireBullets } = require('../src/weapons');
const { createShip } = require('../src/physics');
const Game = require('../src/game');

function gameWithPlayer(shipMods = {}) {
  const msgs = [];
  const g = new Game({ code: 'T', state: 'playing' }, [{ id: 'p1', name: 'T', ship: 0 }],
    m => msgs.push(m), { arenaId: 'open-field' });
  const ship = g.ships['p1'];
  Object.assign(ship, shipMods);
  return { g, msgs, ship };
}

function giveWeapon(ship, wid, ammo = 50) {
  ship.weapons[wid] = ammo;
  ship.weapon = wid;
}

// ── Config ────────────────────────────────────────────────

test('new CA weapons have valid config', () => {
  const ids = CONFIG.WEAPONS.map(w => w.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id duplicati');
  for (const wid of [11, 12, 13, 14]) {
    const w = CONFIG.WEAPONS[wid];
    assert.ok(w && w.name && w.pickupAmmo > 0, `arma ${wid} mal configurata`);
  }
  assert.ok(CONFIG.WEAPONS[11].homing && CONFIG.WEAPONS[11].erratic, 'sneaky deve essere homing+erratic');
  assert.ok(CONFIG.WEAPONS[12].selfBlast.radius > 0);
  assert.ok(CONFIG.WEAPONS[13].sticky.fuse > 0 && CONFIG.WEAPONS[13].sticky.aoe);
  assert.strictEqual(CONFIG.WEAPONS[14].lay, 'lazertrap');
});

// ── Sneaky missile ────────────────────────────────────────

test('sneaky missile fires a homing+erratic bullet', () => {
  const ship = createShip({ id: 'p1', name: 'T', ship: 0 }, { x: 400, y: 400 }, 0);
  giveWeapon(ship, 11);
  const { bullets } = fireBullets(ship, { fire: true }, {});
  assert.strictEqual(bullets.length, 1);
  assert.ok(bullets[0].homing);
  assert.ok(bullets[0].erratic);
  assert.strictEqual(ship.weapons[11], 50 - CONFIG.WEAPONS[11].ammoCost);
});

// ── Centerblast ───────────────────────────────────────────

test('centerblast damages ships around the shooter (self included)', (t) => {
  const { g, ship } = gameWithPlayer({ weapons: { 0: -1, 12: 5 }, weapon: 12 });
  t.after(() => g.stop());
  ship.invulnTimer = 0; ship.invulnerable = false;
  const before = ship.shield;

  g.inputBuffer['p1'].fire = true;
  g._update(0.016);

  assert.ok(ship.shield < before, 'centerblast non ha danneggiato nessuno intorno (self incluso)');
  assert.strictEqual(ship.weapons[12], 4);
});

// ── Sticky bomb ───────────────────────────────────────────

test('sticky bomb attaches to the ship hit and explodes after the fuse', (t) => {
  const { g, ship } = gameWithPlayer();
  t.after(() => g.stop());

  // Simulo un colpo sticky che colpisce il giocatore
  const stickyBullet = {
    ownerId: 'ai-0', weapon: 13, x: ship.x, y: ship.y,
    sticky: CONFIG.WEAPONS[13].sticky, damage: 5,
  };
  g._processBulletEvent({ kind: 'bullet_hit', ship, bullet: stickyBullet });
  assert.strictEqual(g.stickies.length, 1, 'sticky non attaccata');
  assert.strictEqual(g.stickies[0].targetId, 'p1');

  const before = ship.shield;
  ship.invulnTimer = 0; ship.invulnerable = false;
  // Avanzo oltre la fuse (1.5s)
  for (let i = 0; i < 120; i++) g._update(1 / 60);
  assert.strictEqual(g.stickies.length, 0, 'sticky non detonata');
  assert.ok(ship.shield < before, 'la detonazione non ha danneggiato il bersaglio');
});

test('sticky bomb sticks to walls at the hit point', (t) => {
  const { g } = gameWithPlayer();
  t.after(() => g.stop());
  g._processBulletEvent({
    kind: 'wall_hit', tx: 5, ty: 5, tileType: CONFIG.TILE.WALL_SOLID,
    bullet: { ownerId: 'p1', weapon: 13, x: 220, y: 220, sticky: CONFIG.WEAPONS[13].sticky, damage: 5 },
  });
  assert.strictEqual(g.stickies.length, 1);
  assert.strictEqual(g.stickies[0].x, 220);
});

// ── Lazer trap ────────────────────────────────────────────

test('lazer trap lays a beam segment and damages non-owners crossing it', (t) => {
  const { g, ship } = gameWithPlayer({ weapons: { 0: -1, 14: 5 }, weapon: 14 });
  t.after(() => g.stop());
  ship.angle = 0;

  g.inputBuffer['p1'].fire = true;
  g._update(0.016);
  g.inputBuffer['p1'].fire = false;

  assert.strictEqual(g.lazerTraps.length, 1, 'trap non piazzata');
  const trap = g.lazerTraps[0];
  assert.ok(trap.x2 > trap.x1, 'il raggio non va in avanti');

  // Nave AI sul raggio: deve prendere danno; il proprietario no
  const victim = Object.values(g.ships).find(s => s.isAI) || null;
  if (victim) {
    victim.alive = true;
    victim.x = (trap.x1 + trap.x2) / 2;
    victim.y = (trap.y1 + trap.y2) / 2;
    victim.invulnTimer = 0; victim.invulnerable = false;
    const beforeV = victim.shield;
    const beforeP = ship.shield;
    g._update(0.1);
    assert.ok(victim.shield < beforeV, 'la vittima sul raggio non prende danno');
    assert.strictEqual(ship.shield, beforeP, 'il proprietario prende danno dalla sua trap');
  }
});

test('lazer trap expires and enforces max per ship', (t) => {
  const { g, ship } = gameWithPlayer({ weapons: { 0: -1, 14: 10 }, weapon: 14 });
  t.after(() => g.stop());

  // Piazza 5 trap: ne restano max 3
  for (let i = 0; i < 5; i++) {
    ship.fireTimer = 0;
    g._addLazerTrap({ x1: 100 + i * 10, y1: 100, x2: 200, y2: 100, ownerId: 'p1', timer: CONFIG.LAZERTRAP.LIFETIME });
  }
  assert.strictEqual(g.lazerTraps.length, CONFIG.LAZERTRAP.MAX_PER_SHIP);

  // Scade dopo LIFETIME
  for (let i = 0; i < CONFIG.LAZERTRAP.LIFETIME * 60 + 10; i++) g._update(1 / 60);
  assert.strictEqual(g.lazerTraps.length, 0, 'trap non scaduta');
});

test('state broadcast includes stickies and lazerTraps', (t) => {
  const { g, msgs } = gameWithPlayer();
  t.after(() => g.stop());
  g._addLazerTrap({ x1: 100, y1: 100, x2: 300, y2: 100, ownerId: 'p1', timer: 10 });
  g._broadcastState();
  const state = msgs.find(m => m.type === 'state');
  assert.ok(Array.isArray(state.stickies));
  assert.ok(Array.isArray(state.lazerTraps));
  assert.strictEqual(state.lazerTraps.length, 1);
});
