/* חנות VR – בנויה עם A-Frame (WebXR).
 * עובד במשקפי Meta Quest / Pico / Vision Pro דרך הדפדפן, וגם במחשב ובנייד.
 */
(function () {
  'use strict';

  const CFG = window.STORE_CONFIG;
  const fmt = (n) => `${Number(n).toLocaleString('he-IL')} ${CFG.currency}`;
  const $ = (sel) => document.querySelector(sel);

  /* ------------------------------------------------------------------ *
   *  סל קניות                                                           *
   * ------------------------------------------------------------------ */
  const STORAGE_KEY = 'vrstore-cart-v1';
  const Cart = {
    items: {}, // id -> qty
    listeners: [],
    load() {
      try { this.items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { this.items = {}; }
      // ניקוי מוצרים שכבר לא קיימים בקטלוג
      Object.keys(this.items).forEach((id) => { if (!findProduct(id)) delete this.items[id]; });
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items)); } catch (e) { /* מצב פרטי */ }
      this.listeners.forEach((fn) => fn());
    },
    add(id) { this.items[id] = (this.items[id] || 0) + 1; this.save(); },
    remove(id) { delete this.items[id]; this.save(); },
    clear() { this.items = {}; this.save(); },
    lines() {
      return Object.entries(this.items).map(([id, qty]) => {
        const p = findProduct(id);
        return { product: p, qty, subtotal: p.price * qty };
      });
    },
    count() { return Object.values(this.items).reduce((a, b) => a + b, 0); },
    total() { return this.lines().reduce((a, l) => a + l.subtotal, 0); },
    onChange(fn) { this.listeners.push(fn); },
  };

  function findProduct(id) { return window.PRODUCTS.find((p) => p.id === id); }

  /* שליחת הזמנה – כאן מחברים שרת / סליקה אמיתית (Stripe, PayPal, Tranzila וכו').
   * כרגע זו הדמיה שמחזירה מספר הזמנה. */
  function submitOrder(lines, total) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ orderId: String(Math.floor(100000 + Math.random() * 900000)) }), 700);
    });
  }

  /* ------------------------------------------------------------------ *
   *  רכיב טקסט עברי (ציור על Canvas – תומך RTL, בניגוד לטקסט המובנה)     *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('canvas-text', {
    schema: {
      text: { default: '' },
      width: { default: 1 },          // מטרים
      height: { default: 0.25 },      // מטרים
      fontSize: { default: 0.07 },    // מטרים
      color: { default: '#111827' },
      bg: { default: '#ffffff' },     // 'none' לרקע שקוף
      align: { default: 'center' },   // center | right | left
      valign: { default: 'middle' },  // middle | top
      bold: { default: false },
      radius: { default: 0.03 },
      padding: { default: 0.05 },
      lineHeight: { default: 1.35 },
    },
    init() {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.texture = new THREE.CanvasTexture(this.canvas);
      if ('colorSpace' in this.texture) this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 4;
      this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
      this.el.setObject3D('mesh', this.mesh);
    },
    update() {
      const d = this.data;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(d.width, d.height);
      this.draw();
    },
    draw() {
      const d = this.data;
      const ppm = Math.min(512, 2048 / Math.max(d.width, d.height)); // פיקסלים למטר
      const W = Math.round(d.width * ppm);
      const H = Math.round(d.height * ppm);
      const c = this.canvas;
      const ctx = this.ctx;
      c.width = W; c.height = H;
      ctx.clearRect(0, 0, W, H);

      if (d.bg !== 'none') {
        const r = d.radius * ppm;
        ctx.fillStyle = d.bg;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(W - r, 0); ctx.quadraticCurveTo(W, 0, W, r);
        ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
        ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.fill();
      }

      const fontPx = d.fontSize * ppm;
      const pad = d.padding * ppm;
      ctx.direction = 'rtl';
      ctx.fillStyle = d.color;
      ctx.textBaseline = 'middle';
      ctx.font = `${d.bold ? 700 : 400} ${fontPx}px "Segoe UI", Arial, "Noto Sans Hebrew", sans-serif`;

      // שבירת שורות
      const maxW = W - pad * 2;
      const lines = [];
      String(d.text).split('\n').forEach((para) => {
        const words = para.split(' ');
        let line = '';
        words.forEach((w) => {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else { line = test; }
        });
        lines.push(line);
      });

      const lh = fontPx * d.lineHeight;
      let y = d.valign === 'top' ? pad + lh / 2 : H / 2 - ((lines.length - 1) * lh) / 2;
      let x;
      if (d.align === 'right') { ctx.textAlign = 'right'; x = W - pad; }
      else if (d.align === 'left') { ctx.textAlign = 'left'; x = pad; }
      else { ctx.textAlign = 'center'; x = W / 2; }

      lines.forEach((ln) => { ctx.fillText(ln, x, y); y += lh; });
      this.texture.needsUpdate = true;
    },
    remove() {
      this.el.removeObject3D('mesh');
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.texture.dispose();
    },
  });

  /* כפתור – אפקט ריחוף + פעולה בלחיצה */
  function makeButton(parent, { label, x = 0, y = 0, z = 0.01, w = 0.5, h = 0.14, bg = '#2563eb', color = '#ffffff', onClick }) {
    const el = document.createElement('a-entity');
    el.classList.add('clickable');
    el.setAttribute('position', `${x} ${y} ${z}`);
    el.setAttribute('canvas-text', { text: label, width: w, height: h, bg, color, bold: true, fontSize: h * 0.42, radius: h * 0.3 });
    el.addEventListener('mouseenter', () => el.object3D.scale.set(1.07, 1.07, 1.07));
    el.addEventListener('mouseleave', () => el.object3D.scale.set(1, 1, 1));
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick && onClick(); });
    parent.appendChild(el);
    return el;
  }

  /* ------------------------------------------------------------------ *
   *  סיבוב מוצרים                                                       *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('spin', {
    schema: { speed: { default: 25 } }, // מעלות לשנייה
    init() { this.boost = 1; },
    tick(t, dt) { this.el.object3D.rotation.y += THREE.MathUtils.degToRad(this.data.speed * this.boost) * (dt / 1000); },
  });

  /* ------------------------------------------------------------------ *
   *  הליכה וסיבוב עם הסטיקים של הבקרים                                   *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('thumbstick-move', {
    schema: { speed: { default: 2 }, bounds: { default: 4.3 }, snap: { default: 30 } },
    init() {
      this.axis = { x: 0, y: 0 };
      this.turnReady = true;
      this.fwd = new THREE.Vector3();
      this.right = new THREE.Vector3();
      this.camEl = null;
      const left = $('#leftHand');
      const right = $('#rightHand');
      left.addEventListener('thumbstickmoved', (e) => { this.axis.x = e.detail.x; this.axis.y = e.detail.y; });
      right.addEventListener('thumbstickmoved', (e) => {
        const x = e.detail.x;
        if (Math.abs(x) < 0.3) { this.turnReady = true; return; }
        if (this.turnReady && Math.abs(x) > 0.7) {
          this.el.object3D.rotation.y -= THREE.MathUtils.degToRad(this.data.snap) * Math.sign(x);
          this.turnReady = false;
        }
      });
    },
    tick(t, dt) {
      const { x, y } = this.axis;
      if (Math.hypot(x, y) < 0.15) return;
      if (!this.camEl) this.camEl = $('#camera');
      const cam = this.camEl.object3D;
      cam.getWorldDirection(this.fwd); // מצביע אחורה (+z) לאובייקט שאינו מצלמה
      this.fwd.y = 0; this.fwd.normalize().negate();
      this.right.set(-this.fwd.z, 0, this.fwd.x);
      const step = this.data.speed * (dt / 1000);
      const p = this.el.object3D.position;
      p.addScaledVector(this.fwd, -y * step).addScaledVector(this.right, x * step);
      const b = this.data.bounds;
      p.x = THREE.MathUtils.clamp(p.x, -b, b);
      p.z = THREE.MathUtils.clamp(p.z, -b, b);
    },
  });

  /* ------------------------------------------------------------------ *
   *  חלון צף (פרטי מוצר / תשלום / אישור)                                 *
   * ------------------------------------------------------------------ */
  const Panel = {
    show({ title = '', text = '', product = null, buttons = [] }) {
      const panel = $('#panel');
      while (panel.firstChild) panel.removeChild(panel.firstChild);

      const H = product ? 1.05 : 0.85;
      const bg = document.createElement('a-entity');
      bg.setAttribute('canvas-text', { text: '', width: 1.25, height: H, bg: '#ffffff', radius: 0.06 });
      panel.appendChild(bg);

      let top = H / 2 - 0.1;
      if (product) {
        const preview = buildModel(product);
        preview.setAttribute('position', `0 ${top - 0.17} 0.18`);
        preview.setAttribute('spin', 'speed: 45');
        panel.appendChild(preview);
        top -= 0.38;
      }

      const t = document.createElement('a-entity');
      t.setAttribute('position', `0 ${top - 0.04} 0.005`);
      t.setAttribute('canvas-text', { text: title, width: 1.15, height: 0.12, bg: 'none', bold: true, fontSize: 0.07 });
      panel.appendChild(t);

      const body = document.createElement('a-entity');
      const bodyH = top - 0.1 - (-H / 2 + 0.2);
      body.setAttribute('position', `0 ${top - 0.1 - bodyH / 2} 0.005`);
      body.setAttribute('canvas-text', { text, width: 1.15, height: bodyH, bg: 'none', fontSize: 0.045, valign: 'top', color: '#374151' });
      panel.appendChild(body);

      // כפתורים בשורה – הראשון מימין (RTL)
      const bw = 0.5, gap = 0.06;
      const total = buttons.length * bw + (buttons.length - 1) * gap;
      buttons.forEach((b, i) => {
        makeButton(panel, { ...b, w: bw, x: total / 2 - bw / 2 - i * (bw + gap), y: -H / 2 + 0.11 });
      });
      makeButton(panel, { label: '✕', x: -0.55, y: H / 2 - 0.07, w: 0.1, h: 0.1, bg: '#e5e7eb', color: '#111827', onClick: Panel.hide });

      // מיקום מול המשתמש
      const camObj = $('#camera').object3D;
      const pos = new THREE.Vector3(); camObj.getWorldPosition(pos);
      const dir = new THREE.Vector3(); camObj.getWorldDirection(dir);
      dir.y = 0; dir.normalize().negate();
      const target = pos.clone().addScaledVector(dir, 1.3);
      target.y = pos.y - 0.15;
      panel.object3D.position.copy(target);
      panel.object3D.lookAt(pos.x, target.y, pos.z);
      panel.setAttribute('visible', true);
    },
    hide() {
      const panel = $('#panel');
      panel.setAttribute('visible', false);
      while (panel.firstChild) panel.removeChild(panel.firstChild);
    },
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.setAttribute('canvas-text', { text: msg, width: 0.6, height: 0.11, bg: '#16a34a', color: '#fff', bold: true, fontSize: 0.05, radius: 0.04 });
    el.setAttribute('visible', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.setAttribute('visible', false), 1600);
  }

  /* ------------------------------------------------------------------ *
   *  זרימות מסך                                                         *
   * ------------------------------------------------------------------ */
  function openProduct(p) {
    const inCart = Cart.items[p.id] || 0;
    Panel.show({
      product: p,
      title: `${p.name} · ${fmt(p.price)}`,
      text: p.description + (inCart ? `\n\nכבר בסל: ${inCart}` : ''),
      buttons: [
        { label: 'הוסף לסל 🛒', bg: '#16a34a', onClick: () => { Cart.add(p.id); toast(`${p.name} נוסף לסל ✓`); openProduct(p); } },
        { label: 'לסל הקניות', bg: '#2563eb', onClick: openCheckout },
      ],
    });
  }

  function openCheckout() {
    const lines = Cart.lines();
    if (!lines.length) {
      Panel.show({ title: 'הסל ריק', text: 'בחרו מוצר מהמדפים כדי להתחיל.', buttons: [{ label: 'המשך קנייה', onClick: Panel.hide }] });
      return;
    }
    const text = lines.map((l) => `${l.product.name} × ${l.qty} – ${fmt(l.subtotal)}`).join('\n') + `\n\nסה״כ לתשלום: ${fmt(Cart.total())}`;
    Panel.show({
      title: 'סיכום הזמנה',
      text,
      buttons: [
        { label: 'אישור ותשלום', bg: '#16a34a', onClick: confirmOrder },
        { label: 'המשך קנייה', bg: '#6b7280', onClick: Panel.hide },
      ],
    });
  }

  function confirmOrder() {
    const lines = Cart.lines();
    const total = Cart.total();
    Panel.show({ title: 'מעבד תשלום…', text: 'רק רגע', buttons: [] });
    submitOrder(lines, total).then(({ orderId }) => {
      Cart.clear();
      Panel.show({
        title: 'תודה! ההזמנה התקבלה 🎉',
        text: `מספר הזמנה: ${orderId}\nסכום: ${fmt(total)}\n\nאישור יישלח אליכם במייל.`,
        buttons: [{ label: 'סגור', onClick: Panel.hide }],
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  בניית החנות                                                        *
   * ------------------------------------------------------------------ */
  function buildModel(p) {
    const el = document.createElement('a-entity');
    const s = p.scale || 0.3;
    if (p.model) {
      el.setAttribute('gltf-model', p.model);
      el.setAttribute('scale', `${s} ${s} ${s}`);
      return el;
    }
    const geo = {
      box: `primitive: box; width: ${s}; height: ${s * 0.8}; depth: ${s * 0.5}`,
      sphere: `primitive: sphere; radius: ${s / 2}`,
      cylinder: `primitive: cylinder; radius: ${s / 2.6}; height: ${s}`,
      cone: `primitive: cone; radiusBottom: ${s / 2.4}; radiusTop: ${s / 8}; height: ${s}`,
      torus: `primitive: torus; radius: ${s / 2.6}; radiusTubular: ${s / 12}`,
      octahedron: `primitive: octahedron; radius: ${s / 2}`,
      dodecahedron: `primitive: dodecahedron; radius: ${s / 2}`,
    }[p.shape] || `primitive: box; width: ${s}; height: ${s}; depth: ${s}`;
    el.setAttribute('geometry', geo);
    el.setAttribute('material', `color: ${p.color}; roughness: 0.45; metalness: 0.15`);
    return el;
  }

  function buildProduct(section, p, x) {
    const s = p.scale || 0.3;
    const SHELF_Y = 1.0;

    // מעמד
    const stand = document.createElement('a-entity');
    stand.setAttribute('geometry', 'primitive: cylinder; radius: 0.2; height: 0.04');
    stand.setAttribute('material', 'color: #f8fafc; roughness: 0.3');
    stand.setAttribute('position', `${x} ${SHELF_Y + 0.05} 0`);
    section.appendChild(stand);

    // הדגם – לחיץ
    const model = buildModel(p);
    model.classList.add('clickable');
    model.setAttribute('position', `${x} ${SHELF_Y + 0.1 + s / 2} 0`);
    model.setAttribute('spin', 'speed: 20');
    const base = p.model ? s : 1;
    model.addEventListener('mouseenter', () => { model.object3D.scale.setScalar(base * 1.18); model.components.spin.boost = 5; });
    model.addEventListener('mouseleave', () => { model.object3D.scale.setScalar(base); model.components.spin.boost = 1; });
    model.addEventListener('click', () => openProduct(p));
    section.appendChild(model);

    // תווית מחיר
    const tag = document.createElement('a-entity');
    tag.classList.add('clickable');
    tag.setAttribute('position', `${x} ${SHELF_Y - 0.17} 0.31`);
    tag.setAttribute('canvas-text', { text: `${p.name}\n${fmt(p.price)}`, width: 0.8, height: 0.22, fontSize: 0.06, bold: true, bg: '#ffffff', lineHeight: 1.25 });
    tag.addEventListener('click', () => openProduct(p));
    section.appendChild(tag);
  }

  function buildSection(root, cat, products, position, rotation) {
    const sec = document.createElement('a-entity');
    sec.setAttribute('position', position);
    sec.setAttribute('rotation', rotation);
    root.appendChild(sec);

    const add = (attrs) => { const e = document.createElement('a-entity'); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); sec.appendChild(e); return e; };

    // קיר אחורי, ארון ומדף
    add({ geometry: 'primitive: box; width: 4.4; height: 2.8; depth: 0.1', material: 'color: #ffffff; roughness: 0.9', position: '0 1.4 -0.45' });
    add({ geometry: 'primitive: box; width: 4.4; height: 0.06; depth: 0.1', material: `color: ${cat.color}`, position: '0 2.83 -0.43' });
    add({ geometry: 'primitive: box; width: 4.2; height: 0.96; depth: 0.6', material: 'color: #e2e8f0; roughness: 0.7', position: '0 0.48 0' });
    add({ geometry: 'primitive: box; width: 4.3; height: 0.05; depth: 0.66', material: `color: ${cat.color}; roughness: 0.5`, position: '0 0.985 0' });
    add({ position: '0 2.3 -0.39', 'canvas-text': { text: cat.name, width: 1.8, height: 0.38, bg: cat.color, color: '#ffffff', bold: true, fontSize: 0.17, radius: 0.08 } });

    const n = products.length;
    const spacing = Math.min(1.0, 4.0 / Math.max(n, 1));
    products.forEach((p, i) => buildProduct(sec, p, ((n - 1) / 2 - i) * spacing)); // מימין לשמאל
  }

  function buildCartBoard(root) {
    const board = document.createElement('a-entity');
    board.setAttribute('position', '0 0 3.6');
    board.setAttribute('rotation', '0 180 0');
    root.appendChild(board);

    const bg = document.createElement('a-entity');
    bg.setAttribute('position', '0 1.55 0');
    bg.setAttribute('canvas-text', { text: '', width: 2.8, height: 1.9, bg: '#1e293b', radius: 0.08 });
    board.appendChild(bg);

    const rows = document.createElement('a-entity');
    rows.setAttribute('position', '0 1.55 0.01');
    board.appendChild(rows);

    const render = () => {
      while (rows.firstChild) rows.removeChild(rows.firstChild);
      const add = (y, cfg, x = 0) => {
        const e = document.createElement('a-entity');
        e.setAttribute('position', `${x} ${y} 0`);
        e.setAttribute('canvas-text', cfg);
        rows.appendChild(e);
      };
      add(0.8, { text: `🛒 סל הקניות (${Cart.count()})`, width: 2.6, height: 0.2, bg: 'none', color: '#fff', bold: true, fontSize: 0.1 });

      const lines = Cart.lines();
      if (!lines.length) {
        add(0.2, { text: 'הסל ריק – בחרו מוצר מהמדפים', width: 2.6, height: 0.2, bg: 'none', color: '#94a3b8', fontSize: 0.07 });
      }
      const MAX = 6;
      lines.slice(0, MAX).forEach((l, i) => {
        const y = 0.55 - i * 0.17;
        add(y, { text: `${l.product.name} × ${l.qty}   ${fmt(l.subtotal)}`, width: 2.0, height: 0.14, bg: '#334155', color: '#fff', fontSize: 0.06, align: 'right', radius: 0.03 }, 0.25);
        makeButton(rows, { label: 'הסר', x: -1.0, y, z: 0, w: 0.4, h: 0.13, bg: '#dc2626', onClick: () => Cart.remove(l.product.id) });
      });
      if (lines.length > MAX) add(0.55 - MAX * 0.17, { text: `ועוד ${lines.length - MAX} מוצרים…`, width: 2.4, height: 0.12, bg: 'none', color: '#94a3b8', fontSize: 0.05 });

      add(-0.55, { text: `סה״כ: ${fmt(Cart.total())}`, width: 2.6, height: 0.16, bg: 'none', color: '#fde68a', bold: true, fontSize: 0.09 });
      if (lines.length) {
        makeButton(rows, { label: 'לתשלום', x: 0.4, y: -0.78, z: 0, w: 0.7, h: 0.17, bg: '#16a34a', onClick: openCheckout });
        makeButton(rows, { label: 'רוקן סל', x: -0.4, y: -0.78, z: 0, w: 0.7, h: 0.17, bg: '#6b7280', onClick: () => Cart.clear() });
      }
    };
    Cart.onChange(render);
    render();
  }

  function buildRoom(root) {
    const add = (attrs) => { const e = document.createElement('a-entity'); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); root.appendChild(e); return e; };
    const R = 4.8, WALL_H = 3.6;
    add({ geometry: `primitive: plane; width: ${R * 2}; height: ${R * 2}`, material: 'color: #c9b28f; roughness: 0.9', rotation: '-90 0 0' });
    add({ geometry: 'primitive: circle; radius: 1.4', material: 'color: #cbd5e1; roughness: 1', rotation: '-90 0 0', position: '0 0.005 0' });
    add({ geometry: `primitive: plane; width: ${R * 2}; height: ${R * 2}`, material: 'color: #f8fafc; side: double', rotation: '90 0 0', position: `0 ${WALL_H} 0` });
    [[0, -R, 0], [0, R, 180], [-R, 0, 90], [R, 0, -90]].forEach(([x, z, ry]) => {
      add({ geometry: `primitive: plane; width: ${R * 2}; height: ${WALL_H}`, material: 'color: #f1f5f9; roughness: 1', position: `${x} ${WALL_H / 2} ${z}`, rotation: `0 ${ry} 0` });
    });
    // מנורות תקרה
    [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]].forEach(([x, z]) => {
      add({ geometry: 'primitive: cylinder; radius: 0.35; height: 0.04', material: 'color: #fff; emissive: #fff; emissiveIntensity: 0.9', position: `${x} ${WALL_H - 0.03} ${z}` });
    });
    // שלט ברוכים הבאים
    add({ position: '0 3.12 -3.98', 'canvas-text': { text: `ברוכים הבאים ל${CFG.name}`, width: 3.2, height: 0.4, bg: '#0f172a', color: '#fff', bold: true, fontSize: 0.16, radius: 0.1 } });
  }

  AFRAME.registerComponent('store', {
    init() {
      Cart.load();
      const root = $('#store-root');
      buildRoom(root);

      const cats = window.CATEGORIES;
      const layout = [
        { position: '0 0 -3.6', rotation: '0 0 0' },     // מקדימה
        { position: '3.6 0 0', rotation: '0 -90 0' },    // מימין
        { position: '-3.6 0 0', rotation: '0 90 0' },    // משמאל
      ];
      cats.slice(0, layout.length).forEach((cat, i) => {
        const prods = window.PRODUCTS.filter((p) => p.category === cat.id);
        buildSection(root, cat, prods, layout[i].position, layout[i].rotation);
      });
      buildCartBoard(root);

      // שכבת HTML למסך רגיל
      $('#hud-title').textContent = CFG.name;
      const hud = () => { $('#hud-count').textContent = Cart.count(); $('#hud-total').textContent = fmt(Cart.total()); };
      Cart.onChange(hud); hud();
      this.el.addEventListener('enter-vr', () => { $('#hud').style.display = 'none'; Panel.hide(); });
      this.el.addEventListener('exit-vr', () => { $('#hud').style.display = ''; });
    },
  });

  // חשיפה לבדיקות / הרחבות
  window.VRStore = { Cart, Panel, openProduct, openCheckout };
})();
