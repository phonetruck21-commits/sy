/* דמויות: מבקרים (מבוגר/ילד) וחיות מחמד (כלב/חתול), עם אנימציית הליכה.
 * כל דמות מחזירה { object, update(dt, speed) }. החזית פונה ל-+z.
 */
(function () {
  'use strict';

  const mats = new Map();
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }));
    return mats.get(key);
  }
  function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; }
  const G = {
    cap: (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14),
    sph: (r) => new THREE.SphereGeometry(r, 20, 14),
    cyl: (r1, r2, h) => new THREE.CylinderGeometry(r1, r2, h, 14),
    cone: (r, h) => new THREE.ConeGeometry(r, h, 12),
  };
  const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

  /* ---------- מבקר ---------- */
  function person({ color = '#29335c', skin = '#e0ac69', kid = false, hair = '#2b2018', pants = '#2f3542' } = {}) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const limb = (r, l, m) => { const pivot = new THREE.Group(); pivot.add(mesh(G.cap(r, l), m, 0, -l / 2 - r * 0.6, 0)); return pivot; };

    const legs = [-1, 1].map((s) => { const l = limb(0.075, 0.62, mat(pants)); l.position.set(s * 0.1, 0.86, 0); body.add(l); return l; });
    [-1, 1].forEach((s) => body.add(mesh(new THREE.BoxGeometry(0.12, 0.07, 0.24), mat('#f5f5f5'), s * 0.1, 0.035, 0.04)));
    body.add(mesh(G.cap(0.2, 0.42), mat(color), 0, 1.15, 0));
    const arms = [-1, 1].map((s) => { const a = limb(0.06, 0.48, mat(color)); a.position.set(s * 0.27, 1.38, 0); body.add(a); return a; });
    arms.forEach((a) => a.add(mesh(G.sph(0.06), mat(skin), 0, -0.62, 0)));
    const head = new THREE.Group();
    head.position.set(0, 1.62, 0);
    head.add(mesh(G.sph(0.17), mat(skin)));
    const hairCap = mesh(new THREE.SphereGeometry(0.178, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hair), 0, 0.02, -0.015);
    hairCap.rotation.x = -0.25;
    head.add(hairCap);
    [-1, 1].forEach((s) => head.add(mesh(G.sph(0.022), mat('#1b1b1b'), s * 0.06, 0.02, 0.155)));
    const smile = mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), mat('#7a3b2e'), 0, -0.05, 0.155);
    smile.rotation.z = Math.PI;
    head.add(smile);
    body.add(head);
    if (kid) root.scale.setScalar(0.66);

    let phase = Math.random() * 6;
    return {
      object: root, head, height: kid ? 1.85 * 0.66 : 1.85,
      update(dt, speed) {
        const moving = speed > 0.08;
        phase += dt * (moving ? 7 + speed * 2 : 1.4);
        const sw = moving ? Math.sin(phase) * 0.55 : 0;
        legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
        arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = sw * 0.8;
        body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.03 : Math.sin(phase) * 0.006;
      },
      wave(t) { arms[1].rotation.z = -2.6 + Math.sin(t * 12) * 0.35; },
      unwave() { arms[1].rotation.z = 0; },
    };
  }

  /* ---------- כלב ---------- */
  function dog(color = '#d8a35d') {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const fur = mat(color), dark = mat(shade(color, 0.55)), nose = mat('#1b1b1b');
    const torso = mesh(G.cap(0.13, 0.32), fur, 0, 0.36, 0); torso.rotation.x = Math.PI / 2; body.add(torso);
    const head = new THREE.Group();
    head.position.set(0, 0.52, 0.28);
    head.add(mesh(G.sph(0.12), fur));
    const snout = mesh(G.cap(0.06, 0.08), fur, 0, -0.03, 0.11); snout.rotation.x = Math.PI / 2; head.add(snout);
    head.add(mesh(G.sph(0.03), nose, 0, -0.02, 0.2));
    [-1, 1].forEach((s) => {
      head.add(mesh(G.sph(0.018), nose, s * 0.05, 0.03, 0.1));
      const ear = mesh(G.cap(0.045, 0.08), dark, s * 0.1, 0.03, -0.01);
      ear.rotation.z = s * 0.35;
      head.add(ear);
    });
    body.add(head);
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.08, 0.3, sz * 0.15);
      pivot.add(mesh(G.cyl(0.035, 0.03, 0.28), fur, 0, -0.14, 0));
      body.add(pivot);
      return pivot;
    });
    const tail = new THREE.Group();
    tail.position.set(0, 0.42, -0.26);
    const tm = mesh(G.cap(0.025, 0.16), fur, 0, 0.09, 0);
    tail.add(tm);
    tail.rotation.x = -0.7;
    body.add(tail);
    let phase = Math.random() * 6;
    return {
      object: root,
      update(dt, speed) {
        const moving = speed > 0.08;
        phase += dt * (moving ? 10 + speed * 4 : 2);
        const sw = moving ? Math.sin(phase) * 0.6 : 0;
        legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
        tail.rotation.z = Math.sin(phase * (moving ? 1 : 3.5)) * 0.6;
        body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.02 : 0;
        head.rotation.y = moving ? 0 : Math.sin(phase * 0.4) * 0.3;
      },
    };
  }

  /* ---------- חתול ---------- */
  function cat(color = '#8a8f98') {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const fur = mat(color), pink = mat('#e7a5a5'), eye = mat('#9acd32', { emissive: '#3a5a10' });
    const torso = mesh(G.cap(0.09, 0.26), fur, 0, 0.24, 0); torso.rotation.x = Math.PI / 2; body.add(torso);
    const head = new THREE.Group();
    head.position.set(0, 0.36, 0.2);
    head.add(mesh(G.sph(0.09), fur));
    [-1, 1].forEach((s) => {
      const ear = mesh(G.cone(0.035, 0.07), fur, s * 0.05, 0.08, 0);
      ear.rotation.z = -s * 0.25;
      head.add(ear);
      head.add(mesh(G.sph(0.017), eye, s * 0.035, 0.015, 0.08));
    });
    head.add(mesh(G.sph(0.012), pink, 0, -0.01, 0.09));
    body.add(head);
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.055, 0.2, sz * 0.12);
      pivot.add(mesh(G.cyl(0.022, 0.02, 0.2), fur, 0, -0.1, 0));
      body.add(pivot);
      return pivot;
    });
    const tail = new THREE.Group();
    tail.position.set(0, 0.28, -0.2);
    tail.add(mesh(G.cap(0.02, 0.26), fur, 0, 0.14, 0));
    tail.rotation.x = -0.35;
    body.add(tail);
    let phase = Math.random() * 6;
    return {
      object: root,
      update(dt, speed) {
        const moving = speed > 0.08;
        phase += dt * (moving ? 9 + speed * 3 : 1.2);
        const sw = moving ? Math.sin(phase) * 0.5 : 0;
        legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
        tail.rotation.z = Math.sin(phase * 0.7) * 0.4;
      },
    };
  }

  function pet(kind, color) {
    if (kind === 'dog') return dog(color);
    if (kind === 'cat') return cat(color);
    return null;
  }

  /* ---------- תגית שם / בועת דיבור ---------- */
  const FONT = '"Heebo", "Segoe UI", Arial, sans-serif';
  function label(text, { bg = 'rgba(20,20,22,0.82)', fg = '#ffffff', size = 0.07, maxW = 1.4, bold = 500 } = {}) {
    const ppm = 900;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = `${bold} ${size * ppm}px ${FONT}`;
    const lines = [];
    const words = String(text).split(' ');
    let line = '';
    words.forEach((w) => { const t2 = line ? `${line} ${w}` : w; if (ctx.measureText(t2).width > maxW * ppm && line) { lines.push(line); line = w; } else line = t2; });
    lines.push(line);
    const pad = size * 0.55 * ppm;
    const w = Math.min(maxW * ppm, Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2;
    const lh = size * 1.3 * ppm;
    const hgt = lines.length * lh + pad * 1.2;
    c.width = Math.ceil(w); c.height = Math.ceil(hgt);
    ctx.font = `${bold} ${size * ppm}px ${FONT}`;
    const r = Math.min(hgt / 2, size * 0.9 * ppm);
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, c.width, c.height, r); else ctx.rect(0, 0, c.width, c.height);
    ctx.fill();
    ctx.fillStyle = fg; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad * 0.6 + lh * (i + 0.5)));
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(c.width / ppm, c.height / ppm, 1);
    sprite.renderOrder = 5;
    sprite.userData.dispose = () => { tex.dispose(); sprite.material.dispose(); };
    return sprite;
  }

  /* ---------- חיה שהולכת אחרי מישהו ---------- */
  function follower(petObj, getTarget, opts = {}) {
    const pos = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let init = false;
    const offset = opts.offset || 0.75;
    return {
      update(dt) {
        const t = getTarget(tmp);
        if (!t) return;
        if (!init) { pos.set(t.x + 0.6, t.y, t.z + 0.4); init = true; }
        const dx = t.x - pos.x, dz = t.z - pos.z;
        const dist = Math.hypot(dx, dz);
        let speed = 0;
        if (dist > offset) {
          const step = Math.min(dist - offset, (dist > 3 ? 4.5 : 2.2) * dt);
          pos.x += (dx / dist) * step; pos.z += (dz / dist) * step;
          speed = step / Math.max(dt, 1e-3);
          petObj.object.rotation.y = Math.atan2(dx, dz);
        }
        pos.y += (t.y - pos.y) * Math.min(1, dt * 8);
        petObj.object.position.copy(pos);
        petObj.update(dt, speed);
      },
      position: pos,
    };
  }

  window.StoreCharacters = { person, dog, cat, pet, label, follower };
})();
