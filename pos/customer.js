'use strict';
/* ============================================================
   מסך לקוח: מציג את הקנייה בזמן אמת, ומריץ מבצעים כשאין לקוחות
   מקבל עדכונים מהקופה דרך BroadcastChannel / localStorage
   ============================================================ */

let store = loadStore();
let state = { phase: 'idle' };
let slideIdx = 0, slideTimer = null, cardIdx = 0, cardTimer = null, thanksTimer = null;
let lastItemCount = 0;

function loadStore() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { settings: { ...BRAND_DEFAULTS, thanksSeconds: 8, slideSeconds: 7, ...(d.settings || {}) }, promotions: d.promotions || [], products: d.products || [] };
  } catch { return { settings: { ...BRAND_DEFAULTS, thanksSeconds: 8, slideSeconds: 7 }, promotions: [], products: [] }; }
}

function screenPromos() {
  return store.promotions.filter(p => p.showOnScreen && promoActive(p));
}

/* ---------------- brand ---------------- */
function renderBrand() {
  const s = store.settings;
  applyBrand(s);
  $('#cLogo').innerHTML = logoHTML(s, 54);
  $('#cName').textContent = s.storeName;
  $('#cSlogan').textContent = s.slogan || '';
  document.title = s.storeName + ' – מסך לקוח';
}

/* ---------------- slideshow (no customers) ---------------- */
function regularPriceLine(p) {
  if (p.scope !== 'products' || (p.productIds || []).length !== 1) return '';
  const prod = store.products.find(x => x.id === p.productIds[0]);
  if (!prod) return '';
  if (p.type === 'bundle') return `<div class="was">במקום <s>${money(prod.price * p.buyQty)}</s> – <b>${money(Number(p.price))}</b></div>`;
  if (p.type === 'xfory') return `<div class="was">${p.buyQty} יח׳ במחיר של ${p.payQty} · <b>${money(prod.price * p.payQty)}</b> במקום <s>${money(prod.price * p.buyQty)}</s></div>`;
  if (p.type === 'pct') return `<div class="was"><s>${money(prod.price)}</s> <b>${money(r2(prod.price * (1 - p.pct / 100)))}</b></div>`;
  return `<div class="was">${money(prod.price)}</div>`;
}

function buildSlides() {
  const s = store.settings;
  const slides = [`<div class="slide welcome">${logoHTML(s, 160)}<h1>ברוכים הבאים ל${esc(s.storeName)}</h1>${s.slogan ? `<p>${esc(s.slogan)}</p>` : ''}</div>`];
  for (const p of screenPromos()) {
    slides.push(`<div class="slide">
      <div class="txt">
        <div class="badge">${esc(promoBadge(p))}</div>
        <h1>${esc(p.name)}</h1>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        ${regularPriceLine(p)}
        ${p.to ? `<div class="valid">בתוקף עד ${esc(p.to.split('-').reverse().join('/'))} · בכפוף למלאי</div>` : ''}
      </div>
      ${p.image ? `<img class="pic" src="${p.image}" alt="">` : ''}
    </div>`);
  }
  $('#slides').innerHTML = slides.join('');
  $('#dots').innerHTML = slides.length > 1 ? slides.map(() => '<span></span>').join('') : '';
  slideIdx = slides.length > 1 ? 1 : 0; // open on the first promotion
  showSlide();
}

function showSlide() {
  const all = document.querySelectorAll('.slide');
  if (!all.length) return;
  slideIdx %= all.length;
  all.forEach((el, i) => el.classList.toggle('on', i === slideIdx));
  document.querySelectorAll('#dots span').forEach((el, i) => el.classList.toggle('on', i === slideIdx));
}

function startSlideshow() {
  stopSlideshow();
  buildSlides();
  slideTimer = setInterval(() => { slideIdx++; showSlide(); }, Math.max(3, Number(store.settings.slideSeconds) || 7) * 1000);
}
function stopSlideshow() { clearInterval(slideTimer); slideTimer = null; }

/* ---------------- rotating promo card during a purchase ---------------- */
function showPromoCard() {
  const list = screenPromos();
  const box = $('#cPromoCard');
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const p = list[cardIdx++ % list.length];
  box.style.opacity = 0;
  setTimeout(() => {
    box.innerHTML = `<div class="lbl">מבצעים בחנות</div><span class="badge">${esc(promoBadge(p))}</span>
      <h3>${esc(p.name)}</h3><p>${esc(p.description || '')}</p>${p.image ? `<img src="${p.image}" alt="">` : ''}`;
    box.style.opacity = 1;
  }, 250);
}
function startCards() { if (!cardTimer) { showPromoCard(); cardTimer = setInterval(showPromoCard, 6000); } }
function stopCards() { clearInterval(cardTimer); cardTimer = null; }

/* ---------------- render by phase ---------------- */
function render() {
  const ph = state.phase;
  const idle = ph === 'idle';
  const showCart = ph === 'cart' || ph === 'pay';

  $('#idle').classList.toggle('hidden', !(idle || ph === 'done'));
  $('#cart').classList.toggle('hidden', !showCart);

  if (idle || ph === 'done') { if (!slideTimer) startSlideshow(); stopCards(); }
  else { stopSlideshow(); startCards(); }

  if (showCart) renderCart();
  renderOverlay();
}

function renderCart() {
  const st = state;
  $('#cWelcome').textContent = st.refund ? 'החזרת מוצרים' : (st.customer ? `שלום ${st.customer}, תודה שבחרת בנו!` : 'הקנייה שלך');
  const items = st.items || [];
  $('#cItems').innerHTML = items.map((it, i, arr) => `
    <div class="c-item ${items.length > lastItemCount && i === arr.length - 1 ? 'new' : ''}">
      <div class="n">${esc(it.name)}</div>
      <div class="t">${money(it.total)}</div>
      <div class="q">${it.qty} × ${money(it.price)}</div><div></div>
      ${it.promo ? `<div class="pr">🏷 ${esc(it.promoNames.join(', '))}: חסכת ${money(it.promo)}</div>` : ''}
    </div>`).join('');
  lastItemCount = items.length;
  const list = $('#cItems'); list.scrollTop = list.scrollHeight;

  const t = st.totals || {};
  const saved = Math.abs((t.promo || 0) + (t.discount || 0));
  $('#cSub').textContent = money(t.subtotal || 0);
  $('#cPromoRow').hidden = !saved;
  $('#cSave').textContent = money(-saved);
  $('#cTotalLbl').textContent = st.refund ? 'זיכוי' : 'לתשלום';
  $('#cTotal').textContent = money(Math.abs(t.total || 0));
  $('#cSavedBanner').textContent = saved && !st.refund ? `🎉 חסכת ${money(saved)} בקנייה הזו!` : '';
  $('#cHints').innerHTML = st.refund ? '' : (st.hints || []).map(h => `<div>💡 ${esc(h)}</div>`).join('');
}

function renderOverlay() {
  const st = state, ov = $('#overlay'), box = $('#overlayBox');
  clearTimeout(thanksTimer);
  if (st.phase === 'pay') {
    ov.classList.remove('hidden');
    const rem = st.remaining;
    box.innerHTML = `<div class="lbl">${st.refund ? 'סכום הזיכוי' : 'סכום לתשלום'}</div><div class="big">${money(st.due)}</div>
      ${st.paid ? `<div class="lbl">שולם ${money(st.paid)}${rem > 0 ? ` · נותר ${money(rem)}` : ''}</div>` : ''}
      ${rem < 0 ? `<div class="chg">עודף: ${money(-rem)}</div>` : ''}`;
  } else if (st.phase === 'done') {
    ov.classList.remove('hidden');
    box.innerHTML = `${logoHTML(store.settings, 90)}<div class="ty">${st.refund ? 'הזיכוי בוצע' : 'תודה רבה!'}</div>
      ${st.change ? `<div class="chg">העודף שלך: ${money(st.change)}</div>` : ''}
      ${st.saved && !st.refund ? `<div class="sv">חסכת היום ${money(st.saved)} 🎉</div>` : ''}
      <div class="lbl">נשמח לראותך שוב</div>`;
    thanksTimer = setTimeout(() => { state = { phase: 'idle' }; render(); }, Math.max(2, Number(store.settings.thanksSeconds) || 8) * 1000);
  } else {
    ov.classList.add('hidden');
  }
}

/* ---------------- incoming updates ---------------- */
let lastTs = 0;
function onState(msg) {
  if (!msg || msg.ts < lastTs) return;
  // keep the "thank you" screen up until it times out or a new purchase starts
  if (state.phase === 'done' && msg.phase === 'idle') return;
  lastTs = msg.ts;
  if (msg.phase === 'idle') lastItemCount = 0;
  state = msg;
  render();
}

displayChannel?.addEventListener('message', e => onState(e.data));
window.addEventListener('storage', e => {
  if (e.key === DISPLAY_KEY && e.newValue) { try { onState(JSON.parse(e.newValue)); } catch { /* ignore */ } }
  if (e.key === LS_KEY) {
    store = loadStore(); renderBrand();
    if (slideTimer) startSlideshow();
  }
});

/* ---------------- init ---------------- */
renderBrand();
try { const init = JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null'); if (init && init.phase !== 'done') state = init; } catch { /* ignore */ }
if (state.phase === 'pay') state.phase = 'cart';
render();

const tick = () => { $('#cClock').textContent = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 10000);

document.addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', () => { $('#fsHint').hidden = !!document.fullscreenElement; });
setTimeout(() => { $('#fsHint').hidden = true; }, 15000);
