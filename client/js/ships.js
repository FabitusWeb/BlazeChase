// client/js/ships.js — Procedural cartoon ship drawing

const TAU = Math.PI * 2;

// Ship polygon definitions (in local space, nose pointing up = -Y)
// Each ship: { body: [[x,y],...], wings: [[x,y],...], cockpit: {cx,cy,rx,ry} }
const SHIP_SHAPES = [
  // 0 VIPER — sleek triangle
  {
    body:    [[ 0,-18],[10,12],[ 5,8],[-5,8],[-10,12]],
    wings:   [[-10,4],[-18,14],[-5,14], [10,4],[18,14],[5,14]],
    cockpit: { cx:0, cy:-6, rx:4, ry:5 },
    engine:  { x:0, y:14, rx:4, ry:3 },
  },
  // 1 HORNET — small body, big angular wings
  {
    body:    [[ 0,-16],[7,8],[3,12],[-3,12],[-7,8]],
    wings:   [[-7,2],[-22,16],[-8,16], [7,2],[22,16],[8,16]],
    cockpit: { cx:0, cy:-7, rx:3, ry:4 },
    engine:  { x:0, y:12, rx:3, ry:2.5 },
  },
  // 2 TITAN — wide trapezoid
  {
    body:    [[ 0,-15],[14,8],[12,14],[-12,14],[-14,8]],
    wings:   [[-14,4],[-18,14],[-12,14], [14,4],[18,14],[12,14]],
    cockpit: { cx:0, cy:-4, rx:5, ry:6 },
    engine:  { x:-5, y:14, rx:3, ry:3 },  // dual engine
    engine2: { x: 5, y:14, rx:3, ry:3 },
  },
  // 3 PHANTOM — diamond/elongated
  {
    body:    [[ 0,-20],[8,0],[5,14],[-5,14],[-8,0]],
    wings:   [[-8,-2],[-14,8],[-5,14], [8,-2],[14,8],[5,14]],
    cockpit: { cx:0, cy:-10, rx:3, ry:5 },
    engine:  { x:0, y:14, rx:3.5, ry:2.5 },
  },
  // 4 BLAZE — arrow with fins
  {
    body:    [[ 0,-18],[9,6],[7,14],[-7,14],[-9,6]],
    wings:   [[-9,4],[-16,10],[-9,14],[9,4],[16,10],[9,14]],
    cockpit: { cx:0, cy:-7, rx:4, ry:5 },
    engine:  { x:0, y:14, rx:4, ry:3 },
  },
];

/**
 * Draw a ship at world position (after camera transform has been applied externally).
 * sx, sy = screen position
 */
export function drawShip(ctx, shipData, def, time, camX, camY) {
  const sx = shipData.x - camX;
  const sy = shipData.y - camY;

  if (!shipData.alive) return;

  const shape = SHIP_SHAPES[shipData.shipId || 0] || SHIP_SHAPES[0];
  const color  = def.color;
  const accent = def.accent;
  const angle  = shipData.angle + Math.PI / 2;  // nose points "up" in local space → +Y in world

  // Blink when invulnerable (respawn protection)
  if (shipData.invulnerable) {
    if (Math.floor(time * 8) % 2 === 0) return;
  }

  // Draw dash afterimages
  if (shipData.dashing) {
    for (let i = 1; i <= 3; i++) {
      const ox = Math.cos(shipData.angle - Math.PI) * i * 12;
      const oy = Math.sin(shipData.angle - Math.PI) * i * 12;
      ctx.save();
      ctx.globalAlpha = 0.2 / i;
      ctx.translate(sx + ox, sy + oy);
      ctx.rotate(angle);
      _drawShipBody(ctx, shape, color, accent, false);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);

  // Slight tilt during turns
  if (Math.abs(shipData.angularVel || 0) > 0.1) {
    const tilt = (shipData.angularVel || 0) * 0.08;
    ctx.transform(1, 0, tilt, 1, 0, 0);
  }

  // Shadow
  ctx.save();
  ctx.translate(3, 3);
  ctx.globalAlpha = 0.3;
  _drawShipBody(ctx, shape, '#000000', '#000000', false, true);
  ctx.restore();

  // Main ship
  const hitFlash = (shipData.hitFlashTimer || 0) > 0;
  _drawShipBody(ctx, shape, hitFlash ? '#ffffff' : color, hitFlash ? '#dddddd' : accent, true, false, shipData, time);

  ctx.restore();

  // Shield ring on hit
  if ((shipData.hitFlashTimer || 0) > 0) {
    const prog = Math.min(1, shipData.hitFlashTimer / 0.15);
    const ringR = CONFIG.SHIP_RADIUS * 1.8 * (1 + (1 - prog) * 0.5);
    ctx.save();
    ctx.globalAlpha = prog * 0.8;
    ctx.strokeStyle = '#88CCFF';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#88CCFF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Player name above ship
  ctx.save();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.fillText(shipData.name || '', sx, sy - CONFIG.SHIP_RADIUS - 6);
  ctx.restore();
}

function _drawShipBody(ctx, shape, color, accent, drawDetails, shadowOnly, shipData, time) {
  const t = time || 0;

  // Wings first (behind body)
  if (shape.wings) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    const wpts = shape.wings;
    // Draw in two halves (left wing, right wing)
    const half = wpts.length / 2;
    ctx.moveTo(wpts[0][0], wpts[0][1]);
    for (let i = 1; i < half; i++) ctx.lineTo(wpts[i][0], wpts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(wpts[half][0], wpts[half][1]);
    for (let i = half + 1; i < wpts.length; i++) ctx.lineTo(wpts[i][0], wpts[i][1]);
    ctx.closePath();
    ctx.fill();
    if (!shadowOnly) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Main body
  ctx.beginPath();
  const pts = shape.body;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (!shadowOnly) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (!drawDetails || shadowOnly) return;

  // Engine glow (behind ship)
  const engAlpha = shipData?.thrusting ? 0.8 + 0.2 * Math.sin(t * 20) : 0.3 + 0.1 * Math.sin(t * 5);
  const engScale = shipData?.thrusting ? 1.5 : 1.0;
  _drawEngine(ctx, shape.engine, accent, engAlpha, engScale, t);
  if (shape.engine2) _drawEngine(ctx, shape.engine2, accent, engAlpha, engScale, t);

  // Cockpit
  const ck = shape.cockpit;
  const grad = ctx.createRadialGradient(ck.cx - 1, ck.cy - 2, 0, ck.cx, ck.cy, Math.max(ck.rx, ck.ry));
  grad.addColorStop(0, 'rgba(220,240,255,0.95)');
  grad.addColorStop(0.6, 'rgba(140,200,255,0.6)');
  grad.addColorStop(1, 'rgba(40,80,140,0.4)');
  ctx.beginPath();
  ctx.ellipse(ck.cx, ck.cy, ck.rx, ck.ry, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,240,255,0.6)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Wing tip lights
  if (shape.wings) {
    const wpts = shape.wings;
    const half = wpts.length / 2;
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,80,80,${pulse})`;
    ctx.beginPath();
    ctx.arc(wpts[half - 1][0], wpts[half - 1][1], 2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wpts[wpts.length - 1][0], wpts[wpts.length - 1][1], 2, 0, TAU);
    ctx.fill();
  }
}

function _drawEngine(ctx, eng, color, alpha, scale, t) {
  if (!eng) return;
  const flameLen = (10 + 6 * Math.sin(t * 25)) * scale;
  const grad = ctx.createRadialGradient(eng.x, eng.y, 0, eng.x, eng.y + flameLen / 2, flameLen);
  grad.addColorStop(0, `rgba(255,255,200,${alpha})`);
  grad.addColorStop(0.3, `rgba(255,160,60,${alpha * 0.8})`);
  grad.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(eng.x, eng.y + flameLen / 3, eng.rx * scale, flameLen / 2, 0, 0, TAU);
  ctx.fill();
}

/**
 * Draw a small ship preview for the lobby ship selection UI.
 */
export function drawShipPreview(ctx, shipId, cx, cy, time) {
  const shape = SHIP_SHAPES[shipId] || SHIP_SHAPES[0];
  const def   = CONFIG.SHIPS[shipId] || CONFIG.SHIPS[0];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 2);  // face right in preview
  _drawShipBody(ctx, shape, def.color, def.accent, true, false,
    { thrusting: false, angularVel: 0, hitFlashTimer: 0, invulnerable: false }, time);
  ctx.restore();
}
