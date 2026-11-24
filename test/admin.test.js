'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-admin-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
process.env.PAYPAL_ENV = 'live';
const { app, buildOrder } = require('../server');
const { PRODUCTS } = require('../js/products');
const server = app.listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;
async function api(url, body, method = 'GET', authorized = true) {
 return fetch(base() + url, { method, headers: { ...(authorized ? { Authorization: 'Bearer ' + process.env.ADMIN_TOKEN } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
test('admin private data requires authentication', async () => {
 assert.equal((await api('/api/admin/overview', null, 'GET', false)).status, 401);
 const response = await api('/api/admin/overview'); assert.equal(response.status, 200);
 const result = await response.json(); assert.ok(!JSON.stringify(result).includes(process.env.ADMIN_TOKEN));
});
test('live example products are blocked until explicitly published and catalog persists', async () => {
 const id = PRODUCTS[0].id;
 assert.throws(() => buildOrder({ [id]: 1 }), /טרם אושר/);
 const body = { name: 'מכשיר בדיקה אמיתי', price: 123.45, description: 'מפרט מאומת של מוצר לבדיקה בלבד', details: ['אחריות לפי הספק'], published: true };
 assert.equal((await api('/api/admin/products/' + id, body, 'PUT')).status, 200);
 assert.equal(buildOrder({ [id]: 1 }).lines[0].product.price, 123.45);
 const saved = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8')); assert.equal(saved[id].published, true);
 const js = await (await fetch(base() + '/js/products.js')).text(); assert.ok(js.includes(body.name));
 assert.equal((await api('/api/admin/products/' + id, { ...body, price: -1 }, 'PUT')).status, 400);
});
test('service status updates are validated and survive reloading the dashboard', async () => {
 const response = await api('/api/service-requests', { service: 'phone', name: 'בדיקה', phone: '0500000000', description: 'בדיקת מעבדה', consent: true }, 'POST');
 const { id } = await response.json();
 assert.equal((await api('/api/admin/requests/' + id + '/status', { status: 'done' }, 'PATCH')).status, 200);
 const overview = await (await api('/api/admin/overview')).json(); assert.equal(overview.requests[0].status, 'done');
 assert.equal((await api('/api/admin/requests/' + id + '/status', { status: 'invalid' }, 'PATCH')).status, 400);
 assert.equal((await api('/api/admin/requests/missing/status', { status: 'done' }, 'PATCH')).status, 404);
});
