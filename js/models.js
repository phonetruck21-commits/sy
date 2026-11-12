/* דגמים תלת-ממדיים שנבנים בקוד (בלי קבצים חיצוניים).
 * כל מוצר בקטלוג יכול לקבל kind מהרשימה למטה. אם אין – נבנית צורה בסיסית לפי shape.
 * כל דגם ממורכז סביב (0,0,0) ובגובה של בערך scale.
 */
(function () {
  'use strict';

  const mats = {};
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats[key]) {
      mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...opts });
      if (opts.emissive) mats[key].emissiveIntensity = opts.emissiveIntensity || 1;
    }
    return mats[key];
  }
  function mesh(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
  }
  const H = Math.PI / 2;

  const KINDS = {
    speaker(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.36, s * 0.38, s, 32), mat(c, { roughness: 0.8 })));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.34, s * 0.34, 0.012, 32), mat('#374151', { metalness: 0.5 }), 0, s / 2 + 0.006));
      g.add(mesh(new THREE.TorusGeometry(s * 0.26, 0.007, 8, 40), mat('#22d3ee', { emissive: '#22d3ee', emissiveIntensity: 1.4 }), 0, s / 2 + 0.014, 0, H));
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.008, 8, 8), mat('#e5e7eb'), (i - 1) * 0.03, s / 2 + 0.015, s * 0.12));
      return g;
    },

    headphones(s, c) {
      const g = new THREE.Group();
      const R = s * 0.38;
      g.add(mesh(new THREE.TorusGeometry(R, s * 0.045, 12, 40, Math.PI), mat(c, { roughness: 0.3 }), 0, -s * 0.05));
      g.add(mesh(new THREE.TorusGeometry(R * 0.93, s * 0.03, 8, 40, Math.PI * 0.7), mat('#111827', { roughness: 0.9 }), 0, -s * 0.05, 0, 0, 0, Math.PI * 0.15));
      [-1, 1].forEach((side) => {
        g.add(mesh(new THREE.CylinderGeometry(s * 0.15, s * 0.15, s * 0.11, 28), mat(c, { roughness: 0.3, metalness: 0.3 }), side * R, -s * 0.12, 0, 0, 0, H));
        g.add(mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.12, s * 0.05, 28), mat('#1f2937', { roughness: 1 }), side * (R - s * 0.07), -s * 0.12, 0, 0, 0, H));
        g.add(mesh(new THREE.CylinderGeometry(s * 0.06, s * 0.06, 0.004, 20), mat('#94a3b8', { metalness: 0.8, roughness: 0.2 }), side * (R + s * 0.057), -s * 0.12, 0, 0, 0, H));
      });
      return g;
    },

    watch(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(s * 0.42, s * 0.5, s * 0.12), mat('#9ca3af', { metalness: 0.8, roughness: 0.25 })));
      g.add(mesh(new THREE.PlaneGeometry(s * 0.36, s * 0.44), mat('#0b1220', { emissive: '#1d4ed8', emissiveIntensity: 0.35 }), 0, 0, s * 0.061));
      g.add(mesh(new THREE.TorusGeometry(s * 0.1, 0.006, 8, 30, Math.PI * 1.4), mat('#34d399', { emissive: '#34d399', emissiveIntensity: 1.2 }), 0, 0.01, s * 0.063));
      g.add(mesh(new THREE.BoxGeometry(s * 0.3, s * 0.5, s * 0.05), mat(c, { roughness: 0.9 }), 0, s * 0.48, -s * 0.02, -0.25));
      g.add(mesh(new THREE.BoxGeometry(s * 0.3, s * 0.5, s * 0.05), mat(c, { roughness: 0.9 }), 0, -s * 0.48, -s * 0.02, 0.25));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12), mat('#d1d5db', { metalness: 0.9 }), s * 0.22, 0.02, 0, 0, 0, H));
      g.scale.setScalar(0.85);
      return g;
    },

    lamp(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.22, s * 0.26, s * 0.08, 32), mat('#e5e7eb', { roughness: 0.3 }), 0, -s * 0.46));
      g.add(mesh(new THREE.SphereGeometry(s * 0.36, 32, 24), mat(c, { emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.92 }), 0, -s * 0.06));
      return g;
    },

    pot(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.22, s * 0.45, 28), mat(c, { roughness: 0.85 }), 0, -s * 0.27));
      g.add(mesh(new THREE.TorusGeometry(s * 0.3, s * 0.025, 8, 28), mat(c, { roughness: 0.85 }), 0, -s * 0.05, 0, H));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.28, s * 0.28, 0.01, 24), mat('#3f2a1d', { roughness: 1 }), 0, -s * 0.06));
      const leaf = mat('#16a34a', { roughness: 0.6 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const l = mesh(new THREE.SphereGeometry(s * 0.12, 12, 10), leaf, Math.cos(a) * s * 0.14, s * 0.12 + (i % 3) * s * 0.07, Math.sin(a) * s * 0.14);
        l.scale.set(0.6, 1.4, 0.35);
        l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
        g.add(l);
      }
      return g;
    },

    sculpture(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(s * 0.3, s * 0.12, s * 0.3), mat('#111827', { roughness: 0.4 }), 0, -s * 0.44));
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, s * 0.2, 8), mat('#d4af37', { metalness: 1, roughness: 0.2 }), 0, -s * 0.3));
      g.add(mesh(new THREE.TorusKnotGeometry(s * 0.17, s * 0.05, 90, 12), mat(c, { metalness: 0.7, roughness: 0.2 }), 0, s * 0.06));
      return g;
    },

    candle(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.3, s * 0.7, 28, 1, true), mat('#f59e0b', { transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide }), 0, -s * 0.15));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.27, s * 0.27, s * 0.55, 28), mat(c, { roughness: 0.9 }), 0, -s * 0.22));
      g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, s * 0.08, 6), mat('#111827'), 0, s * 0.09));
      const flame = mesh(new THREE.SphereGeometry(s * 0.06, 12, 10), mat('#fb923c', { emissive: '#fbbf24', emissiveIntensity: 2 }), 0, s * 0.18);
      flame.scale.set(0.7, 1.6, 0.7);
      flame.userData.flicker = true;
      g.add(flame);
      return g;
    },

    vase(s, c) {
      const g = new THREE.Group();
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector2(s * (0.12 + 0.16 * Math.sin(t * Math.PI * 1.1) + (t > 0.85 ? (t - 0.85) * 0.6 : 0)), (t - 0.5) * s * 0.8));
      }
      g.add(mesh(new THREE.LatheGeometry(pts, 32), mat(c, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 0, -s * 0.15));
      const colors = ['#f472b6', '#facc15', '#fb7185'];
      colors.forEach((fc, i) => {
        const a = (i / 3) * Math.PI * 2;
        const x = Math.cos(a) * s * 0.05, z = Math.sin(a) * s * 0.05;
        g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, s * 0.55, 6), mat('#15803d'), x, s * 0.25, z, z * 3, 0, -x * 3));
        g.add(mesh(new THREE.DodecahedronGeometry(s * 0.07), mat(fc, { roughness: 0.6 }), x * 2.2, s * 0.53, z * 2.2));
      });
      return g;
    },

    basketball(s, c) {
      const g = new THREE.Group();
      const r = s * 0.5;
      g.add(mesh(new THREE.SphereGeometry(r, 36, 28), mat(c, { roughness: 0.9 })));
      const line = mat('#1c1917', { roughness: 1 });
      g.add(mesh(new THREE.TorusGeometry(r * 1.003, 0.004, 6, 60), line, 0, 0, 0, H));
      g.add(mesh(new THREE.TorusGeometry(r * 1.003, 0.004, 6, 60), line));
      g.add(mesh(new THREE.TorusGeometry(r * 1.003, 0.004, 6, 60), line, 0, 0, 0, 0, H));
      return g;
    },

    bottle(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.17, s * 0.17, s * 0.78, 28), mat(c, { metalness: 0.6, roughness: 0.25 }), 0, -s * 0.1));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.172, s * 0.172, s * 0.18, 28), mat('#ffffff', { roughness: 0.6 }), 0, -s * 0.05));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.15, s * 0.08, 24), mat(c, { metalness: 0.6, roughness: 0.25 }), 0, s * 0.33));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.12, s * 0.1, 24), mat('#111827', { roughness: 0.5 }), 0, s * 0.42));
      g.add(mesh(new THREE.TorusGeometry(s * 0.06, 0.006, 8, 20), mat('#111827'), 0, s * 0.5));
      return g;
    },

    dumbbell(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.05, s * 0.05, s * 1.0, 16), mat('#d1d5db', { metalness: 0.9, roughness: 0.2 }), 0, 0, 0, 0, 0, H));
      [-1, 1].forEach((side) => {
        g.add(mesh(new THREE.CylinderGeometry(s * 0.2, s * 0.2, s * 0.16, 6), mat(c, { roughness: 0.6 }), side * s * 0.32, 0, 0, 0, 0, H));
        g.add(mesh(new THREE.CylinderGeometry(s * 0.15, s * 0.15, s * 0.08, 6), mat(c, { roughness: 0.6 }), side * s * 0.44, 0, 0, 0, 0, H));
      });
      g.rotation.z = 0.2;
      return g;
    },

    yogamat(s, c) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(s * 0.2, s * 0.2, s * 0.9, 32), mat(c, { roughness: 0.8 }), 0, 0, 0, 0, 0, H));
      g.add(mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.12, s * 0.902, 24), mat('#831843', { roughness: 1 }), 0, 0, 0, 0, 0, H));
      [-1, 1].forEach((side) => g.add(mesh(new THREE.TorusGeometry(s * 0.205, 0.008, 8, 30), mat('#111827'), side * s * 0.25, 0, 0, 0, H)));
      return g;
    },
  };

  function basicShape(shape, s, c) {
    const geo = {
      box: () => new THREE.BoxGeometry(s, s * 0.8, s * 0.5),
      sphere: () => new THREE.SphereGeometry(s / 2, 32, 24),
      cylinder: () => new THREE.CylinderGeometry(s / 2.6, s / 2.6, s, 32),
      cone: () => new THREE.CylinderGeometry(s / 8, s / 2.4, s, 32),
      torus: () => new THREE.TorusGeometry(s / 2.6, s / 12, 16, 40),
      octahedron: () => new THREE.OctahedronGeometry(s / 2),
      dodecahedron: () => new THREE.DodecahedronGeometry(s / 2),
    }[shape] || (() => new THREE.BoxGeometry(s, s, s));
    return mesh(geo(), mat(c, { roughness: 0.45, metalness: 0.15 }));
  }

  /* דגם מוצר: Group של THREE */
  function build(p) {
    const s = p.scale || 0.3;
    const g = (KINDS[p.kind] ? KINDS[p.kind](s, p.color) : basicShape(p.shape, s, p.color));
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return g;
  }

  /* ---------- קישוטים ---------- */
  function plant(height = 1.4) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 24), mat('#f5f5f4', { roughness: 0.7 }), 0, 0.25));
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24), mat('#3f2a1d', { roughness: 1 }), 0, 0.49));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, height * 0.6, 8), mat('#78350f'), 0, 0.5 + height * 0.3));
    const greens = ['#15803d', '#16a34a', '#22c55e'];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, r = 0.12 + (i % 4) * 0.06, y = 0.75 + (i / 16) * height * 0.75;
      const l = mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(greens[i % 3], { roughness: 0.6 }), Math.cos(a) * r, y, Math.sin(a) * r);
      l.scale.set(0.5, 1.3, 0.25);
      l.rotation.set(Math.sin(a) * 0.9, -a, Math.cos(a) * 0.9);
      g.add(l);
    }
    return g;
  }

  /* המוכר הרובוטי */
  function robot() {
    const g = new THREE.Group();
    const white = mat('#f8fafc', { roughness: 0.25, metalness: 0.1 });
    const accent = mat('#6366f1', { roughness: 0.3 });
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.06, 28), accent, 0, 0.03));
    const body = mesh(new THREE.CapsuleGeometry(0.2, 0.35, 8, 24), white, 0, 0.55);
    g.add(body);
    g.add(mesh(new THREE.CircleGeometry(0.07, 24), mat('#6366f1', { emissive: '#818cf8', emissiveIntensity: 0.9 }), 0, 0.6, 0.2));
    const head = new THREE.Group();
    head.position.set(0, 1.02, 0);
    head.add(mesh(new THREE.SphereGeometry(0.19, 32, 24), white));
    const visor = mesh(new THREE.SphereGeometry(0.16, 32, 24), mat('#0f172a', { roughness: 0.1, metalness: 0.4 }), 0, 0, 0.06);
    visor.scale.set(1, 0.62, 0.8);
    head.add(visor);
    const eyeMat = mat('#22d3ee', { emissive: '#22d3ee', emissiveIntensity: 1.6 });
    const eyes = [];
    [-1, 1].forEach((side) => {
      const e = mesh(new THREE.SphereGeometry(0.028, 16, 12), eyeMat, side * 0.06, 0.01, 0.18);
      e.scale.set(1, 1.3, 0.5);
      eyes.push(e);
      head.add(e);
    });
    const smile = mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 20, Math.PI), eyeMat, 0, -0.045, 0.175, 0, 0, Math.PI);
    head.add(smile);
    head.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), accent, 0, 0.23));
    head.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), mat('#f472b6', { emissive: '#f472b6', emissiveIntensity: 1.5 }), 0, 0.3));
    g.add(head);
    const arms = [];
    [-1, 1].forEach((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.25, 0.72, 0);
      const arm = mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 12), white, 0, -0.15, 0);
      pivot.add(arm);
      pivot.add(mesh(new THREE.SphereGeometry(0.055, 12, 10), accent, 0, -0.3, 0));
      pivot.rotation.z = side * 0.15;
      arms.push(pivot);
      g.add(pivot);
    });
    g.userData = { head, eyes, arms };
    return g;
  }

  window.StoreModels = { build, plant, robot, KINDS: Object.keys(KINDS) };
})();
