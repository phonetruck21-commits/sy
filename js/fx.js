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

  window.StoreFX = { Sound, pulse };
})();
