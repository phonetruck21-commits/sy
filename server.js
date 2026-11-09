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

function buildOrder(items) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) throw httpError(400, 'סל לא תקין');
  const lines = Object.entries(items).map(([id, qty]) => {
    const product = PRODUCTS.find((p) => p.id === id);
    const q = Number(qty);
    if (!product) throw httpError(400, `מוצר לא קיים: ${id}`);
    if (!Number.isInteger(q) || q < 1 || q > 99) throw httpError(400, `כמות לא תקינה: ${id}`);
    return { product, qty: q };
  });
  if (!lines.length) throw httpError(400, 'הסל ריק');
  const total = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);

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
          breakdown: { item_total: { currency_code: CURRENCY, value: money(total) } },
        },
        items: lines.map((l) => ({
          name: l.product.name.slice(0, 127),
          sku: l.product.id,
          quantity: String(l.qty),
          unit_amount: { currency_code: CURRENCY, value: money(l.product.price) },
          category: 'PHYSICAL_GOODS',
        })),
      }],
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

const app = express();
app.use(express.json({ limit: '20kb' }));

// מגישים רק את קבצי האתר – לא את .env, server.js או data/
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ה-Client ID ציבורי (נדרש בדפדפן), ה-Secret נשאר בשרת
app.get('/api/config', (req, res) => {
  res.json({ clientId: PAYPAL_CLIENT_ID, currency: CURRENCY, env: PAYPAL_ENV });
});

// יצירת הזמנה ב-PayPal
app.post('/api/orders', async (req, res, next) => {
  try {
    const order = buildOrder(req.body && req.body.items);
    const r = await paypal('POST', '/v2/checkout/orders', order.body);
    if (!r.ok) {
      console.error('PayPal create order failed', r.status, JSON.stringify(r.json));
      throw httpError(502, 'יצירת ההזמנה ב-PayPal נכשלה');
    }
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
    if (result.status === 'COMPLETED') {
      saveOrder({
        time: new Date().toISOString(),
        ...result,
        payer: r.json.payer && { name: r.json.payer.name, email: r.json.payer.email_address },
        shipping: unit.shipping,
        items: unit.items,
      });
      console.log(`✓ Order paid: ${result.orderId} ${capture.amount && capture.amount.value} ${CURRENCY}`);
    }
    res.json(result);
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message, ...(err.extra || {}) });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`חנות VR רצה: http://localhost:${PORT}  (PayPal: ${PAYPAL_ENV})`);
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) console.warn('⚠ חסרים פרטי PayPal ב-.env – התשלום לא יעבוד');
  });
}

module.exports = { app, buildOrder };
