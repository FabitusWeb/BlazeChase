// client/js/audio.js — Procedural Web Audio API sounds

export class AudioManager {
  constructor() {
    this.ctx         = null;
    this.masterGain  = null;
    this._volume     = 0.5;
    this._initialized = false;
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

  // ── Sounds ────────────────────────────────────────────────

  blasterFire() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.08);
  }

  rapidFire() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(500, t);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.04);
  }

  missileLaunch() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const noise = this._createNoise(0.3);
    const gain  = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain); noise.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.35);
  }

  plasmaFire() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 8;
    lfoGain.gain.value  = 40;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain); gain.connect(this.masterGain);
    lfo.start(t); osc.start(t); osc.stop(t + 0.25); lfo.stop(t + 0.25);
  }

  explosionSmall() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const noise = this._createNoise(0.12);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
  }

  explosionMedium() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const noise = this._createNoise(0.35);
    const osc   = this.ctx.createOscillator();
    const gain  = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(filter);
    filter.connect(gain);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.4);
  }

  explosionLarge() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const noise  = this._createNoise(0.55);
    const osc    = this.ctx.createOscillator();
    const gain   = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.5);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.5);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise.connect(filter);
    filter.connect(gain);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.65);
  }

  powerupPickup() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392, 523.25]; // C-E-G-C
    notes.forEach((freq, i) => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st   = t + i * 0.07;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(st); osc.stop(st + 0.12);
    });
  }

  countdownBeep(value) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = value === 0 ? 880 : 440;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (value === 0 ? 0.2 : 0.12));
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.25);
  }

  dash() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const noise = this._createNoise(0.1);
    const osc   = this.ctx.createOscillator();
    const gain  = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(gain); osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.15);
  }

  // ── Internal helpers ──────────────────────────────────────

  _createNoise(duration) {
    const sr     = this.ctx.sampleRate;
    const frames = Math.ceil(sr * duration);
    const buf    = this.ctx.createBuffer(1, frames, sr);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.start(this.ctx.currentTime);
    return src;
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._volume;
  }
}
