/* הרחבה שמסביב למשאית: גינת כלבים, פינת ילדים, נקודת מפגש,
 * ומשפחות עם כלבים שמטיילות (דמויות רקע – בלי שם ובלי צ'אט, כדי שלא יבלבלו עם מבקרים אמיתיים).
 */
(function () {
  'use strict';

  const C = () => window.StoreCharacters;
  const FONT = '"Heebo", "Segoe UI", Arial, sans-serif';
  const redrawers = [];
  const anims = [];
  const OBST = []; // [x, z, רדיוס] – כדי שהמצלמה לא תעבור דרך עצים ופנסים

  function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); return m;
  }
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });

  function sign(title, sub, w, h, bg, fg = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = Math.round(w * 400); c.height = Math.round(h * 400);
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const paint = () => {
      const W = c.width, H = c.height;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = fg; ctx.font = `700 ${H * (sub ? 0.36 : 0.5)}px ${FONT}`;
      ctx.fillText(title, W / 2, H * (sub ? 0.4 : 0.52));
      if (sub) { ctx.globalAlpha = 0.85; ctx.font = `400 ${H * 0.18}px ${FONT}`; ctx.fillText(sub, W / 2, H * 0.76); ctx.globalAlpha = 1; }
      tex.needsUpdate = true;
    };
    paint(); redrawers.push(paint);
    return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  }

  function post(g, x, z, w, h, title, sub, bg, ry = 0) {
    const s = new THREE.Group();
    s.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, h + 0.2, 10), std('#2b2c2f', { metalness: 0.6 }), [0, (h + 0.2) / 2, 0]));
    const panel = mesh(new THREE.PlaneGeometry(w, w * 0.32), sign(title, sub, w, w * 0.32, bg), [0, h + 0.2, 0.035]);
    s.add(panel);
    const back = mesh(new THREE.PlaneGeometry(w, w * 0.32), sign(title, sub, w, w * 0.32, bg), [0, h + 0.2, -0.035], [0, Math.PI, 0]);
    s.add(back);
    s.position.set(x, 0, z); s.rotation.y = ry;
    g.add(s);
  }

  /* ---------- גינת כלבים ---------- */
  function dogPark(g) {
    const x0 = -9.6, x1 = -4.6, z0 = 4.4, z1 = 9.4;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const grass = std('#6f9c4b', { roughness: 0.95 });
    g.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), grass, [cx, 0.03, cz]));
    // גדר נמוכה
    const rail = std('#f2efe8'), postM = std('#2b2c2f', { metalness: 0.5 });
    const fence = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      [0.35, 0.7].forEach((y) => g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, len), rail, [(ax + bx) / 2, y, (az + bz) / 2], [0, ang, 0])));
      const n = Math.round(len / 1.2);
      for (let i = 0; i <= n; i++) g.add(mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), postM, [ax + ((bx - ax) * i) / n, 0.4, az + ((bz - az) * i) / n]));
    };
    fence(x0, z0, x0, z1); fence(x0, z0, x1, z0); fence(x0, z1, x1 - 1.6, z1); fence(x1, z0, x1, z1 - 1.6);
    // ברז כיבוי, קערת מים, קשת זינוק, בית כלב
    const red = std('#c0392b', { roughness: 0.5 });
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 16), red, [x0 + 0.8, 0.33, z0 + 0.8]));
    g.add(mesh(new THREE.SphereGeometry(0.11, 16, 10), red, [x0 + 0.8, 0.6, z0 + 0.8]));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.08, 20), std('#4c8dff', { metalness: 0.4, roughness: 0.3 }), [x0 + 1.4, 0.1, z0 + 0.6]));
    const hoop = mesh(new THREE.TorusGeometry(0.4, 0.035, 10, 32), std('#f3a712'), [cx + 0.6, 0.62, cz], [0, Math.PI / 2, 0]);
    g.add(hoop);
    [-1, 1].forEach((s) => g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8), postM, [cx + 0.6, 0.31, cz + s * 0.4])));
    const house = new THREE.Group();
    house.add(mesh(new THREE.BoxGeometry(0.9, 0.6, 0.8), std('#b5651d'), [0, 0.36, 0]));
    const roof = mesh(new THREE.ConeGeometry(0.7, 0.4, 4), std('#7a3e12'), [0, 0.86, 0], [0, Math.PI / 4, 0]);
    house.add(roof);
    house.add(mesh(new THREE.CircleGeometry(0.18, 20), std('#2a1a0f'), [0, 0.3, 0.401]));
    house.position.set(x0 + 0.9, 0, z1 - 1.1); house.rotation.y = Math.PI / 2;
    g.add(house);
    post(g, x1 - 0.7, z1 + 0.15, 1.5, 1.6, 'גינת כלבים', 'הביאו את החבר הכי טוב שלכם', '#3f6b2a', 0);

    // שני כלבים משחקים בכדור
    const ball = mesh(new THREE.SphereGeometry(0.06, 14, 10), std('#d7f542', { roughness: 0.6 }));
    g.add(ball);
    const d1 = C().dog('#d8a35d'), d2 = C().dog('#2b2b2b');
    g.add(d1.object, d2.object);
    const p1 = new THREE.Vector2(cx - 1.2, cz), p2 = new THREE.Vector2(cx + 1.2, cz - 0.5);
    let tBall = 0, from = p1.clone(), to = p2.clone(), chaser = d2, waiter = d1;
    anims.push((dt) => {
      tBall += dt / 1.6;
      if (tBall >= 1) {
        tBall = 0;
        [from, to] = [to, new THREE.Vector2(cx + (Math.random() - 0.5) * 3, cz + (Math.random() - 0.5) * 3)];
        [chaser, waiter] = [waiter, chaser];
      }
      const bx = from.x + (to.x - from.x) * tBall, bz = from.y + (to.y - from.y) * tBall;
      ball.position.set(bx, 0.08 + Math.sin(tBall * Math.PI) * 1.2, bz);
      const run = (d, tx, tz, sp) => {
        const o = d.object.position, dx = tx - o.x, dz = tz - o.z, dist = Math.hypot(dx, dz);
        let v = 0;
        if (dist > 0.25) { const step = Math.min(dist, sp * dt); o.x += (dx / dist) * step; o.z += (dz / dist) * step; v = step / dt; d.object.rotation.y = Math.atan2(dx, dz); }
        o.y = 0.06;
        d.update(dt, v);
      };
      run(chaser, to.x, to.y, 3.2);
      run(waiter, from.x + 0.3, from.y + 0.3, 1.2);
    });
  }

  /* ---------- פינת ילדים ---------- */
  function kidsZone(g) {
    const x0 = 4.6, x1 = 9.6, z0 = 4.4, z1 = 9.4;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // רצפת גומי צבעונית
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const cols = ['#5bc0eb', '#fde74c', '#9bc53d', '#fa7921', '#e55934'];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.fillStyle = cols[(i + j * 2) % cols.length]; ctx.fillRect(i * 64, j * 64, 64, 64); }
    const tex = new THREE.CanvasTexture(c); if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    g.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), [cx, 0.03, cz]));

    // מגלשה
    const slide = new THREE.Group();
    const yellow = std('#fde74c', { roughness: 0.4 }), blue = std('#2e86ab', { roughness: 0.4 });
    slide.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), blue, [0, 1.3, 0]));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => slide.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), blue, [a * 0.4, 0.65, b * 0.4])));
    const chute = mesh(new THREE.BoxGeometry(0.6, 0.05, 2.0), yellow, [0, 0.72, 1.3], [0.62, 0, 0]);
    slide.add(chute);
    [-1, 1].forEach((s) => slide.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 2.0), yellow, [s * 0.3, 0.78, 1.3], [0.62, 0, 0])));
    for (let i = 0; i < 5; i++) slide.add(mesh(new THREE.BoxGeometry(0.7, 0.04, 0.12), blue, [0, 0.25 + i * 0.25, -0.55 - i * 0.02]));
    slide.position.set(x0 + 1.3, 0.06, z0 + 1.0);
    g.add(slide);

    // קרוסלה מסתובבת
    const car = new THREE.Group();
    car.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 40), std('#e55934', { roughness: 0.4 }), [0, 0.2, 0]));
    car.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 10), std('#f5f5f5', { metalness: 0.7, roughness: 0.2 }), [0, 0.8, 0]));
    car.add(mesh(new THREE.ConeGeometry(1.2, 0.5, 40, 1, true), std('#fde74c', { side: THREE.DoubleSide }), [0, 1.6, 0]));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const seat = mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), std(cols[i]), [Math.cos(a) * 0.75, 0.45, Math.sin(a) * 0.75]);
      car.add(seat);
      car.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), std('#f5f5f5', { metalness: 0.7 }), [Math.cos(a) * 0.75, 0.9, Math.sin(a) * 0.75]));
    }
    car.position.set(cx + 0.8, 0.06, cz + 0.6);
    g.add(car);
    anims.push((dt) => { car.rotation.y += dt * 0.6; });

    // בלונים
    const balloons = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Group();
      const col = cols[i % cols.length];
      b.add(mesh(new THREE.SphereGeometry(0.16, 18, 14), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.2, clearcoat: 1 }), [0, 0, 0]));
      const h = 1.4 + (i % 3) * 0.3;
      b.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, h, 4), std('#ffffff'), [0, -h / 2 - 0.16, 0]));
      b.position.set((Math.random() - 0.5) * 0.6, h + 0.2, (Math.random() - 0.5) * 0.6);
      b.userData.phase = Math.random() * 6;
      b.userData.y = b.position.y;
      balloons.add(b);
    }
    balloons.add(mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), std('#2b2c2f'), [0, 0.1, 0]));
    balloons.position.set(x0 + 0.4, 0.06, z1 - 0.4);
    g.add(balloons);
    anims.push((dt, t) => balloons.children.forEach((b) => { if (b.userData.y) { b.position.y = b.userData.y + Math.sin(t * 1.3 + b.userData.phase) * 0.05; b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.06; } }));

    post(g, x0 + 0.7, z1 + 0.15, 1.5, 1.6, 'פינת ילדים', 'מגלשה, קרוסלה ובלונים', '#e55934', 0);
  }

  /* ---------- נקודת מפגש ---------- */
  function meetingSpot(g) {
    post(g, -3.3, 4.7, 2.0, 1.9, 'נקודת מפגש', 'הכירו מבקרים, פתחו קבוצה וקנו ביחד', '#29335c', 0.55);
    OBST.push([-3.3, 4.7, 1.2]);
    // שרשרת נורות מהסוכך אל עמודים ברחבה
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe9b0', toneMapped: false });
    const wire = new THREE.MeshBasicMaterial({ color: '#222' });
    [[-4.2, 6.2], [4.2, 6.2]].forEach(([px, pz]) => {
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 8), std('#2b2c2f', { metalness: 0.6 }), [px, 1.6, pz]));
      const a = new THREE.Vector3(Math.sign(px) * 3.6, 3.5, 3.9), b = new THREE.Vector3(px, 3.15, pz);
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 0.35;
        pts.push(p);
        if (i % 2 === 0) g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), bulbMat, p.toArray()));
      }
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.005, 4), wire));
    });
  }


  /* ---------- עצים, פנסים, ערוגות ---------- */
  function greenery(g) {
    const trunkM = std('#6b4a32', { roughness: 0.9 });
    const leaves = ['#5f8f3e', '#6f9e47', '#4f7d35', '#7aa851'].map((c) => std(c, { roughness: 0.85, flatShading: true }));
    const r = ((seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(9);
    const spots = [];
    for (let x = -11, i = 0; x <= 11; x += 3.6, i++) spots.push([x + (r() - 0.5), 14.4 + r() * 0.8]);
    [-12.8, 12.8].forEach((x) => { for (let z = 1.5; z <= 12; z += 3.4) spots.push([x + (r() - 0.5) * 0.6, z]); });
    spots.forEach(([x, z]) => OBST.push([x, z, 1.2]));
    spots.forEach(([x, z]) => {
      const t = new THREE.Group();
      const hgt = 1.6 + r() * 0.9;
      t.add(mesh(new THREE.CylinderGeometry(0.09, 0.14, hgt, 8), trunkM, [0, hgt / 2, 0]));
      const crown = new THREE.Group(); crown.position.y = hgt;
      for (let k = 0; k < 4; k++) {
        const ball = mesh(new THREE.IcosahedronGeometry(0.75 + r() * 0.45, 1), leaves[(k + Math.floor(r() * 4)) % 4], [(r() - 0.5) * 0.9, 0.35 + r() * 0.8, (r() - 0.5) * 0.9]);
        crown.add(ball);
      }
      t.add(crown);
      t.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20), std('#7b6a58', { roughness: 1 }), [0, 0.04, 0])); // גומת עץ
      t.position.set(x, 0, z);
      g.add(t);
      const ph = r() * 6;
      anims.push((dt, time) => { crown.rotation.z = Math.sin(time * 0.7 + ph) * 0.025; crown.rotation.x = Math.cos(time * 0.55 + ph) * 0.02; });
    });

    // פנסי רחוב עם אור חם
    const pole = std('#26272a', { metalness: 0.6, roughness: 0.4 });
    const bulb = new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false });
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,160,0.9)'); gr.addColorStop(0.3, 'rgba(255,200,130,0.35)'); gr.addColorStop(1, 'rgba(255,200,130,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    [[-10.6, 11.2], [-5.4, 12.6], [5.4, 12.6], [10.6, 11.2]].forEach(([x, z]) => {
      OBST.push([x, z, 0.5]);
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 10), pole, [x, 1.6, z]));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.06, 16), pole, [x, 3.25, z]));
      g.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), bulb, [x, 3.12, z]));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      halo.scale.set(1.3, 1.3, 1); halo.position.set(x, 3.12, z); g.add(halo);
      const pool = mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [x, 0.045, z], [-Math.PI / 2, 0, 0]);
      g.add(pool);
    });

    // ערוגות פרחים משני צדי המדרגות
    const petals = ['#ff7aa2', '#ffd166', '#f78c6b', '#ffffff', '#c792ea'].map((c) => std(c, { roughness: 0.6 }));
    const soil = std('#4a3a2c', { roughness: 1 }), box2 = std('#efe9df', { roughness: 0.7 });
    [[-4.6, 2.55], [4.6, 2.55]].forEach(([x, z]) => {
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.4, 0.6), box2, [x, 0.2, z]));
      g.add(mesh(new THREE.BoxGeometry(1.1, 0.02, 0.5), soil, [x, 0.41, z]));
      for (let i = 0; i < 26; i++) {
        const fx = x + (r() - 0.5) * 1.0, fz = z + (r() - 0.5) * 0.42;
        g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), leaves[0], [fx, 0.48, fz]));
        g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), petals[i % petals.length], [fx, 0.56, fz]));
      }
    });
  }

  /* ---------- ציפורים בשמיים ---------- */
  function birds(g) {
    const m = new THREE.MeshBasicMaterial({ color: '#2c2f36', side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const wing = (s) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.08, s * 0.42, 0, 0], 3));
        const w = new THREE.Mesh(geo, m); b.add(w); return w;
      };
      const L = wing(1), R = wing(-1);
      g.add(b);
      const rad = 16 + i * 2.5, hgt = 13 + (i % 3) * 2.2, sp = 0.12 + (i % 2) * 0.05, ph = i * 1.1;
      anims.push((dt, t) => {
        const a = t * sp + ph;
        b.position.set(Math.cos(a) * rad, hgt + Math.sin(t * 0.6 + i) * 0.6, 4 + Math.sin(a) * rad * 0.7);
        b.rotation.y = -a;
        const f = Math.sin(t * 9 + i) * 0.6;
        L.rotation.z = f; R.rotation.z = -f;
      });
    }
  }

  /* ---------- מכונת בועות בפינת הילדים ---------- */
  function bubbles(g) {
    const base = new THREE.Group();
    base.add(mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), std('#5bc0eb', { roughness: 0.4 }), [0, 0.24, 0]));
    base.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), std('#fde74c'), [0, 0.47, 0.05], [0.6, 0, 0]));
    base.position.set(8.6, 0.06, 6.0); base.rotation.y = -0.6;
    g.add(base);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0, metalness: 0, transmission: 0.95, thickness: 0.02, iridescence: 1, iridescenceIOR: 1.3, transparent: true, opacity: 0.55, depthWrite: false });
    const list = [];
    for (let i = 0; i < 22; i++) {
      const s = mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.06, 16, 12), mat);
      s.userData.t = Math.random() * 5;
      g.add(s); list.push(s);
    }
    const origin = new THREE.Vector3(8.5, 0.6, 6.15);
    anims.push((dt) => list.forEach((s, i) => {
      s.userData.t += dt;
      const t = s.userData.t % 5;
      s.position.set(origin.x - t * 0.5 + Math.sin(t * 2 + i) * 0.25, origin.y + t * 0.55 + Math.sin(t * 3 + i) * 0.05, origin.z + t * 0.35 + Math.cos(t * 1.7 + i) * 0.25);
      const k = t < 0.3 ? t / 0.3 : t > 4.6 ? (5 - t) / 0.4 : 1;
      s.scale.setScalar(Math.max(0.01, k));
    }));
  }

  /* ---------- משפחות שמטיילות ברחבה (רקע בלבד) ---------- */
  function strollers(g) {
    const routes = [
      [[-2, 6], [-6.5, 10.5], [-3.5, 11], [2, 7.5]],
      [[3, 6.5], [7.5, 10.6], [4, 11], [1.5, 8]],
    ];
    const families = [
      { adult: { color: '#669bbc', skin: '#f1c27d', hair: '#5a3a22', hairStyle: 'long', acc: 'glasses' }, kid: { color: '#f3a712', skin: '#f1c27d', hair: '#5a3a22', hairStyle: 'ponytail' }, pet: ['dog', '#c49a6c'] },
      { adult: { color: '#8e7dbe', skin: '#8d5524', hair: '#2b2018', hairStyle: 'curly' }, kid: { color: '#2a9d8f', skin: '#8d5524', hair: '#2b2018', hairStyle: 'short', acc: 'cap' }, pet: ['cat', '#e8e2d6'] },
    ];
    families.forEach((f, i) => {
      const adult = C().person(f.adult), kid = C().person({ ...f.kid, kid: true });
      const pet = C().pet(f.pet[0], f.pet[1]);
      g.add(adult.object, kid.object, pet.object);
      const route = routes[i].map(([x, z]) => new THREE.Vector2(x, z));
      let seg = 0, t = Math.random(), pause = 0;
      const pos = new THREE.Vector3();
      const kidF = C().follower(kid, (v) => v.copy(adult.object.position), { offset: 0.7 });
      const petF = C().follower(pet, (v) => v.copy(kid.object.position), { offset: 0.6 });
      anims.push((dt) => {
        let speed = 0;
        if (pause > 0) pause -= dt;
        else {
          const a = route[seg], b = route[(seg + 1) % route.length];
          const len = a.distanceTo(b);
          t += (0.9 * dt) / len;
          if (t >= 1) { t = 0; seg = (seg + 1) % route.length; pause = 1.5 + Math.random() * 2; }
          pos.set(a.x + (b.x - a.x) * t, 0.04, a.y + (b.y - a.y) * t);
          adult.object.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
          speed = 0.9;
        }
        adult.object.position.copy(pos);
        adult.update(dt, speed);
        kidF.update(dt);
        petF.update(dt);
      });
    });
  }

  AFRAME.registerComponent('plaza', {
    init() {
      const g = new THREE.Group();
      dogPark(g); kidsZone(g); meetingSpot(g); greenery(g); birds(g); bubbles(g); strollers(g);
      this.el.setObject3D('mesh', g);
      this.t = 0;
    },
    tick(t, dt) {
      const s = Math.min(dt, 50) / 1000;
      this.t += s;
      anims.forEach((fn) => fn(s, this.t));
    },
  });

  /* צללים: רק בחוץ (בתוך המשאית התאורה פנימית). כבויים במשקף לטובת ביצועים */
  AFRAME.registerComponent('atmosphere', {
    init() {
      const scene = this.el;
      const apply = () => {
        const T = window.StoreTruck && window.StoreTruck.T;
        if (!T) return;
        const p = new THREE.Vector3();
        const roots = [document.querySelector('#store-root').object3D, document.querySelector('#plaza').object3D];
        roots.forEach((root) => root.traverse((o) => {
          if (!o.isMesh || o.material.transparent || (o.material.isMeshBasicMaterial && !o.material.map)) return;
          o.getWorldPosition(p);
          const foot = p.x > T.X0 - 0.2 && p.x < T.CAB_X1 + 0.2 && p.z > T.Z0 - 0.2 && p.z < T.Z1 + 0.2;
          const loose = foot && p.y >= T.FLOOR - 0.05;
          const strict = p.x > T.X0 + 0.2 && p.x < T.X1 - 0.2 && p.z > T.Z0 + 0.15 && p.z < T.Z1 - 0.15 && p.y > T.FLOOR + 0.02 && p.y < T.CEIL - 0.05;
          o.receiveShadow = !loose && !o.material.isMeshBasicMaterial;
          o.castShadow = !strict && !o.material.isMeshBasicMaterial;
        }));
      };
      setTimeout(apply, 0);
      document.body.addEventListener('store-built', apply);
      const sun = () => document.querySelector('#sun');
      scene.addEventListener('enter-vr', () => { const s2 = sun(); if (s2) s2.setAttribute('light', 'castShadow', false); });
      scene.addEventListener('exit-vr', () => { const s2 = sun(); if (s2) s2.setAttribute('light', 'castShadow', true); });
    },
  });

  window.StorePlaza = {
    obstacles: OBST, redraw: () => redrawers.forEach((fn) => fn()) };
})();
