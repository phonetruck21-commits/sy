/* אפקטים: סאונד, רטט בבקרים, תפיסת מוצרים ביד, "מעוף" לסל וקונפטי. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  סאונד – נוצר בזמן אמת עם Web Audio (אין קבצי שמע)                  *
   * ------------------------------------------------------------------ */
  const MUSIC_KEY = 'vrstore-music';
  const Sound = {
    ctx: null,
    master: null,
    music: null,
    musicOn: (() => { try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch (e) { return true; } })(),
    timer: null,
    step: 0,
    listeners: [],

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.music = this.ctx.createGain();
        this.music.gain.value = 0;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        this.music.connect(lp).connect(this.master);
        this.setMusic(this.musicOn);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    tone(freq, dur, { type = 'sine', vol = 0.1, when = 0, to = null, dest = null } = {}) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest || this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    hover() { this.tone(1500, 0.05, { vol: 0.025 }); },
    click() { this.tone(700, 0.08, { type: 'triangle', vol: 0.08, to: 1000 }); },
    whoosh() { this.tone(300, 0.35, { type: 'sine', vol: 0.05, to: 1200 }); },
    add() { // "קה-צ'ינג"
      this.tone(988, 0.12, { type: 'triangle', vol: 0.1 });
      this.tone(1319, 0.25, { type: 'triangle', vol: 0.1, when: 0.09 });
      this.tone(2637, 0.35, { type: 'sine', vol: 0.04, when: 0.09 });
    },
    success() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.09, when: i * 0.09 }));
    },
    blip() { this.tone(620, 0.06, { type: 'sine', vol: 0.05, to: 820 }); this.tone(900, 0.07, { vol: 0.04, when: 0.07 }); },

    /* מוזיקת רקע רגועה: אקורדים רכים + פעמונים בסולם פנטטוני */
    CHORDS: [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 392.0],  // G
    ],
    BELLS: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],
    musicTick() {
      if (!this.ctx || !this.musicOn) return;
      const beat = this.step % 8;
      if (beat === 0) {
        const chord = this.CHORDS[(this.step / 8) % this.CHORDS.length];
        chord.forEach((f) => {
          this.pad(f, 4.2);
          this.pad(f * 1.003, 4.2, 'triangle', 0.012);
        });
        this.pad(chord[0] / 2, 4.2, 'sine', 0.05);
      }
      if (beat % 2 === 1 && Math.random() < 0.55) {
        const f = this.BELLS[Math.floor(Math.random() * this.BELLS.length)];
        this.tone(f, 1.4, { vol: 0.035, dest: this.music });
      }
      this.step++;
    },
    pad(freq, dur, type = 'sine', vol = 0.03) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + dur + 0.1);
    },
    setMusic(on) {
      this.musicOn = on;
      try { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (this.ctx) {
        this.music.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.4);
        if (on && !this.timer) { this.step = 0; this.musicTick(); this.timer = setInterval(() => this.musicTick(), 520); }
        if (!on && this.timer) { clearInterval(this.timer); this.timer = null; }
      }
      this.listeners.forEach((fn) => fn(on));
    },
    toggleMusic() { this.unlock(); this.setMusic(!this.musicOn); },
    onMusicChange(fn) { this.listeners.push(fn); },
  };

  // הדפדפן מאפשר סאונד רק אחרי פעולה של המשתמש
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => Sound.unlock(), { passive: true }));

  /* ------------------------------------------------------------------ *
   *  רטט בבקר כשמכוונים על משהו לחיץ                                     *
   * ------------------------------------------------------------------ */
  function pulse(handEl, intensity = 0.3, ms = 25) {
    try {
      const tc = handEl.components['tracked-controls'];
      const gp = tc && tc.controller && tc.controller.gamepad;
      const act = gp && gp.hapticActuators && gp.hapticActuators[0];
      if (act && act.pulse) act.pulse(intensity, ms);
    } catch (e) { /* בקר בלי רטט */ }
  }

  AFRAME.registerComponent('haptics', {
    init() {
      this.el.addEventListener('raycaster-intersection', () => pulse(this.el, 0.25, 20));
    },
  });

  /* ------------------------------------------------------------------ *
   *  תפיסת מוצר ביד (כפתור Grip בבקר)                                    *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('grabber', {
    init() {
      this.held = null;
      this.anim = null;
      this.el.addEventListener('gripdown', () => this.grab());
      this.el.addEventListener('gripup', () => this.release());
    },
    grab() {
      if (this.held) return;
      const rc = this.el.components.raycaster;
      const target = rc && rc.intersectedEls.find((e) => e.classList.contains('product-model'));
      if (!target || target.dataset.held) return;
      const obj = target.object3D;
      target.dataset.held = '1';
      this.held = {
        el: target,
        parent: obj.parent,
        pos: obj.position.clone(),
        quat: obj.quaternion.clone(),
        scale: obj.scale.clone(),
      };
      if (target.components.spin) target.components.spin.paused = true;
      this.el.object3D.attach(obj);
      this.anim = { obj, fromPos: obj.position.clone(), toPos: new THREE.Vector3(0, -0.02, -0.14), fromQ: obj.quaternion.clone(), toQ: new THREE.Quaternion(), t: 0, dur: 250 };
      obj.scale.setScalar(this.held.scale.x);
      pulse(this.el, 0.6, 60);
      Sound.whoosh();
      target.emit('product-grabbed', { hand: this.el }, false);
    },
    release() {
      if (!this.held) return;
      const h = this.held;
      const obj = h.el.object3D;
      h.parent.attach(obj);
      this.anim = { obj, fromPos: obj.position.clone(), toPos: h.pos, fromQ: obj.quaternion.clone(), toQ: h.quat, t: 0, dur: 350, done: () => {
        obj.scale.copy(h.scale);
        delete h.el.dataset.held;
        if (h.el.components.spin) h.el.components.spin.paused = false;
      } };
      this.held = null;
      pulse(this.el, 0.2, 30);
    },
    tick(t, dt) {
      const a = this.anim;
      if (!a) return;
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = 1 - Math.pow(1 - a.t, 3);
      a.obj.position.lerpVectors(a.fromPos, a.toPos, k);
      a.obj.quaternion.slerpQuaternions(a.fromQ, a.toQ, k);
      if (a.t >= 1) { this.anim = null; if (a.done) a.done(); }
    },
  });

  /* ------------------------------------------------------------------ *
   *  פונה תמיד למשתמש (על ציר Y)                                        *
   * ------------------------------------------------------------------ */
  const tmpV = new THREE.Vector3();
  AFRAME.registerComponent('face-camera', {
    schema: { speed: { default: 4 } },
    init() { this.cam = null; },
    tick(t, dt) {
      if (!this.cam) this.cam = document.querySelector('#camera');
      const obj = this.el.object3D;
      if (!this.cam || !obj.parent) return;
      this.cam.object3D.getWorldPosition(tmpV);
      obj.parent.worldToLocal(tmpV);
      const want = Math.atan2(tmpV.x - obj.position.x, tmpV.z - obj.position.z);
      const diff = Math.atan2(Math.sin(want - obj.rotation.y), Math.cos(want - obj.rotation.y));
      obj.rotation.y += diff * Math.min(1, (this.data.speed * dt) / 1000);
    },
  });

  /* להבה מהבהבת לנרות */
  AFRAME.registerComponent('flicker', {
    tick(t) {
      this.el.object3D.traverse((o) => {
        if (o.userData && o.userData.flicker) o.scale.y = 1.6 + Math.sin(t / 70) * 0.15 + Math.sin(t / 23) * 0.08;
      });
    },
  });

  /* ------------------------------------------------------------------ *
   *  מוצר "עף" לסל                                                     *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('fly-to', {
    schema: { dur: { default: 750 } },
    init() { this.t = 0; },
    tick(t, dt) {
      const d = this.el.flyData;
      if (!d) return;
      this.t = Math.min(1, this.t + dt / this.data.dur);
      const k = this.t * this.t * (3 - 2 * this.t);
      const o = this.el.object3D;
      d.target(tmpV);
      o.position.lerpVectors(d.from, tmpV, k);
      o.position.y += Math.sin(k * Math.PI) * 0.35;
      o.scale.setScalar(THREE.MathUtils.lerp(1, 0.15, k));
      o.rotation.y += dt / 120;
      if (this.t >= 1) { d.done && d.done(tmpV.clone()); this.el.parentNode && this.el.parentNode.removeChild(this.el); }
    },
  });

  function flyToCart(object3D, fromWorld, targetFn, done) {
    const scene = document.querySelector('a-scene');
    const el = document.createElement('a-entity');
    el.flyData = { from: fromWorld.clone(), target: targetFn, done };
    el.setObject3D('mesh', object3D);
    el.setAttribute('fly-to', '');
    el.object3D.position.copy(fromWorld);
    scene.appendChild(el);
    Sound.whoosh();
  }

  /* ------------------------------------------------------------------ *
   *  פיצוץ קונפטי תלת-ממדי                                              *
   * ------------------------------------------------------------------ */
  const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15'];
  AFRAME.registerComponent('burst', {
    schema: { count: { default: 40 }, speed: { default: 1.6 }, life: { default: 1800 } },
    init() {
      this.parts = [];
      const geo = new THREE.PlaneGeometry(0.035, 0.022);
      for (let i = 0; i < this.data.count; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], side: THREE.DoubleSide, transparent: true }));
        const a = Math.random() * Math.PI * 2, up = 0.6 + Math.random() * 0.8;
        m.userData.v = new THREE.Vector3(Math.cos(a) * (0.3 + Math.random()), up * 1.5, Math.sin(a) * (0.3 + Math.random())).multiplyScalar(this.data.speed);
        m.userData.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        this.el.object3D.add(m);
        this.parts.push(m);
      }
      this.age = 0;
    },
    tick(t, dt) {
      const s = dt / 1000;
      this.age += dt;
      const fade = 1 - this.age / this.data.life;
      this.parts.forEach((m) => {
        m.userData.v.y -= 3.2 * s;
        m.userData.v.multiplyScalar(0.985);
        m.position.addScaledVector(m.userData.v, s);
        m.rotation.x += m.userData.spin.x * s; m.rotation.y += m.userData.spin.y * s; m.rotation.z += m.userData.spin.z * s;
        m.material.opacity = Math.max(0, fade);
      });
      if (this.age > this.data.life) {
        this.parts.forEach((m) => m.material.dispose());
        this.el.parentNode && this.el.parentNode.removeChild(this.el);
      }
    },
  });

  function burst(worldPos, opts = {}) {
    const el = document.createElement('a-entity');
    el.setAttribute('burst', opts);
    el.object3D.position.copy(worldPos);
    document.querySelector('a-scene').appendChild(el);
  }

  /* קונפטי על המסך (HTML) – אחרי תשלום */
  function confettiDOM() {
    const box = document.createElement('div');
    box.className = 'confetti';
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.style.animationDuration = 2 + Math.random() * 1.5 + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4500);
  }

  window.StoreFX = { Sound, pulse, flyToCart, burst, confettiDOM };
})();
