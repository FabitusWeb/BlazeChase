// client/js/arena.js — Arena pre-renderer with offscreen canvases
// Visual style: Chase Ace — dark metal floor panels, riveted walls,
// yellow/black hazard stripes on wall edges facing open floor
// Con permesso degli autori (Biodome/Space Time Foam): tile originali CA
// per muri e casse distruttibili (fallback procedurale se non caricate)

const T = CONFIG.TILE;
const TS = CONFIG.TILE_SIZE;

// Sprite originali CA (caricati da main.js via loadTileSprites)
const TILE_SPRITES = { wall: null, crate: null };

export function loadTileSprites() {
  const load = (src) => new Promise((res) => {
    if (typeof Image === 'undefined') return res(null);   // Node/test env
    try {
      const img = new Image();
      img.onload  = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    } catch { res(null); }
  });
  return Promise.all([
    load('assets/tiles/wall_yellow2.png'),
    load('assets/tiles/crate.png'),
  ]).then(([wall, crate]) => {
    TILE_SPRITES.wall  = wall;
    TILE_SPRITES.crate = crate;
  });
}

export class ArenaRenderer {
  constructor(arenaData, resScale = 1) {
    this.arenaData  = arenaData;
    this.tiles      = arenaData.tiles;
    this.wallHP     = arenaData.wallHP || [];
    this.theme      = CONFIG.THEMES[arenaData.theme] || CONFIG.THEMES.INDUSTRIAL;
    this.resScale   = resScale;

    const W = CONFIG.ARENA_WIDTH;
    const H = CONFIG.ARENA_HEIGHT;

    // Offscreen canvases (HiDPI: risoluzione × resScale, coordinate logiche via transform)
    this.arenaCanvas = new OffscreenCanvas(W * resScale, H * resScale);
    this.arenaCtx    = this.arenaCanvas.getContext('2d');
    this.arenaCtx.setTransform(resScale, 0, 0, resScale, 0, 0);

    // Skid marks (accumulate, never cleared)
    this.skidCanvas  = new OffscreenCanvas(W * resScale, H * resScale);
    this.skidCtx     = this.skidCanvas.getContext('2d');
    this.skidCtx.setTransform(resScale, 0, 0, resScale, 0, 0);

    // Burn marks from explosions (accumulate)
    this.burnCanvas  = new OffscreenCanvas(W * resScale, H * resScale);
    this.burnCtx     = this.burnCanvas.getContext('2d');
    this.burnCtx.setTransform(resScale, 0, 0, resScale, 0, 0);

    // Track crack seed per destructible tile
    this.crackSeeds  = {};

    this._preRender();
  }

  _preRender() {
    const ctx = this.arenaCtx;
    const ROWS = CONFIG.ARENA_ROWS;
    const COLS = CONFIG.ARENA_COLS;

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
      case T.DOOR:
        // Base floor: the sliding metal slab is drawn per-frame (fx)
        this._drawFloor(ctx, x, y, c, r);
        break;
      case T.ONEWAY:
        this._drawOneWayBase(ctx, x, y);
        break;
    }
  }

  // ── Floor: deep space — starfield with faint nebula tint ──
  _drawFloor(ctx, x, y, c, r) {
    const th = this.theme;
    const rng = seededRng(c * 7919 + r * 104729);

    // Near-black space with a hint of theme-tinted depth
    const grad = ctx.createRadialGradient(
      x + TS * (0.3 + rng() * 0.4), y + TS * (0.3 + rng() * 0.4), 2,
      x + TS / 2, y + TS / 2, TS * 0.9
    );
    grad.addColorStop(0, shadeColor(th.floor, 0.16));
    grad.addColorStop(1, '#05060c');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, TS, TS);

    // Occasional faint nebula smudge (theme-colored, very subtle)
    if (rng() > 0.75) {
      const nx = x + rng() * TS;
      const ny = y + rng() * TS;
      const nr = 8 + rng() * 14;
      const neb = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      neb.addColorStop(0, hexA(th.floor, 0.10));
      neb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = neb;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, TAU);
      ctx.fill();
    }

    // Stars (1–4 per tile, seeded → stable across re-renders)
    const numStars = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < numStars; i++) {
      const sx = x + 2 + rng() * (TS - 4);
      const sy = y + 2 + rng() * (TS - 4);
      const bright = 0.35 + rng() * 0.6;
      const size = rng() > 0.85 ? 1.6 : 1;
      ctx.fillStyle = rng() > 0.8
        ? `rgba(180,200,255,${bright})`   // blue-white
        : `rgba(255,255,255,${bright})`;
      ctx.fillRect(sx, sy, size, size);
      // Cross sparkle on the brightest
      if (bright > 0.85) {
        ctx.fillStyle = `rgba(255,255,255,${bright * 0.35})`;
        ctx.fillRect(sx - 1.5, sy, 4, 1);
        ctx.fillRect(sx, sy - 1.5, 1, 4);
      }
    }
  }

  // ── Solid wall: sprite CA originale (fallback: metallo procedurale) ──
  _drawWallSolid(ctx, x, y, c, r) {
    const th = this.theme;
    const rng = seededRng(c * 31337 + r * 733);

    if (TILE_SPRITES.wall) {
      // Tile metallico originale Chase Ace
      ctx.drawImage(TILE_SPRITES.wall, x, y, TS, TS);
      // Leggera variazione di tono seeded per spezzare la ripetizione
      if (rng() > 0.6) {
        ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
        ctx.fillRect(x, y, TS, TS);
      }
    } else {
    // Base metal — cool blue-gray (Chase Ace Deluxe walls)
    const base = blendColor(th.wall, '#3a4a5c', 0.55);
    ctx.fillStyle = shadeColor(base, 0.95 + rng() * 0.1);
    ctx.fillRect(x, y, TS, TS);

    // Pillow bevel: soft light from top-left, shadow bottom-right
    const grad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, TS, TS);

    // Inner plate inset
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3.5, y + 3.5, TS - 7, TS - 7);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.strokeRect(x + 4.5, y + 4.5, TS - 9, TS - 9);

    // Vents or circular port on some tiles (seeded → stable)
    const feat = rng();
    if (feat > 0.72) {
      // Horizontal vent slots
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + 10, y + 12 + i * 7, TS - 20, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + 10, y + 12 + i * 7 - 1, TS - 20, 1);
      }
    } else if (feat > 0.5) {
      // Circular port
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + TS / 2, y + TS / 2, 7, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + TS / 2 - 1, y + TS / 2 - 1, 6, 0, TAU);
      ctx.stroke();
    }

    // Rivets at corners
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [rx, ry] of [[3, 3], [TS - 3, 3], [3, TS - 3], [TS - 3, TS - 3]]) {
      ctx.beginPath();
      ctx.arc(x + rx, y + ry, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const [rx, ry] of [[3, 3], [TS - 3, 3], [3, TS - 3], [TS - 3, TS - 3]]) {
      ctx.beginPath();
      ctx.arc(x + rx - 0.5, y + ry - 0.5, 0.8, 0, TAU);
      ctx.fill();
    }
    }

    // Hazard stripes on edges facing open floor (corner/edge trim)

    // Hazard stripes on edges facing open floor (corner/edge trim)
    const hz = 7;  // strip width
    if (this._isOpen(c, r - 1)) this._drawHazardStrip(ctx, x, y, TS, hz, true);          // top
    if (this._isOpen(c, r + 1)) this._drawHazardStrip(ctx, x, y + TS - hz, TS, hz, true); // bottom
    if (this._isOpen(c - 1, r)) this._drawHazardStrip(ctx, x, y, hz, TS, false);          // left
    if (this._isOpen(c + 1, r)) this._drawHazardStrip(ctx, x + TS - hz, y, hz, TS, false); // right
  }

  /** A tile ships can fly over (floor-like, hazard stripes face these). */
  _isOpen(c, r) {
    if (r < 0 || r >= CONFIG.ARENA_ROWS || c < 0 || c >= CONFIG.ARENA_COLS) return false;
    const t = this.tiles[r][c];
    return t === T.FLOOR || t === T.ACID || t === T.REFUEL || t === T.DEBRIS || t === T.WALL_DEST || t === T.DOOR;
  }

  /** Yellow/black diagonal hazard strip. */
  _drawHazardStrip(ctx, x, y, w, h, horizontal) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = '#151208';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const step = 11;
    if (horizontal) {
      for (let i = -h; i < w + h; i += step) {
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + h, y);
      }
    } else {
      for (let i = -w; i < h + w; i += step) {
        ctx.moveTo(x, y + i + w);
        ctx.lineTo(x + w, y + i);
      }
    }
    ctx.stroke();

    // Inner edge highlight toward the floor side
    ctx.restore();
  }

  // ── Destructible wall: cassa di legno CA originale (fallback: mattoni) ──
  _drawWallDest(ctx, x, y, c, r, hp) {
    const maxHp = CONFIG.WALL_DEST_HP;
    const frac  = hp / maxHp;  // 0=destroyed, 1=full
    const rng = seededRng(c * 4243 + r * 991);

    if (TILE_SPRITES.crate) {
      // Pavimento sotto la cassa (le casse CA stanno sullo sfondo)
      this._drawFloor(ctx, x, y, c, r);
      // Cassa originale Chase Ace, leggera rotazione seeded per varietà
      const rot = (rng() - 0.5) * 0.12;
      ctx.save();
      ctx.translate(x + TS / 2, y + TS / 2);
      ctx.rotate(rot);
      ctx.drawImage(TILE_SPRITES.crate, -TS / 2, -TS / 2, TS, TS);
      ctx.restore();
    } else {
    const BRICK = '#c8a820';
    const MORTAR = '#4a3a08';

    // Mortar background
    ctx.fillStyle = MORTAR;
    ctx.fillRect(x, y, TS, TS);

    // Two courses of bricks, offset (running bond)
    const bh = TS / 2;           // brick height
    const bw = TS / 2;           // brick width
    for (let course = 0; course < 2; course++) {
      const offset = course === 0 ? 0 : -bw / 2;
      for (let i = -1; i < 3; i++) {
        const bx = x + offset + i * bw;
        const by = y + course * bh;
        // Per-brick shade variation
        ctx.fillStyle = shadeColor(BRICK, 0.88 + rng() * 0.24);
        ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
        // Brick top light
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(bx + 1, by + 1, bw - 2, 2);
        // Brick bottom shade
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(bx + 1, by + bh - 3, bw - 2, 2);
      }
    }
    }

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

  // ── One-way wall: dark plate (chevron drawn animated per-frame) ──
  _drawOneWayBase(ctx, x, y) {
    ctx.fillStyle = '#181c26';
    ctx.fillRect(x, y, TS, TS);
    const grad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    grad.addColorStop(0, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, TS, TS);
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, TS - 3, TS - 3);
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
      ctx.rotate(rng() * TAU);
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

    // Adjacent solid walls may need hazard stripes added/removed
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = tc + dc, nr = tr + dr;
      if (nr < 0 || nr >= CONFIG.ARENA_ROWS || nc < 0 || nc >= CONFIG.ARENA_COLS) continue;
      if (this.tiles[nr][nc] === T.WALL_SOLID) {
        const nx = nc * TS, ny = nr * TS;
        this.arenaCtx.clearRect(nx, ny, TS, TS);
        this._drawTile(this.arenaCtx, T.WALL_SOLID, nx, ny, nc, nr);
      }
    }
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
    ctx.arc(wx, wy, radius, 0, TAU);
    ctx.fill();
  }

  /** Add a skid mark point */
  addSkidMark(wx, wy, alpha, color) {
    const ctx = this.skidCtx;
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.12})`;
    ctx.beginPath();
    ctx.arc(wx, wy, 2.5, 0, TAU);
    ctx.fill();
  }

  /**
   * Draw the arena to the given canvas context.
   * camX/camY are the top-left world coordinates of the viewport.
   */
  draw(ctx, camX, camY, time) {
    const vw = CONFIG.VIEWPORT_W;
    const vh = CONFIG.VIEWPORT_H;
    const s  = this.resScale;

    // Clamp camera
    camX = Math.max(0, Math.min(CONFIG.ARENA_WIDTH  - vw, camX));
    camY = Math.max(0, Math.min(CONFIG.ARENA_HEIGHT - vh, camY));

    // Draw pre-rendered arena (source rect scalato per HiDPI)
    ctx.drawImage(this.arenaCanvas, camX * s, camY * s, vw * s, vh * s, 0, 0, vw, vh);

    // Draw animated tile overlays (acid bubbles, refuel glow)
    this._drawAnimatedTiles(ctx, camX, camY, time);

    // Draw hazard overlays (gravity arrows, wormhole portals)
    this._drawHazardOverlays(ctx, camX, camY, time);

    // Draw burn marks layer
    ctx.drawImage(this.burnCanvas, camX * s, camY * s, vw * s, vh * s, 0, 0, vw, vh);

    // Draw skid marks layer
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.skidCanvas, camX * s, camY * s, vw * s, vh * s, 0, 0, vw, vh);
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
        ctx.arc(bx, by, br, 0, TAU);
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

  /** Animated overlays for point hazards: gravity arrows + wormhole portals */
  _drawHazardOverlays(ctx, camX, camY, time) {
    const hz = this.arenaData.hazards || {};
    const vw = CONFIG.VIEWPORT_W;
    const vh = CONFIG.VIEWPORT_H;

    // ── Gravity zones: pulsing chevrons ──
    for (const g of hz.gravity || []) {
      const sx = g.x - camX;
      const sy = g.y - camY;
      if (sx < -TS || sy < -TS || sx > vw + TS || sy > vh + TS) continue;
      const pulse = 0.45 + 0.3 * Math.sin(time * 3 + g.x * 0.05 + g.y * 0.07);
      const ang = Math.atan2(g.dy, g.dx);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#FFCC44';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const off = k * 7 - 3;
        const cxp = sx + Math.cos(ang) * off;
        const cyp = sy + Math.sin(ang) * off;
        ctx.beginPath();
        ctx.moveTo(cxp + Math.cos(ang - 2.4) * 8, cyp + Math.sin(ang - 2.4) * 8);
        ctx.lineTo(cxp, cyp);
        ctx.lineTo(cxp + Math.cos(ang + 2.4) * 8, cyp + Math.sin(ang + 2.4) * 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Wormhole portals: rotating swirl arcs ──
    const portalColors = { '1': '#44DDFF', '2': '#FF44DD' };
    for (const w of hz.wormholes || []) {
      const sx = w.x - camX;
      const sy = w.y - camY;
      if (sx < -TS * 2 || sy < -TS * 2 || sx > vw + TS * 2 || sy > vh + TS * 2) continue;
      const color = portalColors[w.id] || '#AA88FF';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        const a0 = time * (1.2 + i * 0.4) + i * 2.1;
        ctx.globalAlpha = 0.9 - i * 0.25;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 15 - i * 4, a0, a0 + Math.PI * 1.4);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────

const TAU = Math.PI * 2;

function shadeColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}

/** hex color + alpha → rgba() string */
function hexA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** blend two hex colors, t = weight of b (0..1) → rgb() string */
function blendColor(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
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
