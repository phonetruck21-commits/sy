'use strict';
const express = require('express');
const crypto = require('node:crypto');
const storage = require('./storage');
const router = express.Router();
const SERVICES = [
  { id: 'phone', name: 'תיקון סלולר וטאבלטים', description: 'מסכים, סוללות, טעינה ואבחון תקלות' },
  { id: 'computer', name: 'תיקון מחשבים', description: 'אבחון, שדרוגים, ניקוי וטיפול בתקלות' },
  { id: 'print', name: 'מדפסות וטונרים', description: 'התאמת מדפסת, אספקת טונרים ושירות' },
  { id: 'security', name: 'מצלמות ואזעקות', description: 'תכנון, התקנה ותחזוקת מערכות אבטחה' },
  { id: 'network', name: 'רשתות ובית חכם', description: 'תקשורת, Wi-Fi ואוטומציה לבית ולעסק' },
  { id: 'fire', name: 'מערכות גילוי אש', description: 'בדיקת צורכי האתר ותיאום הצעת מחיר' },
];
router.get('/api/services', (req, res) => res.json(SERVICES));
const hits = new Map();
setInterval(() => { for (const [key, value] of hits) if (Date.now() - value.at > 3600000) hits.delete(key); }, 600000).unref();
router.post('/api/service-requests', (req, res, next) => {
  try {
    const old = hits.get(req.ip);
    const hit = old && Date.now() - old.at < 3600000 ? old : { count: 0, at: Date.now() };
    hits.set(req.ip, hit);
    if (++hit.count > 10) return res.status(429).json({ error: 'נשלחו בקשות רבות. נסו שוב מאוחר יותר או התקשרו אלינו.' });
    const b = req.body || {};
    const clean = (v, max) => typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) : '';
    const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'new', service: b.service,
      name: clean(b.name, 60), phone: clean(b.phone, 20), city: clean(b.city, 60), description: clean(b.description, 1000) };
    if (!SERVICES.some(s => s.id === record.service) || record.name.length < 2 || !/^(?:0\d{8,9}|\+972\d{8,9})$/.test(record.phone.replace(/[\s-]/g, '')) || record.description.length < 5 || b.consent !== true) {
      return res.status(400).json({ error: 'יש למלא שירות, שם, טלפון ישראלי תקין, תיאור ואישור יצירת קשר.' });
    }
    storage.append('service-requests.jsonl', record);
    res.status(201).json({ id: record.id, message: 'הבקשה נשמרה. לתיאום דחוף התקשרו 052-546-6304.' });
  } catch (e) { next(e); }
});
module.exports = router;
