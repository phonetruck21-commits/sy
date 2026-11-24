'use strict';
const storage = require('./storage');
const { PRODUCTS } = require('./js/products');
let overrides = storage.read('catalog.json', {});
function apply() { for (const product of PRODUCTS) if (overrides[product.id]) Object.assign(product, overrides[product.id]); }
apply();
function update(id, body) {
 const product = PRODUCTS.find(p => p.id === id);
 if (!product) throw Object.assign(new Error('מוצר לא נמצא'), { status: 404 });
 const text = (value, max) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) : '';
 const name = text(body.name, 100), description = text(body.description, 1000), price = Number(body.price);
 if (name.length < 2 || description.length < 5 || !Number.isFinite(price) || price < 1 || price > 100000 || typeof body.published !== 'boolean') throw Object.assign(new Error('יש למלא שם, תיאור ומחיר תקין ולבחור מצב פרסום'), { status: 400 });
 const next = { name, description, price: Math.round(price * 100) / 100, published: body.published, details: (Array.isArray(body.details) ? body.details : []).map(d => text(d, 150)).filter(Boolean).slice(0, 10), oldPrice: null };
 const updated = { ...overrides, [id]: next };
 storage.write('catalog.json', updated); overrides = updated; Object.assign(product, next);
 return product;
}
function canSell(product) { return process.env.PAYPAL_ENV !== 'live' || product.published === true; }
module.exports = { update, canSell, products: () => PRODUCTS, overrides: () => overrides };
