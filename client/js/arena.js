// client/js/arena.js — Arena pre-renderer with offscreen canvases

const T = CONFIG.TILE;
const TS = CONFIG.TILE_SIZE;

export class ArenaRenderer {
  constructor(arenaData) {
    this.arenaData  = arenaData;
    this.tiles      = arenaData.tiles;
    this.wallHP     = arenaData.wallHP || [];
    this.theme      = CONFIG.THEMES[arenaData.theme] || CONFIG.THEMES.INDUSTRIAL;

    const W = CONFIG.ARENA_WIDTH;
    const H = CONFIG.ARENA_HEIGHT;

    // Main arena offscreen canvas
    this.arenaCanvas = new OffscreenCanvas(W, H);
    this.arenaCtx    = this.arenaCanvas.getContext('2d');

    // Skid marks (accumulate, never cleared)
    this.skidCanvas  = new OffscreenCanvas(W, H);
    this.skidCtx     = this.skidCanvas.getContext('2d');

    // Burn marks from explosions (accumulate)
    this.burnCanvas  = new OffscreenCanvas(W, H);
    this.burnCtx     = this.burnCanvas.getContext('2d');

    // Track crack seed per destructible tile
    this.crackSeeds  = {};

    this._preRender();
  }

  _preRender() {
    const ctx = this.arenaCtx;
    const ROWS = CONFIG.ARENA_ROWS;
    const COLS = CONFIG.ARENA_COLS;
    const th   = this.theme;

    ctx.clearRect(0, 0, CONFIG.ARENA_WIDTH, CONFIG.ARENA_HEIGHT);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = this.tiles[r][c];
        const x = c * TS;
        const y = r * TS;
        this._drawTile(ctx, tile, x, y, c, r);
      }
    }
  }

  _drawTile(ctx, tile, x, y, c, r) {
    const th = this.theme;
    switch (tile) {
      case T.FLOOR:
        this._drawFloor(ctx, x, y, c, r);
        break;
      case T.WALL_SOLID:
        this._drawWallSolid(ctx, x, y, c, r);
        break;
      case T.WALL_DEST:
        this._drawWallDest(ctx, x, y, c, r, this.wallHP[r]?.[c] ?? CONFIG.WALL_DEST_HP);
        break;
      case T.ACID:
        this._drawFloor(ctx, x, y, c, r);  // base floor, animated overlay added per-frame
        this._drawAcidBase(ctx, x, y);
        break;
      case T.REFUEL:
        this._drawFloor(ctx, x, y, c, r);
        this._drawRefuelBase(ctx, x, y);
        break;
      case T.GLASS:
        this._drawGlass(ctx, x, y);
        break;
      case T.DEBRIS:
        this._drawDebris(ctx, x, y, c, r);
        break;
    }
  }

  _drawFloor(ctx, x, y, c, r) {
    const th = this.theme;
    // Subtle checkerboard variation
    const shade = ((c + r) % 2 === 0) ? 1.0 : 0.92;
    ctx.fillStyle = shadeColor(th.floor, shade);
    ctx.fillRect(x, y, TS, TS);

    // Occasional bolt/rivet details
    if ((c * 7 + r * 13) % 11 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.arc(x + TS * 0.25, y + TS * 0.25, 2, 0, Math.PI * 2);
      ctx.arc(x + TS * 0.75, y + TS * 0.25, 2, 0, Math.PI * 2);
      ctx.arc(x + TS * 0.25, y + TS * 0.75, 2, 0, Math.PI * 2);
      ctx.arc(x + TS * 0.75, y + TS * 0.75, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawWallSolid(ctx, x, y, c, r) {
    const th = this.theme;
    const isPerimeter = (r === 0 || r === CONFIG.ARENA_ROWS - 1 || c === 0 || c === CONFIG.ARENA_COLS - 1);

    // Base
    ctx.fillStyle = th.wall;
    ctx.fillRect(x, y, TS, TS);

    // 3D bevel — highlight top-left
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, TS, 3);
    ctx.fillRect(x, y, 3, TS);

    // Shadow bottom-right
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + TS - 3, TS, 3);
    ctx.fillRect(x + TS - 3, y, 3, TS);

    // Perimeter hazard stripes
    if (isPerimeter) {
      const stripeW = 8;
      ctx.fillStyle = th.accent + '88';
      for (let i = 0; i < TS / stripeW; i++) {
        if (i % 2 === 0) {
          if (r === 0 || r === CONFIG.ARENA_ROWS - 1) {
            ctx.fillRect(x + i * stripeW, y, stripeW, TS);
          } else {
            ctx.fillRect(x, y + i * stripeW, TS, stripeW);
          }
        }
      }
      // Re-draw bevel on top
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, y, TS, 2);
      ctx.fillRect(x, y, 2, TS);
    }
  }

  _drawWallDest(ctx, x, y, c, r, hp) {
    const th = this.theme;
    const maxHp = CONFIG.WALL_DEST_HP;
    const frac  = hp / maxHp;  // 0=destroyed, 1=full

    // Base color — slightly lighter than solid wall
    ctx.fillStyle = th.wallDest;
    ctx.fillRect(x, y, TS, TS);

    // 3D bevel
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, TS, 3);
    ctx.fillRect(x, y, 3, TS);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + TS - 3, TS, 3);
    ctx.fillRect(x + TS - 3, y, 3, TS);

    // Cracks based on damage
    if (frac < 0.95) {
      this._drawCracks(ctx, x, y, c, r, frac);
    }

    // Color overlay for damage state
    if (frac < 0.66) {
      ctx.fillStyle = `rgba(255,100,0,${0.15 * (1 - frac)})`;
      ctx.fillRect(x, y, TS, TS);
    }
  }

  _drawCracks(ctx, x, y, c, r, frac) {
    const key = `${c}_${r}`;
    if (!this.crackSeeds[key]) {
      this.crackSeeds[key] = (c * 1731 + r * 9173) % 10000;
    }
    const seed = this.crackSeeds[key];
    const numCracks = frac > 0.66 ? 2 : frac > 0.33 ? 4 : 7;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TS, TS);
    ctx.clip();

    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;

    const rng = seededRng(seed);
    for (let i = 0; i < numCracks; i++) {
      const sx = x + rng() * TS;
      const sy = y + rng() * TS;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      let cx2 = sx, cy2 = sy;
      for (let j = 0; j < 3; j++) {
        cx2 += (rng() - 0.4) * TS * 0.5;
        cy2 += (rng() - 0.4) * TS * 0.5;
        ctx.lineTo(cx2, cy2);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawAcidBase(ctx, x, y) {
    const th = this.theme;
    ctx.fillStyle = th.acid;
    ctx.fillRect(x, y, TS, TS);
    // Border glow
    ctx.strokeStyle = '#44FF4488';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
  }

  _drawRefuelBase(ctx, x, y) {
    const th = this.theme;
    ctx.fillStyle = th.refuel;
    ctx.fillRect(x, y, TS, TS);
    ctx.strokeStyle = '#4488FF88';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
    // REFUEL text
    ctx.fillStyle = '#4488FFCC';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FUEL', x + TS / 2, y + TS / 2);
  }

  _drawGlass(ctx, x, y) {
    ctx.fillStyle = 'rgba(100,180,220,0.25)';
    ctx.fillRect(x, y, TS, TS);
    ctx.strokeStyle = 'rgba(150,220,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
    // Reflection line
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + TS - 10, y + 10);
    ctx.stroke();
  }

  _drawDebris(ctx, x, y, c, r) {
    this._drawFloor(ctx, x, y, c, r);
    const rng = seededRng(c * 37 + r * 53);
    // Scattered rubble pieces
    ctx.fillStyle = 'rgba(80,60,40,0.7)';
    for (let i = 0; i < 5; i++) {
      const px = x + rng() * TS;
      const py = y + rng() * TS;
      const sz = 3 + rng() * 6;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rng() * Math.PI * 2);
      ctx.fillRect(-sz/2, -sz/2, sz, sz * 0.6);
      ctx.restore();
    }
  }

  /** Re-render a single tile (after wall damage or destruction) */
  updateTile(tc, tr, tileType, hp) {
    if (this.tiles[tr]) this.tiles[tr][tc] = tileType;
    if (this.wallHP[tr]) this.wallHP[tr][tc] = hp ?? 0;

    const x = tc * TS;
    const y = tr * TS;
    this.arenaCtx.clearRect(x, y, TS, TS);
    this._drawTile(this.arenaCtx, tileType, x, y, tc, tr);
  }

  /** Add a burn mark at world position */
  addBurnMark(wx, wy, radius) {
    const ctx = this.burnCtx;
    const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.5, 'rgba(10,5,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(wx, wy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Add a skid mark point */
  addSkidMark(wx, wy, alpha, color) {
    const ctx = this.skidCtx;
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.12})`;
    ctx.beginPath();
    ctx.arc(wx, wy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw the arena to the given canvas context.
   * camX/camY are the top-left world coordinates of the viewport.
   */
  draw(ctx, camX, camY, time) {
    const vw = CONFIG.VIEWPORT_W;
    const vh = CONFIG.VIEWPORT_H;

    // Clamp camera
    camX = Math.max(0, Math.min(CONFIG.ARENA_WIDTH  - vw, camX));
    camY = Math.max(0, Math.min(CONFIG.ARENA_HEIGHT - vh, camY));

    // Draw pre-rendered arena
    ctx.drawImage(this.arenaCanvas, camX, camY, vw, vh, 0, 0, vw, vh);

    // Draw animated tile overlays (acid bubbles, refuel glow)
    this._drawAnimatedTiles(ctx, camX, camY, time);

    // Draw burn marks layer
    ctx.drawImage(this.burnCanvas, camX, camY, vw, vh, 0, 0, vw, vh);

    // Draw skid marks layer
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.skidCanvas, camX, camY, vw, vh, 0, 0, vw, vh);
    ctx.globalAlpha = 1;
  }

  _drawAnimatedTiles(ctx, camX, camY, time) {
    const ROWS = CONFIG.ARENA_ROWS;
    const COLS = CONFIG.ARENA_COLS;

    const startC = Math.max(0, Math.floor(camX / TS) - 1);
    const endC   = Math.min(COLS - 1, Math.ceil((camX + CONFIG.VIEWPORT_W) / TS) + 1);
    const startR = Math.max(0, Math.floor(camY / TS) - 1);
    const endR   = Math.min(ROWS - 1, Math.ceil((camY + CONFIG.VIEWPORT_H) / TS) + 1);

    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        const tile = this.tiles[r][c];
        const sx = c * TS - camX;
        const sy = r * TS - camY;

        if (tile === T.ACID) {
          this._animateAcid(ctx, sx, sy, time, c, r);
        } else if (tile === T.REFUEL) {
          this._animateRefuel(ctx, sx, sy, time);
        }
      }
    }
  }

  _animateAcid(ctx, sx, sy, time, c, r) {
    // Pulsing overlay
    const pulse = 0.5 + 0.2 * Math.sin(time * 2.5);
    ctx.fillStyle = `rgba(30,180,30,${pulse * 0.25})`;
    ctx.fillRect(sx, sy, TS, TS);

    // Random bubbles
    const rng = seededRng(Math.floor(time * 3) * 100 + c * 7 + r);
    for (let i = 0; i < 2; i++) {
      if (rng() > 0.6) {
        const bx = sx + rng() * TS;
        const by = sy + rng() * TS;
        const br = 2 + rng() * 3;
        ctx.strokeStyle = `rgba(60,220,60,${0.4 + rng() * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  _animateRefuel(ctx, sx, sy, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.0);
    // Pulsing blue glow
    ctx.fillStyle = `rgba(60,120,255,${pulse * 0.2})`;
    ctx.fillRect(sx, sy, TS, TS);
    // Border glow
    ctx.shadowColor = '#4488FF';
    ctx.shadowBlur  = 8 * pulse;
    ctx.strokeStyle = `rgba(80,150,255,${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TS - 2, TS - 2);
    ctx.shadowBlur = 0;
  }
}

// ── Utilities ─────────────────────────────────────────────────

function shadeColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
}

function seededRng(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
