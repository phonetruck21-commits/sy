/**
 * Fully synthesized audio (Web Audio API) — no external sound assets needed,
 * so there are no licensing concerns. Must be unlocked by a user gesture.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  volume = 0.7;
  private engine: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private nitroNoise: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private noiseBuf: AudioBuffer | null = null;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.25, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click() { this.tone(660, 0.08, 'triangle', 0.18, 990); }
  hover() { this.tone(520, 0.04, 'sine', 0.06); }
  beep(go = false) { this.tone(go ? 880 : 440, go ? 0.6 : 0.25, 'square', 0.22); }
  coin() { this.tone(988, 0.08, 'square', 0.15); setTimeout(() => this.tone(1319, 0.25, 'square', 0.15), 80); }
  fanfare(win: boolean) {
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 330, 262];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.25), i * 160));
  }

  thud(intensity: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, 0.15 + intensity * 0.05), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
    this.tone(70, 0.25, 'sine', Math.min(0.5, intensity * 0.05), 40);
  }

  startEngine() {
    if (!this.ctx || !this.master || this.engine) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 4;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc1.frequency.value = 40;
    osc2.frequency.value = 20;
    osc1.start();
    osc2.start();
    this.engine = { osc1, osc2, filter, gain };

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1800;
    const ng = this.ctx.createGain();
    ng.gain.value = 0;
    src.connect(nf).connect(ng).connect(this.master);
    src.start();
    this.nitroNoise = { src, gain: ng };
  }

  /** speedRatio 0..1+, throttle 0/1 */
  updateEngine(speedRatio: number, throttle: boolean, nitro: boolean) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const gears = 5;
    const s = Math.max(0, Math.min(1.3, speedRatio));
    const gear = Math.min(gears - 1, Math.floor(s * gears));
    const inGear = s * gears - gear;
    const rpm = 0.25 + inGear * 0.75; // 0.25..1
    const base = 38 + rpm * 70 + gear * 6;
    this.engine.osc1.frequency.setTargetAtTime(base, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(base / 2, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(300 + rpm * (throttle ? 1400 : 600), t, 0.08);
    this.engine.gain.gain.setTargetAtTime(throttle ? 0.16 : 0.09, t, 0.1);
    this.nitroNoise?.gain.gain.setTargetAtTime(nitro ? 0.12 : 0, t, 0.08);
  }

  stopEngine() {
    if (this.engine) {
      const e = this.engine;
      e.gain.gain.value = 0;
      e.osc1.stop();
      e.osc2.stop();
      this.engine = null;
    }
    if (this.nitroNoise) {
      this.nitroNoise.src.stop();
      this.nitroNoise = null;
    }
  }
}

export const audio = new AudioEngine();
