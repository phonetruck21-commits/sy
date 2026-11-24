'use strict';
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const storage = require('./storage');
const catalog = require('./catalog');
const router = express.Router();
const attempts = new Map();
setInterval(() => { for (const [ip, v] of attempts) if (Date.now() - v.at > 600000) attempts.delete(ip); }, 600000).unref();
function rows(name) {
 try { return fs.readFileSync(path.join(storage.DATA, name), 'utf8').split('\n').filter(Boolean).map(JSON.parse); }
 catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
router.get('/admin', (req, res) => {
 res.setHeader('Cache-Control', 'no-store');
 res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 res.sendFile(path.join(__dirname, 'admin.html'));
});
router.use('/api/admin', (req, res, next) => {
 res.setHeader('Cache-Control', 'no-store');
 const secret = process.env.ADMIN_TOKEN || '';
 if (secret.length < 32) return res.status(503).json({ error: 'ניהול לא הוגדר. יש להגדיר ADMIN_TOKEN אקראי באורך 32 תווים לפחות בהגדרות השרת.' });
 const previous = attempts.get(req.ip), hit = previous && Date.now() - previous.at < 600000 ? previous : { count: 0, at: Date.now() };
 attempts.set(req.ip, hit);
 if (hit.count >= 20) return res.status(429).json({ error: 'יותר מדי ניסיונות כניסה. נסו שוב בעוד עשר דקות.' });
 const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
 const digest = value => crypto.createHash('sha256').update(value).digest();
 if (!crypto.timingSafeEqual(digest(given), digest(secret))) { hit.count++; return res.status(401).json({ error: 'מפתח הניהול אינו תקין' }); }
 next();
});
router.get('/api/admin/overview', (req, res, next) => {
 try {
  const serviceStates = storage.read('service-status.json', {}), orderStates = storage.read('order-status.json', {});
  const requests = rows('service-requests.jsonl').reverse().slice(0, 500).map(r => ({ ...r, ...(serviceStates[r.id] || {}) }));
  const orders = rows('orders.jsonl').reverse().slice(0, 500).map(o => ({ ...o, fulfillment: orderStates[o.orderId]?.status || 'new' }));
  res.json({ requests, orders, products: catalog.products(), readiness: { paypalConfigured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), paypalMode: process.env.PAYPAL_ENV || 'sandbox', storageConfigured: !!process.env.DATA_DIR, aiConfigured: !!process.env.ANTHROPIC_API_KEY, webhookConfigured: !!process.env.PAYPAL_WEBHOOK_ID } });
 } catch (e) { next(e); }
});
router.put('/api/admin/products/:id', (req, res, next) => { try { res.json(catalog.update(req.params.id, req.body || {})); } catch (e) { next(e); } });
router.patch('/api/admin/:kind/:id/status', (req, res, next) => {
 try {
  const { kind, id } = req.params, status = req.body?.status;
  const service = kind === 'requests';
  if (!service && kind !== 'orders') return res.status(404).json({ error: 'רשימה לא נמצאה' });
  const allowed = service ? ['new', 'contacted', 'scheduled', 'done', 'cancelled'] : ['new', 'packing', 'shipped', 'delivered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'סטטוס לא תקין' });
  if (!rows(service ? 'service-requests.jsonl' : 'orders.jsonl').some(row => (service ? row.id : row.orderId) === id)) return res.status(404).json({ error: 'רשומה לא נמצאה' });
  const file = service ? 'service-status.json' : 'order-status.json', states = storage.read(file, {});
  states[id] = { status, updatedAt: new Date().toISOString() }; storage.write(file, states);
  res.json({ ok: true, status });
 } catch (e) { next(e); }
});
module.exports = router;
