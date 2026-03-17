// client/js/net.js — WebSocket client, state interpolation

export class NetClient {
  constructor() {
    this.ws         = null;
    this.connected  = false;
    this.handlers   = {};

    // Interpolation buffer: ring of last 2 full state snapshots
    this.stateBuffer = [];   // [{tick, timestamp, players, bullets, powerups}]

    this.myId       = null;
  }

  connect() {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const proto   = location.protocol === 'https:' ? 'wss' : 'ws';
    const host    = isLocal ? `localhost:${CONFIG.WS_PORT}` : location.host;
    const url     = `${proto}://${host}`;

    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this._emit('connected');
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this._emit('disconnected');
    });

    this.ws.addEventListener('error', (e) => {
      this._emit('error', e);
    });

    this.ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this._handleMessage(msg);
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        this.stateBuffer.push({ ...msg, timestamp: performance.now() });
        if (this.stateBuffer.length > 8) this.stateBuffer.shift();
        break;
      default:
        this._emit(msg.type, msg);
        break;
    }
  }

  /**
   * Get interpolated render state for the current time.
   * Uses a 100ms delay buffer so we always have two states to lerp between.
   */
  getInterpolatedState() {
    const now = performance.now() - CONFIG.INTERP_DELAY;
    if (this.stateBuffer.length < 1) return null;

    // Find the two snapshots straddling `now`
    let prev = this.stateBuffer[0];
    let next = this.stateBuffer[0];

    for (let i = 0; i < this.stateBuffer.length; i++) {
      if (this.stateBuffer[i].timestamp <= now) {
        prev = this.stateBuffer[i];
        next = this.stateBuffer[Math.min(i + 1, this.stateBuffer.length - 1)];
      }
    }

    if (prev === next) return prev;

    const t = prev.timestamp === next.timestamp ? 1 :
      Math.max(0, Math.min(1, (now - prev.timestamp) / (next.timestamp - prev.timestamp)));

    // Interpolate player positions
    const players = prev.players.map((pp, i) => {
      const np = next.players.find(p => p.id === pp.id) || pp;
      return {
        ...np,
        x:     lerp(pp.x, np.x, t),
        y:     lerp(pp.y, np.y, t),
        angle: lerpAngle(pp.angle, np.angle, t),
      };
    });

    return { ...next, players };
  }

  on(type, handler) {
    this.handlers[type] = this.handlers[type] || [];
    this.handlers[type].push(handler);
  }

  off(type, handler) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(h => h !== handler);
  }

  _emit(type, data) {
    const hs = this.handlers[type];
    if (hs) hs.forEach(h => h(data));
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  clearStateBuffer() {
    this.stateBuffer = [];
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
