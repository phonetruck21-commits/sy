/* מתחם הקניות S.Y Mall – עסקים שוכרים חנות במנוי חודשי.
 *
 * זרימה:
 *  1. בעל עסק בוחר מסלול ומקום במתחם, ממלא פרטים ומאשר את חוזה השכירות  →  POST /api/mall/apply
 *  2. משלם מנוי חודשי ב-PayPal (Subscriptions)                                 →  POST /api/mall/activate
 *     השרת מאמת מול PayPal שהמנוי פעיל, שייך לעסק ובמסלול הנכון – ורק אז החנות נפתחת
 *  3. מנהל את החנות בעמוד הניהול (קישור עם מפתח אישי): פרטים, מוצרים, הזמנות, ביטול
 *  4. לקוחות קונים מכל החנויות באותו סל; התשלום עובר דרך המתחם, וכל עסק רואה את ההזמנות שלו
 *  5. PayPal מודיע על חידוש/ביטול/השעיה (webhook) – והחנות נפתחת/נסגרת בהתאם
 *
 * הנתונים נשמרים ב-data/mall.json, תמונות מוצרים ב-data/uploads, הזמנות לעסקים ב-data/mall-orders.jsonl
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const storage = require('./storage');
const DATA = storage.DATA;
const UPLOADS = path.join(DATA, 'uploads');
const ORDERS = path.join(DATA, 'mall-orders.jsonl');
const TERMS_VERSION = '2026-11-21';

/* מסלולי השכירות (מחיר לחודש, כולל מע"מ) */
const PLANS = [
  { id: 'kiosk', name: 'דוכן', price: 149, maxProducts: 12, features: ['דוכן ממותג במתחם', 'עד 12 מוצרים', 'הזמנות ומשלוחים דרך המתחם', 'ביטול בכל חודש'] },
  { id: 'store', name: 'חנות', price: 349, maxProducts: 40, popular: true, features: ['חנות מלאה עם חלון ראווה', 'עד 40 מוצרים', 'הופעה במדריך המתחם', 'הזמנות ומשלוחים דרך המתחם', 'ביטול בכל חודש'] },
  { id: 'flagship', name: 'חנות דגל', price: 749, maxProducts: 150, features: ['מיקום מרכזי ושלט מואר', 'עד 150 מוצרים', 'קידום בעמוד הפתיחה', 'הזמנות ומשלוחים דרך המתחם', 'ביטול בכל חודש'] },
];
const planById = (id) => PLANS.find((p) => p.id === id);

/* 8 מקומות במתחם: 4 בכל צד של הרחבה */
const SLOTS = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'];
const CATEGORIES = ['אופנה', 'אוכל ומשקאות', 'בית ועיצוב', 'ילדים וצעצועים', 'יופי וטיפוח', 'ספורט', 'חיות מחמד', 'מתנות ופרחים', 'אלקטרוניקה', 'שירותים', 'אחר'];

/* חנויות לדוגמה – מוצגות רק כשאין עדיין שוכרים אמיתיים, כדי שהמתחם לא ייראה ריק (MALL_DEMO=0 מכבה) */
const DEMO = [
  { id: 'demo-flowers', slot: 'L2', plan: 'store', name: 'פרחי השדרה', tagline: 'זרים טריים כל בוקר', category: 'מתנות ופרחים', color: '#e0457b',
    products: [['p1', 'זר ורדים אדומים', 189, 'זר של 15 ורדים אדומים עם עלוות אקליפטוס.', '🌹'], ['p2', 'זר פרחי שדה', 149, 'זר עונתי צבעוני, משלוח עד הבית.', '💐'], ['p3', 'עציץ סחלב', 129, 'סחלב לבן בכלי קרמיקה.', '🌸']] },
  { id: 'demo-coffee', slot: 'R2', plan: 'store', name: 'קלייה ברחבה', tagline: 'פולי קפה טריים', category: 'אוכל ומשקאות', color: '#b7793f',
    products: [['p1', 'קפה אספרסו 500 גרם', 69, 'תערובת בית קלויה בינונית-כהה.', '☕'], ['p2', 'מקינטה 6 כוסות', 119, 'מקינטה אלומיניום קלאסית.', '🫖'], ['p3', 'מארז טעימות', 99, '4 זנים × 125 גרם.', '🎁']] },
  { id: 'demo-toys', slot: 'L3', plan: 'kiosk', name: 'צעצועי עץ', tagline: 'משחקים שנשארים לדור הבא', category: 'ילדים וצעצועים', color: '#3aa76d',
    products: [['p1', 'רכבת עץ', 159, 'רכבת עם 3 קרונות וצבעים טבעיים.', '🚂'], ['p2', 'קוביות בנייה', 89, '50 קוביות עץ מלא.', '🧱']] },
];
const demoOn = () => process.env.MALL_DEMO !== '0';

/* ---------------- אחסון ---------------- */
let db = { merchants: [], paypal: {} };
db = { ...db, ...storage.read('mall.json', {}) };
function save() { storage.write('mall.json', db); }
const now = () => Date.now();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

/* חנות פתוחה ללקוחות: מנוי פעיל, או בוטל אבל התקופה ששולמה עוד לא נגמרה */
function isOpen(m) {
  if (m.status === 'active') return true;
  if (m.status === 'cancelling' && m.activeUntil && now() < m.activeUntil) return true;
  return false;
}
/* מקום תפוס: חנות פתוחה, או בקשה שממתינה לתשלום (שמור ל-30 דקות) */
function slotTaken(slot, exceptId) {
  return db.merchants.some((m) => m.id !== exceptId && m.slot === slot && (isOpen(m) || (m.status === 'pending' && now() - m.createdAt < 30 * 60e3)));
}

function publicStore(m) {
  return {
    id: m.id, slot: m.slot, plan: m.plan, name: m.name, tagline: m.tagline, category: m.category, color: m.color, demo: !!m.demo,
    products: (m.products || []).map((p) => ({ id: `m.${m.id}.${p.id}`, name: p.name, price: p.price, description: p.description, image: p.image || null, emoji: p.emoji || null })),
  };
}
function demoStores() {
  return DEMO.map((d) => ({ ...d, demo: true, products: d.products.map(([id, name, price, description, emoji]) => ({ id, name, price, description, emoji })) }));
}
function openStores() {
  const real = db.merchants.filter(isOpen);
  const demos = demoOn() ? demoStores().filter((d) => !real.some((m) => m.slot === d.slot)) : [];
  return [...real, ...demos];
}

/* מחיר מוצר של עסק – לשרת ההזמנות (המחיר תמיד מהשרת, לא מהדפדפן) */
function findProduct(id) {
  const m = /^m\.([\w-]{2,40})\.([\w-]{1,40})$/.exec(String(id));
  if (!m) return null;
  const store = openStores().find((s) => s.id === m[1]);
  const p = store && (store.products || []).find((x) => x.id === m[2]);
  if (!p) return null;
  return { id, name: `${p.name} · ${store.name}`.slice(0, 120), price: p.price, merchantId: store.id, demo: !!store.demo };
}

/* אחרי תשלום של לקוח: כל עסק מקבל את השורות שלו */
function recordOrder(order) {
  const byMerchant = {};
  (order.items || []).forEach((it) => {
    const match = /^m\.([\w-]{2,40})\.([\w-]{1,40})$/.exec(String(it.sku));
    if (!match) return;
    const merchantId = match[1];
    (byMerchant[merchantId] = byMerchant[merchantId] || []).push({ name: it.name, qty: Number(it.quantity), price: Number(it.unit_amount && it.unit_amount.value) });
  });
  const entries = Object.entries(byMerchant);
  if (!entries.length) return;
  fs.mkdirSync(DATA, { recursive: true });
  entries.forEach(([merchantId, lines]) => {
    if (!ordersFor(merchantId).some(o => o.orderId === order.orderId)) storage.append('mall-orders.jsonl', { time: order.time, orderId: order.orderId, merchantId, lines, delivery: order.delivery || null });
  });
}
function ordersFor(merchantId) {
  try {
    return fs.readFileSync(ORDERS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((o) => o.merchantId === merchantId).reverse().slice(0, 200);
  } catch (e) { return []; }
}

/* ---------------- PayPal: מסלולים ומנויים ---------------- */
let paypal = null; // מוזרק מ-server.js
let paypalEnv = 'sandbox';

async function ensurePlans() {
  const store = (db.paypal[paypalEnv] = db.paypal[paypalEnv] || { plans: {} });
  if (!store.productId) {
    const r = await paypal('POST', '/v1/catalogs/products', { name: 'S.Y Mall – שכירות חנות', type: 'SERVICE', category: 'SOFTWARE' });
    if (!r.ok) throw httpError(502, 'יצירת המוצר ב-PayPal נכשלה');
    store.productId = r.json.id; save();
  }
  for (const plan of PLANS) {
    const cur = store.plans[plan.id];
    if (cur && cur.price === plan.price) continue;
    const r = await paypal('POST', '/v1/billing/plans', {
      product_id: store.productId,
      name: `S.Y Mall – ${plan.name}`,
      description: `${plan.name}: ${plan.price} ₪ לחודש`,
      status: 'ACTIVE',
      billing_cycles: [{
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
        pricing_scheme: { fixed_price: { value: plan.price.toFixed(2), currency_code: 'ILS' } },
      }],
      payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 2 },
    });
    if (!r.ok) { console.error('PayPal plan create failed', r.status, JSON.stringify(r.json)); throw httpError(502, 'יצירת מסלול המנוי ב-PayPal נכשלה'); }
    store.plans[plan.id] = { id: r.json.id, price: plan.price };
    save();
  }
  return store.plans;
}

const paypalReady = () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const demoActivate = () => process.env.MALL_DEMO_ACTIVATE === '1' && !paypalReady();

/* ---------------- נתיבים ---------------- */
const router = express.Router();
const small = express.json({ limit: '20kb' });
const big = express.json({ limit: '2mb' }); // תמונת מוצר

function auth(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (t.length < 20) throw httpError(401, 'נדרש מפתח ניהול');
  const m = db.merchants.find((x) => x.tokenHash === hash(t));
  if (!m) throw httpError(401, 'מפתח ניהול לא תקין');
  return m;
}
function merchantView(m) {
  const plan = planById(m.plan);
  return {
    id: m.id, name: m.name, tagline: m.tagline, category: m.category, color: m.color, slot: m.slot, plan: m.plan, planName: plan.name, price: plan.price,
    maxProducts: plan.maxProducts, status: m.status, open: isOpen(m), activeUntil: m.activeUntil || null, contact: m.contact,
    products: m.products || [], createdAt: m.createdAt, activatedAt: m.activatedAt || null,
  };
}

// מצב המתחם ללקוחות ולעמוד ההרשמה
router.get('/api/mall', (req, res) => {
  const stores = openStores();
  res.json({
    plans: PLANS, categories: CATEGORIES, termsVersion: TERMS_VERSION,
    slots: SLOTS.map((id) => {
      const s = stores.find((x) => x.slot === id);
      return s ? { id, status: 'open', store: publicStore(s) } : { id, status: slotTaken(id) ? 'reserved' : 'free' };
    }),
    payments: paypalReady() ? 'paypal' : demoActivate() ? 'demo' : 'off',
  });
});

// שלב 1: בקשה לשכור חנות
router.post('/api/mall/apply', small, async (req, res, next) => {
  try {
    const b = req.body || {};
    const plan = planById(b.plan);
    if (!plan) throw httpError(400, 'נא לבחור מסלול');
    const slot = SLOTS.includes(b.slot) ? b.slot : null;
    if (!slot) throw httpError(400, 'נא לבחור מקום במתחם');
    if (slotTaken(slot)) throw httpError(409, 'המקום הזה כבר תפוס – נא לבחור מקום אחר');
    if (b.acceptTerms !== true) throw httpError(400, 'יש לאשר את חוזה השכירות');
    const name = clean(b.name, 40), contactName = clean(b.contactName, 60), phone = clean(b.phone, 20).replace(/[^\d+\-\s]/g, ''), email = clean(b.email, 120);
    if (name.length < 2) throw httpError(400, 'נא למלא את שם העסק');
    if (contactName.length < 2) throw httpError(400, 'נא למלא שם איש קשר');
    if (phone.replace(/\D/g, '').length < 9) throw httpError(400, 'נא למלא טלפון תקין');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'נא למלא כתובת אימייל תקינה');
    const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#1e6bff';
    const token = crypto.randomBytes(24).toString('base64url');
    const m = {
      id: 'm' + crypto.randomBytes(5).toString('hex'), tokenHash: hash(token), status: 'pending', createdAt: now(),
      plan: plan.id, slot, name, tagline: clean(b.tagline, 60), category: CATEGORIES.includes(b.category) ? b.category : 'אחר', color,
      contact: { name: contactName, phone, email, taxId: clean(b.taxId, 20) },
      terms: { version: TERMS_VERSION, acceptedAt: new Date().toISOString(), ip: req.ip },
      products: [],
    };
    db.merchants.push(m); save();
    let planId = null;
    if (paypalReady()) planId = (await ensurePlans())[plan.id].id;
    res.json({ merchantId: m.id, token, planId, price: plan.price, payments: paypalReady() ? 'paypal' : demoActivate() ? 'demo' : 'off' });
  } catch (e) { next(e); }
});

// שלב 2: הפעלה אחרי אישור המנוי ב-PayPal – מאמתים מול PayPal
router.post('/api/mall/activate', small, async (req, res, next) => {
  try {
    const m = auth(req);
    if (isOpen(m)) return res.json(merchantView(m));
    if (slotTaken(m.slot, m.id) && db.merchants.some((x) => x.id !== m.id && x.slot === m.slot && isOpen(x))) throw httpError(409, 'המקום נתפס בינתיים. צרו קשר ונמצא מקום אחר');
    if (demoActivate()) {
      Object.assign(m, { status: 'active', activatedAt: now(), subscriptionId: 'DEMO' }); save();
      return res.json(merchantView(m));
    }
    const sid = String((req.body && req.body.subscriptionId) || '');
    if (!/^I-[A-Z0-9]{6,30}$/.test(sid)) throw httpError(400, 'מספר מנוי לא תקין');
    const r = await paypal('GET', `/v1/billing/subscriptions/${sid}`);
    if (!r.ok) throw httpError(502, 'לא הצלחנו לאמת את המנוי ב-PayPal');
    const plans = await ensurePlans();
    const s = r.json;
    if (s.plan_id !== plans[m.plan].id) throw httpError(400, 'המנוי לא תואם למסלול שנבחר');
    if (s.custom_id !== m.id) throw httpError(400, 'המנוי שייך לעסק אחר');
    if (s.status !== 'ACTIVE') throw httpError(402, `המנוי עדיין לא פעיל (${s.status})`);
    if (db.merchants.some((x) => x.id !== m.id && x.subscriptionId === sid)) throw httpError(409, 'המנוי כבר משויך לחנות אחרת');
    Object.assign(m, { status: 'active', activatedAt: now(), subscriptionId: sid, nextBilling: s.billing_info && s.billing_info.next_billing_time || null });
    save();
    console.log(`✓ Mall store opened: ${m.name} (${m.plan}, ${m.slot})`);
    res.json(merchantView(m));
  } catch (e) { next(e); }
});

// עמוד הניהול של העסק
router.get('/api/mall/me', (req, res, next) => {
  try { const m = auth(req); res.json({ ...merchantView(m), orders: ordersFor(m.id), plans: PLANS, categories: CATEGORIES }); } catch (e) { next(e); }
});
router.put('/api/mall/me', small, (req, res, next) => {
  try {
    const m = auth(req); const b = req.body || {};
    if (b.name !== undefined) { const n = clean(b.name, 40); if (n.length < 2) throw httpError(400, 'שם העסק קצר מדי'); m.name = n; }
    if (b.tagline !== undefined) m.tagline = clean(b.tagline, 60);
    if (b.category !== undefined && CATEGORIES.includes(b.category)) m.category = b.category;
    if (b.color !== undefined && /^#[0-9a-f]{6}$/i.test(b.color)) m.color = b.color;
    save(); res.json(merchantView(m));
  } catch (e) { next(e); }
});
router.post('/api/mall/me/products', big, (req, res, next) => {
  try {
    const m = auth(req); const b = req.body || {};
    const plan = planById(m.plan);
    m.products = m.products || [];
    if (m.products.length >= plan.maxProducts) throw httpError(400, `במסלול ${plan.name} אפשר עד ${plan.maxProducts} מוצרים`);
    const name = clean(b.name, 60); const price = Math.round(Number(b.price));
    if (name.length < 2) throw httpError(400, 'נא למלא שם מוצר');
    if (!Number.isFinite(price) || price < 1 || price > 100000) throw httpError(400, 'מחיר לא תקין');
    const p = { id: 'p' + crypto.randomBytes(4).toString('hex'), name, price, description: clean(b.description, 400), image: null };
    if (b.image) {
      const mm = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image));
      if (!mm) throw httpError(400, 'תמונה לא נתמכת (PNG, JPEG או WebP)');
      const buf = Buffer.from(mm[2], 'base64');
      if (buf.length > 1.5e6) throw httpError(400, 'התמונה גדולה מדי (עד 1.5MB)');
      const sig = buf.subarray(0, 12).toString('hex');
      const okSig = (mm[1] === 'png' && sig.startsWith('89504e47')) || (mm[1] === 'jpeg' && sig.startsWith('ffd8ff')) || (mm[1] === 'webp' && buf.subarray(8, 12).toString() === 'WEBP');
      if (!okSig) throw httpError(400, 'קובץ התמונה פגום');
      fs.mkdirSync(UPLOADS, { recursive: true });
      const fname = `${m.id}-${p.id}.${mm[1] === 'jpeg' ? 'jpg' : mm[1]}`;
      fs.writeFileSync(path.join(UPLOADS, fname), buf);
      p.image = `/uploads/${fname}`;
    }
    m.products.push(p); save();
    res.json(merchantView(m));
  } catch (e) { next(e); }
});
router.delete('/api/mall/me/products/:pid', (req, res, next) => {
  try {
    const m = auth(req);
    const p = (m.products || []).find((x) => x.id === req.params.pid);
    if (!p) throw httpError(404, 'מוצר לא נמצא');
    m.products = m.products.filter((x) => x !== p);
    if (p.image) { try { fs.unlinkSync(path.join(UPLOADS, path.basename(p.image))); } catch (e) { /* ignore */ } }
    save(); res.json(merchantView(m));
  } catch (e) { next(e); }
});
// ביטול: המנוי נעצר ב-PayPal, והחנות נשארת פתוחה עד סוף התקופה ששולמה
router.post('/api/mall/me/cancel', small, async (req, res, next) => {
  try {
    const m = auth(req);
    if (!isOpen(m) || m.status === 'cancelling') return res.json(merchantView(m));
    let until = now() + 30 * 864e5;
    if (m.subscriptionId && m.subscriptionId !== 'DEMO') {
      const s = await paypal('GET', `/v1/billing/subscriptions/${m.subscriptionId}`);
      if (s.ok && s.json.billing_info && s.json.billing_info.next_billing_time) until = Date.parse(s.json.billing_info.next_billing_time);
      const r = await paypal('POST', `/v1/billing/subscriptions/${m.subscriptionId}/cancel`, { reason: 'בוטל על ידי העסק' });
      if (!r.ok && r.status !== 422) throw httpError(502, 'הביטול ב-PayPal נכשל, נסו שוב');
    }
    Object.assign(m, { status: 'cancelling', activeUntil: until, cancelledAt: now() }); save();
    res.json(merchantView(m));
  } catch (e) { next(e); }
});

// הודעות מ-PayPal על המנוי (חידוש, השעיה, ביטול). מאומתות מול PayPal לפני שמשנים משהו
router.post('/api/paypal/webhook', express.json({ limit: '200kb' }), async (req, res, next) => {
  try {
    const id = process.env.PAYPAL_WEBHOOK_ID;
    if (!id || !paypalReady()) return res.status(503).json({ error: 'webhook not configured' });
    const h = (k) => req.headers[k];
    const v = await paypal('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: id, webhook_event: req.body,
    });
    if (!v.ok || v.json.verification_status !== 'SUCCESS') return res.status(400).json({ error: 'bad signature' });
    const ev = req.body || {}; const r = ev.resource || {};
    const sid = r.billing_agreement_id || r.id;
    const m = db.merchants.find((x) => x.subscriptionId === sid);
    if (m) {
      switch (ev.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED': if (m.status !== 'cancelling') m.status = 'active'; break;
        case 'PAYMENT.SALE.COMPLETED': m.lastPaymentAt = now(); if (m.status === 'suspended') m.status = 'active'; break;
        case 'BILLING.SUBSCRIPTION.SUSPENDED': case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': m.status = 'suspended'; break;
        case 'BILLING.SUBSCRIPTION.CANCELLED': if (m.status !== 'cancelling') { m.status = 'cancelling'; m.activeUntil = m.activeUntil || now() + 3 * 864e5; } break;
        case 'BILLING.SUBSCRIPTION.EXPIRED': m.status = 'ended'; break;
        default: break;
      }
      save();
      console.log(`Mall webhook ${ev.event_type} → ${m.name}: ${m.status}`);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.use('/uploads', express.static(UPLOADS, { maxAge: '7d', fallthrough: false }));
router.get(['/merchant', '/merchant.html'], (req, res) => res.sendFile(path.join(__dirname, 'merchant.html')));

function init(deps) { paypal = deps.paypal; paypalEnv = deps.env || 'sandbox'; return router; }

module.exports = { init, router, findProduct, recordOrder, PLANS, SLOTS, TERMS_VERSION };
