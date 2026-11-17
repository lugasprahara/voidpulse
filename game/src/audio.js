// Synthesized sound: every effect and the music loop are built from raw
// WebAudio oscillators and filtered noise — no audio files, nothing to load.
//
// A tiny step-sequenced loop drives a dark synthwave pulse (bass line, a
// sparse minor-key arp, noise hats) while one-shot helpers voice the laser,
// the explosions, the rift and the boss. Browsers require a user gesture
// before audio may start, so the engine unlocks on the first click or key.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.step = 0;
    this.nextStepAt = 0;
    this.bossMode = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);
    this.nextStepAt = this.ctx.currentTime + 0.06;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // --- primitive voices -------------------------------------------------

  tone({ freq = 440, freqEnd = null, type = 'square', dur = 0.12, vol = 0.2, when = 0, music = false }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(music ? this.musicGain : this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.25, freq = 1200, q = 0.8, when = 0, sweepTo = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  // --- one-shot effects ---------------------------------------------------

  shoot() {
    this.tone({ freq: 880 + Math.random() * 120, freqEnd: 320, type: 'square', dur: 0.07, vol: 0.055 });
  }

  enemyHit() {
    this.tone({ freq: 300 + Math.random() * 60, freqEnd: 190, type: 'triangle', dur: 0.05, vol: 0.07 });
  }

  enemyDie(big = false) {
    this.noise({ dur: big ? 0.4 : 0.18, vol: big ? 0.34 : 0.16, freq: big ? 500 : 900, sweepTo: 90 });
    this.tone({ freq: big ? 220 : 340, freqEnd: 46, type: 'sine', dur: big ? 0.42 : 0.2, vol: big ? 0.3 : 0.14 });
  }

  playerHit() {
    this.tone({ freq: 160, freqEnd: 60, type: 'sawtooth', dur: 0.22, vol: 0.26 });
    this.noise({ dur: 0.16, vol: 0.2, freq: 2400, sweepTo: 300 });
  }

  dash() {
    this.noise({ dur: 0.16, vol: 0.12, freq: 500, sweepTo: 3400, q: 1.6 });
  }

  pickup() {
    this.tone({ freq: 660, type: 'sine', dur: 0.07, vol: 0.13 });
    this.tone({ freq: 990, type: 'sine', dur: 0.1, vol: 0.13, when: 0.06 });
  }

  powerup() {
    this.tone({ freq: 523, type: 'triangle', dur: 0.09, vol: 0.16 });
    this.tone({ freq: 784, type: 'triangle', dur: 0.09, vol: 0.16, when: 0.08 });
    this.tone({ freq: 1046, type: 'triangle', dur: 0.14, vol: 0.16, when: 0.16 });
  }

  riftOpen() {
    this.tone({ freq: 90, freqEnd: 720, type: 'sawtooth', dur: 0.7, vol: 0.1 });
    this.noise({ dur: 0.7, vol: 0.08, freq: 300, sweepTo: 2600, q: 2.4 });
  }

  nova() {
    this.noise({ dur: 0.65, vol: 0.42, freq: 3000, sweepTo: 60, q: 0.5 });
    this.tone({ freq: 120, freqEnd: 30, type: 'sine', dur: 0.7, vol: 0.42 });
    this.tone({ freq: 1400, freqEnd: 200, type: 'triangle', dur: 0.3, vol: 0.12 });
  }

  bossAlarm() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 392, type: 'square', dur: 0.14, vol: 0.14, when: i * 0.34 });
      this.tone({ freq: 311, type: 'square', dur: 0.14, vol: 0.14, when: i * 0.34 + 0.17 });
    }
  }

  waveStart() {
    this.tone({ freq: 440, type: 'triangle', dur: 0.08, vol: 0.12 });
    this.tone({ freq: 554, type: 'triangle', dur: 0.08, vol: 0.12, when: 0.07 });
    this.tone({ freq: 659, type: 'triangle', dur: 0.12, vol: 0.12, when: 0.14 });
  }

  gameOver() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.18, when: i * 0.22 }));
    this.noise({ dur: 0.9, vol: 0.16, freq: 700, sweepTo: 60 });
  }

  // --- music sequencer ------------------------------------------------------

  // Called every frame; schedules 16th-note steps a little ahead of time.
  // A minor, 112 BPM: a driving octave bass, a three-note arp that answers
  // every other bar, and a hat tick on the off-beats. Boss fights halve the
  // arp's resting bars so the loop feels like it is leaning forward.
  update() {
    if (!this.ctx || this.muted) return;
    const stepDur = 60 / 112 / 4;
    while (this.nextStepAt < this.ctx.currentTime + 0.12) {
      const when = this.nextStepAt - this.ctx.currentTime;
      const s = this.step;
      const bar = Math.floor(s / 16) % 4;
      const roots = [55, 55, 43.65, 49]; // A1 A1 F1 G1
      const root = roots[bar];
      if (s % 2 === 0) {
        this.tone({ freq: root * (s % 8 === 4 ? 2 : 1), type: 'sawtooth', dur: stepDur * 1.8, vol: 0.16, when, music: true });
      }
      if (s % 4 === 2) {
        this.noiseHat(when);
      }
      const arpNotes = [220, 261.63, 329.63, 261.63];
      const restBars = this.bossMode ? 2 : 1;
      if (bar % restBars === 0 && s % 4 === 0) {
        this.tone({ freq: arpNotes[(s / 4) % 4] * (bar === 3 ? 1.122 : 1), type: 'triangle', dur: stepDur * 3, vol: 0.07, when, music: true });
      }
      this.step++;
      this.nextStepAt += stepDur;
    }
  }

  noiseHat(when) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * 0.03);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.03);
    src.connect(filter).connect(gain).connect(this.musicGain);
    src.start(t0);
  }
}
