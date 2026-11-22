/* מתחם הקניות בתלת-ממד: 8 חנויות של עסקים משני צדי הרחבה.
 * כל חנות: חזית זכוכית, שלט מואר בצבע המותג, ומוצרים בחלון הראווה שאפשר לקנות באותו סל.
 * מקום פנוי מציג "להשכרה" ומפנה לעמוד העסקים (merchant.html).
 * בלי שרת (תצוגה מקדימה) – מוצגות החנויות לדוגמה.
 */
(function () {
  'use strict';
  const V = () => window.VRStore;
  const $ = (s) => document.querySelector(s);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const FONT = '"Heebo", "Segoe UI", Arial, sans-serif';
  const fmt = (n) => `${Number(n).toLocaleString('he-IL')} ₪`;

  // מיקומי החנויות: צד שמאל (x שלילי) פונה ימינה, צד ימין פונה שמאלה
  const SLOT_Z = { 1: -9.5, 2: -5, 3: -0.5, 4: 5.6 };
  const SIDE_X = 13.6;
  const slotPose = (id) => {
    const side = id[0] === 'L' ? -1 : 1;
    return { x: side * SIDE_X, z: SLOT_Z[id[1]], ry: side < 0 ? Math.PI / 2 : -Math.PI / 2, side };
  };
  const SLOT_IDS = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];

  // אותו מידע כמו בשרת – לתצוגה בלי שרת
  const DEMO = {
    plans: [{ id: 'kiosk', name: 'דוכן', price: 149 }, { id: 'store', name: 'חנות', price: 349 }, { id: 'flagship', name: 'חנות דגל', price: 749 }],
    slots: SLOT_IDS.map((id) => ({ id, status: 'free' })),
  };
  [
    { id: 'demo-flowers', slot: 'L2', plan: 'store', name: 'פרחי השדרה', tagline: 'זרים טריים כל בוקר', color: '#e0457b', products: [['p1', 'זר ורדים אדומים', 189, 'זר של 15 ורדים אדומים עם עלוות אקליפטוס.', '🌹'], ['p2', 'זר פרחי שדה', 149, 'זר עונתי צבעוני, משלוח עד הבית.', '💐'], ['p3', 'עציץ סחלב', 129, 'סחלב לבן בכלי קרמיקה.', '🌸']] },
    { id: 'demo-coffee', slot: 'R2', plan: 'store', name: 'קלייה ברחבה', tagline: 'פולי קפה טריים', color: '#b7793f', products: [['p1', 'קפה אספרסו 500 גרם', 69, 'תערובת בית קלויה בינונית-כהה.', '☕'], ['p2', 'מקינטה 6 כוסות', 119, 'מקינטה אלומיניום קלאסית.', '🫖'], ['p3', 'מארז טעימות', 99, '4 זנים × 125 גרם.', '🎁']] },
    { id: 'demo-toys', slot: 'L3', plan: 'kiosk', name: 'צעצועי עץ', tagline: 'משחקים שנשארים לדור הבא', color: '#3aa76d', products: [['p1', 'רכבת עץ', 159, 'רכבת עם 3 קרונות וצבעים טבעיים.', '🚂'], ['p2', 'קוביות בנייה', 89, '50 קוביות עץ מלא.', '🧱']] },
  ].forEach((d) => {
    const s = DEMO.slots.find((x) => x.id === d.slot);
    s.status = 'open';
    s.store = { ...d, demo: true, products: d.products.map(([id, name, price, description, emoji]) => ({ id: `m.${d.id}.${id}`, name, price, description, emoji })) };
  });

  /* ---------- טקסטורות מצוירות ---------- */
  function canvasTex(w, hgt, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    draw(c.getContext('2d'), w, hgt);
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  function signTex(store, free) {
    return canvasTex(1400, 200, (x, W, H) => {
      x.fillStyle = '#fbfaf7'; x.fillRect(0, 0, W, H);
      const col = free ? '#ffd21f' : store.color;
      // סמל צבעוני קטן + שם העסק בכתב נקי
      x.fillStyle = col; if (x.roundRect) { x.beginPath(); x.roundRect(W - 150, 50, 100, 100, 22); x.fill(); } else x.fillRect(W - 150, 50, 100, 100);
      x.fillStyle = '#ffffff'; x.font = `800 58px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
      x.fillText(free ? '+' : (store.name || '').trim().charAt(0), W - 100, 102);
      x.textAlign = 'right';
      x.fillStyle = '#121620'; x.font = `700 78px ${FONT}`;
      x.fillText(free ? 'מקום פנוי להשכרה' : store.name, W - 190, H * 0.42);
      x.fillStyle = '#6a7180'; x.font = `400 34px ${FONT}`;
      x.fillText(free ? 'S.Y MALL · פתחו כאן את החנות שלכם' : (store.tagline || ''), W - 190, H * 0.78);
    });
  }
  function productTex(p, color) {
    return canvasTex(512, 512, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ecebe7');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = color; x.globalAlpha = 0.14; x.beginPath(); x.arc(W / 2, H * 0.44, W * 0.34, 0, 7); x.fill(); x.globalAlpha = 1;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `220px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.fillText(p.emoji || '🛍️', W / 2, H * 0.45);
    });
  }
  function tagTex(p) {
    return canvasTex(512, 128, (x, W, H) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
      x.direction = 'rtl'; x.textAlign = 'right'; x.textBaseline = 'middle';
      x.fillStyle = '#0b1222'; x.font = `600 40px ${FONT}`;
      let name = p.name; while (x.measureText(name).width > W * 0.62 && name.length > 4) name = name.slice(0, -2);
      if (name !== p.name) name += '…';
      x.fillText(name, W - 22, H / 2);
      x.textAlign = 'left'; x.font = `800 44px ${FONT}`; x.fillStyle = '#0b1222';
      x.fillText(fmt(p.price), 22, H / 2);
    });
  }
  function posterTex(plans) {
    const from = Math.min(...plans.map((p) => p.price));
    return canvasTex(800, 560, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d1a36'); g.addColorStop(1, '#070b16');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#ffd21f'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10);
      x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#ffd21f'; x.font = `900 70px ${FONT}`; x.fillText('החנות שלכם כאן', W / 2, 120);
      x.fillStyle = '#ffffff'; x.font = `500 40px ${FONT}`; x.fillText(`מנוי חודשי החל מ-${from} ₪`, W / 2, 230);
      x.fillText('ביטול בכל חודש · בלי דמי הקמה', W / 2, 300);
      x.fillStyle = '#ffd21f'; x.beginPath(); if (x.roundRect) x.roundRect(W / 2 - 200, 380, 400, 100, 22); else x.rect(W / 2 - 200, 380, 400, 100); x.fill();
      x.fillStyle = '#0b1222'; x.font = `800 46px ${FONT}`; x.fillText('לחצו לפרטים', W / 2, 432);
    });
  }

  /* ---------- בניית חנות ---------- */
  const M = {};
  function mats() {
    if (M.frame) return M;
    M.frame = new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.3, metalness: 0.85 });
    M.wall = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.9 });
    M.ceil = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const wood = (() => { // טקסטורת אלון עדינה
      const t = canvasTex(512, 512, (x, W, H) => {
        x.fillStyle = '#c9a57a'; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 220; i++) { const y = Math.random() * H; x.strokeStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},${30},${0.08 + Math.random() * 0.12})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(W * 0.3, y + 6 * Math.sin(i), W * 0.6, y - 5, W, y + 3); x.stroke(); }
        for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(80,55,30,0.18)'; x.fillRect(0, (k * H) / 6, W, 2); }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
    })();
    M.floor = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 });
    M.wood = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.5 });
    M.white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.12, metalness: 0.1, clearcoat: 1 });
    M.led = new THREE.MeshBasicMaterial({ color: '#fff6e6', toneMapped: false });
    return M;
  }
  const box = (w, hh, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };

  function buildSlot(root, slot, plans) {
    const pose = slotPose(slot.id);
    const store = slot.status === 'open' ? slot.store : null;
    const free = !store;
    const big = store && store.plan === 'flagship';
    const W = big ? 4.6 : 4.2, D = 2.6, H = 3.1;
    const m = mats();
    const g = new THREE.Group();
    g.position.set(pose.x, 0, pose.z); g.rotation.y = pose.ry;
    // מבנה: במת עץ, קירות לבנים, מסגרת אלומיניום שחורה דקה, תקרה מוארת
    g.add(box(W + 0.3, 0.12, D + 0.5, m.floor, 0, 0.06, -D / 2 + 0.25));
    g.add(box(W, H, 0.1, m.wall, 0, H / 2, -D));
    [-1, 1].forEach((s2) => {
      g.add(box(0.1, H, D, m.wall, s2 * W / 2, H / 2, -D / 2));
      g.add(box(0.05, H + 0.02, 0.05, m.frame, s2 * (W / 2 + 0.03), H / 2, 0.02)); // עמוד חזית
    });
    g.add(box(W + 0.12, 0.08, D + 0.1, m.wall, 0, H + 0.04, -D / 2));
    g.add(box(W + 0.12, 0.03, 0.05, m.frame, 0, H + 0.08, 0.02));
    const ceilLed = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.8, 0.12), m.led); ceilLed.rotation.x = Math.PI / 2; ceilLed.position.set(0, H - 0.02, -D * 0.55); g.add(ceilLed);
    // פס צבע המותג בקיר הצד – נגיעה, לא קיר שלם
    const accent = new THREE.MeshStandardMaterial({ color: free ? '#ffd21f' : store.color, roughness: 0.6 });
    g.add(box(0.02, H - 0.6, 0.5, accent, -W / 2 + 0.06, H / 2 - 0.1, -D + 0.45));
    // שלט: לוח לבן עם שם העסק, ופס אור מתחתיו
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, W / 7), new THREE.MeshBasicMaterial({ map: signTex(store, free), toneMapped: false }));
    sign.position.set(0, H + 0.42, 0.04); g.add(sign);
    g.add(box(W + 0.12, W / 7 + 0.08, 0.06, m.frame, 0, H + 0.42, 0.0));
    const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.02, 0.03), m.led); led.position.set(0, H + 0.08 + 0.02, 0.06); g.add(led);
    // תוכן החנות
    const hits = [];
    if (free) {
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshBasicMaterial({ map: posterTex(plans), toneMapped: false }));
      poster.position.set(0, 1.55, -D + 0.08); g.add(poster);
      hits.push({ local: new THREE.Vector3(0, 1.55, -D + 0.1), w: 2.0, h: 1.4, act: () => window.open('merchant.html', '_blank', 'noopener') });
    } else {
      const ps = store.products.slice(0, 6);
      const cols = Math.min(3, ps.length > 4 ? 3 : Math.max(2, ps.length));
      const loader = new THREE.TextureLoader();
      ps.forEach((p, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const x = (col - (cols - 1) / 2) * 1.25, y = row ? 0.95 : 1.95;
        const fr = box(0.92, 0.92, 0.05, m.white, x, y, -D + 0.1); g.add(fr);
        g.add(box(1.0, 0.04, 0.18, m.wood, x, y - 0.74, -D + 0.14));
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
        if (p.image) loader.load(p.image, (t) => { if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; });
        else mat.map = productTex(p, store.color);
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), mat); pic.position.set(x, y, -D + 0.13); g.add(pic);
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.23), new THREE.MeshBasicMaterial({ map: tagTex(p), toneMapped: false }));
        tag.position.set(x, y - 0.59, -D + 0.12); g.add(tag);
        hits.push({ local: new THREE.Vector3(x, y - 0.1, -D + 0.16), w: 0.95, h: 1.2, act: () => Sheet.open(p.id) });
      });
      // דלפק ושטיח בצבע המותג
      g.add(box(1.2, 0.9, 0.5, m.white, W / 2 - 0.8, 0.57, -0.8));
      g.add(box(1.26, 0.04, 0.56, m.wood, W / 2 - 0.8, 1.04, -0.8));
    }
    root.object3D.add(g);
    g.updateMatrixWorld(true);
    // אזורי לחיצה (יישויות A-Frame כדי שהסמן והבקרים יזהו אותם)
    hits.forEach((ht) => {
      const e = document.createElement('a-entity');
      const wp = g.localToWorld(ht.local.clone());
      e.setAttribute('geometry', `primitive: plane; width: ${ht.w}; height: ${ht.h}`);
      e.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false');
      e.setAttribute('position', `${wp.x} ${wp.y} ${wp.z}`);
      e.setAttribute('rotation', `0 ${THREE.MathUtils.radToDeg(pose.ry)} 0`);
      e.classList.add('clickable');
      e.addEventListener('click', ht.act);
      root.appendChild(e);
    });
    // קירות הצד חוסמים הליכה
    const obst = window.StorePlaza && window.StorePlaza.obstacles;
    if (obst) {
      [-1, 1].forEach((s) => { for (let d = 0.3; d < D; d += 0.6) { const p = g.localToWorld(new THREE.Vector3(s * W / 2, 0, -d)); obst.push([p.x, p.z, 0.35]); } });
      const back = g.localToWorld(new THREE.Vector3(0, 0, -D - 0.2)); obst.push([back.x, back.z, 0.5]);
    }
    return g;
  }

  /* ---------- מוצרי המתחם בתוך הסל ---------- */
  const Mall = {
    data: null, stores: [],
    register(data) {
      this.data = data;
      this.stores = data.slots.filter((s) => s.status === 'open').map((s) => s.store);
      const list = window.PRODUCTS;
      this.stores.forEach((st) => st.products.forEach((p) => {
        if (list.some((x) => x.id === p.id)) return;
        list.push({ id: p.id, name: p.name, price: p.price, description: p.description || '', category: 'mall', display: 'none', image: p.image || null, emoji: p.emoji || null, store: st.name, storeId: st.id, demo: !!st.demo, mall: true });
      }));
      const C = V() && V().Cart;
      if (C) C.listeners.forEach((fn) => fn());
    },
    product(id) { return window.PRODUCTS.find((p) => p.id === id); },
    store(id) { return this.stores.find((s) => s.id === id); },
  };

  /* חלון מוצר של המתחם (כמו החלון של מוצרי המשאית) */
  const Sheet = {
    id: null, qty: 1,
    open(id) {
      const p = Mall.product(id); if (!p) return;
      const st = Mall.store(p.storeId) || {};
      this.id = id; this.qty = 1;
      const el = $('#mall-sheet'); el.innerHTML = '';
      const close = h('button', 'drawer-x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'סגירה'); close.addEventListener('click', () => this.close());
      const pic = h('div', 'ms-pic');
      if (p.image) { const img = h('img'); img.src = p.image; img.alt = p.name; pic.append(img); } else pic.textContent = p.emoji || '🛍️';
      pic.style.setProperty('--c', st.color || '#1e6bff');
      const eyebrow = h('p', 'ms-store'); const dot = h('i'); dot.style.background = st.color || '#1e6bff'; eyebrow.append(dot, document.createTextNode(` ${p.store}`));
      const qtyBox = h('div', 'ms-qty');
      const minus = h('button', null, '−'), plus = h('button', null, '+'), q = h('span', null, '1');
      [minus, plus].forEach((b) => { b.type = 'button'; });
      minus.setAttribute('aria-label', 'פחות'); plus.setAttribute('aria-label', 'יותר');
      minus.addEventListener('click', () => { this.qty = Math.max(1, this.qty - 1); q.textContent = this.qty; add.textContent = addLabel(); });
      plus.addEventListener('click', () => { this.qty = Math.min(99, this.qty + 1); q.textContent = this.qty; add.textContent = addLabel(); });
      qtyBox.append(plus, q, minus);
      const addLabel = () => (p.demo ? 'חנות לדוגמה – לא למכירה' : `הוספה לסל · ${fmt(p.price * this.qty)}`);
      const add = h('button', 'ms-add', addLabel()); add.type = 'button'; add.disabled = p.demo;
      add.addEventListener('click', () => {
        V().Cart.add(p, null, this.qty);
        V().toast && V().toast(`נוסף לסל: ${p.name}`);
        this.close();
      });
      const more = h('div', 'ms-more');
      (st.products || []).filter((x) => x.id !== id).slice(0, 4).forEach((x) => {
        const b = h('button', null); b.type = 'button';
        b.append(h('span', 'e', x.emoji || '🛍️'), h('span', null, x.name), h('b', null, fmt(x.price)));
        if (x.image) { const im = h('img'); im.src = x.image; im.alt = ''; b.querySelector('.e').replaceWith(im); }
        b.addEventListener('click', () => this.open(x.id));
        more.append(b);
      });
      el.append(close, pic, eyebrow, h('h2', null, p.name), h('p', 'ms-price', fmt(p.price)), h('p', 'ms-desc', p.description || ''), h('div', 'ms-row'), add);
      el.querySelector('.ms-row').append(h('span', null, 'כמות'), qtyBox);
      if (more.children.length) el.append(h('p', 'ms-sub', `עוד מ${p.store}`), more);
      el.append(h('p', 'ms-note', 'משלוח עד הבית דרך קופת המתחם · תשלום מאובטח ב-PayPal'));
      if (V().Sheet) V().Sheet.close();
      el.hidden = false;
      document.body.classList.add('sheet-open');
      close.focus();
    },
    close() { $('#mall-sheet').hidden = true; this.id = null; document.body.classList.remove('sheet-open'); },
  };

  /* מדריך המתחם: רשימת החנויות + מעבר אליהן */
  const Directory = {
    open() {
      const el = $('#mall-dir'); el.innerHTML = '';
      const close = h('button', 'drawer-x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'סגירה'); close.addEventListener('click', () => this.close());
      el.append(close, h('p', 'ms-store', 'S.Y MALL'), h('h2', null, 'מדריך המתחם'));
      const list = h('div', 'dir-list');
      (Mall.data ? Mall.data.slots : []).forEach((s) => {
        const b = h('button', 'dir-item'); b.type = 'button';
        const sw = h('i'); sw.style.background = s.store ? s.store.color : 'transparent'; if (!s.store) sw.className = 'free';
        const txt = h('span'); txt.append(h('b', null, s.store ? s.store.name : 'מקום פנוי להשכרה'), h('small', null, s.store ? (s.store.tagline || '') : 'פתחו כאן חנות במנוי חודשי'));
        b.append(sw, txt);
        b.addEventListener('click', () => { this.close(); go(s.id); });
        list.append(b);
      });
      const cta = h('a', 'ms-add dir-cta', 'פתחו חנות במתחם'); cta.href = 'merchant.html'; cta.target = '_blank'; cta.rel = 'noopener';
      el.append(list, cta);
      el.hidden = false; document.body.classList.add('sheet-open'); close.focus();
    },
    close() { $('#mall-dir').hidden = true; document.body.classList.remove('sheet-open'); },
  };
  function go(slotId) {
    const p = slotPose(slotId);
    const slot = Mall.data && Mall.data.slots.find((x) => x.id === slotId);
    setTimeout(() => {
      if (!V().Shelf) return;
      if (slot && slot.store) V().Shelf.show(slot.store.name, slot.store.products.map((x) => Mall.product(x.id)).filter(Boolean));
      else V().Shelf.show('', []);
    }, 50);
    // עומדים מול החזית ומסתכלים פנימה
    V().Nav.go({ x: p.x - p.side * 3.4, z: p.z, yaw: p.side < 0 ? Math.PI / 2 : -Math.PI / 2, pitch: -0.08 });
  }

  AFRAME.registerComponent('mall', {
    init() {
      const build = (data) => {
        Mall.register(data);
        data.slots.forEach((s) => buildSlot(this.el, s, data.plans));
      };
      const start = () => {
        fetch('/api/mall').then((r) => (r.ok ? r.json() : Promise.reject())).then(build).catch(() => build(DEMO));
      };
      if (document.body.classList.contains('store-ready')) start();
      else { const iv = setInterval(() => { if (document.body.classList.contains('store-ready')) { clearInterval(iv); start(); } }, 300); }
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#mall-sheet').hidden) Sheet.close(); if (!$('#mall-dir').hidden) Directory.close(); } });
      const zb = $('#zones-mall'); if (zb) zb.addEventListener('click', () => Directory.open());
    },
  });

  window.StoreMall = { Mall, Sheet, Directory, go, slotPose };
})();
