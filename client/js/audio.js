// client/js/audio.js — Audio Web Audio API (stile Chase Ace:
// spari distinti per arma, esplosioni juicy, engine hum, allarmi)
//
// Suoni originali Chase Ace (WAV in client/assets/audio/):
// - Sparo del BLASTER (arma 0) e engine hum usano i WAV originali della nave,
//   caricati async al primo init(); se il caricamento fallisce (file assente,
//   errore di rete, ambiente Node/test) resta tutto sintetizzato come prima.
// - Mapping navi BlazeChase (CONFIG.SHIPS, shared/config.js) → navi originali CA:
//     0 VIPER   → classic
//     1 HORNET  → Lfighter
//     2 TITAN   → hoogb4a
//     3 PHANTOM → gobel
//     4 BLAZE   → martinez
//   (classic/Lfighter/hoogb4a: PCM 16bit 22050Hz mono; gobel/martinez sparo: 8bit 11025Hz)
// - NOTA: la nave attiva viene comunicata da main.js con `audio.setShip(shipId)`
//   (ship select + startGame). Di default vale la nave 0 (VIPER).

// Dati WAV originali misurati (python wave): durata e peak per tarare i gain.
//   viper:   shoot 0.156s peak 0.38 | engine 0.114s peak 0.23
//   hornet:  shoot 0.273s peak 1.00 | engine 0.671s peak 0.87
//   titan:   shoot 0.273s peak 1.00 | engine 0.671s peak 0.87
//   phantom: shoot 0.146s peak 0.37 | engine 0.252s peak 0.11
//   blaze:   shoot 0.146s peak 0.37 | engine 0.252s peak 0.11
// shootGain/engineGain normalizzano il peak rispettivamente a ~0.5 e ~0.45.
const SHIP_SAMPLES = [
  { name: 'viper',   shootGain: 1.30, engineGain: 2.00 }, // classic
  { name: 'hornet',  shootGain: 0.50, engineGain: 0.55 }, // Lfighter
  { name: 'titan',   shootGain: 0.50, engineGain: 0.55 }, // hoogb4a
  { name: 'phantom', shootGain: 1.35, engineGain: 3.50 }, // gobel
  { name: 'blaze',   shootGain: 1.35, engineGain: 3.50 }, // martinez
];
// I WAV engine hanno RMS molto più basso del sawtooth synth: boost per pareggiare.
const ENGINE_SAMPLE_BOOST = 4.0;

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
    // Campioni WAV originali Chase Ace (null se non caricati → fallback synth)
    this._shipId     = 0;            // nave attiva per sparo/motore (vedi setShip)
    this._buffers    = {};           // 'shoot_viper' / 'engine_viper' → AudioBuffer
    this._engineSrc  = null;         // BufferSource in loop (modalità sample)
    this._engineMode = null;         // 'sample' | 'synth' | null (motore fermo)
  }

  init() {
    if (this._initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      this._initialized = true;
      this._loadSamples(); // async, fire-and-forget: i fallback synth coprono l'attesa
    } catch (e) {
      console.warn('Web Audio not available');
    }
  }

  /** Imposta la nave del giocatore locale (indice di CONFIG.SHIPS).
   *  Va chiamata da main.js dopo la scelta della nave; default = 0 (VIPER). */
  setShip(shipId) {
    if (shipId === this._shipId) return;
    this._shipId = shipId;
    this._stopEngine(); // riavvia il loop col WAV della nuova nave al prossimo engineSet
  }

  /** Carica i WAV originali; ogni fallimento lascia il buffer assente (fallback synth). */
  _loadSamples() {
    if (typeof fetch !== 'function') return; // es. Node/test: resta tutto synth
    for (const s of SHIP_SAMPLES) {
      for (const kind of ['shoot', 'engine']) {
        fetch(`assets/audio/${kind}_${s.name}.wav`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
          .then(ab => this.ctx.decodeAudioData(ab))
          .then(buf => { this._buffers[`${kind}_${s.name}`] = buf; })
          .catch(() => { /* file assente o non decodificabile: resta il synth */ });
      }
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

  /** Riproduce un AudioBuffer caricato (one-shot). */
  _playBuffer(buf, vol) {
    const src  = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  /** Ferma l'engine hum in corso (qualunque modalità). */
  _stopEngine() {
    if (this._engineSrc) { try { this._engineSrc.stop(); } catch (e) {} this._engineSrc = null; }
    if (this._engineOsc) { try { this._engineOsc.stop(); } catch (e) {} this._engineOsc = null; }
    if (this._engineGain) { this._engineGain.disconnect(); this._engineGain = null; }
    this._engineFilter = null;
    this._engineMode   = null;
  }

  // ── Weapon fire (per-weapon presets, CA style) ────────────

  weaponFire(w) {
    if (!this._ensure()) return;
    switch (w) {
      case 0: { // BLASTER — SNDSHOOT originale della nave attiva (fallback: zap synth)
        const cfg = SHIP_SAMPLES[this._shipId] || SHIP_SAMPLES[0];
        const buf = this._buffers[`shoot_${cfg.name}`];
        if (buf) {
          this._playBuffer(buf, 0.5 * cfg.shootGain);
        } else {
          this._osc('square', 800, 180, 0.06, 0.10);
        }
        break;
      }
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
      case 11: // SNEAKY MISSILE — whoosh + wobble
        this._noise(0.25, 'lowpass', 2200, 400, 0.08);
        this._osc('sawtooth', 200, 500, 0.22, 0.05);
        break;
      case 12: // CENTERBLAST — boom profondo
        this._osc('sine', 100, 30, 0.4, 0.16);
        this._noise(0.3, 'lowpass', 1500, 150, 0.1);
        break;
      case 13: // STICKY BOMB — thwip
        this._osc('sine', 500, 150, 0.08, 0.1);
        break;
      case 14: // LAZER TRAP — zap + hum
        this._osc('sawtooth', 900, 200, 0.08, 0.08);
        this._osc('sine', 220, 220, 0.15, 0.04, 0.05);
        break;
      default:
        this._osc('square', 700, 150, 0.06, 0.10);
    }
  }

  // ── Engine hum (continuo, gestito da gameLoop) ────────────

  /** thrust: spinta attiva; turbo: boost attivo (alza il pitch).
   *  Se disponibile usa il SNDENGINE originale della nave in loop
   *  (playbackRate/gain modulati da thrust/turbo), altrimenti il synth. */
  engineSet(thrust, turbo) {
    if (!this._ensure()) return;
    const cfg = SHIP_SAMPLES[this._shipId] || SHIP_SAMPLES[0];
    const sampleBuf = this._buffers[`engine_${cfg.name}`];
    const wantMode = sampleBuf ? 'sample' : 'synth';
    if (this._engineMode && this._engineMode !== wantMode) this._stopEngine();
    if (!this._engineMode) {
      this._engineGain = this.ctx.createGain();
      this._engineGain.gain.value = 0;
      this._engineGain.connect(this.masterGain);
      if (wantMode === 'sample') {
        // SNDENGINE originale in loop (loop=true: i WAV sono pensati per il loop)
        const src = this.ctx.createBufferSource();
        src.buffer = sampleBuf;
        src.loop = true;
        src.playbackRate.value = 1;
        src.connect(this._engineGain);
        src.start();
        this._engineSrc = src;
      } else {
        // Fallback synth: sawtooth + lowpass per renderlo un rombo e non un sega
        this._engineOsc = this.ctx.createOscillator();
        this._engineOsc.type = 'sawtooth';
        this._engineOsc.frequency.value = 55;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        this._engineOsc.connect(filter);
        filter.connect(this._engineGain);
        this._engineOsc.start();
        this._engineFilter = filter;
      }
      this._engineMode = wantMode;
    }
    const t = this.ctx.currentTime;
    const targetGain = thrust ? (turbo ? 0.075 : 0.045) : 0;
    if (this._engineMode === 'sample') {
      this._engineGain.gain.setTargetAtTime(targetGain * cfg.engineGain * ENGINE_SAMPLE_BOOST, t, 0.06);
      this._engineSrc.playbackRate.setTargetAtTime(turbo ? 1.5 : 1.0, t, 0.1);
    } else {
      this._engineGain.gain.setTargetAtTime(targetGain, t, 0.06);
      this._engineOsc.frequency.setTargetAtTime(turbo ? 95 : 55, t, 0.1);
      this._engineFilter.frequency.setTargetAtTime(turbo ? 600 : 300, t, 0.1);
    }
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
