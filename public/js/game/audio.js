// Prozedurale Sounds mit WebAudio (keine Audiodateien nötig)
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.listener = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(this.comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // braunes Rauschen für Explosionen
    this.brown = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    this.listener = pos;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // Ausgang: entweder direkt (lokal) oder räumlich mit Distanz-Tiefpass
  out(pos, refDist = 4) {
    const ctx = this.ctx;
    if (!pos) return this.master;
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'inverse';
    pan.refDistance = refDist; pan.rolloffFactor = 1.1; pan.maxDistance = 200;
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
    else pan.setPosition(pos.x, pos.y, pos.z);
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(600, 16000 - d * 260);
    lp.connect(pan).connect(this.master);
    return lp;
  }

  noiseBurst(dest, t, { dur = 0.2, freq = 1000, q = 0.8, type = 'bandpass', gain = 0.5, attack = 0.002, brown = false, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * Math.max(0, 1.45 / rate - dur - 0.05), dur + 0.05);
    return f;
  }

  tone(dest, t, { f0 = 200, f1 = 60, dur = 0.15, gain = 0.4, type = 'sine' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Begrenzt gleichzeitige Sounds – viele Audio-Knoten pro Sekunde kosten CPU und erzeugen Knackser
  budget(cost) {
    const now = this.ctx.currentTime;
    if (now - (this.budgetT || 0) > 0.1) { this.budgetT = now; this.budgetUsed = 0; }
    if (this.budgetUsed + cost > 14) return false;
    this.budgetUsed += cost;
    return true;
  }

  shot(cls, pos, suppressed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dist = pos ? Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z) : 0;
    if (pos && !this.budget(dist > 45 ? 1 : 2)) return;
    if (pos && dist > 120) return;
    const dest = this.out(pos, suppressed ? 2 : 6);
    if (pos && dist > 45) {
      // weit weg: ein einfacher, dumpfer Knall reicht
      this.noiseBurst(dest, t, { dur: suppressed ? 0.08 : 0.3, freq: suppressed ? 1200 : 600, q: 0.5, gain: suppressed ? 0.25 : 0.7, brown: !suppressed });
      return;
    }
    const v = 0.9 + Math.random() * 0.2;
    if (suppressed) {
      this.noiseBurst(dest, t, { dur: 0.09, freq: 1400 * v, q: 0.7, gain: 0.35 });
      this.tone(dest, t, { f0: 180, f1: 60, dur: 0.07, gain: 0.25 });
      return;
    }
    const P = {
      ar:      { f: 1100, d: 0.22, th: 140, g: 0.75 },
      smg:     { f: 1500, d: 0.16, th: 170, g: 0.6 },
      lmg:     { f: 950, d: 0.26, th: 120, g: 0.8 },
      dmr:     { f: 900, d: 0.32, th: 110, g: 0.85 },
      sniper:  { f: 700, d: 0.55, th: 85, g: 1.0 },
      shotgun: { f: 600, d: 0.45, th: 90, g: 1.0 },
      pistol:  { f: 1700, d: 0.17, th: 200, g: 0.6 },
    }[cls] || { f: 1100, d: 0.22, th: 140, g: 0.75 };
    this.noiseBurst(dest, t, { dur: 0.035, freq: 4500, q: 0.5, type: 'highpass', gain: P.g * 0.8 });
    this.noiseBurst(dest, t, { dur: P.d * v, freq: P.f * v, q: 0.6, gain: P.g });
    this.tone(dest, t, { f0: P.th * 1.6, f1: P.th * 0.35, dur: P.d * 0.7, gain: P.g * 0.7 });
    if (pos) this.noiseBurst(dest, t + 0.03, { dur: P.d * 2.2, freq: 500, q: 0.4, type: 'lowpass', gain: P.g * 0.25, brown: true });
  }

  footstep(pos, loud = 1, surface = 0) {
    if (!this.ctx) return;
    if (pos && !this.budget(1)) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos, 2.5);
    this.noiseBurst(dest, t, { dur: 0.07, freq: surface ? 2200 : 700 + Math.random() * 300, q: 1.2, gain: 0.22 * loud });
    this.tone(dest, t, { f0: 90, f1: 50, dur: 0.06, gain: 0.12 * loud });
  }

  click(kind = 'ui') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'empty') this.noiseBurst(this.master, t, { dur: 0.03, freq: 3000, q: 4, gain: 0.25 });
    else if (kind === 'ui') this.tone(this.master, t, { f0: 900, f1: 600, dur: 0.05, gain: 0.08, type: 'triangle' });
  }

  reload(stage) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (stage === 0) { this.noiseBurst(this.master, t, { dur: 0.06, freq: 1800, q: 3, gain: 0.25 }); this.tone(this.master, t, { f0: 400, f1: 200, dur: 0.05, gain: 0.08, type: 'square' }); }
    else if (stage === 1) { this.noiseBurst(this.master, t, { dur: 0.05, freq: 2600, q: 4, gain: 0.3 }); this.noiseBurst(this.master, t + 0.05, { dur: 0.04, freq: 3400, q: 5, gain: 0.25 }); }
    else { this.noiseBurst(this.master, t, { dur: 0.05, freq: 2000, q: 5, gain: 0.3 }); this.noiseBurst(this.master, t + 0.08, { dur: 0.06, freq: 1500, q: 5, gain: 0.3 }); }
  }

  hit(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'kill') { this.tone(this.master, t, { f0: 1300, f1: 1250, dur: 0.12, gain: 0.18, type: 'triangle' }); this.tone(this.master, t + 0.06, { f0: 1750, f1: 1700, dur: 0.14, gain: 0.16, type: 'triangle' }); }
    else if (kind === 'head') { this.noiseBurst(this.master, t, { dur: 0.05, freq: 4200, q: 6, gain: 0.35 }); this.tone(this.master, t, { f0: 2400, f1: 2000, dur: 0.06, gain: 0.1, type: 'triangle' }); }
    else this.noiseBurst(this.master, t, { dur: 0.04, freq: 3200, q: 6, gain: 0.32 });
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, { f0: 160, f1: 70, dur: 0.18, gain: 0.25 });
    this.noiseBurst(this.master, t, { dur: 0.12, freq: 500, q: 0.8, gain: 0.25 });
  }

  explosion(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos, 10);
    this.noiseBurst(dest, t, { dur: 1.6, freq: 900, type: 'lowpass', q: 0.5, gain: 1.0, brown: true, attack: 0.005 });
    this.noiseBurst(dest, t, { dur: 0.35, freq: 2500, q: 0.4, gain: 0.6 });
    this.tone(dest, t, { f0: 90, f1: 25, dur: 0.9, gain: 0.9 });
  }

  pop(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos, 6);
    this.noiseBurst(dest, t, { dur: 0.25, freq: 3000, q: 0.5, gain: 0.8 });
    this.noiseBurst(dest, t + 0.05, { dur: 1.4, freq: 1200, q: 0.3, type: 'lowpass', gain: 0.25, brown: true });
  }

  ring(dur) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.value = 3200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.comp);
    o.start(t); o.stop(t + dur + 0.05);
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(500, t);
    this.muffle.frequency.exponentialRampToValueAtTime(20000, t + dur);
  }

  bounce(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(this.out(pos, 2), t, { dur: 0.05, freq: 2500, q: 3, gain: 0.25 });
  }

  whoosh(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(this.out(pos, 3), t, { dur: 0.25, freq: 900, q: 0.8, gain: 0.25, attack: 0.06 });
  }

  slide() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(this.master, t, { dur: 0.55, freq: 1200, q: 0.4, gain: 0.25, attack: 0.03 });
  }

  land(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, { f0: 110, f1: 45, dur: 0.12, gain: Math.min(0.4, 0.08 * strength) });
    this.noiseBurst(this.master, t, { dur: 0.08, freq: 600, q: 1, gain: Math.min(0.3, 0.05 * strength) });
  }

  beep(high) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, { f0: high ? 1800 : 1200, f1: high ? 1800 : 1200, dur: 0.09, gain: 0.12, type: 'square' });
  }

  announce(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const seq = kind === 'good' ? [523, 659, 784] : kind === 'bad' ? [392, 330, 262] : [440, 554];
    seq.forEach((f, i) => this.tone(this.master, t + i * 0.11, { f0: f, f1: f, dur: 0.16, gain: 0.12, type: 'triangle' }));
  }

  levelUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(this.master, t + i * 0.09, { f0: f, f1: f, dur: 0.22, gain: 0.13, type: 'triangle' }));
  }
}

export const audio = new AudioEngine();
