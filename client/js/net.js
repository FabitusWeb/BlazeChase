// client/js/net.js — WebSocket client, state interpolation

export class NetClient {
  constructor() {
    this.ws         = null;
    this.connected  = false;
    this.handlers   = {};

    // Interpolation buffer: ring of last 2 full state snapshots
    this.stateBuffer = [];   // [{tick, timestamp, players, bullets, powerups}]

    this.myId       = null;

    // Auto-reconnect (F5b): un drop del proxy non deve buttare fuori il giocatore
    this.autoReconnect = true;
    this._reconnectAttempts = 0;
    this._manualClose = false;
  }

  connect() {
    this._manualClose = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url   = `${proto}://${location.host}`;

    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      this._emit('connected');
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this._emit('disconnected');
      if (this.autoReconnect && !this._manualClose) {
        this._reconnectAttempts++;
        const delay = Math.min(500 * Math.pow(2, this._reconnectAttempts - 1), 5000);
        this._emit('reconnecting', { attempt: this._reconnectAttempts, delay });
        setTimeout(() => {
          if (!this.connected) this.connect();
        }, delay);
      }
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

  /** Intentional close: no auto-reconnect after this. */
  close() {
    this._manualClose = true;
    if (this.ws) this.ws.close();
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'ping':
        this.send({ type: 'pong' });
        return;
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

    // Interpolate player positions — la nave locale usa lo stato più
    // recente SENZA interpolazione (niente lag percepito sui comandi)
    const players = prev.players.map((pp, i) => {
      const np = next.players.find(p => p.id === pp.id) || pp;
      if (np.id === this.myId) return { ...np };
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
      return true;
    }
    return false;
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
