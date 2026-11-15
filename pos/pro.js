'use strict';
/* ============================================================
   מודולים מקצועיים: עובדים וכניסה בקוד, לקוחות, מעבדת תיקונים
   (נטען אחרי app.js ומשתמש ב-db, ask, toast וכו׳)
   ============================================================ */

/* ================= עובדים, כניסה ונעילה ================= */
const ROLES = { manager: 'מנהל', cashier: 'קופאי' };
let pinBuf = '';
let idleTimer = null;

function setUser(u) {
  currentUser = u;
  document.body.classList.toggle('role-cashier', !!u && u.role !== 'manager');
  try { u ? sessionStorage.setItem('pos.user', u.id) : sessionStorage.removeItem('pos.user'); } catch { /* ignore */ }
  applyHeader();
  const active = document.querySelector('.tab.active');
  if (u && u.role !== 'manager' && active?.classList.contains('mgr')) switchView('pos');
}

function lockRegister() {
  if (!$('#modal').classList.contains('hidden')) closeModal();
  setUser(null);
  pinBuf = '';
  drawPin();
  const s = db.settings;
  $('#lockLogo').innerHTML = logoHTML(s, 64);
  $('#lockStore').textContent = s.storeName;
  $('#lockNote').textContent = db.users.length === 1 && db.users[0].pin === '1234' ? 'כניסה ראשונה: קוד המנהל הוא 1234. מומלץ לשנות אותו בהגדרות ← עובדים.' : '';
  $('#lock').hidden = false;
  document.activeElement?.blur?.();
}

function drawPin() {
  document.querySelectorAll('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length));
}

function pinKey(k) {
  if (k === 'clear') pinBuf = '';
  else if (k === 'back') pinBuf = pinBuf.slice(0, -1);
  else if (/^\d$/.test(k) && pinBuf.length < 4) pinBuf += k;
  drawPin();
  if (pinBuf.length < 4) return;
  const u = db.users.find(x => x.pin === pinBuf);
  if (u) {
    $('#lock').hidden = true;
    setUser(u);
    pinBuf = '';
    toast(`שלום ${u.name}`);
    if (u.pin === '1234' && u.role === 'manager') setTimeout(() => toast('שים לב: הקוד 1234 הוא קוד ברירת מחדל. שנה אותו בהגדרות ← עובדים.', true), 2700);
    focusScan();
  } else {
    beep(false);
    const dots = $('#pinDots');
    dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
    setTimeout(() => { pinBuf = ''; drawPin(); }, 350);
  }
}

function bumpIdle() {
  clearTimeout(idleTimer);
  const min = Number(db.settings.autoLockMin) || 0;
  if (min > 0 && currentUser) idleTimer = setTimeout(() => { if (!cart.items.length) lockRegister(); else bumpIdle(); }, min * 60000);
}

function renderUsers() {
  const today = dayKey(Date.now());
  $('#usersTable').innerHTML = db.users.map(u => {
    const sales = db.sales.filter(s => s.cashier === u.name && dayKey(s.ts) === today);
    const sum = sales.reduce((a, s) => a + s.totals.total, 0);
    return `<tr><td><b>${esc(u.name)}</b>${currentUser?.id === u.id ? ' <span class="pill brand">מחובר</span>' : ''}</td>
      <td><span class="pill ${u.role === 'manager' ? 'info' : ''}">${ROLES[u.role]}</span></td>
      <td>${sales.length} עסקאות · ${money(r2(sum))}</td>
      <td class="nowrap"><button class="btn small secondary" data-uedit="${u.id}" type="button">עריכה</button>
        <button class="btn small ghost-danger" data-udel="${u.id}" type="button">מחיקה</button></td></tr>`;
  }).join('');
}

async function editUser(id) {
  const u = id ? db.users.find(x => x.id === id) : { name: '', pin: '', role: 'cashier' };
  const r = await ask(id ? 'עריכת עובד' : 'עובד חדש', [
    { name: 'name', label: 'שם (יופיע בקבלה ובדוחות)', value: u.name, required: true },
    { name: 'pin', label: 'קוד כניסה – 4 ספרות', type: 'password', value: u.pin, required: true },
    { name: 'role', label: 'תפקיד', type: 'select', value: u.role, options: [['cashier', 'קופאי'], ['manager', 'מנהל']] },
  ], 'שמור');
  if (!r) return;
  if (!/^\d{4}$/.test(r.pin)) return toast('הקוד חייב להיות 4 ספרות', true);
  if (db.users.some(x => x.id !== id && x.pin === r.pin)) return toast('הקוד הזה כבר שייך לעובד אחר', true);
  if (id && u.role === 'manager' && r.role !== 'manager' && db.users.filter(x => x.role === 'manager').length === 1) return toast('חייב להישאר לפחות מנהל אחד', true);
  const data = { name: r.name.trim(), pin: r.pin, role: r.role };
  if (id) Object.assign(u, data); else db.users.push({ id: uid(), ...data });
  if (currentUser?.id === id) setUser(u);
  save(); renderUsers(); toast('העובד נשמר');
}

async function deleteUser(id) {
  const u = db.users.find(x => x.id === id);
  if (currentUser?.id === id) return toast('אי אפשר למחוק את העובד המחובר', true);
  if (u.role === 'manager' && db.users.filter(x => x.role === 'manager').length === 1) return toast('חייב להישאר לפחות מנהל אחד', true);
  if (!(await confirmBox(`למחוק את ${u.name}?`, 'מחק'))) return;
  db.users = db.users.filter(x => x !== u);
  save(); renderUsers();
}

/* ================= לקוחות ================= */
const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^972/, '0');
const findCustomerByPhone = phone => { const n = normPhone(phone); return n.length >= 9 ? db.customers.find(c => normPhone(c.phone) === n) : null; };

function customerStats(c) {
  const n = normPhone(c.phone);
  const sales = db.sales.filter(s => s.customer && (s.customer.id === c.id || (n && normPhone(s.customer.phone) === n)));
  const net = sales.reduce((a, s) => a + s.totals.total, 0);
  const repairs = db.repairs.filter(r => r.customerId === c.id || (n && normPhone(r.customer?.phone) === n));
  const open = repairs.filter(r => !['delivered', 'cancelled'].includes(r.status));
  const last = sales.reduce((m, s) => Math.max(m, s.ts), 0);
  return { sales, net: r2(net), repairs, open, last };
}

/** called after each sale: save / update the customer and attach their id */
function upsertCustomer(cu) {
  if (!cu || !normPhone(cu.phone)) return cu;
  let c = (cu.id && db.customers.find(x => x.id === cu.id)) || findCustomerByPhone(cu.phone);
  if (!c) { c = { id: uid(), name: cu.name || '', phone: cu.phone, email: '', notes: '', createdAt: Date.now() }; db.customers.push(c); }
  else if (cu.name && !c.name) c.name = cu.name;
  return { ...cu, id: c.id, name: cu.name || c.name };
}

function showCustomerInfo(c) {
  const box = $('#custInfo');
  if (!c) { box.hidden = true; cart.customerId = ''; return; }
  cart.customerId = c.id;
  const st = customerStats(c);
  box.innerHTML = `<span><b>${esc(c.name || 'לקוח')}</b></span><span>${st.sales.length} קניות · ${money(st.net)}</span>
    ${st.last ? `<span>ביקור אחרון ${new Date(st.last).toLocaleDateString('he-IL')}</span>` : ''}
    ${st.open.length ? `<span class="pill warn">${st.open.length} בתיקון</span>` : ''}
    <button class="link" type="button" data-cust-open="${c.id}">כרטיס לקוח</button>`;
  box.hidden = false;
}

function onCustomerPhone() {
  const v = $('#customerPhone').value;
  const q = normPhone(v);
  $('#custList').innerHTML = q.length >= 3
    ? db.customers.filter(c => normPhone(c.phone).includes(q)).slice(0, 8).map(c => `<option value="${esc(c.phone)}">${esc(c.name)}</option>`).join('') : '';
  const c = findCustomerByPhone(v);
  if (c) { if (!$('#customerName').value) $('#customerName').value = c.name || ''; showCustomerInfo(c); }
  else showCustomerInfo(null);
  publishDisplay(cart.items.length ? 'cart' : 'idle');
}

function renderCustomers() {
  const q = $('#custFilter').value.trim().toLowerCase();
  const qn = normPhone(q);
  const list = db.customers.filter(c => !q || (c.name || '').toLowerCase().includes(q) || (qn && normPhone(c.phone).includes(qn)) || (c.email || '').toLowerCase().includes(q));
  const rows = list.map(c => ({ c, st: customerStats(c) })).sort((a, b) => b.st.last - a.st.last);
  $('#customersTable').innerHTML = rows.length ? rows.map(({ c, st }) => `<tr>
    <td><b>${esc(c.name || '—')}</b></td><td class="mono">${esc(c.phone)}</td>
    <td>${st.sales.length}</td><td>${money(st.net)}</td>
    <td>${st.last ? new Date(st.last).toLocaleDateString('he-IL') : '—'}</td>
    <td>${st.open.length ? `<span class="pill warn">${st.open.length}</span>` : '—'}</td>
    <td class="nowrap"><button class="btn small secondary" data-cust-open="${c.id}">כרטיס לקוח</button></td></tr>`).join('')
    : `<tr><td colspan="7" class="empty">${q ? 'לא נמצא לקוח' : 'עדיין אין לקוחות. לקוח נשמר אוטומטית כשמקלידים טלפון בעסקה או בקבלת מכשיר לתיקון.'}</td></tr>`;
}

async function editCustomer(id) {
  const c = id ? db.customers.find(x => x.id === id) : { name: '', phone: '', email: '', notes: '' };
  const r = await ask(id ? 'עריכת לקוח' : 'לקוח חדש', [
    { name: 'name', label: 'שם מלא', value: c.name, required: true },
    { name: 'phone', label: 'טלפון', type: 'tel', value: c.phone, required: true },
    { name: 'email', label: 'אימייל', type: 'email', value: c.email },
    { name: 'notes', label: 'הערות', value: c.notes },
  ], 'שמור');
  if (!r) return null;
  const dup = findCustomerByPhone(r.phone);
  if (dup && dup.id !== id) { toast(`הטלפון כבר שייך ל-${dup.name}`, true); return null; }
  if (id) Object.assign(c, r); else db.customers.push(Object.assign(c, { id: uid(), createdAt: Date.now() }, r));
  save(); renderCustomers();
  return c;
}

function openCustomer(id) {
  const c = db.customers.find(x => x.id === id);
  if (!c) return;
  const st = customerStats(c);
  const devices = st.sales.filter(s => s.type === 'sale').flatMap(s => s.items.filter(it => it.serial && !it.tradeIn).map(it => ({ s, it })));
  const now = Date.now();
  openModal(`<div class="cust-card">
    <div class="ticket-head"><div><h3 style="padding:0;margin:0">${esc(c.name || 'לקוח')}</h3>
      <div class="muted mono">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</div>${c.notes ? `<div class="muted">${esc(c.notes)}</div>` : ''}</div>
      <div class="nowrap"><button class="btn small secondary" id="cEdit">עריכה</button></div></div>
    <div class="stat-row">
      <div class="stat"><b>${st.sales.length}</b><span>קניות</span></div>
      <div class="stat"><b>${money(st.net)}</b><span>סה״כ רכישות</span></div>
      <div class="stat"><b>${st.repairs.length}</b><span>תיקונים</span></div>
      <div class="stat"><b>${st.last ? new Date(st.last).toLocaleDateString('he-IL') : '—'}</b><span>ביקור אחרון</span></div>
    </div>
    <div class="toolbar"><button class="btn primary small" id="cSell">${svgIcon('i-pos')}עסקה חדשה ללקוח</button>
      <button class="btn secondary small" id="cRepair">${svgIcon('i-wrench')}קבלת מכשיר לתיקון</button></div>
    ${devices.length ? `<h4>מכשירים שנקנו</h4><div class="table-wrap"><table class="table"><thead><tr><th>מכשיר</th><th>IMEI / S.N</th><th>נקנה</th><th>אחריות</th></tr></thead><tbody>
      ${devices.map(({ s, it }) => { const end = new Date(s.ts); end.setMonth(end.getMonth() + Number(it.warranty || 0)); const ok = it.warranty && end > now;
        return `<tr><td>${esc(it.name)}</td><td class="mono">${esc(it.serial)}</td><td>${new Date(s.ts).toLocaleDateString('he-IL')} · קבלה ${s.number}</td>
        <td>${it.warranty ? `<span class="pill ${ok ? 'ok' : 'danger'}">${ok ? 'בתוקף עד' : 'פגה'} ${end.toLocaleDateString('he-IL')}</span>` : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>` : ''}
    ${st.repairs.length ? `<h4>תיקונים</h4><div class="table-wrap"><table class="table"><tbody>
      ${st.repairs.slice().reverse().map(r => `<tr><td class="mono">#${r.number}</td><td>${esc(r.device)}</td><td>${esc(r.issue)}</td><td>${statusPill(r.status)}</td>
        <td><button class="btn small secondary" data-rp-open="${r.id}">פתח</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${st.sales.length ? `<h4>קבלות</h4><div class="table-wrap"><table class="table"><tbody>
      ${st.sales.slice().reverse().slice(0, 20).map(s => `<tr><td class="mono">${s.number}</td><td>${fmtDate(s.ts)}</td><td>${s.items.length} פריטים</td><td><b>${money(s.totals.total)}</b></td>
        <td><button class="btn small secondary" data-sale-show="${s.id}">קבלה</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  </div>`);
  $('#cEdit').onclick = async () => { if (await editCustomer(id)) openCustomer(id); };
  $('#cSell').onclick = () => {
    if (cart.items.length) return toast('יש לסיים או להשהות את העסקה הנוכחית קודם', true);
    closeModal(); switchView('pos');
    $('#customerPhone').value = c.phone; $('#customerName').value = c.name; showCustomerInfo(c);
  };
  $('#cRepair').onclick = () => newRepair({ name: c.name, phone: c.phone });
  $('#modalBody').onclick = e => {
    const d = e.target.dataset;
    if (d.rpOpen) openRepair(d.rpOpen);
    if (d.saleShow) openModal(receiptHTML(db.sales.find(s => s.id === d.saleShow), true));
  };
}

/* ================= מעבדת תיקונים ================= */
const REPAIR_STATUS = {
  received: ['התקבל', 'info'], diagnosing: ['באבחון', ''], waiting_parts: ['ממתין לחלקים', 'warn'],
  repairing: ['בתיקון', 'brand'], ready: ['מוכן לאיסוף', 'ok'], delivered: ['נמסר', ''], cancelled: ['בוטל', 'danger'],
};
const OPEN_STATUSES = ['received', 'diagnosing', 'waiting_parts', 'repairing', 'ready'];
let repairTab = 'open';

const statusPill = st => `<span class="pill ${REPAIR_STATUS[st]?.[1] || ''}">${REPAIR_STATUS[st]?.[0] || st}</span>`;

function updateRepairBadge() {
  const n = db.repairs.filter(r => r.status === 'ready').length;
  const b = $('#repairCount');
  b.textContent = n; b.hidden = !n; b.title = `${n} מכשירים מוכנים לאיסוף`;
}

function renderRepairs() {
  const counts = { open: 0, ready: 0, all: db.repairs.length };
  db.repairs.forEach(r => { if (OPEN_STATUSES.includes(r.status)) counts.open++; if (r.status === 'ready') counts.ready++; });
  const tabs = [['open', 'פתוחים'], ['ready', 'מוכנים לאיסוף'], ['all', 'הכל']];
  $('#repairStatusFilter').innerHTML = tabs.map(([k, l]) => `<button class="${repairTab === k ? 'on' : ''}" data-rtab="${k}">${l}<b>${counts[k]}</b></button>`).join('');
  const q = $('#repairFilter').value.trim().toLowerCase();
  const list = db.repairs.filter(r =>
    (repairTab === 'all' || (repairTab === 'open' ? OPEN_STATUSES.includes(r.status) : r.status === repairTab)) &&
    (!q || [r.number, r.customer?.name, r.customer?.phone, r.device, r.imei, r.issue].join(' ').toLowerCase().includes(q)))
    .slice().reverse();
  $('#repairsTable').innerHTML = list.length ? list.map(r => {
    const days = Math.floor((Date.now() - r.ts) / 864e5);
    return `<tr>
    <td class="mono"><b>#${r.number}</b></td>
    <td>${new Date(r.ts).toLocaleDateString('he-IL')}<div class="muted">${days ? `לפני ${days} ימים` : 'היום'}</div></td>
    <td>${esc(r.customer?.name || '')}<div class="muted mono">${esc(r.customer?.phone || '')}</div></td>
    <td>${esc(r.device)}${r.imei ? `<div class="muted mono">${esc(r.imei)}</div>` : ''}</td>
    <td>${esc(r.issue)}</td>
    <td>${r.price ? money(r.price) : r.estimate ? `<span class="muted">הערכה ${money(r.estimate)}</span>` : '—'}</td>
    <td>${statusPill(r.status)}</td>
    <td class="nowrap"><button class="btn small secondary" data-rp-open="${r.id}">פתח</button>
      ${r.status === 'ready' ? `<button class="btn small primary" data-rp-deliver="${r.id}">מסירה וחיוב</button>` : ''}</td></tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">${q ? 'לא נמצא תיקון' : repairTab === 'ready' ? 'אין מכשירים שמחכים לאיסוף' : 'אין תיקונים פתוחים'}</td></tr>`;
  updateRepairBadge();
}

function newRepair(prefill = {}) {
  openModal(`<h3>קבלת מכשיר לתיקון</h3>
    <form class="form" id="rpForm" style="width:min(560px,86vw)">
      <div class="grid2">
        <label>טלפון לקוח<input name="phone" type="tel" required value="${esc(prefill.phone || '')}" list="custList2" autocomplete="off"></label>
        <label>שם לקוח<input name="name" required value="${esc(prefill.name || '')}"></label>
      </div>
      <datalist id="custList2">${db.customers.map(c => `<option value="${esc(c.phone)}">${esc(c.name)}</option>`).join('')}</datalist>
      <div class="grid2">
        <label>מכשיר (יצרן ודגם)<input name="device" required placeholder="לדוגמה: Galaxy S23, iPhone 13, מחשב נייד Lenovo"></label>
        <label>IMEI / מספר סידורי<input name="imei" class="mono"></label>
      </div>
      <label>תיאור התקלה<textarea name="issue" required placeholder="מה הלקוח מתאר, מתי זה התחיל"></textarea></label>
      <div class="grid2">
        <label>מצב חיצוני<input name="condition" placeholder="שריטות, סדק במסך, מכה בפינה..."></label>
        <label>הגיע עם<input name="accessories" placeholder="כיסוי, מטען, כרטיס SIM..."></label>
      </div>
      <div class="grid2">
        <label>קוד / תבנית פתיחה (לבדיקה)<input name="passcode" autocomplete="off"></label>
        <label>הערכת מחיר (₪)<input name="estimate" type="number" step="1" min="0"></label>
      </div>
      <label>מוכן משוער<input name="due" type="date"></label>
      <div class="actions"><button class="btn primary" type="submit" name="act" value="print">שמור והדפס תעודה</button>
        <button class="btn secondary" type="submit" name="act" value="save">שמור</button></div>
    </form>`);
  const f = $('#rpForm');
  f.elements.phone.addEventListener('change', () => { const c = findCustomerByPhone(f.elements.phone.value); if (c && !f.elements.name.value) f.elements.name.value = c.name; });
  f.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const cu = upsertCustomer({ name: d.name.trim(), phone: d.phone.trim() });
    const r = {
      id: uid(), number: db.settings.nextRepair++, ts: Date.now(), customerId: cu.id, customer: { name: cu.name, phone: cu.phone },
      device: d.device.trim(), imei: d.imei.trim(), issue: d.issue.trim(), condition: d.condition.trim(), accessories: d.accessories.trim(),
      passcode: d.passcode, estimate: Number(d.estimate) || 0, price: 0, due: d.due, status: 'received', notes: '',
      history: [{ ts: Date.now(), status: 'received', user: cashierName(), note: '' }],
    };
    db.repairs.push(r);
    save(); closeModal();
    if (e.submitter?.value === 'print') printHTML(repairSlipHTML(r));
    toast(`תיקון #${r.number} נפתח`);
    switchView('repairs');
  };
}

function openRepair(id) {
  const r = db.repairs.find(x => x.id === id);
  if (!r) return;
  const closed = !OPEN_STATUSES.includes(r.status);
  openModal(`<div style="width:min(620px,86vw)">
    <div class="ticket-head"><div><div class="ticket-no">#${r.number}</div><div class="muted">${fmtDate(r.ts)}</div></div><div>${statusPill(r.status)}</div></div>
    <dl class="kv">
      <dt>לקוח</dt><dd>${esc(r.customer?.name)} · <span class="mono">${esc(r.customer?.phone)}</span></dd>
      <dt>מכשיר</dt><dd>${esc(r.device)}${r.imei ? ` · <span class="mono">${esc(r.imei)}</span>` : ''}</dd>
      <dt>תקלה</dt><dd>${esc(r.issue)}</dd>
      ${r.condition ? `<dt>מצב חיצוני</dt><dd>${esc(r.condition)}</dd>` : ''}
      ${r.accessories ? `<dt>הגיע עם</dt><dd>${esc(r.accessories)}</dd>` : ''}
      ${r.passcode ? `<dt>קוד פתיחה</dt><dd class="mono">${esc(r.passcode)}</dd>` : ''}
      ${r.estimate ? `<dt>הערכת מחיר</dt><dd>${money(r.estimate)}</dd>` : ''}
      ${r.due ? `<dt>מוכן משוער</dt><dd>${new Date(r.due).toLocaleDateString('he-IL')}</dd>` : ''}
      ${r.saleNumber ? `<dt>חויב בקבלה</dt><dd>${r.saleNumber}</dd>` : ''}
    </dl>
    ${closed ? '' : `<form class="form" id="rpUpd" style="min-width:0">
      <div class="grid2">
        <label>סטטוס<select name="status">${OPEN_STATUSES.concat('cancelled').map(k => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${REPAIR_STATUS[k][0]}</option>`).join('')}</select></label>
        <label>מחיר סופי ללקוח (₪)<input name="price" type="number" step="1" min="0" value="${r.price || r.estimate || ''}"></label>
      </div>
      <label>הערת טכנאי (נשמרת בהיסטוריה)<input name="note" placeholder="מה נבדק, אילו חלקים הוזמנו..."></label>
      <div class="actions"><button class="btn primary" type="submit">עדכן</button>
        <button class="btn secondary" type="button" id="rpPrint">${svgIcon('i-print')}תעודת קבלה</button>
        ${r.status === 'ready' ? `<button class="btn ok" type="button" id="rpDeliver">מסירה וחיוב</button>` : ''}</div>
    </form>`}
    <h4>היסטוריה</h4>
    <ol class="timeline">${r.history.slice().reverse().map(h => `<li>${REPAIR_STATUS[h.status]?.[0] || h.status}${h.note ? ` – ${esc(h.note)}` : ''}<time>${fmtDate(h.ts)} · ${esc(h.user || '')}</time></li>`).join('')}</ol>
  </div>`);
  if (closed) return;
  $('#rpPrint').onclick = () => printHTML(repairSlipHTML(r));
  $('#rpDeliver') && ($('#rpDeliver').onclick = () => deliverRepair(r.id));
  $('#rpUpd').onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const price = Number(d.price) || 0;
    if (d.status !== r.status || d.note.trim()) r.history.push({ ts: Date.now(), status: d.status, user: cashierName(), note: d.note.trim() });
    const becameReady = d.status === 'ready' && r.status !== 'ready';
    r.status = d.status; r.price = price;
    save(); closeModal(); renderRepairs();
    toast(becameReady ? `תיקון #${r.number} מוכן. אפשר להודיע ללקוח: ${r.customer?.phone}` : 'התיקון עודכן');
  };
}

/** load the repair into the cart; the ticket closes when the sale is completed */
function deliverRepair(id) {
  const r = db.repairs.find(x => x.id === id);
  if (cart.items.length) return toast('יש לסיים או להשהות את העסקה הנוכחית קודם', true);
  closeModal();
  cart = newCart();
  cart.items.push({ key: uid(), productId: null, sku: `REPAIR-${r.number}`, name: `תיקון #${r.number}: ${r.device} – ${r.issue}`.slice(0, 90),
    price: r2(r.price || 0), cost: 0, qty: 1, discount: 0, serial: r.imei || '', warranty: Number(db.settings.repairWarranty) || 0, noPromo: true, repairId: r.id });
  $('#customerPhone').value = r.customer?.phone || ''; $('#customerName').value = r.customer?.name || '';
  const c = db.customers.find(x => x.id === r.customerId); if (c) showCustomerInfo(c);
  switchView('pos'); renderCart(); openCartSheet(true);
  toast(`תיקון #${r.number} בעגלה. אפשר להוסיף מוצרים ולעבור לתשלום.`);
}

function repairSlipHTML(r) {
  const s = db.settings;
  return `<div class="receipt">
    <div class="c">${logoHTML(s, 44)}<br><b style="font-size:16px">${esc(s.storeName)}</b><br>
      ${s.address ? esc(s.address) + '<br>' : ''}${s.phone ? 'טל׳ ' + esc(s.phone) : ''}</div>
    <hr><div class="c"><b>תעודת קבלת מכשיר לתיקון</b><div class="big">#${r.number}</div></div>
    <div>${fmtDate(r.ts)} · קיבל: ${esc(r.history[0]?.user || '')}</div><hr>
    <table>
      <tr><td>לקוח</td><td class="n">${esc(r.customer?.name)}</td></tr>
      <tr><td>טלפון</td><td class="n">${esc(r.customer?.phone)}</td></tr>
      <tr><td>מכשיר</td><td class="n">${esc(r.device)}</td></tr>
      ${r.imei ? `<tr><td>IMEI/S.N</td><td class="n">${esc(r.imei)}</td></tr>` : ''}
    </table><hr>
    <div><b>תקלה:</b> ${esc(r.issue)}</div>
    ${r.condition ? `<div><b>מצב:</b> ${esc(r.condition)}</div>` : ''}
    ${r.accessories ? `<div><b>הגיע עם:</b> ${esc(r.accessories)}</div>` : ''}
    ${r.estimate ? `<div><b>הערכת מחיר:</b> ${money(r.estimate)}</div>` : ''}
    ${r.due ? `<div><b>מוכן משוער:</b> ${new Date(r.due).toLocaleDateString('he-IL')}</div>` : ''}
    <hr><div style="font-size:11px">${esc(s.repairTerms || '')}</div>
    <br><div>חתימת הלקוח: ____________________</div><br>
    <div class="c">יש להציג תעודה זו באיסוף המכשיר</div>
  </div>`;
}

/* ================= אחרי מכירה ================= */
function afterSale(sale) {
  sale.customer = upsertCustomer(sale.customer);
  for (const it of sale.items) {
    if (!it.repairId) continue;
    const r = db.repairs.find(x => x.id === it.repairId);
    if (!r) continue;
    if (sale.type === 'sale') {
      r.status = 'delivered'; r.saleId = sale.id; r.saleNumber = sale.number;
      r.history.push({ ts: Date.now(), status: 'delivered', user: cashierName(), note: `נמסר וחויב בקבלה ${sale.number}` });
    }
  }
  setTimeout(updateRepairBadge, 0);
}

/* ================= wiring ================= */
document.addEventListener('DOMContentLoaded', () => {
  // employees + lock screen
  $('#pinpad').onclick = e => { const b = e.target.closest('button'); if (b) pinKey(b.dataset.k || b.textContent.trim()); };
  document.addEventListener('keydown', e => {
    if ($('#lock').hidden) return;
    if (/^\d$/.test(e.key)) pinKey(e.key);
    else if (e.key === 'Backspace') pinKey('back');
    else if (e.key === 'Escape') pinKey('clear');
    else if (e.key === 'Tab') return;
    e.preventDefault(); // keys belong to the lock screen, not to the field behind it
    e.stopPropagation();
  }, true);
  $('#lockBtn').onclick = lockRegister;
  document.addEventListener('keydown', e => { if (e.key === 'F12' && $('#lock').hidden) { e.preventDefault(); lockRegister(); } });
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, bumpIdle, { passive: true }));
  $('#addUserBtn').onclick = () => editUser(null);
  $('#usersTable').onclick = e => { const d = e.target.dataset; if (d.uedit) editUser(d.uedit); else if (d.udel) deleteUser(d.udel); };

  // customers
  $('#customerPhone').addEventListener('input', onCustomerPhone);
  $('#custFilter').oninput = renderCustomers;
  $('#addCustomerBtn').onclick = () => editCustomer(null);
  $('#customersTable').onclick = e => { const id = e.target.dataset.custOpen; if (id) openCustomer(id); };
  $('#custInfo').onclick = e => { const id = e.target.dataset.custOpen; if (id) openCustomer(id); };

  // repairs
  $('#newRepairBtn').onclick = () => newRepair();
  $('#repairFilter').oninput = renderRepairs;
  $('#repairStatusFilter').onclick = e => { const b = e.target.closest('[data-rtab]'); if (b) { repairTab = b.dataset.rtab; renderRepairs(); } };
  $('#repairsTable').onclick = e => { const d = e.target.dataset; if (d.rpOpen) openRepair(d.rpOpen); else if (d.rpDeliver) deliverRepair(d.rpDeliver); };
  updateRepairBadge();

  // sign in: keep the employee for this browser tab, otherwise show the lock screen
  let saved = null;
  try { saved = sessionStorage.getItem('pos.user'); } catch { /* ignore */ }
  const u = saved && db.users.find(x => x.id === saved);
  if (u) { setUser(u); bumpIdle(); } else lockRegister();
});
