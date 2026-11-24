'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-payments-'));
process.env.DATA_DIR = dir;
process.env.PAYPAL_CLIENT_ID = 'test-only';
process.env.PAYPAL_CLIENT_SECRET = 'test-only';
const items = [{ sku: 'example', name: 'בדיקה', quantity: '1', unit_amount: { value: '10.00' } }];
fs.writeFileSync(path.join(dir, 'pending.json'), JSON.stringify({
 PAID123: { expectedTotal: '10.00', items, at: Date.now(), delivery: { city: 'בדיקה' } },
 WRONG123: { expectedTotal: '15.00', items, at: Date.now() }
}));
const nativeFetch = global.fetch;
let captures = 0;
global.fetch = async (url, options) => {
 if (!String(url).startsWith('https://api-m.')) return nativeFetch(url, options);
 if (String(url).endsWith('/token')) return Response.json({ access_token: 'test', expires_in: 3600 });
 captures++;
 assert.ok(options.headers['PayPal-Request-Id']);
 return Response.json({ id: String(url).includes('WRONG123') ? 'WRONG123' : 'PAID123', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '10.00', currency_code: 'ILS' } }] } }] });
};
const { app } = require('../server');
const server = app.listen(0);
const capture = id => nativeFetch(`http://127.0.0.1:${server.address().port}/api/orders/${id}/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
after(() => { server.close(); global.fetch = nativeFetch; fs.rmSync(dir, { recursive: true, force: true }); });
test('restored checkout captures once and repeated confirmation returns saved result', async () => {
 const before = captures;
 const first = await capture('PAID123'); assert.equal(first.status, 200);
 assert.equal((await first.json()).status, 'COMPLETED');
 assert.equal((await capture('PAID123')).status, 200);
 assert.equal(captures - before, 1);
 const rows = fs.readFileSync(path.join(dir, 'orders.jsonl'), 'utf8').trim().split('\n');
 assert.equal(rows.length, 1); assert.deepEqual(JSON.parse(rows[0]).items, items);
});
test('mismatched payment is not recorded as a completed order', async () => {
 assert.equal((await capture('WRONG123')).status, 502);
 assert.equal(fs.readFileSync(path.join(dir, 'orders.jsonl'), 'utf8').trim().split('\n').length, 1);
});
