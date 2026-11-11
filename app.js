'use strict';
/* ============================================================
   קופה רושמת – אפליקציית POS מקומית (ללא שרת)
   כל הנתונים נשמרים ב-localStorage של הדפדפן.
   ============================================================ */

const LS_KEY = 'pos.v1';
const PAY_METHODS = {
  cash: 'מזומן', credit: 'אשראי', check: 'צ׳ק', bit: 'ביט / העברה', voucher: 'שובר / זיכוי'
};

const DEFAULT_SETTINGS = {
  storeName: 'החנות המקצועית',
  taxId: '',
  address: '',
  phone: '',
  footer: 'תודה ורכישה מהנה!',
  vat: 18,
  pricesIncludeVat: true,
  cashier: 'קופאי 1',
  nextReceipt: 1,
  nextZ: 1,
  lowStock: 3,
  managerPin: '',
  maxDiscount: 15,
};

const SAMPLE_PRODUCTS = [
  ['1001', '7290000000011', 'מקדחה רוטטת 750W', 'כלי עבודה חשמליים', 349.9, 210, 8],
  ['1002', '7290000000028', 'מברגה נטענת 18V', 'כלי עבודה חשמליים', 599, 380, 5],
  ['1003', '7290000000035', 'משחזת זווית 115 מ״מ', 'כלי עבודה חשמליים', 279, 160, 6],
  ['2001', '7290000000042', 'סט מברגים 12 יח׳', 'כלי עבודה ידניים', 89.9, 40, 20],
  ['2002', '7290000000059', 'פטיש 500 גרם', 'כלי עבודה ידניים', 59.9, 25, 15],
  ['2003', '7290000000066', 'מפתח שבדי 10״', 'כלי עבודה ידניים', 64.9, 30, 12],
  ['2004', '7290000000073', 'מטר מתגלגל 5 מ׳', 'כלי עבודה ידניים', 34.9, 14, 30],
  ['3001', '7290000000080', 'ברגים לעץ 4x40 (100 יח׳)', 'חומרי חיבור', 19.9, 7, 50],
  ['3002', '7290000000097', 'דיבלים 8 מ״מ (50 יח׳)', 'חומרי חיבור', 14.9, 5, 40],
  ['3003', '7290000000103', 'סיליקון שקוף', 'חומרי חיבור', 24.9, 11, 25],
  ['4001', '7290000000110', 'כפפות עבודה', 'ציוד מגן', 17.9, 6, 2],
  ['4002', '7290000000127', 'משקפי מגן', 'ציוד מגן', 29.9, 12, 18],
  ['4003', '7290000000134', 'אטמי אוזניים', 'ציוד מגן', 9.9, 3, 60],
  ['5001', '7290000000141', 'מקדח לבטון 8 מ״מ', 'אביזרים', 22.9, 9, 35],
  ['5002', '7290000000158', 'דיסק חיתוך מתכת', 'אביזרים', 12.9, 4, 1],
  ['5003', '7290000000165', 'סוללה 18V 4Ah', 'אביזרים', 249, 150, 4],
];

/* ---------------- state ---------------- */
let db = load();
let cart = newCart();
let activeCategory = 'הכל';

function newCart() {
  return { items: [], discount: { type: 'pct', value: 0 }, refund: false };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      d.settings = { ...DEFAULT_SETTINGS, ...d.settings };
      d.products ||= []; d.sales ||= []; d.held ||= []; d.zReports ||= [];
      return d;
    }
  } catch (e) { console.error(e); }
  return {
    settings: { ...DEFAULT_SETTINGS },
    products: SAMPLE_PRODUCTS.map(([sku, barcode, name, category, price, cost, stock]) =>
      ({ id: uid(), sku, barcode, name, category, price, cost, stock })),
    sales: [], held: [], zReports: [],
  };
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); }
  catch (e) { toast('שגיאה בשמירת נתונים: ' + e.message, true); }
}

/* ---------------- utils ---------------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const money = n => (n < 0 ? '-' : '') + '₪' + Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = ts => new Date(ts).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function beep(ok = true) {
  try {
    const ctx = beep.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 1200 : 300; g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.07 : 0.25));
  } catch { /* no audio */ }
}

/* ---------------- modal helpers ---------------- */
function openModal(html) {
  $('#modalBody').onclick = null;
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
  const f = $('#modalBody').querySelector('[autofocus], input, select, button');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
  if (modalResolve) { modalResolve(null); modalResolve = null; }
  if ($('#view-pos').classList.contains('active')) $('#scan').focus();
}
let modalResolve = null;

/** generic form dialog. fields: [{name,label,type,value,step,options}] → Promise<object|null> */
function ask(title, fields, okText = 'אישור') {
  return new Promise(resolve => {
    const html = `<h3>${esc(title)}</h3><form class="form" id="askForm">
      ${fields.map((f, i) => {
        if (f.type === 'select') {
          return `<label>${esc(f.label)}<select name="${f.name}">${f.options.map(([v, l]) =>
            `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        }
        return `<label>${esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''}
          ${f.list ? `list="${f.list}"` : ''} value="${esc(f.value ?? '')}" ${i === 0 ? 'autofocus' : ''} ${f.required ? 'required' : ''}></label>`;
      }).join('')}
      <div class="actions"><button class="btn primary" type="submit">${esc(okText)}</button>
      <button class="btn secondary" type="button" data-cancel>ביטול</button></div></form>`;
    openModal(html);
    modalResolve = resolve;
    const form = $('#askForm');
    const first = form.querySelector('input'); if (first) { first.focus(); first.select?.(); }
    form.querySelector('[data-cancel]').onclick = closeModal;
    form.onsubmit = e => {
      e.preventDefault();
      const out = Object.fromEntries(new FormData(form).entries());
      modalResolve = null; closeModal(); resolve(out);
    };
  });
}

async function requireManager(reason) {
  const pin = db.settings.managerPin;
  if (!pin) return true;
  const r = await ask('נדרש אישור מנהל – ' + reason, [{ name: 'pin', label: 'קוד מנהל', type: 'password' }]);
  if (!r) return false;
  if (r.pin === pin) return true;
  beep(false); toast('קוד מנהל שגוי', true); return false;
}

/* ---------------- calculations ---------------- */
function lineTotal(it) {
  const gross = it.price * it.qty;
  const d = it.discount || 0; // percent
  return r2(gross - gross * d / 100);
}

function calcTotals(c = cart) {
  const vat = Number(db.settings.vat) / 100;
  const sign = c.refund ? -1 : 1;
  const subtotal = r2(c.items.reduce((s, it) => s + lineTotal(it), 0));
  let disc = c.discount.type === 'pct' ? subtotal * c.discount.value / 100 : Number(c.discount.value);
  disc = r2(Math.min(Math.max(disc, 0), subtotal));
  const afterDisc = r2(subtotal - disc);
  let net, vatAmt, total;
  if (db.settings.pricesIncludeVat) {
    total = afterDisc; net = r2(total / (1 + vat)); vatAmt = r2(total - net);
  } else {
    net = afterDisc; vatAmt = r2(net * vat); total = r2(net + vatAmt);
  }
  const itemsDiscount = r2(c.items.reduce((s, it) => s + (it.price * it.qty - lineTotal(it)), 0));
  return {
    subtotal: sign * subtotal, discount: sign * disc, itemsDiscount: sign * itemsDiscount,
    net: sign * net, vat: sign * vatAmt, total: sign * total,
  };
}

/* ---------------- catalog ---------------- */
function categories() {
  return ['הכל', ...new Set(db.products.map(p => p.category).filter(Boolean))];
}

function renderCategories() {
  $('#categories').innerHTML = categories().map(c =>
    `<button class="cat ${c === activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}

function renderGrid() {
  const q = $('#scan').value.trim().toLowerCase().replace(/^\d+\*/, '');
  const low = Number(db.settings.lowStock);
  const list = db.products.filter(p =>
    (activeCategory === 'הכל' || p.category === activeCategory) &&
    (!q || p.name.toLowerCase().includes(q) || String(p.sku).includes(q) || String(p.barcode).includes(q)));
  $('#productGrid').innerHTML = list.length ? list.map(p => `
    <div class="product ${p.stock <= low ? 'low' : ''}" data-id="${p.id}">
      <div class="name">${esc(p.name)}</div>
      <div class="meta">מק״ט ${esc(p.sku)} · מלאי ${p.stock}</div>
      <div class="price">${money(p.price)}</div>
    </div>`).join('') : '<div class="empty">לא נמצאו מוצרים</div>';
}

function findByCode(code) {
  return db.products.find(p => String(p.barcode) === code || String(p.sku) === code);
}

function addToCart(p, qty = 1) {
  const existing = cart.items.find(it => it.productId === p.id && !it.discount && it.price === p.price);
  if (existing) existing.qty = r2(existing.qty + qty);
  else cart.items.push({ key: uid(), productId: p.id, sku: p.sku, name: p.name, price: p.price, cost: p.cost || 0, qty, discount: 0 });
  if (!cart.refund && p.stock !== undefined && p.stock - qty < 0) toast(`שים לב: אין מספיק מלאי עבור "${p.name}"`, true);
  beep(true);
  renderCart();
}

function handleScan() {
  const input = $('#scan');
  let val = input.value.trim();
  if (!val) return;
  let qty = 1;
  const m = val.match(/^(\d+(?:\.\d+)?)\*(.+)$/);
  if (m) { qty = Number(m[1]); val = m[2].trim(); }
  const p = findByCode(val);
  if (p) { addToCart(p, qty); input.value = ''; renderGrid(); return; }
  // single search result → add it
  const q = val.toLowerCase();
  const hits = db.products.filter(x => x.name.toLowerCase().includes(q));
  if (hits.length === 1) { addToCart(hits[0], qty); input.value = ''; renderGrid(); return; }
  beep(false);
  toast(hits.length ? 'נמצאו מספר מוצרים – בחר מהרשימה' : 'מוצר לא נמצא: ' + val, !hits.length);
}

/* ---------------- cart ---------------- */
function renderCart() {
  const box = $('#cartItems');
  if (!cart.items.length) box.innerHTML = '<div class="empty">העגלה ריקה – סרוק או בחר מוצר</div>';
  else box.innerHTML = cart.items.map(it => `
    <div class="line" data-key="${it.key}">
      <div>
        <div class="title">${esc(it.name)}</div>
        <div class="sub">${money(it.price)} ליח׳${it.discount ? ` · <span class="disc">הנחה ${it.discount}%</span>` : ''}</div>
      </div>
      <div class="qty">
        <button data-act="inc">+</button>
        <input data-act="qty" type="number" step="any" min="0" value="${it.qty}">
        <button data-act="dec">−</button>
      </div>
      <div class="amount">${money(lineTotal(it) * (cart.refund ? -1 : 1))}</div>
      <div class="tools">
        <button class="link" data-act="price">שנה מחיר</button>
        <button class="link" data-act="disc">הנחת שורה</button>
        <button class="link" data-act="del" style="color:var(--danger)">הסר</button>
      </div>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;

  const t = calcTotals();
  $('#tSubtotal').textContent = money(t.subtotal);
  $('#tDiscount').textContent = money(-t.discount);
  $('#tNet').textContent = money(t.net);
  $('#tVat').textContent = money(t.vat);
  $('#tTotal').textContent = money(t.total);
  $('#vatLbl').textContent = db.settings.vat;
  $('.cart').classList.toggle('refund', cart.refund);
  $('#refundToggle').classList.toggle('active', cart.refund);
  $('#payBtn').textContent = cart.refund ? 'בצע החזרה' : 'תשלום';
  $('#heldCount').textContent = db.held.length;
}

async function cartLineAction(key, act, el) {
  const it = cart.items.find(i => i.key === key);
  if (!it) return;
  if (act === 'inc') it.qty = r2(it.qty + 1);
  else if (act === 'dec') it.qty = r2(it.qty - 1);
  else if (act === 'qty') it.qty = Number(el.value) || 0;
  else if (act === 'del') it.qty = 0;
  else if (act === 'price') {
    const r = await ask('שינוי מחיר – ' + it.name, [{ name: 'price', label: 'מחיר ליחידה', type: 'number', step: '0.01', value: it.price }]);
    if (!r) return;
    const np = Number(r.price);
    if (np < it.price && it.price > 0 && (1 - np / it.price) * 100 > db.settings.maxDiscount && !(await requireManager('הורדת מחיר'))) return;
    it.price = r2(np);
  } else if (act === 'disc') {
    const r = await ask('הנחת שורה – ' + it.name, [{ name: 'd', label: 'אחוז הנחה', type: 'number', step: '0.1', value: it.discount }]);
    if (!r) return;
    const d = Math.min(Math.max(Number(r.d) || 0, 0), 100);
    if (d > db.settings.maxDiscount && !(await requireManager('הנחה גבוהה'))) return;
    it.discount = d;
  }
  if (it.qty <= 0) cart.items = cart.items.filter(i => i !== it);
  renderCart();
}

async function cartDiscount() {
  const r = await ask('הנחה על כל העסקה', [
    { name: 'type', label: 'סוג', type: 'select', value: cart.discount.type, options: [['pct', 'אחוזים (%)'], ['amt', 'סכום (₪)']] },
    { name: 'value', label: 'ערך', type: 'number', step: '0.01', value: cart.discount.value },
  ]);
  if (!r) return;
  const value = Math.max(Number(r.value) || 0, 0);
  const sub = Math.abs(calcTotals().subtotal);
  const pct = r.type === 'pct' ? value : (sub ? value / sub * 100 : 0);
  if (pct > db.settings.maxDiscount && !(await requireManager('הנחה גבוהה'))) return;
  cart.discount = { type: r.type, value };
  renderCart();
}

async function manualItem() {
  const r = await ask('פריט כללי', [
    { name: 'name', label: 'תיאור', value: 'פריט כללי' },
    { name: 'price', label: 'מחיר', type: 'number', step: '0.01', required: true },
    { name: 'qty', label: 'כמות', type: 'number', step: 'any', value: 1 },
  ]);
  if (!r || !Number(r.price)) return;
  cart.items.push({ key: uid(), productId: null, sku: '-', name: r.name || 'פריט כללי', price: r2(Number(r.price)), cost: 0, qty: Number(r.qty) || 1, discount: 0 });
  beep(); renderCart();
}

function holdCart() {
  if (!cart.items.length) return toast('אין עסקה להשהייה', true);
  db.held.push({ ...cart, customer: getCustomer(), heldAt: Date.now() });
  save(); resetCart(); toast('העסקה הושהתה');
}

function showHeld() {
  if (!db.held.length) return toast('אין עסקאות מושהות');
  openModal(`<h3>עסקאות מושהות</h3><table class="table"><thead><tr><th>שעה</th><th>לקוח</th><th>פריטים</th><th>סכום</th><th></th></tr></thead><tbody>
    ${db.held.map((h, i) => `<tr><td>${fmtDate(h.heldAt)}</td><td>${esc(h.customer?.name || '-')}</td><td>${h.items.length}</td>
      <td>${money(calcTotals(h).total)}</td><td><button class="btn small primary" data-resume="${i}">שחזר</button>
      <button class="btn small danger" data-drop="${i}">מחק</button></td></tr>`).join('')}
    </tbody></table>`);
  $('#modalBody').onclick = e => {
    const res = e.target.dataset.resume, drop = e.target.dataset.drop;
    if (res !== undefined) {
      if (cart.items.length) return toast('יש להשלים או להשהות את העסקה הנוכחית קודם', true);
      const h = db.held.splice(Number(res), 1)[0];
      cart = { items: h.items, discount: h.discount, refund: h.refund };
      $('#customerName').value = h.customer?.name || ''; $('#customerPhone').value = h.customer?.phone || '';
      save(); closeModal(); renderCart();
    } else if (drop !== undefined) {
      db.held.splice(Number(drop), 1); save(); closeModal(); showHeld(); renderCart();
    }
  };
}

function getCustomer() {
  return { name: $('#customerName').value.trim(), phone: $('#customerPhone').value.trim() };
}

function resetCart() {
  cart = newCart();
  $('#customerName').value = ''; $('#customerPhone').value = '';
  renderCart(); renderGrid();
}

async function toggleRefund() {
  if (!cart.refund && !(await requireManager('מצב החזרה'))) return;
  cart.refund = !cart.refund;
  renderCart();
  toast(cart.refund ? 'מצב החזרה פעיל – הפריטים יוחזרו למלאי' : 'מצב מכירה רגיל');
}

/* ---------------- payment ---------------- */
function openPayment() {
  if (!cart.items.length) return toast('העגלה ריקה', true);
  const t = calcTotals();
  const due = Math.abs(t.total);
  const payments = [];
  let method = 'cash';

  const paid = () => r2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = () => r2(due - paid());

  function draw() {
    const rem = remaining();
    const quick = [...new Set([rem, Math.ceil(rem / 10) * 10, Math.ceil(rem / 50) * 50, Math.ceil(rem / 100) * 100, 200])].filter(v => v >= rem && v > 0).slice(0, 5);
    $('#modalBody').innerHTML = `
      <h3>${cart.refund ? 'החזרה ללקוח' : 'תשלום'}</h3>
      <div class="pay-summary">
        <div>סה״כ ${cart.refund ? 'להחזר' : 'לתשלום'}: <span class="big">${money(due)}</span></div>
        <div>שולם: ${money(paid())} · נותר: <b>${money(Math.max(rem, 0))}</b></div>
        ${rem < 0 ? `<div class="change">עודף ללקוח: ${money(-rem)}</div>` : ''}
      </div>
      ${payments.length ? `<div class="payments-list">${payments.map((p, i) => `${PAY_METHODS[p.method]}: ${money(p.amount)}${p.ref ? ` (${esc(p.ref)})` : ''} <button class="link" data-rm="${i}">✕</button>`).join('<br>')}</div>` : ''}
      ${rem > 0 ? `
      <div class="pay-methods">${Object.entries(PAY_METHODS).map(([k, l]) => `<button class="btn ${k === method ? 'primary' : 'secondary'}" data-m="${k}">${l}</button>`).join('')}</div>
      <form class="form" id="payForm">
        <label>סכום<input id="payAmt" type="number" step="0.01" min="0" value="${rem.toFixed(2)}"></label>
        ${method === 'cash' && !cart.refund ? `<div class="cash-quick">${quick.map(v => `<button type="button" class="btn small secondary" data-q="${v}">${money(v)}</button>`).join('')}</div>` : ''}
        ${method !== 'cash' ? `<label>אסמכתא / 4 ספרות אחרונות / מס׳ צ׳ק<input id="payRef"></label>` : ''}
        ${method === 'credit' && !cart.refund ? `<label>תשלומים<input id="payInst" type="number" min="1" value="1"></label>` : ''}
        <div class="actions"><button class="btn primary" type="submit">הוסף תשלום</button></div>
      </form>` : `<div class="actions" style="margin-top:12px;display:flex;gap:8px">
        <button class="btn ok big" id="finishBtn">סיים והדפס קבלה</button>
        <button class="btn secondary big" id="finishNoPrint">סיים ללא הדפסה</button></div>`}
    `;
    const amt = $('#payAmt'); if (amt) { amt.focus(); amt.select(); }
    const pf = $('#payForm');
    if (pf) pf.onsubmit = e => {
      e.preventDefault();
      let a = r2(Number(amt.value) || 0);
      if (a <= 0) return;
      if (method !== 'cash' && a > remaining()) a = remaining(); // no change on non-cash
      if (cart.refund && a > remaining()) a = remaining();
      payments.push({ method, amount: a, ref: $('#payRef')?.value || '', installments: Number($('#payInst')?.value) || 1 });
      draw();
    };
    $('#finishBtn') && ($('#finishBtn').onclick = () => finish(true));
    $('#finishNoPrint') && ($('#finishNoPrint').onclick = () => finish(false));
  }

  function finish(print) {
    const change = r2(Math.max(-remaining(), 0));
    const sale = completeSale(payments, change);
    closeModal();
    if (print) printReceipt(sale);
    toast(`עסקה ${sale.number} הושלמה` + (change ? ` · עודף ${money(change)}` : ''));
  }

  openModal('');
  $('#modalBody').onclick = e => {
    const d = e.target.dataset;
    if (d.m) { method = d.m; draw(); }
    else if (d.q) { $('#payAmt').value = d.q; $('#payForm').requestSubmit(); }
    else if (d.rm !== undefined) { payments.splice(Number(d.rm), 1); draw(); }
  };
  draw();
}

function completeSale(payments, change) {
  const t = calcTotals();
  const s = db.settings;
  const sale = {
    id: uid(),
    number: s.nextReceipt++,
    ts: Date.now(),
    cashier: s.cashier,
    customer: getCustomer(),
    type: cart.refund ? 'refund' : 'sale',
    items: cart.items.map(it => ({ ...it, total: r2(lineTotal(it) * (cart.refund ? -1 : 1)) })),
    discount: { ...cart.discount },
    totals: t,
    vatRate: s.vat,
    payments: payments.map(p => ({ ...p, amount: cart.refund ? -p.amount : p.amount })),
    change,
    zClosed: false,
  };
  // stock
  for (const it of cart.items) {
    const p = db.products.find(x => x.id === it.productId);
    if (p) p.stock = r2(p.stock + (cart.refund ? it.qty : -it.qty));
  }
  db.sales.push(sale);
  save();
  resetCart();
  return sale;
}

/* ---------------- receipt ---------------- */
function receiptHTML(sale, copy = false) {
  const s = db.settings;
  const t = sale.totals;
  return `<div class="receipt">
    <div class="c"><b style="font-size:16px">${esc(s.storeName)}</b><br>
      ${s.taxId ? `ע.מ / ח.פ ${esc(s.taxId)}<br>` : ''}${s.address ? esc(s.address) + '<br>' : ''}${s.phone ? 'טל׳ ' + esc(s.phone) : ''}</div>
    <hr>
    <div class="c"><b>${sale.type === 'refund' ? 'קבלה / תעודת זיכוי' : 'קבלה'} מס׳ ${sale.number}</b>${copy ? '<br>** העתק **' : ''}</div>
    <div>${fmtDate(sale.ts)} · ${esc(sale.cashier)}</div>
    ${sale.customer?.name ? `<div>לקוח: ${esc(sale.customer.name)} ${esc(sale.customer.phone || '')}</div>` : ''}
    <hr>
    <table>${sale.items.map(it => `
      <tr><td colspan="2">${esc(it.name)}</td></tr>
      <tr><td>${it.qty} × ${money(it.price)}${it.discount ? ` (-${it.discount}%)` : ''}</td><td class="n">${money(it.total)}</td></tr>`).join('')}
    </table>
    <hr>
    <table>
      <tr><td>סה״כ</td><td class="n">${money(t.subtotal)}</td></tr>
      ${t.discount ? `<tr><td>הנחה</td><td class="n">${money(-t.discount)}</td></tr>` : ''}
      <tr><td>לפני מע״מ</td><td class="n">${money(t.net)}</td></tr>
      <tr><td>מע״מ ${sale.vatRate}%</td><td class="n">${money(t.vat)}</td></tr>
      <tr class="tot"><td>סה״כ לתשלום</td><td class="n">${money(t.total)}</td></tr>
    </table>
    <hr>
    <table>${sale.payments.map(p => `<tr><td>${PAY_METHODS[p.method]}${p.installments > 1 ? ` (${p.installments} תש׳)` : ''}${p.ref ? ' ' + esc(p.ref) : ''}</td><td class="n">${money(p.amount)}</td></tr>`).join('')}
      ${sale.change ? `<tr><td>עודף</td><td class="n">${money(sale.change)}</td></tr>` : ''}
    </table>
    <hr>
    <div class="c">${esc(s.footer)}</div>
  </div>`;
}

function printHTML(html) {
  $('#printArea').innerHTML = html;
  setTimeout(() => { window.print(); }, 50);
}
function printReceipt(sale, copy = false) { printHTML(receiptHTML(sale, copy)); }

/* ---------------- products view ---------------- */
function renderProducts() {
  const q = $('#prodFilter').value.trim().toLowerCase();
  const low = Number(db.settings.lowStock);
  $('#productsTable').innerHTML = db.products
    .filter(p => !q || [p.name, p.sku, p.barcode, p.category].join(' ').toLowerCase().includes(q))
    .map(p => `<tr class="${p.stock <= low ? 'low' : ''}">
      <td>${esc(p.sku)}</td><td>${esc(p.barcode)}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td>
      <td>${money(p.price)}</td><td>${money(p.cost || 0)}</td><td class="stock">${p.stock}</td>
      <td><button class="btn small secondary" data-edit="${p.id}">עריכה</button>
        <button class="btn small secondary" data-stock="${p.id}">קליטת מלאי</button>
        <button class="btn small danger" data-del="${p.id}">מחק</button></td></tr>`).join('');
}

async function editProduct(id) {
  const p = id ? db.products.find(x => x.id === id) : { sku: '', barcode: '', name: '', category: '', price: '', cost: '', stock: 0 };
  const dl = `<datalist id="catList">${categories().slice(1).map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
  const prom = ask(id ? 'עריכת מוצר' : 'מוצר חדש', [
    { name: 'name', label: 'שם המוצר', value: p.name, required: true },
    { name: 'sku', label: 'מק״ט', value: p.sku },
    { name: 'barcode', label: 'ברקוד', value: p.barcode },
    { name: 'category', label: 'קטגוריה', value: p.category, list: 'catList' },
    { name: 'price', label: 'מחיר מכירה', type: 'number', step: '0.01', value: p.price, required: true },
    { name: 'cost', label: 'מחיר עלות', type: 'number', step: '0.01', value: p.cost },
    { name: 'stock', label: 'מלאי', type: 'number', step: 'any', value: p.stock },
  ], 'שמור');
  $('#askForm').insertAdjacentHTML('beforeend', dl);
  const r = await prom;
  if (!r) return;
  const dup = db.products.find(x => x.id !== id && r.barcode && String(x.barcode) === r.barcode);
  if (dup) return toast(`הברקוד כבר קיים במוצר "${dup.name}"`, true);
  const data = { name: r.name, sku: r.sku, barcode: r.barcode, category: r.category, price: r2(Number(r.price) || 0), cost: r2(Number(r.cost) || 0), stock: Number(r.stock) || 0 };
  if (id) Object.assign(p, data); else db.products.push({ id: uid(), ...data });
  save(); renderProducts(); renderCategories(); renderGrid();
  toast('המוצר נשמר');
}

async function receiveStock(id) {
  const p = db.products.find(x => x.id === id);
  const r = await ask('קליטת מלאי – ' + p.name, [{ name: 'q', label: `כמות להוספה (מלאי נוכחי: ${p.stock})`, type: 'number', step: 'any' }]);
  if (!r) return;
  p.stock = r2(p.stock + (Number(r.q) || 0));
  save(); renderProducts(); renderGrid();
}

/* ---------------- CSV ---------------- */
function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function download(name, content, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportProducts() {
  download('products.csv', toCSV([['sku', 'barcode', 'name', 'category', 'price', 'cost', 'stock'],
    ...db.products.map(p => [p.sku, p.barcode, p.name, p.category, p.price, p.cost, p.stock])]));
}
function importProducts(file) {
  const fr = new FileReader();
  fr.onload = () => {
    const rows = parseCSV(fr.result);
    const head = rows.shift().map(h => h.trim().toLowerCase());
    const idx = k => head.indexOf(k);
    if (idx('name') < 0 || idx('price') < 0) return toast('קובץ CSV חייב לכלול עמודות name ו-price', true);
    let added = 0, updated = 0;
    for (const r of rows) {
      const get = k => idx(k) >= 0 ? r[idx(k)]?.trim() : '';
      const data = { sku: get('sku'), barcode: get('barcode'), name: get('name'), category: get('category'),
        price: r2(Number(get('price')) || 0), cost: r2(Number(get('cost')) || 0), stock: Number(get('stock')) || 0 };
      const ex = db.products.find(p => (data.barcode && p.barcode === data.barcode) || (data.sku && p.sku === data.sku));
      if (ex) { Object.assign(ex, data); updated++; } else { db.products.push({ id: uid(), ...data }); added++; }
    }
    save(); renderProducts(); renderCategories(); renderGrid();
    toast(`יובאו ${added} מוצרים חדשים, עודכנו ${updated}`);
  };
  fr.readAsText(file, 'utf-8');
}

/* ---------------- sales view ---------------- */
function payLabel(sale) {
  return [...new Set(sale.payments.map(p => PAY_METHODS[p.method]))].join(' + ');
}
function renderSales() {
  const day = $('#salesDate').value;
  const q = $('#salesFilter').value.trim().toLowerCase();
  const list = db.sales.filter(s => (!day || dayKey(s.ts) === day) &&
    (!q || String(s.number).includes(q) || (s.customer?.name || '').toLowerCase().includes(q) || (s.customer?.phone || '').includes(q)))
    .slice().reverse();
  $('#salesTable').innerHTML = list.length ? list.map(s => `<tr class="${s.type === 'refund' ? 'refund' : ''}">
    <td>${s.number}${s.type === 'refund' ? ' (החזרה)' : ''}</td><td>${fmtDate(s.ts)}</td><td>${esc(s.cashier)}</td>
    <td>${esc(s.customer?.name || '-')}</td><td>${s.items.reduce((a, i) => a + i.qty, 0)}</td>
    <td>${payLabel(s)}</td><td><b>${money(s.totals.total)}</b></td>
    <td><button class="btn small secondary" data-view-sale="${s.id}">הצג</button>
      <button class="btn small secondary" data-print="${s.id}">הדפס העתק</button>
      ${s.type === 'sale' ? `<button class="btn small secondary" data-return="${s.id}">החזרה</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="8" class="empty">אין מכירות</td></tr>';
}

async function returnFromSale(id) {
  const s = db.sales.find(x => x.id === id);
  if (cart.items.length) return toast('יש לסיים את העסקה הנוכחית בקופה קודם', true);
  if (!(await requireManager('החזרה'))) return;
  cart = newCart();
  cart.refund = true;
  cart.items = s.items.map(it => ({ ...it, key: uid(), total: undefined }));
  cart.discount = { ...s.discount };
  $('#customerName').value = s.customer?.name || ''; $('#customerPhone').value = s.customer?.phone || '';
  switchView('pos'); renderCart();
  toast(`החזרה מקבלה ${s.number} – הסר פריטים שאינם מוחזרים ובצע החזרה`);
}

function exportSales() {
  const rows = [['receipt', 'date', 'type', 'cashier', 'customer', 'phone', 'sku', 'item', 'qty', 'price', 'line_discount_pct', 'line_total', 'sale_total', 'vat', 'payment']];
  for (const s of db.sales) for (const it of s.items)
    rows.push([s.number, new Date(s.ts).toISOString(), s.type, s.cashier, s.customer?.name, s.customer?.phone, it.sku, it.name, it.qty, it.price, it.discount, it.total, s.totals.total, s.totals.vat, payLabel(s)]);
  download('sales.csv', toCSV(rows));
}

/* ---------------- reports ---------------- */
function summarize(sales) {
  const out = { count: 0, refunds: 0, gross: 0, net: 0, vat: 0, discount: 0, cost: 0, byMethod: {}, byCat: {}, byItem: {}, byCashier: {}, change: 0, first: null, last: null };
  for (const s of sales) {
    s.type === 'refund' ? out.refunds++ : out.count++;
    out.gross += s.totals.total; out.net += s.totals.net; out.vat += s.totals.vat;
    out.discount += (s.totals.discount || 0) + (s.totals.itemsDiscount || 0);
    for (const p of s.payments) out.byMethod[p.method] = (out.byMethod[p.method] || 0) + p.amount;
    out.change += s.change || 0;
    out.byCashier[s.cashier] = (out.byCashier[s.cashier] || 0) + s.totals.total;
    const sign = s.type === 'refund' ? -1 : 1;
    for (const it of s.items) {
      const prod = db.products.find(p => p.id === it.productId);
      const cat = prod?.category || 'כללי';
      out.byCat[cat] = (out.byCat[cat] || 0) + it.total;
      const k = it.name;
      out.byItem[k] ||= { qty: 0, total: 0 };
      out.byItem[k].qty += sign * it.qty; out.byItem[k].total += it.total;
      out.cost += sign * (it.cost || 0) * it.qty;
    }
    out.first = out.first === null ? s.number : Math.min(out.first, s.number);
    out.last = out.last === null ? s.number : Math.max(out.last, s.number);
  }
  // cash in drawer = cash payments minus change given
  out.cashDrawer = (out.byMethod.cash || 0) - out.change;
  return out;
}

function reportHTML(title, sales, extra = '') {
  const r = summarize(sales);
  const rows = (obj, labelFn = k => k) => Object.entries(obj).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(labelFn(k))}</td><td>${money(r2(v))}</td></tr>`).join('') || '<tr><td colspan="2">-</td></tr>';
  const top = Object.entries(r.byItem).sort((a, b) => b[1].total - a[1].total).slice(0, 15);
  const netExVat = r2(r.net);
  return `<h2>${esc(title)}</h2>${extra}
    <div class="kpis">
      <div class="kpi"><div class="v">${money(r2(r.gross))}</div><div class="l">מחזור כולל מע״מ</div></div>
      <div class="kpi"><div class="v">${money(netExVat)}</div><div class="l">מחזור לפני מע״מ</div></div>
      <div class="kpi"><div class="v">${money(r2(r.vat))}</div><div class="l">מע״מ</div></div>
      <div class="kpi"><div class="v">${r.count}</div><div class="l">עסקאות מכירה</div></div>
      <div class="kpi"><div class="v">${r.refunds}</div><div class="l">החזרות</div></div>
      <div class="kpi"><div class="v">${money(r.count ? r2(r.gross / r.count) : 0)}</div><div class="l">ממוצע לעסקה</div></div>
      <div class="kpi"><div class="v">${money(r2(r.discount))}</div><div class="l">סה״כ הנחות</div></div>
      <div class="kpi"><div class="v">${money(r2(netExVat - r.cost))}</div><div class="l">רווח גולמי משוער</div></div>
      <div class="kpi"><div class="v">${money(r2(r.cashDrawer))}</div><div class="l">מזומן צפוי במגירה</div></div>
    </div>
    ${r.first !== null ? `<div>קבלות ${r.first} – ${r.last}</div>` : ''}
    <h3>לפי אמצעי תשלום</h3><table class="table">${rows(r.byMethod, k => PAY_METHODS[k] || k)}</table>
    <h3>לפי קטגוריה</h3><table class="table">${rows(r.byCat)}</table>
    <h3>לפי קופאי</h3><table class="table">${rows(r.byCashier)}</table>
    <h3>מוצרים מובילים</h3><table class="table"><thead><tr><th>מוצר</th><th>כמות</th><th>סכום</th></tr></thead>
      ${top.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${r2(v.qty)}</td><td>${money(r2(v.total))}</td></tr>`).join('') || '<tr><td colspan="3">-</td></tr>'}</table>
    ${lowStockHTML()}
    <div class="toolbar" style="margin-top:14px"><button class="btn secondary" onclick="printHTML(document.getElementById('reportOut').innerHTML)">הדפס דוח</button></div>`;
}

function lowStockHTML() {
  const low = db.products.filter(p => p.stock <= Number(db.settings.lowStock));
  if (!low.length) return '';
  return `<h3>מלאי נמוך</h3><table class="table">${low.map(p => `<tr><td>${esc(p.name)}</td><td>${p.stock}</td></tr>`).join('')}</table>`;
}

function runReport() {
  const from = $('#repFrom').value, to = $('#repTo').value;
  const sales = db.sales.filter(s => { const d = dayKey(s.ts); return (!from || d >= from) && (!to || d <= to); });
  $('#reportOut').innerHTML = reportHTML(`דוח מכירות ${from || 'מההתחלה'} – ${to || 'היום'}`, sales);
}
function xReport() {
  const sales = db.sales.filter(s => !s.zClosed);
  $('#reportOut').innerHTML = reportHTML(`דוח X – ביניים (מאז דוח Z אחרון)`, sales, `<div>הופק: ${fmtDate(Date.now())}</div>`);
}
async function zReport() {
  const sales = db.sales.filter(s => !s.zClosed);
  if (!sales.length) return toast('אין עסקאות פתוחות לסגירה', true);
  if (!(await requireManager('דוח Z'))) return;
  const r = await ask('סגירת יום – ספירת קופה', [{ name: 'counted', label: `מזומן שנספר במגירה (צפוי: ${money(r2(summarize(sales).cashDrawer))})`, type: 'number', step: '0.01' }], 'הפק דוח Z וסגור יום');
  if (!r) return;
  const sum = summarize(sales);
  const counted = Number(r.counted) || 0;
  const diff = r2(counted - sum.cashDrawer);
  const z = { number: db.settings.nextZ++, ts: Date.now(), from: sum.first, to: sum.last, gross: r2(sum.gross), vat: r2(sum.vat), counted, diff };
  db.zReports.push(z);
  sales.forEach(s => { s.zClosed = true; s.z = z.number; });
  save();
  $('#reportOut').innerHTML = reportHTML(`דוח Z מס׳ ${z.number}`, sales,
    `<div>הופק: ${fmtDate(z.ts)} · מזומן שנספר: ${money(counted)} · הפרש: <b style="color:${diff ? 'var(--danger)' : 'var(--ok)'}">${money(diff)}</b></div>`);
  toast(`דוח Z מס׳ ${z.number} הופק`);
}

/* ---------------- settings ---------------- */
function fillSettings() {
  const f = $('#settingsForm');
  for (const [k, v] of Object.entries(db.settings)) {
    const el = f.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
}
function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const el = f.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') db.settings[k] = el.checked;
    else if (el.type === 'number') db.settings[k] = Number(el.value);
    else db.settings[k] = el.value;
  }
  save(); applyHeader(); renderCart(); toast('ההגדרות נשמרו');
}
function applyHeader() {
  $('#storeNameLbl').textContent = db.settings.storeName;
  $('#cashierLbl').textContent = '👤 ' + db.settings.cashier;
}

/* ---------------- navigation ---------------- */
function switchView(v) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  if (v === 'products') renderProducts();
  if (v === 'sales') renderSales();
  if (v === 'settings') fillSettings();
  if (v === 'reports' && !$('#reportOut').innerHTML) xReport();
  if (v === 'pos') { renderGrid(); renderCategories(); setTimeout(() => $('#scan').focus(), 0); }
}

/* ---------------- wiring ---------------- */
function init() {
  applyHeader();
  renderCategories(); renderGrid(); renderCart();
  const today = dayKey(Date.now());
  $('#salesDate').value = today; $('#repFrom').value = today; $('#repTo').value = today;

  const tick = () => { $('#clock').textContent = new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' }); };
  tick(); setInterval(tick, 1000);

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

  // POS
  $('#scan').addEventListener('input', renderGrid);
  $('#scan').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } });
  $('#categories').onclick = e => { const c = e.target.dataset.cat; if (c) { activeCategory = c; renderCategories(); renderGrid(); } };
  $('#productGrid').onclick = e => {
    const el = e.target.closest('.product'); if (!el) return;
    addToCart(db.products.find(p => p.id === el.dataset.id));
  };
  $('#cartItems').addEventListener('click', e => {
    const act = e.target.dataset.act; if (!act || act === 'qty') return;
    cartLineAction(e.target.closest('.line').dataset.key, act, e.target);
  });
  $('#cartItems').addEventListener('change', e => {
    if (e.target.dataset.act === 'qty') cartLineAction(e.target.closest('.line').dataset.key, 'qty', e.target);
  });
  $('#cartDiscountBtn').onclick = cartDiscount;
  $('#manualItemBtn').onclick = manualItem;
  $('#holdBtn').onclick = holdCart;
  $('#heldBtn').onclick = showHeld;
  $('#clearBtn').onclick = () => { if (cart.items.length && confirm('לבטל את העסקה הנוכחית?')) resetCart(); };
  $('#refundToggle').onclick = toggleRefund;
  $('#payBtn').onclick = openPayment;

  // products
  $('#prodFilter').oninput = renderProducts;
  $('#addProductBtn').onclick = () => editProduct(null);
  $('#exportProductsBtn').onclick = exportProducts;
  $('#importProducts').onchange = e => { if (e.target.files[0]) importProducts(e.target.files[0]); e.target.value = ''; };
  $('#productsTable').onclick = e => {
    const d = e.target.dataset;
    if (d.edit) editProduct(d.edit);
    else if (d.stock) receiveStock(d.stock);
    else if (d.del) {
      const p = db.products.find(x => x.id === d.del);
      if (confirm(`למחוק את "${p.name}"?`)) { db.products = db.products.filter(x => x !== p); save(); renderProducts(); renderCategories(); renderGrid(); }
    }
  };

  // sales
  $('#salesDate').onchange = renderSales;
  $('#salesFilter').oninput = renderSales;
  $('#exportSalesBtn').onclick = exportSales;
  $('#salesTable').onclick = e => {
    const d = e.target.dataset;
    if (d.viewSale) openModal(receiptHTML(db.sales.find(s => s.id === d.viewSale), true));
    else if (d.print) printReceipt(db.sales.find(s => s.id === d.print), true);
    else if (d.return) returnFromSale(d.return);
  };

  // reports
  $('#runReportBtn').onclick = runReport;
  $('#xReportBtn').onclick = xReport;
  $('#zReportBtn').onclick = zReport;

  // settings
  $('#settingsForm').onsubmit = saveSettings;
  $('#backupBtn').onclick = () => download(`pos-backup-${dayKey(Date.now())}.json`, JSON.stringify(db, null, 1), 'application/json');
  $('#restoreFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d.products || !d.sales) throw new Error('קובץ לא תקין');
        if (!confirm('השחזור יחליף את כל הנתונים הנוכחיים. להמשיך?')) return;
        localStorage.setItem(LS_KEY, JSON.stringify(d)); db = load();
        applyHeader(); fillSettings(); resetCart(); renderCategories(); toast('הנתונים שוחזרו');
      } catch (err) { toast('שגיאה: ' + err.message, true); }
    };
    fr.readAsText(f); e.target.value = '';
  };
  $('#resetBtn').onclick = async () => {
    if (!confirm('למחוק את כל הנתונים (מוצרים, מכירות, הגדרות)? פעולה זו אינה הפיכה.')) return;
    if (!(await requireManager('איפוס נתונים'))) return;
    localStorage.removeItem(LS_KEY); db = load();
    applyHeader(); fillSettings(); resetCart(); renderCategories(); toast('הנתונים אופסו');
  };

  // keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal();
    if (!$('#view-pos').classList.contains('active') || !$('#modal').classList.contains('hidden')) return;
    if (e.key === 'F9' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); openPayment(); }
    if (e.key === 'F2') { e.preventDefault(); $('#scan').focus(); }
    if (e.key === 'F4') { e.preventDefault(); cartDiscount(); }
    if (e.key === 'F6') { e.preventDefault(); holdCart(); }
  });
}

init();
