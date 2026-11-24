'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-test-'));
process.env.DATA_DIR = dir;
process.env.MALL_DEMO_ACTIVATE = '0';
process.env.PAYPAL_CLIENT_ID = '';
process.env.PAYPAL_CLIENT_SECRET = '';
const { app, buildOrder } = require('../server');
const storage = require('../storage');
const server = app.listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;
const post = (url, body) => fetch(base() + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
test('storage survives a new process and rejects corrupt data', () => {
 storage.write('restart.json', { orders: 2 });
 const output = execFileSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./storage').read('restart.json', {})))"], { cwd: path.join(__dirname, '..'), env: process.env });
 assert.deepEqual(JSON.parse(output), { orders: 2 });
 fs.writeFileSync(path.join(dir, 'broken.json'), '{');
 assert.throws(() => storage.read('broken.json', {}));
});
test('invalid service requests are rejected and valid requests persist', async () => {
 assert.equal((await post('/api/service-requests', {})).status, 400);
 const r = await post('/api/service-requests', { service: 'phone', name: 'בדיקה', phone: '0500000000', city: 'אשדוד', description: 'מסך לא נדלק', consent: true });
 assert.equal(r.status, 201); const result = await r.json();
 const saved = JSON.parse(fs.readFileSync(path.join(dir, 'service-requests.jsonl'), 'utf8'));
 assert.equal(saved.id, result.id); assert.equal(saved.status, 'new');
});
test('a demo storefront cannot bypass another pending reservation', async () => {
 const body = { plan: 'store', slot: 'L2', acceptTerms: true, name: 'בדיקה', contactName: 'בדיקה', phone: '0500000000', email: 'test@example.com' };
 assert.equal((await post('/api/mall/apply', body)).status, 200);
 assert.equal((await post('/api/mall/apply', body)).status, 409);
});
test('checkout rejects empty carts and demo products', () => {
 assert.throws(() => buildOrder({}), /הסל ריק/);
 assert.throws(() => buildOrder({ 'm.demo-coffee.p1': 1 }), /לדוגמה/);
});
test('unknown captures do not contact PayPal', async () => {
 assert.equal((await post('/api/orders/UNKNOWN123/capture', {})).status, 404);
});
