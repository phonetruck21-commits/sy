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

  /* ---------- מבקר ----------
   * look: { color (חולצה), skin, hair (צבע), hairStyle: short|long|ponytail|curly, acc: none|cap|glasses, pants, kid }
   */
  const SKINS = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
  const HAIRS = ['#2b2018', '#5a3a22', '#a8642c', '#d9b26a', '#9a9a9a'];
  const HAIR_STYLES = ['short', 'long', 'ponytail', 'curly'];

  function person(look = {}) {
    const color = look.color || '#29335c';
    const skin = look.skin || '#e0ac69';
    const hairC = look.hair || '#2b2018';
    const style = HAIR_STYLES.includes(look.hairStyle) ? look.hairStyle : 'short';
    const kid = !!look.kid;
    const pants = look.pants || shade(color, 0.32);
    const M = {
      skin: new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffd0c0'), sheenRoughness: 0.6 }),
      top: new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4), sheenRoughness: 0.8 }),
      topDark: mat(shade(color, 0.78), { roughness: 0.8 }),
      pants: mat(pants, { roughness: 0.85 }),
      shoe: mat('#f4f2ee', { roughness: 0.5 }),
      sole: mat('#3a3a3a', { roughness: 0.8 }),
      hair: mat(hairC, { roughness: 0.55 }),
      white: mat('#ffffff', { roughness: 0.25 }),
      iris: mat('#2b1d14', { roughness: 0.2 }),
      lip: mat(shade(skin, 0.62), { roughness: 0.5 }),
      cheek: new THREE.MeshBasicMaterial({ color: '#ff8a80', transparent: true, opacity: 0.28, depthWrite: false }),
    };
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    // צל רך מתחת לרגליים
    if (window.StoreEnv) { const sh = window.StoreEnv.shadowMesh(0.7, 0.55, 0.45); sh.position.y = 0.012; root.add(sh); }

    /* רגליים: ירך -> ברך -> נעל */
    const legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.095, 0.9, 0);
      hip.add(mesh(G.cyl(0.075, 0.062, 0.46), M.pants, 0, -0.23, 0));
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      knee.add(mesh(G.cyl(0.062, 0.05, 0.42), M.pants, 0, -0.21, 0));
      const shoe = new THREE.Group(); shoe.position.set(0, -0.43, 0.03);
      const toe = mesh(G.cap(0.055, 0.12), M.shoe, 0, 0, 0); toe.rotation.x = Math.PI / 2; toe.scale.set(1.05, 1, 0.75); shoe.add(toe);
      shoe.add(mesh(new THREE.BoxGeometry(0.11, 0.025, 0.24), M.sole, 0, -0.04, 0));
      knee.add(shoe);
      body.add(hip);
      return { hip, knee };
    });

    /* גוף: חולצה מעוצבת (פרופיל מסתובב) */
    const prof = [[0.001, 0], [0.15, 0], [0.16, 0.05], [0.15, 0.18], [0.17, 0.34], [0.19, 0.46], [0.17, 0.53], [0.09, 0.57], [0.001, 0.58]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const torso = new THREE.Group(); torso.position.y = 0.86; body.add(torso);
    const shirt = mesh(new THREE.LatheGeometry(prof, 28), M.top); shirt.scale.z = 0.72; torso.add(shirt);
    const belt = mesh(G.cyl(0.152, 0.152, 0.06), M.pants, 0, 0.03, 0); belt.scale.z = 0.74; torso.add(belt); // חגורה
    const hem = mesh(new THREE.TorusGeometry(0.155, 0.012, 6, 28), M.topDark, 0, 0.065, 0); hem.rotation.x = Math.PI / 2; hem.scale.y = 0.74; torso.add(hem);
    torso.add(mesh(G.cyl(0.05, 0.055, 0.1), M.skin, 0, 0.6, 0)); // צוואר
    const collar = mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 20), M.topDark, 0, 0.57, 0); collar.rotation.x = Math.PI / 2; torso.add(collar);

    /* ידיים: כתף (שרוול) -> מרפק -> אמה -> כף יד */
    const arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.2, 0.5, 0); torso.add(sh);
      sh.add(mesh(G.sph(0.062), M.top, 0, 0, 0));
      sh.add(mesh(G.cyl(0.058, 0.05, 0.26), M.top, 0, -0.13, 0));
      const elbow = new THREE.Group(); elbow.position.y = -0.27; sh.add(elbow);
      elbow.add(mesh(G.cyl(0.042, 0.036, 0.24), M.skin, 0, -0.12, 0));
      const hand = mesh(G.sph(0.048), M.skin, 0, -0.27, 0.005); hand.scale.set(0.85, 1.1, 0.7); elbow.add(hand);
      sh.rotation.z = s * 0.08;
      return { sh, elbow, s };
    });

    /* ראש */
    const head = new THREE.Group(); head.position.y = 0.72; torso.add(head);
    const skull = mesh(G.sph(0.135), M.skin, 0, 0.13, 0); skull.scale.set(0.9, 1.16, 1.0);
    const jaw = mesh(G.sph(0.1), M.skin, 0, 0.06, 0.03); jaw.scale.set(0.95, 0.8, 1.0); head.add(jaw); head.add(skull);
    [-1, 1].forEach((s) => { const ear = mesh(G.sph(0.035), M.skin, s * 0.142, 0.12, -0.005); ear.scale.set(0.55, 1, 0.8); head.add(ear); });
    const nose = mesh(G.sph(0.018), mat(shade(skin, 0.95)), 0, 0.105, 0.128); nose.scale.set(0.75, 1.3, 1.1); head.add(nose);
    const eyes = [-1, 1].map((s) => {
      const e = new THREE.Group(); e.position.set(s * 0.045, 0.135, 0.126);
      const w = mesh(G.sph(0.016), M.white); w.scale.set(1.25, 0.8, 0.5); e.add(w);
      e.add(mesh(G.sph(0.0085), M.iris, 0, 0, 0.006));
      const lid = mesh(G.sph(0.018), M.skin, 0, 0.006, -0.002); lid.scale.set(1.3, 0.55, 0.6); e.add(lid);
      head.add(e);
      const brow = mesh(new THREE.BoxGeometry(0.042, 0.008, 0.01), M.hair, s * 0.046, 0.163, 0.134); brow.rotation.z = -s * 0.06; head.add(brow);
      return e;
    });
    const mouth = mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 14, Math.PI * 0.8), M.lip, 0, 0.066, 0.131); mouth.rotation.z = Math.PI * 1.1; head.add(mouth);

    /* שיער */
    const capGeo = (r, cut) => new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI * cut);
    const cap = mesh(capGeo(0.158, 0.5), M.hair, 0, 0.14, -0.008); cap.scale.set(0.98, 1.1, 1.02); cap.rotation.x = -0.32; head.add(cap);
    const fringe = mesh(capGeo(0.16, 0.22), M.hair, 0, 0.16, 0.012); fringe.rotation.x = 0.55; fringe.scale.set(0.97, 1, 1); head.add(fringe);
    if (style === 'long') {
      const back = mesh(G.cap(0.12, 0.2), M.hair, 0, 0.02, -0.07); back.scale.set(1.15, 1, 0.6); head.add(back);
      [-1, 1].forEach((s) => { const side = mesh(G.cap(0.045, 0.18), M.hair, s * 0.13, 0.04, 0.02); head.add(side); });
    } else if (style === 'ponytail') {
      head.add(mesh(G.sph(0.03), M.hair, 0, 0.2, -0.15));
      const tail = mesh(G.cap(0.05, 0.16), M.hair, 0, 0.09, -0.19); tail.rotation.x = 0.35; head.add(tail);
    } else if (style === 'curly') {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, rr = i % 2 ? 0.13 : 0.1, y = 0.2 + (i % 3) * 0.03;
        const z = Math.sin(a) * rr;
        if (z > 0.1 && y < 0.24) continue;
        head.add(mesh(G.sph(0.05), M.hair, Math.cos(a) * rr, y, z - 0.02));
      }
    }

    /* אביזרים */
    if (look.acc === 'cap') {
      const hat = mat(shade(color, 1.0), { roughness: 0.6 });
      const crown = mesh(capGeo(0.165, 0.42), hat, 0, 0.16, -0.005); crown.scale.set(1, 0.95, 1.02); crown.rotation.x = -0.2; head.add(crown);
      const brim = mesh(G.cyl(0.11, 0.11, 0.012), hat, 0, 0.215, 0.15); brim.scale.z = 0.75; brim.rotation.x = 0.12; head.add(brim);
      head.add(mesh(G.sph(0.012), mat('#ffffff'), 0, 0.33, -0.01));
    } else if (look.acc === 'glasses') {
      const frame = mat('#1d1d1f', { roughness: 0.3, metalness: 0.3 });
      [-1, 1].forEach((s) => head.add(mesh(new THREE.TorusGeometry(0.034, 0.005, 6, 20), frame, s * 0.053, 0.14, 0.152)));
      head.add(mesh(new THREE.BoxGeometry(0.035, 0.006, 0.006), frame, 0, 0.145, 0.155));
      [-1, 1].forEach((s) => { const arm = mesh(new THREE.BoxGeometry(0.006, 0.006, 0.13), frame, s * 0.088, 0.14, 0.09); arm.rotation.y = -s * 0.25; head.add(arm); });
    }

    root.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
    if (kid) { root.scale.setScalar(0.64); head.scale.setScalar(1.1); }

    let phase = Math.random() * 6, blink = 1 + Math.random() * 3, clock = 0;
    let act = null, actT = 0, pose = null;
    const DUR = { wave: 1.8, dance: 3.2, jump: 0.9 };
    const lookAround = { t: 0, yaw: 0, target: 0 };

    return {
      object: root, head, height: kid ? 1.78 * 0.64 * 1.05 : 1.78,
      play(name) { if (DUR[name]) { act = name; actT = 0; } },
      setPose(p) { pose = p; },
      update(dt, speed) {
        clock += dt;
        const moving = speed > 0.08;
        phase += dt * (moving ? 6.5 + speed * 2 : 1.6);
        const sw = moving ? Math.sin(phase) * 0.5 : 0;
        legs.forEach((l, i) => {
          const sgn = i ? -1 : 1;
          l.hip.rotation.x = sw * sgn;
          l.knee.rotation.x = moving ? Math.max(0, -Math.sin(phase * sgn + (i ? Math.PI : 0)) * 0.7) : 0;
        });
        arms.forEach((a, i) => {
          const sgn = i ? 1 : -1;
          a.sh.rotation.x = sw * sgn * 0.8;
          a.sh.rotation.z = a.s * 0.08;
          a.elbow.rotation.x = moving ? -0.35 : -0.12;
        });
        torso.rotation.set(0, moving ? Math.sin(phase) * 0.06 : 0, 0);
        body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.025 : 0;
        torso.scale.y = 1 + (moving ? 0 : Math.sin(clock * 1.8) * 0.006); // נשימה
        // מצמוץ
        blink -= dt;
        const closed = blink < 0.12;
        eyes.forEach((e) => { e.scale.y = closed ? 0.1 : 1; });
        if (blink < 0) blink = 2 + Math.random() * 3.5;
        // מבט סביב בעמידה
        lookAround.t -= dt;
        if (lookAround.t < 0) { lookAround.t = 2 + Math.random() * 3; lookAround.target = moving ? 0 : (Math.random() - 0.5) * 0.9; }
        lookAround.yaw += (lookAround.target - lookAround.yaw) * Math.min(1, dt * 3);
        head.rotation.set(0, lookAround.yaw, 0);
        // ישיבה (ספסל) או גלישה: ירכיים קדימה וברכיים כפופות
        if (pose === 'sit' || pose === 'slide') {
          legs.forEach((l) => { l.hip.rotation.x = -1.45; l.knee.rotation.x = pose === 'sit' ? 1.45 : 0.25; });
          body.position.y = pose === 'sit' ? -0.42 : -0.4;
          if (pose === 'slide') arms.forEach((a) => { a.sh.rotation.z = a.s * 1.2; });
        }
        // פעולות מיוחדות
        if (act) {
          actT += dt;
          const k = actT / DUR[act];
          const R = arms[1], L = arms[0];
          if (act === 'wave') {
            R.sh.rotation.z = R.s * 2.35; R.sh.rotation.x = 0; R.elbow.rotation.x = 0;
            R.elbow.rotation.z = R.s * (0.35 + Math.sin(actT * 14) * 0.4);
            head.rotation.z = -R.s * 0.08;
          } else if (act === 'dance') {
            const b = Math.sin(actT * 8);
            R.sh.rotation.z = R.s * (2.3 + b * 0.35); L.sh.rotation.z = L.s * (2.3 - b * 0.35);
            R.elbow.rotation.x = L.elbow.rotation.x = -0.6;
            body.position.y = Math.abs(b) * 0.06;
            torso.rotation.y = b * 0.35; torso.rotation.z = b * 0.08;
            head.rotation.z = -b * 0.12;
            legs[0].knee.rotation.x = Math.max(0, b) * 0.6; legs[1].knee.rotation.x = Math.max(0, -b) * 0.6;
          } else if (act === 'jump') {
            const j = Math.sin(Math.min(1, k) * Math.PI);
            body.position.y = j * 0.45;
            R.sh.rotation.z = R.s * 2.6 * j; L.sh.rotation.z = L.s * 2.6 * j;
            legs.forEach((l) => { l.knee.rotation.x = j * 0.9; l.hip.rotation.x = -j * 0.4; });
          }
          if (k >= 1) { act = null; arms.forEach((a) => { a.elbow.rotation.z = 0; }); head.rotation.z = 0; torso.rotation.z = 0; }
        }
      },
      get pose() { return pose; },
      wave() { if (act !== 'wave') this.play('wave'); },
      unwave() {},
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
    const p = kind === 'dog' ? dog(color) : kind === 'cat' ? cat(color) : null;
    if (p) p.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return p;
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
        const t = this.chase ? tmp.copy(this.chase) : getTarget(tmp);
        if (!t) return;
        if (!init) { pos.set(t.x + 0.6, t.y, t.z + 0.4); init = true; }
        const dx = t.x - pos.x, dz = t.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const off = this.chase ? 0.05 : offset;
        let speed = 0;
        if (dist > off) {
          const step = Math.min(dist - off, (this.chase ? 5.5 : dist > 3 ? 4.5 : 2.2) * dt);
          pos.x += (dx / dist) * step; pos.z += (dz / dist) * step;
          speed = step / Math.max(dt, 1e-3);
          petObj.object.rotation.y = Math.atan2(dx, dz);
        }
        pos.y += (t.y - pos.y) * Math.min(1, dt * 8);
        petObj.object.position.copy(pos);
        petObj.update(dt, speed);
      },
      position: pos,
      chase: null,
    };
  }

  window.StoreCharacters = { person, dog, cat, pet, label, follower, SKINS, HAIRS, HAIR_STYLES };
})();
