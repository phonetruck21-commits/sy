/* משוב: צלילים עדינים, רטט בבקרים, הרמת מוצרים ביד ופנייה למשתמש. */
(function () {
  'use strict';

  /* ---------- צלילים עדינים (נוצרים בזמן אמת, בלי קבצים) ---------- */
  const Sound = {
    ctx: null,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, vol, when = 0, type = 'sine') {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    click() { this.tone(1800, 0.045, 0.02); },
    add() { this.tone(880, 0.18, 0.035); this.tone(1320, 0.28, 0.03, 0.08); },
    success() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.4, 0.03, i * 0.09)); },
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => Sound.unlock(), { passive: true }));

  /* ---------- אווירה: רחש עיר רחוק, ציוצי ציפורים ומוזיקת בית קפה שקטה ---------- */
  const AMB_KEY = 'vrstore-ambience';
  const Ambience = {
    on: (() => { try { return localStorage.getItem(AMB_KEY) !== 'off'; } catch (e) { return true; } })(),
    started: false,
    listeners: [],
    start() {
      Sound.unlock();
      const ctx = Sound.ctx;
      if (!ctx || this.started) { this.apply(); return; }
      this.started = true;
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
      // רחש עיר: רעש ורוד מסונן
      const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const ng = ctx.createGain(); ng.gain.value = 0.32;
      src.connect(lp).connect(ng).connect(this.master); src.start();
      // ציפורים
      const chirp = () => {
        if (this.on) {
          const t = ctx.currentTime, n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600;
          for (let i = 0; i < n; i++) {
            const o = ctx.createOscillator(), g = ctx.createGain(), at = t + i * (0.09 + Math.random() * 0.05);
            o.frequency.setValueAtTime(base, at); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), at + 0.06);
            g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.05, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
            o.connect(g).connect(this.master); o.start(at); o.stop(at + 0.1);
          }
        }
        setTimeout(chirp, 2500 + Math.random() * 6000);
      };
      setTimeout(chirp, 1500);
      // מוזיקה: ארפג׳ו רך בסולם פנטטוני (כמו גיטרה ברקע)
      const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
      const chords = [[0, 2, 4], [5, 7, 2], [3, 5, 0], [4, 6, 1]];
      let step = 0;
      const pluck = (f, at, vol) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp2 = ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = f; lp2.type = 'lowpass'; lp2.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
        o.connect(lp2).connect(g).connect(this.master); o.start(at); o.stop(at + 1.7);
      };
      setInterval(() => {
        if (!this.on) return;
        const t = ctx.currentTime + 0.05, c = chords[Math.floor(step / 8) % chords.length], beat = step % 8;
        if (beat === 0) pluck(scale[c[0]] / 2, t, 0.05);
        if (beat % 2 === 0 || Math.random() < 0.3) pluck(scale[c[(beat / 2 | 0) % 3]] * (beat > 4 ? 2 : 1), t, 0.025);
        step++;
      }, 330);
      this.apply();
    },
    apply() {
      if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, Sound.ctx.currentTime, 0.6);
      try { localStorage.setItem(AMB_KEY, this.on ? 'on' : 'off'); } catch (e) { /* ignore */ }
      this.listeners.forEach((fn) => fn(this.on));
    },
    toggle() { this.on = !this.on; this.start(); this.apply(); },
    onChange(fn) { this.listeners.push(fn); fn(this.on); },
  };

  /* ---------- רטט ---------- */
  function pulse(handEl, intensity = 0.3, ms = 25) {
    try {
      const tc = handEl && handEl.components['tracked-controls'];
      const gp = tc && tc.controller && tc.controller.gamepad;
      const act = gp && gp.hapticActuators && gp.hapticActuators[0];
      if (act && act.pulse) act.pulse(intensity, ms);
    } catch (e) { /* בקר בלי רטט */ }
  }

  AFRAME.registerComponent('haptics', {
    init() { this.el.addEventListener('raycaster-intersection', () => pulse(this.el, 0.2, 18)); },
  });

  /* ---------- הרמת מוצר ביד (כפתור Grip) – למוצרים קטנים בלבד ---------- */
  AFRAME.registerComponent('grabber', {
    init() {
      this.held = null;
      this.el.addEventListener('gripdown', () => this.grab());
      this.el.addEventListener('gripup', () => this.release());
    },
    grab() {
      if (this.held) return;
      const rc = this.el.components.raycaster;
      const hit = rc && rc.intersectedEls.find((e) => e.classList.contains('grabbable'));
      const target = hit && hit.closest('.product');
      if (!target || target.dataset.busy) return;
      const obj = target.object3D;
      target.dataset.busy = 'grab';
      this.held = { el: target, parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone() };
      this.el.object3D.attach(obj);
      const from = obj.position.clone();
      const fromQ = obj.quaternion.clone();
      const toQ = new THREE.Quaternion();
      const to = new THREE.Vector3(0, -0.03, -0.12);
      window.StoreEnv.tween(220, (k) => { obj.position.lerpVectors(from, to, k); obj.quaternion.slerpQuaternions(fromQ, toQ, k); });
      pulse(this.el, 0.5, 40);
      target.emit('product-grabbed', null, false);
    },
    release() {
      if (!this.held) return;
      const h = this.held;
      this.held = null;
      const obj = h.el.object3D;
      h.parent.attach(obj);
      const from = obj.position.clone();
      const fromQ = obj.quaternion.clone();
      window.StoreEnv.tween(380, (k) => { obj.position.lerpVectors(from, h.pos, k); obj.quaternion.slerpQuaternions(fromQ, h.quat, k); },
        () => { delete h.el.dataset.busy; });
      pulse(this.el, 0.2, 25);
    },
  });

  /* ---------- פונה למשתמש (על ציר Y) ---------- */
  const tmpV = new THREE.Vector3();
  AFRAME.registerComponent('face-camera', {
    schema: { speed: { default: 0 } }, // 0 = מיידי
    tick(t, dt) {
      const cam = this.el.sceneEl.camera;
      const obj = this.el.object3D;
      if (!cam || !obj.parent || !obj.visible) return;
      cam.getWorldPosition(tmpV);
      obj.parent.worldToLocal(tmpV);
      const want = Math.atan2(tmpV.x - obj.position.x, tmpV.z - obj.position.z);
      if (!this.data.speed) { obj.rotation.y = want; return; }
      const diff = Math.atan2(Math.sin(want - obj.rotation.y), Math.cos(want - obj.rotation.y));
      obj.rotation.y += diff * Math.min(1, (this.data.speed * dt) / 1000);
    },
  });

  window.StoreFX = { Sound, pulse, Ambience };
})();
