/* שרת החנות: מגיש את האתר ומחבר את PayPal.
 *
 * למה צריך שרת? המפתח הסודי של PayPal (Client Secret) אסור שיגיע לדפדפן,
 * וגם המחיר חייב להיות מחושב בשרת – אחרת קונה יכול לשנות אותו בעצמו.
 *
 * הרצה:  npm install && npm start
 * הגדרות: קובץ .env (ראו .env.example)
 */
'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* אין .env – משתמשים במשתני סביבה */ }

const { STORE_CONFIG, PRODUCTS } = require('./js/products.js');
const mall = require('./mall.js'); // מתחם הקניות: חנויות של עסקים במנוי חודשי

const {
  PAYPAL_CLIENT_ID = '',
  PAYPAL_CLIENT_SECRET = '',
  PAYPAL_ENV = 'sandbox', // sandbox = בדיקות, live = כסף אמיתי
  PORT = 3000,
} = process.env;

const PAYPAL_API = process.env.PAYPAL_API_BASE
  || (PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
const CURRENCY = STORE_CONFIG.currencyCode || 'ILS';
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.jsonl');

/* ---------------- PayPal REST API ---------------- */

let tokenCache = { value: null, expires: 0 };

async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expires) return tokenCache.value;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw httpError(500, 'PayPal לא מוגדר: חסרים PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw httpError(502, `PayPal auth failed (${res.status})`);
  const json = await res.json();
  tokenCache = { value: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  return tokenCache.value;
}

async function paypal(method, urlPath, body) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/* ---------------- בניית הזמנה – המחירים נלקחים מהקטלוג בשרת ---------------- */

function httpError(status, message, extra) { return Object.assign(new Error(message), { status, extra }); }
const money = (n) => Number(n).toFixed(2);

// אותו חוק כמו בדפדפן (js/app.js): משלוח חינם מעל סכום מסוים
function shippingFor(itemsTotal) {
  const free = Number(STORE_CONFIG.freeShippingOver) || 0;
  const cost = Number(STORE_CONFIG.shippingCost) || 0;
  if (!cost || free === 0 || itemsTotal >= free) return 0;
  return cost;
}

/* פרטי משלוח עד הבית – נבדקים בשרת */
const SLOTS = {
  'tomorrow-am': 'מחר, 9:00–13:00',
  'tomorrow-pm': 'מחר, 16:00–20:00',
  'day2-am': 'בעוד יומיים, 9:00–13:00',
  'day2-pm': 'בעוד יומיים, 16:00–20:00',
};
function buildDelivery(d) {
  if (!d || typeof d !== 'object') throw httpError(400, 'חסרים פרטי משלוח');
  const t = (v, max) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  const out = {
    name: t(d.name, 60), phone: t(d.phone, 20).replace(/[^\d+\-\s]/g, ''), city: t(d.city, 40),
    street: t(d.street, 60), house: t(d.house, 10), apt: t(d.apt, 10), zip: t(d.zip, 10).replace(/\D/g, ''),
    notes: t(d.notes, 140), slot: SLOTS[d.slot] ? d.slot : null,
  };
  if (out.name.length < 2) throw httpError(400, 'נא למלא שם מלא');
  if (out.phone.replace(/\D/g, '').length < 9) throw httpError(400, 'נא למלא מספר טלפון תקין');
  if (!out.city || !out.street || !out.house) throw httpError(400, 'נא למלא עיר, רחוב ומספר בית');
  if (!out.slot) throw httpError(400, 'נא לבחור מועד משלוח');
  out.slotLabel = SLOTS[out.slot];
  return out;
}

const COUPONS = { SY10: 0.1 }; // קופון מחיפוש האוצרות בחנות

function buildOrder(items, delivery, coupon) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) throw httpError(400, 'סל לא תקין');
  // מפתח בסל: "מזהה-מוצר" או "מזהה-מוצר|צבע"
  const lines = Object.entries(items).map(([key, qty]) => {
    const [id, variantId] = String(key).split('|');
    const product = PRODUCTS.find((p) => p.id === id) || mall.findProduct(id);
    const q = Number(qty);
    if (!product) throw httpError(400, `מוצר לא קיים: ${id}`);
    if (product.demo) throw httpError(400, `"${product.name}" הוא מוצר מחנות לדוגמה ואי אפשר לקנות אותו`);
    if (!Number.isInteger(q) || q < 1 || q > 99) throw httpError(400, `כמות לא תקינה: ${id}`);
    let variant = null;
    if (variantId) {
      variant = (product.variants || []).find((v) => v.id === variantId);
      if (!variant) throw httpError(400, `צבע לא קיים: ${key}`);
    }
    return { product, variant, qty: q };
  });
  if (lines.length > 50) throw httpError(400, 'יותר מדי פריטים בסל');
  if (!lines.length) throw httpError(400, 'הסל ריק');
  const itemsTotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const rate = COUPONS[String(coupon || '').toUpperCase()] || 0;
  const discount = Math.round(itemsTotal * rate); // אותו עיגול כמו בדפדפן
  const shipping = shippingFor(itemsTotal);
  const total = itemsTotal - discount + shipping;

  return {
    lines,
    total,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        description: STORE_CONFIG.name,
        amount: {
          currency_code: CURRENCY,
          value: money(total),
          breakdown: {
            item_total: { currency_code: CURRENCY, value: money(itemsTotal) },
            shipping: { currency_code: CURRENCY, value: money(shipping) },
            ...(discount ? { discount: { currency_code: CURRENCY, value: money(discount) } } : {}),
          },
        },
        ...(delivery ? {
          shipping: {
            type: 'SHIPPING',
            name: { full_name: delivery.name },
            address: {
              address_line_1: `${delivery.street} ${delivery.house}`.slice(0, 300),
              ...(delivery.apt ? { address_line_2: `דירה ${delivery.apt}` } : {}),
              admin_area_2: delivery.city,
              ...(delivery.zip ? { postal_code: delivery.zip } : {}),
              country_code: 'IL',
            },
          },
        } : {}),
        items: lines.map((l) => ({
          name: (l.variant ? `${l.product.name} – ${l.variant.label}` : l.product.name).slice(0, 127),
          sku: (l.variant ? `${l.product.id}-${l.variant.id}` : l.product.id).slice(0, 127),
          quantity: String(l.qty),
          unit_amount: { currency_code: CURRENCY, value: money(l.product.price) },
          category: 'PHYSICAL_GOODS',
        })),
      }],
      // הכתובת שהלקוח מילא אצלנו היא כתובת המשלוח (PayPal לא מבקש כתובת אחרת)
      ...(delivery ? { payment_source: { paypal: { experience_context: { shipping_preference: 'SET_PROVIDED_ADDRESS', locale: 'he-IL', brand_name: STORE_CONFIG.name } } } } : {}),
    },
  };
}

function saveOrder(record) {
  try {
    fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
    fs.appendFileSync(ORDERS_FILE, JSON.stringify(record) + '\n');
  } catch (e) { console.error('Failed to save order', e); }
}

/* ---------------- שרת ---------------- */

// פרטי משלוח של הזמנות שעוד לא שולמו (נמחקים אחרי שעה)
const pending = new Map();
setInterval(() => { const old = Date.now() - 3600e3; pending.forEach((v, k) => { if (v.at < old) pending.delete(k); }); }, 600e3).unref();

const app = express();
app.set('trust proxy', 1);
app.use(mall.init({ paypal, env: PAYPAL_ENV })); // לפני מפענח ה-JSON הכללי (תמונות מוצרים גדולות יותר)
app.use(express.json({ limit: '20kb' }));

// מגישים רק את קבצי האתר – לא את .env, server.js או data/
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/healthz', (req, res) => res.send('ok')); // בדיקת תקינות לשירות האירוח

// ה-Client ID ציבורי (נדרש בדפדפן), ה-Secret נשאר בשרת
app.get('/api/config', (req, res) => {
  res.json({ clientId: PAYPAL_CLIENT_ID, currency: CURRENCY, env: PAYPAL_ENV });
});

// יצירת הזמנה ב-PayPal
app.post('/api/orders', async (req, res, next) => {
  try {
    const delivery = buildDelivery(req.body && req.body.delivery);
    const order = buildOrder(req.body && req.body.items, delivery, req.body && req.body.coupon);
    const r = await paypal('POST', '/v2/checkout/orders', order.body);
    if (!r.ok) {
      console.error('PayPal create order failed', r.status, JSON.stringify(r.json));
      throw httpError(502, 'יצירת ההזמנה ב-PayPal נכשלה');
    }
    pending.set(r.json.id, { delivery, group: String((req.body && req.body.group) || '').slice(0, 8) || null, at: Date.now() });
    res.json({ id: r.json.id });
  } catch (e) { next(e); }
});

// גביית התשלום אחרי שהקונה אישר ב-PayPal
app.post('/api/orders/:id/capture', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^[A-Z0-9]{5,40}$/.test(id)) throw httpError(400, 'מספר הזמנה לא תקין');
    const r = await paypal('POST', `/v2/checkout/orders/${id}/capture`);
    if (!r.ok) {
      const issue = r.json && r.json.details && r.json.details[0] && r.json.details[0].issue;
      console.error('PayPal capture failed', r.status, JSON.stringify(r.json));
      throw httpError(r.status === 422 ? 422 : 502, 'גביית התשלום נכשלה', { issue });
    }
    const unit = (r.json.purchase_units || [])[0] || {};
    const capture = ((unit.payments || {}).captures || [])[0] || {};
    const result = {
      status: r.json.status, // COMPLETED = שולם
      orderId: r.json.id,
      captureId: capture.id,
      amount: capture.amount,
    };
    const extra = pending.get(id) || {};
    pending.delete(id);
    if (extra.delivery) result.delivery = { slotLabel: extra.delivery.slotLabel, city: extra.delivery.city };
    if (result.status === 'COMPLETED') {
      saveOrder({
        time: new Date().toISOString(),
        ...result,
        payer: r.json.payer && { name: r.json.payer.name, email: r.json.payer.email_address },
        shipping: unit.shipping,
        delivery: extra.delivery,
        group: extra.group,
        items: unit.items,
      });
      try { mall.recordOrder({ time: new Date().toISOString(), orderId: result.orderId, items: unit.items, delivery: extra.delivery }); } catch (e) { console.error('mall order', e); }
      console.log(`✓ Order paid: ${result.orderId} ${capture.amount && capture.amount.value} ${CURRENCY}`);
    }
    res.json(result);
  } catch (e) { next(e); }
});

// מוכר/ת AI – משמש גם את האתר וגם את אפליקציית Unreal
const seller = require('./seller.js');
const sellerHits = new Map(); // הגבלת קצב פשוטה לכל כתובת IP
app.post('/api/seller', async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw httpError(503, 'המוכר/ת עדיין לא מחובר/ת – בעלי החנות צריכים להגדיר ANTHROPIC_API_KEY בשרת');
    }
    const ip = req.ip || 'x';
    const now = Date.now();
    const hits = (sellerHits.get(ip) || []).filter((t) => now - t < 60000);
    if (hits.length >= 12) throw httpError(429, 'רגע, הרבה שאלות ברצף 🙂 נסו שוב בעוד דקה');
    hits.push(now); sellerHits.set(ip, hits);
    const out = await seller.ask(req.body && req.body.messages, { kid: !!(req.body && req.body.kid) });
    res.json(out);
  } catch (e) {
    if (e instanceof seller.Anthropic.RateLimitError) return next(httpError(429, 'המוכר/ת עסוק/ה כרגע, נסו שוב בעוד רגע'));
    if (e instanceof seller.Anthropic.APIError) { console.error('Seller API error', e.status, e.message); return next(httpError(502, 'המוכר/ת לא זמין/ה כרגע')); }
    next(e);
  }
});
setInterval(() => { const old = Date.now() - 60000; sellerHits.forEach((v, k) => { if (!v.some((t) => t > old)) sellerHits.delete(k); }); }, 60000).unref();

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message, ...(err.extra || {}) });
});

if (require.main === module) {
  const server = require('http').createServer(app);
  require('./live.js').attach(server); // מבקרים, צ'אט וקבוצות בזמן אמת
  server.listen(PORT, () => {
    console.log(`חנות VR רצה: http://localhost:${PORT}  (PayPal: ${PAYPAL_ENV})`);
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) console.warn('⚠ חסרים פרטי PayPal ב-.env – התשלום לא יעבוד');
  });
}

module.exports = { app, buildOrder, buildDelivery, shippingFor };
