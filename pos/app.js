'use strict';
/* ============================================================
   קופה רושמת – אפליקציית POS מקומית (ללא שרת)
   כל הנתונים נשמרים ב-localStorage של הדפדפן.
   ============================================================ */

const PAY_METHODS = {
  cash: 'מזומן', credit: 'אשראי', check: 'צ׳ק', bit: 'ביט / העברה', voucher: 'שובר / זיכוי'
};
// recorded automatically for orders paid in the VR store; not offered at the register
const ONLINE_METHODS = { paypal: 'PayPal (חנות VR)' };
const payName = m => PAY_METHODS[m] || ONLINE_METHODS[m] || m;

const DEFAULT_SETTINGS = {
  ...BRAND_DEFAULTS,
  taxId: '',
  address: '',
  phone: '',
  footer: 'תודה! שמרו את הקבלה לצורך אחריות',
  vat: 18,
  pricesIncludeVat: true,
  cashier: 'קופאי 1',
  nextReceipt: 1,
  nextZ: 1,
  lowStock: 3,
  managerPin: '',
  maxDiscount: 15,
  thanksSeconds: 8,
  slideSeconds: 7,
  theme: 'dark',
  autoLockMin: 10,
  nextRepair: 1001,
  repairWarranty: 3,
  repairTerms: 'המעבדה אינה אחראית למידע שבמכשיר – מומלץ לגבות לפני המסירה. מכשיר שלא נאסף תוך 90 יום מהודעת המוכנות יימסר לפי דין.',
};

// sku, barcode, name, category, price, cost, stock, extra: serial = requires IMEI / serial number,
// warranty = months, vrId = the matching product in the 3D VR store (prices and stock flow there)
const SAMPLE_PRODUCTS = [
  ['P100', '7290011000017', 'נובה X Pro 256GB', 'סמארטפונים', 4290, 3350, 6, { serial: true, warranty: 24, vrId: 'nova-x-pro' }],
  ['P101', '7290011000024', 'נובה X 128GB', 'סמארטפונים', 3290, 2550, 8, { serial: true, warranty: 24, vrId: 'nova-x' }],
  ['P102', '7290011000031', 'נובה A5 128GB', 'סמארטפונים', 1490, 1090, 12, { serial: true, warranty: 24, vrId: 'nova-a5' }],
  ['T200', '7290011000048', 'נובה Tab 11', 'טאבלטים ושעונים', 2190, 1650, 4, { serial: true, warranty: 24, vrId: 'nova-tab' }],
  ['W201', '7290011000055', 'נובה Watch 3', 'טאבלטים ושעונים', 1190, 820, 5, { serial: true, warranty: 12, vrId: 'nova-watch' }],
  ['A300', '7290011000062', 'אוזניות נובה Buds', 'אודיו', 590, 360, 15, { warranty: 12, vrId: 'nova-buds' }],
  ['A301', '7290011000079', 'רמקול בלוטות׳ רטרו', 'אודיו', 449, 260, 7, { warranty: 12, vrId: 'speaker-retro' }],
  ['C400', '7290011000086', 'מטען מהיר 45W', 'טעינה וכיסויים', 149, 62, 30, { warranty: 12, vrId: 'charger-45' }],
  ['C401', '7290011000093', 'סוללה ניידת 10,000mAh', 'טעינה וכיסויים', 199, 95, 20, { warranty: 12, vrId: 'powerbank' }],
  ['C402', '7290011000109', 'כיסוי סיליקון ל-X Pro', 'טעינה וכיסויים', 99, 28, 40, { vrId: 'case-x-pro' }],
  ['C403', '7290011000116', 'מגן מסך זכוכית', 'טעינה וכיסויים', 59, 9, 60, {}],
  ['L500', '7290011000123', 'מחשב נייד גיימינג 15.6" RTX 4060', 'מחשבים', 6990, 5600, 3, { serial: true, warranty: 24 }],
  ['L501', '7290011000130', 'מחשב נייד 14" לעבודה ולימודים', 'מחשבים', 3290, 2600, 5, { serial: true, warranty: 24 }],
  ['L502', '7290011000147', 'מחשב גיימינג Ryzen 7 / RTX 4070', 'מחשבים', 8490, 6900, 2, { serial: true, warranty: 36 }],
  ['L503', '7290011000154', 'כרטיס מסך RTX 4070 Super', 'מחשבים', 2890, 2350, 3, { serial: true, warranty: 36 }],
  ['L504', '7290011000161', 'כונן SSD NVMe 1TB', 'מחשבים', 349, 240, 14, { serial: true, warranty: 60 }],
  ['G600', '7290011000178', 'PlayStation 5 Slim', 'קונסולות', 2290, 1950, 4, { serial: true, warranty: 12 }],
  ['G601', '7290011000185', 'Xbox Series X', 'קונסולות', 2390, 2020, 3, { serial: true, warranty: 12 }],
  ['G602', '7290011000192', 'Nintendo Switch OLED', 'קונסולות', 1490, 1220, 5, { serial: true, warranty: 12 }],
  ['G603', '7290011000208', 'Meta Quest 3 512GB', 'קונסולות', 2690, 2250, 3, { serial: true, warranty: 12 }],
  ['G700', '7290011000215', 'בקר אלחוטי DualSense', 'אביזרי גיימינג', 299, 210, 12, { warranty: 12 }],
  ['G701', '7290011000222', 'אוזניות גיימינג 7.1', 'אביזרי גיימינג', 399, 220, 10, { warranty: 12 }],
  ['G702', '7290011000239', 'מקלדת מכנית RGB', 'אביזרי גיימינג', 449, 250, 8, { warranty: 24 }],
  ['G703', '7290011000246', 'עכבר גיימינג 26K DPI', 'אביזרי גיימינג', 199, 105, 2, { warranty: 24 }],
  ['G704', '7290011000253', 'מסך גיימינג 27" 165Hz', 'אביזרי גיימינג', 1290, 980, 4, { serial: true, warranty: 36 }],
  ['G705', '7290011000260', 'כרטיס מתנה לחנות משחקים ₪100', 'אביזרי גיימינג', 100, 95, 50, {}],
];
const sampleProducts = () => SAMPLE_PRODUCTS.map(([sku, barcode, name, category, price, cost, stock, extra]) =>
  ({ id: uid(), sku, barcode, name, category, price, cost, stock, serial: false, warranty: 0, vrId: '', ...extra }));


/* claude.ai page: printing, camera, pop-up windows and file downloads are blocked there */
const EMBED = !!window.POS_EMBED;

/* ---------------- state ---------------- */
const freshInstall = (() => { try { return !localStorage.getItem(LS_KEY); } catch { return true; } })();
let db = load();
let cart = newCart();
let currentUser = null; // the employee signed in at this register (see pro.js)
const cashierName = () => currentUser?.name || db.settings.cashier || 'קופה';
const svgIcon = id => `<svg class="ic"><use href="#${id}"/></svg>`;
let activeCategory = 'הכל';

function newCart() {
  return { items: [], discount: { type: 'pct', value: 0 }, refund: false };
}

function normalize(d) {
  d.settings = { ...DEFAULT_SETTINGS, ...d.settings };
  d.products ||= []; d.sales ||= []; d.held ||= []; d.zReports ||= [];
  d.customers ||= []; d.repairs ||= [];
  if (!d.users || !d.users.length) {
    // first run: one manager; an old single manager code becomes this manager's PIN
    const legacy = /^\d{4}$/.test(String(d.settings.managerPin || '')) ? String(d.settings.managerPin) : '1234';
    d.users = [{ id: uid(), name: 'מנהל', pin: legacy, role: 'manager' }];
  }
  d.promotions ||= samplePromotions(d.products);
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error(e); }
  const products = sampleProducts();
  return normalize({
    settings: { ...DEFAULT_SETTINGS },
    products, promotions: samplePromotions(products),
    sales: [], held: [], zReports: [],
  });
}

function samplePromotions(products) {
  const id = sku => products.find(p => p.sku === sku)?.id;
  const base = { active: true, showOnScreen: true, from: '', to: '', image: '', badge: '', description: '' };
  const list = [
    { ...base, name: 'נובה A5 ב־12% הנחה', description: 'הסמארטפון המשתלם שלנו – גם בחנות ה-VR', type: 'pct', scope: 'products', productIds: [id('P102')], pct: 12 },
    { ...base, name: 'מטען + סוללה ניידת ב־₪299', description: 'ערכת טעינה מלאה במחיר מיוחד', type: 'bundle', scope: 'products', productIds: [id('C400'), id('C401')], buyQty: 2, price: 299 },
    { ...base, name: '1+1 על כיסויים ומגני מסך', description: 'השני (הזול מביניהם) עלינו', type: 'xfory', scope: 'products', productIds: [id('C402'), id('C403')], buyQty: 2, payQty: 1 },
    { ...base, name: '10% על אביזרי גיימינג', description: 'בקרים, אוזניות, מקלדות, עכברים ומסכים', type: 'pct', scope: 'category', category: 'אביזרי גיימינג', pct: 10 },
    { ...base, name: 'קנייה מעל ₪3,000 – 5% הנחה', description: 'על כל הקנייה, אוטומטית בקופה', type: 'threshold', scope: 'all', minAmount: 3000, pct: 5 },
    { ...base, name: 'בואו לחנות שלנו ב-VR', description: 'שימו משקף, היכנסו למשאית של נובה ובחרו טלפון בתלת-ממד', type: 'ad', scope: 'all', badge: 'VR' },
  ];
  return list.filter(p => p.scope !== 'products' || p.productIds.every(Boolean)).map(p => ({ id: uid(), ...p }));
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('שגיאה בשמירת נתונים (ייתכן שהתמונות גדולות מדי): ' + e.message, true); return false; }
}
function save() {
  const ok = saveLocal();
  Sync.changed();
  return ok;
}

/* ============================================================
   חיבור לשרת החנות (כשהקופה נפתחת מכתובת השרת, ‎/pos‎):
   הנתונים משותפים לכל הקופות והטלפונים, וחנות ה-VR מחוברת אליהם
   ============================================================ */
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const Sync = {
  mode: 'local',          // local | server | offline | locked
  base: new URL('../api/', location.href).href,
  key: lsGet('pos.key') || '',
  rev: Number(lsGet('pos.rev')) || 0,
  dirty: lsGet('pos.dirty') === '1',
  gen: 0, timer: null, pushing: false, pendingDb: null, started: false,
  vrProducts: [],

  headers() { return { 'Content-Type': 'application/json', 'x-pos-key': this.key }; },
  async call(path, opts = {}) {
    const r = await fetch(this.base + path, { cache: 'no-store', ...opts, headers: this.headers() });
    if (r.status === 401) { this.setMode('locked'); throw new Error('auth'); }
    return r;
  },
  setMode(m) {
    this.mode = m;
    const pill = $('#syncPill');
    if (!pill) return;
    const txt = { local: '💾 שמירה במכשיר', server: '☁ מחובר לשרת', offline: '⚠ אין חיבור – נשמר במכשיר', locked: '🔒 התחבר לשרת' }[m];
    pill.textContent = txt; pill.className = 'sync-pill ' + m;
    pill.hidden = m === 'local';
    $('#tabVr').hidden = m === 'local';
  },
  setDirty(v) { this.dirty = v; lsSet('pos.dirty', v ? '1' : '0'); },

  async start() {
    if (this.started || EMBED || !location.protocol.startsWith('http')) return;
    let ping;
    try {
      const r = await fetch(this.base + 'pos/ping', { cache: 'no-store', headers: this.headers() });
      if (!r.ok) return;
      ping = await r.json();
      if (!ping.server) return;
    } catch { return; } // no store server: the register works on this device only
    this.started = true;
    this.vrProducts = ping.vrProducts || [];
    if (!ping.authorized) { this.setMode('locked'); this.login(); return; }
    this.setMode('server');
    await this.pull(true);
    VR.poll();
    setInterval(() => this.tick(), 8000);
  },

  async login() {
    const r = await ask('חיבור לשרת החנות', [{ name: 'key', label: 'סיסמת קופה (POS_KEY שהוגדרה בשרת)', type: 'password', required: true }], 'התחבר');
    if (!r) { toast('הקופה עובדת במכשיר הזה בלבד. לחץ על "🔒 התחבר לשרת" כדי להתחבר.'); return; }
    this.key = r.key; lsSet('pos.key', r.key);
    try {
      const p = await (await fetch(this.base + 'pos/ping', { cache: 'no-store', headers: this.headers() })).json();
      if (!p.authorized) { toast('סיסמה שגויה', true); return this.login(); }
    } catch { toast('השרת לא זמין כרגע', true); return; }
    this.setMode('server');
    await this.pull(true);
    VR.poll();
    if (!this.interval) this.interval = setInterval(() => this.tick(), 8000);
    toast('הקופה מחוברת לשרת החנות');
  },

  changed() {
    if (this.mode === 'local') return;
    this.gen++;
    this.setDirty(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 1200);
  },

  async pull(first = false) {
    try {
      const r = await this.call('pos/db' + (first ? '' : `?rev=${this.rev}`));
      if (r.status === 204) return;
      const st = await r.json();
      if (this.mode !== 'server') this.setMode('server');
      if (!st.db) return this.push();                         // empty server: upload this register's data
      if (first && freshInstall) return this.adopt(st);       // new device: take the store's data
      if (this.dirty) return this.push();                     // local changes: merge them in
      if (st.rev !== this.rev) this.adopt(st);
    } catch (e) { if (e.message !== 'auth') this.setMode('offline'); }
  },

  async push() {
    if (this.mode === 'local' || this.mode === 'locked' || this.pushing) return;
    this.pushing = true;
    const g = this.gen;
    try {
      const r = await this.call('pos/db', { method: 'PUT', body: JSON.stringify({ db }) });
      if (!r.ok) throw new Error('http ' + r.status);
      const st = await r.json();
      this.setMode('server');
      if (g === this.gen) { this.setDirty(false); this.adopt(st); }
      else { this.rev = st.rev; lsSet('pos.rev', st.rev); this.timer = setTimeout(() => this.push(), 500); }
    } catch (e) { if (e.message !== 'auth') this.setMode('offline'); }
    finally { this.pushing = false; }
  },

  /** replace local data with the server copy (waits while a dialog is open) */
  adopt(st) {
    this.rev = st.rev; lsSet('pos.rev', st.rev);
    if (!$('#modal').classList.contains('hidden')) { this.pendingDb = st.db; return; }
    this.pendingDb = null;
    db = normalize(st.db);
    saveLocal();
    refreshViews();
  },

  tick() {
    if (this.mode === 'locked') return;
    if (this.pendingDb && $('#modal').classList.contains('hidden')) { this.adopt({ rev: this.rev, db: this.pendingDb }); }
    if (this.dirty) this.push(); else this.pull();
    VR.poll();
  },
};

/* ---------------- הזמנות מחנות ה-VR ---------------- */
const VR = {
  orders: [],
  async poll() {
    if (Sync.mode !== 'server') return;
    try {
      const r = await Sync.call('pos/vr-orders');
      if (!r.ok) return;
      this.orders = await r.json();
    } catch { return; }
    for (const o of this.orders.filter(o => o.type === 'paid')) await this.recordPaid(o);
    this.orders = this.orders.filter(o => o.type !== 'paid');
    $('#vrCount').textContent = this.orders.length;
    $('#vrCount').hidden = !this.orders.length;
    if ($('#view-vr').classList.contains('active')) this.render();
  },
  async ack(id, status, receipt) {
    try { await Sync.call(`pos/vr-orders/${encodeURIComponent(id)}/ack`, { method: 'POST', body: JSON.stringify({ status, receipt }) }); } catch { /* retried on next poll */ }
  },
  lines(o) {
    return o.items.map(l => {
      const p = db.products.find(x => x.vrId === l.vrId);
      return { key: uid(), productId: p?.id || null, sku: p?.sku || l.vrId, name: (p?.name || l.name) + (l.variant ? ` (${l.variant})` : ''),
        price: l.price, cost: p?.cost || 0, qty: l.qty, discount: 0, warranty: p?.warranty || 0, noPromo: true };
    });
  },
  /** an order paid with PayPal in the VR store becomes a sale in the register */
  async recordPaid(o) {
    if (db.sales.some(s => s.vrOrderId === o.id)) { await this.ack(o.id, 'done'); return; }
    const s = db.settings, vat = Number(s.vat) / 100;
    const items = this.lines(o).map(it => ({ ...it, total: r2(it.price * it.qty) }));
    if (o.shipping) items.push({ key: uid(), productId: null, sku: 'SHIP', name: 'משלוח', price: o.shipping, cost: 0, qty: 1, discount: 0, total: o.shipping, noPromo: true });
    const total = r2(o.total);
    const net = s.pricesIncludeVat ? r2(total / (1 + vat)) : r2(total / (1 + vat));
    const payer = o.payer?.name ? [o.payer.name.given_name, o.payer.name.surname].filter(Boolean).join(' ') : '';
    const sale = {
      id: uid(), number: s.nextReceipt++, ts: Date.parse(o.time) || Date.now(), cashier: 'חנות VR',
      customer: { name: payer, phone: '' }, type: 'sale', channel: 'vr', vrOrderId: o.id,
      items, discount: { type: 'pct', value: 0 },
      totals: { subtotal: total, discount: 0, itemsDiscount: 0, promo: 0, net, vat: r2(total - net), total },
      promotions: [], vatRate: s.vat,
      payments: [{ method: 'paypal', amount: total, ref: o.captureId || o.paypalOrderId || '', installments: 1 }],
      change: 0, zClosed: false,
    };
    for (const it of items) { const p = db.products.find(x => x.id === it.productId); if (p) p.stock = r2(p.stock - it.qty); }
    db.sales.push(sale);
    save();
    await this.ack(o.id, 'done', sale.number);
    beep(true);
    toast(`🥽 הזמנה חדשה שולמה בחנות ה-VR: ${money(total)} (קבלה ${sale.number})`);
    renderGrid();
  },
  /** "reserve and pay at the register": load the order into the cart */
  load(id) {
    const o = this.orders.find(x => x.id === id);
    if (!o) return;
    if (cart.items.length) return toast('יש לסיים או להשהות את העסקה הנוכחית קודם', true);
    cart = newCart();
    cart.items = this.lines(o);
    cart.vrOrderId = o.id;
    $('#customerName').value = `הזמנת VR ${o.code}`;
    switchView('pos'); renderCart(); openCartSheet(true);
    toast(`הזמנה ${o.code} נטענה לקופה. מוצרים עם מספר סידורי: עדכן IMEI בקבלה לפי האריזה.`);
  },
  async cancel(id) {
    const o = this.orders.find(x => x.id === id);
    if (!o || !(await confirmBox(`לבטל את ההזמנה ${o.code}?`, 'בטל הזמנה'))) return;
    await this.ack(id, 'cancelled');
    this.orders = this.orders.filter(x => x !== o);
    this.render(); $('#vrCount').textContent = this.orders.length; $('#vrCount').hidden = !this.orders.length;
  },
  render() {
    const q = ($('#vrCode').value || '').trim().toUpperCase();
    const list = this.orders.filter(o => !q || (o.code || '').includes(q));
    $('#vrTable').innerHTML = list.length ? list.map(o => `<tr>
      <td><b class="vr-code">${esc(o.code || '')}</b></td><td>${fmtDate(Date.parse(o.time))}</td>
      <td>${o.items.map(l => `${esc(l.name)}${l.variant ? ` (${esc(l.variant)})` : ''} × ${l.qty}`).join('<br>')}</td>
      <td><b>${money(o.total)}</b></td>
      <td class="nowrap"><button class="btn small primary" data-load="${o.id}">טען לקופה</button>
        <button class="btn small danger" data-cancel="${o.id}">בטל</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${q ? 'לא נמצאה הזמנה עם הקוד הזה' : 'אין הזמנות שממתינות לתשלום בקופה'}</td></tr>`;
  },
};

function refreshViews() {
  applyHeader(); renderCategories(); renderGrid(); renderCart();
  const v = document.querySelector('.view.active')?.id;
  if (v === 'view-products') renderProducts();
  if (v === 'view-promos') renderPromotions();
  if (v === 'view-sales') renderSales();
  if (v === 'view-settings') { fillSettings(); renderUsers(); }
  if (v === 'view-repairs') renderRepairs();
  if (v === 'view-customers') renderCustomers();
  updateRepairBadge();
}

/* ---------------- utils ---------------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const fmtDate = ts => new Date(ts).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

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
  if (camStream) stopCamera();
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
  if (modalResolve) { modalResolve(null); modalResolve = null; }
  if ($('#view-pos').classList.contains('active')) { focusScan(); publishDisplay(cart.items.length ? 'cart' : 'idle'); }
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

/** in-page yes/no dialog → Promise<boolean> */
function confirmBox(msg, okText = 'אישור', danger = true) {
  return new Promise(resolve => {
    openModal(`<h3>${esc(msg)}</h3><div class="actions" style="display:flex;gap:8px;margin-top:14px">
      <button class="btn ${danger ? 'danger' : 'primary'}" id="cfOk">${esc(okText)}</button>
      <button class="btn secondary" id="cfNo">ביטול</button></div>`);
    modalResolve = v => resolve(!!v);
    $('#cfOk').onclick = () => { modalResolve = null; closeModal(); resolve(true); };
    $('#cfNo').onclick = closeModal;
  });
}

/** a manager is signed in, or a manager approves with their PIN */
async function requireManager(reason) {
  if (!currentUser || currentUser.role === 'manager') return true;
  const r = await ask('נדרש אישור מנהל: ' + reason, [{ name: 'pin', label: 'קוד מנהל', type: 'password' }], 'אשר');
  if (!r) return false;
  const mgr = db.users.find(u => u.role === 'manager' && u.pin === r.pin);
  if (mgr) return true;
  beep(false); toast('קוד מנהל שגוי', true); return false;
}

/* ---------------- calculations ---------------- */
function calcTotals(c = cart) {
  const vat = Number(db.settings.vat) / 100;
  const sign = c.refund ? -1 : 1;
  const subtotal = r2(c.items.reduce((s, it) => s + lineTotal(it), 0));
  const promo = applyPromotions(c.items, db.promotions, db.products);
  const promoAmt = r2(Math.min(promo.total, subtotal));
  const afterPromo = r2(subtotal - promoAmt);
  let disc = c.discount.type === 'pct' ? afterPromo * c.discount.value / 100 : Number(c.discount.value);
  disc = r2(Math.min(Math.max(disc, 0), afterPromo));
  const afterDisc = r2(afterPromo - disc);
  let net, vatAmt, total;
  if (db.settings.pricesIncludeVat) {
    total = afterDisc; net = r2(total / (1 + vat)); vatAmt = r2(total - net);
  } else {
    net = afterDisc; vatAmt = r2(net * vat); total = r2(net + vatAmt);
  }
  const itemsDiscount = r2(c.items.reduce((s, it) => s + (it.price * it.qty - lineTotal(it)), 0));
  return {
    subtotal: sign * subtotal, discount: sign * disc, itemsDiscount: sign * itemsDiscount,
    promo: sign * promoAmt, net: sign * net, vat: sign * vatAmt, total: sign * total,
    promoDetail: promo,
  };
}

/* ---------------- catalog ---------------- */
function categories() {
  return ['הכל', ...new Set(db.products.map(p => p.category).filter(Boolean))];
}

/* icons by category / product name */
function catIcon(n = '') {
  if (n === 'הכל') return 'i-list';
  if (/סמארטפו|טלפו|סלולר/.test(n)) return 'i-phone';
  if (/טאבלט|שעון/.test(n)) return 'i-tablet';
  if (/רכיב|כרטיס מסך|SSD|זיכרון|מעבד/.test(n)) return 'i-chip';
  if (/מחשב|לפטופ/.test(n)) return 'i-laptop';
  if (/קונסול/.test(n)) return 'i-console';
  if (/גיימינג|משחק/.test(n)) return 'i-gamepad';
  if (/אודיו|אוזני|רמקול/.test(n)) return 'i-headphones';
  if (/טעינ|סוללה|מטען|כיסוי/.test(n)) return 'i-battery';
  if (/מתנה|גיפט/.test(n)) return 'i-gift';
  return 'i-box';
}
function prodIcon(p) {
  const n = p.name || '';
  if (/Quest|VR|משקף/i.test(n)) return 'i-vr';
  if (/כרטיס מסך|SSD|RAM|זיכרון|מעבד/.test(n)) return 'i-chip';
  if (/מסך גיימינג|מוניטור|מסך \d/.test(n)) return 'i-monitor';
  if (/PlayStation|Xbox|Switch|קונסול/i.test(n)) return 'i-console';
  if (/בקר|מקלדת|עכבר/.test(n)) return 'i-gamepad';
  if (/אוזניות|Buds/i.test(n)) return 'i-headphones';
  if (/רמקול/.test(n)) return 'i-speaker';
  if (/מתנה/.test(n)) return 'i-gift';
  if (/מחשב/.test(n)) return 'i-laptop';
  if (/Watch|שעון|Tab|טאבלט/i.test(n)) return 'i-tablet';
  if (/מטען|סוללה/.test(n)) return 'i-battery';
  return catIcon(p.category);
}

function renderCategories() {
  $('#categories').innerHTML = categories().map(c =>
    `<button class="cat ${c === activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${svgIcon(catIcon(c))}${esc(c)}</button>`).join('');
}

function renderGrid() {
  const q = $('#scan').value.trim().toLowerCase().replace(/^\d+\*/, '');
  const low = Number(db.settings.lowStock);
  const list = db.products.filter(p =>
    (activeCategory === 'הכל' || p.category === activeCategory) &&
    (!q || p.name.toLowerCase().includes(q) || String(p.sku).includes(q) || String(p.barcode).includes(q)));
  $('#productGrid').innerHTML = list.length ? list.map(p => `
    <div class="product ${p.stock <= 0 ? 'out' : p.stock <= low ? 'low' : ''}" data-id="${p.id}" title="${esc(p.name)}">
      <div class="name">${esc(p.name)}</div>
      <span class="p-ico">${svgIcon(prodIcon(p))}</span>
      <div class="meta">${esc(p.sku)}</div>
      <div class="foot"><span class="price">${money(p.price)}</span><span class="stock-chip">${p.stock <= 0 ? 'אזל' : 'מלאי ' + p.stock}</span></div>
    </div>`).join('') : '<div class="empty">לא נמצאו מוצרים</div>';
}

function findByCode(code) {
  return db.products.find(p => String(p.barcode) === code || String(p.sku) === code);
}

async function addToCart(p, qty = 1) {
  // phones, computers, consoles: one cart line per unit with its IMEI / serial number
  if (p.serial && !cart.refund) {
    for (let i = 0; i < qty; i++) {
      const r = await ask(`${p.name} – מספר IMEI / סידורי${qty > 1 ? ` (יחידה ${i + 1} מתוך ${qty})` : ''}`, [{ name: 'sn', label: 'סרוק או הקלד את המספר מהאריזה', required: true }], 'הוסף לעסקה');
      if (!r || !r.sn.trim()) return;
      const sn = r.sn.trim();
      if (cart.items.some(it => it.serial === sn)) { beep(false); toast('המספר הזה כבר בעסקה', true); return; }
      const sold = db.sales.find(s => s.type === 'sale' && s.items.some(it => it.serial === sn));
      if (sold && !(await confirmBox(`המספר ${sn} כבר נמכר בקבלה ${sold.number}. להמשיך בכל זאת?`, 'המשך', false))) return;
      cart.items.push({ key: uid(), productId: p.id, sku: p.sku, name: p.name, price: p.price, cost: p.cost || 0, qty: 1, discount: 0, serial: sn, warranty: p.warranty || 0 });
    }
    if (p.stock !== undefined && p.stock - qty < 0) toast(`שים לב: אין מספיק מלאי עבור "${p.name}"`, true);
    beep(true);
    renderCart();
    return;
  }
  const existing = cart.items.find(it => it.productId === p.id && !it.discount && !it.serial && it.price === p.price);
  if (existing) existing.qty = r2(existing.qty + qty);
  else cart.items.push({ key: uid(), productId: p.id, sku: p.sku, name: p.name, price: p.price, cost: p.cost || 0, qty, discount: 0, warranty: p.warranty || 0 });
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
  const t = calcTotals();
  const pl = t.promoDetail.perLine;
  if (!cart.items.length) box.innerHTML = '<div class="empty">העגלה ריקה – סרוק או בחר מוצר</div>';
  else box.innerHTML = cart.items.map(it => `
    <div class="line" data-key="${it.key}">
      <div>
        <div class="title">${esc(it.name)}</div>
        <div class="sub">${money(it.price)} ליח׳${it.discount ? ` · <span class="disc">הנחה ${it.discount}%</span>` : ''}</div>
        ${it.serial ? `<div class="sn">${it.tradeIn ? 'IMEI' : 'IMEI / S.N'}: <bdi>${esc(it.serial)}</bdi>${it.warranty ? ` · אחריות ${it.warranty} ח׳` : ''}</div>` : ''}
        ${pl[it.key] ? `<div class="promo-tag">🏷 ${esc(pl[it.key].names.join(', '))} (−${money(pl[it.key].amount)})</div>` : ''}
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

  $('#tSubtotal').textContent = money(t.subtotal);
  $('#tPromo').textContent = money(-t.promo);
  $('#promoRow').hidden = !t.promo;
  $('#promoHints').innerHTML = t.promoDetail.hints.map(h => `<div>💡 ${esc(h)}</div>`).join('');
  $('#tDiscount').textContent = money(-t.discount);
  $('#tNet').textContent = money(t.net);
  $('#tVat').textContent = money(t.vat);
  $('#tTotal').textContent = money(t.total);
  $('#vatLbl').textContent = db.settings.vat;
  $('.cart').classList.toggle('refund', cart.refund);
  $('#refundToggle').classList.toggle('active', cart.refund);
  $('#payBtn').textContent = cart.refund ? 'בצע החזרה' : 'תשלום';
  $('#heldCount').textContent = db.held.length;
  publishDisplay(cart.items.length ? 'cart' : 'idle');
  // phone: sticky bottom bar with the cart summary
  const count = r2(cart.items.reduce((a, i) => a + i.qty, 0));
  if ($('#mbCount').textContent !== String(count)) {
    const bar = $('#mobileCartBar');
    bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump');
  }
  $('#mbCount').textContent = count;
  $('#mbTotal').textContent = money(t.total);
  if (!cart.items.length) document.body.classList.remove('cart-open');
}

/* ---------------- phone support ---------------- */
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const isPhone = () => window.matchMedia('(max-width: 700px)').matches;
/** desktop: keep the barcode field focused for USB scanners; phone: don't pop the keyboard */
function focusScan() { if (!isTouch) $('#scan').focus(); }
function openCartSheet(open) { document.body.classList.toggle('cart-open', open); }

let camStream = null, camLoop = null;
async function openCameraScanner() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('המצלמה זמינה רק בכתובת מאובטחת (https)', true);
  openModal(`<h3>סריקה במצלמה</h3>
    <div class="cam-box"><video id="camVideo" playsinline muted></video><div class="aim"></div></div>
    <div id="camLast" class="cam-last">כוון את הברקוד למסגרת</div>
    <div class="actions" style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="camDone">סיום</button></div>`);
  $('#camDone').onclick = closeModal;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) { closeModal(); return toast('אין גישה למצלמה – אשר הרשאת מצלמה בדפדפן', true); }
  const video = $('#camVideo');
  if (!video) { stopCamera(); return; }
  video.srcObject = camStream; await video.play().catch(() => {});

  let last = '', lastAt = 0;
  const onCode = code => {
    const now = Date.now();
    if (code === last && now - lastAt < 2000) return; // same code held in front of the camera
    last = code; lastAt = now;
    const p = findByCode(code);
    if (p) { addToCart(p); $('#camLast').textContent = `✔ נוסף: ${p.name}`; navigator.vibrate?.(60); }
    else { beep(false); $('#camLast').textContent = `✖ ברקוד לא מוכר: ${code}`; }
  };

  if ('BarcodeDetector' in window) {
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
    const step = async () => {
      if (!camStream) return;
      try { const r = await det.detect(video); if (r[0]) onCode(r[0].rawValue); } catch { /* frame not ready */ }
      camLoop = setTimeout(step, 250);
    };
    step();
  } else {
    // Safari / iPhone: ZXing decoder loaded on demand
    try {
      if (!window.ZXing) await new Promise((ok, fail) => {
        const sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
        sc.onload = ok; sc.onerror = fail; document.head.appendChild(sc);
      });
      const reader = new ZXing.BrowserMultiFormatReader();
      camLoop = { reader };
      reader.decodeFromStream(camStream, video, res => { if (res) onCode(res.getText()); });
    } catch { $('#camLast').textContent = 'סורק הברקודים לא נטען – בדוק חיבור לאינטרנט'; }
  }
}
function stopCamera() {
  if (camLoop?.reader) camLoop.reader.reset(); else clearTimeout(camLoop);
  camLoop = null;
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null;
}

/* ---------------- customer display ---------------- */
function publishDisplay(phase, extra = {}) {
  const t = calcTotals();
  const pd = t.promoDetail;
  const sign = cart.refund ? -1 : 1;
  const msg = {
    phase, ts: Date.now(), refund: cart.refund,
    customer: $('#customerName').value.trim(),
    items: cart.items.map(it => ({
      name: it.name, qty: it.qty, price: it.price, total: sign * lineTotal(it),
      promo: pd.perLine[it.key]?.amount || 0, promoNames: pd.perLine[it.key]?.names || [],
    })),
    totals: { subtotal: t.subtotal, promo: t.promo, discount: t.discount, vat: t.vat, total: t.total },
    applied: pd.applied, hints: pd.hints, ...extra,
  };
  try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(msg)); } catch { /* ignore */ }
  try { displayChannel?.postMessage(msg); } catch { /* ignore */ }
}

let customerWin = null;
async function openCustomerDisplay() {
  if (customerWin && !customerWin.closed) { customerWin.focus(); return; }
  let features = 'width=1024,height=768';
  // Chrome/Edge: place the window on the second monitor automatically when allowed
  try {
    if ('getScreenDetails' in window) {
      const sd = await window.getScreenDetails();
      const other = sd.screens.find(sc => sc !== sd.currentScreen);
      if (other) features = `left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
    }
  } catch { /* permission denied – user drags the window manually */ }
  customerWin = window.open('customer.html', 'pos-customer', features);
  if (!customerWin) return toast('הדפדפן חסם את פתיחת החלון – אפשר חלונות קופצים לאתר זה', true);
  setTimeout(() => publishDisplay(cart.items.length ? 'cart' : 'idle'), 800);
  toast('מסך הלקוח נפתח – גרור אותו למסך השני ולחץ עליו פעמיים למסך מלא');
}

async function cartLineAction(key, act, el) {
  const it = cart.items.find(i => i.key === key);
  if (!it) return;
  if ((act === 'inc' || act === 'qty') && (it.serial || it.tradeIn)) {
    if (act === 'qty') el.value = it.qty;
    if (it.tradeIn) return;
    const p = db.products.find(x => x.id === it.productId);
    if (p) addToCart(p); // asks for the next unit's serial number
    return;
  }
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

/* trade-in: the customer hands in an old device; its value is credited on this sale */
async function tradeIn() {
  if (cart.refund) return toast('אי אפשר טרייד-אין במצב החזרה', true);
  const r = await ask('טרייד-אין – קבלת מכשיר ישן', [
    { name: 'device', label: 'דגם המכשיר', required: true },
    { name: 'sn', label: 'IMEI / מספר סידורי' },
    { name: 'cond', label: 'מצב', type: 'select', value: 'good', options: [['new', 'כמו חדש'], ['good', 'תקין, סימני שימוש'], ['worn', 'שחוק / סדוק'], ['parts', 'לחלקים']] },
    { name: 'value', label: 'שווי זיכוי (₪)', type: 'number', step: '1', required: true },
  ], 'הוסף זיכוי');
  if (!r) return;
  const value = r2(Math.abs(Number(r.value) || 0));
  if (!value) return;
  if (!(await requireManager('טרייד-אין'))) return;
  const cond = { new: 'כמו חדש', good: 'תקין', worn: 'שחוק', parts: 'לחלקים' }[r.cond];
  cart.items.push({ key: uid(), productId: null, sku: 'TRADE-IN', name: `טרייד-אין: ${r.device} (${cond})`, price: -value, cost: 0, qty: 1, discount: 0, serial: r.sn.trim(), tradeIn: true, noPromo: true });
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
      cart = { items: h.items, discount: h.discount, refund: h.refund, vrOrderId: h.vrOrderId, customerId: h.customerId };
      $('#customerName').value = h.customer?.name || ''; $('#customerPhone').value = h.customer?.phone || '';
      save(); closeModal(); renderCart();
    } else if (drop !== undefined) {
      db.held.splice(Number(drop), 1); save(); closeModal(); showHeld(); renderCart();
    }
  };
}

function getCustomer() {
  return { name: $('#customerName').value.trim(), phone: $('#customerPhone').value.trim(), id: cart.customerId || '' };
}

function resetCart() {
  cart = newCart();
  $('#customerName').value = ''; $('#customerPhone').value = '';
  if (window.showCustomerInfo) showCustomerInfo(null);
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
  if (!cart.refund && t.total < 0) return toast('שווי הטרייד-אין גבוה מסכום הקנייה. הוסף מוצרים או הקטן את הזיכוי.', true);
  const due = Math.abs(t.total);
  const payments = [];
  let method = 'cash';

  const paid = () => r2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = () => r2(due - paid());

  function draw() {
    const rem = remaining();
    publishDisplay('pay', { due, paid: paid(), remaining: rem });
    const quick = [...new Set([rem, Math.ceil(rem / 10) * 10, Math.ceil(rem / 50) * 50, Math.ceil(rem / 100) * 100, 200])].filter(v => v >= rem && v > 0).slice(0, 5);
    $('#modalBody').innerHTML = `
      <h3>${cart.refund ? 'החזרה ללקוח' : 'תשלום'}</h3>
      <div class="pay-summary">
        <div>סה״כ ${cart.refund ? 'להחזר' : 'לתשלום'}: <span class="big">${money(due)}</span></div>
        <div>שולם: ${money(paid())} · נותר: <b>${money(Math.max(rem, 0))}</b></div>
        ${rem < 0 ? `<div class="change">עודף ללקוח: ${money(-rem)}</div>` : ''}
      </div>
      ${payments.length ? `<div class="payments-list">${payments.map((p, i) => `${payName(p.method)}: ${money(p.amount)}${p.ref ? ` (${esc(p.ref)})` : ''} <button class="link" data-rm="${i}">✕</button>`).join('<br>')}</div>` : ''}
      ${rem > 0 ? `
      <div class="pay-methods">${Object.entries(PAY_METHODS).map(([k, l]) => `<button class="btn ${k === method ? 'primary' : 'secondary'}" data-m="${k}">${l}</button>`).join('')}</div>
      <form class="form" id="payForm">
        <label>סכום<input id="payAmt" type="number" step="0.01" min="0" value="${rem.toFixed(2)}"></label>
        ${method === 'cash' && !cart.refund ? `<div class="cash-quick">${quick.map(v => `<button type="button" class="btn small secondary" data-q="${v}">${money(v)}</button>`).join('')}</div>` : ''}
        ${method !== 'cash' ? `<label>אסמכתא / 4 ספרות אחרונות / מס׳ צ׳ק<input id="payRef"></label>` : ''}
        ${method === 'credit' && !cart.refund ? `<label>תשלומים<input id="payInst" type="number" min="1" value="1"></label>` : ''}
        <div class="actions"><button class="btn primary" type="submit">הוסף תשלום</button></div>
      </form>` : `<div class="actions" style="margin-top:12px;display:flex;gap:8px">
        <button class="btn ok big no-embed" id="finishBtn">סיים והדפס קבלה</button>
        <button class="btn secondary big" id="finishNoPrint">${EMBED ? 'סיים עסקה' : 'סיים ללא הדפסה'}</button></div>`}
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
    const saved = r2(Math.abs((t.promo || 0) + (t.discount || 0) + (t.itemsDiscount || 0)));
    const sale = completeSale(payments, change);
    closeModal();
    publishDisplay('done', { change, paidTotal: Math.abs(sale.totals.total), saved, refund: sale.type === 'refund' });
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
    cashier: cashierName(),
    customer: getCustomer(),
    type: cart.refund ? 'refund' : 'sale',
    items: cart.items.map(it => ({ ...it, total: r2(lineTotal(it) * (cart.refund ? -1 : 1)) })),
    discount: { ...cart.discount },
    totals: { subtotal: t.subtotal, discount: t.discount, itemsDiscount: t.itemsDiscount, promo: t.promo, net: t.net, vat: t.vat, total: t.total },
    promotions: t.promoDetail.applied.map(a => ({ ...a, amount: cart.refund ? -a.amount : a.amount })),
    vatRate: s.vat,
    payments: payments.map(p => ({ ...p, amount: cart.refund ? -p.amount : p.amount })),
    change,
    zClosed: false,
    ...(cart.vrOrderId ? { channel: 'vr-reserve', vrOrderId: cart.vrOrderId } : {}),
  };
  if (cart.vrOrderId) VR.ack(cart.vrOrderId, 'done', sale.number).then(() => VR.poll());
  // stock
  for (const it of cart.items) {
    const p = db.products.find(x => x.id === it.productId);
    if (p) p.stock = r2(p.stock + (cart.refund ? it.qty : -it.qty));
  }
  if (window.afterSale) afterSale(sale);
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
    <div class="c">${logoHTML(s, 48)}<br><b style="font-size:16px">${esc(s.storeName)}</b><br>${s.slogan ? `<i>${esc(s.slogan)}</i><br>` : ''}
      ${s.taxId ? `ע.מ / ח.פ ${esc(s.taxId)}<br>` : ''}${s.address ? esc(s.address) + '<br>' : ''}${s.phone ? 'טל׳ ' + esc(s.phone) : ''}</div>
    <hr>
    <div class="c"><b>${sale.type === 'refund' ? 'קבלה / תעודת זיכוי' : 'קבלה'} מס׳ ${sale.number}</b>${copy ? '<br>** העתק **' : ''}</div>
    <div>${fmtDate(sale.ts)} · ${esc(sale.cashier)}</div>
    ${sale.customer?.name ? `<div>לקוח: ${esc(sale.customer.name)} ${esc(sale.customer.phone || '')}</div>` : ''}
    <hr>
    <table>${sale.items.map(it => `
      <tr><td colspan="2">${esc(it.name)}</td></tr>
      <tr><td>${it.qty} × ${money(it.price)}${it.discount ? ` (-${it.discount}%)` : ''}</td><td class="n">${money(it.total)}</td></tr>
      ${it.serial ? `<tr><td colspan="2">IMEI/S.N: ${esc(it.serial)}</td></tr>` : ''}
      ${it.warranty && sale.type === 'sale' ? `<tr><td colspan="2">אחריות ${it.warranty} חודשים, עד ${warrantyEnd(sale.ts, it.warranty)}</td></tr>` : ''}`).join('')}
    </table>
    <hr>
    <table>
      <tr><td>סה״כ</td><td class="n">${money(t.subtotal)}</td></tr>
      ${(sale.promotions || []).map(p => `<tr><td>מבצע: ${esc(p.name)}</td><td class="n">${money(-p.amount)}</td></tr>`).join('')}
      ${t.discount ? `<tr><td>הנחה</td><td class="n">${money(-t.discount)}</td></tr>` : ''}
      <tr><td>לפני מע״מ</td><td class="n">${money(t.net)}</td></tr>
      <tr><td>מע״מ ${sale.vatRate}%</td><td class="n">${money(t.vat)}</td></tr>
      <tr class="tot"><td>סה״כ לתשלום</td><td class="n">${money(t.total)}</td></tr>
    </table>
    <hr>
    <table>${sale.payments.map(p => `<tr><td>${payName(p.method)}${p.installments > 1 ? ` (${p.installments} תש׳)` : ''}${p.ref ? ' ' + esc(p.ref) : ''}</td><td class="n">${money(p.amount)}</td></tr>`).join('')}
      ${sale.change ? `<tr><td>עודף</td><td class="n">${money(sale.change)}</td></tr>` : ''}
    </table>
    <hr>
    ${(() => { const sv = Math.abs((t.promo || 0) + (t.discount || 0) + (t.itemsDiscount || 0)); return sv && sale.type === 'sale' ? `<div class="c"><b>חסכת היום ${money(r2(sv))}!</b></div><hr>` : ''; })()}
    <div class="c">${esc(s.footer)}</div>
  </div>`;
}

function warrantyEnd(ts, months) {
  const d = new Date(ts); d.setMonth(d.getMonth() + Number(months));
  return d.toLocaleDateString('he-IL');
}

function printHTML(html) {
  $('#printArea').innerHTML = html;
  setTimeout(() => { window.print(); }, 50);
}
function printReceipt(sale, copy = false) { printHTML(receiptHTML(sale, copy)); }

/* ---------------- products view ---------------- */
function renderProducts() {
  const low = Number(db.settings.lowStock);
  const value = db.products.reduce((a, p) => a + Math.max(0, p.stock) * (p.cost || 0), 0);
  $('#stockSummary').textContent = `${db.products.length} מוצרים · ${db.products.filter(p => p.stock <= low).length} במלאי נמוך · שווי מלאי לפי עלות ${money(r2(value))}`;
  const q = $('#prodFilter').value.trim().toLowerCase();
  $('#productsTable').innerHTML = db.products
    .filter(p => !q || [p.name, p.sku, p.barcode, p.category].join(' ').toLowerCase().includes(q))
    .map(p => `<tr class="${p.stock <= low ? 'low' : ''}">
      <td>${esc(p.sku)}</td><td>${esc(p.barcode)}</td><td>${esc(p.name)}${p.vrId ? ' <span class="pill vr" title="מוצג בחנות ה-VR">🥽 VR</span>' : ''}${p.serial ? ' <span class="pill" title="דורש IMEI / מספר סידורי">IMEI</span>' : ''}</td><td>${esc(p.category)}</td>
      <td>${money(p.price)}</td><td>${money(p.cost || 0)}</td><td class="stock">${p.stock}</td>
      <td><button class="btn small secondary" data-edit="${p.id}">עריכה</button>
        <button class="btn small secondary" data-stock="${p.id}">קליטת מלאי</button>
        <button class="btn small danger" data-del="${p.id}">מחק</button></td></tr>`).join('');
}

// products of the 3D VR store (the server sends the live list; this is the built-in catalog)
const VR_FALLBACK = [
  ['nova-x-pro', 'נובה X Pro'], ['nova-x', 'נובה X'], ['nova-a5', 'נובה A5'], ['nova-tab', 'נובה Tab 11'], ['nova-watch', 'נובה Watch 3'],
  ['nova-buds', 'אוזניות נובה Buds'], ['speaker-retro', 'רמקול בלוטות׳ רטרו'], ['charger-45', 'מטען מהיר 45W'],
  ['powerbank', 'סוללה ניידת 10,000mAh'], ['case-x-pro', 'כיסוי סיליקון ל-X Pro'],
];
const vrProductList = () => (Sync.vrProducts.length ? Sync.vrProducts.map(p => [p.id, p.name]) : VR_FALLBACK);

async function editProduct(id) {
  const p = id ? db.products.find(x => x.id === id) : { sku: '', barcode: '', name: '', category: '', price: '', cost: '', stock: 0, serial: false, warranty: 0, vrId: '' };
  const dl = `<datalist id="catList">${categories().slice(1).map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
  const prom = ask(id ? 'עריכת מוצר' : 'מוצר חדש', [
    { name: 'name', label: 'שם המוצר', value: p.name, required: true },
    { name: 'sku', label: 'מק״ט', value: p.sku },
    { name: 'barcode', label: 'ברקוד', value: p.barcode },
    { name: 'category', label: 'קטגוריה', value: p.category, list: 'catList' },
    { name: 'price', label: 'מחיר מכירה', type: 'number', step: '0.01', value: p.price, required: true },
    { name: 'cost', label: 'מחיר עלות', type: 'number', step: '0.01', value: p.cost },
    { name: 'stock', label: 'מלאי', type: 'number', step: 'any', value: p.stock },
    { name: 'serial', label: 'דורש IMEI / מספר סידורי במכירה', type: 'select', value: p.serial ? '1' : '0', options: [['0', 'לא'], ['1', 'כן (טלפונים, מחשבים, קונסולות)']] },
    { name: 'warranty', label: 'אחריות (חודשים, 0 = ללא)', type: 'number', step: '1', value: p.warranty || 0 },
    { name: 'vrId', label: '🥽 מוצר בחנות ה-VR (המחיר והמלאי יוצגו שם)', type: 'select', value: p.vrId || '', options: [['', '— לא מוצג בחנות ה-VR —'], ...vrProductList()] },
  ], 'שמור');
  $('#askForm').insertAdjacentHTML('beforeend', dl);
  const r = await prom;
  if (!r) return;
  const dup = db.products.find(x => x.id !== id && r.barcode && String(x.barcode) === r.barcode);
  if (dup) return toast(`הברקוד כבר קיים במוצר "${dup.name}"`, true);
  const linked = r.vrId && db.products.find(x => x.id !== id && x.vrId === r.vrId);
  if (linked) return toast(`מוצר ה-VR הזה כבר מקושר ל"${linked.name}"`, true);
  const data = { name: r.name, sku: r.sku, barcode: r.barcode, category: r.category, price: r2(Number(r.price) || 0), cost: r2(Number(r.cost) || 0), stock: Number(r.stock) || 0,
    serial: r.serial === '1', warranty: Math.max(0, Number(r.warranty) || 0), vrId: r.vrId || '' };
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
  return [...new Set(sale.payments.map(p => payName(p.method)))].join(' + ') + (sale.channel === 'vr' ? ' 🥽' : '');
}
function renderSales() {
  const day = $('#salesDate').value;
  const q = $('#salesFilter').value.trim().toLowerCase();
  const list = db.sales.filter(s => (!day || dayKey(s.ts) === day) &&
    (!q || String(s.number).includes(q) || (s.customer?.name || '').toLowerCase().includes(q) || (s.customer?.phone || '').includes(q)
      || s.items.some(it => (it.serial || '').toLowerCase().includes(q))))
    .slice().reverse();
  $('#salesTable').innerHTML = list.length ? list.map(s => `<tr class="${s.type === 'refund' ? 'refund' : ''}">
    <td>${s.number}${s.type === 'refund' ? ' (החזרה)' : ''}</td><td>${fmtDate(s.ts)}</td><td>${esc(s.cashier)}</td>
    <td>${esc(s.customer?.name || '-')}</td><td>${s.items.reduce((a, i) => a + i.qty, 0)}</td>
    <td>${payLabel(s)}</td><td><b>${money(s.totals.total)}</b></td>
    <td><button class="btn small secondary" data-view-sale="${s.id}">הצג</button>
      <button class="btn small secondary no-embed" data-print="${s.id}">הדפס העתק</button>
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
  const out = { byPromo: {}, count: 0, refunds: 0, gross: 0, net: 0, vat: 0, discount: 0, cost: 0, byMethod: {}, byCat: {}, byItem: {}, byCashier: {}, change: 0, first: null, last: null };
  for (const s of sales) {
    s.type === 'refund' ? out.refunds++ : out.count++;
    out.gross += s.totals.total; out.net += s.totals.net; out.vat += s.totals.vat;
    out.discount += (s.totals.discount || 0) + (s.totals.itemsDiscount || 0) + (s.totals.promo || 0);
    for (const p of s.promotions || []) out.byPromo[p.name] = (out.byPromo[p.name] || 0) + p.amount;
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
    <h3>לפי אמצעי תשלום</h3><table class="table">${rows(r.byMethod, payName)}</table>
    <h3>מבצעים שמומשו</h3><table class="table">${rows(r.byPromo)}</table>
    <h3>לפי קטגוריה</h3><table class="table">${rows(r.byCat)}</table>
    <h3>לפי קופאי</h3><table class="table">${rows(r.byCashier)}</table>
    <h3>מוצרים מובילים</h3><table class="table"><thead><tr><th>מוצר</th><th>כמות</th><th>סכום</th></tr></thead>
      ${top.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${r2(v.qty)}</td><td>${money(r2(v.total))}</td></tr>`).join('') || '<tr><td colspan="3">-</td></tr>'}</table>
    ${lowStockHTML()}
    <div class="toolbar no-embed" style="margin-top:14px"><button class="btn secondary" onclick="printHTML(document.getElementById('reportOut').innerHTML)">הדפס דוח</button></div>`;
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
  const s = db.settings;
  applyBrand(s);
  $('#storeNameLbl').textContent = s.storeName;
  $('#sloganLbl').textContent = s.slogan || '';
  $('#brandLogo').innerHTML = logoHTML(s, 38);
  $('#logoPreview').innerHTML = logoHTML(s, 64);
  $('#cashierLbl').textContent = cashierName() + (currentUser ? (currentUser.role === 'manager' ? ' · מנהל' : ' · קופאי') : '');
  document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
  document.title = s.storeName + ' – קופה';
}

/** reads an image file, scales it down and returns a data URL (keeps localStorage small) */
function readImage(file, maxSize, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('קובץ תמונה לא תקין'));
      img.onload = () => {
        const k = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(type, 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------------- promotions view ---------------- */
function promoSummary(p) {
  const scope = promoScopeName(p, db.products);
  switch (p.type) {
    case 'xfory': return `קנה ${p.buyQty} שלם ${p.payQty} · ${scope}`;
    case 'bundle': return `${p.buyQty} יח׳ ב־${money(Number(p.price))} · ${scope}`;
    case 'pct': return `${p.pct}% הנחה · ${scope}`;
    case 'threshold': return `${p.pct}% הנחה בקנייה מעל ${money(Number(p.minAmount))}`;
    default: return 'מודעה במסך הלקוח';
  }
}

function renderPromotions() {
  $('#promosTable').innerHTML = db.promotions.length ? db.promotions.map((p, i) => {
    const live = promoActive(p);
    return `<tr class="${live ? '' : 'inactive'}">
      <td><span class="promo-badge">${esc(promoBadge(p))}</span></td>
      <td><b>${esc(p.name)}</b><div class="muted">${esc(p.description || '')}</div></td>
      <td>${esc(promoSummary(p))}</td>
      <td>${p.from || p.to ? `${esc(p.from || '…')} – ${esc(p.to || '…')}` : 'ללא הגבלה'}</td>
      <td>${live ? '<span class="pill ok">פעיל</span>' : '<span class="pill">לא פעיל</span>'}${p.showOnScreen ? ' <span class="pill">🖥</span>' : ''}</td>
      <td class="nowrap">
        <button class="btn small secondary" data-up="${i}" title="עדיפות גבוהה יותר">▲</button>
        <button class="btn small secondary" data-edit="${p.id}">עריכה</button>
        <button class="btn small secondary" data-toggle="${p.id}">${p.active ? 'השבת' : 'הפעל'}</button>
        <button class="btn small danger" data-del="${p.id}">מחק</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">אין מבצעים – לחץ "מבצע חדש"</td></tr>';
}

function editPromotion(id) {
  const p = id ? db.promotions.find(x => x.id === id) : {
    name: '', description: '', type: 'xfory', scope: 'products', productIds: [], category: '',
    buyQty: 2, payQty: 1, price: '', pct: 10, minAmount: 300, from: '', to: '', active: true, showOnScreen: true, image: '', badge: '',
  };
  let image = p.image || '';
  const cats = categories().slice(1);
  openModal(`<h3>${id ? 'עריכת מבצע' : 'מבצע חדש'}</h3>
    <form class="form promo-form" id="promoForm">
      <label>שם המבצע (יוצג ללקוח)<input name="name" value="${esc(p.name)}" required></label>
      <label>תיאור קצר<input name="description" value="${esc(p.description || '')}"></label>
      <label>סוג<select name="type">${Object.entries(PROMO_TYPES).map(([k, l]) => `<option value="${k}" ${k === p.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="grid2" data-for="xfory bundle">
        <label>כמות לקנייה (X)<input name="buyQty" type="number" min="1" value="${esc(p.buyQty ?? 2)}"></label>
        <label data-for="xfory">משלמים על (Y)<input name="payQty" type="number" min="0" value="${esc(p.payQty ?? 1)}"></label>
        <label data-for="bundle">מחיר לכל החבילה (₪)<input name="price" type="number" step="0.01" min="0" value="${esc(p.price ?? '')}"></label>
      </div>
      <div class="grid2">
        <label data-for="pct threshold">אחוז הנחה<input name="pct" type="number" step="0.1" min="0" max="100" value="${esc(p.pct ?? 10)}"></label>
        <label data-for="threshold">מינימום קנייה (₪)<input name="minAmount" type="number" step="0.01" min="0" value="${esc(p.minAmount ?? 300)}"></label>
      </div>
      <label data-for="xfory bundle pct">חל על<select name="scope">
        <option value="products" ${p.scope === 'products' ? 'selected' : ''}>מוצרים נבחרים</option>
        <option value="category" ${p.scope === 'category' ? 'selected' : ''}>קטגוריה</option>
        <option value="all" ${p.scope === 'all' ? 'selected' : ''}>כל המוצרים</option></select></label>
      <label data-scope="category">קטגוריה<select name="category">${cats.map(c => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label data-scope="products">מוצרים (Ctrl/Shift לבחירה מרובה)<select name="productIds" multiple size="6">
        ${db.products.map(x => `<option value="${x.id}" ${(p.productIds || []).includes(x.id) ? 'selected' : ''}>${esc(x.name)} (${esc(x.sku)})</option>`).join('')}</select></label>
      <div class="grid2">
        <label>מתאריך<input name="from" type="date" value="${esc(p.from || '')}"></label>
        <label>עד תאריך<input name="to" type="date" value="${esc(p.to || '')}"></label>
      </div>
      <label>תווית (ריק = אוטומטי, למשל "1+1")<input name="badge" value="${esc(p.badge || '')}"></label>
      <label>תמונה למסך הלקוח<input type="file" id="promoImg" accept="image/*"></label>
      <div id="promoImgPrev" class="img-prev"></div>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> מבצע פעיל</label>
      <label class="check"><input type="checkbox" name="showOnScreen" ${p.showOnScreen ? 'checked' : ''}> הצג במסך הלקוח</label>
      <div class="actions"><button class="btn primary" type="submit">שמור</button><button class="btn secondary" type="button" data-cancel>ביטול</button></div>
    </form>`);
  const f = $('#promoForm');
  const sync = () => {
    const type = f.elements.type.value, scope = f.elements.scope.value;
    f.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(type); });
    const scoped = ['xfory', 'bundle', 'pct'].includes(type);
    f.querySelectorAll('[data-scope]').forEach(el => { el.hidden = !scoped || el.dataset.scope !== scope; });
    $('#promoImgPrev').innerHTML = image ? `<img src="${image}"><button type="button" class="link" id="rmImg">הסר תמונה</button>` : '';
    $('#rmImg') && ($('#rmImg').onclick = () => { image = ''; sync(); });
  };
  f.elements.type.onchange = sync; f.elements.scope.onchange = sync; sync();
  $('#promoImg').onchange = async e => {
    try { image = await readImage(e.target.files[0], 900); sync(); } catch (err) { toast(err.message, true); }
  };
  f.querySelector('[data-cancel]').onclick = closeModal;
  f.onsubmit = e => {
    e.preventDefault();
    const el = f.elements;
    const data = {
      name: el.name.value.trim(), description: el.description.value.trim(), type: el.type.value,
      scope: el.type.value === 'threshold' || el.type.value === 'ad' ? 'all' : el.scope.value,
      category: el.category.value, productIds: [...el.productIds.selectedOptions].map(o => o.value),
      buyQty: Number(el.buyQty.value) || 1, payQty: Number(el.payQty.value) || 0, price: Number(el.price.value) || 0,
      pct: Number(el.pct.value) || 0, minAmount: Number(el.minAmount.value) || 0,
      from: el.from.value, to: el.to.value, badge: el.badge.value.trim(),
      active: el.active.checked, showOnScreen: el.showOnScreen.checked, image,
    };
    if (data.type === 'xfory' && data.payQty >= data.buyQty) return toast('Y חייב להיות קטן מ־X (למשל קנה 2 שלם 1)', true);
    if (['xfory', 'bundle', 'pct'].includes(data.type) && data.scope === 'products' && !data.productIds.length) return toast('בחר לפחות מוצר אחד', true);
    if (id) Object.assign(p, data); else db.promotions.push({ id: uid(), ...data });
    if (!save()) return;
    closeModal(); renderPromotions(); renderCart(); toast('המבצע נשמר');
  };
}

/* ---------------- navigation ---------------- */
function switchView(v) {
  const tab = document.querySelector(`.tab[data-view="${v}"]`);
  if (tab?.classList.contains('mgr') && currentUser && currentUser.role !== 'manager') return toast('המסך הזה פתוח למנהלים בלבד', true);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  if (v === 'products') renderProducts();
  if (v === 'promos') renderPromotions();
  if (v === 'vr') { VR.render(); VR.poll(); }
  if (v === 'sales') renderSales();
  if (v === 'settings') { fillSettings(); renderUsers(); }
  if (v === 'repairs') renderRepairs();
  if (v === 'customers') renderCustomers();
  if (v === 'reports' && !$('#reportOut').innerHTML) xReport();
  if (v === 'pos') { renderGrid(); renderCategories(); setTimeout(focusScan, 0); }
}

/* ---------------- wiring ---------------- */
function init() {
  saveLocal(); // make sure the customer display can read products, promotions and branding
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
  $('#clearBtn').onclick = async () => { if (cart.items.length && await confirmBox('לבטל את העסקה הנוכחית?', 'בטל עסקה')) resetCart(); };
  $('#refundToggle').onclick = toggleRefund;
  $('#payBtn').onclick = openPayment;

  // products
  $('#prodFilter').oninput = renderProducts;
  $('#addProductBtn').onclick = () => editProduct(null);
  $('#exportProductsBtn').onclick = exportProducts;
  $('#importProducts').onchange = e => { if (e.target.files[0]) importProducts(e.target.files[0]); e.target.value = ''; };
  $('#productsTable').onclick = async e => {
    const d = e.target.dataset;
    if (d.edit) editProduct(d.edit);
    else if (d.stock) receiveStock(d.stock);
    else if (d.del) {
      const p = db.products.find(x => x.id === d.del);
      if (await confirmBox(`למחוק את "${p.name}"?`, 'מחק')) { db.products = db.products.filter(x => x !== p); save(); renderProducts(); renderCategories(); renderGrid(); }
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

  // promotions
  $('#addPromoBtn').onclick = () => editPromotion(null);
  $('#promosTable').onclick = async e => {
    const d = e.target.dataset;
    if (d.edit) editPromotion(d.edit);
    else if (d.toggle) { const p = db.promotions.find(x => x.id === d.toggle); p.active = !p.active; save(); renderPromotions(); renderCart(); }
    else if (d.up !== undefined) {
      const i = Number(d.up); if (!i) return;
      [db.promotions[i - 1], db.promotions[i]] = [db.promotions[i], db.promotions[i - 1]];
      save(); renderPromotions(); renderCart();
    } else if (d.del) {
      const p = db.promotions.find(x => x.id === d.del);
      if (await confirmBox(`למחוק את המבצע "${p.name}"?`, 'מחק')) { db.promotions = db.promotions.filter(x => x !== p); save(); renderPromotions(); renderCart(); }
    }
  };
  $('#customerDisplayBtn').onclick = openCustomerDisplay;
  $('#tradeInBtn').onclick = tradeIn;
  $('#syncPill').onclick = () => { if (Sync.mode === 'locked') Sync.login(); else if (Sync.mode === 'offline') Sync.tick(); };
  $('#vrCode').oninput = () => VR.render();
  $('#vrTable').onclick = e => { const d = e.target.dataset; if (d.load) VR.load(d.load); else if (d.cancel) VR.cancel(d.cancel); };
  $('#loadSampleBtn').onclick = async () => {
    if (!(await confirmBox('להחליף את כל המוצרים והמבצעים בקטלוג לדוגמה של חנות סלולר, מחשבים וגיימינג? המכירות נשמרות.', 'החלף קטלוג', false))) return;
    if (!(await requireManager('החלפת קטלוג'))) return;
    db.products = sampleProducts(); db.promotions = samplePromotions(db.products);
    Object.assign(db.settings, { storeName: BRAND_DEFAULTS.storeName, slogan: BRAND_DEFAULTS.slogan, brandColor: BRAND_DEFAULTS.brandColor, brandDark: BRAND_DEFAULTS.brandDark });
    activeCategory = 'הכל';
    save(); refreshViews(); toast('הקטלוג הוחלף');
  };
  Sync.start();
  $('#camBtn').onclick = openCameraScanner;
  $('#mobileCartBar').onclick = () => openCartSheet(true);
  $('#cartClose').onclick = () => openCartSheet(false);
  focusScan();
  if (EMBED) document.body.classList.add('embed');
  if (!EMBED && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  // settings
  $('#settingsForm').onsubmit = saveSettings;
  $('#logoFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { db.settings.logo = await readImage(f, 320, 'image/png'); save(); applyHeader(); publishDisplay(cart.items.length ? 'cart' : 'idle'); toast('הלוגו עודכן'); }
    catch (err) { toast(err.message, true); }
    e.target.value = '';
  };
  $('#removeLogo').onclick = () => { db.settings.logo = ''; save(); applyHeader(); toast('הלוגו הוסר'); };
  $('#backupBtn').onclick = () => download(`pos-backup-${dayKey(Date.now())}.json`, JSON.stringify(db, null, 1), 'application/json');
  $('#restoreFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d.products || !d.sales) throw new Error('קובץ לא תקין');
        if (!(await confirmBox('השחזור יחליף את כל הנתונים הנוכחיים. להמשיך?', 'שחזר'))) return;
        localStorage.setItem(LS_KEY, JSON.stringify(d)); db = load();
        applyHeader(); fillSettings(); resetCart(); renderCategories(); toast('הנתונים שוחזרו');
      } catch (err) { toast('שגיאה: ' + err.message, true); }
    };
    fr.readAsText(f); e.target.value = '';
  };
  $('#resetBtn').onclick = async () => {
    if (!(await confirmBox('למחוק את כל הנתונים (מוצרים, מכירות, הגדרות)? פעולה זו אינה הפיכה.', 'מחק הכל'))) return;
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
    if (e.key === 'F8') { e.preventDefault(); openCustomerDisplay(); }
  });
}

document.addEventListener('DOMContentLoaded', init);
