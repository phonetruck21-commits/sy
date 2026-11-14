'use strict';
/* ============================================================
   קופה רושמת – אפליקציית POS מקומית (ללא שרת)
   כל הנתונים נשמרים ב-localStorage של הדפדפן.
   ============================================================ */

const PAY_METHODS = {
  cash: 'מזומן', credit: 'אשראי', check: 'צ׳ק', bit: 'ביט / העברה', voucher: 'שובר / זיכוי'
};

const DEFAULT_SETTINGS = {
  ...BRAND_DEFAULTS,
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
  thanksSeconds: 8,
  slideSeconds: 7,
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
      d.promotions ||= samplePromotions(d.products);
      return d;
    }
  } catch (e) { console.error(e); }
  const products = SAMPLE_PRODUCTS.map(([sku, barcode, name, category, price, cost, stock]) =>
    ({ id: uid(), sku, barcode, name, category, price, cost, stock }));
  return {
    settings: { ...DEFAULT_SETTINGS },
    products, promotions: samplePromotions(products),
    sales: [], held: [], zReports: [],
  };
}

function samplePromotions(products) {
  const id = sku => products.find(p => p.sku === sku)?.id;
  const base = { active: true, showOnScreen: true, from: '', to: '', image: '', badge: '', description: '' };
  const list = [
    { ...base, name: '1+1 על כפפות עבודה', description: 'קנה זוג – קבל זוג נוסף מתנה', type: 'xfory', scope: 'products', productIds: [id('4001')], buyQty: 2, payQty: 1 },
    { ...base, name: '3 מקדחים לבטון ב־₪55', description: 'מקדח 8 מ״מ – מחיר מיוחד בקנייה של 3', type: 'bundle', scope: 'products', productIds: [id('5001')], buyQty: 3, price: 55 },
    { ...base, name: '10% הנחה על ציוד מגן', description: 'בטיחות קודם כל – על כל מחלקת ציוד המגן', type: 'pct', scope: 'category', category: 'ציוד מגן', pct: 10 },
    { ...base, name: 'קנייה מעל ₪500 – 5% הנחה', description: 'על כל הקנייה, אוטומטית בקופה', type: 'threshold', scope: 'all', minAmount: 500, pct: 5 },
    { ...base, name: 'חדש בחנות: מברגה נטענת 18V', description: 'עוצמה, דיוק וסוללה שמחזיקה יום עבודה שלם', type: 'ad', scope: 'all', badge: 'חדש!' },
  ];
  return list.filter(p => p.scope !== 'products' || p.productIds.every(Boolean)).map(p => ({ id: uid(), ...p }));
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('שגיאה בשמירת נתונים (ייתכן שהתמונות גדולות מדי): ' + e.message, true); return false; }
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

async function requireManager(reason) {
  const pin = db.settings.managerPin;
  if (!pin) return true;
  const r = await ask('נדרש אישור מנהל – ' + reason, [{ name: 'pin', label: 'קוד מנהל', type: 'password' }]);
  if (!r) return false;
  if (r.pin === pin) return true;
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
  const t = calcTotals();
  const pl = t.promoDetail.perLine;
  if (!cart.items.length) box.innerHTML = '<div class="empty">העגלה ריקה – סרוק או בחר מוצר</div>';
  else box.innerHTML = cart.items.map(it => `
    <div class="line" data-key="${it.key}">
      <div>
        <div class="title">${esc(it.name)}</div>
        <div class="sub">${money(it.price)} ליח׳${it.discount ? ` · <span class="disc">הנחה ${it.discount}%</span>` : ''}</div>
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
    publishDisplay('pay', { due, paid: paid(), remaining: rem });
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
    cashier: s.cashier,
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
    <div class="c">${logoHTML(s, 48)}<br><b style="font-size:16px">${esc(s.storeName)}</b><br>${s.slogan ? `<i>${esc(s.slogan)}</i><br>` : ''}
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
      ${(sale.promotions || []).map(p => `<tr><td>מבצע: ${esc(p.name)}</td><td class="n">${money(-p.amount)}</td></tr>`).join('')}
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
    ${(() => { const sv = Math.abs((t.promo || 0) + (t.discount || 0) + (t.itemsDiscount || 0)); return sv && sale.type === 'sale' ? `<div class="c"><b>חסכת היום ${money(r2(sv))}!</b></div><hr>` : ''; })()}
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
    <h3>לפי אמצעי תשלום</h3><table class="table">${rows(r.byMethod, k => PAY_METHODS[k] || k)}</table>
    <h3>מבצעים שמומשו</h3><table class="table">${rows(r.byPromo)}</table>
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
  const s = db.settings;
  applyBrand(s);
  $('#storeNameLbl').textContent = s.storeName;
  $('#sloganLbl').textContent = s.slogan || '';
  $('#brandLogo').innerHTML = logoHTML(s, 38);
  $('#logoPreview').innerHTML = logoHTML(s, 64);
  $('#cashierLbl').textContent = '👤 ' + s.cashier;
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
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  if (v === 'products') renderProducts();
  if (v === 'promos') renderPromotions();
  if (v === 'sales') renderSales();
  if (v === 'settings') fillSettings();
  if (v === 'reports' && !$('#reportOut').innerHTML) xReport();
  if (v === 'pos') { renderGrid(); renderCategories(); setTimeout(focusScan, 0); }
}

/* ---------------- wiring ---------------- */
function init() {
  save(); // make sure the customer display can read products, promotions and branding
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

  // promotions
  $('#addPromoBtn').onclick = () => editPromotion(null);
  $('#promosTable').onclick = e => {
    const d = e.target.dataset;
    if (d.edit) editPromotion(d.edit);
    else if (d.toggle) { const p = db.promotions.find(x => x.id === d.toggle); p.active = !p.active; save(); renderPromotions(); renderCart(); }
    else if (d.up !== undefined) {
      const i = Number(d.up); if (!i) return;
      [db.promotions[i - 1], db.promotions[i]] = [db.promotions[i], db.promotions[i - 1]];
      save(); renderPromotions(); renderCart();
    } else if (d.del) {
      const p = db.promotions.find(x => x.id === d.del);
      if (confirm(`למחוק את המבצע "${p.name}"?`)) { db.promotions = db.promotions.filter(x => x !== p); save(); renderPromotions(); renderCart(); }
    }
  };
  $('#customerDisplayBtn').onclick = openCustomerDisplay;
  $('#camBtn').onclick = openCameraScanner;
  $('#mobileCartBar').onclick = () => openCartSheet(true);
  $('#cartClose').onclick = () => openCartSheet(false);
  focusScan();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

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
    if (e.key === 'F8') { e.preventDefault(); openCustomerDisplay(); }
  });
}

init();
