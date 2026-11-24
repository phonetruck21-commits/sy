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
    // שמיים של שעת אחר הצהריים: מעבר צבע, שמש ועננים רכים (מפה equirect על כדור)
    sky: () => {
      const r = rng(77);
      return canvasTex(2048, 1024, (ctx, W, H) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#3f78c8'); g.addColorStop(0.3, '#7fa9dc'); g.addColorStop(0.44, '#d9d4cf');
        g.addColorStop(0.5, '#f4d8b8'); g.addColorStop(0.52, '#d9c7b2'); g.addColorStop(1, '#8d8478');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // השמש – באותו כיוון כמו האור הראשי
        const [sx, sy] = Truck.sunUV(); const px = sx * W, py = sy * H;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, H * 0.45);
        glow.addColorStop(0, 'rgba(255,236,200,0.95)'); glow.addColorStop(0.08, 'rgba(255,214,160,0.55)'); glow.addColorStop(1, 'rgba(255,200,150,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff7e6'; ctx.beginPath(); ctx.arc(px, py, H * 0.022, 0, Math.PI * 2); ctx.fill();
        // עננים
        for (let i = 0; i < 46; i++) {
          const cx = r() * W, cy = H * (0.22 + r() * 0.24), w = W * (0.03 + r() * 0.06), hh = w * (0.18 + r() * 0.12);
          const warm = Math.max(0, 1 - Math.abs(cx - px) / (W * 0.25));
          for (let k = 0; k < 6; k++) {
            const ox = (r() - 0.5) * w * 1.4, oy = (r() - 0.5) * hh;
            const cg = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, w * 0.6);
            cg.addColorStop(0, `rgba(255,${235 - warm * 30},${225 - warm * 50},${0.42 - (cy / H - 0.22) * 0.6})`);
            cg.addColorStop(1, 'rgba(255,240,230,0)');
            ctx.fillStyle = cg;
            ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, w * 0.6, hh, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    },
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
    return canvasTex(Math.round(w * 220), Math.round(h * 220), (ctx, W, H) => {
      const B = window.StoreBrand, Y = '#ffd21f', BL = '#1e6bff';
      // רקע: שחור-כחול לילי עם הילה כחולה ופסי מהירות צהובים
      const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0a1020'); bg.addColorStop(1, '#05070d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.84, H * 0.45, 0, W * 0.84, H * 0.45, H * 0.9);
      glow.addColorStop(0, 'rgba(30,107,255,0.45)'); glow.addColorStop(1, 'rgba(30,107,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = Y;
      for (let i = 0; i < 5; i++) {
        const y = H * (0.2 + i * 0.075), len = W * (0.06 + (i % 3) * 0.03);
        ctx.save(); ctx.transform(1, 0, -0.35, 1, 0, 0);
        ctx.fillRect(W * 0.03 + y * 0.35, y, len, H * 0.022); ctx.restore();
      }
      // פס תחתון צהוב-כחול
      ctx.fillStyle = Y; ctx.fillRect(0, H * 0.88, W, H * 0.035);
      ctx.fillStyle = BL; ctx.fillRect(0, H * 0.915, W, H * 0.012);
      if (W < H * 2.4) { if (B) B.drawBadge(ctx, W / 2, H * 0.45, Math.min(W * 0.9, H * 0.8)); return; }
      if (B) B.drawBadge(ctx, W - H * 0.52, H * 0.45, H * 0.82);
      const R = W - H * 1.05;
      if (B) B.drawWordmark(ctx, R, H * 0.33, H * 0.17, { align: 'right', font: FONT });
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff'; ctx.font = `700 ${H * 0.085}px ${FONT}`;
      ctx.fillText(cfg.tagline, R, H * 0.47);
      ctx.fillStyle = Y; ctx.font = `700 ${H * 0.065}px ${FONT}`;
      ctx.fillText(cfg.sub || '', R, H * 0.57);
      ctx.fillStyle = '#c9d3e6'; ctx.font = `400 ${H * 0.05}px ${FONT}`;
      ctx.fillText('טלפונים · מחשבים · אביזרים · מצלמות אבטחה · בית חכם', R, H * 0.67);
      // טלפון ואתר
      ctx.direction = 'ltr'; ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff'; ctx.font = `800 ${H * 0.075}px ${FONT}`;
      ctx.fillText((B ? B.PHONE : '') + '  ·  ' + (B ? B.SITE : ''), R, H * 0.8);
    }, { live: true });
  }

  function fascia(cfg, w, h) {
    return canvasTex(Math.round(w * 220), Math.round(h * 220), (ctx, W, H) => {
      const B = window.StoreBrand;
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d1424'); bg.addColorStop(1, '#070a12');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd21f'; ctx.fillRect(0, H * 0.94, W, H * 0.06);
      let left = W / 2, right = W / 2;
      if (B) {
        const s = H * 0.78, wh = H * 0.4;
        const tmp = document.createElement('canvas').getContext('2d');
        const ww = B.drawWordmark(tmp, 0, 0, wh, { font: FONT });
        const total = s + H * 0.22 + ww;
        left = W / 2 - total / 2; right = W / 2 + total / 2;
        B.drawMark(ctx, left, (H - s) / 2 - H * 0.02, s);
        B.drawWordmark(ctx, left + s + H * 0.22, H * 0.64, wh, { font: FONT });
      }
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillStyle = '#dfe6f3';
      ctx.font = `500 ${H * 0.2}px ${FONT}`;
      ctx.fillText(cfg.tagline, left - H * 0.45, H * 0.5);
      ctx.textAlign = 'left';
      ctx.fillText('פתוח עכשיו', right + H * 0.5, H * 0.5);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath(); ctx.arc(right + H * 0.32, H * 0.49, H * 0.07, 0, Math.PI * 2); ctx.fill();
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
      inner: new THREE.MeshStandardMaterial({ color: '#e7e4df', roughness: 0.9, emissive: '#e7e4df', emissiveIntensity: 0.12 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#f7f6f4', roughness: 1, emissive: '#f7f6f4', emissiveIntensity: 0.55 }),
      floor: new THREE.MeshStandardMaterial({ map: tex.concrete(), color: '#77736d', roughness: 0.35, metalness: 0 }),
      charcoal: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.8 }),
      oakWall: (() => { const m = new THREE.MeshStandardMaterial({ map: tex.oak(), roughness: 0.6 }); m.map.rotation = Math.PI / 2; m.map.repeat.set(1, 4); return m; })(),
      pad: new THREE.MeshPhysicalMaterial({ color: '#fbfbfa', roughness: 0.18, clearcoat: 0.8 }),
      padGlow: new THREE.MeshBasicMaterial({ color: '#cfe0ff', toneMapped: false }),
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
  /* הסביבה (שמיים, קרקע, שכונה) נבנית ב-js/city.js */
  function buildWorld() {}

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
    const logo = canvasTex(600, 240, (ctx, Wd, Hd) => {
      const B = window.StoreBrand;
      if (B) { B.drawMark(ctx, 0, Hd * 0.1, Hd * 0.8); B.drawWordmark(ctx, Hd * 0.92, Hd * 0.66, Hd * 0.34, { font: FONT }); }
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
      const l = new THREE.PointLight('#fff4e6', 7, 6.5, 1.6);
      l.position.set(x, CEIL - 0.3, -0.2);
      g.add(l);
    });
    // פס לד בבסיס הקירות
    g.add(box(L, 0.01, 0.01, M.ledWarm, 0, F + 0.03, Z0 + 0.09));

    // קיר אביזרים: פאנל עץ במסגרת כהה, שלט, מדפים מוארים
    const wallX0 = -3.0, wallX1 = 1.6, wallLen = wallX1 - wallX0, wallC = (wallX0 + wallX1) / 2;
    g.add(box(wallLen + 0.3, H - 0.1, 0.03, M.charcoal, wallC, F + (H - 0.1) / 2, Z0 + 0.105));
    g.add(box(wallLen, 1.55, 0.02, M.oakWall, wallC, F + 1.25, Z0 + 0.125));
    g.add(mesh(new THREE.PlaneGeometry(2.2, 0.36), new THREE.MeshBasicMaterial({ map: signTex('אביזרים ואודיו', 'מטענים · סוללות · אוזניות · כיסויים', 2.2, 0.36, '#2a2b2e'), toneMapped: false }), [wallC, F + 2.32, Z0 + 0.122]));
    T.SHELVES.forEach((y) => {
      g.add(box(wallLen - 0.15, 0.03, 0.3, M.white, wallC, y - 0.015, Z0 + 0.27));
      g.add(box(wallLen - 0.25, 0.008, 0.02, M.ledWarm, wallC, y - 0.034, Z0 + 0.38));
    });
    // שולחן תצוגה מרכזי ושלט תלוי מעליו
    const tX0 = T.TABLE_X0, tX1 = T.TABLE_X1, tZ = T.TABLE_Z, tTop = F + 0.9;
    const tl = tX1 - tX0, tc = (tX0 + tX1) / 2;
    g.add(box(tl - 0.2, 0.86, 0.72, M.white, tc, F + 0.43, tZ));
    g.add(box(tl, 0.04, 0.9, M.oak, tc, tTop - 0.02, tZ));
    g.add(box(tl - 0.3, 0.01, 0.01, M.ledWarm, tc, F + 0.02, tZ + 0.37));
    const signY = CEIL - 0.55;
    const hang = new THREE.Group();
    const st = signTex('טלפונים, טאבלטים ושעונים', 'הרימו כל מכשיר ובחנו אותו מקרוב', 2.0, 0.34, '#2a2b2e');
    hang.add(mesh(new THREE.BoxGeometry(2.04, 0.38, 0.03), M.charcoal));
    hang.add(mesh(new THREE.PlaneGeometry(2.0, 0.34), new THREE.MeshBasicMaterial({ map: st, toneMapped: false }), [0, 0, 0.016]));
    hang.add(mesh(new THREE.PlaneGeometry(2.0, 0.34), new THREE.MeshBasicMaterial({ map: st, toneMapped: false }), [0, 0, -0.016], [0, Math.PI, 0]));
    [-0.9, 0.9].forEach((x) => hang.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, CEIL - signY - 0.19, 6), M.steel, [x, (CEIL - signY) / 2 + 0.095, 0])));
    hang.position.set(tc, signY, tZ);
    g.add(hang);

    // דלפק קופה ושלט
    g.add(box(0.6, 1.0, 1.55, M.white, 4.8, F + 0.5, -0.55));
    g.add(box(0.66, 0.04, 1.6, M.oak, 4.8, F + 1.02, -0.55));
  }

  /* שלט: כותרת ושורת משנה על רקע כהה */
  function signTex(title, sub, w, h, bg) {
    return canvasTex(Math.round(w * 400), Math.round(h * 400), (ctx, W, H) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = `700 ${H * 0.36}px ${FONT}`;
      ctx.fillText(title, W / 2, H * 0.4);
      ctx.fillStyle = '#b9bdc4'; ctx.font = `400 ${H * 0.17}px ${FONT}`;
      ctx.fillText(sub, W / 2, H * 0.76);
    }, { live: true });
  }

  /* משטח תצוגה מואר מתחת למוצר */
  function pad(M, r) {
    const p = new THREE.Group();
    p.add(mesh(new THREE.CylinderGeometry(r, r, 0.014, 48), M.pad, [0, 0.007, 0]));
    p.add(mesh(new THREE.TorusGeometry(r, 0.0025, 8, 64), M.padGlow, [0, 0.012, 0], [Math.PI / 2, 0, 0]));
    return p;
  }

  /* אריזות לבנות ושחורות עם שם המותג */
  let packMats = null;
  function packMaterials() {
    if (packMats) return packMats;
    const make = (bg, fg) => {
      const t = canvasTex(256, 256, (ctx, W, H) => {
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = fg; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `italic 900 ${H * 0.2}px ${FONT}`;
        ctx.fillText('S.Y', W / 2, H / 2);
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

  const SUN = new THREE.Vector3(0.763, 0.358, 0.539).normalize(); // כיוון השמש בתמונת השמיים האמיתית
  const Truck = {
    T,
    SUN,
    sunUV() {
      const phi = Math.atan2(SUN.z, -SUN.x);
      const u = ((phi / (Math.PI * 2)) + 1) % 1;
      const theta = Math.acos(SUN.y);
      return [u, theta / Math.PI];
    },
    build(cfg) {
      Truck.cfg = cfg;
      T.SHELVES = [F + 1.0, F + 1.48];
      T.TABLE_Z = 0.25;
      T.TABLE_X0 = -2.95; T.TABLE_X1 = 0.95;
      const M = materials();
      const g = new THREE.Group();
      buildWorld(g, M);
      buildTruck(g, M, cfg);
      buildInterior(g, M);
      Truck.M = M;
      return g;
    },
    phoneStand: () => phoneStand(Truck.M),
    pad: (r) => pad(Truck.M, r),
    /* מקומות התצוגה (בקואורדינטות העולם) */
    slots() {
      const tTop = F + 0.9;
      return {
        // טלפונים בקבוצה אחת, טאבלט ושעון לידם
        table: [
          { x: 0.35, z: T.TABLE_Z, y: tTop, ry: 0, stand: true },
          { x: -0.25, z: T.TABLE_Z, y: tTop, ry: 0, stand: true },
          { x: -0.85, z: T.TABLE_Z, y: tTop, ry: 0, stand: true },
          { x: -1.65, z: T.TABLE_Z, y: tTop, ry: 0, tilt: -12 },
          { x: -2.4, z: T.TABLE_Z, y: tTop, ry: 0 },
          { x: 0.75, z: T.TABLE_Z - 0.3, y: tTop, ry: 0 },
        ],
        shelf: [
          { x: 0.95, z: T.Z0 + 0.29, y: T.SHELVES[1], ry: 0 },
          { x: 0.3, z: T.Z0 + 0.29, y: T.SHELVES[0], ry: 0 },
          { x: -0.4, z: T.Z0 + 0.29, y: T.SHELVES[1], ry: 0 },
          { x: -1.05, z: T.Z0 + 0.29, y: T.SHELVES[0], ry: 0 },
          { x: -1.75, z: T.Z0 + 0.29, y: T.SHELVES[1], ry: 0, tilt: -10 },
          { x: -2.35, z: T.Z0 + 0.29, y: T.SHELVES[0], ry: 0 },
        ],
      };
    },
    /* אזורים שאפשר ללכת בהם, וגובה הרצפה בכל נקודה */
    inInterior: (x, z) => x > T.X0 + 0.35 && x < T.X1 - 0.35 && z > T.Z0 + 0.42 && z < T.Z1 - 0.3,
    inSteps: (x, z) => Math.abs(x) < T.OPEN_X - 0.25 && z >= T.Z1 - 0.3 && z < 2.95,
    walkable(x, z) {
      if (Truck.inInterior(x, z) || Truck.inSteps(x, z)) {
        // רהיטים בתוך החנות
        if (x > T.TABLE_X0 - 0.1 && x < T.TABLE_X1 + 0.1 && Math.abs(z - T.TABLE_Z) < 0.62) return false;
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
    /* נקודות עצירה לניווט: מיקום המבקר, כיוון מבט וזווית */
    VIEWS: [
      { id: 'outside', label: 'הרחבה', x: 0, z: 8.2, yaw: 0, pitch: 0.03 },
      { id: 'phones', label: 'טלפונים', x: -0.25, z: 1.3, yaw: 0, pitch: -0.55 },
      { id: 'devices', label: 'טאבלט ושעון', x: -2.0, z: 1.3, yaw: 0, pitch: -0.55 },
      { id: 'accessories', label: 'אביזרים', x: -0.65, z: -0.48, yaw: 0, pitch: -0.12 },
      { id: 'checkout', label: 'קופה', x: 3.7, z: -0.55, yaw: -Math.PI / 2, pitch: 0.02 },
    ],
  };
  window.StoreTruck = Truck;
})();
