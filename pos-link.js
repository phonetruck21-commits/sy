/* חיבור בין הקופה (pos/) לחנות ה-VR.
 *
 *  - הקופה שומרת את הנתונים שלה בשרת (data/pos-db.json), כך שמחשב, טלפון וכמה קופות רואים אותם נתונים.
 *  - חנות ה-VR לוקחת מהקופה מחיר, מבצע אחוזים ומלאי של כל מוצר שמקושר אליה (שדה "מוצר בחנות VR").
 *  - הזמנה ששולמה ב-VR (PayPal) נכנסת לקופה כמכירה, והמלאי יורד.
 *  - "שמירה ותשלום בקופה": הלקוח מקבל קוד, והקופאי טוען את ההזמנה לקופה.
 *
 * אבטחה: כל הנתיבים של הקופה דורשים את הסיסמה POS_KEY (משתנה סביבה בשרת).
 * בלי POS_KEY הקופה עובדת מול השרת רק מהמחשב שהשרת רץ עליו (localhost).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file); // atomic replace
}

function createPosLink({ dataDir, products }) {
  const DB_FILE = path.join(dataDir, 'pos-db.json');
  const ORDERS_FILE = path.join(dataDir, 'vr-orders.json');
  const store = readJSON(DB_FILE, { rev: 0, db: null });
  let orders = readJSON(ORDERS_FILE, []);
  const pendingPayPal = new Map(); // PayPal order id → lines (until capture)

  const saveStore = () => writeJSON(DB_FILE, store);
  const saveOrders = () => writeJSON(ORDERS_FILE, orders);

  /* ---------- live price / stock for a VR product ---------- */
  function promoActive(p) {
    if (!p || !p.active) return false;
    const d = dayKey();
    return (!p.from || d >= p.from) && (!p.to || d <= p.to);
  }
  function live(vrId) {
    const db = store.db;
    if (!db || !Array.isArray(db.products)) return null;
    const p = db.products.find((x) => x.vrId === vrId);
    if (!p) return null;
    const s = db.settings || {};
    const vat = Number(s.vat) || 0;
    const gross = s.pricesIncludeVat === false ? r2(p.price * (1 + vat / 100)) : r2(p.price);
    // best active percent-off promotion that covers this product
    let pct = 0;
    for (const pr of db.promotions || []) {
      if (pr.type !== 'pct' || !promoActive(pr)) continue;
      const hit = pr.scope === 'all' || (pr.scope === 'category' && pr.category === p.category)
        || (pr.scope === 'products' && (pr.productIds || []).includes(p.id));
      if (hit) pct = Math.max(pct, Number(pr.pct) || 0);
    }
    const price = pct ? r2(gross * (1 - pct / 100)) : gross;
    return { price, oldPrice: pct ? gross : null, stock: Number(p.stock) || 0, posId: p.id };
  }

  /* ---------- auth ---------- */
  function isLocal(req) {
    const ip = req.socket.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
  function authorized(req) {
    const key = process.env.POS_KEY || '';
    if (!key) return isLocal(req);
    const got = Buffer.from(String(req.get('x-pos-key') || ''));
    const want = Buffer.from(key);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  function auth(req, res, next) {
    if (authorized(req)) return next();
    res.status(401).json({ error: process.env.POS_KEY ? 'סיסמת קופה שגויה' : 'הגדירו POS_KEY בשרת כדי להתחבר מרחוק' });
  }

  /* ---------- merge two copies of the register data ---------- */
  function merge(server, incoming) {
    if (!server) return incoming;
    const out = { ...incoming };
    const sales = new Map((server.sales || []).map((s) => [s.id, s]));
    for (const s of incoming.sales || []) sales.set(s.id, { ...(sales.get(s.id) || {}), ...s });
    out.sales = [...sales.values()].sort((a, b) => a.ts - b.ts);
    const zs = new Map((server.zReports || []).map((z) => [z.number, z]));
    for (const z of incoming.zReports || []) zs.set(z.number, z);
    out.zReports = [...zs.values()].sort((a, b) => a.number - b.number);
    const maxNo = out.sales.reduce((m, s) => Math.max(m, Number(s.number) || 0), 0);
    out.settings = {
      ...(incoming.settings || {}),
      nextReceipt: Math.max(Number(server.settings?.nextReceipt) || 1, Number(incoming.settings?.nextReceipt) || 1, maxNo + 1),
      nextZ: Math.max(Number(server.settings?.nextZ) || 1, Number(incoming.settings?.nextZ) || 1),
    };
    return out;
  }

  /* ---------- VR orders ---------- */
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode() {
    let c;
    do { c = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); }
    while (orders.some((o) => o.code === c && o.status === 'open'));
    return c;
  }
  function orderLines(lines) {
    return lines.map((l) => ({
      vrId: l.product.id, name: l.product.name, variant: l.variant ? l.variant.label : '',
      qty: l.qty, price: l.unit,
    }));
  }
  function addOrder(o) {
    orders.push({ id: crypto.randomUUID(), time: new Date().toISOString(), status: 'open', ...o });
    orders = orders.filter((x) => x.status === 'open' || Date.now() - Date.parse(x.time) < 30 * 864e5); // keep 30 days
    saveOrders();
  }

  /* ---------- routes ---------- */
  const router = express.Router();
  const bigJson = express.json({ limit: '15mb' });

  router.get('/api/pos/ping', (req, res) => {
    res.json({
      server: true, keyRequired: !!process.env.POS_KEY, authorized: authorized(req), rev: store.rev,
      vrProducts: products.map((p) => ({ id: p.id, name: p.name })),
    });
  });

  router.get('/api/pos/db', auth, (req, res) => {
    if (req.query.rev !== undefined && Number(req.query.rev) === store.rev) return res.status(204).end();
    res.json(store);
  });

  router.put('/api/pos/db', auth, bigJson, (req, res) => {
    const db = req.body && req.body.db;
    if (!db || typeof db !== 'object' || !Array.isArray(db.products) || !Array.isArray(db.sales)) {
      return res.status(400).json({ error: 'נתוני קופה לא תקינים' });
    }
    store.db = merge(store.db, db);
    store.rev += 1;
    saveStore();
    res.json(store);
  });

  router.get('/api/pos/vr-orders', auth, (req, res) => {
    res.json(orders.filter((o) => o.status === 'open'));
  });

  router.post('/api/pos/vr-orders/:id/ack', auth, express.json(), (req, res) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
    o.status = req.body && req.body.status === 'cancelled' ? 'cancelled' : 'done';
    o.receipt = req.body && req.body.receipt;
    o.closedAt = new Date().toISOString();
    saveOrders();
    res.json(o);
  });

  // live prices and stock for the 3D store, as a script that runs right after js/products.js
  router.get('/api/catalog.js', (req, res) => {
    const map = {};
    for (const p of products) { const l = live(p.id); if (l) map[p.id] = { price: l.price, oldPrice: l.oldPrice, stock: l.stock }; }
    res.type('application/javascript').set('Cache-Control', 'no-store').send(
      `/* מחירים ומלאי מהקופה */(function(L){if(!window.PRODUCTS)return;window.LIVE_CATALOG=L;`
      + `window.PRODUCTS.forEach(function(p){var x=L[p.id];if(!x)return;p.price=x.price;`
      + `if(x.oldPrice)p.oldPrice=x.oldPrice;else delete p.oldPrice;p.stock=x.stock;});})(${JSON.stringify(map)});`,
    );
  });

  return {
    router,
    live,
    /** "reserve and pay at the register" from the VR store */
    reserve(order) {
      if (orders.filter((o) => o.status === 'open' && o.type === 'reserve').length >= 200) {
        throw Object.assign(new Error('יותר מדי הזמנות פתוחות. נסו שוב מאוחר יותר.'), { status: 429 });
      }
      const code = newCode();
      addOrder({ type: 'reserve', code, items: orderLines(order.lines), itemsTotal: r2(order.itemsTotal), shipping: 0, total: r2(order.itemsTotal) });
      return { code, total: r2(order.itemsTotal) };
    },
    rememberPayPal(paypalId, order) { pendingPayPal.set(paypalId, order); },
    /** a PayPal order was captured → the register records it as a sale */
    paid(paypalId, capture) {
      const order = pendingPayPal.get(paypalId);
      pendingPayPal.delete(paypalId);
      addOrder({
        type: 'paid', paypalOrderId: paypalId, captureId: capture.captureId,
        items: order ? orderLines(order.lines) : [],
        itemsTotal: order ? r2(order.itemsTotal) : 0,
        shipping: order ? r2(order.shipping) : 0,
        total: capture.amount ? r2(capture.amount.value) : (order ? r2(order.total) : 0),
        payer: capture.payer || null, shipTo: capture.shipping || null,
      });
    },
  };
}

module.exports = { createPosLink };
