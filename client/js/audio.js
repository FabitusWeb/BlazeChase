// client/js/audio.js — Procedural Web Audio API sounds (stile Chase Ace:
// spari distinti per arma, esplosioni juicy, engine hum, allarmi)

export class AudioManager {
  constructor() {
    this.ctx         = null;
    this.masterGain  = null;
    this._volume     = 0.5;
    this._initialized = false;
    // Engine hum (continuous, managed via engineSet)
    this._engineOsc  = null;
    this._engineGain = null;
    this._engineOn   = false;
  }

  init() {
    if (this._initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      this._initialized = true;
    } catch (e) {
      console.warn('Web Audio not available');
    }
  }

  _ensure() {
    if (!this._initialized) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Oscillator with frequency ramp + gain envelope. */
  _osc(type, f0, f1, dur, vol, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst. */
  _noise(dur, filterType, f0, f1, vol, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const sr = this.ctx.sampleRate;
    const frames = Math.ceil(sr * dur);
    const buf  = this.ctx.createBuffer(1, frames, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    src.start(t);
  }

  // ── Weapon fire (per-weapon presets, CA style) ────────────

  weaponFire(w) {
    if (!this._ensure()) return;
    switch (w) {
      case 0:  // BLASTER — zap secco
        this._osc('square', 800, 180, 0.06, 0.10);
        break;
      case 1:  // DOUBLE — doppio zap
        this._osc('square', 700, 200, 0.05, 0.08);
        this._osc('square', 650, 180, 0.05, 0.08, 0.05);
        break;
      case 2:  // SPREAD — paffuto
        this._noise(0.09, 'bandpass', 1200, 400, 0.12);
        this._osc('square', 400, 120, 0.08, 0.07);
        break;
      case 3:  // MISSILE — whoosh
        this._noise(0.3, 'lowpass', 2500, 300, 0.10);
        this._osc('sawtooth', 120, 420, 0.28, 0.06);
        break;
      case 4:  // MACHINE GUN — raffica
        this._osc('square', 520, 400, 0.03, 0.06);
        break;
      case 5:  // PLASMA — wobble profondo
        this._osc('sine', 180, 90, 0.22, 0.10);
        this._osc('sine', 240, 120, 0.18, 0.06, 0.02);
        break;
      case 6:  // MORTAR — thump
      case 7:  // MACRO MORTAR — thump grosso
        this._osc('sine', w === 7 ? 90 : 130, 45, 0.18, 0.14);
        this._noise(0.1, 'lowpass', 800, 200, 0.08);
        break;
      case 8:  // CHARGE ROCKET — fischio
        this._osc('sawtooth', 300, 900, 0.2, 0.06);
        this._noise(0.15, 'highpass', 1500, 3000, 0.04);
        break;
      case 9:  // LASER CANNON — zap acuto
        this._osc('sawtooth', 1400, 300, 0.05, 0.08);
        break;
      case 10: // MINES — clunk meccanico
        this._osc('square', 150, 60, 0.09, 0.10);
        this._noise(0.05, 'lowpass', 500, 150, 0.06);
        break;
      default:
        this._osc('square', 700, 150, 0.06, 0.10);
    }
  }

  // ── Engine hum (continuo, gestito da gameLoop) ────────────

  /** thrust: spinta attiva; turbo: boost attivo (alza il pitch). */
  engineSet(thrust, turbo) {
    if (!this._ensure()) return;
    if (!this._engineOsc) {
      this._engineOsc  = this.ctx.createOscillator();
      this._engineGain = this.ctx.createGain();
      this._engineOsc.type = 'sawtooth';
      this._engineOsc.frequency.value = 55;
      this._engineGain.gain.value = 0;
      // Lowpass per renderlo un rombo e non un sega
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      this._engineOsc.connect(filter);
      filter.connect(this._engineGain);
      this._engineGain.connect(this.masterGain);
      this._engineOsc.start();
      this._engineFilter = filter;
    }
    const t = this.ctx.currentTime;
    const targetGain  = thrust ? (turbo ? 0.075 : 0.045) : 0;
    const targetFreq  = turbo ? 95 : 55;
    const targetFil   = turbo ? 600 : 300;
    this._engineGain.gain.setTargetAtTime(targetGain, t, 0.06);
    this._engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.1);
    this._engineFilter.frequency.setTargetAtTime(targetFil, t, 0.1);
  }

  // ── Explosions (juicy, CA style) ──────────────────────────

  explosionSmall() {
    if (!this._ensure()) return;
    this._noise(0.12, 'bandpass', 2200, 800, 0.14);
  }

  explosionMedium() {
    if (!this._ensure()) return;
    this._noise(0.35, 'lowpass', 3000, 180, 0.28);
    this._osc('sine', 170, 45, 0.3, 0.18);
  }

  explosionLarge() {
    if (!this._ensure()) return;
    this._noise(0.6, 'lowpass', 4000, 90, 0.42);
    this._osc('sine', 85, 24, 0.55, 0.3);
    this._osc('sine', 50, 20, 0.65, 0.2, 0.08);
  }

  // ── Events ────────────────────────────────────────────────

  powerupPickup() {
    if (!this._ensure()) return;
    const notes = [261.63, 329.63, 392, 523.25]; // C-E-G-C
    notes.forEach((freq, i) => this._osc('sine', freq, freq, 0.1, 0.08, i * 0.07));
  }

  countdownBeep(value) {
    if (!this._ensure()) return;
    this._osc('sine', value === 0 ? 880 : 440, value === 0 ? 880 : 440, value === 0 ? 0.2 : 0.12, 0.1);
  }

  dash() {
    if (!this._ensure()) return;
    this._noise(0.1, 'highpass', 800, 2000, 0.06);
    this._osc('sawtooth', 300, 620, 0.12, 0.07);
  }

  /** Allarme a due toni (DANGER / wave / spawn nemici forti). */
  alarm() {
    if (!this._ensure()) return;
    for (let i = 0; i < 2; i++) {
      this._osc('square', 520, 520, 0.12, 0.09, i * 0.3);
      this._osc('square', 390, 390, 0.12, 0.09, i * 0.3 + 0.15);
    }
  }

  /** Wormhole swoosh. */
  wormholeSwoosh() {
    if (!this._ensure()) return;
    this._osc('sine', 900, 120, 0.25, 0.09);
    this._noise(0.2, 'bandpass', 1800, 400, 0.06);
  }

  /** Torretta che spara (più metallica del blaster). */
  turretFire() {
    if (!this._ensure()) return;
    this._osc('square', 950, 250, 0.05, 0.07);
    this._osc('square', 1400, 500, 0.03, 0.04, 0.01);
  }

  /** Porta/trigger (F7b): clang meccanico + slide. */
  doorClank() {
    if (!this._ensure()) return;
    this._osc('square', 120, 60, 0.15, 0.12);
    this._noise(0.25, 'lowpass', 900, 250, 0.08, 0.05);
  }

  /** Bottone trigger colpito (F7b). */
  buttonHit() {
    if (!this._ensure()) return;
    this._osc('sine', 660, 660, 0.06, 0.1);
    this._osc('sine', 990, 990, 0.08, 0.08, 0.06);
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._volume;
  }
}
