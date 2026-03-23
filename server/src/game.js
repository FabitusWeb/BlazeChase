// server/src/game.js — Authoritative 60Hz game loop

'use strict';

const CONFIG     = require('./config');
const { generateArena } = require('./arena');
const { updateShip, resolveShipCollisions, createShip } = require('./physics');
const { fireBullets, updateBullets } = require('./weapons');
const { updatePowerups, checkPickups } = require('./powerups');
const { updateHazards } = require('./hazards');
const { createAIShip, updateAI } = require('./enemies');
const { TILE } = CONFIG;

const SOLO_AI_COUNT = { easy: 1, medium: 2, hard: 3 };
const SOLO_SCORE_MULT = { easy: 1, medium: 2, hard: 3 };

const TICK_MS = 1000 / CONFIG.TICK_RATE;  // ~16.67ms

class Game {
  constructor(room, players, broadcast, options = {}) {
    this.room      = room;
    this.broadcast = broadcast;
    this.soloMode  = options.soloMode  || false;
    this.soloDiff  = options.difficulty || 'easy';

    // Generate arena
    this.arena = generateArena();

    // Create ships
    this.ships = {};
    players.forEach((p, idx) => {
      const sp = this.arena.spawnPoints[idx % this.arena.spawnPoints.length];
      this.ships[p.id] = createShip(p, sp, idx);
    });

    // Solo mode: spawn AI ships
    this.aiShips = [];
    if (this.soloMode) {
      this.playerLives = 3;
      const aiCount = SOLO_AI_COUNT[this.soloDiff] || 1;
      for (let i = 0; i < aiCount; i++) {
        const spIdx = (players.length + i) % this.arena.spawnPoints.length;
        const sp    = this.arena.spawnPoints[spIdx];
        const shipId = Math.floor(Math.random() * CONFIG.SHIPS.length);
        const aiId   = 'ai-' + i;
        const aiShip = createAIShip(aiId, sp, shipId, this.soloDiff);
        this.aiShips.push(aiShip);
        this.ships[aiId] = aiShip;
      }
    }

    this.bullets    = [];
    this.powerups   = [];
    this.events     = [];   // accumulated per-tick events to broadcast
    this.tickCount  = 0;
    this.running    = false;
    this.roundOver  = false;

    // Input buffer: latest input per human player
    this.inputBuffer = {};
    for (const p of players) {
      this.inputBuffer[p.id] = { up:false, down:false, left:false, right:false, fire:false, dash:false, dodge:false, switchWeapon:false };
    }

    // Power-up spawn timers (one per spot)
    this.spawnTimers = this.arena.powerupSpots.map(() => 5 + Math.random() * 10);

    this._intervalId  = null;
    this._lastTime    = null;
    this._endTimeout  = null;
  }

  start() {
    this.running  = true;
    this._lastTime = process.hrtime.bigint();

    // Send arena to all clients
    this.broadcast({
      type:         'arena',
      tiles:        this.arena.tiles,
      wallHP:       this.arena.wallHP,
      theme:        this.arena.theme,
      spawnPoints:  this.arena.spawnPoints,
      powerupSpots: this.arena.powerupSpots,
    });

    this._intervalId = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    this.running = false;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._endTimeout) {
      clearTimeout(this._endTimeout);
      this._endTimeout = null;
    }
  }

  receiveInput(playerId, msg) {
    if (!this.inputBuffer[playerId]) return;
    const keys = msg.keys || {};
    const buf  = this.inputBuffer[playerId];
    buf.up           = !!keys.up;
    buf.down         = !!keys.down;
    buf.left         = !!keys.left;
    buf.right        = !!keys.right;
    buf.fire         = !!keys.fire;
    buf.dash         = !!keys.dash;
    buf.dodge        = !!keys.dodge;
    buf.switchWeapon = !!keys.switchWeapon;
  }

  _tick() {
    if (!this.running) return;

    const now = process.hrtime.bigint();
    const dt  = Math.min(Number(now - this._lastTime) / 1e9, 0.05); // cap at 50ms
    this._lastTime = now;
    this.tickCount++;

    this.events = [];

    if (!this.roundOver) {
      this._update(dt);
    }

    // Broadcast state every STATE_INTERVAL ticks (20 Hz)
    if (this.tickCount % CONFIG.STATE_INTERVAL === 0) {
      this._broadcastState();
    }

    // Broadcast accumulated events immediately
    for (const ev of this.events) {
      this.broadcast(ev);
    }
  }

  _update(dt) {
    // ── Process weapon switching (human ships only) ────────
    for (const [id, ship] of Object.entries(this.ships)) {
      if (ship.isAI) continue;
      const input = this.inputBuffer[id];
      if (input && input.switchWeapon && !input._prevSwitchWeapon && ship.alive) {
        ship.weapon = (ship.weapon + 1) % CONFIG.WEAPONS.length;
      }
      if (input) input._prevSwitchWeapon = input.switchWeapon;
    }

    // ── Update human ships ─────────────────────────────────
    for (const [id, ship] of Object.entries(this.ships)) {
      if (ship.isAI) continue;
      const input = this.inputBuffer[id] || {};
      updateShip(ship, input, dt, this.arena);
      if (ship.acidKill) {
        this._killShip(ship, null, null);
      }
    }

    // ── Update AI ships ────────────────────────────────────
    if (this.soloMode && this.aiShips.length > 0) {
      const aiBullets = updateAI(this.aiShips, this.ships, this.arena, dt);
      this.bullets.push(...aiBullets);
      // Check acid kills on AI ships
      for (const ai of this.aiShips) {
        if (ai.alive && ai.acidKill) {
          this._killShip(ai, null, null);
        }
      }
    }

    // ── Ship-ship collision ────────────────────────────────
    resolveShipCollisions(this.ships);

    // ── Fire bullets (human ships only; AI fires via updateAI) ──
    for (const [id, ship] of Object.entries(this.ships)) {
      if (ship.isAI) continue;
      const input = this.inputBuffer[id] || {};
      const newBullets = fireBullets(ship, input);
      this.bullets.push(...newBullets);
    }

    // ── Update bullets ────────────────────────────────────
    const { survived, events: bulletEvents } = updateBullets(
      this.bullets, this.ships, this.arena, dt
    );
    this.bullets = survived;

    for (const ev of bulletEvents) {
      this._processBulletEvent(ev);
    }

    // ── Update power-ups ──────────────────────────────────
    const { powerups: updatedPu, events: puEvents } = updatePowerups(
      this.powerups, this.spawnTimers, this.arena.powerupSpots, dt
    );
    this.powerups = updatedPu;

    const { powerups: afterPickup, events: pickupEvents } = checkPickups(
      this.powerups, this.ships
    );
    this.powerups = afterPickup;

    for (const ev of pickupEvents) {
      this.events.push({ type: 'event', ...ev });
    }

    // ── Update hazards ────────────────────────────────────
    updateHazards([], this.ships, dt);

    // ── Check round end ───────────────────────────────────
    this._checkRoundEnd();
  }

  _processBulletEvent(ev) {
    if (ev.kind === 'wall_hit') {
      // Damage destructible walls
      if (ev.tileType === TILE.WALL_DEST) {
        const hp = this.arena.wallHP[ev.ty][ev.tx];
        if (hp > 0) {
          const w    = CONFIG.WEAPONS[ev.bullet.weapon];
          const newHp = Math.max(0, hp - w.damage);
          this.arena.wallHP[ev.ty][ev.tx] = newHp;
          const state = newHp > 20 ? 'intact' : newHp > 0 ? 'damaged' : 'destroyed';
          if (newHp <= 0) {
            this.arena.tiles[ev.ty][ev.tx] = TILE.DEBRIS;
          }
          this.events.push({
            type: 'event',
            kind: 'wall_damage',
            tx: ev.tx, ty: ev.ty,
            hp: newHp,
            state,
          });
          if (newHp <= 0) {
            this.events.push({
              type: 'event',
              kind: 'explosion',
              x: ev.tx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
              y: ev.ty * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
              size: 'medium',
            });
          }
        }
      } else if (ev.tileType === TILE.GLASS) {
        // Glass breaks in one hit
        this.arena.tiles[ev.ty][ev.tx] = TILE.DEBRIS;
        this.events.push({
          type: 'event', kind: 'wall_damage',
          tx: ev.tx, ty: ev.ty, hp: 0, state: 'destroyed',
        });
      }
      // Small spark for bullet wall impact
      this.events.push({
        type: 'event', kind: 'explosion',
        x: ev.bullet.x, y: ev.bullet.y, size: 'small',
      });
    }

    if (ev.kind === 'bullet_hit') {
      const ship = ev.ship;
      const dmg  = ship.pshieldTimer > 0 ? Math.ceil(ev.bullet.damage * 0.3) : ev.bullet.damage;
      ship.shield -= dmg;
      ship.hitFlashTimer = 0.15;

      this.events.push({
        type: 'event', kind: 'explosion',
        x: ev.bullet.x, y: ev.bullet.y, size: 'small',
      });

      if (ship.shield <= 0) {
        ship.shield = 0;
        this._killShip(ship, ev.bullet.ownerId, ev.bullet.weapon);
      }
    }
  }

  _killShip(ship, killerId, weaponId) {
    ship.alive        = false;
    ship.respawnTimer = CONFIG.RESPAWN_TIME;
    ship.deaths++;

    if (killerId && this.ships[killerId]) {
      this.ships[killerId].kills++;
    }

    // Solo mode: AI never respawns; player loses a life
    if (this.soloMode) {
      if (ship.isAI) {
        ship.respawnTimer = 9999;
      } else {
        this.playerLives = Math.max(0, this.playerLives - 1);
        if (this.playerLives <= 0) {
          ship.respawnTimer = 9999;  // no more respawns
        }
      }
    }

    this.events.push({
      type: 'event', kind: 'kill',
      killerId, victimId: ship.id,
      weapon: weaponId,
    });
    this.events.push({
      type: 'event', kind: 'explosion',
      x: ship.x, y: ship.y, size: 'large',
    });

    // Clear bullets owned by dead ship
    this.bullets = this.bullets.filter(b => b.ownerId !== ship.id);
  }

  _checkRoundEnd() {
    if (this.roundOver) return;

    if (this.soloMode) {
      if (this.aiShips.length > 0 && this.aiShips.every(ai => !ai.alive)) {
        this._endSolo(true);
        return;
      }
      if (this.playerLives <= 0) {
        const humanShip = Object.values(this.ships).find(s => !s.isAI);
        if (humanShip && !humanShip.alive) this._endSolo(false);
      }
      return;
    }

    for (const ship of Object.values(this.ships)) {
      if (ship.kills >= CONFIG.KILL_TARGET) {
        this.roundOver = true;
        const scores = Object.values(this.ships).map(s => ({
          id: s.id, name: s.name, kills: s.kills, deaths: s.deaths,
        }));
        this.broadcast({
          type:     'round_end',
          winnerId: ship.id,
          winnerName: ship.name,
          scores,
        });
        this._endTimeout = setTimeout(() => {
          if (!this.running) return;
          this.stop();
          this.room.state = 'lobby';
          this.room.game  = null;
          this.broadcast({ type: 'lobby_reset' });
        }, 5000);
        return;
      }
    }
  }

  _endSolo(victory) {
    this.roundOver = true;
    const humanShip = Object.values(this.ships).find(s => !s.isAI);
    const kills  = humanShip?.kills  || 0;
    const deaths = humanShip?.deaths || 0;
    const score  = kills * (SOLO_SCORE_MULT[this.soloDiff] || 1);
    this.broadcast({ type: 'solo_end', victory, score, kills, deaths, difficulty: this.soloDiff, livesLeft: this.playerLives });
    this._endTimeout = setTimeout(() => {
      if (!this.running) return;
      this.stop();
      this.room.state = 'lobby';
      this.room.game  = null;
    }, 5000);
  }

  _broadcastState() {
    const players = Object.values(this.ships).map(s => ({
      id:             s.id,
      name:           s.name,
      shipId:         s.shipId,
      isAI:           s.isAI || false,
      x:              s.x,
      y:              s.y,
      angle:          s.angle,
      vx:             s.vx,
      vy:             s.vy,
      shield:         s.shield,
      ammo:           s.ammo,
      weapon:         s.weapon,
      dashing:        s.dashing,
      dodging:        s.dodging,
      thrusting:      s.thrusting,
      alive:          s.alive,
      invulnerable:   s.invulnerable,
      respawnTimer:   s.respawnTimer,
      hitFlashTimer:  s.hitFlashTimer,
      onRefuel:       s.onRefuel,
      angularVel:     s.angularVel,
      kills:          s.kills,
      deaths:         s.deaths,
      speedBoostTimer: s.speedBoostTimer,
      pshieldTimer:   s.pshieldTimer,
    }));

    const bullets = this.bullets.map(b => ({
      id:     b.id,
      x:      b.x,
      y:      b.y,
      vx:     b.vx,
      vy:     b.vy,
      weapon: b.weapon,
      size:   b.size,
    }));

    const powerups = this.powerups.map(p => ({
      id:       p.id,
      x:        p.x,
      y:        p.y,
      typeId:   p.typeId,
      icon:     p.icon,
      color:    p.color,
      bobPhase: p.bobPhase,
    }));

    const soloInfo = this.soloMode ? {
      lives:       this.playerLives,
      aiRemaining: this.aiShips.filter(ai => ai.alive).length,
    } : null;

    this.broadcast({
      type:    'state',
      tick:    this.tickCount,
      players,
      bullets,
      powerups,
      soloInfo,
    });
  }
}

module.exports = Game;
