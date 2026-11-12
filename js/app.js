/* חנות VR – בנויה עם A-Frame (WebXR).
 * עובד במשקפי Meta Quest / Pico / Vision Pro דרך הדפדפן, וגם במחשב ובנייד.
 * תלוי ב: js/products.js (קטלוג), js/models.js (דגמים), js/fx.js (סאונד ואפקטים)
 */
(function () {
  'use strict';

  const CFG = window.STORE_CONFIG;
  const { Sound, pulse, flyToCart, burst, confettiDOM } = window.StoreFX;
  const fmt = (n) => `${Number(n).toLocaleString('he-IL')} ${CFG.currency}`;
  const $ = (sel) => document.querySelector(sel);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const inVR = () => { const s = $('a-scene'); return !!(s && s.is('vr-mode')); };

  /* ------------------------------------------------------------------ *
   *  סל קניות                                                           *
   * ------------------------------------------------------------------ */
  const STORAGE_KEY = 'vrstore-cart-v1';
  const Cart = {
    items: {}, // id -> qty
    listeners: [],
    load() {
      try { this.items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { this.items = {}; }
      Object.keys(this.items).forEach((id) => { if (!findProduct(id)) delete this.items[id]; });
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items)); } catch (e) { /* מצב פרטי */ }
      this.listeners.forEach((fn) => fn());
    },
    add(id) { this.items[id] = Math.min(99, (this.items[id] || 0) + 1); this.save(); },
    remove(id) { delete this.items[id]; this.save(); },
    clear() { this.items = {}; this.save(); },
    lines() {
      return Object.entries(this.items).map(([id, qty]) => {
        const p = findProduct(id);
        return { product: p, qty, subtotal: p.price * qty };
      });
    },
    count() { return Object.values(this.items).reduce((a, b) => a + b, 0); },
    total() { return this.lines().reduce((a, l) => a + l.subtotal, 0); }, // מוצרים בלבד
    // אותו חוק כמו בשרת (server.js → shippingFor)
    shipping() {
      const free = Number(CFG.freeShippingOver) || 0, cost = Number(CFG.shippingCost) || 0;
      const t = this.total();
      if (!t || !cost || free === 0 || t >= free) return 0;
      return cost;
    },
    toFreeShipping() { const free = Number(CFG.freeShippingOver) || 0; return free ? Math.max(0, free - this.total()) : 0; },
    grandTotal() { return this.total() + this.shipping(); },
    savings() { return this.lines().reduce((a, l) => a + Math.max(0, (l.product.oldPrice || l.product.price) - l.product.price) * l.qty, 0); },
    onChange(fn) { this.listeners.push(fn); },
  };

  function findProduct(id) { return window.PRODUCTS.find((p) => p.id === id); }

  /* ------------------------------------------------------------------ *
   *  תשלום עם PayPal                                                    *
   *  כפתורי PayPal הם חלון רגיל של הדפדפן, ולכן בזמן התשלום יוצאים       *
   *  ממצב VR, ואחרי התשלום אפשר לחזור לחנות בלחיצה.                       *
   * ------------------------------------------------------------------ */
  async function api(url, body) {
    const res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { issue: json.issue });
    return json;
  }

  const Checkout = {
    sdk: null,
    returnToVR: false,

    loadPayPal() {
      if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
      if (!this.sdk) {
        this.sdk = api('api/config').then((cfg) => {
          if (!cfg.clientId) throw new Error('config');
          return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}`
              + `&currency=${encodeURIComponent(cfg.currency)}&intent=capture&locale=he_IL`;
            s.onload = () => resolve(window.paypal);
            s.onerror = () => reject(new Error('sdk'));
            document.head.appendChild(s);
          });
        });
        this.sdk.catch(() => { this.sdk = null; }); // לאפשר ניסיון חוזר
      }
      return this.sdk;
    },

    status(msg, kind = '') {
      const el = $('#co-status');
      el.textContent = msg;
      el.className = kind;
    },

    open(fromVR) {
      const lines = Cart.lines();
      if (!lines.length) return;
      this.returnToVR = !!fromVR;
      const ul = $('#co-lines');
      ul.innerHTML = '';
      const row = (a, b, cls) => {
        const li = document.createElement('li');
        if (cls) li.className = cls;
        li.innerHTML = '<span></span><span></span>';
        li.children[0].textContent = a;
        li.children[1].textContent = b;
        ul.appendChild(li);
      };
      lines.forEach((l) => row(`${l.product.name} × ${l.qty}`, fmt(l.subtotal)));
      row('משלוח', Cart.shipping() ? fmt(Cart.shipping()) : 'חינם 🎉', 'co-ship');
      if (Cart.savings()) row('חסכתם במבצעים', fmt(Cart.savings()), 'co-save');
      $('#co-total').textContent = `סה״כ לתשלום: ${fmt(Cart.grandTotal())}`;
      $('#co-summary').hidden = false;
      $('#co-done').hidden = true;
      $('#paypal-buttons').innerHTML = '';
      $('#checkout').hidden = false;
      this.status('טוען את PayPal…');

      this.loadPayPal().then((paypal) => {
        this.status('');
        return paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay' },
          createOrder: () => api('api/orders', { items: Cart.items }).then((d) => d.id),
          onApprove: (data, actions) => {
            this.status('מאשר את התשלום…');
            return api(`api/orders/${data.orderID}/capture`, {})
              .then((r) => {
                if (r.status === 'COMPLETED') this.success(r);
                else this.status('התשלום לא הושלם. נסו שוב.', 'error');
              })
              .catch((err) => {
                if (err.issue === 'INSTRUMENT_DECLINED') return actions.restart(); // כרטיס נדחה – בחירת אמצעי אחר
                this.status('גביית התשלום נכשלה. לא חויבתם – נסו שוב.', 'error');
              });
          },
          onCancel: () => this.status('התשלום בוטל. אפשר לנסות שוב.'),
          onError: () => this.status('אירעה שגיאה מול PayPal. נסו שוב בעוד רגע.', 'error'),
        }).render('#paypal-buttons');
      }).catch(() => {
        this.status('התשלום לא זמין כרגע: השרת או פרטי PayPal לא מוגדרים (ראו README).', 'error');
      });
    },

    success(r) {
      const total = Cart.grandTotal();
      Cart.clear();
      $('#co-summary').hidden = true;
      $('#co-done').hidden = false;
      $('#co-done-text').textContent = `מספר אישור: ${r.captureId || r.orderId}\nסכום: ${fmt(r.amount ? r.amount.value : total)}`;
      $('#co-back-vr').hidden = !this.returnToVR;
      this.status('');
      this.lastReceipt = r;
      confettiDOM();
      Sound.success();
      Seller.pendingThanks = true;
    },

    close() {
      $('#checkout').hidden = true;
      $('#paypal-buttons').innerHTML = '';
      if (Seller.pendingThanks && !inVR()) Seller.thank();
    },

    backToVR() {
      $('#checkout').hidden = true;
      $('#paypal-buttons').innerHTML = '';
      $('a-scene').enterVR();
    },
  };

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
      bg2: { default: '' },           // צבע שני למעבר צבע
      border: { default: '' },        // צבע מסגרת
      align: { default: 'center' },   // center | right | left
      valign: { default: 'middle' },  // middle | top
      bold: { default: false },
      strike: { default: false },     // קו חוצה (מחיר קודם)
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
      // alphaTest: פיקסלים שקופים לא "מסתירים" את מה שמאחוריהם
      this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, alphaTest: 0.02 });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
      this.el.setObject3D('mesh', this.mesh);
    },
    update(old) {
      const d = this.data;
      if (!old || old.width !== d.width || old.height !== d.height) {
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(d.width, d.height);
      }
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
        const r = Math.min(d.radius * ppm, H / 2, W / 2);
        const bw = d.border ? Math.max(2, ppm * 0.006) : 0;
        ctx.beginPath();
        const x0 = bw / 2, y0 = bw / 2, x1 = W - bw / 2, y1 = H - bw / 2;
        ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
        ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
        ctx.lineTo(x0 + r, y1); ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
        ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
        if (d.bg2) {
          const grad = ctx.createLinearGradient(0, 0, W, H);
          grad.addColorStop(0, d.bg); grad.addColorStop(1, d.bg2);
          ctx.fillStyle = grad;
        } else ctx.fillStyle = d.bg;
        ctx.fill();
        if (bw) { ctx.lineWidth = bw; ctx.strokeStyle = d.border; ctx.stroke(); }
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

      lines.forEach((ln) => {
        ctx.fillText(ln, x, y);
        if (d.strike && ln) {
          const w = ctx.measureText(ln).width;
          const sx = d.align === 'right' ? x - w : d.align === 'left' ? x : x - w / 2;
          ctx.strokeStyle = d.color;
          ctx.lineWidth = Math.max(2, fontPx * 0.09);
          ctx.beginPath(); ctx.moveTo(sx - 2, y); ctx.lineTo(sx + w + 2, y); ctx.stroke();
        }
        y += lh;
      });
      this.texture.needsUpdate = true;
    },
    remove() {
      this.el.removeObject3D('mesh');
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.texture.dispose();
    },
  });

  function entity(parent, attrs = {}, object3D = null) {
    const e = document.createElement('a-entity');
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') v.split(' ').forEach((c) => e.classList.add(c));
      else e.setAttribute(k, v);
    });
    if (object3D) e.setObject3D('mesh', object3D);
    parent.appendChild(e);
    return e;
  }

  /* כפתור – אפקט ריחוף + צליל + פעולה בלחיצה */
  function makeButton(parent, { label, x = 0, y = 0, z = 0.01, w = 0.5, h = 0.14, bg = '#2563eb', bg2 = '', color = '#ffffff', onClick }) {
    const el = entity(parent, { class: 'clickable', position: `${x} ${y} ${z}` });
    el.setAttribute('canvas-text', { text: label, width: w, height: h, bg, bg2, color, bold: true, fontSize: h * 0.42, radius: h * 0.5 });
    el.addEventListener('mouseenter', () => { el.object3D.scale.setScalar(1.08); Sound.hover(); });
    el.addEventListener('mouseleave', () => el.object3D.scale.setScalar(1));
    el.addEventListener('click', (e) => { e.stopPropagation(); Sound.click(); onClick && onClick(); });
    return el;
  }

  /* ------------------------------------------------------------------ *
   *  אנימציות קטנות                                                     *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('spin', {
    schema: { speed: { default: 25 } }, // מעלות לשנייה
    init() { this.boost = 1; this.paused = false; },
    tick(t, dt) {
      if (this.paused) return;
      this.el.object3D.rotation.y += THREE.MathUtils.degToRad(this.data.speed * this.boost) * (dt / 1000);
    },
  });

  AFRAME.registerComponent('bob', {
    schema: { amp: { default: 0.03 }, speed: { default: 1 } },
    init() { this.y0 = this.el.object3D.position.y; this.phase = Math.random() * 6; },
    tick(t) { this.el.object3D.position.y = this.y0 + Math.sin(t / 1000 * this.data.speed * 2 + this.phase) * this.data.amp; },
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
      $('#leftHand').addEventListener('thumbstickmoved', (e) => { this.axis.x = e.detail.x; this.axis.y = e.detail.y; });
      $('#rightHand').addEventListener('thumbstickmoved', (e) => {
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
      this.camEl.object3D.getWorldDirection(this.fwd); // מצביע אחורה (+z) לאובייקט שאינו מצלמה
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
   *  המוכר הרובוטי                                                      *
   * ------------------------------------------------------------------ */
  const Seller = {
    el: null,
    bubble: null,
    parts: null,
    talkUntil: 0,
    lastSpoke: 0,
    idleIdx: 0,
    greeted: false,
    pendingThanks: false,
    shippingCelebrated: false,

    idleLines() {
      const lines = [
        `היי! אני ${CFG.sellerName}, כאן לעזור 👋`,
        '⭐ הציצו במוצר החודש – במחיר מבצע!',
        '✋ במשקף: כוונו על מוצר ולחצו Grip כדי להרים אותו',
        '🛒 לחצו עליי כשתרצו לעבור לקופה',
      ];
      if (CFG.freeShippingOver) lines.splice(2, 0, `🚚 משלוח חינם בהזמנה מעל ${fmt(CFG.freeShippingOver)}`);
      return lines;
    },

    build(root) {
      const robot = window.StoreModels.robot();
      this.parts = robot.userData;
      this.el = entity(root, { class: 'clickable', position: '1.75 0 3.75', 'face-camera': 'speed: 3' }, robot);
      this.el.addEventListener('click', () => {
        if (Cart.count()) { this.say('בואו נסגור את ההזמנה! 💳'); openCheckout(); }
        else this.say(pick(['הסל עדיין ריק – בואו נמצא לכם משהו מיוחד 😊', 'אני ממליצה על מוצר החודש! ⭐']));
      });
      this.el.addEventListener('mouseenter', () => Sound.hover());
      this.bubble = entity(this.el, { position: '0 1.62 0', visible: 'false' });
      this.el.setAttribute('seller-anim', '');
    },

    say(text, ms = 4500) {
      if (!this.bubble) return;
      this.bubble.setAttribute('canvas-text', { text, width: 1.25, height: 0.3, bg: '#ffffff', border: '#6366f1', color: '#1e1b4b', bold: true, fontSize: 0.065, radius: 0.12 });
      this.bubble.setAttribute('visible', true);
      this.bubble.object3D.scale.setScalar(0.6);
      this.talkUntil = performance.now() + ms;
      this.lastSpoke = performance.now();
      Sound.blip();
    },

    thank() {
      this.pendingThanks = false;
      this.say('תודה על הקנייה! 🎉 נשמח לראות אתכם שוב', 6000);
      const p = new THREE.Vector3();
      this.el.object3D.getWorldPosition(p);
      p.y += 1.3;
      burst(p, { count: 60 });
      Sound.success();
    },

    onAdd() {
      const rem = Cart.toFreeShipping();
      if (CFG.freeShippingOver && rem === 0 && !this.shippingCelebrated) {
        this.shippingCelebrated = true;
        this.say('🎉 יש! קיבלתם משלוח חינם');
      } else if (CFG.freeShippingOver && rem > 0) {
        this.say(`${pick(['בחירה מצוינת! 😍', 'טעם משובח! ✨', 'אהבתי! 👌'])}\nעוד ${fmt(rem)} למשלוח חינם 🚚`);
      } else {
        this.say(pick(['בחירה מצוינת! 😍', 'טעם משובח! ✨', 'אהבתי! 👌']));
      }
    },
  };

  const camPos = new THREE.Vector3();
  const selfPos = new THREE.Vector3();
  AFRAME.registerComponent('seller-anim', {
    init() { this.nextBlink = 2000; this.nextCheck = 0; },
    tick(t, dt) {
      const P = Seller.parts;
      if (!P) return;
      const now = performance.now();
      const talking = now < Seller.talkUntil;
      // ריחוף, נפנוף, מצמוץ
      this.el.object3D.position.y = 0.04 + Math.sin(t / 650) * 0.03;
      P.arms[1].rotation.z = talking ? 2.4 + Math.sin(t / 110) * 0.35 : THREE.MathUtils.lerp(P.arms[1].rotation.z, 0.15, 0.08);
      P.arms[0].rotation.z = -0.15 + Math.sin(t / 900) * 0.05;
      P.head.rotation.z = talking ? Math.sin(t / 260) * 0.08 : 0;
      if (t > this.nextBlink) {
        P.eyes.forEach((e) => { e.scale.y = 0.15; });
        if (t > this.nextBlink + 120) { P.eyes.forEach((e) => { e.scale.y = 1.3; }); this.nextBlink = t + 2500 + Math.random() * 2500; }
      }
      // בועת דיבור
      const b = Seller.bubble;
      if (b && b.object3D.visible) {
        const s = b.object3D.scale.x;
        if (talking && s < 1) b.object3D.scale.setScalar(Math.min(1, s + dt / 200));
        if (!talking) { b.object3D.scale.setScalar(Math.max(0, s - dt / 250)); if (b.object3D.scale.x <= 0.01) b.setAttribute('visible', false); }
      }
      if (t < this.nextCheck) return;
      this.nextCheck = t + 500;
      // ברכה כשמתקרבים + משפטים מתחלפים
      $('#camera').object3D.getWorldPosition(camPos);
      this.el.object3D.getWorldPosition(selfPos);
      const dist = Math.hypot(camPos.x - selfPos.x, camPos.z - selfPos.z);
      if (dist < 2.3 && !Seller.greeted) { Seller.greeted = true; Seller.say(`שלום! אני ${CFG.sellerName} 👋 איך אפשר לעזור?`); return; }
      if (dist > 3.2) Seller.greeted = false;
      if (now - Seller.lastSpoke > 9000 && $('#intro').hidden) {
        const lines = Seller.idleLines();
        Seller.say(lines[Seller.idleIdx++ % lines.length]);
      }
    },
  });

  /* ------------------------------------------------------------------ *
   *  חלון צף (פרטי מוצר / סיכום)                                        *
   * ------------------------------------------------------------------ */
  const Panel = {
    preview: null,
    show({ title = '', text = '', product = null, buttons = [] }) {
      const panel = $('#panel');
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      this.preview = null;

      const H = product ? 1.18 : 0.9;
      entity(panel, { 'canvas-text': { text: '', width: 1.3, height: H, bg: '#ffffff', bg2: '#eef2ff', radius: 0.08, border: '#c7d2fe' } });

      let top = H / 2 - 0.08;
      if (product) {
        let preview;
        if (product.image) {
          preview = entity(panel, { geometry: 'primitive: plane; width: 0.42; height: 0.42', material: `src: url(${product.image}); shader: flat` });
        } else {
          preview = buildProductEntity(panel, product);
          preview.setAttribute('spin', 'speed: 45');
          preview.object3D.scale.setScalar(1.15);
        }
        preview.setAttribute('position', `0 ${top - 0.2} 0.2`);
        this.preview = preview;
        top -= 0.42;
      }

      entity(panel, { position: `0 ${top - 0.04} 0.005`, 'canvas-text': { text: title, width: 1.2, height: 0.12, bg: 'none', bold: true, fontSize: 0.07 } });
      top -= 0.1;

      if (product) {
        const sale = product.oldPrice && product.oldPrice > product.price;
        entity(panel, { position: `${sale ? 0.17 : 0} ${top - 0.05} 0.005`, 'canvas-text': { text: fmt(product.price), width: 0.5, height: 0.1, bg: 'none', bold: true, fontSize: 0.075, color: sale ? '#dc2626' : '#16a34a' } });
        if (sale) entity(panel, { position: `-0.2 ${top - 0.05} 0.005`, 'canvas-text': { text: fmt(product.oldPrice), width: 0.36, height: 0.08, bg: 'none', strike: true, fontSize: 0.05, color: '#6b7280' } });
        top -= 0.1;
      }

      const bodyH = top - 0.04 - (-H / 2 + 0.2);
      entity(panel, { position: `0 ${top - 0.02 - bodyH / 2} 0.005`, 'canvas-text': { text, width: 1.2, height: bodyH, bg: 'none', fontSize: 0.045, valign: 'top', color: '#374151' } });

      // כפתורים בשורה – הראשון מימין (RTL)
      const bw = 0.52, gap = 0.06;
      const total = buttons.length * bw + (buttons.length - 1) * gap;
      buttons.forEach((b, i) => {
        makeButton(panel, { ...b, w: bw, h: 0.13, x: total / 2 - bw / 2 - i * (bw + gap), y: -H / 2 + 0.11 });
      });
      makeButton(panel, { label: '✕', x: -0.57, y: H / 2 - 0.07, w: 0.1, h: 0.1, bg: '#e5e7eb', color: '#111827', onClick: Panel.hide });

      // מיקום מול המשתמש
      const camObj = $('#camera').object3D;
      const pos = new THREE.Vector3(); camObj.getWorldPosition(pos);
      const dir = new THREE.Vector3(); camObj.getWorldDirection(dir);
      dir.y = 0; dir.normalize().negate();
      const target = pos.clone().addScaledVector(dir, 1.3);
      target.y = pos.y - 0.12;
      panel.object3D.position.copy(target);
      panel.object3D.lookAt(pos.x, target.y, pos.z);
      panel.object3D.scale.setScalar(0.85);
      panel.setAttribute('visible', true);
      panel.setAttribute('animation__pop', 'property: scale; from: 0.85 0.85 0.85; to: 1 1 1; dur: 180; easing: easeOutBack');
    },
    hide() {
      const panel = $('#panel');
      panel.setAttribute('visible', false);
      panel.removeAttribute('animation__pop');
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      Panel.preview = null;
    },
  };

  let toastTimer = null;
  function toast(msg, bg = '#16a34a') {
    const el = $('#toast');
    el.setAttribute('canvas-text', { text: msg, width: 0.7, height: 0.11, bg, color: '#fff', bold: true, fontSize: 0.05, radius: 0.055 });
    el.setAttribute('visible', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.setAttribute('visible', false), 1800);
  }

  /* ------------------------------------------------------------------ *
   *  הוספה לסל – עם אנימציה, צליל ורטט                                   *
   * ------------------------------------------------------------------ */
  function cartTarget(out) {
    if (inVR()) return $('#wrist-cart').object3D.getWorldPosition(out);
    const cam = $('#camera').object3D;
    cam.getWorldPosition(out);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    dir.y = 0; dir.normalize().negate();
    return out.addScaledVector(dir, 0.5).add(new THREE.Vector3(0, -0.45, 0));
  }

  function addToCart(p, fromEl) {
    Cart.add(p.id);
    const from = new THREE.Vector3();
    if (fromEl && fromEl.object3D) fromEl.object3D.getWorldPosition(from);
    else $('#camera').object3D.getWorldPosition(from);
    flyToCart(window.StoreModels.build(p), from, cartTarget, (pos) => {
      Sound.add();
      pulse($('#leftHand'), 0.5, 50);
      pulse($('#rightHand'), 0.5, 50);
      if (inVR()) burst(pos, { count: 16, speed: 0.6, life: 900 });
      const c = $('#hud-cart');
      c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    });
    toast(`${p.name} נוסף לסל ✓`);
    Seller.onAdd();
  }

  /* ------------------------------------------------------------------ *
   *  זרימות מסך                                                         *
   * ------------------------------------------------------------------ */
  function openProduct(p) {
    const inCart = Cart.items[p.id] || 0;
    const sale = p.oldPrice && p.oldPrice > p.price;
    const extra = [];
    if (sale) extra.push(`💰 חוסכים ${fmt(p.oldPrice - p.price)}`);
    if (inCart) extra.push(`🛒 כבר בסל: ${inCart}`);
    Panel.show({
      product: p,
      title: p.name,
      text: p.description + (extra.length ? '\n\n' + extra.join('   ') : ''),
      buttons: [
        { label: 'הוסף לסל 🛒', bg: '#16a34a', bg2: '#22c55e', onClick: () => { addToCart(p, Panel.preview); openProduct(p); } },
        { label: 'לקופה 💳', bg: '#4f46e5', bg2: '#6366f1', onClick: openCheckout },
      ],
    });
  }

  function openCheckout() {
    const lines = Cart.lines();
    if (!lines.length) {
      Panel.show({ title: 'הסל ריק', text: 'בחרו מוצר מהמדפים כדי להתחיל 🛍️', buttons: [{ label: 'המשך קנייה', onClick: Panel.hide }] });
      return;
    }
    let text = lines.map((l) => `${l.product.name} × ${l.qty} – ${fmt(l.subtotal)}`).join('\n');
    text += `\nמשלוח: ${Cart.shipping() ? fmt(Cart.shipping()) : 'חינם 🎉'}`;
    if (Cart.savings()) text += `\nחסכתם: ${fmt(Cart.savings())}`;
    text += `\n\nסה״כ לתשלום: ${fmt(Cart.grandTotal())}\nתשלום מאובטח ב-PayPal (המשקף ייצא רגע ממצב VR)`;
    Panel.show({
      title: 'סיכום הזמנה 🧾',
      text,
      buttons: [
        { label: 'לתשלום ב-PayPal', bg: '#0070ba', bg2: '#009cde', onClick: confirmOrder },
        { label: 'המשך קנייה', bg: '#6b7280', onClick: Panel.hide },
      ],
    });
  }

  function confirmOrder() {
    if (!Cart.count()) return;
    const scene = $('a-scene');
    const wasVR = inVR();
    Panel.hide();
    if (wasVR) scene.exitVR(); // חלון PayPal נפתח בדפדפן הרגיל
    Checkout.open(wasVR);
  }

  /* ------------------------------------------------------------------ *
   *  בניית מוצרים                                                       *
   * ------------------------------------------------------------------ */
  function buildProductEntity(parent, p) {
    if (p.model) {
      const s = p.scale || 0.3;
      return entity(parent, { 'gltf-model': p.model, scale: `${s} ${s} ${s}` });
    }
    const el = entity(parent, {}, window.StoreModels.build(p));
    if (p.kind === 'candle') el.setAttribute('flicker', '');
    return el;
  }

  function priceTag(parent, p, x, y, z, w = 0.82) {
    const sale = p.oldPrice && p.oldPrice > p.price;
    const tag = entity(parent, { class: 'clickable', position: `${x} ${y} ${z}`, 'canvas-text': { text: '', width: w, height: 0.27, bg: '#ffffff', border: sale ? '#fca5a5' : '#e2e8f0', radius: 0.05 } });
    entity(tag, { position: '0 0.06 0.002', 'canvas-text': { text: p.name, width: w - 0.04, height: 0.1, bg: 'none', bold: true, fontSize: 0.052, color: '#1f2937' } });
    entity(tag, { position: `${sale ? 0.13 : 0} -0.055 0.002`, 'canvas-text': { text: fmt(p.price), width: 0.4, height: 0.1, bg: 'none', bold: true, fontSize: 0.066, color: sale ? '#dc2626' : '#047857' } });
    if (sale) entity(tag, { position: '-0.2 -0.055 0.002', 'canvas-text': { text: fmt(p.oldPrice), width: 0.3, height: 0.08, bg: 'none', strike: true, fontSize: 0.045, color: '#9ca3af' } });
    tag.addEventListener('click', () => openProduct(p));
    return tag;
  }

  function badgeFor(p) {
    if (p.oldPrice && p.oldPrice > p.price) return { text: `${Math.round((1 - p.price / p.oldPrice) * 100)}% הנחה`, bg: '#dc2626', bg2: '#f43f5e' };
    if (p.badge) return { text: p.badge, bg: '#7c3aed', bg2: '#a855f7' };
    return null;
  }

  function buildProduct(section, p, x) {
    const s = p.scale || 0.3;
    const SHELF_Y = 1.0;

    entity(section, { geometry: 'primitive: cylinder; radius: 0.2; height: 0.04', material: 'color: #ffffff; roughness: 0.2; metalness: 0.1', position: `${x} ${SHELF_Y + 0.045} 0` });
    entity(section, { geometry: 'primitive: torus; radius: 0.2; radiusTubular: 0.006; segmentsTubular: 48', material: 'color: #fff; emissive: #93c5fd; emissiveIntensity: 1', rotation: '90 0 0', position: `${x} ${SHELF_Y + 0.066} 0` });

    const model = buildProductEntity(section, p);
    model.classList.add('clickable', 'product-model');
    model.dataset.pid = p.id;
    model.setAttribute('position', `${x} ${SHELF_Y + 0.1 + s / 2} 0`);
    model.setAttribute('spin', 'speed: 18');
    const base = p.model ? s : 1;
    model.addEventListener('mouseenter', () => {
      if (model.dataset.held) return;
      model.object3D.scale.setScalar(base * 1.2); model.components.spin.boost = 5; Sound.hover();
    });
    model.addEventListener('mouseleave', () => {
      if (model.dataset.held) return;
      model.object3D.scale.setScalar(base); model.components.spin.boost = 1;
    });
    model.addEventListener('click', () => openProduct(p));
    model.addEventListener('product-grabbed', () => {
      toast(`${p.name} · ${fmt(p.price)}  –  לחצו על ההדק לפרטים`, '#4f46e5');
    });

    const badge = badgeFor(p);
    if (badge) {
      entity(section, { position: `${x + 0.17} ${SHELF_Y + 0.15 + s} 0.05`, bob: 'amp: 0.015; speed: 0.8', 'canvas-text': { text: badge.text, width: 0.34, height: 0.085, bg: badge.bg, bg2: badge.bg2, color: '#fff', bold: true, fontSize: 0.045, radius: 0.04 } });
    }

    priceTag(section, p, x, SHELF_Y - 0.19, 0.31);
  }

  /* מדף עליון "מלא סחורה" – קופסאות דקורטיביות */
  function stockBoxes(color) {
    const g = new THREE.Group();
    const base = new THREE.Color(color);
    let x = -1.95;
    let i = 0;
    while (x < 1.9) {
      const w = 0.16 + ((i * 37) % 7) * 0.025;
      const h = 0.2 + ((i * 53) % 5) * 0.035;
      const c = base.clone().offsetHSL(0, -0.1 + ((i * 13) % 5) * 0.04, -0.15 + ((i * 29) % 6) * 0.07);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), new THREE.MeshStandardMaterial({ color: i % 4 === 3 ? '#ffffff' : c, roughness: 0.6 }));
      m.position.set(x + w / 2, h / 2, 0);
      g.add(m);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.03), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      label.position.set(x + w / 2, h * 0.6, 0.111);
      g.add(label);
      x += w + 0.03 + ((i * 17) % 3) * 0.04;
      i++;
    }
    return g;
  }

  function buildSection(root, cat, products, position, rotation) {
    const sec = entity(root, { position, rotation });

    // קיר אחורי, ארון ומדפים
    entity(sec, { geometry: 'primitive: box; width: 4.4; height: 2.8; depth: 0.1', material: 'color: #ffffff; roughness: 0.9', position: '0 1.4 -0.45' });
    entity(sec, { geometry: 'primitive: box; width: 4.4; height: 0.06; depth: 0.1', material: `color: ${cat.color}; emissive: ${cat.color}; emissiveIntensity: 0.4`, position: '0 2.83 -0.43' });
    entity(sec, { geometry: 'primitive: box; width: 4.2; height: 0.96; depth: 0.6', material: 'color: #f1f5f9; roughness: 0.6', position: '0 0.48 0' });
    entity(sec, { geometry: 'primitive: box; width: 4.2; height: 0.08; depth: 0.02', material: `color: ${cat.color}`, position: '0 0.06 0.301' });
    entity(sec, { geometry: 'primitive: box; width: 4.3; height: 0.05; depth: 0.66', material: `color: ${cat.color}; roughness: 0.4`, position: '0 0.985 0' });
    // מדף עליון עם סחורה ותאורת LED
    entity(sec, { geometry: 'primitive: box; width: 4.2; height: 0.04; depth: 0.32', material: 'color: #e2e8f0; roughness: 0.4', position: '0 1.72 -0.25' });
    entity(sec, { geometry: 'primitive: box; width: 4.1; height: 0.012; depth: 0.02', material: 'color: #fff; emissive: #fff7ed; emissiveIntensity: 1.2', position: '0 1.695 -0.1' });
    entity(sec, { position: '0 1.74 -0.27' }, stockBoxes(cat.color));
    // שלט מחלקה
    entity(sec, { position: '0 2.42 -0.39', 'canvas-text': { text: `${cat.icon || ''} ${cat.name}`.trim(), width: 2.0, height: 0.4, bg: cat.color, bg2: cat.color2 || cat.color, color: '#ffffff', bold: true, fontSize: 0.17, radius: 0.2 } });

    const n = products.length;
    const spacing = Math.min(1.0, 4.0 / Math.max(n, 1));
    products.forEach((p, i) => buildProduct(sec, p, ((n - 1) / 2 - i) * spacing)); // מימין לשמאל
  }

  /* מעמד "מוצר החודש" מואר */
  function buildFeatured(root, p) {
    const f = entity(root, { position: '2.85 0 -2.85', rotation: '0 -45 0' });
    entity(f, { geometry: 'primitive: cylinder; radius: 0.5; height: 0.06', material: 'color: #1e1b4b; roughness: 0.3', position: '0 0.03 0' });
    entity(f, { geometry: 'primitive: torus; radius: 0.5; radiusTubular: 0.012; segmentsTubular: 64', material: 'color: #fff; emissive: #a78bfa; emissiveIntensity: 1.6', rotation: '90 0 0', position: '0 0.065 0' });
    entity(f, { geometry: 'primitive: cylinder; radius: 0.32; height: 0.85', material: 'color: #ffffff; roughness: 0.15; metalness: 0.2', position: '0 0.48 0' });
    entity(f, { geometry: 'primitive: torus; radius: 0.33; radiusTubular: 0.015; segmentsTubular: 48', material: 'color: #d4af37; metalness: 1; roughness: 0.2', rotation: '90 0 0', position: '0 0.9 0' });
    entity(f, { geometry: 'primitive: cylinder; radius: 0.36; height: 0.7; openEnded: true', material: 'color: #e0e7ff; transparent: true; opacity: 0.12; side: double; roughness: 0', position: '0 1.26 0' });
    entity(f, { light: 'type: point; color: #fff1d6; intensity: 0.9; distance: 2.6', position: '0 2.0 0.3' });

    const holder = entity(f, { position: '0 1.22 0', bob: 'amp: 0.04; speed: 0.6' });
    const model = buildProductEntity(holder, p);
    model.classList.add('clickable', 'product-model');
    model.object3D.scale.setScalar(1.7);
    model.setAttribute('spin', 'speed: 30');
    model.addEventListener('click', () => openProduct(p));
    model.addEventListener('mouseenter', () => { model.components.spin.boost = 4; Sound.hover(); });
    model.addEventListener('mouseleave', () => { model.components.spin.boost = 1; });

    // נצנצים מסתובבים
    const sparkles = entity(f, { position: '0 1.22 0', spin: 'speed: -40' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      entity(sparkles, { geometry: 'primitive: octahedron; radius: 0.018', material: 'color: #fde68a; emissive: #fbbf24; emissiveIntensity: 2', position: `${Math.cos(a) * 0.5} ${Math.sin(a * 3) * 0.12} ${Math.sin(a) * 0.5}` });
    }

    entity(f, { position: '0 2.05 0', bob: 'amp: 0.02; speed: 0.5', 'canvas-text': { text: '⭐ מוצר החודש ⭐', width: 1.2, height: 0.24, bg: '#4f46e5', bg2: '#db2777', color: '#ffffff', bold: true, fontSize: 0.1, radius: 0.12 } });
    priceTag(f, p, 0, 0.62, 0.34, 0.6);
    const badge = badgeFor(p);
    if (badge) entity(f, { position: '0 1.72 0.42', bob: 'amp: 0.02', 'canvas-text': { text: badge.text, width: 0.32, height: 0.1, bg: badge.bg, bg2: badge.bg2, color: '#fff', bold: true, fontSize: 0.055, radius: 0.05 } });
  }

  /* ------------------------------------------------------------------ *
   *  קופה: לוח סל קניות + דלפק + המוכר                                  *
   * ------------------------------------------------------------------ */
  function buildCheckoutArea(root) {
    // דלפק
    entity(root, { geometry: 'primitive: box; width: 2.6; height: 0.92; depth: 0.55', material: 'color: #1e1b4b; roughness: 0.5', position: '0 0.46 3.85' });
    entity(root, { geometry: 'primitive: box; width: 2.72; height: 0.05; depth: 0.65', material: 'color: #e7d3b5; roughness: 0.5', position: '0 0.945 3.85' });
    entity(root, { geometry: 'primitive: box; width: 2.6; height: 0.02; depth: 0.01', material: 'color: #fff; emissive: #a78bfa; emissiveIntensity: 1.5', position: '0 0.8 3.57' });
    entity(root, { position: '0 0.5 3.57', rotation: '0 180 0', 'canvas-text': { text: '🛍️ קופה', width: 0.9, height: 0.24, bg: 'none', color: '#ffffff', bold: true, fontSize: 0.13 } });

    // לוח הסל על הקיר
    const board = entity(root, { position: '0 0 4.6', rotation: '0 180 0' });
    entity(board, { position: '0 1.9 0', 'canvas-text': { text: '', width: 2.9, height: 1.95, bg: '#1e1b4b', bg2: '#312e81', radius: 0.12, border: '#818cf8' } });
    const rows = entity(board, { position: '0 1.9 0.01' });

    const musicBtn = makeButton(board, { label: '', x: -1.25, y: 2.7, z: 0.02, w: 0.2, h: 0.14, bg: '#4338ca', onClick: () => Sound.toggleMusic() });
    const syncMusic = (on) => musicBtn.setAttribute('canvas-text', 'text', on ? '🔊' : '🔇');
    Sound.onMusicChange(syncMusic); syncMusic(Sound.musicOn);

    const render = () => {
      while (rows.firstChild) rows.removeChild(rows.firstChild);
      const add = (y, cfg, x = 0) => entity(rows, { position: `${x} ${y} 0`, 'canvas-text': cfg });
      add(0.8, { text: `🛒 סל הקניות (${Cart.count()})`, width: 2.0, height: 0.2, bg: 'none', color: '#fff', bold: true, fontSize: 0.1 });

      const lines = Cart.lines();
      if (!lines.length) add(0.25, { text: 'הסל ריק – בחרו מוצר מהמדפים 🛍️', width: 2.6, height: 0.2, bg: 'none', color: '#a5b4fc', fontSize: 0.07 });
      const MAX = 5;
      lines.slice(0, MAX).forEach((l, i) => {
        const y = 0.57 - i * 0.16;
        add(y, { text: `${l.product.name} × ${l.qty}   ${fmt(l.subtotal)}`, width: 2.05, height: 0.13, bg: '#3730a3', color: '#fff', fontSize: 0.058, align: 'right', radius: 0.06 }, 0.27);
        makeButton(rows, { label: 'הסר', x: -1.03, y, z: 0, w: 0.4, h: 0.12, bg: '#dc2626', onClick: () => Cart.remove(l.product.id) });
      });
      if (lines.length > MAX) add(0.57 - MAX * 0.16, { text: `ועוד ${lines.length - MAX} מוצרים…`, width: 2.4, height: 0.1, bg: 'none', color: '#a5b4fc', fontSize: 0.05 });

      // פס התקדמות למשלוח חינם
      const free = Number(CFG.freeShippingOver) || 0;
      if (free) {
        const rem = Cart.toFreeShipping();
        const ratio = Math.min(1, Cart.total() / free);
        add(-0.27, { text: rem ? `עוד ${fmt(rem)} למשלוח חינם 🚚` : '🎉 קיבלתם משלוח חינם!', width: 2.4, height: 0.1, bg: 'none', color: rem ? '#e0e7ff' : '#86efac', bold: true, fontSize: 0.055 });
        entity(rows, { geometry: 'primitive: plane; width: 2.2; height: 0.045', material: 'color: #312e81; shader: flat', position: '0 -0.36 0' });
        if (ratio > 0) entity(rows, { geometry: `primitive: plane; width: ${2.2 * ratio}; height: 0.045`, material: `color: ${rem ? '#facc15' : '#22c55e'}; shader: flat`, position: `${1.1 - 1.1 * ratio} -0.36 0.001` });
      }

      const ship = Cart.shipping();
      add(-0.52, { text: `סה״כ: ${fmt(Cart.grandTotal())}${ship ? ` (כולל משלוח ${fmt(ship)})` : ''}`, width: 2.6, height: 0.14, bg: 'none', color: '#fde68a', bold: true, fontSize: 0.08 });
      if (lines.length) {
        makeButton(rows, { label: 'לתשלום 💳', x: 0.4, y: -0.77, z: 0, w: 0.72, h: 0.16, bg: '#16a34a', bg2: '#22c55e', onClick: openCheckout });
        makeButton(rows, { label: 'רוקן סל', x: -0.4, y: -0.77, z: 0, w: 0.72, h: 0.16, bg: '#6b7280', onClick: () => Cart.clear() });
      }
    };
    Cart.onChange(render);
    render();

    Seller.build(root);
  }

  /* ------------------------------------------------------------------ *
   *  החלל: רצפה, קירות, תאורה, שטיח, צמחים                               *
   * ------------------------------------------------------------------ */
  function canvasTexture(w, h, draw, repeat = 1) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    return t;
  }

  function woodFloor() {
    return canvasTexture(512, 512, (ctx, W, H) => {
      const rows = 8, rh = H / rows;
      for (let r = 0; r < rows; r++) {
        let x = -((r * 97) % 200);
        let i = 0;
        while (x < W) {
          const len = 180 + ((r * 31 + i * 57) % 140);
          const l = 52 + ((r * 7 + i * 13) % 9);
          ctx.fillStyle = `hsl(30, 38%, ${l}%)`;
          ctx.fillRect(x, r * rh, len, rh);
          ctx.strokeStyle = 'rgba(60,35,15,0.10)';
          for (let g = 0; g < 5; g++) {
            ctx.beginPath();
            const gy = r * rh + 6 + g * (rh / 5);
            ctx.moveTo(x, gy); ctx.bezierCurveTo(x + len / 3, gy + 3, x + (2 * len) / 3, gy - 3, x + len, gy);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(50,30,10,0.35)';
          ctx.fillRect(x, r * rh, 2, rh);
          x += len; i++;
        }
        ctx.fillStyle = 'rgba(50,30,10,0.35)';
        ctx.fillRect(0, r * rh, W, 2);
      }
    }, 5);
  }

  function rugTexture() {
    return canvasTexture(1024, 1024, (ctx, W) => {
      const c = W / 2;
      const g = ctx.createRadialGradient(c, c, 50, c, c, c);
      g.addColorStop(0, '#312e81'); g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(c, c, c - 30, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(c, c, c - 60, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.fillStyle = '#d4af37';
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * (c - 45), c + Math.sin(a) * (c - 45), 7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 110px "Segoe UI", Arial, sans-serif';
      ctx.fillText(CFG.name, c, c + 20);
      ctx.font = '120px "Segoe UI", Arial, sans-serif';
      ctx.fillText('🛍️', c, c - 130);
      ctx.fillStyle = '#c7d2fe';
      ctx.font = '400 46px "Segoe UI", Arial, sans-serif';
      ctx.fillText('חוויית קנייה במציאות מדומה', c, c + 130);
    });
  }

  function buildRoom(root) {
    const R = 4.8, WALL_H = 3.6;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), new THREE.MeshStandardMaterial({ map: woodFloor(), roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    entity(root, {}, floor);

    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = Math.PI; // הטקסט קריא למי שנכנס ומביט קדימה
    rug.position.y = 0.005;
    entity(root, {}, rug);

    entity(root, { geometry: `primitive: plane; width: ${R * 2}; height: ${R * 2}`, material: 'color: #fdfcfb; side: double', rotation: '90 0 0', position: `0 ${WALL_H} 0` });
    [[0, -R, 0], [0, R, 180], [-R, 0, 90], [R, 0, -90]].forEach(([x, z, ry]) => {
      const w = entity(root, { position: `${x} 0 ${z}`, rotation: `0 ${ry} 0` });
      entity(w, { geometry: `primitive: plane; width: ${R * 2}; height: ${WALL_H}`, material: 'color: #f6f1ea; roughness: 1', position: `0 ${WALL_H / 2} 0` });
      entity(w, { geometry: `primitive: box; width: ${R * 2}; height: 0.14; depth: 0.03`, material: 'color: #3f2a1d; roughness: 0.6', position: '0 0.07 0.015' });
      entity(w, { geometry: `primitive: box; width: ${R * 2}; height: 0.05; depth: 0.03`, material: 'color: #c7a97c; roughness: 0.5', position: `0 ${WALL_H - 0.12} 0.015` });
    });

    // לוחות תאורה בתקרה
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        entity(root, { geometry: 'primitive: box; width: 0.9; height: 0.03; depth: 0.9', material: 'color: #fff; emissive: #fffaf0; emissiveIntensity: 1', position: `${ix * 2.6} ${WALL_H - 0.02} ${iz * 2.6}` });
      }
    }

    // צמחים בפינות
    [[-4.2, -4.2], [4.2, 4.2], [-4.2, 4.2], [-2.9, -2.9]].forEach(([x, z], i) => {
      entity(root, { position: `${x} 0 ${z}`, rotation: `0 ${i * 70} 0` }, window.StoreModels.plant(1.2 + (i % 2) * 0.4));
    });

    // שלט ברוכים הבאים
    entity(root, { position: '0 3.12 -3.98', 'canvas-text': { text: `✨ ברוכים הבאים ל${CFG.name} ✨`, width: 3.4, height: 0.42, bg: '#1e1b4b', bg2: '#4f46e5', color: '#fff', bold: true, fontSize: 0.16, radius: 0.21 } });
  }

  /* ------------------------------------------------------------------ *
   *  מסך כניסה + שכבת HTML                                               *
   * ------------------------------------------------------------------ */
  function setupDOM(scene) {
    $('#hud-title').textContent = CFG.name;
    $('#intro-title').textContent = CFG.name;
    const hud = () => {
      $('#hud-count').textContent = Cart.count();
      $('#hud-total').textContent = fmt(Cart.grandTotal());
      $('#hud-pay').hidden = Cart.count() === 0;
      const ship = $('#hud-ship');
      const rem = Cart.toFreeShipping();
      ship.textContent = !CFG.freeShippingOver ? '' : Cart.count() && !rem ? '🎉 משלוח חינם' : `🚚 עוד ${fmt(rem || CFG.freeShippingOver)} למשלוח חינם`;
    };
    Cart.onChange(hud); hud();

    const syncMusic = (on) => { $('#hud-music').textContent = on ? '🔊' : '🔇'; $('#hud-music').setAttribute('aria-label', on ? 'השתקת מוזיקה' : 'הפעלת מוזיקה'); };
    Sound.onMusicChange(syncMusic); syncMusic(Sound.musicOn);
    $('#hud-music').addEventListener('click', () => Sound.toggleMusic());

    $('#hud-pay').addEventListener('click', () => confirmOrder());
    $('#co-close').addEventListener('click', () => Checkout.close());
    $('#co-close-done').addEventListener('click', () => Checkout.close());
    $('#co-back-vr').addEventListener('click', () => Checkout.backToVR());

    const enter = (vr) => {
      Sound.unlock();
      Sound.setMusic(Sound.musicOn);
      $('#intro').hidden = true;
      Sound.success();
      if (vr) scene.enterVR();
      setTimeout(() => Seller.say(`ברוכים הבאים ל${CFG.name}! 🛍️ אני ${CFG.sellerName}`, 5000), 600);
    };
    $('#intro-enter').addEventListener('click', () => enter(false));
    $('#intro-vr').addEventListener('click', () => enter(true));
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { $('#intro-vr').hidden = !ok; }).catch(() => {});
    }

    scene.addEventListener('enter-vr', () => {
      $('#hud').style.display = 'none';
      $('#intro').hidden = true;
      Panel.hide();
      $('#checkout').hidden = true;
      Sound.unlock();
      if (Seller.pendingThanks) setTimeout(() => Seller.thank(), 800);
    });
    scene.addEventListener('exit-vr', () => { $('#hud').style.display = ''; });
  }

  AFRAME.registerComponent('store', {
    init() {
      Cart.load();
      const root = $('#store-root');
      buildRoom(root);

      const layout = [
        { position: '0 0 -3.6', rotation: '0 0 0' },     // מקדימה
        { position: '3.6 0 0', rotation: '0 -90 0' },    // מימין
        { position: '-3.6 0 0', rotation: '0 90 0' },    // משמאל
      ];
      window.CATEGORIES.slice(0, layout.length).forEach((cat, i) => {
        const prods = window.PRODUCTS.filter((p) => p.category === cat.id);
        buildSection(root, cat, prods, layout[i].position, layout[i].rotation);
      });
      const featured = window.PRODUCTS.find((p) => p.featured);
      if (featured) buildFeatured(root, featured);
      buildCheckoutArea(root);

      // סל על פרק היד (בתוך VR)
      const wrist = $('#wrist-cart');
      const syncWrist = () => wrist.setAttribute('canvas-text', { text: `🛒 ${Cart.count()} · ${fmt(Cart.grandTotal())}`, width: 0.17, height: 0.055, bg: '#1e1b4b', bg2: '#4f46e5', color: '#fff', bold: true, fontSize: 0.024, radius: 0.027, padding: 0.01 });
      Cart.onChange(syncWrist); syncWrist();

      setupDOM(this.el);
    },
  });

  // חשיפה לבדיקות / הרחבות
  window.VRStore = { Cart, Panel, Checkout, Seller, openProduct, openCheckout, confirmOrder, addToCart };
})();
