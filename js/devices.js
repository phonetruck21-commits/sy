/* דגמי מכשירים שנבנים בקוד, במידות אמיתיות (מטרים):
 * טלפון, טאבלט, שעון חכם, אוזניות, מטען, סוללה ניידת וכיסוי.
 * כל דגם מחזיר { object, setVariant(id) }. החזית פונה ל-+z.
 */
(function () {
  'use strict';

  const SCREEN_FONT = '"Heebo", "Segoe UI", Arial, sans-serif';

  /* ---------- גאומטריה ---------- */
  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }

  /* לוח מעוגל עם שוליים מעוגלים (bevel) – בסיס לכל המכשירים */
  function slab(w, h, d, r, bevel, holes) {
    bevel = Math.min(bevel, d / 2 - 0.00005, w / 4, h / 4);
    const shape = roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.0004, r - bevel));
    if (holes) holes.forEach((hl) => shape.holes.push(hl));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.00005, d - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 4, curveSegments: 14,
    });
    g.translate(0, 0, -(d - bevel * 2) / 2);
    g.computeVertexNormals();
    return g;
  }

  function holePath(w, h, r, cx = 0, cy = 0) {
    const s = roundedRectShape(w, h, r);
    const p = new THREE.Path(s.getPoints(24).map((v) => new THREE.Vector2(v.x + cx, v.y + cy)).reverse());
    return p;
  }

  function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
  }

  /* ---------- חומרים ---------- */
  const M = {
    glassBlack: () => new THREE.MeshPhysicalMaterial({ color: '#050506', roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }),
    lens: () => new THREE.MeshPhysicalMaterial({ color: '#0a0b10', roughness: 0.02, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 }),
    chrome: () => new THREE.MeshStandardMaterial({ color: '#d7d8da', roughness: 0.18, metalness: 1 }),
    darkMetal: () => new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.35, metalness: 0.8 }),
    plastic: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    matte: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0 }),
    port: () => new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }),
  };

  /* ---------- מסכים מצוירים ---------- */
  function screenTexture(wPx, hPx, rPx, draw) {
    const c = document.createElement('canvas');
    c.width = wPx; c.height = hPx;
    const ctx = c.getContext('2d');
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const paint = () => {
      ctx.clearRect(0, 0, wPx, hPx);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(0, 0, wPx, hPx, rPx) : ctx.rect(0, 0, wPx, hPx);
      ctx.clip();
      draw(ctx, wPx, hPx);
      ctx.restore();
      t.needsUpdate = true;
    };
    paint();
    Devices.redrawers.push(paint);
    return t;
  }

  function phoneWallpaper(colors, landscape) {
    return (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // צורות רכות
      [[0.2, 0.75, 0.55, colors[1]], [0.85, 0.35, 0.45, colors[0]], [0.5, 1.05, 0.6, '#ffffff']].forEach(([x, y, r, c], i) => {
        const rg = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W);
        rg.addColorStop(0, c + (i === 2 ? '22' : '99')); rg.addColorStop(1, c + '00');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      });
      const u = W / 100;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.direction = 'ltr';
      ctx.font = `300 ${u * (landscape ? 14 : 22)}px ${SCREEN_FONT}`;
      ctx.fillText('10:08', W / 2, H * 0.24);
      ctx.direction = 'rtl';
      ctx.font = `400 ${u * (landscape ? 3.6 : 5.2)}px ${SCREEN_FONT}`;
      ctx.fillText('יום שישי, 14 בנובמבר', W / 2, H * 0.24 + u * (landscape ? 6 : 9));
      // שורת סטטוס
      ctx.font = `500 ${u * 4}px ${SCREEN_FONT}`;
      ctx.direction = 'ltr'; ctx.textAlign = 'left';
      ctx.fillText('9:41', u * 9, u * 9);
      ctx.fillRect(W - u * 18, u * 5.5, u * 8, u * 3.6);
      // אייקוני אפליקציות
      const icons = landscape ? 6 : 4;
      const s = u * (landscape ? 9 : 15), gap = u * (landscape ? 4 : 6.5);
      const total = icons * s + (icons - 1) * gap;
      const y = H - s - u * (landscape ? 7 : 10);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.roundRect && ctx.roundRect(W / 2 - total / 2 - u * 3, y - u * 3, total + u * 6, s + u * 6, u * 7);
      ctx.fill();
      const hues = ['#4cd964', '#5ac8fa', '#ff9500', '#ff2d55', '#af52de', '#ffcc00'];
      for (let i = 0; i < icons; i++) {
        ctx.fillStyle = hues[i];
        ctx.beginPath();
        ctx.roundRect && ctx.roundRect(W / 2 - total / 2 + i * (s + gap), y, s, s, s * 0.24);
        ctx.fill();
      }
    };
  }

  function watchFace(ctx, W, H) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.52;
    [['#ff375f', 0.36, 0.78], ['#a6ff00', 0.29, 0.62], ['#00e5ff', 0.22, 0.9]].forEach(([c, r, p]) => {
      ctx.lineWidth = W * 0.06; ctx.lineCap = 'round';
      ctx.strokeStyle = c + '33'; ctx.beginPath(); ctx.arc(cx, cy, W * r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, W * r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
    });
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.font = `500 ${W * 0.13}px ${SCREEN_FONT}`;
    ctx.fillText('10:08', cx, H * 0.15);
  }

  /* ---------- טלפון / טאבלט ---------- */
  function phone(p, tablet) {
    const { w, h, d } = p.dims;
    const r = tablet ? 0.012 : w * 0.17;
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: '#999', metalness: 0.9, roughness: 0.26 });
    const backMat = new THREE.MeshPhysicalMaterial({ color: '#999', metalness: 0.05, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.18 });

    g.add(mesh(slab(w, h, d, r, d * 0.42), frameMat));
    g.add(mesh(slab(w - 0.0016, h - 0.0016, 0.0007, r - 0.0008, 0.00025), backMat, 0, 0, -d / 2 + 0.0002));
    g.add(mesh(slab(w - 0.0012, h - 0.0012, 0.0007, r - 0.0006, 0.00025), M.glassBlack(), 0, 0, d / 2 - 0.0002));

    // מסך מואר
    const sw = w - (tablet ? 0.012 : 0.0042), sh = h - (tablet ? 0.012 : 0.0042);
    const ppm = 5200;
    const tex = screenTexture(Math.round(sw * ppm), Math.round(sh * ppm), (r - 0.002) * ppm, phoneWallpaper(p.screen || ['#1b2a4a', '#6a4c93'], false));
    const screen = mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), 0, 0, d / 2 + 0.0003);
    g.add(screen);
    if (!tablet) {
      // מצלמה קדמית
      g.add(mesh(new THREE.CircleGeometry(0.0017, 20), M.lens(), 0, sh / 2 - 0.006, d / 2 + 0.00035));
    }

    // מודול מצלמה מאחור
    const cams = p.cameras || 2;
    const cw = tablet ? 0.024 : w * (cams >= 3 ? 0.46 : 0.4);
    const ch = tablet ? 0.024 : cams >= 3 ? cw : cw * 0.95;
    const cx = w / 2 - cw / 2 - (tablet ? 0.008 : w * 0.07);
    const cy = h / 2 - ch / 2 - (tablet ? 0.008 : w * 0.07);
    g.add(mesh(slab(cw, ch, 0.0016, cw * 0.28, 0.0006), backMat, cx, cy, -d / 2 - 0.0006));
    const lensR = cw * (cams >= 3 ? 0.2 : 0.22);
    const spots = cams >= 3
      ? [[-0.22, 0.22], [-0.22, -0.22], [0.22, 0]]
      : cams === 2 ? [[0, 0.22], [0, -0.22]] : [[0, 0]];
    spots.forEach(([lx, ly]) => {
      const x = cx + lx * cw, y = cy + ly * ch;
      g.add(mesh(new THREE.CylinderGeometry(lensR, lensR, 0.0018, 32), M.chrome(), x, y, -d / 2 - 0.0016, Math.PI / 2));
      g.add(mesh(new THREE.CylinderGeometry(lensR * 0.78, lensR * 0.78, 0.0002, 32), M.lens(), x, y, -d / 2 - 0.0025, Math.PI / 2));
      g.add(mesh(new THREE.CircleGeometry(lensR * 0.3, 20), new THREE.MeshPhysicalMaterial({ color: '#1b2140', roughness: 0.05, metalness: 0.5 }), x, y, -d / 2 - 0.00262, 0, Math.PI));
    });
    // פלאש
    g.add(mesh(new THREE.CircleGeometry(cw * 0.06, 16), new THREE.MeshStandardMaterial({ color: '#f3ead2', roughness: 0.3, emissive: '#3a3420' }), cx + (cams >= 3 ? 0.22 : -0.26) * cw, cy + (cams >= 3 ? -0.25 : 0) * ch, -d / 2 - 0.00141, 0, Math.PI));

    // כפתורים בצד
    if (!tablet) {
      g.add(mesh(new THREE.BoxGeometry(0.001, 0.018, 0.003), frameMat, w / 2 + 0.0002, h * 0.12, 0));
      g.add(mesh(new THREE.BoxGeometry(0.001, 0.012, 0.003), frameMat, -w / 2 - 0.0002, h * 0.2, 0));
      g.add(mesh(new THREE.BoxGeometry(0.001, 0.012, 0.003), frameMat, -w / 2 - 0.0002, h * 0.12, 0));
    }

    return {
      object: g,
      setVariant(v) {
        const c = new THREE.Color(v.color);
        frameMat.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.12);
        backMat.color.copy(c);
      },
    };
  }

  /* ---------- שעון חכם על כרית תצוגה ---------- */
  function watch() {
    const g = new THREE.Group();
    const R = 0.032, bandW = 0.022;
    const bandMat = new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.62, side: THREE.DoubleSide });
    const band = mesh(new THREE.CylinderGeometry(R, R, bandW, 64, 1, true), bandMat, 0, 0, 0, 0, 0, Math.PI / 2);
    g.add(band);
    g.add(mesh(new THREE.CylinderGeometry(R - 0.003, R - 0.003, 0.06, 48), M.matte('#d9d6cf'), 0, 0, 0, 0, 0, Math.PI / 2));
    const caseMat = new THREE.MeshStandardMaterial({ color: '#b9bbbe', metalness: 0.9, roughness: 0.25 });
    const cw = 0.041, ch = 0.048, cd = 0.011;
    const z = R + cd / 2 - 0.002;
    g.add(mesh(slab(cw, ch, cd, 0.010, 0.0035), caseMat, 0, 0, z));
    g.add(mesh(slab(cw - 0.002, ch - 0.002, 0.0008, 0.009, 0.0003), M.glassBlack(), 0, 0, z + cd / 2 - 0.0002));
    const tex = screenTexture(380, 450, 70, watchFace);
    g.add(mesh(new THREE.PlaneGeometry(cw - 0.007, ch - 0.007), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), 0, 0, z + cd / 2 + 0.0003));
    g.add(mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.004, 24), caseMat, cw / 2 + 0.0015, 0.008, z, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.0012, 0.011, 0.003), caseMat, cw / 2 + 0.0004, -0.009, z));
    return { object: g, setVariant(v) { bandMat.color.set(v.color); } };
  }

  /* ---------- אוזניות אלחוטיות ---------- */
  function buds() {
    const g = new THREE.Group();
    const mat = M.plastic('#f2f1ee');
    const cw = 0.06, ch = 0.048, cd = 0.022;
    g.add(mesh(slab(cw, ch, cd, 0.02, 0.009), mat, 0, ch / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(cw * 0.93, 0.0005, 0.0005), M.port(), 0, ch * 0.66, cd / 2 - 0.0002));
    g.add(mesh(new THREE.CircleGeometry(0.0012, 12), new THREE.MeshBasicMaterial({ color: '#7dff9a', toneMapped: false }), 0, ch * 0.4, cd / 2 + 0.0001));
    [-1, 1].forEach((s) => {
      const bud = new THREE.Group();
      bud.add(mesh(new THREE.SphereGeometry(0.0085, 32, 20), mat, 0, 0, 0));
      bud.add(mesh(new THREE.CapsuleGeometry(0.0034, 0.022, 8, 16), mat, 0, -0.016, -0.002, 0.15));
      bud.add(mesh(new THREE.CircleGeometry(0.004, 20), M.port(), 0, 0.0005, 0.0084));
      bud.position.set(s * 0.05, 0.0085, 0.012);
      bud.rotation.set(-Math.PI / 2 + 0.15, 0, s * 0.5);
      g.add(bud);
    });
    return { object: g, setVariant(v) { mat.color.set(v.color); } };
  }

  /* ---------- מטען קיר עם כבל ---------- */
  function charger() {
    const g = new THREE.Group();
    const mat = M.matte('#f4f3f0');
    const s = 0.048, d = 0.03;
    g.add(mesh(slab(s, s, d, 0.009, 0.005), mat, 0, s / 2, 0));
    g.add(mesh(slab(0.0088, 0.0032, 0.0015, 0.0015, 0.0003), M.port(), 0, s * 0.42, d / 2 + 0.0003));
    [-1, 1].forEach((k) => g.add(mesh(new THREE.BoxGeometry(0.0018, 0.0062, 0.016), M.chrome(), k * 0.0062, s / 2, -d / 2 - 0.008)));
    // כבל מגולגל לידו
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, a = t * Math.PI * 5.2, rr = 0.03 + 0.004 * Math.sin(t * 9);
      pts.push(new THREE.Vector3(0.075 + Math.cos(a) * rr, 0.0028 + t * 0.006, 0.01 + Math.sin(a) * rr * 0.75));
    }
    pts.push(new THREE.Vector3(0.035, 0.004, 0.02), new THREE.Vector3(0.0, s * 0.42, d / 2 + 0.006));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.0021, 10, false), mat));
    return { object: g };
  }

  /* ---------- סוללה ניידת ---------- */
  function powerbank() {
    const g = new THREE.Group();
    const mat = M.matte('#eee');
    const w = 0.068, h = 0.14, d = 0.016;
    g.add(mesh(slab(w, h, d, 0.012, 0.0055), mat, 0, h / 2, 0));
    for (let i = 0; i < 4; i++) {
      g.add(mesh(new THREE.CircleGeometry(0.0011, 12), new THREE.MeshBasicMaterial({ color: i < 3 ? '#7fd1ff' : '#3a4a55', toneMapped: false }), -0.0075 + i * 0.005, 0.016, d / 2 + 0.0001));
    }
    g.add(mesh(slab(0.0088, 0.0032, 0.0012, 0.0015, 0.0003), M.port(), 0, h - 0.0002, 0, Math.PI / 2));
    return { object: g, setVariant(v) { mat.color.set(v.color); } };
  }

  /* ---------- כיסוי סיליקון (מוצג מצד הגב) ---------- */
  function phoneCase() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#c07a5c', roughness: 0.82, side: THREE.DoubleSide });
    const lining = M.matte('#2a2a2c');
    const w = 0.0812, h = 0.1672, r = 0.0142;
    const camHole = holePath(0.039, 0.039, 0.011, w / 2 - 0.0255, h / 2 - 0.0255);
    // גב הכיסוי עם חור למצלמה
    g.add(mesh(slab(w, h, 0.0016, r, 0.0006, [camHole]), mat, 0, 0, -0.0045));
    g.add(mesh(slab(w - 0.003, h - 0.003, 0.0004, r - 0.0015, 0.00015, [holePath(0.039, 0.039, 0.011, w / 2 - 0.0255, h / 2 - 0.0255)]), lining, 0, 0, -0.0036));
    // שוליים מוגבהים
    const rim = slab(w, h, 0.0105, r, 0.0012, [holePath(w - 0.0036, h - 0.0036, r - 0.0018)]);
    g.add(mesh(rim, mat, 0, 0, 0.0007));
    const out = new THREE.Group();
    out.add(g);
    g.rotation.y = Math.PI; // הגב פונה ללקוח
    return { object: out, setVariant(v) { mat.color.set(v.color); } };
  }

  const BUILDERS = {
    phone: (p) => phone(p, false),
    tablet: (p) => phone(p, true),
    watch, buds, charger, powerbank, case: phoneCase,
  };

  const Devices = {
    redrawers: [],
    build(p) {
      const b = BUILDERS[p.device];
      if (!b) throw new Error(`Unknown device type: ${p.device}`);
      const d = b(p);
      if (!d.setVariant) d.setVariant = () => {};
      return d;
    },
    redraw() { this.redrawers.forEach((fn) => fn()); },
    slab, roundedRectShape,
  };
  window.StoreDevices = Devices;
})();
