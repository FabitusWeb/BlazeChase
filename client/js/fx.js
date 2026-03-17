// client/js/fx.js — Particle system, ribbon explosions, screen shake, skid marks

const TAU = Math.PI * 2;

export class FXSystem {
  constructor(arenaRenderer) {
    this.arena    = arenaRenderer;  // for addBurnMark / addSkidMark
    this.particles  = [];   // { x, y, vx, vy, life, maxLife, size, color, spin, rotVel, square }
    this.ribbons    = [];   // { cx, cy, segs:[{px,py,cpx,cpy}], color, width, life, maxLife }
    this.shockwaves = [];   // { x, y, radius, maxRadius, life, maxLife, lineWidth }
    this.flashes    = [];   // { x, y, radius, maxRadius, life, maxLife, color }

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
  }

  // ── MEDIUM: wall break / missile ─────────────────────────
  _spawnMedium(wx, wy, color) {
    // Flash
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 40, life: 0.2, maxLife: 0.2, color: '#FFFFFF' });

    // Ribbons (12-16)
    const numRibbons = 12 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numRibbons; i++) {
      this._addRibbon(wx, wy, i, numRibbons, 50 + Math.random() * 30, 0.45, i < 5 ? '#FF6600' : (i < 9 ? '#FFCC00' : '#FFFFFF'));
    }

    // Shockwave
    this.shockwaves.push({ x: wx, y: wy, radius: 5, maxRadius: 55, life: 0.4, maxLife: 0.4, lineWidth: 2 });

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

    // Burn mark
    if (this.arena) this.arena.addBurnMark(wx, wy, 25);
  }

  // ── LARGE: ship death ────────────────────────────────────
  _spawnLarge(wx, wy, color) {
    // Big flash
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 80, life: 0.18, maxLife: 0.18, color: '#FFFFFF' });
    this.flashes.push({ x: wx, y: wy, radius: 0, maxRadius: 50, life: 0.25, maxLife: 0.25, color: '#FF8800' });

    // Many ribbons (24-28)
    const numRibbons = 24 + Math.floor(Math.random() * 5);
    const colors = ['#FF6600', '#FF6600', '#FFCC00', '#FFCC00', '#FFFFFF', '#FF4400', color || '#FF8800'];
    for (let i = 0; i < numRibbons; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      this._addRibbon(wx, wy, i, numRibbons, 70 + Math.random() * 40, 0.7, c, 4 + Math.random() * 3);
    }

    // Double shockwave
    this.shockwaves.push({ x: wx, y: wy, radius: 5, maxRadius: 80, life: 0.5, maxLife: 0.5, lineWidth: 3 });
    this.shockwaves.push({ x: wx, y: wy, radius: 5, maxRadius: 120, life: 0.7, maxLife: 0.7, lineWidth: 1.5 });

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

    // Large burn mark
    if (this.arena) this.arena.addBurnMark(wx, wy, 45);
  }

  _addRibbon(cx, cy, index, total, length, maxLife, color, baseWidth) {
    const angle = (index / total) * TAU + (Math.random() - 0.5) * 0.4;
    const curveAngle = angle + (Math.random() - 0.5) * 1.2;
    const curveLen   = length * (0.5 + Math.random() * 0.7);
    const tipX = cx + Math.cos(angle) * length;
    const tipY = cy + Math.sin(angle) * length;
    const cpX  = cx + Math.cos(curveAngle) * curveLen;
    const cpY  = cy + Math.sin(curveAngle) * curveLen;

    this.ribbons.push({
      cx, cy,
      tipX, tipY,
      cpX, cpY,
      color,
      width: baseWidth ?? (2 + Math.random() * 2.5),
      life: maxLife + Math.random() * 0.1,
      maxLife,
    });
  }

  update(dt) {
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
    // Flashes
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

    // Ribbons
    for (const r of this.ribbons) {
      const frac  = r.life / r.maxLife;
      const alpha = Math.min(1, frac * 3) * frac;
      const w     = r.width * frac;
      const cx = r.cx - camX;
      const cy = r.cy - camY;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth   = w;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(
        r.cpX - camX, r.cpY - camY,
        r.tipX - camX, r.tipY - camY
      );
      ctx.stroke();
      ctx.restore();
    }

    // Shockwaves
    for (const s of this.shockwaves) {
      const alpha = (s.life / s.maxLife) * 0.7;
      ctx.save();
      ctx.globalAlpha  = alpha;
      ctx.strokeStyle  = '#FFAA44';
      ctx.lineWidth    = s.lineWidth * (s.life / s.maxLife);
      ctx.shadowColor  = '#FF6600';
      ctx.shadowBlur   = 6;
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Particles
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

  /** Draw bullet trails for all bullets in the current state */
  drawBullets(ctx, bullets, camX, camY) {
    for (const b of bullets) {
      const wDef  = CONFIG.WEAPONS[b.weapon] || CONFIG.WEAPONS[0];
      const color = wDef.color;
      const sx = b.x - camX;
      const sy = b.y - camY;

      // Trail
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        const trailLen = b.size * 4;
        const nx = b.vx / speed;
        const ny = b.vy / speed;
        const grad = ctx.createLinearGradient(sx, sy, sx - nx * trailLen, sy - ny * trailLen);
        grad.addColorStop(0, color + 'cc');
        grad.addColorStop(1, color + '00');
        ctx.strokeStyle = grad;
        ctx.lineWidth   = b.size * 0.8;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - nx * trailLen, sy - ny * trailLen);
        ctx.stroke();
      }

      // Bullet body
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur  = b.size * 2;
      ctx.fillStyle   = color;
      ctx.beginPath();
      ctx.arc(sx, sy, b.size * 0.8, 0, TAU);
      ctx.fill();

      // Plasma special glow
      if (b.weapon === 5) {
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(sx, sy, b.size * 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Draw floating power-ups */
  drawPowerups(ctx, powerups, camX, camY, time) {
    for (const p of powerups) {
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
