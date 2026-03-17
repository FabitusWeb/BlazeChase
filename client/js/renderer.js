// client/js/renderer.js — Canvas rendering orchestrator

import { ArenaRenderer } from './arena.js';
import { FXSystem }      from './fx.js';
import { HUD }           from './hud.js';
import { drawShip }      from './ships.js';

export class Renderer {
  constructor(canvas, arenaData) {
    this.canvas        = canvas;
    this.ctx           = canvas.getContext('2d');
    this.arenaRenderer = new ArenaRenderer(arenaData);
    this.fx            = new FXSystem(this.arenaRenderer);
    this.hud           = new HUD();

    this.camX    = 0;
    this.camY    = 0;
    this.time    = 0;

    // Track previous angular velocity for skid marks
    this._prevAngle = {};
  }

  /**
   * Render one frame.
   * @param {number} dt       — seconds since last frame
   * @param {object} state    — { players, bullets, powerups }
   * @param {string} myId     — local player's ID
   * @param {Array}  killFeed
   * @param {Array}  activePowerups
   */
  frame(dt, state, myId, killFeed, activePowerups) {
    this.time += dt;

    const ctx = this.ctx;
    const W   = CONFIG.VIEWPORT_W;
    const H   = CONFIG.VIEWPORT_H;

    // ── Camera: follow local player ──────────────────────────
    const myPlayer = state.players.find(p => p.id === myId);
    if (myPlayer && myPlayer.alive) {
      const targetCamX = myPlayer.x - W / 2;
      const targetCamY = myPlayer.y - H / 2;
      this.camX += (targetCamX - this.camX) * Math.min(1, dt * 8);
      this.camY += (targetCamY - this.camY) * Math.min(1, dt * 8);
    }

    // Clamp camera
    this.camX = Math.max(0, Math.min(CONFIG.ARENA_WIDTH  - W, this.camX));
    this.camY = Math.max(0, Math.min(CONFIG.ARENA_HEIGHT - H, this.camY));

    // Screen shake offset
    this.fx.update(dt);
    const shakeX = this.fx.shakeX;
    const shakeY = this.fx.shakeY;
    const camX = this.camX + shakeX;
    const camY = this.camY + shakeY;

    // ── Clear ────────────────────────────────────────────────
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    // ── Skid marks from ships ────────────────────────────────
    for (const p of state.players) {
      if (!p.alive) continue;
      const av = Math.abs(p.angularVel || 0);
      const speed = Math.hypot(p.vx || 0, p.vy || 0);
      if (av > 0.5 && speed > 40) {
        const def  = CONFIG.SHIPS[p.shipId || 0] || CONFIG.SHIPS[0];
        const r    = CONFIG.SHIP_RADIUS * 0.7;
        const sideAngle = p.angle + Math.PI / 2;
        // Left and right wheel positions
        const lx = p.x + Math.cos(sideAngle) * r * 0.8 + Math.cos(p.angle + Math.PI) * r * 0.4;
        const ly = p.y + Math.sin(sideAngle) * r * 0.8 + Math.sin(p.angle + Math.PI) * r * 0.4;
        const rx2 = p.x - Math.cos(sideAngle) * r * 0.8 + Math.cos(p.angle + Math.PI) * r * 0.4;
        const ry2 = p.y - Math.sin(sideAngle) * r * 0.8 + Math.sin(p.angle + Math.PI) * r * 0.4;
        const alpha = Math.min(1, av * speed / 1000);
        this.arenaRenderer.addSkidMark(lx, ly, alpha, def.color);
        this.arenaRenderer.addSkidMark(rx2, ry2, alpha, def.color);
      }
    }

    // ── Arena ────────────────────────────────────────────────
    this.arenaRenderer.draw(ctx, camX, camY, this.time);

    // ── FX: effects (behind ships) ───────────────────────────
    this.fx.draw(ctx, camX, camY);

    // ── Power-ups ────────────────────────────────────────────
    this.fx.drawPowerups(ctx, state.powerups || [], camX, camY, this.time);

    // ── Bullets ──────────────────────────────────────────────
    this.fx.drawBullets(ctx, state.bullets || [], camX, camY);

    // ── Ships ────────────────────────────────────────────────
    for (const p of state.players) {
      const def = CONFIG.SHIPS[p.shipId || 0] || CONFIG.SHIPS[0];
      drawShip(ctx, p, def, this.time, camX, camY);
    }

    // ── HUD (screen coords, no camera offset) ───────────────
    const localPlayer = state.players.find(p => p.id === myId);
    this.hud.draw(ctx, localPlayer, state.players, killFeed, this.time, state.soloInfo || null);
  }
}
