/* סביבה ואווירה: מפת השתקפויות (כדי שמתכת, זכוכית וקטיפה ייראו אמיתיים),
 * טקסטורות לרצפה, לעץ ולשטיח, וצללים רכים מתחת למוצרים.
 */
(function () {
  'use strict';

  /* ---------- מפת סביבה: "חדר סטודיו" עם לוחות אור, לפי RoomEnvironment של three.js ---------- */
  function studioEnvironment(renderer) {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry();
    geo.deleteAttribute('uv');
    const roomMat = new THREE.MeshStandardMaterial({ side: THREE.BackSide, color: 0xd9d4cc });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xbfb8ae });

    const light = new THREE.PointLight(0xffffff, 900, 28, 2);
    light.position.set(0.418, 16.199, 0.3);
    scene.add(light);

    const room = new THREE.Mesh(geo, roomMat);
    room.position.set(-0.757, 13.219, 0.717);
    room.scale.set(31.713, 28.305, 28.591);
    scene.add(room);

    [
      [[-10.906, 2.009, 1.846], -0.195, [2.328, 7.905, 4.651]],
      [[-5.607, -0.754, -0.758], 0.994, [1.97, 1.534, 3.955]],
      [[6.167, 0.857, 7.803], 0.561, [3.927, 6.285, 3.687]],
      [[-2.017, 0.018, 6.124], 0.333, [2.002, 4.566, 2.064]],
      [[2.291, -0.756, -2.621], -0.286, [1.546, 1.552, 1.496]],
      [[-2.193, -0.369, -5.547], 0.516, [3.875, 3.487, 2.986]],
    ].forEach(([p, ry, s]) => {
      const b = new THREE.Mesh(geo, boxMat);
      b.position.set(...p); b.rotation.y = ry; b.scale.set(...s);
      scene.add(b);
    });

    const area = (i, p, s) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      m.material.color.setScalar(i);
      m.position.set(...p); m.scale.set(...s);
      scene.add(m);
    };
    area(50, [-16.116, 14.37, 8.208], [0.1, 2.428, 2.739]);
    area(50, [-16.109, 18.021, -8.207], [0.1, 2.425, 2.751]);
    area(17, [14.904, 12.198, -1.832], [0.15, 4.265, 6.331]);
    area(43, [-0.462, 8.89, 14.52], [4.38, 5.441, 0.088]);
    area(20, [3.235, 11.486, -12.541], [2.5, 2.0, 0.1]);
    area(100, [0.0, 20.0, 0.0], [1.0, 0.1, 1.0]);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(scene, 0.04).texture;
    pmrem.dispose();
    return tex;
  }

  /* ---------- טקסטורות ---------- */
  function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    return t;
  }

  // מספרים אקראיים קבועים – כך שהטקסטורה זהה בכל טעינה
  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

  /* רצפת עץ אלון בהיר, קרשים רחבים */
  function oakFloor() {
    const r = rng(7);
    return canvasTex(1024, 1024, (ctx, W, H) => {
      const plankW = W / 4;
      for (let col = 0; col < 4; col++) {
        let y = -r() * 600;
        while (y < H) {
          const len = 520 + r() * 500;
          const l = 74 + r() * 6;
          ctx.fillStyle = `hsl(${32 + r() * 4}, ${26 + r() * 6}%, ${l}%)`;
          ctx.fillRect(col * plankW, y, plankW, len);
          // סיבי עץ עדינים
          for (let g = 0; g < 26; g++) {
            const gx = col * plankW + r() * plankW;
            ctx.strokeStyle = `rgba(120, 85, 50, ${0.03 + r() * 0.05})`;
            ctx.lineWidth = 0.6 + r() * 1.6;
            ctx.beginPath();
            ctx.moveTo(gx, y);
            ctx.bezierCurveTo(gx + (r() - 0.5) * 14, y + len / 3, gx + (r() - 0.5) * 14, y + (2 * len) / 3, gx + (r() - 0.5) * 8, y + len);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(70, 50, 30, 0.22)';
          ctx.fillRect(col * plankW, y, plankW, 1.5);
          y += len;
        }
        ctx.fillStyle = 'rgba(70, 50, 30, 0.25)';
        ctx.fillRect(col * plankW, 0, 1.5, H);
      }
    }, { repeat: [3.5, 3] });
  }

  /* עץ אלון לרהיטים ולקיר הסלאטים */
  function oakWood() {
    const r = rng(19);
    return canvasTex(512, 512, (ctx, W, H) => {
      ctx.fillStyle = '#b68b5e';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 160; i++) {
        const x = r() * W;
        ctx.strokeStyle = `rgba(${90 + r() * 40}, ${60 + r() * 25}, 35, ${0.06 + r() * 0.12})`;
        ctx.lineWidth = 0.5 + r() * 2.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (r() - 0.5) * 30, H / 3, x + (r() - 0.5) * 30, (2 * H) / 3, x, H);
        ctx.stroke();
      }
    });
  }

  /* שטיח צמר בגוון חול עם מסגרת דקה */
  function woolRug() {
    const r = rng(41);
    return canvasTex(1024, 768, (ctx, W, H) => {
      ctx.fillStyle = '#cfc4b3';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 26000; i++) {
        const v = r();
        ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(80,60,40,0.06)';
        ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
      }
      ctx.strokeStyle = 'rgba(70, 55, 40, 0.55)';
      ctx.lineWidth = 6;
      ctx.strokeRect(36, 36, W - 72, H - 72);
      ctx.lineWidth = 2;
      ctx.strokeRect(54, 54, W - 108, H - 108);
    });
  }

  /* צל רך – עיגול מטושטש */
  let shadowTex = null;
  function softShadow() {
    if (shadowTex) return shadowTex;
    shadowTex = canvasTex(256, 256, (ctx, W) => {
      const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.62)');
      g.addColorStop(0.45, 'rgba(0,0,0,0.32)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, W);
    }, { srgb: false });
    shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping;
    return shadowTex;
  }

  function shadowMesh(w, d, opacity = 0.55) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    return m;
  }

  AFRAME.registerComponent('studio-environment', {
    init() {
      const apply = () => {
        const scene = this.el.object3D;
        scene.environment = studioEnvironment(this.el.renderer);
        scene.environmentIntensity = 0.9;
      };
      if (this.el.renderer) apply(); else this.el.addEventListener('renderstart', apply, { once: true });
    },
  });

  /* ---------- מערכת אנימציות פשוטה ---------- */
  const tweens = [];
  AFRAME.registerSystem('tween', {
    tick(t, dt) {
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        const k = tw.ease(tw.t);
        tw.step(k);
        if (tw.t >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
      }
    },
  });
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function tween(dur, step, done, ease = easeOut) {
    const tw = { t: 0, dur, step, done, ease };
    tweens.push(tw);
    return tw;
  }

  window.StoreEnv = { oakFloor, oakWood, woolRug, shadowMesh, tween, rng };
})();
