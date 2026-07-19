// client/js/hud.js — HUD overlay (all in screen coordinates)
// Chase Ace Deluxe style: AMMO bar top-left (green), SHIELD bar top-right
// (orange), "CURRENT WEAPON" text on change, flashing DANGER at low shield

const TAU = Math.PI * 2;

export class HUD {
  constructor() {
    this._killFeedAnims = [];   // { text, color, y, alpha, timer }
    this._lastWeapon      = null;
    this._weaponTextUntil = 0;  // show "CURRENT WEAPON" until this time
  }

  /**
   * Draw the complete HUD for the local player.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} localPlayer  — from game state
   * @param {object[]} allPlayers — all players in game state
   * @param {Array} killFeed      — [{ text, color, timer }]
   * @param {number} time         — elapsed time in seconds
   */
  draw(ctx, localPlayer, allPlayers, killFeed, time, soloInfo = null) {
    if (!localPlayer) return;

    const W = CONFIG.VIEWPORT_W;
    const H = CONFIG.VIEWPORT_H;

    const def     = CONFIG.SHIPS[localPlayer.shipId || 0] || CONFIG.SHIPS[0];
    const maxShield = def.shield;
    const maxAmmo   = def.ammo;
    const wDef    = CONFIG.WEAPONS[localPlayer.weapon || 0] || CONFIG.WEAPONS[0];

    // ── Top-left: AMMO bar (green, CA Deluxe style) ─────────
    const curAmmo = localPlayer.weapons ? localPlayer.weapons[localPlayer.weapon || 0] : undefined;
    const ammoFrac = (curAmmo === undefined || curAmmo === -1)
      ? 1
      : Math.max(0, Math.min(1, curAmmo / (wDef.pickupAmmo || maxAmmo)));

    _topBar(ctx, 14, 8, 170, 12, ammoFrac, '#33CC44', 'AMMO');

    // ── Top-right: SHIELD bar (orange, CA Deluxe style) ─────
    const shieldFrac = Math.max(0, Math.min(1, (localPlayer.shield || 0) / maxShield));
    _topBar(ctx, W - 184, 8, 170, 12, shieldFrac, '#EE8822', 'SHIELD', true);

    // ── Top-center: "CURRENT WEAPON" on change (2s) ─────────
    const curWeapon = localPlayer.weapon || 0;
    if (this._lastWeapon !== null && curWeapon !== this._lastWeapon) {
      this._weaponTextUntil = time + 2;
    }
    this._lastWeapon = curWeapon;
    if (time < this._weaponTextUntil) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(`CURRENT WEAPON: ${wDef.name}`, W / 2, 6);
      ctx.restore();
    }

    // ── Top-center: flashing DANGER at low shield ────────────
    if (localPlayer.alive && shieldFrac < 0.25 && Math.sin(time * 6) > 0) {
      ctx.save();
      ctx.fillStyle = '#FF3333';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText('DANGER', W / 2, time < this._weaponTextUntil ? 24 : 6);
      ctx.restore();
    }

    // ── Bottom-left: Weapon name ─────────────────────────────
    const panelX = 14;
    const panelY = H - 44;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, panelX - 6, panelY - 6, 150, 34, 6);
    ctx.fill();
    ctx.fillStyle = wDef.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = wDef.color;
    ctx.shadowBlur = 6;
    ctx.fillText(wDef.name, panelX, panelY + 16);
    ctx.shadowBlur = 0;

    // ── Bottom-right: Cooldowns ──────────────────────────────
    const cdX = W - 120;
    const cdY = H - 80;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, cdX - 6, cdY - 6, 116, 74, 6);
    ctx.fill();

    // Dash cooldown
    _cooldownArc(ctx, cdX + 18, cdY + 18, 14, 1 - Math.min(1, (localPlayer.dashCooldown || 0) / CONFIG.DASH_COOLDOWN), '#FF6600', 'DASH');

    // Dodge cooldown
    _cooldownArc(ctx, cdX + 65, cdY + 18, 14, 1 - Math.min(1, (localPlayer.dodgeCooldown || 0) / CONFIG.DODGE_COOLDOWN), '#44AAFF', 'DODGE');

    // ── Top-center: Solo mode HUD ────────────────────────────
    if (soloInfo) {
      this._drawSoloHUD(ctx, soloInfo, W);
    } else {
      // ── Below shield bar: Score display (multiplayer only) ──
      this._drawScores(ctx, allPlayers, W, time);
    }

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
      ctx.fillText('⚡ REFUELING', W / 2, H - 24);
      ctx.globalAlpha = 1;
    }

    // ── Active power-up badge ────────────────────────────────
    if ((localPlayer.pshieldPool || 0) > 0) {
      // Plain icon badge while the absorb pool holds (no timer ring)
      _powerupBadge(ctx, W - 14, H - 130, 'P', '#4444FF', 1, 1);
    }
    if ((localPlayer.speedBoostTimer || 0) > 0) {
      _powerupBadge(ctx, W - 14, H - 170, 'V', '#44FF44', localPlayer.speedBoostTimer, CONFIG.POWERUPS[4].value);
    }
  }

  _drawScores(ctx, players, W, time) {
    if (!players || players.length < 2) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, W - 180, 26, 168, players.length * 22 + 12, 4);
    ctx.fill();

    players.forEach((p, i) => {
      const def = CONFIG.SHIPS[p.shipId || 0] || CONFIG.SHIPS[0];
      ctx.fillStyle = def.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name || '?', W - 170, 34 + i * 22);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      ctx.fillText(`${p.kills || 0} / ${CONFIG.KILL_TARGET}`, W - 14, 34 + i * 22);
    });
    ctx.restore();
  }

  _drawSoloHUD(ctx, soloInfo, W) {
    const cx = W / 2;
    const mode = soloInfo.mode || 'skirmish';
    const hasExtra = mode !== 'skirmish';

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, cx - 100, 26, 200, hasExtra ? 74 : 56, 5);
    ctx.fill();

    // Lives (hearts)
    const lives = Math.max(0, soloInfo.lives || 0);
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let heartsStr = '';
    for (let i = 0; i < 3; i++) {
      heartsStr += i < lives ? '\u2665' : '\u2661';  // ♥ or ♡
    }
    ctx.fillStyle = '#FF4444';
    ctx.fillText(heartsStr, cx, 32);

    ctx.font = 'bold 13px monospace';
    if (mode === 'endless') {
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`WAVE ${soloInfo.wave || 1}  •  SCORE ${soloInfo.score || 0}`, cx, 58);
      ctx.fillStyle = '#FF8800';
      ctx.fillText(`ENEMIES: ${soloInfo.aiRemaining}`, cx, 76);
    } else if (mode === 'mission' && soloInfo.objective) {
      const o = soloInfo.objective;
      const line = o.text === 'SURVIVE'
        ? `${o.text}: ${o.progress}s`
        : `${o.text}: ${o.progress}/${o.target}`;
      ctx.fillStyle = '#FFD700';
      ctx.fillText(line, cx, 58);
      ctx.fillStyle = '#FF8800';
      ctx.fillText(`ENEMIES: ${soloInfo.aiRemaining}`, cx, 76);
    } else {
      // Skirmish
      ctx.fillStyle = '#FF8800';
      ctx.fillText(`ENEMIES: ${soloInfo.aiRemaining}`, cx, 58);
    }
  }

  _drawKillFeed(ctx, killFeed, W, time) {
    if (!killFeed || killFeed.length === 0) return;
    ctx.save();
    killFeed.forEach((k, i) => {
      const alpha = Math.min(1, k.timer);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const tw = ctx.measureText(k.text).width + 16;
      ctx.fillRect(W - tw - 8, 100 + i * 24, tw + 8, 20);
      ctx.fillStyle = k.color || '#FF6600';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(k.text, W - 12, 103 + i * 24);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Helpers ───────────────────────────────────────────────────

/** CA Deluxe top bar: dark slot + colored fill + label above */
function _topBar(ctx, x, y, w, h, frac, color, label, alignRight = false) {
  ctx.save();
  // Slot
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  _roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 3);
  ctx.fill();
  // Fill
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, w, h);
  if (frac > 0) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#FFFFFF66');
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * frac, h);
  }
  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, alignRight ? x + w : x, y - 2);
  ctx.restore();
}

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
