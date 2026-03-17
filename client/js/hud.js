// client/js/hud.js — HUD overlay (all in screen coordinates)

const TAU = Math.PI * 2;

export class HUD {
  constructor() {
    this._killFeedAnims = [];   // { text, color, y, alpha, timer }
  }

  /**
   * Draw the complete HUD for the local player.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} localPlayer  — from game state
   * @param {object[]} allPlayers — all players in game state
   * @param {Array} killFeed      — [{ text, color, timer }]
   * @param {number} time         — elapsed time in seconds
   */
  draw(ctx, localPlayer, allPlayers, killFeed, time) {
    if (!localPlayer) return;

    const W = CONFIG.VIEWPORT_W;
    const H = CONFIG.VIEWPORT_H;

    const def     = CONFIG.SHIPS[localPlayer.shipId || 0] || CONFIG.SHIPS[0];
    const maxShield = def.shield;
    const maxAmmo   = def.ammo;
    const wDef    = CONFIG.WEAPONS[localPlayer.weapon || 0] || CONFIG.WEAPONS[0];

    // ── Bottom-left: Shield + Ammo ──────────────────────────
    const panelX = 14;
    const panelY = H - 80;
    const barW   = 160;
    const barH   = 14;

    // Panel background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, panelX - 6, panelY - 6, barW + 60, 74, 6);
    ctx.fill();

    // Shield bar
    const shieldFrac = Math.max(0, Math.min(1, (localPlayer.shield || 0) / maxShield));
    const shieldColor = shieldFrac > 0.5 ? '#22AAFF' : shieldFrac > 0.25 ? '#FFAA00' : '#FF4444';
    const shieldPulse = shieldFrac < 0.25 && Math.sin(time * 8) > 0;

    ctx.fillStyle = '#111';
    ctx.fillRect(panelX, panelY, barW, barH);
    ctx.fillStyle = shieldPulse ? '#FF6666' : shieldColor;
    ctx.fillRect(panelX, panelY, barW * shieldFrac, barH);
    _barLabel(ctx, 'SHIELD', panelX, panelY - 13, shieldColor);

    // Ammo bar
    const ammoFrac = Math.max(0, Math.min(1, (localPlayer.ammo || 0) / maxAmmo));
    const ammoY    = panelY + barH + 10;
    ctx.fillStyle = '#111';
    ctx.fillRect(panelX, ammoY, barW, barH);
    ctx.fillStyle = '#FFCC22';
    ctx.fillRect(panelX, ammoY, barW * ammoFrac, barH);
    _barLabel(ctx, 'AMMO', panelX, ammoY - 13, '#FFCC22');

    // Weapon name
    ctx.fillStyle = wDef.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(wDef.name, panelX, panelY + barH * 2 + 28);

    // ── Bottom-right: Cooldowns + Lives ─────────────────────
    const cdX = W - 120;
    const cdY = H - 80;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, cdX - 6, cdY - 6, 116, 74, 6);
    ctx.fill();

    // Dash cooldown
    _cooldownArc(ctx, cdX + 18, cdY + 18, 14, 1 - Math.min(1, (localPlayer.dashCooldown || 0) / CONFIG.DASH_COOLDOWN), '#FF6600', 'DASH');

    // Dodge cooldown
    _cooldownArc(ctx, cdX + 65, cdY + 18, 14, 1 - Math.min(1, (localPlayer.dodgeCooldown || 0) / CONFIG.DODGE_COOLDOWN), '#44AAFF', 'DODGE');

    // ── Top-right: Score display ─────────────────────────────
    this._drawScores(ctx, allPlayers, W, time);

    // ── Top-right: Kill feed ─────────────────────────────────
    this._drawKillFeed(ctx, killFeed, W, time);

    // ── Center top: REFUELING indicator ─────────────────────
    if (localPlayer.onRefuel) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#44AAFF';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('⚡ REFUELING', W / 2, 12);
      ctx.globalAlpha = 1;
    }

    // ── Active power-up badge ────────────────────────────────
    if ((localPlayer.pshieldTimer || 0) > 0) {
      _powerupBadge(ctx, W - 14, H - 130, 'P', '#4444FF', localPlayer.pshieldTimer, CONFIG.POWERUPS[3].value);
    }
    if ((localPlayer.speedBoostTimer || 0) > 0) {
      _powerupBadge(ctx, W - 14, H - 170, 'V', '#44FF44', localPlayer.speedBoostTimer, CONFIG.POWERUPS[4].value);
    }
  }

  _drawScores(ctx, players, W, time) {
    if (!players || players.length < 2) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, W - 180, 8, 168, players.length * 22 + 12, 4);
    ctx.fill();

    players.forEach((p, i) => {
      const def = CONFIG.SHIPS[p.shipId || 0] || CONFIG.SHIPS[0];
      ctx.fillStyle = def.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name || '?', W - 170, 16 + i * 22);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      ctx.fillText(`${p.kills || 0} / ${CONFIG.KILL_TARGET}`, W - 14, 16 + i * 22);
    });
    ctx.restore();
  }

  _drawKillFeed(ctx, killFeed, W, time) {
    if (!killFeed || killFeed.length === 0) return;
    ctx.save();
    killFeed.forEach((k, i) => {
      const alpha = Math.min(1, k.timer);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const tw = ctx.measureText(k.text).width + 16;
      ctx.fillRect(W - tw - 8, 80 + i * 24, tw + 8, 20);
      ctx.fillStyle = k.color || '#FF6600';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(k.text, W - 12, 83 + i * 24);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Helpers ───────────────────────────────────────────────────

function _barLabel(ctx, text, x, y, color) {
  ctx.fillStyle = color + 'bb';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y + 10);
}

function _cooldownArc(ctx, cx, cy, r, frac, color, label) {
  // Background
  ctx.strokeStyle = '#333';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();

  // Arc
  ctx.strokeStyle = color;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();

  // Label
  ctx.fillStyle = frac >= 1 ? color : '#888';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(frac >= 1 ? 'RDY' : label, cx, cy + r + 10);
}

function _powerupBadge(ctx, rx, ry, icon, color, remaining, max) {
  const frac = remaining / max;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  _roundRect(ctx, rx - 26, ry - 26, 28, 28, 4);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rx - 12, ry - 12, 10, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, rx - 12, ry - 12);
  ctx.restore();
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
