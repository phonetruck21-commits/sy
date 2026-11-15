/* חנות VR – סטודיו לעיצוב הבית. בנויה עם A-Frame (WebXR).
 * עובדת במשקפי Meta Quest / Pico / Vision Pro דרך הדפדפן, וגם במחשב ובנייד.
 * תלויה ב: js/products.js (קטלוג), js/env.js (סביבה), js/fx.js (משוב)
 */
(function () {
  'use strict';

  const CFG = window.STORE_CONFIG;
  const { Sound, pulse } = window.StoreFX;
  const { tween, shadowMesh } = window.StoreEnv;
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => `${Number(n).toLocaleString('he-IL')} ${CFG.currency}`;
  const inVR = () => { const s = $('a-scene'); return !!(s && s.is('vr-mode')); };
  const findProduct = (id) => window.PRODUCTS.find((p) => p.id === id);
  const categoryName = (id) => (window.CATEGORIES.find((c) => c.id === id) || {}).name || '';

  /* צבעים וגופנים של ממשק התלת-ממד */
  const UI = {
    paper: '#fbfaf8', ink: '#1d1c1a', muted: '#6e6961', faint: '#a29c93', line: '#e3ded6',
    sale: '#9b2f26', dark: '#1d1c1a', darkText: '#f5f2ed',
  };
  const FONT = '"Heebo", "Segoe UI", Arial, sans-serif';
  const SERIF = '"Heebo", "Segoe UI", Arial, sans-serif'; // גופן כותרות

  /* ------------------------------------------------------------------ *
   *  סל קניות. מפתח פריט: "מוצר" או "מוצר|צבע"                         *
   * ------------------------------------------------------------------ */
  const STORAGE_KEY = 'vrstore-cart-v2';
  const Cart = {
    items: {},
    listeners: [],
    load() {
      try { this.items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { this.items = {}; }
      Object.keys(this.items).forEach((k) => { if (!this.resolve(k)) delete this.items[k]; });
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items)); } catch (e) { /* מצב פרטי */ }
      this.listeners.forEach((fn) => fn());
    },
    key(p, variantId) { return variantId ? `${p.id}|${variantId}` : p.id; },
    resolve(key) {
      const [id, vid] = key.split('|');
      const product = findProduct(id);
      if (!product) return null;
      const variant = vid ? (product.variants || []).find((v) => v.id === vid) : null;
      if (vid && !variant) return null;
      return { product, variant };
    },
    add(p, variantId, qty = 1) { const k = this.key(p, variantId); this.items[k] = Math.min(99, (this.items[k] || 0) + qty); this.save(); },
    setQty(key, qty) { if (qty <= 0) delete this.items[key]; else this.items[key] = Math.min(99, qty); this.save(); },
    clear() { this.items = {}; this.save(); },
    lines() {
      return Object.entries(this.items).map(([key, qty]) => {
        const r = this.resolve(key);
        return { key, qty, product: r.product, variant: r.variant, subtotal: r.product.price * qty };
      });
    },
    count() { return Object.values(this.items).reduce((a, b) => a + b, 0); },
    total() { return this.lines().reduce((a, l) => a + l.subtotal, 0); },
    // אותו חוק כמו בשרת (server.js → shippingFor)
    shipping() {
      const free = Number(CFG.freeShippingOver) || 0, cost = Number(CFG.shippingCost) || 0;
      const t = this.total();
      if (!t || !cost || free === 0 || t >= free) return 0;
      return cost;
    },
    toFreeShipping() { const free = Number(CFG.freeShippingOver) || 0; return free ? Math.max(0, free - this.total()) : 0; },
    grandTotal() { return this.total() + this.shipping(); },
    onChange(fn) { this.listeners.push(fn); },
  };

  /* ------------------------------------------------------------------ *
   *  תשלום עם PayPal (חלון רגיל של הדפדפן – יוצאים לרגע ממצב VR)        *
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
        this.sdk.catch(() => { this.sdk = null; });
      }
      return this.sdk;
    },
    status(msg, kind = '') { const el = $('#co-status'); el.textContent = msg; el.className = kind; },
    open(fromVR) {
      const lines = Cart.lines();
      if (!lines.length) return;
      this.returnToVR = !!fromVR;
      const ul = $('#co-lines');
      ul.innerHTML = '';
      const row = (a, b, sub, cls) => {
        const li = document.createElement('li');
        if (cls) li.className = cls;
        li.innerHTML = '<div><span class="co-name"></span><span class="co-sub"></span></div><span class="co-price"></span>';
        li.querySelector('.co-name').textContent = a;
        li.querySelector('.co-sub').textContent = sub || '';
        li.querySelector('.co-price').textContent = b;
        ul.appendChild(li);
      };
      lines.forEach((l) => row(l.product.name, fmt(l.subtotal), [l.variant && l.variant.label, `כמות ${l.qty}`].filter(Boolean).join(' · ')));
      row('משלוח', Cart.shipping() ? fmt(Cart.shipping()) : 'חינם', '', 'co-ship');
      $('#co-total').innerHTML = '<span>סה״כ לתשלום</span><span></span>';
      $('#co-total').lastChild.textContent = fmt(Cart.grandTotal());
      $('#co-summary').hidden = false;
      $('#co-done').hidden = true;
      $('#paypal-buttons').innerHTML = '';
      $('#checkout').hidden = false;
      this.status('טוען את PayPal…');
      this.loadPayPal().then((paypal) => {
        this.status('');
        return paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay', color: 'black' },
          createOrder: () => api('api/orders', { items: Cart.items }).then((d) => d.id),
          onApprove: (data, actions) => {
            this.status('מאשר את התשלום…');
            return api(`api/orders/${data.orderID}/capture`, {})
              .then((r) => { if (r.status === 'COMPLETED') this.success(r); else this.status('התשלום לא הושלם. נסו שוב.', 'error'); })
              .catch((err) => {
                if (err.issue === 'INSTRUMENT_DECLINED') return actions.restart();
                this.status('גביית התשלום נכשלה ולא חויבתם. נסו שוב.', 'error');
              });
          },
          onCancel: () => this.status('התשלום בוטל. אפשר לנסות שוב.'),
          onError: () => this.status('PayPal לא זמין כרגע. נסו שוב בעוד רגע.', 'error'),
        }).render('#paypal-buttons');
      }).catch(() => {
        this.status('התשלום עדיין לא מחובר בחנות הזו. בעלי החנות צריכים להגדיר את PayPal בשרת.', 'error');
      });
    },
    success(r) {
      const total = Cart.grandTotal();
      Cart.clear();
      $('#co-summary').hidden = true;
      $('#co-done').hidden = false;
      $('#co-order').textContent = r.captureId || r.orderId;
      $('#co-amount').textContent = fmt(r.amount ? r.amount.value : total);
      $('#co-back-vr').hidden = !this.returnToVR;
      this.status('');
      this.lastReceipt = { id: r.captureId || r.orderId, total: r.amount ? r.amount.value : total };
      Sound.success();
    },
    close() { $('#checkout').hidden = true; $('#paypal-buttons').innerHTML = ''; },
    backToVR() { this.close(); $('a-scene').enterVR(); },
  };

  /* ------------------------------------------------------------------ *
   *  טקסט עברי בתלת-ממד (ציור על Canvas, תומך RTL)                       *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('canvas-text', {
    schema: {
      text: { default: '' },
      width: { default: 1 },
      height: { default: 0.25 },
      fontSize: { default: 0.05 },
      weight: { default: 400 },
      family: { default: FONT },
      color: { default: UI.ink },
      bg: { default: 'none' },
      border: { default: '' },
      align: { default: 'right' },
      valign: { default: 'middle' },
      strike: { default: false },
      radius: { default: 0 },
      padding: { default: 0 },
      lineHeight: { default: 1.35 },
      letterSpacing: { default: 0 },
      opacity: { default: 1 },
    },
    init() {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.texture = new THREE.CanvasTexture(this.canvas);
      if ('colorSpace' in this.texture) this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 8;
      // אלפא מוכפל מראש – בלי "הילה" כהה סביב האותיות
      this.texture.premultiplyAlpha = true;
      this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, premultipliedAlpha: true, alphaTest: 0.01, toneMapped: false });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
      this.el.setObject3D('mesh', this.mesh);
    },
    update(old) {
      const d = this.data;
      if (!old || old.width !== d.width || old.height !== d.height) {
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(d.width, d.height);
      }
      this.material.opacity = d.opacity;
      this.draw();
    },
    draw() {
      const d = this.data;
      const ppm = Math.min(1100, 2048 / Math.max(d.width, d.height));
      const W = Math.max(2, Math.round(d.width * ppm));
      const H = Math.max(2, Math.round(d.height * ppm));
      const ctx = this.ctx;
      this.canvas.width = W; this.canvas.height = H;
      ctx.clearRect(0, 0, W, H);

      if (d.bg !== 'none') {
        const bw = d.border ? Math.max(1.5, ppm * 0.0018) : 0;
        const r = Math.min(d.radius * ppm, H / 2, W / 2);
        const x0 = bw / 2, y0 = bw / 2, x1 = W - bw / 2, y1 = H - bw / 2;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r);
        ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r);
        ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r);
        ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r);
        ctx.closePath();
        ctx.fillStyle = d.bg;
        ctx.fill();
        if (bw) { ctx.lineWidth = bw; ctx.strokeStyle = d.border; ctx.stroke(); }
      }
      if (!d.text) { this.texture.needsUpdate = true; return; }

      const fontPx = d.fontSize * ppm;
      const pad = d.padding * ppm;
      ctx.direction = 'rtl';
      ctx.fillStyle = d.color;
      ctx.textBaseline = 'middle';
      ctx.font = `${d.weight} ${fontPx}px ${d.family}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${d.letterSpacing * fontPx}px`;

      const lines = wrap(ctx, String(d.text), W - pad * 2);
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
          ctx.lineWidth = Math.max(1.5, fontPx * 0.07);
          ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + w, y); ctx.stroke();
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

  function wrap(ctx, text, maxW) {
    const lines = [];
    text.split('\n').forEach((para) => {
      let line = '';
      para.split(' ').forEach((w) => {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
      });
      lines.push(line);
    });
    return lines;
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  function measure(text, { size, weight = 400, family = FONT, width = 10 }) {
    measureCtx.font = `${weight} ${size * 1000}px ${family}`;
    measureCtx.direction = 'rtl';
    const lines = wrap(measureCtx, String(text), width * 1000);
    const w = Math.max(...lines.map((l) => measureCtx.measureText(l).width)) / 1000;
    return { lines: lines.length, width: w };
  }

  function entity(parent, attrs = {}, object3D = null) {
    const e = document.createElement('a-entity');
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') v.split(' ').filter(Boolean).forEach((c) => e.classList.add(c));
      else e.setAttribute(k, v);
    });
    if (object3D) e.setObject3D('mesh', object3D);
    parent.appendChild(e);
    return e;
  }

  function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    return m;
  }

  /* כפתור/אזור לחיץ כללי */
  function clickable(el, onClick, { hoverScale = 1.03 } = {}) {
    el.classList.add('clickable');
    el.addEventListener('mouseenter', () => { el.object3D.scale.setScalar(hoverScale); });
    el.addEventListener('mouseleave', () => { el.object3D.scale.setScalar(1); });
    el.addEventListener('click', (e) => { e.stopPropagation(); Sound.click(); onClick(e); });
    return el;
  }

  /* ------------------------------------------------------------------ *
   *  חלונות ותוויות: כל חלון מצויר כתמונה אחת אטומה (חד וקל לעיבוד),    *
   *  ומעליו אזורי לחיצה שקופים לכפתורים                                  *
   * ------------------------------------------------------------------ */
  const redrawers = new Set(); // ציור מחדש כשהגופנים נטענים

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  class Layout {
    constructor(width, { pad = 0.045, bg = UI.paper, border = UI.line, radius = 0.012 } = {}) {
      this.w = width;
      this.pad = pad;
      this.inner = width - pad * 2;
      this.y = -pad - 0.006;
      this.ops = [];
      this.hits = [];
      this.style = { bg, border, radius };
      this.fixedH = 0;
    }
    space(h) { this.y -= h; }
    text(str, o = {}) {
      const size = o.size || 0.026;
      const lh = o.lineHeight || 1.4;
      const width = o.width || this.inner;
      const weight = o.weight || 400;
      const family = o.family || FONT;
      const m = measure(str, { size, weight, family, width });
      const h = m.lines * size * lh;
      const op = { type: 'text', text: String(str), x: o.x || 0, y: this.y, width, size, weight, family, color: o.color || UI.ink, align: o.align || 'right', lh, letterSpacing: o.letterSpacing || 0, strike: !!o.strike };
      this.ops.push(op);
      if (!o.inline) this.y -= h + (o.gap !== undefined ? o.gap : 0.012);
      return { h, op };
    }
    pair(right, left, o = {}) {
      const half = this.inner / 2;
      const a = this.text(right, { ...o, width: half * 1.3, x: half - (half * 1.3) / 2, inline: true });
      const b = this.text(left, { ...o, width: half * 0.7, x: -half + (half * 0.7) / 2, align: 'left', weight: o.leftWeight || o.weight, color: o.leftColor || o.color, inline: true });
      this.y -= Math.max(a.h, b.h) + (o.gap !== undefined ? o.gap : 0.01);
    }
    divider(gap = 0.02) {
      this.y -= gap / 2;
      this.ops.push({ type: 'rect', x: 0, y: this.y, w: this.inner, h: 0.0012, fill: UI.line });
      this.y -= gap / 2;
    }
    hit(x, yCenter, w, h, onClick, round = 0.006) { this.hits.push({ x, y: yCenter, w, h, onClick, round }); }
    button(label, onClick, o = {}) {
      const h = o.h || 0.07;
      const w = o.w || this.inner;
      const x = o.x || 0;
      const primary = o.primary !== false;
      const yc = this.y - h / 2;
      this.ops.push({ type: 'rect', x, y: yc + h / 2, w, h, fill: primary ? UI.dark : UI.paper, stroke: primary ? '' : UI.ink, r: 0.006 });
      this.ops.push({ type: 'text', text: label, x, y: yc + (h * 0.36 * 1.3) / 2, width: w, size: h * 0.36, weight: 500, family: FONT, color: primary ? UI.darkText : UI.ink, align: 'center', lh: 1.3 });
      this.hit(x, yc, w, h, onClick);
      if (!o.inline) this.y -= h + (o.gap !== undefined ? o.gap : 0.012);
    }
    box(label, x, yc, s, onClick) {
      this.ops.push({ type: 'rect', x, y: yc + s / 2, w: s, h: s, fill: UI.paper, stroke: UI.line, r: 0.004 });
      this.ops.push({ type: 'text', text: label, x, y: yc + (s * 0.5 * 1.2) / 2, width: s, size: s * 0.5, weight: 400, family: FONT, color: UI.ink, align: 'center', lh: 1.2 });
      if (onClick) this.hit(x, yc, s, s, onClick);
    }
    stepper(qty, onChange, o = {}) {
      const s = o.h || 0.05;
      const right = this.inner / 2;
      const yc = this.y - s / 2;
      this.box('+', right - s / 2, yc, s, () => onChange(qty + 1));
      this.ops.push({ type: 'text', text: String(qty), x: right - s * 1.5 - 0.004, y: yc + (s * 0.45 * 1.2) / 2, width: s, size: s * 0.45, weight: 500, family: FONT, color: UI.ink, align: 'center', lh: 1.2 });
      this.box('−', right - s * 2.5 - 0.008, yc, s, () => onChange(qty - 1));
      if (o.label) this.ops.push({ type: 'text', text: o.label, x: right - s * 3 - 0.02 - 0.08, y: yc + (0.022 * 1.3) / 2, width: 0.16, size: 0.022, weight: 400, family: FONT, color: UI.muted, align: 'right', lh: 1.3 });
      if (!o.inline) this.y -= s + (o.gap !== undefined ? o.gap : 0.014);
      return yc;
    }
    swatch(x, yc, d, color, selected, onClick) {
      if (selected) this.ops.push({ type: 'circle', x, y: yc, r: d / 2 + 0.006, stroke: UI.ink, width: 0.0018 });
      this.ops.push({ type: 'circle', x, y: yc, r: d / 2, fill: color, stroke: 'rgba(0,0,0,0.15)', width: 0.001 });
      this.hit(x, yc, d + 0.01, d + 0.01, onClick, (d + 0.01) / 2);
    }
    get height() { return this.fixedH || -this.y + this.pad; }

    /* ציור כל הפריטים על Canvas אחד */
    draw(ctx, ppm) {
      const W = this.w, H = this.height;
      const X = (xm) => (xm + W / 2) * ppm;
      const Y = (ym) => -ym * ppm;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const st = this.style;
      if (st.bg) {
        roundRect(ctx, 1, 1, W * ppm - 2, H * ppm - 2, st.radius * ppm);
        ctx.fillStyle = st.bg; ctx.fill();
        if (st.border) { ctx.lineWidth = Math.max(1.5, 0.0015 * ppm); ctx.strokeStyle = st.border; ctx.stroke(); }
      }
      ctx.direction = 'rtl';
      ctx.textBaseline = 'middle';
      this.ops.forEach((op) => {
        if (op.type === 'rect') {
          roundRect(ctx, X(op.x - op.w / 2), Y(op.y), op.w * ppm, op.h * ppm, (op.r || 0) * ppm);
          if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
          if (op.stroke) { ctx.lineWidth = Math.max(1.5, 0.0015 * ppm); ctx.strokeStyle = op.stroke; ctx.stroke(); }
        } else if (op.type === 'circle') {
          ctx.beginPath(); ctx.arc(X(op.x), Y(op.y), op.r * ppm, 0, Math.PI * 2);
          if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
          if (op.stroke) { ctx.lineWidth = Math.max(1, op.width * ppm); ctx.strokeStyle = op.stroke; ctx.stroke(); }
        } else if (op.type === 'text') {
          const px = op.size * ppm;
          ctx.font = `${op.weight} ${px}px ${op.family}`;
          if ('letterSpacing' in ctx) ctx.letterSpacing = `${op.letterSpacing * px}px`;
          ctx.fillStyle = op.color;
          let ax;
          if (op.align === 'right') { ctx.textAlign = 'right'; ax = X(op.x + op.width / 2); }
          else if (op.align === 'left') { ctx.textAlign = 'left'; ax = X(op.x - op.width / 2); }
          else { ctx.textAlign = 'center'; ax = X(op.x); }
          const lines = wrap(ctx, op.text, op.width * ppm);
          let ly = Y(op.y) + (px * op.lh) / 2;
          lines.forEach((ln) => {
            ctx.fillText(ln, ax, ly);
            if (op.strike && ln) {
              const w = ctx.measureText(ln).width;
              const sx = op.align === 'right' ? ax - w : op.align === 'left' ? ax : ax - w / 2;
              ctx.strokeStyle = op.color; ctx.lineWidth = Math.max(1.5, px * 0.07);
              ctx.beginPath(); ctx.moveTo(sx, ly); ctx.lineTo(sx + w, ly); ctx.stroke();
            }
            ly += px * op.lh;
          });
          if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        }
      });
    }

    /* יוצר את החלון בפועל: תמונה אחת + אזורי לחיצה */
    build(parent, { maxPpm = 1600 } = {}) {
      const W = this.w, H = this.height;
      const ppm = Math.min(maxPpm, 4096 / Math.max(W, H));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(W * ppm); canvas.height = Math.round(H * ppm);
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const paint = () => { this.draw(ctx, ppm); tex.needsUpdate = true; };
      paint();
      const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, toneMapped: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      const el = entity(parent, {}, plane);
      redrawers.add(paint);
      el.addEventListener('componentremoved', () => {});
      el.cleanup = () => { redrawers.delete(paint); tex.dispose(); mat.dispose(); plane.geometry.dispose(); };

      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const hoverMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.07, depthWrite: false, toneMapped: false });
      this.hits.forEach((h) => {
        const hit = entity(el, { position: `${h.x} ${H / 2 + h.y} 0.002`, class: 'clickable' }, new THREE.Mesh(new THREE.PlaneGeometry(h.w, h.h), hitMat));
        hit.addEventListener('mouseenter', () => { hit.getObject3D('mesh').material = hoverMat; });
        hit.addEventListener('mouseleave', () => { hit.getObject3D('mesh').material = hitMat; });
        hit.addEventListener('click', (e) => { e.stopPropagation(); Sound.click(); h.onClick(); });
      });
      return el;
    }
  }

  function disposeTree(el) {
    if (!el) return;
    if (el.cleanup) el.cleanup();
    [...el.children].forEach(disposeTree);
  }

  /* ------------------------------------------------------------------ *
   *  חלון צף                                                           *
   * ------------------------------------------------------------------ */
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  function cameraFrame() {
    const cam = $('a-scene').camera;
    cam.getWorldPosition(camPos);
    cam.getWorldDirection(camDir);
    camDir.y = 0;
    if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, -1);
    camDir.normalize();
    const right = new THREE.Vector3(-camDir.z, 0, camDir.x);
    return { pos: camPos.clone(), fwd: camDir.clone(), right };
  }

  /* בתוך המשאית: לא לתת לחלון או למוצר לחדור לקירות ולמדפים */
  function keepInside(v, f) {
    const Tk = window.StoreTruck;
    if (!Tk || !Tk.inInterior(f.pos.x, f.pos.z)) return v;
    v.x = THREE.MathUtils.clamp(v.x, Tk.T.X0 + 0.55, Tk.T.X1 - 0.55);
    v.z = THREE.MathUtils.clamp(v.z, Tk.T.Z0 + 0.5, Tk.T.Z1 - 0.15);
    return v;
  }

  const Panel = {
    kind: null,
    open(kind, build, { width = 0.62, place } = {}) {
      const panel = $('#panel');
      this.clear();
      this.kind = kind;
      const L = new Layout(width);
      build(L);
      const H = L.height;
      // כפתור סגירה בפינה
      L.ops.push({ type: 'text', text: '✕', x: -width / 2 + 0.035, y: -0.035 + (0.022 * 1.2) / 2, width: 0.04, size: 0.022, weight: 400, family: FONT, color: UI.muted, align: 'center', lh: 1.2 });
      L.hit(-width / 2 + 0.035, -0.035, 0.05, 0.05, () => this.close());
      L.build(panel);

      if (place !== false) {
        const f = cameraFrame();
        const target = keepInside(place ? place(f) : f.pos.clone().addScaledVector(f.fwd, 1.0), f);
        target.y = Math.max(0.9, f.pos.y - 0.08);
        panel.object3D.position.copy(target);
        panel.object3D.lookAt(f.pos.x, target.y, f.pos.z);
        // במקום צפוף החלון קרוב יותר – מקטינים אותו כדי שייראה באותו גודל
        this.base = Math.min(1, Math.hypot(target.x - f.pos.x, target.z - f.pos.z) / 0.95);
      }
      panel.object3D.visible = true;
      const base = this.base || 1;
      if (place !== false) { const s = panel.object3D.scale; tween(160, (k) => s.setScalar(base * (0.94 + 0.06 * k))); }
      return H;
    },
    clear() {
      const panel = $('#panel');
      [...panel.children].forEach((c) => { disposeTree(c); panel.removeChild(c); });
    },
    close() {
      $('#panel').object3D.visible = false;
      this.clear();
      this.kind = null;
      Inspect.end();
    },
    refresh() {
      if (this.kind === 'cart') openCart(true);
      else if (this.kind && this.kind.startsWith('product:') && Inspect.current) openProduct(Inspect.current, true);
    },
  };

  /* ------------------------------------------------------------------ *
   *  בחינת מוצר קטן מקרוב: המוצר מתקרב, מסתובב לאט, וחוזר כשסוגרים       *
   * ------------------------------------------------------------------ */
  const Inspect = {
    current: null, // מזהה מוצר שהחלון שלו פתוח
    lifted: null,
    start(entry) {
      this.end(true);
      const el = entry.el;
      if (el.dataset.busy) return;
      const obj = el.object3D;
      const f = cameraFrame();
      el.dataset.busy = 'inspect';
      const state = { el, parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() };
      this.lifted = state;
      $('a-scene').object3D.attach(obj);
      const maxDim = Math.max(entry.size.x, entry.size.y, entry.size.z);
      let k, to;
      if (inVR()) {
        k = THREE.MathUtils.clamp(0.3 / maxDim, 1, 2.2);
        to = keepInside(f.pos.clone().addScaledVector(f.fwd, 0.62).addScaledVector(f.right, -0.24), f);
        to.y = f.pos.y - 0.18 - (entry.size.y * k) / 2;
      } else {
        // במסך: המוצר במרכז האזור הפנוי שליד חלון המוצר
        k = THREE.MathUtils.clamp(0.2 / maxDim, 1, 3);
        const cam = $('a-scene').camera;
        const W = window.innerWidth, H = window.innerHeight;
        const mobile = W < 700;
        const ndc = mobile ? new THREE.Vector3(0, 0.45, 0.5) : new THREE.Vector3(-Math.min(420, W * 0.4) / W, 0.02, 0.5);
        ndc.unproject(cam);
        const dir = ndc.sub(f.pos).normalize();
        to = f.pos.clone().addScaledVector(dir, mobile ? 0.62 : 0.5);
        to.y -= (entry.size.y * k) / 2;
      }
      const from = obj.position.clone();
      const fromS = obj.scale.clone();
      const toS = state.scale.clone().multiplyScalar(k);
      tween(420, (t) => { obj.position.lerpVectors(from, to, t); obj.scale.lerpVectors(fromS, toS, t); });
      state.spin = true;
    },
    end(immediate) {
      const s = this.lifted;
      if (!s) return;
      this.lifted = null;
      s.spin = false;
      const obj = s.el.object3D;
      s.parent.attach(obj);
      const from = obj.position.clone();
      const fromQ = obj.quaternion.clone();
      const fromS = obj.scale.clone();
      tween(immediate ? 1 : 380, (t) => {
        obj.position.lerpVectors(from, s.pos, t);
        obj.quaternion.slerpQuaternions(fromQ, s.quat, t);
        obj.scale.lerpVectors(fromS, s.scale, t);
      }, () => { delete s.el.dataset.busy; });
    },
  };
  AFRAME.registerSystem('inspect-spin', {
    tick(t, dt) { const s = Inspect.lifted; if (s && s.spin) s.el.object3D.rotation.y += dt * 0.0006; },
  });

  /* ------------------------------------------------------------------ *
   *  טעינת דגם מוצר, מידות אמיתיות, צבעים (KHR_materials_variants)      *
   * ------------------------------------------------------------------ */
  const Products = {}; // id -> { el, size, variant, setVariant }
  let loaded = 0;
  const loader = new THREE.GLTFLoader();

  AFRAME.registerComponent('product', {
    schema: { id: { default: '' } },
    init() {
      const p = findProduct(this.data.id);
      this.p = p;
      this.entry = { el: this.el, product: p, size: new THREE.Vector3(0.3, 0.3, 0.3), variant: p.variants ? p.variants[0].id : null };
      this.entry.setVariant = (id) => this.setVariant(id);
      Products[p.id] = this.entry;
      this.el.classList.add('product');
      this.el.dataset.pid = p.id;
      if (p.device) {
        // דגם שנבנה בקוד (טלפון, שעון, אביזרים)
        this.device = window.StoreDevices.build(p);
        this.place(this.device.object);
        return;
      }
      loader.load(p.model, (gltf) => {
        this.parser = gltf.parser;
        const vx = gltf.userData && gltf.userData.gltfExtensions && gltf.userData.gltfExtensions.KHR_materials_variants;
        this.variantNames = vx ? vx.variants.map((v) => v.name) : [];
        this.place(gltf.scene);
      }, undefined, (err) => {
        console.warn('Model failed to load', p.model, err);
        onProductLoaded();
      });
    },
    place(model) {
      const lights = [];
      model.traverse((o) => { if (o.isLight) lights.push(o); });
      lights.forEach((l) => l.parent.remove(l));
      model.scale.setScalar(this.p.scale || 1);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      const holder = new THREE.Group();
      holder.add(model);
      this.el.setObject3D('mesh', holder);
      this.model = model;
      this.entry.size.copy(size);
      if (this.entry.variant) this.setVariant(this.entry.variant);

      // אזור לחיצה בלתי נראה – מהיר יותר מבדיקה מול כל המשולשים של הדגם
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      const hit = entity(this.el, { position: `0 ${size.y / 2} 0`, class: 'clickable' + (this.p.display !== 'floor' ? ' grabbable' : '') },
        mesh(new THREE.BoxGeometry(size.x * 1.05, size.y * 1.05, size.z * 1.05), hitMat));
      hit.addEventListener('mouseenter', () => Hover.show(this.entry));
      hit.addEventListener('mouseleave', () => Hover.hide(this.entry));
      hit.addEventListener('click', () => { Sound.click(); openProduct(this.p.id); });
      this.el.addEventListener('product-grabbed', () => { Hover.hide(this.entry); toast(`${this.p.name} · ${fmt(this.p.price)}`); });

      // צל רך על המשטח
      const floor = this.p.display === 'floor';
      const sh = shadowMesh(size.x * (floor ? 1.15 : 1.6) + 0.04, Math.max(size.z, 0.04) * (floor ? 1.25 : 1.8) + 0.04, floor ? 0.7 : 0.45);
      sh.position.copy(this.el.object3D.position);
      sh.position.y += 0.003;
      sh.rotation.z = -this.el.object3D.rotation.y;
      this.el.object3D.parent.add(sh);

      this.el.emit('product-ready', { size });
      onProductLoaded();
    },
    setVariant(id) {
      this.entry.variant = id;
      if (this.device) {
        const v = (this.p.variants || []).find((x) => x.id === id);
        if (v) this.device.setVariant(v);
        return Promise.resolve();
      }
      if (!this.model || !this.variantNames || !this.variantNames.length) return Promise.resolve();
      const idx = this.variantNames.indexOf(id);
      const jobs = [];
      this.model.traverse((o) => {
        if (!o.isMesh || !o.userData.gltfExtensions) return;
        const ext = o.userData.gltfExtensions.KHR_materials_variants;
        if (!ext) return;
        if (!o.userData.originalMaterial) o.userData.originalMaterial = o.material;
        const m = ext.mappings.find((mp) => mp.variants.includes(idx));
        if (m) jobs.push(this.parser.getDependency('material', m.material).then((mat) => { o.material = mat; this.parser.assignFinalMaterial(o); }));
        else o.material = o.userData.originalMaterial;
      });
      return Promise.all(jobs);
    },
  });

  function onProductLoaded() {
    loaded++;
    const total = window.PRODUCTS.length;
    const el = $('#intro-progress');
    if (el) el.textContent = loaded < total ? `טוען את המוצרים… ${loaded} מתוך ${total}` : 'החנות מוכנה';
    const bar = $('#intro-bar');
    if (bar) bar.style.transform = `scaleX(${loaded / total})`;
    if (loaded >= total) {
      document.body.classList.add('store-ready');
      setTimeout(() => Thumbs.makeAll(), 50);
    }
  }

  /* ------------------------------------------------------------------ *
   *  תווית ריחוף מעל מוצר                                               *
   * ------------------------------------------------------------------ */
  const Hover = {
    owner: null,
    show(entry) {
      if (entry.el.dataset.busy) return;
      this.owner = entry;
      const p = entry.product;
      const el = $('#hover');
      const label = `${p.name}  ·  ${fmt(p.price)}`;
      const size = 0.028;
      const w = measure(label, { size, weight: 500 }).width + 0.07;
      el.setAttribute('canvas-text', { text: label, width: w, height: 0.06, fontSize: size, weight: 500, align: 'center', bg: 'rgba(29,28,26,0.88)', color: UI.darkText, radius: 0.03 });
      const pos = new THREE.Vector3();
      entry.el.object3D.getWorldPosition(pos);
      pos.y += entry.size.y + 0.12;
      el.object3D.position.copy(pos);
      el.object3D.visible = true;
    },
    hide(entry) {
      if (entry && this.owner !== entry) return;
      this.owner = null;
      $('#hover').object3D.visible = false;
    },
  };

  /* ------------------------------------------------------------------ *
   *  הודעה קצרה                                                         *
   * ------------------------------------------------------------------ */
  let toastTimer = null;
  function toast(msg) {
    if (inVR()) {
      const el = $('#toast');
      const w = measure(msg, { size: 0.026, weight: 500 }).width + 0.08;
      el.setAttribute('canvas-text', { text: msg, width: w, height: 0.065, fontSize: 0.026, weight: 500, align: 'center', bg: 'rgba(29,28,26,0.9)', color: UI.darkText, radius: 0.0325 });
      el.object3D.visible = true;
    } else {
      const t = $('#dom-toast');
      t.textContent = msg;
      t.classList.add('show');
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').object3D.visible = false; $('#dom-toast').classList.remove('show'); }, 2200);
  }

  /* ------------------------------------------------------------------ *
   *  חלון מוצר                                                          *
   * ------------------------------------------------------------------ */
  const pick = { qty: 1 };
  function dimsText(size) {
    const cm = (v) => Math.round(v * 100);
    return `רוחב ${cm(size.x)} · גובה ${cm(size.y)} · עומק ${cm(size.z)} ס״מ`;
  }

  function openProduct(id, keepPlace) {
    const entry = Products[id];
    const p = entry.product;
    const small = p.display !== 'floor';
    if (!inVR()) {
      Hover.hide();
      if (!keepPlace && Sheet.id !== id) Inspect.start(entry);
      Sheet.open(id);
      document.body.classList.add('hint-done');
      return;
    }
    if (!keepPlace) pick.qty = 1;
    Hover.hide();
    if (!keepPlace && small) Inspect.start(entry);
    else if (!keepPlace) Inspect.end();
    Inspect.current = id;

    Panel.open(`product:${id}`, (L) => {
      L.text(categoryName(p.category), { size: 0.019, color: UI.muted, weight: 500, letterSpacing: 0.12, gap: 0.006 });
      L.text(p.name, { size: 0.046, family: SERIF, weight: 500, lineHeight: 1.2, gap: 0.01 });
      const sale = p.oldPrice && p.oldPrice > p.price;
      const pr = L.text(fmt(p.price), { size: 0.03, weight: 500, color: sale ? UI.sale : UI.ink, inline: true });
      if (sale) {
        const pw = measure(fmt(p.price), { size: 0.03, weight: 500 }).width;
        L.text(fmt(p.oldPrice), { size: 0.022, color: UI.faint, strike: true, width: 0.2, x: L.inner / 2 - pw - 0.02 - 0.1, inline: true });
        L.text(`חוסכים ${fmt(p.oldPrice - p.price)}`, { size: 0.02, color: UI.sale, width: 0.2, x: -L.inner / 2 + 0.1, align: 'left', inline: true });
      }
      L.y -= pr.h + 0.014;
      L.divider(0.024);
      L.text(p.description, { size: 0.024, color: UI.ink, lineHeight: 1.5, gap: 0.012 });
      L.text(dimsText(entry.size), { size: 0.02, color: UI.muted, gap: 0.004 });
      if (p.details) L.text(p.details.join('  ·  '), { size: 0.02, color: UI.muted, lineHeight: 1.5, gap: 0.01 });

      if (p.variants) {
        L.divider(0.024);
        const v = p.variants.find((x) => x.id === entry.variant) || p.variants[0];
        L.text(`צבע: ${v.label}`, { size: 0.022, weight: 500, gap: 0.014 });
        const d = 0.04, gap = 0.018;
        const yc = L.y - d / 2 - 0.006;
        p.variants.forEach((vr, i) => {
          const x = L.inner / 2 - d / 2 - 0.006 - i * (d + gap);
          L.swatch(x, yc, d, vr.color, vr.id === entry.variant, () => { entry.setVariant(vr.id).then(() => openProduct(id, true)); });
        });
        L.y -= d + 0.028;
      }

      L.divider(0.024);
      L.stepper(pick.qty, (q) => { pick.qty = Math.max(1, Math.min(9, q)); openProduct(id, true); }, { label: 'כמות' });
      L.button(`הוספה לסל  ·  ${fmt(p.price * pick.qty)}`, () => addToCart(entry));
      if (Cart.count()) L.button(`לסל הקניות (${Cart.count()})`, () => openCart(), { primary: false });
    }, {
      width: 0.6,
      place: keepPlace ? false : (f) => (small
        ? f.pos.clone().addScaledVector(f.fwd, 0.92).addScaledVector(f.right, 0.3)
        : (() => {
          const wp = new THREE.Vector3();
          entry.el.object3D.getWorldPosition(wp);
          const dir = wp.sub(f.pos); dir.y = 0;
          const dist = dir.length();
          dir.normalize();
          return f.pos.clone().addScaledVector(dir, Math.min(1.05, Math.max(0.8, dist - 1))).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 0.42);
        })()),
    });
  }

  function addToCart(entry) {
    const p = entry.product;
    Cart.add(p, entry.variant, pick.qty);
    Sound.add();
    pulse($('#rightHand'), 0.45, 45);
    pulse($('#leftHand'), 0.45, 45);
    const v = p.variants && p.variants.find((x) => x.id === entry.variant);
    toast(`נוסף לסל: ${p.name}${v ? ` (${v.label})` : ''}`);
    pick.qty = 1;
    openProduct(p.id, true);
  }

  /* ------------------------------------------------------------------ *
   *  סל הקניות                                                          *
   * ------------------------------------------------------------------ */
  function openCart(keepPlace) {
    if (!inVR()) { CartDrawer.open(); return; }
    Inspect.end();
    Inspect.current = null;
    Hover.hide();
    Panel.open('cart', (L) => {
      L.text('סל הקניות', { size: 0.042, family: SERIF, weight: 500, gap: 0.004 });
      const lines = Cart.lines();
      L.text(lines.length ? `${Cart.count()} פריטים` : 'הסל שלכם ריק כרגע', { size: 0.021, color: UI.muted, gap: 0.01 });
      if (!lines.length) {
        L.divider(0.03);
        L.text('אפשר לבחור מוצר מהתצוגה, להתאים צבע וכמות, ולהוסיף לסל.', { size: 0.024, color: UI.muted, lineHeight: 1.5, gap: 0.02 });
        L.button('המשך בקנייה', () => Panel.close(), { primary: false });
        return;
      }
      lines.slice(0, 5).forEach((l) => {
        L.divider(0.022);
        L.pair(l.product.name, fmt(l.subtotal), { size: 0.025, weight: 500, gap: 0.004 });
        if (l.variant) L.text(`צבע: ${l.variant.label}`, { size: 0.02, color: UI.muted, gap: 0.008 });
        const yc = L.stepper(l.qty, (q) => Cart.setQty(l.key, q), { h: 0.04, inline: true });
        L.ops.push({ type: 'text', text: 'הסרה', x: -L.inner / 2 + 0.05, y: yc + (0.02 * 1.3) / 2, width: 0.1, size: 0.02, weight: 400, family: FONT, color: UI.muted, align: 'left', lh: 1.3 });
        L.hit(-L.inner / 2 + 0.04, yc, 0.08, 0.04, () => Cart.setQty(l.key, 0));
        L.y -= 0.04 + 0.008;
      });
      if (lines.length > 5) L.text(`ועוד ${lines.length - 5} פריטים`, { size: 0.02, color: UI.muted });
      L.divider(0.03);
      L.pair('סכום ביניים', fmt(Cart.total()), { size: 0.023, color: UI.muted, gap: 0.006 });
      L.pair('משלוח', Cart.shipping() ? fmt(Cart.shipping()) : 'חינם', { size: 0.023, color: UI.muted, gap: 0.006 });
      const rem = Cart.toFreeShipping();
      if (CFG.freeShippingOver && rem > 0) L.text(`חסרים ${fmt(rem)} למשלוח חינם`, { size: 0.02, color: UI.muted, gap: 0.006 });
      L.space(0.006);
      L.pair('סה״כ', fmt(Cart.grandTotal()), { size: 0.03, weight: 500, gap: 0.02 });
      L.button('לתשלום מאובטח', confirmOrder);
      L.button('המשך בקנייה', () => Panel.close(), { primary: false });
    }, { width: 0.6, place: keepPlace ? false : undefined });
  }

  function confirmOrder() {
    if (!Cart.count()) return;
    const wasVR = inVR();
    Panel.close();
    if (wasVR) $('a-scene').exitVR();
    Checkout.open(wasVR);
  }

  function showMessage(title, body) {
    Panel.open('message', (L) => {
      L.text(title, { size: 0.04, family: SERIF, weight: 500, gap: 0.012 });
      L.text(body, { size: 0.024, color: UI.muted, lineHeight: 1.5, gap: 0.02 });
      L.button('המשך בקנייה', () => Panel.close());
    }, { width: 0.56 });
  }

  /* ------------------------------------------------------------------ *
   *  תנועה: סטיק שמאלי הולך, סטיק ימני מסובב                             *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('thumbstick-move', {
    schema: { speed: { default: 1.6 }, minX: { default: -15 }, maxX: { default: 15 }, minZ: { default: -12 }, maxZ: { default: 12 }, snap: { default: 30 } },
    init() {
      this.axis = { x: 0, y: 0 };
      this.turnReady = true;
      this.fwd = new THREE.Vector3();
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
      const cam = this.el.sceneEl.camera;
      cam.getWorldDirection(this.fwd);
      this.fwd.y = 0; this.fwd.normalize();
      const right = new THREE.Vector3(-this.fwd.z, 0, this.fwd.x);
      const step = this.data.speed * (dt / 1000);
      const p = this.el.object3D.position;
      p.addScaledVector(this.fwd, -y * step).addScaledVector(right, x * step);
      const d = this.data;
      p.x = THREE.MathUtils.clamp(p.x, d.minX, d.maxX);
      p.z = THREE.MathUtils.clamp(p.z, d.minZ, d.maxZ);
    },
  });

  /* ------------------------------------------------------------------ *
   *  הליכה: גובה רצפה (מדרגות ורצפת המשאית) ומניעת מעבר דרך קירות       *
   * ------------------------------------------------------------------ */
  AFRAME.registerComponent('walker', {
    init() {
      this.cam = new THREE.Vector3();
      this.last = null;
      this.y = 0;
    },
    tick(t, dt) {
      const Tk = window.StoreTruck;
      const camEl = $('#camera');
      if (!camEl) return;
      camEl.object3D.getWorldPosition(this.cam);
      const rig = this.el.object3D;
      if (!this.last) this.last = new THREE.Vector2(this.cam.x, this.cam.z);
      const x = this.cam.x, z = this.cam.z;
      if (!this.flying && !Tk.walkable(x, z)) {
        // ניסיון להחליק לאורך הקיר: ציר אחד בכל פעם
        if (Tk.walkable(x, this.last.y)) rig.position.z += this.last.y - z;
        else if (Tk.walkable(this.last.x, z)) rig.position.x += this.last.x - x;
        else { rig.position.x += this.last.x - x; rig.position.z += this.last.y - z; }
        rig.updateMatrixWorld(true);
        camEl.object3D.getWorldPosition(this.cam);
      }
      this.last.set(this.cam.x, this.cam.z);
      const target = Tk.floorAt(this.cam.x, this.cam.z);
      const k = Math.min(1, dt / 120);
      this.y += (target - this.y) * k;
      if (Math.abs(target - this.y) < 0.002) this.y = target;
      rig.position.y = this.y;
    },
  });

  /* ------------------------------------------------------------------ *
   *  בניית העולם והתצוגה                                                *
   * ------------------------------------------------------------------ */
  function priceCard(parent, p, { w = 0.3 } = {}) {
    const L = new Layout(w, { pad: 0.018, radius: 0.004 });
    const k = w / 0.3;
    L.text(categoryName(p.category), { size: 0.0135 * k, weight: 500, color: UI.muted, letterSpacing: 0.12, gap: 0.004 * k });
    L.text(p.name, { size: 0.024 * k, family: SERIF, weight: 700, lineHeight: 1.2, gap: 0.008 * k });
    const sale = p.oldPrice && p.oldPrice > p.price;
    const pr = L.text(fmt(p.price), { size: 0.02 * k, weight: 500, color: sale ? UI.sale : UI.ink, inline: true });
    if (sale) {
      const pw = measure(fmt(p.price), { size: 0.02 * k, weight: 500 }).width;
      L.text(fmt(p.oldPrice), { size: 0.015 * k, color: UI.faint, strike: true, width: 0.12 * k, x: L.inner / 2 - pw - 0.012 - 0.06 * k, inline: true });
    }
    L.y -= pr.h;
    L.hit(0, -L.height / 2, w, L.height, () => openProduct(p.id), 0);
    return L.build(parent, { maxPpm: 2400 });
  }

  function buildDisplays(root) {
    const Tk = window.StoreTruck;
    const slots = Tk.slots();
    const used = { table: 0, shelf: 0 };
    window.PRODUCTS.forEach((p) => {
      const kind = slots[p.display] ? p.display : 'table';
      const slot = slots[kind][used[kind]++];
      if (!slot) { console.warn('אין מקום תצוגה פנוי עבור', p.id); return; }
      // משטח מואר מתחת לכל מוצר בשולחן – מסמן "אפשר לגעת"
      const lift = kind === 'table' ? 0.014 : 0;
      if (kind === 'table') {
        const pd = Tk.pad(p.device === 'tablet' ? 0.17 : 0.12);
        pd.position.set(slot.x, slot.y, slot.z);
        entity(root, {}, pd);
      }
      if (slot.stand) {
        const st = Tk.phoneStand();
        st.position.set(slot.x, slot.y + lift, slot.z);
        entity(root, {}, st);
      }
      const tilt = slot.stand ? -14 : slot.tilt || 0;
      const el = entity(root, { position: `${slot.x} ${slot.y + lift + (slot.stand ? 0.008 : 0)} ${slot.z}`, rotation: `${tilt} ${slot.ry} 0`, product: `id: ${p.id}` });
      el.addEventListener('product-ready', () => {
        if (kind === 'table') {
          const holder = entity(root, { position: `${slot.x} ${slot.y + 0.06} ${Tk.T.TABLE_Z + 0.36}`, rotation: `0 ${slot.ry} 0` });
          priceCard(entity(holder, { rotation: '-38 0 0' }), p, { w: 0.24 });
        } else {
          const holder = entity(root, { position: `${slot.x} ${slot.y - 0.085} ${Tk.T.Z0 + 0.425}`, rotation: `0 ${slot.ry} 0` });
          priceCard(holder, p, { w: 0.24 });
        }
      });
    });
  }

  /* מסך פרסום על קיר הקצה */
  function buildVideoWall(root) {
    const Tk = window.StoreTruck;
    const hero = window.PRODUCTS[0];
    const x = Tk.T.X0 + 0.1;
    const wall = entity(root, { position: `${x} ${Tk.T.FLOOR + 1.62} 0`, rotation: '0 90 0' });
    entity(wall, {}, mesh(new THREE.BoxGeometry(2.7, 1.55, 0.04), new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.3, metalness: 0.5 })));
    const L = new Layout(2.6, { pad: 0.14, bg: '#0f1012', border: '', radius: 0 });
    L.fixedH = 1.45;
    L.text('חדש בחנות', { size: 0.05, weight: 500, color: '#4c8dff', letterSpacing: 0.2, gap: 0.04 });
    L.text(hero.name, { size: 0.2, weight: 700, color: '#ffffff', lineHeight: 1.05, gap: 0.05 });
    L.text(hero.description, { size: 0.055, color: '#c9ccd2', lineHeight: 1.45, width: 1.5, x: (2.6 - 0.28) / 2 - 0.75, gap: 0.08 });
    L.text(`החל מ-${fmt(hero.price)}`, { size: 0.075, weight: 500, color: '#ffffff', gap: 0.02 });
    L.text('גשו לשולחן התצוגה כדי לנסות אותו', { size: 0.045, color: '#8b9099' });
    // טלפון מצויר בצד המסך
    L.ops.push({ type: 'rect', x: -0.75, y: -0.22, w: 0.42, h: 0.9, fill: '#1c1d21', stroke: '#3a3b40', r: 0.07 });
    L.ops.push({ type: 'rect', x: -0.75, y: -0.24, w: 0.38, h: 0.86, fill: '#2c2453', r: 0.06 });
    L.ops.push({ type: 'circle', x: -0.75, y: -0.5, r: 0.13, fill: '#6b4bb8' });
    L.ops.push({ type: 'text', text: '10:08', x: -0.75, y: -0.32, width: 0.38, size: 0.075, weight: 300, family: FONT, color: '#ffffff', align: 'center', lh: 1.2 });
    const screen = L.build(wall, { maxPpm: 900 });
    screen.object3D.position.z = 0.021;
  }

  /* קופה: מסך הסל על הקיר מאחורי הדלפק */
  function buildCounter(root) {
    const Tk = window.StoreTruck;
    const screen = entity(root, { position: `${Tk.T.X1 - 0.11} ${Tk.T.FLOOR + 1.75} -0.55`, rotation: '0 -90 0' });
    entity(screen, {}, mesh(new THREE.BoxGeometry(1.3, 0.8, 0.03), new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.3, metalness: 0.5 })));
    const face = entity(screen, { position: '0 0 0.017' });
    const render = () => {
      [...face.children].forEach((c) => { disposeTree(c); face.removeChild(c); });
      const L = new Layout(1.24, { pad: 0.06, bg: '#0f1012', border: '', radius: 0 });
      L.fixedH = 0.74;
      L.text('הקופה', { size: 0.07, weight: 700, color: UI.darkText, gap: 0.03 });
      const lines = Cart.lines();
      if (!lines.length) L.text('הסל ריק. בחרו מוצר מהתצוגה כדי להתחיל.', { size: 0.04, color: '#c9ccd2', lineHeight: 1.5 });
      lines.slice(0, 3).forEach((l) => L.pair(`${l.product.name}${l.variant ? ` · ${l.variant.label}` : ''} × ${l.qty}`, fmt(l.subtotal), { size: 0.036, color: '#c9ccd2', gap: 0.014 }));
      if (lines.length > 3) L.text(`ועוד ${lines.length - 3} פריטים`, { size: 0.03, color: '#8b9099' });
      if (lines.length) {
        L.y = -0.74 + 0.06 + 0.08 + 0.03 + 0.065;
        L.pair('סה״כ', fmt(Cart.grandTotal()), { size: 0.045, weight: 500, color: UI.darkText, gap: 0.025 });
        L.button('לצפייה בסל ותשלום', () => openCart(), { primary: false, h: 0.08, w: 0.56, x: L.inner / 2 - 0.28 });
      }
      L.build(face, { maxPpm: 1400 });
    };
    Cart.onChange(render);
    render();
  }

  /* ------------------------------------------------------------------ *
   *  ניווט: מעבר חלק בין אזורים בלחיצה אחת                               *
   * ------------------------------------------------------------------ */
  const Nav = {
    current: 'outside',
    flight: null,
    rig() { return $('#rig'); },
    look() { return $('#camera').components['look-controls']; },
    camWorld() { const v = new THREE.Vector3(); $('#camera').object3D.getWorldPosition(v); return v; },
    view(id) { return window.StoreTruck.VIEWS.find((v) => v.id === id); },

    /* מסלול: מבחוץ לפנים עוברים דרך המדרגות */
    path(from, to) {
      const Tk = window.StoreTruck;
      const pts = [new THREE.Vector2(from.x, from.z)];
      const fromIn = Tk.inInterior(from.x, from.z) || Tk.inSteps(from.x, from.z);
      const toIn = Tk.inInterior(to.x, to.z);
      if (fromIn !== toIn) {
        const sx = THREE.MathUtils.clamp(fromIn ? from.x : to.x, -2.5, 2.5);
        if (!fromIn) { pts.push(new THREE.Vector2(sx, 3.3)); pts.push(new THREE.Vector2(sx, 1.45)); }
        else { pts.push(new THREE.Vector2(sx, 1.45)); pts.push(new THREE.Vector2(sx, 3.3)); }
      } else if (toIn && (from.z < -0.3) !== (to.z < -0.3) && Math.abs(from.x - to.x) > 0.1) {
        // לעבור מצד לצד של השולחן – מסביב לקצה שלו
        const ex = window.StoreTruck.T.TABLE_X1 + 0.45;
        pts.push(new THREE.Vector2(ex, from.z), new THREE.Vector2(ex, to.z));
      }
      pts.push(new THREE.Vector2(to.x, to.z));
      return pts;
    },

    go(id, opts = {}) {
      let v = typeof id === 'string' ? this.view(id) : id;
      if (!v) return Promise.resolve();
      // מסך צר (נייד לאורך): עומדים קצת יותר רחוק מהשולחן כדי לראות יותר מוצרים
      if (window.innerWidth < 700 && v.z > 1 && v.z < 1.6) v = { ...v, z: 1.6, pitch: v.pitch - 0.04 };
      Sheet.close(); CartDrawer.close(); Catalog.close();
      if (Panel.kind) Panel.close();
      if (typeof id === 'string') this.current = id;
      this.markActive();
      if (inVR()) { this.teleport(v); return Promise.resolve(); }
      const rig = this.rig().object3D;
      const cam = $('#camera').object3D;
      const start = this.camWorld();
      // מאפסים תזוזה מקומית של המצלמה (W A S D זז את המצלמה בתוך ה-rig)
      rig.position.x = start.x; rig.position.z = start.z; cam.position.x = 0; cam.position.z = 0;
      const pts = this.path(start, v);
      const segs = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); segs.push(d); total += d; }
      const lc = this.look();
      const y0 = lc.yawObject.rotation.y, p0 = lc.pitchObject.rotation.x;
      const dy = Math.atan2(Math.sin(v.yaw - y0), Math.cos(v.yaw - y0));
      const dur = THREE.MathUtils.clamp(total / (opts.speed || 2.2), 0.5, 6) * 1000;
      const walker = this.rig().components.walker;
      walker.flying = true;
      if (this.flight) this.flight.cancel = true;
      const flight = { cancel: false };
      this.flight = flight;
      return new Promise((resolve) => {
        tween(dur, (k) => {
          if (flight.cancel) return;
          let d = k * total, i = 0;
          while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
          const a = pts[i], b = pts[i + 1], t = segs[i] ? Math.min(1, d / segs[i]) : 1;
          rig.position.x = a.x + (b.x - a.x) * t;
          rig.position.z = a.y + (b.y - a.y) * t;
          // בהליכה ארוכה הכיוון והזווית משתנים בהדרגה, ומתייצבים לקראת הסוף
          const kk = opts.walk ? Math.max(0, (k - 0.55) / 0.45) : k;
          lc.yawObject.rotation.y = y0 + dy * kk;
          lc.pitchObject.rotation.x = p0 + (v.pitch - p0) * kk;
        }, () => {
          walker.flying = false;
          walker.last = null;
          if (this.flight === flight) this.flight = null;
          resolve();
        }, (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
      });
    },

    /* במשקף: קפיצה מיידית (בלי תנועה שגורמת לבחילה) */
    teleport(v) {
      const rig = this.rig().object3D;
      const cam = this.camWorld();
      rig.position.x += v.x - cam.x;
      rig.position.z += v.z - cam.z;
      this.rig().components.walker.last = null;
      pulse($('#rightHand'), 0.4, 40);
    },

    /* לעמוד מול מוצר מסוים */
    toProduct(id) {
      const e = Products[id];
      const wp = new THREE.Vector3();
      e.el.object3D.getWorldPosition(wp);
      const Tk = window.StoreTruck;
      const onShelf = e.product.display === 'shelf';
      const v = onShelf
        ? { x: THREE.MathUtils.clamp(wp.x, -2.6, 1.3), z: -0.48, yaw: 0, pitch: -0.2 }
        : { x: THREE.MathUtils.clamp(wp.x, Tk.T.TABLE_X0 + 0.3, Tk.T.TABLE_X1), z: 1.3, yaw: 0, pitch: -0.55 };
      this.current = onShelf ? 'accessories' : (wp.x < -1.3 ? 'devices' : 'phones');
      return this.go(v).then(() => { this.current = onShelf ? 'accessories' : (wp.x < -1.3 ? 'devices' : 'phones'); this.markActive(); });
    },

    markActive() {
      document.querySelectorAll('#zones [data-view]').forEach((b) => b.setAttribute('aria-current', b.dataset.view === this.current ? 'true' : 'false'));
    },
  };

  /* נקודות קפיצה על הרצפה (נראות רק במשקף) */
  function buildTeleports(root) {
    const Tk = window.StoreTruck;
    const group = entity(root, { id: 'teleports', visible: 'false' });
    Tk.VIEWS.forEach((v) => {
      const y = Tk.floorAt(v.x, v.z) + 0.012;
      const ring = new THREE.Group();
      ring.add(mesh(new THREE.RingGeometry(0.22, 0.26, 48), new THREE.MeshBasicMaterial({ color: '#4c8dff', toneMapped: false, transparent: true, opacity: 0.9 }), [0, 0, 0], [-Math.PI / 2, 0, 0]));
      ring.add(mesh(new THREE.CircleGeometry(0.22, 48), new THREE.MeshBasicMaterial({ color: '#4c8dff', transparent: true, opacity: 0.18, depthWrite: false }), [0, 0, 0], [-Math.PI / 2, 0, 0]));
      const el = entity(group, { position: `${v.x} ${y} ${v.z}`, class: 'clickable teleport' }, ring);
      el.addEventListener('click', () => Nav.go(v.id));
      el.addEventListener('mouseenter', () => el.object3D.scale.setScalar(1.15));
      el.addEventListener('mouseleave', () => el.object3D.scale.setScalar(1));
      const label = entity(group, { position: `${v.x} ${y + 0.35} ${v.z}`, 'face-camera': '' });
      label.setAttribute('canvas-text', { text: v.label, width: 0.5, height: 0.09, fontSize: 0.045, weight: 500, align: 'center', bg: 'rgba(29,28,26,0.85)', color: UI.darkText, radius: 0.045 });
    });
  }

  /* ------------------------------------------------------------------ *
   *  תמונות מוצר (נוצרות מהדגם עצמו) – לקטלוג, לחלון המוצר ולסל          *
   * ------------------------------------------------------------------ */
  const Thumbs = {
    renderer: null,
    make(entry) {
      try {
        if (!this.renderer) {
          const c = document.createElement('canvas'); c.width = c.height = 360;
          this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
          this.renderer.setSize(360, 360, false);
          this.renderer.outputColorSpace = THREE.SRGBColorSpace;
          this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
          this.scene = new THREE.Scene();
          this.scene.environment = window.StoreEnv.studioEnvironment(this.renderer);
          this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a8580', 1.2));
          const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 3, 4); this.scene.add(d);
          this.cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
        }
        const src = entry.el.getObject3D('mesh');
        if (!src) return null;
        const obj = src.clone(true);
        obj.rotation.set(-0.12, -0.42, 0);
        if (entry.product.device === 'case') obj.rotation.y = 0.42;
        this.scene.add(obj);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const c = box.getCenter(new THREE.Vector3());
        const r = box.getSize(new THREE.Vector3()).length() / 2;
        const dist = r / Math.sin(THREE.MathUtils.degToRad(28 / 2)) * 1.02;
        this.cam.position.set(c.x, c.y + dist * 0.12, c.z + dist);
        this.cam.lookAt(c);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.render(this.scene, this.cam);
        const url = this.renderer.domElement.toDataURL('image/png');
        this.scene.remove(obj);
        return url;
      } catch (e) { console.warn('thumbnail failed', e); return null; }
    },
    makeAll() {
      Object.values(Products).forEach((e) => { e.thumb = this.make(e); });
      Catalog.render();
    },
  };

  function thumbImg(entry, cls = '') {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    if (entry && entry.thumb) img.src = entry.thumb;
    return img;
  }
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /* ------------------------------------------------------------------ *
   *  חלון מוצר במסך (מחשב ונייד): כמו בחנות אונליין                     *
   * ------------------------------------------------------------------ */
  const Sheet = {
    id: null,
    open(id) {
      const entry = Products[id];
      const p = entry.product;
      if (this.id !== id) pick.qty = 1;
      this.id = id;
      Inspect.current = id;
      const el = $('#sheet');
      el.innerHTML = '';
      const x = h('button', 'drawer-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'סגירה');
      x.addEventListener('click', () => this.close());
      el.append(x);
      el.append(h('p', 'eyebrow', categoryName(p.category)));
      const title = h('h2', '', p.name); title.id = 'sheet-name'; el.append(title);
      const price = h('p', 'sheet-price');
      const sale = p.oldPrice && p.oldPrice > p.price;
      price.append(h('span', sale ? 'now sale' : 'now', fmt(p.price)));
      if (sale) { price.append(h('s', 'was', fmt(p.oldPrice))); price.append(h('span', 'save', `חוסכים ${fmt(p.oldPrice - p.price)}`)); }
      el.append(price);
      el.append(h('p', 'sheet-desc', p.description));

      if (p.variants) {
        const v = p.variants.find((x2) => x2.id === entry.variant) || p.variants[0];
        const box = h('fieldset', 'sheet-colors');
        const lg = h('legend', '', 'צבע: '); lg.append(h('b', '', v.label)); box.append(lg);
        const row = h('div', 'swatches');
        p.variants.forEach((vr) => {
          const b = h('button', 'swatch'); b.type = 'button';
          b.style.setProperty('--c', vr.color);
          b.setAttribute('aria-label', vr.label);
          b.setAttribute('aria-pressed', vr.id === entry.variant ? 'true' : 'false');
          b.title = vr.label;
          b.addEventListener('click', () => { Sound.click(); entry.setVariant(vr.id).then(() => this.open(id)); });
          row.append(b);
        });
        box.append(row);
        el.append(box);
      }

      const buy = h('div', 'sheet-buy');
      const step = h('div', 'stepper');
      const minus = h('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'פחות');
      const out = h('output', '', String(pick.qty));
      const plus = h('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'יותר');
      plus.addEventListener('click', () => { pick.qty = Math.min(9, pick.qty + 1); this.open(id); });
      minus.addEventListener('click', () => { pick.qty = Math.max(1, pick.qty - 1); this.open(id); });
      step.append(plus, out, minus);
      const add = h('button', 'btn-buy', `הוספה לסל · ${fmt(p.price * pick.qty)}`); add.type = 'button';
      add.addEventListener('click', () => addToCart(entry));
      buy.append(step, add);
      el.append(buy);
      if (Cart.count()) {
        const go = h('button', 'link', `לסל הקניות (${Cart.count()}) ←`); go.type = 'button';
        go.addEventListener('click', () => CartDrawer.open());
        el.append(go);
      }

      const specs = h('ul', 'sheet-specs');
      specs.append(h('li', '', dimsText(entry.size)));
      (p.details || []).forEach((d) => specs.append(h('li', '', d)));
      el.append(specs);
      el.append(h('p', 'sheet-hint', 'גררו את המוצר כדי לסובב אותו'));
      el.hidden = false;
      document.body.classList.add('sheet-open');
      setLook(false);
    },
    close() {
      if (!this.id) return;
      this.id = null;
      $('#sheet').hidden = true;
      document.body.classList.remove('sheet-open');
      Inspect.end();
      Inspect.current = null;
      setLook(true);
    },
    refresh() { if (this.id) this.open(this.id); },
  };

  /* בזמן בחינת מוצר: גרירה מסובבת את המוצר במקום את המבט */
  function setLook(on) {
    const lc = $('#camera').components['look-controls'];
    if (lc) lc.data.enabled = on;
  }
  function setupDragRotate(canvas) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { if (Sheet.id && Inspect.lifted) drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!drag || !Inspect.lifted) return;
      const o = Inspect.lifted.el.object3D;
      Inspect.lifted.spin = false;
      o.rotation.y += (e.clientX - drag.x) * 0.012;
      o.rotation.x = THREE.MathUtils.clamp(o.rotation.x + (e.clientY - drag.y) * 0.008, -0.9, 0.9);
      drag = { x: e.clientX, y: e.clientY };
    });
  }

  /* ------------------------------------------------------------------ *
   *  סל קניות במסך                                                      *
   * ------------------------------------------------------------------ */
  const CartDrawer = {
    isOpen: false,
    open() {
      Sheet.close(); Catalog.close();
      this.isOpen = true;
      this.render();
      $('#cart-drawer').hidden = false;
    },
    close() { this.isOpen = false; $('#cart-drawer').hidden = true; },
    render() {
      if (!this.isOpen) return;
      const el = $('#cart-drawer');
      el.innerHTML = '';
      const x = h('button', 'drawer-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'סגירה');
      x.addEventListener('click', () => this.close());
      el.append(x, h('h2', '', 'סל הקניות'));
      const lines = Cart.lines();
      if (!lines.length) {
        el.append(h('p', 'empty', 'הסל ריק. בחרו מוצר מהתצוגה או מהקטלוג.'));
        const b = h('button', 'btn-buy', 'לכל המוצרים'); b.type = 'button';
        b.addEventListener('click', () => Catalog.open());
        el.append(b);
        return;
      }
      const ul = h('ul', 'cart-lines');
      lines.forEach((l) => {
        const li = h('li');
        li.append(thumbImg(Products[l.product.id], 'thumb'));
        const info = h('div', 'info');
        info.append(h('p', 'name', l.product.name));
        if (l.variant) info.append(h('p', 'sub', l.variant.label));
        const row = h('div', 'row');
        const st = h('div', 'stepper small');
        const plus = h('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'יותר');
        const minus = h('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'פחות');
        plus.addEventListener('click', () => Cart.setQty(l.key, l.qty + 1));
        minus.addEventListener('click', () => Cart.setQty(l.key, l.qty - 1));
        st.append(plus, h('output', '', String(l.qty)), minus);
        const rm = h('button', 'link', 'הסרה'); rm.type = 'button';
        rm.addEventListener('click', () => Cart.setQty(l.key, 0));
        row.append(st, rm);
        info.append(row);
        li.append(info, h('span', 'price', fmt(l.subtotal)));
        ul.append(li);
      });
      el.append(ul);
      const sum = h('dl', 'totals');
      const add = (a, b, cls) => { const d = h('div', cls); d.append(h('dt', '', a), h('dd', '', b)); sum.append(d); };
      add('סכום ביניים', fmt(Cart.total()));
      add('משלוח', Cart.shipping() ? fmt(Cart.shipping()) : 'חינם');
      add('סה״כ', fmt(Cart.grandTotal()), 'grand');
      el.append(sum);
      const rem = Cart.toFreeShipping();
      if (CFG.freeShippingOver) {
        const ship = h('div', 'ship');
        ship.append(h('p', '', rem ? `עוד ${fmt(rem)} ומקבלים משלוח חינם` : 'מגיע לכם משלוח חינם'));
        const bar = h('div', 'bar'); const fill = h('i');
        fill.style.width = `${Math.min(100, (Cart.total() / CFG.freeShippingOver) * 100)}%`;
        bar.append(fill); ship.append(bar);
        el.append(ship);
      }
      const pay = h('button', 'btn-buy', 'לתשלום מאובטח'); pay.type = 'button';
      pay.addEventListener('click', () => { this.close(); confirmOrder(); });
      const more = h('button', 'link', 'המשך בקנייה'); more.type = 'button';
      more.addEventListener('click', () => this.close());
      el.append(pay, more);
    },
  };

  /* ------------------------------------------------------------------ *
   *  קטלוג: כל המוצרים עם תמונות                                        *
   * ------------------------------------------------------------------ */
  const Catalog = {
    open() { Sheet.close(); CartDrawer.close(); this.render(); $('#catalog').hidden = false; $('#catalog .drawer-x').focus(); },
    close() { $('#catalog').hidden = true; },
    render() {
      const grid = $('#catalog-grid');
      if (!grid) return;
      grid.innerHTML = '';
      window.CATEGORIES.forEach((cat) => {
        const items = window.PRODUCTS.filter((p) => p.category === cat.id);
        if (!items.length) return;
        items.forEach((p) => {
          const card = h('button', 'card'); card.type = 'button';
          const pic = h('div', 'pic'); pic.append(thumbImg(Products[p.id]));
          card.append(pic, h('span', 'cat', cat.name), h('span', 'name', p.name));
          const price = h('span', 'price');
          const sale = p.oldPrice && p.oldPrice > p.price;
          price.append(h('b', sale ? 'sale' : '', fmt(p.price)));
          if (sale) price.append(h('s', '', fmt(p.oldPrice)));
          card.append(price);
          if (p.variants) {
            const dots = h('span', 'dots');
            p.variants.forEach((v) => { const d = h('i'); d.style.background = v.color; dots.append(d); });
            card.append(dots);
          }
          card.addEventListener('click', () => { this.close(); Nav.toProduct(p.id).then(() => openProduct(p.id)); });
          grid.append(card);
        });
      });
    },
  };

  /* ------------------------------------------------------------------ *
   *  ממשק HTML: מסך פתיחה, סרגל עליון, תשלום                            *
   * ------------------------------------------------------------------ */
  function setupDOM(scene) {
    document.title = `${CFG.name} · ${CFG.tagline}`;
    document.querySelectorAll('.brand-name').forEach((e) => { e.textContent = CFG.name; });
    document.querySelectorAll('.brand-tagline').forEach((e) => { e.textContent = CFG.tagline; });

    const hud = () => {
      const n = Cart.count();
      $('#hud-cart-count').textContent = n;
      $('#hud-cart-count').hidden = n === 0;
      $('#hud-cart-total').textContent = n ? fmt(Cart.grandTotal()) : '';
    };
    Cart.onChange(hud); hud();
    Cart.onChange(() => { Panel.refresh(); Sheet.refresh(); CartDrawer.render(); });

    $('#hud-cart').addEventListener('click', () => openCart());
    $('#co-close').addEventListener('click', () => Checkout.close());
    $('#co-close-done').addEventListener('click', () => Checkout.close());
    $('#co-back-vr').addEventListener('click', () => Checkout.backToVR());

    // סרגל האזורים
    const zones = $('#zones-list');
    window.StoreTruck.VIEWS.forEach((v) => {
      const b = h('button', '', v.label); b.type = 'button'; b.dataset.view = v.id;
      b.addEventListener('click', () => { Sound.click(); Nav.go(v.id); });
      zones.append(b);
    });
    Nav.markActive();
    $('#zones-catalog').addEventListener('click', () => Catalog.open());
    $('#catalog .drawer-x').addEventListener('click', () => Catalog.close());
    $('#catalog').addEventListener('click', (e) => { if (e.target.id === 'catalog') Catalog.close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#catalog').hidden) Catalog.close();
      else if (CartDrawer.isOpen) CartDrawer.close();
      else Sheet.close();
    });
    setupDragRotate(scene.canvas || scene);

    const enter = (vr) => {
      Sound.unlock();
      $('#intro').hidden = true;
      document.body.classList.add('in-store');
      if (vr) { scene.enterVR(); return; }
      // נכנסים לחנות: הליכה אוטומטית מהרחבה, במעלה המדרגות, אל שולחן הטלפונים
      setTimeout(() => Nav.go('phones', { walk: true, speed: 1.9 }), 350);
    };
    $('#intro-enter').addEventListener('click', () => enter(false));
    $('#intro-vr').addEventListener('click', () => enter(true));
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { $('#intro-vr').hidden = !ok; $('#hud-vr').hidden = !ok; }).catch(() => {});
    }
    $('#hud-vr').addEventListener('click', () => scene.enterVR());

    scene.addEventListener('exit-vr', () => { $('#teleports').object3D.visible = false; });
    scene.addEventListener('enter-vr', () => {
      $('#teleports').object3D.visible = true;
      Sheet.close(); CartDrawer.close(); Catalog.close();
      $('#intro').hidden = true;
      $('#checkout').hidden = true;
      Panel.close();
      if (Checkout.lastReceipt) {
        const r = Checkout.lastReceipt;
        Checkout.lastReceipt = null;
        setTimeout(() => showMessage('תודה, ההזמנה התקבלה', `מספר אישור ${r.id}\nסכום ${fmt(r.total)}\nאישור נשלח אליכם במייל מ-PayPal.`), 600);
      }
    });
  }

  AFRAME.registerComponent('store', {
    init() {
      Cart.load();
      const root = $('#store-root');
      entity(root, {}, window.StoreTruck.build(CFG));
      buildDisplays(root);
      buildVideoWall(root);
      buildCounter(root);
      buildTeleports(root);

      // סל על פרק היד (במשקף)
      const wrist = $('#wrist-cart');
      const syncWrist = () => wrist.setAttribute('canvas-text', { text: `סל · ${Cart.count()}`, width: 0.12, height: 0.042, fontSize: 0.018, weight: 500, align: 'center', bg: UI.dark, color: UI.darkText, radius: 0.021 });
      Cart.onChange(syncWrist); syncWrist();
      clickable(wrist, () => openCart(), { hoverScale: 1.1 });

      setupDOM(this.el);

      // לצייר מחדש את כל הטקסטים כשהגופנים נטענו
      if (document.fonts && document.fonts.load) {
        Promise.all([document.fonts.load(`500 40px "Heebo"`), document.fonts.load(`400 40px "Heebo"`), document.fonts.load(`700 40px "Heebo"`), document.fonts.load(`300 40px "Heebo"`)])
          .catch(() => {})
          .then(() => {
            document.querySelectorAll('[canvas-text]').forEach((el) => el.components['canvas-text'] && el.components['canvas-text'].draw());
            redrawers.forEach((fn) => fn());
            window.StoreTruck.redraw();
            window.StoreDevices.redraw();
          });
      }
    },
  });

  window.VRStore = { Cart, Panel, Checkout, Products, openProduct, openCart, confirmOrder, Inspect, addToCart, Nav, Sheet, CartDrawer, Catalog };
})();
