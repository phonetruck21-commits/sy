(() => {
 'use strict';
 const $ = selector => document.querySelector(selector);
 let token = '', data = null, active = 'requests';
 const labels = { new: 'חדש', contacted: 'נוצר קשר', scheduled: 'תואם מועד', done: 'הושלם', cancelled: 'בוטל', packing: 'באריזה', shipped: 'נשלח', delivered: 'נמסר' };
 const services = { phone: 'תיקון סלולר', computer: 'תיקון מחשבים', print: 'מדפסות וטונרים', security: 'מצלמות ואזעקות', network: 'רשתות ובית חכם', fire: 'גילוי אש' };
 const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
 const date = value => value ? new Date(value).toLocaleString('he-IL') : '';
 async function api(url, body, method = 'GET') {
  const response = await fetch('/api/admin/' + url, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const out = await response.json(); if (!response.ok) throw new Error(out.error || 'הפעולה נכשלה'); return out;
 }
 function statusSelect(kind, id, current, options) {
  const select = el('select'); select.setAttribute('aria-label', 'עדכון מצב הרשומה');
  for (const key of options) { const option = el('option', labels[key]); option.value = key; select.append(option); } select.value = current;
  select.onchange = async () => {
   select.disabled = true;
   try { await api(`${kind}/${encodeURIComponent(id)}/status`, { status: select.value }, 'PATCH'); $('#status').textContent = 'הסטטוס נשמר'; await load(); }
   catch (e) { select.value = current; $('#status').textContent = e.message; }
   finally { select.disabled = false; }
  }; return select;
 }
 function record(title, subtitle) { const card = el('article', undefined, 'record'), head = el('div', undefined, 'record-head'), copy = el('div'); copy.append(el('h3', title), el('small', subtitle)); head.append(copy); card.append(head); return { card, head }; }
 function contact(card, delivery) {
  if (!delivery) return;
  card.append(el('p', [delivery.name, delivery.city, delivery.street, delivery.house, delivery.apt ? 'דירה ' + delivery.apt : '', delivery.slotLabel, delivery.notes].filter(Boolean).join(' · ')));
  const phone = String(delivery.phone || '').replace(/[^\d+]/g, '');
  if (phone) { const link = el('a', delivery.phone); link.href = 'tel:' + phone; card.append(link); }
 }
 function render() {
  const query = $('#filter').value.trim().toLowerCase();
  const lists = { requests: data.requests, orders: data.orders, products: data.products };
  for (const kind of Object.keys(lists)) {
   const root = $('#' + kind); root.replaceChildren(); root.hidden = kind !== active;
   const filtered = lists[kind].filter(item => JSON.stringify(item).toLowerCase().includes(query));
   if (!filtered.length) { root.append(el('p', query ? 'לא נמצאו תוצאות לחיפוש.' : 'עדיין אין רשומות להצגה.', 'card')); continue; }
   for (const item of filtered) {
    if (kind === 'requests') {
     const { card, head } = record(item.name + ' · ' + (services[item.service] || item.service), date(item.createdAt));
     head.append(statusSelect(kind, item.id, item.status, ['new', 'contacted', 'scheduled', 'done', 'cancelled']));
     card.append(el('p', item.description)); contact(card, item); card.append(el('small', 'מספר פנייה: ' + item.id)); root.append(card);
    } else if (kind === 'orders') {
     const { card, head } = record('הזמנה ' + item.orderId, date(item.time)); head.append(statusSelect(kind, item.orderId, item.fulfillment, ['new', 'packing', 'shipped', 'delivered']));
     card.append(el('p', `${item.amount?.value || ''} ${item.amount?.currency_code || 'ILS'}`));
     for (const line of item.items || []) card.append(el('p', `${line.name} × ${line.quantity}`));
     contact(card, item.delivery); root.append(card);
    } else root.append(productForm(item));
   }
  }
  const metrics = $('#metrics'); metrics.replaceChildren();
  for (const [name, count] of [['פניות חדשות', data.requests.filter(r => r.status === 'new').length], ['הזמנות לטיפול', data.orders.filter(o => o.fulfillment !== 'delivered').length], ['מוצרים מאושרים למכירה', data.products.filter(p => p.published).length]]) { const metric = el('div', undefined, 'metric'); metric.append(el('span', name), el('strong', count)); metrics.append(metric); }
  const r = data.readiness, readiness = $('#readiness'); readiness.replaceChildren();
  for (const [text, ok] of [['PayPal: ' + (r.paypalConfigured ? r.paypalMode === 'live' ? 'תשלום חי מוגדר' : 'בדיקות Sandbox' : 'לא הוגדר'), r.paypalConfigured], ['נתיב אחסון: ' + (r.storageConfigured ? 'מוגדר' : 'מקומי זמני'), r.storageConfigured], ['מוכרת AI: ' + (r.aiConfigured ? 'מוגדרת' : 'מענה מהקטלוג'), r.aiConfigured], ['עדכוני מנויים: ' + (r.webhookConfigured ? 'מוגדרים' : 'לא הוגדרו'), r.webhookConfigured]]) readiness.append(el('span', text, 'badge' + (ok ? ' ok' : '')));
 }
 function productForm(product) {
  const { card } = record(product.name, product.published ? 'מאושר למכירה · דגם תלת־ממד להמחשה' : 'מוצר לדוגמה · חסום בתשלום חי');
  const form = el('form', undefined, 'product-form');
  for (const [key, title, value, type] of [['name', 'שם המוצר האמיתי', product.name, 'text'], ['price', 'מחיר כולל מע״מ (₪)', product.price, 'number'], ['description', 'תיאור אמיתי', product.description, 'textarea'], ['details', 'מפרט ואחריות — שורה לכל פרט', (product.details || []).join('\n'), 'textarea']]) {
   const label = el('label', title), input = el(type === 'textarea' ? 'textarea' : 'input'); input.name = key; input.value = value || ''; if (type !== 'textarea') input.type = type; else input.rows = 3;
   if (key !== 'details') input.required = true;
   if (key === 'price') { input.min = '1'; input.max = '100000'; input.step = '.01'; }
   label.append(input); form.append(label);
  }
  const label = el('label', 'בדקתי שם, מפרט ומחיר ואני מאשר/ת למכור את המוצר', 'check'), check = el('input'); check.type = 'checkbox'; check.name = 'published'; check.checked = product.published === true; label.prepend(check); form.append(label);
  const save = el('button', 'שמירת מוצר', 'primary'); save.type = 'submit'; form.append(save);
  form.onsubmit = async event => {
   event.preventDefault(); save.disabled = true;
   try { const body = Object.fromEntries(new FormData(form)); body.published = check.checked; body.details = body.details.split('\n'); await api('products/' + encodeURIComponent(product.id), body, 'PUT'); $('#status').textContent = 'המוצר נשמר. רענון החנות יציג את העדכון.'; await load(); }
   catch (e) { $('#status').textContent = e.message; } finally { save.disabled = false; }
  }; card.append(form); return card;
 }
 async function load() { data = await api('overview'); render(); }
 $('#login-form').onsubmit = async event => { event.preventDefault(); token = $('#token').value; const button = event.currentTarget.querySelector('button'); button.disabled = true; try { await load(); $('#token').value = ''; $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false; $('#status').textContent = ''; } catch(e) { token = ''; $('#status').textContent = e.message; } finally { button.disabled = false; } };
 $('#logout').onclick = () => { token = ''; data = null; for (const id of ['requests', 'orders', 'products', 'metrics', 'readiness']) $('#' + id).replaceChildren(); $('#workspace').hidden = true; $('#login').hidden = false; $('#logout').hidden = true; $('#status').textContent = ''; };
 $('#refresh').onclick = async () => { try { await load(); $('#status').textContent = 'הנתונים עודכנו'; } catch(e) { $('#status').textContent = e.message; } };
 $('#filter').oninput = () => { if (data) render(); };
 for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => { active = button.dataset.view; for (const other of document.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', other === button); render(); };
})();
