/**
 * Synthesized audio (Web Audio API), no external sound files — so no licensing issues.
 *
 * The truck engine is modelled, not beeped: a 6-cylinder four-stroke diesel fires
 * 3 times per crankshaft revolution. We pre-render 16 engine cycles at 1000 RPM
 * (each firing = exhaust thump + body resonance + combustion "clatter", with
 * per-cylinder and per-cycle variation), loop it, and play it back at rpm/1000.
 * Two renders ("on load" harsh, "off load" soft) are crossfaded by the throttle.
 * Around it: turbo whistle + blow-off, gear-change dips, air brakes, horn, tyre
 * squeal, wind and a stadium crowd.
 */
const REF_RPM = 1000;

function renderEngine(ctx: BaseAudioContext, onLoad: boolean, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const cycle = (2 * 60) / REF_RPM; // two revolutions per 4-stroke cycle
  const cycles = 16;
  const len = Math.round(cycle * cycles * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cylGain = [1.0, 0.9, 1.08, 0.94, 1.03, 0.88];
  const firing = cycle / 6;
  const thumpF = onLoad ? 62 : 55;
  const bodyF = onLoad ? 175 : 150;
  for (let c = 0; c < cycles; c++) {
    const cycAmp = 0.93 + rnd() * 0.14;
    for (let k = 0; k < 6; k++) {
      const t0 = c * cycle + k * firing + (rnd() - 0.5) * 0.0008;
      const a = cylGain[k] * cycAmp * (onLoad ? 1 : 0.55);
      const start = Math.round(t0 * sr);
      const n = Math.round(0.05 * sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let v = Math.sin(2 * Math.PI * thumpF * t) * Math.exp(-t / (onLoad ? 0.011 : 0.009)) * 0.9;
        v += Math.sin(2 * Math.PI * bodyF * t + 0.6) * Math.exp(-t / 0.005) * 0.45;
        v += (rnd() * 2 - 1) * Math.exp(-t / (onLoad ? 0.004 : 0.0025)) * (onLoad ? 0.55 : 0.25);
        // diesel knock: sharp metallic click right at combustion
        if (onLoad && t < 0.0015) v += Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-t / 0.0004) * 0.35;
        d[(start + i) % len] += v * a;
      }
    }
  }
  // valvetrain / mechanical hiss
  for (let i = 0; i < len; i++) d[i] += (rnd() * 2 - 1) * (onLoad ? 0.025 : 0.015);
  // soft-clip + normalise
  let peak = 0;
  for (let i = 0; i < len; i++) {
    d[i] = Math.tanh(d[i] * 1.4);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] *= 0.85 / peak;
  return buf;
}

export interface EngineState {
  rpm: number;
  throttle: boolean;
  speed: number; // m/s
  maxSpeed: number;
  nitro: boolean;
  shifting: boolean;
  slip: number;
  braking: boolean;
  crowd: number; // 0..1 how close the stands are
}

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  volume = 0.7;
  private noiseBuf: AudioBuffer | null = null;
  private eng: null | {
    on: AudioBufferSourceNode; off: AudioBufferSourceNode; onGain: GainNode; offGain: GainNode;
    tone: BiquadFilterNode; bus: GainNode;
    turbo: OscillatorNode; turboGain: GainNode;
    wind: GainNode; windFilter: BiquadFilterNode;
    squeal: GainNode; squealFilter: BiquadFilterNode;
    nitro: GainNode;
    crowd: GainNode; crowdFormants: BiquadFilterNode[];
    sources: AudioScheduledSourceNode[];
  } = null;
  private load = 0;
  private boost = 0;
  private wasBraking = 0;
  private wasShifting = false;
  private crowdLfoPhase = 0;
  private horn: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
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

  private noise(loop = true) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    return src;
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

  private burst(dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, attack = 0.005) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.noise(false);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  click() { this.tone(660, 0.08, 'triangle', 0.18, 990); }
  hover() { this.tone(520, 0.04, 'sine', 0.06); }
  beep(go = false) { this.tone(go ? 880 : 440, go ? 0.6 : 0.25, 'square', 0.22); }
  coin() { this.tone(988, 0.08, 'square', 0.15); setTimeout(() => this.tone(1319, 0.25, 'square', 0.15), 80); }
  fanfare(win: boolean) {
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 330, 262];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.25), i * 160));
  }

  /** Metal-on-metal crash: low body thud + clang + debris noise. */
  thud(intensity: number) {
    const k = Math.min(1, intensity / 25);
    this.burst(0.45, 0.25 + k * 0.4, 'lowpass', 380, 0.7);
    this.tone(68, 0.3, 'sine', 0.15 + k * 0.3, 38);
    if (k > 0.3) {
      this.tone(420 + Math.random() * 200, 0.25, 'triangle', 0.08 * k, 300);
      this.burst(0.3, 0.15 * k, 'bandpass', 2600, 3);
    }
  }

  /** Air-brake release "pssssht". */
  airBrake(strength = 1) {
    this.burst(0.7, 0.22 * strength, 'highpass', 2600, 0.7, 0.01);
  }

  /** Two-tone truck air horn, held while `on`. */
  setHorn(on: boolean) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    if (on && !this.horn) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.04);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const oscs = [277, 349, 415].map((f) => {
        const o = this.ctx!.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(lp);
        o.start(t);
        return o;
      });
      lp.connect(gain).connect(this.master);
      this.horn = { oscs, gain };
    } else if (!on && this.horn) {
      const h = this.horn;
      this.horn = null;
      h.gain.gain.setTargetAtTime(0.0001, t, 0.05);
      h.oscs.forEach((o) => o.stop(t + 0.3));
    }
  }

  /** Big stadium roar (start, finish, overtakes in front of the stands). */
  cheer(power = 1) {
    if (!this.ctx || !this.master) return;
    [650, 1100, 2400].forEach((f, i) => this.burst(2.2, (0.12 - i * 0.03) * power, 'bandpass', f, 1.4, 0.35));
    // whistles
    for (let i = 0; i < 3; i++) setTimeout(() => this.tone(2200 + Math.random() * 900, 0.35, 'sine', 0.05 * power, 2600 + Math.random() * 600), 200 + i * 260);
  }

  startEngine() {
    if (!this.ctx || !this.master || this.eng) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.setTargetAtTime(0.55, t, 0.4);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    tone.Q.value = 0.8;
    tone.connect(bus).connect(this.master);

    const mk = (onLoad: boolean, seed: number) => {
      const src = ctx.createBufferSource();
      src.buffer = renderEngine(ctx, onLoad, seed);
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = onLoad ? 0 : 1;
      src.connect(g).connect(tone);
      src.start(t, Math.random());
      return { src, g };
    };
    const on = mk(true, 12345);
    const off = mk(false, 777);

    // turbo whistle
    const turbo = ctx.createOscillator();
    turbo.type = 'sine';
    turbo.frequency.value = 1800;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    turbo.connect(turboGain).connect(this.master);
    turbo.start(t);

    const loopNoise = (type: BiquadFilterType, freq: number, q: number) => {
      const src = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master!);
      src.start(t, Math.random());
      return { src, f, g };
    };
    const wind = loopNoise('lowpass', 500, 0.5);
    const squeal = loopNoise('bandpass', 1900, 9);
    const nitro = loopNoise('bandpass', 1600, 0.9);

    // crowd bed: noise through vowel-like formants
    const crowdSrc = this.noise();
    const crowd = ctx.createGain();
    crowd.gain.value = 0;
    const crowdFormants = [520, 980, 2500].map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = f;
      b.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.value = [1, 0.6, 0.25][i];
      crowdSrc.connect(b).connect(g).connect(crowd);
      return b;
    });
    crowd.connect(this.master);
    crowdSrc.start(t);

    this.eng = {
      on: on.src, off: off.src, onGain: on.g, offGain: off.g, tone, bus,
      turbo, turboGain, wind: wind.g, windFilter: wind.f, squeal: squeal.g, squealFilter: squeal.f,
      nitro: nitro.g, crowd, crowdFormants,
      sources: [on.src, off.src, turbo, wind.src, squeal.src, nitro.src, crowdSrc],
    };
    this.load = 0;
    this.boost = 0;
  }

  updateEngine(s: EngineState) {
    const e = this.eng;
    if (!this.ctx || !e) return;
    const t = this.ctx.currentTime;
    const rate = Math.max(0.55, s.rpm / REF_RPM);
    e.on.playbackRate.setTargetAtTime(rate, t, 0.03);
    e.off.playbackRate.setTargetAtTime(rate, t, 0.03);

    // load: full throttle = harsh "on" sound, coasting = soft "off" sound, dip while shifting
    const targetLoad = s.shifting ? 0.15 : s.throttle ? 1 : 0;
    this.load += (targetLoad - this.load) * 0.25;
    const rpmK = (s.rpm - 650) / 1650;
    e.onGain.gain.setTargetAtTime(this.load * (0.8 + rpmK * 0.4), t, 0.04);
    e.offGain.gain.setTargetAtTime((1 - this.load) * (0.55 + rpmK * 0.25), t, 0.04);
    e.tone.frequency.setTargetAtTime(500 + rpmK * 1300 + this.load * 900, t, 0.05);

    // gear change: short mechanical clunk
    if (s.shifting && !this.wasShifting && s.speed > 3) this.tone(95, 0.09, 'square', 0.05, 70);
    this.wasShifting = s.shifting;

    // turbo spools with load * rpm, blows off when the throttle closes at boost
    const targetBoost = s.throttle && !s.shifting ? Math.max(0, rpmK) : 0;
    if (this.boost > 0.55 && targetBoost < 0.1) this.burst(0.35, 0.09 * this.boost, 'bandpass', 3200, 1.2);
    this.boost += (targetBoost - this.boost) * (targetBoost > this.boost ? 0.04 : 0.2);
    e.turbo.frequency.setTargetAtTime(1500 + this.boost * 3200, t, 0.08);
    e.turboGain.gain.setTargetAtTime(this.boost * 0.022, t, 0.08);

    // air brakes hiss when the brake is released after a real stop
    if (s.braking) this.wasBraking += 1;
    else {
      if (this.wasBraking > 18) this.airBrake(Math.min(1, this.wasBraking / 60));
      this.wasBraking = 0;
    }

    const v = Math.max(0, Math.abs(s.speed) / Math.max(10, s.maxSpeed));
    e.wind.gain.setTargetAtTime(v * v * 0.09, t, 0.1);
    e.windFilter.frequency.setTargetAtTime(400 + v * 900, t, 0.1);
    e.squeal.gain.setTargetAtTime(s.slip > 0.35 && Math.abs(s.speed) > 6 ? (s.slip - 0.35) * 0.12 : 0, t, 0.05);
    e.squealFilter.frequency.setTargetAtTime(1700 + s.slip * 600, t, 0.05);
    e.nitro.gain.setTargetAtTime(s.nitro ? 0.1 : 0, t, 0.08);

    // crowd swells and murmurs near the grandstands
    this.crowdLfoPhase += 0.03;
    const murmur = 0.75 + Math.sin(this.crowdLfoPhase) * 0.15 + Math.sin(this.crowdLfoPhase * 2.7) * 0.1;
    e.crowd.gain.setTargetAtTime(s.crowd * 0.35 * murmur, t, 0.15);
    e.crowdFormants[0].frequency.setTargetAtTime(480 + Math.sin(this.crowdLfoPhase * 1.3) * 60, t, 0.2);
  }

  stopEngine() {
    this.setHorn(false);
    if (!this.eng || !this.ctx) return;
    const e = this.eng;
    this.eng = null;
    const t = this.ctx.currentTime;
    e.bus.gain.setTargetAtTime(0.0001, t, 0.05);
    e.crowd.gain.setTargetAtTime(0.0001, t, 0.05);
    e.sources.forEach((s) => { try { s.stop(t + 0.3); } catch { /* already stopped */ } });
  }
}

export const audio = new AudioEngine();
