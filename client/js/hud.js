// client/js/hud.js — HUD overlay (all in screen coordinates)
// Layout da handbook F18 (set 01 "Schermate"):
// - top bar unica h30 su rgba(6,10,28,0.9), bordo inferiore #16203c:
//   AMMO #6ee87a a sinistra, punteggio mono centrale, SHIELD #FF9828 a destra
// - vite = 3 chevron a punta in su nel colore nave sotto la barra (solo mode)
// - toast arma ancorato a y40, bordo sinistro oro 2px
// - DANGER Archivo 800 italic 30px #FF4444 a y96, lampeggio 0,5 s
// - BLAZE METER in basso al centro: 10 chevron 20×22 gap 4 (visibile solo se
//   il server manda player.blaze — la logica arriva con F19)
// - punteggi multiplayer in colonna in basso a destra, pastiglia colore nave

const TAU = Math.PI * 2;

// Font del set UI (caricati via @font-face in style.css)
const F_TITLE = 'italic 800 %dpx Archivo, monospace';   // titoli (DANGER)
const F_UI    = '700 %dpx Archivo, monospace';          // voci HUD
const F_MONO  = '600 %dpx "IBM Plex Mono", monospace';  // numeri

const fmt = (tpl, px) => tpl.replace('%d', px);

export class HUD {
  constructor() {
    this._killFeedAnims = [];   // { text, color, y, alpha, timer }
    this._lastWeapon      = null;
    this._weaponTextUntil = 0;  // show weapon toast until this time
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

    // ── Top bar unica h30 (handbook: nessun elemento fuori da questa fascia) ──
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,28,0.9)';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#16203c';
    ctx.fillRect(0, 30, W, 1);

    // AMMO a sinistra: label + barra h8 traccia #16203c
    const curAmmo = localPlayer.weapons ? localPlayer.weapons[localPlayer.weapon || 0] : undefined;
    const ammoFrac = (curAmmo === undefined || curAmmo === -1)
      ? 1
      : Math.max(0, Math.min(1, curAmmo / (wDef.pickupAmmo || maxAmmo)));
    ctx.font = fmt(F_UI, 11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8a9aac';
    ctx.fillText('AMMO', 12, 15);
    _hudBar(ctx, 64, 11, 180, 8, ammoFrac, '#6ee87a');
    // valore mono accanto alla barra
    ctx.font = fmt(F_MONO, 11);
    ctx.fillStyle = '#e8ecff';
    ctx.fillText(curAmmo === -1 || curAmmo === undefined ? '∞' : String(curAmmo), 250, 15);

    // Punteggio centrale mono (multiplayer: kill del giocatore; solo: score)
    ctx.font = fmt(F_MONO, 14);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFCC00';
    const centerVal = soloInfo ? String(soloInfo.score || 0) : String(localPlayer.kills || 0);
    ctx.fillText(centerVal, W / 2, 15);

    // SHIELD a destra (speculare ad AMMO)
    const shieldFrac = Math.max(0, Math.min(1, (localPlayer.shield || 0) / maxShield));
    ctx.font = fmt(F_MONO, 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8ecff';
    ctx.fillText(String(Math.max(0, Math.round(localPlayer.shield || 0))), W - 250, 15);
    _hudBar(ctx, W - 244, 11, 180, 8, shieldFrac,
      shieldFrac < 0.2 && Math.sin(time * (TAU / 0.4)) > 0 ? '#FF4444' : '#FF9828');  // critico: rosso, lampeggio 0,4 s
    ctx.font = fmt(F_UI, 11);
    ctx.fillStyle = '#8a9aac';
    ctx.fillText('SHIELD', W - 60, 15);
    ctx.restore();

    // ── Vite: 3 chevron a punta in su nel colore nave, x12 sotto la barra ──
    if (soloInfo) {
      const lives = Math.max(0, soloInfo.lives || 0);
      for (let i = 0; i < 3; i++) {
        _chevronUp(ctx, 12 + i * 24, 38, 14, 16, i < lives ? def.color : '#16203c');
      }
    }

    // ── Toast arma al cambio (y40, bordo sinistro oro 2px, mai pannello pieno) ──
    const curWeapon = localPlayer.weapon || 0;
    if (this._lastWeapon !== null && curWeapon !== this._lastWeapon) {
      this._weaponTextUntil = time + 1.4;   // resta 1,4 s (handbook toast)
    }
    this._lastWeapon = curWeapon;
    if (time < this._weaponTextUntil) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (this._weaponTextUntil - time) / 0.2);
      ctx.font = fmt(F_UI, 14);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = wDef.name.toUpperCase();
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = '#FFCC00';
      ctx.fillRect(W / 2 - tw / 2 - 12, 40, 2, 18);   // bordo sinistro oro 2px
      ctx.fillStyle = '#e8ecff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(label, W / 2, 42);
      ctx.restore();
    }

    // ── DANGER: Archivo 800 italic 30px #FF4444, y96, lampeggio 0,5 s ──
    if (localPlayer.alive && shieldFrac < 0.25 && Math.sin(time * (TAU / 0.5)) > 0) {
      ctx.save();
      ctx.fillStyle = '#FF4444';
      ctx.font = fmt(F_TITLE, 30);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = '#FF4444';
      ctx.shadowBlur = 12;
      ctx.fillText('DANGER', W / 2, 96);
      ctx.restore();
    }

    // ── Bottom-left: arma corrente + inventario slot ─────────
    const panelX = 14;
    const panelY = H - 58;
    ctx.fillStyle = 'rgba(6,10,28,0.75)';
    ctx.fillRect(panelX - 6, panelY - 6, 170, 48);
    ctx.fillStyle = '#16203c';
    ctx.fillRect(panelX - 6, panelY - 6, 170, 1);
    ctx.fillStyle = wDef.color;
    ctx.font = fmt(F_UI, 14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = wDef.color;
    ctx.shadowBlur = 6;
    ctx.fillText(wDef.name, panelX, panelY + 14);
    ctx.shadowBlur = 0;

    // Inventario armi: numero slot (tasti 1-9) + colore arma, corrente evidenziata
    const ownedW = localPlayer.weapons
      ? Object.keys(localPlayer.weapons).map(Number).sort((a, b) => a - b)
      : [];
    ownedW.forEach((wid, i) => {
      const wd = CONFIG.WEAPONS[wid] || CONFIG.WEAPONS[0];
      const bx = panelX + i * 20;
      const isCur = wid === (localPlayer.weapon || 0);
      ctx.globalAlpha = isCur ? 1 : 0.35;
      ctx.fillStyle = wd.color;
      ctx.font = fmt(F_MONO, 10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(i + 1), bx + 7, panelY + 30);
      ctx.fillRect(bx, panelY + 34, 14, 3);
      ctx.globalAlpha = 1;
    });

    // ── Bottom-right: Cooldowns ──────────────────────────────
    const cdX = W - 120;
    const cdY = H - 80;

    ctx.fillStyle = 'rgba(6,10,28,0.75)';
    ctx.fillRect(cdX - 6, cdY - 6, 116, 74);
    ctx.fillStyle = '#16203c';
    ctx.fillRect(cdX - 6, cdY - 6, 116, 1);

    // Turbo (SHIFT: sempre pronto, si accende mentre è tenuto)
    _turboIndicator(ctx, cdX + 18, cdY + 18, 14, !!localPlayer.dashing);

    // Dodge cooldown
    _cooldownArc(ctx, cdX + 65, cdY + 18, 14, 1 - Math.min(1, (localPlayer.dodgeCooldown || 0) / CONFIG.DODGE_COOLDOWN), '#44AAFF', 'DODGE');

    // ── Top-center: Solo mode HUD ────────────────────────────
    if (soloInfo) {
      this._drawSoloHUD(ctx, soloInfo, W);
    } else {
      // ── Punteggi multiplayer: colonna in basso a destra ──
      this._drawScores(ctx, allPlayers, W, H, time);
    }

    // ── Top-right: Kill feed ─────────────────────────────────
    this._drawKillFeed(ctx, killFeed, W, time);

    // ── BLAZE METER (F18 visuale; logica da F19: il server non manda ancora
    //    player.blaze → nascosto finché non c'è dato) ──
    if (typeof localPlayer.blaze === 'number') {
      this._drawBlazeMeter(ctx, W, H, localPlayer.blaze, time);
    }

    // ── Center top: REFUELING indicator ─────────────────────
    if (localPlayer.onRefuel) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#44AAFF';
      ctx.font = fmt(F_UI, 14);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('⚡ REFUELING', W / 2, H - 24);
      ctx.globalAlpha = 1;
    }

    // ── Active power-up badge ────────────────────────────────
    if ((localPlayer.pshieldPool || 0) > 0) {
      _powerupBadge(ctx, W - 14, H - 130, 'P', '#4444FF', 1, 1);
    }
    if ((localPlayer.speedBoostTimer || 0) > 0) {
      _powerupBadge(ctx, W - 14, H - 170, 'V', '#44FF44', localPlayer.speedBoostTimer, CONFIG.POWERUPS[4].value);
    }
  }

  // ── BLAZE METER: 10 chevron 20×22 gap 4 in basso al centro ──
  // blaze: 0..1. A pieno carico (abilità pronta): arancio, pulsazione 1,2 s.
  _drawBlazeMeter(ctx, W, H, blaze, time) {
    const SEG = 10, CW = 20, CH = 22, GAP = 4;
    const totalW = SEG * CW + (SEG - 1) * GAP;
    const x0 = (W - totalW) / 2;
    const y  = H - 30;
    const full = blaze >= 1;
    const pulse = full ? 0.7 + 0.3 * Math.sin(time * (TAU / 1.2)) : 1;
    for (let i = 0; i < SEG; i++) {
      const filled = (i + 1) / SEG <= blaze + 1e-6;
      let color = '#16203c';                          // traccia
      if (full)        color = `rgba(255,102,0,${pulse})`;   // pronto: arancio pulsante
      else if (filled) color = '#FFCC00';                    // carico: oro
      _chevronRight(ctx, x0 + i * (CW + GAP), y, CW, CH, color);
    }
  }

  _drawScores(ctx, players, W, H, time) {
    if (!players || players.length < 2) return;

    ctx.save();
    const rowH = 22;
    const x0 = W - 180, y0 = H - 110 - players.length * rowH;
    ctx.fillStyle = 'rgba(6,10,28,0.75)';
    ctx.fillRect(x0, y0, 168, players.length * rowH + 12);
    ctx.fillStyle = '#16203c';
    ctx.fillRect(x0, y0, 168, 1);

    players.forEach((p, i) => {
      const def = CONFIG.SHIPS[p.shipId || 0] || CONFIG.SHIPS[0];
      // Pastiglia colore nave
      ctx.fillStyle = def.color;
      ctx.fillRect(x0 + 10, y0 + 10 + i * rowH + 4, 10, 10);
      ctx.font = fmt(F_UI, 12);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name || '?', x0 + 28, y0 + 8 + i * rowH);

      ctx.fillStyle = '#e8ecff';
      ctx.font = fmt(F_MONO, 12);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.kills || 0}/${CONFIG.KILL_TARGET}`, x0 + 158, y0 + 8 + i * rowH);
    });
    ctx.restore();
  }

  _drawSoloHUD(ctx, soloInfo, W) {
    const cx = W / 2;
    const mode = soloInfo.mode || 'skirmish';

    ctx.font = fmt(F_UI, 13);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (mode === 'endless') {
      ctx.fillStyle = '#FFCC00';
      ctx.fillText(`WAVE ${soloInfo.wave || 1}`, cx, 38);
      ctx.fillStyle = '#FF9828';
      ctx.fillText(`ENEMIES: ${soloInfo.aiRemaining}`, cx, 56);
    } else if (mode === 'mission' && soloInfo.objective) {
      const o = soloInfo.objective;
      const line = o.text === 'SURVIVE'
        ? `${o.text}: ${o.progress}s`
        : `${o.text}: ${o.progress}/${o.target}`;
      ctx.fillStyle = '#FFCC00';
      ctx.fillText(line, cx, 38);
      ctx.fillStyle = '#FF9828';
      ctx.fillText(`ENEMIES: ${soloInfo.aiRemaining}`, cx, 56);
    } else {
      // Skirmish keep 'em coming: obiettivo KILLS x/y + nemici vivi
      if (soloInfo.objective) {
        const o = soloInfo.objective;
        ctx.fillStyle = '#FFCC00';
        ctx.fillText(`${o.text}: ${o.progress}/${o.target}`, cx, 38);
      }
      ctx.fillStyle = '#FF9828';
      ctx.fillText(`ENEMIES: ${soloInfo.aiRemaining}`, cx, 56);
    }
  }

  _drawKillFeed(ctx, killFeed, W, time) {
    if (!killFeed || killFeed.length === 0) return;
    ctx.save();
    killFeed.forEach((k, i) => {
      const alpha = Math.min(1, k.timer);
      ctx.globalAlpha = alpha;
      ctx.font = fmt(F_UI, 11);
      const tw = ctx.measureText(k.text).width + 16;
      ctx.fillStyle = 'rgba(6,10,28,0.75)';
      ctx.fillRect(W - tw - 8, 100 + i * 24, tw + 8, 20);
      ctx.fillStyle = k.color || '#FF6600';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(k.text, W - 12, 103 + i * 24);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Helpers ───────────────────────────────────────────────────

/** Barra HUD da handbook: traccia #16203c h8, fill pieno senza gradienti. */
function _hudBar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = '#16203c';
  ctx.fillRect(x, y, w, h);
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(w * frac), h);
  }
}

/** Chevron a punta in su (vite), riempito. */
function _chevronUp(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.45);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h * 0.45);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h * 0.55);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

/** Doppio chevron a destra (segmento BLAZE METER): oro davanti, arancio dietro
 *  quando è carico; sagoma #16203c quando è vuoto. */
function _chevronRight(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * 0.65, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w * 0.65, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + w * 0.35, y + h / 2);
  ctx.closePath();
  ctx.fill();
}

function _cooldownArc(ctx, cx, cy, r, frac, color, label) {
  // Background
  ctx.strokeStyle = '#16203c';
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
  ctx.fillStyle = frac >= 1 ? color : '#8a9aac';
  ctx.font = fmt(F_UI, 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(frac >= 1 ? 'RDY' : label, cx, cy + r + 10);
}

/** Turbo indicator: sempre pronto, illuminato mentre SHIFT è tenuto */
function _turboIndicator(ctx, cx, cy, r, active) {
  const color = active ? '#FFCC00' : '#8a9aac';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  if (active) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,204,0,0.7)');
    grad.addColorStop(1, 'rgba(255,204,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.font = fmt(F_UI, 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TURBO', cx, cy + r + 10);
}

function _powerupBadge(ctx, rx, ry, icon, color, remaining, max) {
  const frac = remaining / max;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,28,0.75)';
  ctx.fillRect(rx - 26, ry - 26, 28, 28);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rx - 12, ry - 12, 10, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = fmt(F_UI, 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, rx - 12, ry - 12);
  ctx.restore();
}
