/* עמוד העסקים של S.Y Mall: הרשמה, מנוי חודשי ב-PayPal, וניהול החנות */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const fmt = (n) => `${Number(n).toLocaleString('he-IL')} ₪`;
  const TOKEN_KEY = 'symall-token';
  const SLOT_NAMES = { L1: 'שמאל 1', L2: 'שמאל 2', L3: 'שמאל 3', L4: 'שמאל 4 (ליד הרחבה)', R1: 'ימין 1', R2: 'ימין 2', R3: 'ימין 3', R4: 'ימין 4 (ליד הרחבה)' };

  async function api(url, { method = 'GET', body, token } = {}) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `שגיאה (${res.status})`);
    return json;
  }

  // המפתח מגיע בקישור (#t=...) או נשמר בדפדפן
  function getToken() {
    const m = /[#&]t=([\w-]{20,})/.exec(location.hash);
    if (m) { try { localStorage.setItem(TOKEN_KEY, m[1]); } catch (e) { /* ignore */ } return m[1]; }
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  const manageLink = (t) => `${location.origin}${location.pathname}#t=${t}`;

  let mall = null;
  let applied = null; // { merchantId, token, planId, price, payments }

  /* ---------- הרשמה ---------- */
  function renderPlans() {
    const box = $('#plans'); box.innerHTML = '';
    mall.plans.forEach((p, i) => {
      const l = h('label', 'plan');
      const r = h('input'); r.type = 'radio'; r.name = 'plan'; r.value = p.id; r.checked = p.popular || (!mall.plans.some((x) => x.popular) && i === 0);
      r.setAttribute('aria-label', `${p.name} – ${p.price} ₪ לחודש`);
      if (p.popular) l.append(h('span', 'tag', 'הכי פופולרי'));
      l.append(r, h('h3', null, p.name));
      const pr = h('div', 'price', fmt(p.price)); pr.append(h('small', null, ' / חודש')); l.append(pr);
      const ul = h('ul'); p.features.forEach((f) => ul.append(h('li', null, f))); l.append(ul);
      box.append(l);
    });
  }
  function renderMap() {
    ['L', 'R'].forEach((side) => {
      const col = $(`#col-${side}`); col.innerHTML = '';
      mall.slots.filter((s) => s.id[0] === side).forEach((s) => {
        const demo = s.status === 'open' && s.store && s.store.demo;
        const free = s.status === 'free' || demo;
        const l = h('label', 'slot' + (free ? '' : ' taken'));
        const r = h('input'); r.type = 'radio'; r.name = 'slot'; r.value = s.id; r.disabled = !free;
        r.setAttribute('aria-label', `${SLOT_NAMES[s.id]} – ${free ? 'פנוי' : 'תפוס'}`);
        l.append(r, h('b', null, SLOT_NAMES[s.id]), h('span', null, free ? (demo ? 'פנוי (כרגע חנות לדוגמה)' : 'פנוי') : s.store ? `תפוס · ${s.store.name}` : 'שמור'));
        col.append(l);
      });
    });
    const first = document.querySelector('input[name="slot"]:not(:disabled)');
    if (first && !document.querySelector('input[name="slot"]:checked')) first.checked = true;
  }
  function summary() {
    const plan = mall.plans.find((p) => p.id === (document.querySelector('input[name="plan"]:checked') || {}).value);
    const slot = (document.querySelector('input[name="slot"]:checked') || {}).value;
    $('#summary').textContent = plan && slot ? `${plan.name} ב${SLOT_NAMES[slot]} · ${fmt(plan.price)} לחודש · ביטול בכל חודש` : '';
  }

  async function submitApply(e) {
    e.preventDefault();
    const f = e.target; const err = $('#apply-err'); err.textContent = '';
    [...f.querySelectorAll('[aria-invalid]')].forEach((x) => x.removeAttribute('aria-invalid'));
    const data = Object.fromEntries(new FormData(f).entries());
    data.plan = (document.querySelector('input[name="plan"]:checked') || {}).value;
    data.slot = (document.querySelector('input[name="slot"]:checked') || {}).value;
    data.acceptTerms = f.acceptTerms.checked;
    const bad = (name, msg) => { const el = f.elements[name]; if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); } err.textContent = msg; };
    if (!data.plan) return (err.textContent = 'נא לבחור מסלול');
    if (!data.slot) return (err.textContent = 'נא לבחור מקום במתחם');
    if ((data.name || '').trim().length < 2) return bad('name', 'נא למלא את שם העסק');
    if ((data.contactName || '').trim().length < 2) return bad('contactName', 'נא למלא שם איש קשר');
    if ((data.phone || '').replace(/\D/g, '').length < 9) return bad('phone', 'נא למלא טלפון תקין');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) return bad('email', 'נא למלא אימייל תקין');
    if (!data.acceptTerms) return bad('acceptTerms', 'יש לאשר את חוזה השכירות');
    const btn = $('#apply-btn'); btn.disabled = true; btn.textContent = 'רגע…';
    try {
      applied = await api('/api/mall/apply', { method: 'POST', body: data });
      try { localStorage.setItem(TOKEN_KEY, applied.token); } catch (e2) { /* ignore */ }
      showPay(data);
    } catch (e2) { err.textContent = e2.message; } finally { btn.disabled = false; btn.textContent = 'המשך לתשלום'; }
  }

  function showPay(data) {
    $('#pay').hidden = false;
    $('#pay').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#pay-text').textContent = `מנוי חודשי של ${fmt(applied.price)} לחנות "${data.name}". החיוב הראשון היום, ואחריו פעם בחודש. אפשר לבטל בכל זמן מעמוד הניהול.`;
    if (applied.payments === 'paypal' && applied.planId) loadPayPal();
    else if (applied.payments === 'demo') { $('#demo-activate').hidden = false; }
    else $('#pay-err').textContent = 'התשלומים עדיין לא מחוברים בשרת (חסרים פרטי PayPal). פנו לבעלי המתחם.';
  }

  async function activate(subscriptionId) {
    const m = await api('/api/mall/activate', { method: 'POST', token: applied.token, body: { subscriptionId } });
    location.hash = `t=${applied.token}`;
    openManage(applied.token, m);
  }

  async function loadPayPal() {
    const cfg = await api('/api/config');
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&vault=true&intent=subscription&currency=ILS&locale=he_IL`;
      s.onload = res; s.onerror = () => rej(new Error('PayPal לא נטען'));
      document.head.append(s);
    }).catch((e) => { $('#pay-err').textContent = e.message; });
    if (!window.paypal) return;
    window.paypal.Buttons({
      style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'subscribe' },
      createSubscription: (d, actions) => actions.subscription.create({ plan_id: applied.planId, custom_id: applied.merchantId }),
      onApprove: async (d) => {
        $('#pay-err').textContent = '';
        try { await activate(d.subscriptionID); } catch (e) { $('#pay-err').textContent = e.message; }
      },
      onError: () => { $('#pay-err').textContent = 'התשלום לא הושלם. נסו שוב.'; },
    }).render('#paypal-subscribe');
  }

  /* ---------- ניהול החנות ---------- */
  let token = null; let me = null;
  const STATUS = {
    active: ['החנות פתוחה במתחם', ''], pending: ['ממתין לתשלום המנוי', 'warn'], suspended: ['מושהה – החיוב החודשי נכשל', 'off'],
    cancelling: ['המנוי בוטל – החנות פתוחה עד סוף התקופה', 'warn'], ended: ['החנות סגורה', 'off'],
  };

  function openManage(t, data) {
    token = t;
    $('#signup').hidden = true; $('#manage').hidden = false; $('#nav-manage').hidden = false;
    if (data) renderManage(data); else refresh();
    window.scrollTo(0, 0);
  }
  async function refresh() {
    try { renderManage(await api('/api/mall/me', { token })); } catch (e) {
      $('#m-title').textContent = 'לא הצלחנו לפתוח את החנות';
      $('#m-status').textContent = e.message; $('#m-status').className = 'status off';
    }
  }
  function renderManage(m) {
    me = { ...me, ...m };
    m = me;
    $('#m-title').textContent = m.name;
    const [txt, cls] = STATUS[m.status] || [m.status, ''];
    $('#m-status').textContent = `${txt} · ${m.planName} · ${fmt(m.price)} לחודש`;
    $('#m-status').className = `status ${cls}`;
    const sf = $('#store-form');
    if (m.categories || mall) fillCategories($('#m-category'), (m.categories || mall.categories));
    sf.name.value = m.name; sf.tagline.value = m.tagline || ''; sf.category.value = m.category; sf.color.value = m.color;
    $('#p-count').textContent = `(${m.products.length} מתוך ${m.maxProducts})`;
    const list = $('#products'); list.innerHTML = '';
    if (!m.products.length) list.append(h('li', 'info', 'עוד אין מוצרים. הוסיפו את הראשון למעלה.'));
    m.products.forEach((p) => {
      const li = h('li'); const pic = h('div', 'pic');
      if (p.image) { const img = h('img'); img.src = p.image; img.alt = p.name; pic.append(img); } else pic.textContent = '🛍️';
      const info = h('div', 'info'); info.append(h('b', null, p.name), h('span', null, fmt(p.price)));
      const del = h('button', 'btn', 'הסרה'); del.type = 'button';
      del.addEventListener('click', async () => { if (!confirm(`להסיר את "${p.name}"?`)) return; renderManage(await api(`/api/mall/me/products/${p.id}`, { method: 'DELETE', token })); });
      info.append(del); li.append(pic, info); list.append(li);
    });
    const ob = $('#orders'); ob.innerHTML = '';
    const orders = m.orders || [];
    if (!orders.length) ob.append(h('p', 'hint', 'עוד אין הזמנות.'));
    else {
      const t = h('table'); const head = h('tr'); ['תאריך', 'מוצרים', 'סכום', 'משלוח אל'].forEach((x) => head.append(h('th', null, x))); t.append(head);
      orders.forEach((o) => {
        const tr = h('tr');
        tr.append(h('td', null, new Date(o.time).toLocaleString('he-IL')));
        tr.append(h('td', null, o.lines.map((l) => `${l.name} × ${l.qty}`).join(', ')));
        tr.append(h('td', null, fmt(o.lines.reduce((a, l) => a + l.price * l.qty, 0))));
        const d = o.delivery || {};
        tr.append(h('td', null, [d.name, d.phone, [d.street, d.house, d.city].filter(Boolean).join(' '), d.slotLabel].filter(Boolean).join(' · ')));
        t.append(tr);
      });
      ob.append(t);
    }
    $('#sub-text').textContent = m.status === 'cancelling'
      ? `המנוי בוטל. החנות פתוחה עד ${new Date(m.activeUntil).toLocaleDateString('he-IL')}.`
      : `מנוי חודשי של ${fmt(m.price)}. ביטול עוצר את החיובים, והחנות נשארת פתוחה עד סוף החודש ששולם.`;
    $('#cancel-sub').hidden = !['active', 'suspended'].includes(m.status);
  }
  function fillCategories(sel, list) {
    if (sel.options.length) return;
    list.forEach((c) => sel.append(new Option(c, c)));
  }

  // הקטנת תמונה בדפדפן לפני העלאה (עד 900 פיקסלים, JPEG)
  function readImage(file) {
    return new Promise((res, rej) => {
      if (!file) return res(null);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => rej(new Error('לא הצלחנו לקרוא את התמונה'));
      img.src = URL.createObjectURL(file);
    });
  }

  function bindManage() {
    $('#store-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try { renderManage(await api('/api/mall/me', { method: 'PUT', token, body: { name: f.name.value, tagline: f.tagline.value, category: f.category.value, color: f.color.value } })); $('#store-ok').textContent = 'נשמר ✓'; setTimeout(() => { $('#store-ok').textContent = ''; }, 2500); } catch (err) { $('#store-ok').textContent = err.message; }
    });
    const pf = $('#product-form');
    pf.image.addEventListener('change', async () => {
      const url = await readImage(pf.image.files[0]).catch(() => null);
      $('#p-preview').hidden = !url; if (url) $('#p-preview').src = url;
    });
    pf.addEventListener('submit', async (e) => {
      e.preventDefault(); $('#p-err').textContent = '';
      try {
        const image = await readImage(pf.image.files[0]);
        renderManage(await api('/api/mall/me/products', { method: 'POST', token, body: { name: pf.name.value, price: pf.price.value, description: pf.description.value, image } }));
        pf.reset(); $('#p-preview').hidden = true;
      } catch (err) { $('#p-err').textContent = err.message; }
    });
    $('#cancel-sub').addEventListener('click', async () => {
      if (!confirm('לבטל את המנוי? החיובים ייעצרו, והחנות תישאר פתוחה עד סוף החודש ששולם.')) return;
      try { renderManage(await api('/api/mall/me/cancel', { method: 'POST', token, body: {} })); } catch (err) { alert(err.message); }
    });
    $('#copy-link').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(manageLink(token)); $('#copy-link').textContent = 'הקישור הועתק ✓'; } catch (e) { prompt('העתיקו את הקישור:', manageLink(token)); }
    });
    $('#demo-activate').addEventListener('click', async () => { try { await activate(null); } catch (e) { $('#pay-err').textContent = e.message; } });
  }

  async function init() {
    bindManage();
    let offline = false;
    try { mall = await api('/api/mall'); } catch (e) {
      // תצוגה בלי שרת: מציגים את המסלולים והמפה, וההרשמה עצמה פועלת רק באתר עם השרת
      offline = true;
      mall = {
        termsVersion: '2026-11-21', payments: 'off',
        plans: [
          { id: 'kiosk', name: 'דוכן', price: 149, maxProducts: 12, features: ['דוכן ממותג במתחם', 'עד 12 מוצרים', 'הזמנות ומשלוחים דרך המתחם', 'ביטול בכל חודש'] },
          { id: 'store', name: 'חנות', price: 349, maxProducts: 40, popular: true, features: ['חנות מלאה עם חלון ראווה', 'עד 40 מוצרים', 'הופעה במדריך המתחם', 'הזמנות ומשלוחים דרך המתחם', 'ביטול בכל חודש'] },
          { id: 'flagship', name: 'חנות דגל', price: 749, maxProducts: 150, features: ['מיקום מרכזי ושלט מואר', 'עד 150 מוצרים', 'קידום בעמוד הפתיחה', 'הזמנות ומשלוחים דרך המתחם', 'ביטול בכל חודש'] },
        ],
        categories: ['אופנה', 'אוכל ומשקאות', 'בית ועיצוב', 'ילדים וצעצועים', 'יופי וטיפוח', 'ספורט', 'חיות מחמד', 'מתנות ופרחים', 'אלקטרוניקה', 'שירותים', 'אחר'],
        slots: ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'].map((id) => ({ id, status: 'free' })),
      };
      const note = h('p', 'summary', 'זוהי תצוגה מקדימה: ההרשמה והתשלום פועלים באתר עצמו, כשהשרת של המתחם רץ.');
      $('#signup').prepend(note);
    }
    $('#terms-version').textContent = mall.termsVersion;
    fillCategories($('#category'), mall.categories);
    renderPlans(); renderMap(); summary();
    document.addEventListener('change', (e) => { if (e.target.name === 'plan' || e.target.name === 'slot') summary(); });
    $('#apply').addEventListener('submit', (e) => { if (offline) { e.preventDefault(); $('#apply-err').textContent = 'ההרשמה פועלת רק באתר עם השרת של המתחם.'; return; } submitApply(e); });
    const t = getToken();
    if (t) {
      $('#nav-manage').hidden = false;
      if (/[#&]t=/.test(location.hash)) openManage(t);
      $('#nav-manage').addEventListener('click', (e) => { e.preventDefault(); openManage(t); });
    }
  }
  init();
})();
