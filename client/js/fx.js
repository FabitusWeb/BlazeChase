// client/js/fx.js — Particle system, flame-ribbon explosions, spiral smoke,
// shock rings, engine wakes — Chase Ace Deluxe visual style (from gameplay video):
// jagged flame ribbons + curling white smoke + multiple expanding rings

const TAU = Math.PI * 2;

export class FXSystem {
  constructor(arenaRenderer) {
    this.arena    = arenaRenderer;  // for addBurnMark / addSkidMark
    this.particles  = [];   // { x, y, vx, vy, life, maxLife, size, color, rot, rotVel, square }
    this.ribbons    = [];   // { pts:[[x,y]..], color, width, life, maxLife } — jagged flame streaks
    this.shockwaves = [];   // { x, y, radius, maxRadius, life, maxLife, lineWidth, color }
    this.flashes    = [];   // { x, y, radius, maxRadius, life, maxLife, color }
    this.fireballs  = [];   // { x, y, vx, vy, radius, maxRadius, life, maxLife }
    this.smoke      = [];   // { x, y, vx, vy, size, life, maxLife, tint, swirl }

    this.shakeX   = 0;
    this.shakeY   = 0;
    this._shakeDuration  = 0;
    this._shakeAmplitude = 0;
    this._shakeTime      = 0;
  }

  screenShake(duration, amplitude) {
    this._shakeDuration  = Math.max(this._shakeDuration,  duration);
    this._shakeAmplitude = Math.max(this._shakeAmplitude, amplitude);
    this._shakeTime      = 0;
  }

  spawnExplosion(wx, wy, size, shipColor) {
    switch (size) {
      case 'small':  this._spawnSmall(wx, wy, shipColor);  break;
      case 'medium': this._spawnMedium(wx, wy, shipColor); break;
      case 'large':  this._spawnLarge(wx, wy, shipColor);  break;
    }
  }

  // ── Fireball cluster: only the bright core now (video shows ribbons,
  //    not round blobs — keep few, small, additive) ──
  _spawnFireballs(wx, wy, count, maxRadius, spread) {
    for (let i = 0; i < count; i++) {
      const angle  = Math.random() * TAU;
      const dist   = Math.random() * spread;
      const speed  = 15 + Math.random() * 40;
      const maxR   = maxRadius * (0.5 + Math.random() * 0.7);
      const maxLife = 0.28 + Math.random() * 0.18;
      this.fireballs.push({
        x: wx + Math.cos(angle) * dist,
        y: wy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: maxR * 0.25,
        maxRadius: maxR,
        life: maxLife,
        maxLife,
      });
    }
  }

  // ── Curling smoke (spiral wisps that linger, Chase Ace signature) ──
  _spawnSmokeBurst(wx, wy, count, spread) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const dist  = Math.random() * spread;
      const speed = 30 + Math.random() * 60;
      const maxLife = 1.2 + Math.random() * 1.0;
      this.smoke.push({
        x: wx + Math.cos(angle) * dist,
        y: wy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        size: 4 + Math.random() * 7,
        life: maxLife,
        maxLife,
        tint: 0.55 + Math.random() * 0.3,
        swirl: (Math.random() - 0.5) * 6,   // rad/s — curls the trajectory
      });
    }
  }

  /** Persistent wiggly smoke trail behind missiles (per frame). */
  spawnSmokeTrail(wx, wy) {
    this.smoke.push({
      x: wx + (Math.random() - 0.5) * 4,
      y: wy + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14 - 4,
      size: 3 + Math.random() * 3.5,
      life: 0.9 + Math.random() * 0.5,
      maxLife: 1.4,
      tint: 0.6 + Math.random() * 0.2,
      swirl: (Math.random() - 0.5) * 4,
    });
  }

  /** Small expanding white ring behind mortar shells (per frame). */
  spawnRingTrail(wx, wy) {
    this.shockwaves.push({
      x: wx, y: wy, radius: 2, maxRadius: 11,
      life: 0.28, maxLife: 0.28, lineWidth: 1.3, color: '#E8F0FF',
    });
  }

  /** White wiggly engine wake behind a thrusting ship (per frame). */
  spawnExhaust(wx, wy, angle, color) {
    const bx = wx - Math.cos(angle) * (CONFIG.SHIP_RADIUS + 4);
    const by = wy - Math.sin(angle) * (CONFIG.SHIP_RADIUS + 4);
    // White wake wisp (Chase Ace style: curling white smoke behind ships)
    this.smoke.push({
      x: bx + (Math.random() - 0.5) * 4,
      y: by + (Math.random() - 0.5) * 4,
      vx: -Math.cos(angle) * (30 + Math.random() * 25) + (Math.random() - 0.5) * 20,
      vy: -Math.sin(angle) * (30 + Math.random() * 25) + (Math.random() - 0.5) * 20,
      size: 2.5 + Math.random() * 2.5,
      life: 0.5 + Math.random() * 0.35,
      maxLife: 0.85,
      tint: 0.75 + Math.random() * 0.2,
      swirl: (Math.random() - 0.5) * 8,
    });
    // Occasional hot core spark
    if (Math.random() < 0.3) {
      this.particles.push({
        x: bx, y: by,
        vx: -Math.cos(angle) * (70 + Math.random() * 40),
        vy: -Math.sin(angle) * (70 + Math.random() * 40),
        life: 0.12 + Math.random() * 0.1,
        maxLife: 0.22,
        size: 1.5 + Math.random() * 1.5,
        color: Math.random() < 0.5 ? '#FFDD88' : (color || '#FF8800'),
        square: false,
      });
    }
  }

  /** Muzzle flash when a new bullet appears. */
  spawnMuzzle(wx, wy, angle, color) {
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 14, life: 0.08, maxLife: 0.08, color: color || '#FFDD66' });
    for (let i = 0; i < 2; i++) {
      const a = angle + (Math.random() - 0.5) * 0.6;
      const speed = 120 + Math.random() * 80;
      this.particles.push({
        x: wx, y: wy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.1 + Math.random() * 0.08,
        maxLife: 0.18,
        size: 1.5 + Math.random() * 1.5,
        color: '#FFEEAA',
        square: false,
      });
    }
  }

  // ── SMALL: hit spark ─────────────────────────────────────
  _spawnSmall(wx, wy, color) {
    const num = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < num; i++) {
      const angle = Math.random() * TAU;
      const speed = 60 + Math.random() * 100;
      this.particles.push({
        x: wx, y: wy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.15,
        maxLife: 0.35,
        size: 2 + Math.random() * 2,
        color: color || '#FF8800',
        square: false,
      });
    }
    this._spawnFireballs(wx, wy, 2, 10, 5);
  }

  // ── MEDIUM: wall break / missile ─────────────────────────
  _spawnMedium(wx, wy, color) {
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 36, life: 0.16, maxLife: 0.16, color: '#FFFFFF' });

    // Core glow (small) + jagged flame ribbons (the Chase Ace look)
    this._spawnFireballs(wx, wy, 3, 18, 8);
    const numRibbons = 9 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numRibbons; i++) {
      const c = i % 3 === 0 ? '#FFCC44' : i % 3 === 1 ? '#FF7718' : '#FFB000';
      this._addRibbon(wx, wy, i, numRibbons, 55 + Math.random() * 35, 0.5, c, 3 + Math.random() * 2.5);
    }
    this._spawnSmokeBurst(wx, wy, 6, 10);

    // Bluish-white ring
    this.shockwaves.push({ x: wx, y: wy, radius: 5, maxRadius: 55, life: 0.4, maxLife: 0.4, lineWidth: 2, color: '#CFE8FF' });

    // Debris (square particles)
    const numDebris = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numDebris; i++) {
      const angle = Math.random() * TAU;
      const speed = 80 + Math.random() * 160;
      this.particles.push({
        x: wx, y: wy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        size: 3 + Math.random() * 5,
        color: color || '#885533',
        square: true,
        rot: Math.random() * TAU,
        rotVel: (Math.random() - 0.5) * 15,
      });
    }

    this.screenShake(0.15, 4);
    if (this.arena) this.arena.addBurnMark(wx, wy, 25);
  }

  // ── LARGE: ship death ────────────────────────────────────
  _spawnLarge(wx, wy, color) {
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 70, life: 0.16, maxLife: 0.16, color: '#FFFFFF' });
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 45, life: 0.24, maxLife: 0.24, color: '#FF8800' });

    // Core glow (small) + MANY long jagged flame ribbons spiralling out
    this._spawnFireballs(wx, wy, 5, 28, 14);
    const numRibbons = 16 + Math.floor(Math.random() * 5);
    const colors = ['#FF7718', '#FFCC44', '#FFB000', '#FF5510', '#FFE080', color || '#FF8800'];
    for (let i = 0; i < numRibbons; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      this._addRibbon(wx, wy, i, numRibbons, 85 + Math.random() * 55, 0.75, c, 3.5 + Math.random() * 3);
    }
    this._spawnSmokeBurst(wx, wy, 14, 20);

    // Double bluish-white ring (video: 2–3 concentric rings)
    this.shockwaves.push({ x: wx, y: wy, radius: 5, maxRadius: 80,  life: 0.5, maxLife: 0.5, lineWidth: 3,   color: '#CFE8FF' });
    this.shockwaves.push({ x: wx, y: wy, radius: 5, maxRadius: 120, life: 0.7, maxLife: 0.7, lineWidth: 1.5, color: '#8FB8E8' });

    // Lots of debris
    const numDebris = 16 + Math.floor(Math.random() * 6);
    for (let i = 0; i < numDebris; i++) {
      const angle = Math.random() * TAU;
      const speed = 100 + Math.random() * 200;
      this.particles.push({
        x: wx, y: wy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1.0,
        size: 4 + Math.random() * 7,
        color: (i % 3 === 0) ? (color || '#885533') : '#FFAA44',
        square: true,
        rot: Math.random() * TAU,
        rotVel: (Math.random() - 0.5) * 12,
      });
    }

    this.screenShake(0.3, 8);
    if (this.arena) this.arena.addBurnMark(wx, wy, 45);
  }

  /**
   * Jagged flame ribbon: 4–6 segments with random lateral jitter,
   * so the path looks ragged instead of a smooth curve.
   */
  _addRibbon(cx, cy, index, total, length, maxLife, color, baseWidth) {
    const baseAngle = (index / total) * TAU + (Math.random() - 0.5) * 0.5;
    const segs = 4 + Math.floor(Math.random() * 3);
    const pts = [[cx, cy]];
    let angle = baseAngle;
    let px = cx, py = cy;
    for (let s = 1; s <= segs; s++) {
      angle += (Math.random() - 0.5) * 0.9;           // jitter → ragged edge
      const segLen = (length / segs) * (0.7 + Math.random() * 0.6);
      px += Math.cos(angle) * segLen;
      py += Math.sin(angle) * segLen;
      pts.push([px, py]);
    }
    this.ribbons.push({
      pts,
      color,
      width: baseWidth ?? (2 + Math.random() * 2.5),
      life: maxLife + Math.random() * 0.1,
      maxLife,
    });
  }

  update(dt) {
    // Budget particelle (anti-lag su macchine deboli): scarta le più vecchie
    if (this.particles.length  > 400) this.particles.splice(0,  this.particles.length  - 400);
    if (this.smoke.length      > 250) this.smoke.splice(0,      this.smoke.length      - 250);
    if (this.ribbons.length    > 120) this.ribbons.splice(0,    this.ribbons.length    - 120);
    if (this.fireballs.length  >  60) this.fireballs.splice(0,  this.fireballs.length  -  60);
    if (this.shockwaves.length >  40) this.shockwaves.splice(0, this.shockwaves.length -  40);

    // Screen shake
    if (this._shakeDuration > 0) {
      this._shakeDuration -= dt;
      this._shakeTime     += dt;
      const frac = Math.max(0, this._shakeDuration / Math.max(0.01, this._shakeDuration + dt));
      const amp  = this._shakeAmplitude * frac;
      this.shakeX = Math.sin(this._shakeTime * 40) * amp;
      this.shakeY = Math.cos(this._shakeTime * 37) * amp;
      if (this._shakeDuration <= 0) {
        this._shakeAmplitude = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }

    // Particles
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;  // slight gravity
      p.vx *= 0.97;
      if (p.rot !== undefined) p.rot += (p.rotVel || 0) * dt;
      return true;
    });

    // Fireballs: expand fast, fade out
    this.fireballs = this.fireballs.filter(f => {
      f.life -= dt;
      if (f.life <= 0) return false;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.92;
      f.vy *= 0.92;
      const frac = 1 - f.life / f.maxLife;
      f.radius = f.maxRadius * (0.25 + 0.75 * Math.min(1, frac * 2.5));
      return true;
    });

    // Smoke: drift with swirl (curling wisps), expand, fade slowly
    this.smoke = this.smoke.filter(s => {
      s.life -= dt;
      if (s.life <= 0) return false;
      if (s.swirl) {
        // Rotate velocity → spiral path
        const w = s.swirl * dt;
        const cos = Math.cos(w), sin = Math.sin(w);
        const vx = s.vx * cos - s.vy * sin;
        const vy = s.vx * sin + s.vy * cos;
        s.vx = vx; s.vy = vy;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.97;
      s.vy *= 0.97;
      s.size += 10 * dt;   // puffs grow as they dissipate
      return true;
    });

    // Ribbons
    this.ribbons = this.ribbons.filter(r => { r.life -= dt; return r.life > 0; });

    // Shockwaves
    this.shockwaves = this.shockwaves.filter(s => {
      s.life -= dt;
      if (s.life <= 0) return false;
      const frac = 1 - s.life / s.maxLife;
      s.radius = s.maxRadius * frac;
      return true;
    });

    // Flashes
    this.flashes = this.flashes.filter(f => {
      f.life -= dt;
      if (f.life <= 0) return false;
      f.radius = f.maxRadius * (1 - f.life / f.maxLife);
      return true;
    });
  }

  draw(ctx, camX, camY) {
    // ── Additive layer: flashes + fireballs ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const f of this.flashes) {
      const alpha = f.life / f.maxLife;
      const sx = f.x - camX;
      const sy = f.y - camY;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, f.radius);
      grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(0.5, `rgba(255,200,100,${alpha * 0.5})`);
      grad.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, f.radius, 0, TAU);
      ctx.fill();
    }

    for (const f of this.fireballs) {
      const frac  = f.life / f.maxLife;
      const alpha = Math.min(1, frac * 2.2);
      const sx = f.x - camX;
      const sy = f.y - camY;
      const r = Math.max(1, f.radius);
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0,    `rgba(255,255,230,${alpha})`);
      grad.addColorStop(0.3,  `rgba(255,220,90,${alpha * 0.9})`);
      grad.addColorStop(0.65, `rgba(255,120,10,${alpha * 0.55})`);
      grad.addColorStop(1,    'rgba(120,20,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // ── Jagged flame ribbons (polyline, ragged) ──
    for (const r of this.ribbons) {
      const frac  = r.life / r.maxLife;
      const alpha = Math.min(1, frac * 2.5) * frac;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth   = r.width * (0.4 + frac * 0.6);
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(r.pts[0][0] - camX, r.pts[0][1] - camY);
      for (let i = 1; i < r.pts.length; i++) {
        ctx.lineTo(r.pts[i][0] - camX, r.pts[i][1] - camY);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Smoke (curling wisps, normal blending) ──
    for (const s of this.smoke) {
      const frac  = s.life / s.maxLife;
      const alpha = Math.min(0.5, frac * 0.65);
      const v = Math.round(s.tint * 255);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 8)})`;
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ── Shock rings (bluish-white) ──
    for (const s of this.shockwaves) {
      const alpha = (s.life / s.maxLife) * 0.75;
      ctx.save();
      ctx.globalAlpha  = alpha;
      ctx.strokeStyle  = s.color || '#FFAA44';
      ctx.lineWidth    = s.lineWidth * (s.life / s.maxLife);
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // ── Particles ──
    for (const p of this.particles) {
      const alpha = Math.min(1, (p.life / p.maxLife) * 2);
      const sx = p.x - camX;
      const sy = p.y - camY;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.square) {
        ctx.translate(sx, sy);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, p.size / 2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Draw bullets as CA-style bolts: elongated body along velocity, bright core */
  drawBullets(ctx, bullets, camX, camY) {
    for (const b of bullets) {
      const wDef  = CONFIG.WEAPONS[b.weapon] || CONFIG.WEAPONS[0];
      const color = wDef.color;
      const sx = b.x - camX;
      const sy = b.y - camY;

      const speed = Math.hypot(b.vx, b.vy);
      const nx = speed > 0 ? b.vx / speed : 1;
      const ny = speed > 0 ? b.vy / speed : 0;

      // Bolt: elongated body along the direction of travel
      const len  = b.size * 3.2;
      const w    = Math.max(2, b.size * 0.75);
      const tailX = sx - nx * len;
      const tailY = sy - ny * len;

      ctx.save();
      ctx.lineCap = 'round';
      // Outer glow edge
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = w * 1.7;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      // Bright core
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = w * 0.55;
      ctx.beginPath();
      ctx.moveTo(sx - nx * len * 0.55, sy - ny * len * 0.55);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      // Plasma special glow
      if (b.weapon === 5) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, b.size * 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * Draw hazard objects from state: turrets (with rotating barrel), mines,
   * black holes (from arena data), energy wave front.
   */
  drawHazards(ctx, state, camX, camY, time) {
    const TSR = CONFIG.TILE_SIZE;

    // ── Black holes (static, from arena data) ──
    const bhs = this.arena?.arenaData?.hazards?.blackholes || [];
    for (const bh of bhs) {
      const sx = bh.x - camX;
      const sy = bh.y - camY;
      // Accretion ring (rotating arcs)
      for (let i = 0; i < 3; i++) {
        const a0 = time * (0.9 + i * 0.3) + i * 2.0;
        ctx.save();
        ctx.globalAlpha = 0.7 - i * 0.18;
        ctx.strokeStyle = i === 0 ? '#BB66FF' : '#6633CC';
        ctx.lineWidth = 2.5 - i * 0.6;
        ctx.beginPath();
        ctx.arc(sx, sy, 26 + i * 8, a0, a0 + Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      }
      // Event horizon (dark core)
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(0.75, '#05010F');
      grad.addColorStop(1, 'rgba(80,40,160,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, TAU);
      ctx.fill();
    }

    // ── Mines (blinking red when armed) ──
    for (const m of state.mines || []) {
      const sx = m.x - camX;
      const sy = m.y - camY;
      ctx.save();
      ctx.fillStyle = '#2A2A30';
      ctx.strokeStyle = '#555560';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // Spikes
      ctx.strokeStyle = '#444450';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7);
        ctx.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10);
        ctx.stroke();
      }
      if (m.armed) {
        const blink = Math.sin(time * 8) > 0 ? 1 : 0.25;
        ctx.fillStyle = `rgba(255,40,40,${blink})`;
        ctx.shadowColor = '#FF2222';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Turrets (mount + dome + rotating barrel) ──
    for (const t of state.turrets || []) {
      const sx = t.x - camX;
      const sy = t.y - camY;
      ctx.save();
      if (!t.alive) ctx.globalAlpha = 0.35;
      // Mount plate
      ctx.fillStyle = '#22242C';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.fillRect(sx - 14, sy - 14, 28, 28);
      ctx.strokeRect(sx - 14, sy - 14, 28, 28);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeRect(sx - 12.5, sy - 12.5, 25, 25);
      // Barrel (rotates toward target angle)
      const barrelColor = t.type === 'mortar' ? '#FFCC44' : '#FF8844';
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(t.angle || 0);
      ctx.fillStyle = barrelColor;
      ctx.fillRect(0, -3.5, 20, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, -3.5, 20, 2);
      ctx.restore();
      // Dome
      const dome = ctx.createRadialGradient(sx - 3, sy - 3, 1, sx, sy, 10);
      dome.addColorStop(0, '#C8CCD8');
      dome.addColorStop(0.6, t.type === 'mortar' ? '#8A7440' : '#8A5040');
      dome.addColorStop(1, '#2A2028');
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.stroke();
      // HP arc when damaged
      const maxHp = CONFIG.HAZARDS.TURRET_MISSILE.HP;
      if (t.alive && t.hp < maxHp) {
        ctx.strokeStyle = '#FF5544';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 13, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, t.hp / maxHp));
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Energy wave front ──
    if (state.wave) {
      const isX = state.wave.axis === 'x';
      const pos = isX ? state.wave.pos - camX : state.wave.pos - camY;
      ctx.save();
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = i === 0 ? 'rgba(120,220,255,0.9)' : 'rgba(255,255,255,0.7)';
        ctx.lineWidth = i === 0 ? 6 : 2;
        ctx.shadowColor = '#66CCFF';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        if (isX) { ctx.moveTo(pos, 0); ctx.lineTo(pos, CONFIG.VIEWPORT_H); }
        else     { ctx.moveTo(0, pos); ctx.lineTo(CONFIG.VIEWPORT_W, pos); }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Draw floating power-ups */
  drawPowerups(ctx, powerups, camX, camY, time) {    for (const p of powerups) {
      const def = CONFIG.POWERUPS[p.typeId] || CONFIG.POWERUPS[0];
      const sx = p.x - camX;
      const sy = p.y - camY + Math.sin(p.bobPhase + time * 2) * 4;
      const color = def.color;

      ctx.save();
      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur  = 12;

      // Rotating outer ring
      ctx.strokeStyle = color + 'aa';
      ctx.lineWidth   = 1.5;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(time * 1.2);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = (i % 2 === 0) ? 14 : 10;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Background circle
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, TAU);
      ctx.fill();

      // Icon letter
      ctx.fillStyle = color;
      ctx.font      = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 6;
      ctx.fillText(def.icon, sx, sy);

      ctx.restore();
    }
  }
}
