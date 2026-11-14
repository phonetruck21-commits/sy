/* העולם: רחבה עירונית, שמיים, ומשאית שהצד שלה נפתח לחנות סלולר.
 * המשאית ממורכזת בראשית: אורך לאורך ציר x, הצד הפתוח פונה ל-+z, הקבינה ב-+x.
 */
(function () {
  'use strict';

  const T = {
    FLOOR: 0.95,          // גובה רצפת החנות
    ROOF: 3.85,           // גובה הגג החיצוני
    CEIL: 3.68,           // תקרה פנימית
    X0: -6.1, X1: 6.1,    // אורך התא
    Z0: -1.95, Z1: 1.95,  // רוחב התא
    OPEN_X: 3.9,          // חצי רוחב הפתח בצד
    OPEN_TOP: 3.42,
    CAB_X1: 8.75,
  };
  const F = T.FLOOR;
  const FONT = '"Heebo", "Segoe UI", Arial, sans-serif';
  const redrawers = [];

  /* ---------- עזרים ---------- */
  function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.rotation.set(...rot);
    return m;
  }
  const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, [x, y, z]);
  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

  function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, live = false } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const t = new THREE.CanvasTexture(c);
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    const paint = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); t.needsUpdate = true; };
    paint();
    if (live) redrawers.push(paint);
    return t;
  }

  /* ---------- טקסטורות ---------- */
  const tex = {
    asphalt: () => {
      const r = rng(3);
      return canvasTex(512, 512, (ctx, W, H) => {
        ctx.fillStyle = '#4a4a4c'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 22000; i++) {
          const v = 45 + r() * 50;
          ctx.fillStyle = `rgba(${v},${v},${v + 2},${0.25 + r() * 0.35})`;
          ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
        }
      }, { repeat: [40, 40] });
    },
    pavers: () => {
      const r = rng(11);
      return canvasTex(512, 512, (ctx, W, H) => {
        const n = 8, s = W / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const l = 76 + r() * 6;
          ctx.fillStyle = `hsl(35, 6%, ${l}%)`;
          ctx.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
        }
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#9a968f'; ctx.fillRect(0, 0, W, H);
      }, { repeat: [6, 3] });
    },
    concrete: () => {
      const r = rng(5);
      return canvasTex(512, 512, (ctx, W, H) => {
        ctx.fillStyle = '#d9d6d0'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 9000; i++) {
          ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(90,85,80,0.05)';
          const s = 2 + r() * 10;
          ctx.fillRect(r() * W, r() * H, s, s);
        }
      }, { repeat: [3, 1] });
    },
    oak: () => {
      const r = rng(19);
      return canvasTex(512, 512, (ctx, W, H) => {
        ctx.fillStyle = '#b88c5c'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 150; i++) {
          const y = r() * H;
          ctx.strokeStyle = `rgba(${90 + r() * 40}, ${60 + r() * 25}, 35, ${0.06 + r() * 0.12})`;
          ctx.lineWidth = 0.5 + r() * 2.5;
          ctx.beginPath(); ctx.moveTo(0, y);
          ctx.bezierCurveTo(W / 3, y + (r() - 0.5) * 20, (2 * W) / 3, y + (r() - 0.5) * 20, W, y);
          ctx.stroke();
        }
      });
    },
    sky: () => canvasTex(16, 512, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#5b8fd1'); g.addColorStop(0.42, '#a9c8ea'); g.addColorStop(0.5, '#e8eef2'); g.addColorStop(0.52, '#c9c8c2'); g.addColorStop(1, '#8d8b86');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }),
    facade: (seed, tint) => {
      const r = rng(seed);
      return canvasTex(256, 512, (ctx, W, H) => {
        ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
        const cols = 5, rows = 12;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const lit = r();
          ctx.fillStyle = lit > 0.82 ? '#e9e2c9' : `rgb(${60 + lit * 40}, ${78 + lit * 40}, ${98 + lit * 40})`;
          ctx.fillRect(14 + i * 48, 18 + j * 41, 30, 27);
        }
      });
    },
  };

  /* מיתוג המשאית – מצויר מחדש כשהגופנים נטענים */
  function brandWrap(cfg, w, h) {
    return canvasTex(Math.round(w * 200), Math.round(h * 200), (ctx, W, H) => {
      ctx.fillStyle = '#1f2125'; ctx.fillRect(0, 0, W, H);
      // קווי מתאר של טלפונים ברקע
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = H * 0.01;
      for (let i = 0; i < 6; i++) {
        const pw = H * 0.32, ph = H * 0.66, x = W * 0.06 + i * pw * 1.25, y = H * 0.17 + (i % 2) * H * 0.04;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, pw, ph, pw * 0.16) : ctx.rect(x, y, pw, ph); ctx.stroke();
      }
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${H * 0.36}px ${FONT}`;
      ctx.fillText(cfg.name, W * 0.93, H * 0.55);
      ctx.fillStyle = '#c9ccd2';
      ctx.font = `400 ${H * 0.085}px ${FONT}`;
      ctx.fillText(cfg.tagline, W * 0.93, H * 0.7);
      ctx.fillStyle = '#4c8dff';
      ctx.fillRect(W * 0.93 - H * 0.6, H * 0.77, H * 0.6, H * 0.012);
    }, { live: true });
  }

  function fascia(cfg, w, h) {
    return canvasTex(Math.round(w * 220), Math.round(h * 220), (ctx, W, H) => {
      ctx.fillStyle = '#1f2125'; ctx.fillRect(0, 0, W, H);
      ctx.direction = 'rtl'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${H * 0.56}px ${FONT}`;
      const name = cfg.name;
      ctx.fillText(name, W / 2, H * 0.52);
      const nw = ctx.measureText(name).width;
      ctx.fillStyle = '#c9ccd2';
      ctx.font = `400 ${H * 0.26}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(cfg.tagline, W / 2 - nw / 2 - H * 0.5, H * 0.55);
      ctx.textAlign = 'left';
      ctx.fillText('פתוח עכשיו', W / 2 + nw / 2 + H * 0.5, H * 0.55);
      ctx.fillStyle = '#4c8dff';
      ctx.beginPath(); ctx.arc(W / 2 + nw / 2 + H * 0.32, H * 0.53, H * 0.07, 0, Math.PI * 2); ctx.fill();
    }, { live: true });
  }

  /* ---------- חומרים ---------- */
  function materials() {
    return {
      paint: new THREE.MeshPhysicalMaterial({ color: '#1f2125', roughness: 0.38, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      chassis: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.7, metalness: 0.4 }),
      tire: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 }),
      rim: new THREE.MeshStandardMaterial({ color: '#c8cacd', roughness: 0.25, metalness: 1 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#0d1115', roughness: 0.03, metalness: 0.3, clearcoat: 1 }),
      steel: new THREE.MeshStandardMaterial({ color: '#2b2c2f', roughness: 0.35, metalness: 0.85 }),
      brushed: new THREE.MeshStandardMaterial({ color: '#b9bbbf', roughness: 0.35, metalness: 0.9 }),
      inner: new THREE.MeshStandardMaterial({ color: '#f4f3f1', roughness: 0.9, emissive: '#f4f3f1', emissiveIntensity: 0.22 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#f7f6f4', roughness: 1, emissive: '#f7f6f4', emissiveIntensity: 0.55 }),
      floor: new THREE.MeshStandardMaterial({ map: tex.concrete(), roughness: 0.32, metalness: 0 }),
      slat: new THREE.MeshStandardMaterial({ color: '#e9e8e6', roughness: 0.8, emissive: '#e9e8e6', emissiveIntensity: 0.15 }),
      oak: new THREE.MeshStandardMaterial({ map: tex.oak(), roughness: 0.5 }),
      white: new THREE.MeshPhysicalMaterial({ color: '#f5f5f4', roughness: 0.25, clearcoat: 0.6 }),
      led: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      ledWarm: new THREE.MeshBasicMaterial({ color: '#fff3df', toneMapped: false }),
      awningUnder: new THREE.MeshStandardMaterial({ color: '#ecebe8', roughness: 0.9 }),
      headlight: new THREE.MeshBasicMaterial({ color: '#fbfbf5', toneMapped: false }),
      taillight: new THREE.MeshBasicMaterial({ color: '#b3121e', toneMapped: false }),
      acrylic: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.9, thickness: 0.01, transparent: true, opacity: 0.6 }),
    };
  }

  /* ---------- סביבה ---------- */
  function buildWorld(g, M) {
    // שמיים
    g.add(mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.MeshBasicMaterial({ map: tex.sky(), side: THREE.BackSide, toneMapped: false, fog: false })));
    // אספלט
    g.add(mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: tex.asphalt(), roughness: 0.95 }), [0, 0, 0], [-Math.PI / 2, 0, 0]));
    // רחבה מרוצפת מול המשאית
    g.add(mesh(new THREE.BoxGeometry(22, 0.04, 9), new THREE.MeshStandardMaterial({ map: tex.pavers(), roughness: 0.85 }), [0, 0.02, 6.4]));
    g.add(mesh(new THREE.BoxGeometry(22.2, 0.13, 0.25), new THREE.MeshStandardMaterial({ color: '#b5b2ab', roughness: 0.8 }), [0, 0.065, 11]));
    // סימוני חניה
    const line = new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.8 });
    for (let i = -3; i <= 3; i++) g.add(mesh(new THREE.PlaneGeometry(0.12, 5), line, [i * 2.8, 0.006, -6.5], [-Math.PI / 2, 0, 0]));
    // בניינים ברקע
    const r = rng(23);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const dist = 48 + r() * 18;
      const w = 10 + r() * 12, h = 12 + r() * 26, d = 10 + r() * 8;
      const tint = ['#c9c4bb', '#b8bcc0', '#d6d0c6', '#a9aeb3'][i % 4];
      const mat = new THREE.MeshStandardMaterial({ map: tex.facade(i + 2, tint), roughness: 0.9 });
      mat.map.repeat.set(Math.round(w / 6), Math.round(h / 10));
      const b = mesh(new THREE.BoxGeometry(w, h, d), mat, [Math.cos(a) * dist, h / 2, Math.sin(a) * dist]);
      b.rotation.y = -a;
      g.add(b);
    }
    // ספסלים ועציצי בטון על הרחבה
    [[-7.2, 7.5], [7.2, 7.5]].forEach(([x, z]) => {
      g.add(box(1.8, 0.06, 0.45, M.oak, x, 0.46, z));
      g.add(box(0.08, 0.43, 0.4, M.steel, x - 0.75, 0.215, z));
      g.add(box(0.08, 0.43, 0.4, M.steel, x + 0.75, 0.215, z));
    });
    const planterMat = new THREE.MeshStandardMaterial({ color: '#bdb8b0', roughness: 0.85 });
    const leaf = new THREE.MeshStandardMaterial({ color: '#4c6b3c', roughness: 0.8 });
    [[-5.2, 4.3], [5.2, 4.3]].forEach(([x, z]) => {
      g.add(box(1.0, 0.55, 1.0, planterMat, x, 0.275, z));
      const rr = rng(Math.round(x * 10 + 99));
      for (let i = 0; i < 9; i++) {
        const s = mesh(new THREE.IcosahedronGeometry(0.22 + rr() * 0.12, 1), leaf, [x + (rr() - 0.5) * 0.6, 0.72 + rr() * 0.25, z + (rr() - 0.5) * 0.6]);
        g.add(s);
      }
    });
  }

  /* ---------- המשאית מבחוץ ---------- */
  function buildTruck(g, M, cfg) {
    const { X0, X1, Z0, Z1, ROOF, OPEN_X, OPEN_TOP } = T;
    const L = X1 - X0;
    const W = Z1 - Z0;
    // תחתית ושלדה
    g.add(box(L, 0.15, W, M.chassis, 0, F - 0.075, 0));
    g.add(box(L + 2.6, 0.22, 1.1, M.chassis, 1.3, F - 0.3, 0));
    // גג
    g.add(box(L, 0.13, W, M.paint, 0, ROOF - 0.065, 0));
    // קיר אחורי (z שלילי) עם מיתוג מבחוץ
    g.add(box(L, ROOF - F, 0.08, M.paint, 0, (ROOF + F) / 2, Z0 + 0.04));
    g.add(mesh(new THREE.PlaneGeometry(L - 0.3, ROOF - F - 0.3), new THREE.MeshStandardMaterial({ map: brandWrap(cfg, L - 0.3, ROOF - F - 0.3), roughness: 0.5 }), [0, (ROOF + F) / 2, Z0 - 0.002], [0, Math.PI, 0]));
    // דפנות קצה
    [X0, X1].forEach((x) => g.add(box(0.08, ROOF - F, W, M.paint, x + (x < 0 ? 0.04 : -0.04), (ROOF + F) / 2, 0)));
    g.add(mesh(new THREE.PlaneGeometry(W - 0.3, ROOF - F - 0.3), new THREE.MeshStandardMaterial({ map: brandWrap(cfg, W - 0.3, ROOF - F - 0.3), roughness: 0.5 }), [X0 - 0.002, (ROOF + F) / 2, 0], [0, -Math.PI / 2, 0]));
    // צד פתוח: קירות משני צדי הפתח ופס שילוט מעליו
    const sideW = X1 - OPEN_X;
    [-1, 1].forEach((s) => g.add(box(sideW, ROOF - F, 0.08, M.paint, s * (OPEN_X + sideW / 2), (ROOF + F) / 2, Z1 - 0.04)));
    g.add(box(OPEN_X * 2, ROOF - OPEN_TOP, 0.08, M.paint, 0, (ROOF + OPEN_TOP) / 2, Z1 - 0.04));
    g.add(mesh(new THREE.PlaneGeometry(OPEN_X * 2 - 0.2, ROOF - OPEN_TOP - 0.06), new THREE.MeshBasicMaterial({ map: fascia(cfg, OPEN_X * 2 - 0.2, ROOF - OPEN_TOP - 0.06), toneMapped: false }), [0, (ROOF + OPEN_TOP) / 2, Z1 + 0.002]));
    // מסגרת פתח
    g.add(box(OPEN_X * 2 + 0.1, 0.05, 0.12, M.brushed, 0, OPEN_TOP - 0.025, Z1 - 0.04));
    [-1, 1].forEach((s) => g.add(box(0.05, OPEN_TOP - F, 0.12, M.brushed, s * OPEN_X, (OPEN_TOP + F) / 2, Z1 - 0.04)));

    // סוכך: הדופן שהורמה כלפי מעלה
    const awn = new THREE.Group();
    awn.position.set(0, ROOF, Z1);
    awn.rotation.x = -0.14;
    const aw = OPEN_X * 2 + 0.4, al = 2.3;
    awn.add(mesh(new THREE.BoxGeometry(aw, 0.07, al), M.paint, [0, 0.035, al / 2]));
    awn.add(mesh(new THREE.PlaneGeometry(aw - 0.1, al - 0.1), M.awningUnder, [0, -0.002, al / 2], [Math.PI / 2, 0, 0]));
    [0.6, 1.5, 2.1].forEach((z) => awn.add(mesh(new THREE.BoxGeometry(aw - 0.5, 0.012, 0.035), M.led, [0, -0.008, z])));
    g.add(awn);
    // בוכנות תמיכה
    [-1, 1].forEach((s) => {
      const a = new THREE.Vector3(s * (OPEN_X - 0.15), OPEN_TOP - 0.4, Z1 + 0.02);
      const b = new THREE.Vector3(s * (OPEN_X - 0.15), ROOF + 0.15, Z1 + 1.55);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      const strut = mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 12), M.brushed, mid.toArray());
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(strut);
    });

    // מדרגות עץ ומעקות
    const steps = [[0.71, 1.95, 2.25], [0.47, 2.25, 2.55], [0.24, 2.55, 2.85]];
    steps.forEach(([h, z0, z1]) => {
      g.add(box(OPEN_X * 2 - 0.1, h, z1 - z0, M.oak, 0, h / 2, (z0 + z1) / 2));
      g.add(box(OPEN_X * 2 - 0.3, 0.012, 0.02, M.ledWarm, 0, h - 0.04, z1 + 0.001));
    });
    g.add(box(OPEN_X * 2 - 0.1, F - 0.71, 0.1, M.oak, 0, (F + 0.71) / 2, 1.99));
    [-1, 1].forEach((s) => {
      const x = s * (OPEN_X - 0.1);
      g.add(box(0.04, 1.0, 0.04, M.steel, x, 0.24 + 0.5, 2.82));
      g.add(box(0.04, 1.0, 0.04, M.steel, x, F + 0.5, 1.98));
      const a = new THREE.Vector3(x, 1.24, 2.82), b = new THREE.Vector3(x, F + 1.0, 1.98);
      const rail = mesh(new THREE.CylinderGeometry(0.02, 0.02, a.distanceTo(b) + 0.04, 12), M.steel, a.clone().add(b).multiplyScalar(0.5).toArray());
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(rail);
    });

    // גלגלים
    const wheel = (x, z) => {
      const w = new THREE.Group();
      w.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 40), M.tire, [0, 0, 0], [Math.PI / 2, 0, 0]));
      w.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.33, 32), M.rim, [0, 0, 0], [Math.PI / 2, 0, 0]));
      w.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 16), M.steel, [0, 0, 0], [Math.PI / 2, 0, 0]));
      w.position.set(x, 0.5, z);
      g.add(w);
    };
    [-4.6, -3.5, 7.55].forEach((x) => [-1.55, 1.55].forEach((z) => wheel(x, z)));
    // כנפיים מעל הגלגלים האחוריים
    [-1, 1].forEach((s) => g.add(box(2.4, 0.05, 0.42, M.chassis, -4.05, 1.08, s * 1.55)));

    // קבינה
    const cab = new THREE.Group();
    const prof = new THREE.Shape();
    prof.moveTo(0, 0); prof.lineTo(2.5, 0); prof.lineTo(2.55, 1.55); prof.lineTo(2.25, 2.55);
    prof.lineTo(0.15, 2.65); prof.lineTo(0, 2.6); prof.lineTo(0, 0);
    const cw = 2.5;
    const cabGeo = new THREE.ExtrudeGeometry(prof, { depth: cw - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 8 });
    cabGeo.translate(0, 0, -(cw - 0.16) / 2);
    cab.add(mesh(cabGeo, M.paint));
    // שמשה קדמית וחלונות
    const slope = Math.atan2(0.3, 1.0); // השמשה נוטה לאחור
    const ws = mesh(new THREE.BoxGeometry(0.02, 0.95, cw - 0.2), M.glass, [2.49, 2.05, 0]);
    ws.rotation.z = slope;
    cab.add(ws);
    [-1, 1].forEach((s) => {
      cab.add(mesh(new THREE.PlaneGeometry(1.1, 0.8), M.glass, [1.65, 2.05, s * (cw / 2 + 0.081)], [0, s > 0 ? 0 : Math.PI, 0]));
      cab.add(box(0.06, 0.32, 0.18, M.chassis, 2.2, 2.05, s * (cw / 2 + 0.3)));
      cab.add(box(0.5, 0.03, 0.03, M.chassis, 2.0, 2.05, s * (cw / 2 + 0.15)));
      cab.add(box(0.03, 0.14, 0.32, M.headlight, 2.635, 0.75, s * 0.85));
    });
    cab.add(box(0.05, 0.55, 1.2, M.chassis, 2.61, 1.0, 0));
    for (let i = 0; i < 5; i++) cab.add(box(0.06, 0.02, 1.15, M.brushed, 2.63, 0.8 + i * 0.1, 0));
    cab.add(box(0.2, 0.25, cw + 0.1, M.chassis, 2.6, 0.25, 0));
    // לוגו על דלת הקבינה
    const logo = canvasTex(400, 160, (ctx, Wd, Hd) => {
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = `700 ${Hd * 0.6}px ${FONT}`;
      ctx.fillText(cfg.name, Wd / 2, Hd / 2);
    }, { live: true });
    cab.add(mesh(new THREE.PlaneGeometry(0.75, 0.3), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false }), [1.25, 1.35, cw / 2 + 0.081]));
    cab.position.set(X1 + 0.05, 0.55, 0);
    g.add(cab);
    // פנסים אחוריים
    [-1, 1].forEach((s) => g.add(box(0.03, 0.12, 0.3, M.taillight, X0 - 0.02, F + 0.2, s * 1.5)));
  }

  /* ---------- פנים החנות ---------- */
  function buildInterior(g, M) {
    const { X0, X1, Z0, Z1, CEIL, OPEN_X, OPEN_TOP } = T;
    const L = X1 - X0 - 0.16, W = Z1 - Z0 - 0.16;
    g.add(mesh(new THREE.PlaneGeometry(L, W), M.floor, [0, F + 0.001, 0], [-Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.PlaneGeometry(L, W), M.ceiling, [0, CEIL, 0], [Math.PI / 2, 0, 0]));
    // קירות פנימיים לבנים
    const H = CEIL - F;
    g.add(mesh(new THREE.PlaneGeometry(L, H), M.inner, [0, F + H / 2, Z0 + 0.095]));
    g.add(mesh(new THREE.PlaneGeometry(W, H), M.inner, [X0 + 0.095, F + H / 2, 0], [0, Math.PI / 2, 0]));
    g.add(mesh(new THREE.PlaneGeometry(W, H), M.inner, [X1 - 0.095, F + H / 2, 0], [0, -Math.PI / 2, 0]));
    const sideW = X1 - 0.08 - OPEN_X;
    [-1, 1].forEach((s) => g.add(mesh(new THREE.PlaneGeometry(sideW, H), M.inner, [s * (OPEN_X + sideW / 2), F + H / 2, Z1 - 0.095], [0, Math.PI, 0])));
    g.add(mesh(new THREE.PlaneGeometry(OPEN_X * 2, CEIL - OPEN_TOP), M.inner, [0, (CEIL + OPEN_TOP) / 2, Z1 - 0.095], [0, Math.PI, 0]));
    // פסי לד בתקרה ותאורה פנימית
    [-1.0, 0, 1.0].forEach((z) => g.add(box(L - 0.6, 0.012, 0.045, M.led, 0, CEIL - 0.007, z)));
    [-2.6, 2.6].forEach((x) => {
      const l = new THREE.PointLight('#fff4e6', 5, 6.5, 1.6);
      l.position.set(x, CEIL - 0.3, -0.2);
      g.add(l);
    });
    // פס לד בבסיס הקירות
    g.add(box(L, 0.01, 0.01, M.ledWarm, 0, F + 0.03, Z0 + 0.09));

    // קיר אביזרים: פאנל סלאטים, מדפי עץ עם תאורה
    const wallX0 = -4.6, wallX1 = 2.3, wallLen = wallX1 - wallX0, wallC = (wallX0 + wallX1) / 2;
    g.add(box(wallLen, 2.2, 0.03, M.slat, wallC, F + 1.35, Z0 + 0.1));
    for (let i = 0; i < 22; i++) g.add(box(wallLen, 0.006, 0.006, M.inner, wallC, F + 0.3 + i * 0.1, Z0 + 0.118));
    T.SHELVES.forEach((y) => {
      g.add(box(wallLen - 0.2, 0.03, 0.3, M.oak, wallC, y - 0.015, Z0 + 0.25));
      g.add(box(wallLen - 0.3, 0.008, 0.02, M.ledWarm, wallC, y - 0.034, Z0 + 0.36));
    });
    // אריזות מוצרים על המדפים (תפאורה)
    const pack = packMaterials();
    const packs = [
      [T.SHELVES[0], [2.0, 1.75, -0.35, -2.3, -2.55, -4.2]],
      [T.SHELVES[1], [2.0, 0.35, 0.1, -1.75, -3.6, -3.85, -4.2]],
    ];
    packs.forEach(([y, xs]) => xs.forEach((x, i) => {
      const tall = i % 3 === 0;
      const w = tall ? 0.1 : 0.17, h = tall ? 0.19 : 0.04, d = tall ? 0.05 : 0.11;
      const stack = tall ? 1 : 3;
      for (let k = 0; k < stack; k++) {
        const b = mesh(new THREE.BoxGeometry(w, h, d), pack[(i + k) % pack.length], [x, y + h / 2 + k * h, Z0 + 0.26]);
        b.rotation.y = tall ? 0 : (k - 1) * 0.04;
        g.add(b);
      }
    }));

    // שולחן תצוגה מרכזי
    const tX0 = -3.55, tX1 = 1.15, tZ = T.TABLE_Z, tTop = F + 0.9;
    const tl = tX1 - tX0, tc = (tX0 + tX1) / 2;
    g.add(box(tl - 0.2, 0.86, 0.72, M.white, tc, F + 0.43, tZ));
    g.add(box(tl, 0.04, 0.9, M.oak, tc, tTop - 0.02, tZ));
    g.add(box(tl - 0.3, 0.01, 0.01, M.ledWarm, tc, F + 0.02, tZ + 0.37));

    // דלפק קופה
    g.add(box(0.6, 1.0, 1.55, M.white, 4.8, F + 0.5, -0.55));
    g.add(box(0.66, 0.04, 1.6, M.oak, 4.8, F + 1.02, -0.55));
  }

  /* אריזות לבנות ושחורות עם שם המותג */
  let packMats = null;
  function packMaterials() {
    if (packMats) return packMats;
    const make = (bg, fg) => {
      const t = canvasTex(256, 256, (ctx, W, H) => {
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = fg; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${H * 0.2}px ${FONT}`;
        ctx.fillText(Truck.cfg ? Truck.cfg.name : '', W / 2, H / 2);
      }, { live: true });
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
    };
    packMats = [make('#f4f4f2', '#1f2125'), make('#1f2125', '#ffffff'), make('#f4f4f2', '#1f2125')];
    return packMats;
  }

  /* מעמד אקריליק קטן לטלפון */
  function phoneStand(M) {
    const s = new THREE.Group();
    s.add(mesh(new THREE.BoxGeometry(0.11, 0.008, 0.09), M.acrylic, [0, 0.004, 0]));
    const back = mesh(new THREE.BoxGeometry(0.09, 0.12, 0.006), M.acrylic, [0, 0.06, -0.025]);
    back.rotation.x = -0.24;
    s.add(back);
    return s;
  }

  const Truck = {
    T,
    build(cfg) {
      Truck.cfg = cfg;
      T.SHELVES = [F + 1.0, F + 1.45];
      T.TABLE_Z = 0.25;
      const M = materials();
      const g = new THREE.Group();
      buildWorld(g, M);
      buildTruck(g, M, cfg);
      buildInterior(g, M);
      Truck.M = M;
      return g;
    },
    phoneStand: () => phoneStand(Truck.M),
    /* מקומות התצוגה (בקואורדינטות העולם) */
    slots() {
      const tTop = F + 0.9;
      return {
        table: [
          { x: 0.55, z: T.TABLE_Z, y: tTop, ry: 0, stand: true },
          { x: -0.45, z: T.TABLE_Z, y: tTop, ry: 0, stand: true },
          { x: -1.45, z: T.TABLE_Z, y: tTop, ry: 0, stand: true },
          { x: -2.45, z: T.TABLE_Z, y: tTop, ry: 0, tilt: -12 },
          { x: -3.25, z: T.TABLE_Z, y: tTop, ry: 0 },
          { x: 0.85, z: T.TABLE_Z - 0.3, y: tTop, ry: 0 },
        ],
        shelf: [
          { x: 1.4, z: T.Z0 + 0.27, y: T.SHELVES[1], ry: 0 },
          { x: 0.85, z: T.Z0 + 0.27, y: T.SHELVES[0], ry: 0 },
          { x: -0.6, z: T.Z0 + 0.27, y: T.SHELVES[1], ry: 0 },
          { x: -1.2, z: T.Z0 + 0.27, y: T.SHELVES[0], ry: 0 },
          { x: -2.6, z: T.Z0 + 0.27, y: T.SHELVES[1], ry: 0, tilt: -10 },
          { x: -3.6, z: T.Z0 + 0.27, y: T.SHELVES[0], ry: 0 },
        ],
      };
    },
    /* אזורים שאפשר ללכת בהם, וגובה הרצפה בכל נקודה */
    inInterior: (x, z) => x > T.X0 + 0.35 && x < T.X1 - 0.35 && z > T.Z0 + 0.42 && z < T.Z1 - 0.3,
    inSteps: (x, z) => Math.abs(x) < T.OPEN_X - 0.25 && z >= T.Z1 - 0.3 && z < 2.95,
    walkable(x, z) {
      if (Truck.inInterior(x, z) || Truck.inSteps(x, z)) {
        // רהיטים בתוך החנות
        if (x > -3.65 && x < 1.25 && Math.abs(z - T.TABLE_Z) < 0.62) return false;
        if (x > 4.35 && z > -1.5 && z < 0.4) return false;
        return true;
      }
      if (x > T.X0 - 0.3 && x < T.CAB_X1 + 0.3 && z > T.Z0 - 0.3 && z < T.Z1 + 0.25) return false;
      return Math.abs(x) < 15 && z > -12 && z < 12;
    },
    floorAt(x, z) {
      if (Truck.inInterior(x, z) || (Truck.inSteps(x, z) && z < T.Z1 + 0.02)) return F;
      if (Truck.inSteps(x, z)) return z < 2.25 ? 0.71 : z < 2.55 ? 0.47 : z < 2.85 ? 0.24 : 0.04;
      return z > 1.9 && z < 11 && Math.abs(x) < 11 ? 0.04 : 0;
    },
    redraw() { redrawers.forEach((fn) => fn()); },
  };
  window.StoreTruck = Truck;
})();
