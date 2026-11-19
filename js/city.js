/* השכונה: רחוב בסגנון מיאמי – בנייני ארט-דקו בצבעי פסטל, דקלים, אספלט ומדרכות
 * עם טקסטורות צילום אמיתיות (Poly Haven, CC0), שמיים אמיתיים ותאורת שקיעה.
 * המשאית ממורכזת בראשית; הרחבה בין z=2 ל-z=11; הרחוב ב-z=14..20.
 */
(function () {
  'use strict';

  const TL = new THREE.TextureLoader();
  const GL = () => new THREE.GLTFLoader();
  const FONT = '"Heebo", "Segoe UI", Arial, sans-serif';
  const anims = [];
  const OBST = [];
  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); return m;
  }

  /* ---------- טקסטורות PBR ---------- */
  const texCache = {};
  function tex(file, repeat, srgb) {
    const key = file + repeat;
    if (texCache[key]) return texCache[key];
    const t = TL.load(`assets/textures/${file}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    texCache[key] = t;
    return t;
  }
  function pbr(name, repeat, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex(`${name}-diff`, repeat, true),
      normalMap: tex(`${name}-nor`, repeat),
      roughnessMap: tex(`${name}-rough`, repeat),
      normalScale: new THREE.Vector2(opts.normal || 1, opts.normal || 1),
      roughness: opts.roughness || 1,
      color: opts.color || '#ffffff',
      metalness: 0,
    });
  }

  /* ---------- שמיים, אובך ומפת השתקפויות מהשמיים האמיתיים ---------- */
  function sky(sceneEl) {
    const scene = sceneEl.object3D;
    TL.load('assets/sky/sky.webp', (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
      if ('backgroundIntensity' in scene) scene.backgroundIntensity = 1.0;
      const apply = () => {
        const pm = new THREE.PMREMGenerator(sceneEl.renderer);
        scene.environment = pm.fromEquirectangular(t).texture;
        scene.environmentIntensity = 0.85;
        pm.dispose();
      };
      if (sceneEl.renderer) apply(); else sceneEl.addEventListener('renderstart', apply, { once: true });
    });
  }

  /* ---------- קרקע: אספלט, מדרכות, אבני שפה, סימוני כביש ---------- */
  function ground(g) {
    const asphalt = pbr('asphalt-02', [60, 60], { color: '#8a8a8a' });
    const a = mesh(new THREE.PlaneGeometry(240, 240), asphalt, [0, 0, 0], [-Math.PI / 2, 0, 0]);
    a.receiveShadow = true; g.add(a);
    // רחבה מרוצפת
    const pav = pbr('concrete-pavement', [9, 3.4], { color: '#f2eee6' });
    const plaza = mesh(new THREE.BoxGeometry(26, 0.12, 9.6), pav, [0, 0.06 - 0.04, 6.6]);
    plaza.receiveShadow = true; g.add(plaza);
    // מדרכות בטון
    const walk = pbr('brushed-concrete', [12, 1.2], { color: '#d9d4cc' });
    const sidewalk = (w, d, x, z) => { const s = mesh(new THREE.BoxGeometry(w, 0.16, d), walk, [x, 0.08, z]); s.receiveShadow = true; g.add(s); };
    sidewalk(60, 3, 0, 12.9);   // מדרכה בין הרחבה לכביש
    sidewalk(60, 3.2, 0, 22.4);  // מדרכה בצד השני
    sidewalk(3, 34, -15.5, -2); sidewalk(3, 34, 15.5, -2);
    // אבני שפה
    const curb = new THREE.MeshStandardMaterial({ color: '#c9c4bb', roughness: 0.75 });
    [[60, 0.2, 0, 14.45], [60, 0.2, 0, 20.75]].forEach(([w, d, x, z]) => g.add(mesh(new THREE.BoxGeometry(w, 0.18, d), curb, [x, 0.09, z])));
    // סימוני כביש: קו מקווקו צהוב, מעבר חציה, קווי חניה
    const paint = new THREE.MeshStandardMaterial({ color: '#efeee8', roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#e8c04a', roughness: 0.6 });
    for (let x = -30; x < 30; x += 4) g.add(mesh(new THREE.PlaneGeometry(2.2, 0.14), yellow, [x, 0.012, 17.6], [-Math.PI / 2, 0, 0]));
    for (let i = 0; i < 9; i++) g.add(mesh(new THREE.PlaneGeometry(0.5, 5.6), paint, [-1.8 + i * 0.9 - 2, 0.013, 17.6], [-Math.PI / 2, 0, 0]));
    for (let i = -4; i <= 4; i++) g.add(mesh(new THREE.PlaneGeometry(0.12, 5), paint, [i * 2.8, 0.012, -7], [-Math.PI / 2, 0, 0]));
  }

  /* ---------- בניין ארט-דקו ---------- */
  const PASTELS = ['#f2c4bd', '#bfe2db', '#f4e1a6', '#c6d7ef', '#f3eee6', '#e7c9e3', '#f6d2b0'];
  const glass = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0.85 });
  const glassWarm = () => new THREE.MeshStandardMaterial({ color: '#c9b79a', roughness: 0.08, metalness: 0.55, emissive: '#ffcf8a', emissiveIntensity: 0.18 });

  function neonSign(text, color, w, h) {
    const c = document.createElement('canvas'); c.width = Math.round(w * 220); c.height = Math.round(h * 220);
    const ctx = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    const paint = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${c.height * 0.62}px ${FONT}`;
      ctx.shadowColor = color; ctx.shadowBlur = c.height * 0.25;
      ctx.fillStyle = color; ctx.fillText(text, c.width / 2, c.height * 0.55);
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.fillText(text, c.width / 2, c.height * 0.55); ctx.globalAlpha = 1;
      t.needsUpdate = true;
    };
    paint(); City.redrawers.push(paint);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  }

  function awningTex(c1, c2) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? c1 : c2; ctx.fillRect(i * 32, 0, 32, 64); }
    const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function building(g, { x, z, ry = 0, w, d, floors, color, sign, signColor, round = false, seed = 1 }) {
    const r = rng(seed);
    const b = new THREE.Group();
    const fh = 3.3, H = floors * fh + 0.6;
    const wall = pbr('white-stucco', [w / 3, H / 3], { color, normal: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.6 });
    const body = mesh(new THREE.BoxGeometry(w, H, d), wall, [0, H / 2, 0]);
    body.castShadow = true; body.receiveShadow = true; b.add(body);
    if (round) { // פינה מעוגלת אופיינית לארט-דקו
      const cyl = mesh(new THREE.CylinderGeometry(d / 2, d / 2, H, 32, 1, false, 0, Math.PI), wall, [w / 2, H / 2, 0], [0, Math.PI, 0]);
      cyl.castShadow = true; b.add(cyl);
    }
    // מדפי רצפה ("גבות" ארט-דקו) ומעקה גג
    for (let f = 1; f <= floors; f++) b.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.14, 0.5), trim, [0, f * fh - 0.15, d / 2 + 0.15]));
    b.add(mesh(new THREE.BoxGeometry(w + 0.1, 0.5, d + 0.1), trim, [0, H + 0.1, 0]));
    // סנפיר מרכזי בגג
    const fin = mesh(new THREE.BoxGeometry(0.5, 2.2, 0.6), trim, [w * (r() - 0.5) * 0.4, H + 1.2, d / 2 - 0.2]); fin.castShadow = true; b.add(fin);
    // חלונות (מופעים)
    const cols = Math.max(2, Math.floor(w / 2.2));
    const gm = glass(), fm = new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.5 });
    const n = cols * (floors - 1);
    const win = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 1.55, 0.05), gm, n);
    const frm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 1.75, 0.04), fm, n);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let f = 1; f < floors; f++) for (let c2 = 0; c2 < cols; c2++) {
      const wx = -w / 2 + (w / cols) * (c2 + 0.5), wy = f * fh + fh * 0.48;
      m4.makeTranslation(wx, wy, d / 2 + 0.035); win.setMatrixAt(k, m4);
      const v = r();
      win.setColorAt(k, new THREE.Color(v > 0.85 ? '#d9c39a' : v > 0.6 ? '#9fb2c2' : '#b9c8d6'));
      m4.makeTranslation(wx, wy, d / 2 + 0.01); frm.setMatrixAt(k, m4);
      k++;
    }
    b.add(frm, win);
    // קומת קרקע: חזית ראווה, סוכך ושלט ניאון
    const shop = mesh(new THREE.BoxGeometry(w * 0.8, 2.4, 0.06), r() > 0.4 ? glassWarm() : glass(), [0, 1.4, d / 2 + 0.03]);
    b.add(shop);
    b.add(mesh(new THREE.BoxGeometry(w * 0.82, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: '#2b2c2f', metalness: 0.7, roughness: 0.4 }), [0, 2.65, d / 2 + 0.05]));
    if (r() > 0.3) {
      const aw = mesh(new THREE.BoxGeometry(w * 0.8, 0.05, 1.4), new THREE.MeshStandardMaterial({ map: awningTex(color, '#ffffff'), roughness: 0.85 }), [0, 2.95, d / 2 + 0.68], [0.28, 0, 0]);
      aw.castShadow = true; b.add(aw);
    }
    if (sign) {
      const sw = Math.min(w * 0.7, sign.length * 0.9 + 1.2);
      b.add(mesh(new THREE.PlaneGeometry(sw, 0.9), neonSign(sign, signColor || '#ff4fa3', sw, 0.9), [0, fh + 0.55 - 0.15, d / 2 + 0.06]));
    }
    b.position.set(x, 0, z); b.rotation.y = ry;
    g.add(b);
  }

  function neighborhood(g) {
    const r = rng(41);
    // שורת בניינים מעבר לכביש (פונים לרחבה)
    const front = [
      { w: 9, floors: 3, sign: 'קפה', signColor: '#ff5fb0' }, { w: 7, floors: 4, round: true },
      { w: 10, floors: 2, sign: 'גלידה', signColor: '#4ff0ff' }, { w: 8, floors: 3 },
      { w: 9, floors: 4, sign: 'מלון', signColor: '#ff7a3d' }, { w: 7, floors: 2, sign: 'פיצה', signColor: '#7dff6a' },
    ];
    let x = -28;
    front.forEach((f, i) => {
      building(g, { x: x + f.w / 2, z: 28, ry: Math.PI, d: 9, color: PASTELS[i % PASTELS.length], seed: 10 + i, ...f });
      x += f.w + 0.4;
    });
    // שתי שורות בצדדים (פונות פנימה)
    [-1, 1].forEach((s) => {
      let z = -14;
      for (let i = 0; i < 4; i++) {
        const w = 7 + r() * 4;
        building(g, { x: s * 23, z: z + w / 2, ry: -s * Math.PI / 2, w, d: 9, floors: 2 + Math.floor(r() * 3), color: PASTELS[(i + (s > 0 ? 3 : 0)) % PASTELS.length], seed: 30 + i + (s > 0 ? 10 : 0), sign: i === 1 ? (s > 0 ? 'מספרה' : 'פרחים') : null, signColor: s > 0 ? '#ffd23f' : '#ff5fb0' });
        z += w + 0.5;
      }
    });
    // מאחורי החניה
    for (let i = 0; i < 5; i++) building(g, { x: -20 + i * 10, z: -22, ry: 0, w: 9, d: 9, floors: 3 + (i % 2) * 2, color: PASTELS[(i + 2) % PASTELS.length], seed: 60 + i });
    // מגדלי זכוכית רחוקים באובך
    const towerMat = new THREE.MeshStandardMaterial({ color: '#7d8a99', roughness: 0.15, metalness: 0.75 });
    [[-60, -70, 70], [-25, -95, 95], [20, -85, 80], [70, -60, 60], [95, 10, 55], [-95, 30, 65]].forEach(([tx, tz, th]) => {
      const t = mesh(new THREE.BoxGeometry(14, th, 14), towerMat, [tx, th / 2, tz]); g.add(t);
      for (let y = 4; y < th; y += 4) g.add(mesh(new THREE.BoxGeometry(14.3, 0.25, 14.3), new THREE.MeshStandardMaterial({ color: '#c9d0d8', roughness: 0.6 }), [tx, y, tz]));
    });
  }

  /* ---------- דקל ---------- */
  let frondMat = null, frondDepth = null, barkMat = null;
  function palmMaterials() {
    if (frondMat) return;
    const c = document.createElement('canvas'); c.width = 128; c.height = 512;
    const ctx = c.getContext('2d');
    const r = rng(5);
    // עלעלים דקים משני צדי העורק המרכזי
    for (let i = 0; i < 90; i++) {
      const y = 10 + (i / 90) * 490, len = 56 * Math.sin((i / 90) * Math.PI * 0.95 + 0.1);
      const shade = 70 + r() * 40;
      ctx.strokeStyle = `rgb(${40 + r() * 20}, ${shade + 40}, ${30 + r() * 15})`;
      ctx.lineWidth = 3 + r() * 2;
      [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(64, y); ctx.quadraticCurveTo(64 + s * len * 0.6, y + 8, 64 + s * len, y + 24 + r() * 10); ctx.stroke(); });
    }
    ctx.strokeStyle = '#7a8a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 512); ctx.stroke();
    const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    frondMat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, roughness: 0.7 });
    frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.35 });
    const bc = document.createElement('canvas'); bc.width = 128; bc.height = 256;
    const b2 = bc.getContext('2d');
    b2.fillStyle = '#8a7558'; b2.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 10) { b2.fillStyle = `rgba(60,45,30,${0.35 + r() * 0.2})`; b2.fillRect(0, y, 128, 3); b2.fillStyle = 'rgba(200,180,150,0.15)'; b2.fillRect(0, y + 4, 128, 2); }
    const bt = new THREE.CanvasTexture(bc); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(2, 6); if ('colorSpace' in bt) bt.colorSpace = THREE.SRGBColorSpace;
    barkMat = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 });
  }

  function frondGeometry(len, width, droop) {
    // רצועה מתעקלת כלפי מטה, צרה בקצוות
    const segs = 14, pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const zf = t * len, yf = Math.sin(t * Math.PI * 0.55) * len * 0.25 - t * t * droop;
      const half = width * 0.5 * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.02;
      const sag = half * 0.35; // העלעלים צונחים מעט לצדדים
      pos.push(-half, yf - sag, zf, 0, yf, zf, half, yf - sag, zf);
      uv.push(0, 1 - t, 0.5, 1 - t, 1, 1 - t);
      if (i < segs) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  function palm(g, x, z, seed, height = 7) {
    palmMaterials();
    const r = rng(seed);
    const p = new THREE.Group();
    const lean = new THREE.Vector3((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2);
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(lean.x * t * t, t * height, lean.z * t * t)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunkGeo = new THREE.TubeGeometry(curve, 24, 0.17, 10, false);
    const posA = trunkGeo.attributes.position;
    for (let i = 0; i < posA.count; i++) { // מתחדד כלפי מעלה ומתרחב בבסיס
      const y = posA.getY(i) / height, c = curve.getPoint(Math.min(1, Math.max(0, y)));
      const k = 1.25 - y * 0.45 + (y < 0.05 ? (0.05 - y) * 6 : 0);
      posA.setX(i, c.x + (posA.getX(i) - c.x) * k); posA.setZ(i, c.z + (posA.getZ(i) - c.z) * k);
    }
    trunkGeo.computeVertexNormals();
    const trunk = mesh(trunkGeo, barkMat); trunk.castShadow = true; p.add(trunk);
    const top = curve.getPoint(1);
    const crown = new THREE.Group(); crown.position.copy(top); p.add(crown);
    crown.add(mesh(new THREE.SphereGeometry(0.28, 12, 10), barkMat));
    for (let i = 0; i < 3; i++) crown.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: '#6b5232', roughness: 0.6 }), [Math.cos(i * 2.1) * 0.22, -0.2, Math.sin(i * 2.1) * 0.22]));
    const n = 13;
    for (let i = 0; i < n; i++) {
      const len = 2.6 + r() * 1.1;
      const f = mesh(frondGeometry(len, 1.0 + r() * 0.3, 1.2 + r() * 0.8), frondMat);
      f.customDepthMaterial = frondDepth; f.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.y = (i / n) * Math.PI * 2 + r() * 0.3;
      f.rotation.x = -0.15 - r() * 0.35 + (i % 3 === 0 ? -0.5 : 0);
      holder.add(f); crown.add(holder);
    }
    p.position.set(x, 0, z);
    g.add(p);
    const ph = r() * 6;
    anims.push((dt, t) => { crown.rotation.z = Math.sin(t * 0.8 + ph) * 0.03; crown.rotation.x = Math.cos(t * 0.6 + ph) * 0.025; });
    OBST.push([x, z, 0.6]);
  }

  /* ---------- אביזרי רחוב אמיתיים (Poly Haven) ---------- */
  function prop(g, file, list) {
    GL().load(`assets/models/street/${file}.glb`, (gltf) => {
      gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      list.forEach(([x, z, ry = 0, s = 1]) => {
        const o = gltf.scene.clone(true);
        o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s);
        g.add(o);
      });
    }, undefined, (e) => console.warn('prop failed', file, e));
    list.forEach(([x, z]) => OBST.push([x, z, 0.6]));
  }

  function streetLife(g) {
    // דקלים לאורך המדרכות והרחבה
    let s = 1;
    for (let x = -26; x <= 26; x += 6.5) palm(g, x + (s % 2) * 0.6, 13.2, s++, 6.5 + (s % 3) * 0.9);
    for (let x = -24; x <= 24; x += 8) palm(g, x + 1.5, 22.6, s++, 7 + (s % 2));
    [[-11.8, 2.6], [11.8, 2.6], [-11.8, 10.2], [11.8, 10.2], [-15.5, -6], [15.5, -6], [-15.5, -14], [15.5, -14]].forEach(([x, z]) => palm(g, x, z, s++, 7.5));
    // פנסי רחוב
    prop(g, 'street-lamp-01', [[-9, 13.6, Math.PI], [0.2, 13.6, Math.PI], [9, 13.6, Math.PI], [-9, 21.6, 0], [9, 21.6, 0]]);
    // פחי אשפה, ברז כיבוי, אדניות, שולחנות בית קפה
    prop(g, 'metal-trash-can', [[-3.9, 11.2, 0, 0.8], [11.2, 6.2, -Math.PI / 2, 0.8]]);
    prop(g, 'fire-hydrant', [[4.3, 13.2, 0.4]]);
    prop(g, 'planter-box-01', [[-1.5, 11.0, 0, 1.4], [1.5, 11.0, 0, 1.4], [-6.8, 2.5, 0, 1.2], [6.8, 2.5, 0, 1.2]]);
    prop(g, 'potted-plant-02', [[-4.4, 2.6, 0, 1.4], [4.4, 2.6, 1, 1.4]]);
    prop(g, 'outdoor-table-chair-set-01', [[-25, 23.6, 0.2], [-22.6, 23.4, -0.3], [-20.4, 23.7, 0.5], [-8, 23.5, 0.1]]);
    // רכבים מכוסים בחניה מאחורי המשאית
    prop(g, 'covered-car', [[-8.4, -7.2, 0], [-2.8, -7.2, 0.05], [5.6, -7.2, -0.04]]);
  }

  const City = {
    redrawers: [],
    obstacles: OBST,
    build(g, sceneEl) {
      ground(g); neighborhood(g); streetLife(g);
      sky(sceneEl);
    },
    tick(dt, t) { anims.forEach((fn) => fn(dt, t)); },
    redraw() { this.redrawers.forEach((fn) => fn()); },
  };
  window.StoreCity = City;
})();
