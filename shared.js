'use strict';
/* ============================================================
   קוד משותף לקופה ולמסך הלקוח: עזרים, מיתוג ומנוע מבצעים
   ============================================================ */

const LS_KEY = 'pos.v1';
const DISPLAY_KEY = 'pos.display';

const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const money = n => (n < 0 ? '-' : '') + '₪' + Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function lineTotal(it) {
  const gross = it.price * it.qty;
  const d = it.discount || 0; // percent
  return r2(gross - gross * d / 100);
}

/* ---------------- branding ---------------- */
const BRAND_DEFAULTS = {
  storeName: 'פרו־טול',
  slogan: 'כלים של מקצוענים',
  brandColor: '#f26b1d',
  brandDark: '#1b2a41',
  logo: '',
};

function shade(hex, pct) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const f = c => Math.max(0, Math.min(255, Math.round(c + (pct < 0 ? c : 255 - c) * pct / 100)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** logo image if uploaded, otherwise an SVG monogram in brand colors */
function logoHTML(s, size = 40) {
  if (s.logo) return `<img class="logo-img" src="${s.logo}" alt="" style="height:${size}px">`;
  const letters = esc(String(s.storeName || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2));
  return `<svg class="logo-svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="${esc(s.brandColor)}"/>
    <text x="20" y="26" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" font-family="Arial">${letters}</text></svg>`;
}

function applyBrand(s) {
  const root = document.documentElement.style;
  root.setProperty('--primary', s.brandColor);
  root.setProperty('--primary-d', shade(s.brandColor, -18));
  root.setProperty('--primary-l', shade(s.brandColor, 85));
  root.setProperty('--brand-dark', s.brandDark);
  root.setProperty('--brand-dark-l', shade(s.brandDark, 18));
}

/* ---------------- promotions ---------------- */
const PROMO_TYPES = {
  xfory: 'קנה X שלם על Y (1+1, 3 ב־2...)',
  bundle: 'X יחידות במחיר קבוע',
  pct: 'אחוז הנחה',
  threshold: 'הנחה על קנייה מעל סכום',
  ad: 'מודעה בלבד (למסך הלקוח)',
};

function promoActive(p, now = Date.now()) {
  if (!p.active) return false;
  const d = dayKey(now);
  return (!p.from || d >= p.from) && (!p.to || d <= p.to);
}

function promoMatches(p, item, products) {
  if (!item.productId) return p.scope === 'all';
  if (p.scope === 'all') return true;
  if (p.scope === 'category') {
    const prod = products.find(x => x.id === item.productId);
    return !!prod && prod.category === p.category;
  }
  return (p.productIds || []).includes(item.productId);
}

function promoBadge(p) {
  if (p.badge) return p.badge;
  switch (p.type) {
    case 'xfory': return p.payQty === 1 && p.buyQty === 2 ? '1+1' : `${p.buyQty} ב־${p.payQty}`;
    case 'bundle': return `${p.buyQty} ב־₪${p.price}`;
    case 'pct': return `${p.pct}%-`;
    case 'threshold': return `${p.pct}%-`;
    default: return 'מבצע';
  }
}

function promoScopeName(p, products) {
  if (p.scope === 'category') return p.category;
  if (p.scope === 'products') {
    const names = (p.productIds || []).map(id => products.find(x => x.id === id)?.name).filter(Boolean);
    return names.length === 1 ? names[0] : 'מוצרי המבצע';
  }
  return 'כל המוצרים';
}

/**
 * Applies active promotions to cart items.
 * Item promotions run in list order; a line already discounted by one promotion is not used by another.
 * Returns { total, applied:[{id,name,amount}], perLine:{key:{amount,names[]}}, hints:[string] }
 */
function applyPromotions(items, promos, products, now = Date.now()) {
  const res = { total: 0, applied: [], perLine: {}, hints: [] };
  const active = (promos || []).filter(p => promoActive(p, now) && p.type !== 'ad');
  const used = new Set();
  const add = (p, key, amount) => {
    if (amount <= 0) return;
    const pl = res.perLine[key] ||= { amount: 0, names: [] };
    pl.amount = r2(pl.amount + amount);
    if (!pl.names.includes(p.name)) pl.names.push(p.name);
  };
  const order = { xfory: 0, bundle: 1, pct: 2, threshold: 3 };

  for (const p of active.filter(p => p.type !== 'threshold').sort((a, b) => order[a.type] - order[b.type])) {
    const lines = items.filter(it => !used.has(it.key) && it.qty > 0 && promoMatches(p, it, products));
    if (!lines.length) continue;
    let sum = 0;
    const touched = new Set();

    if (p.type === 'pct') {
      for (const it of lines) {
        const a = r2(lineTotal(it) * (Number(p.pct) || 0) / 100);
        add(p, it.key, a); sum += a; touched.add(it.key);
      }
    } else if (p.type === 'xfory' || p.type === 'bundle') {
      const N = Math.max(1, Math.floor(Number(p.buyQty) || 0));
      // group units: per product, or pooled for a category / "all" scope
      const groups = {};
      for (const it of lines) {
        const g = p.scope === 'products' ? it.productId : 'pool';
        const unit = it.qty ? lineTotal(it) / it.qty : 0;
        for (let i = 0; i < Math.floor(it.qty); i++) (groups[g] ||= []).push({ key: it.key, unit, name: it.name });
      }
      for (const units of Object.values(groups)) {
        const sets = Math.floor(units.length / N);
        if (units.length % N === N - 1 && N > 1) {
          res.hints.push(p.type === 'xfory'
            ? `הוסף עוד יחידה של ${units[0].name} ונצל את המבצע "${p.name}"`
            : `עוד יחידה אחת של ${units[0].name} ותקבל ${N} ב־₪${p.price}`);
        }
        if (!sets) continue;
        if (p.type === 'xfory') {
          const M = Math.max(0, Math.min(N, Math.floor(Number(p.payQty) || 0)));
          const free = sets * (N - M);
          units.sort((a, b) => a.unit - b.unit); // cheapest units are free
          for (let i = 0; i < free; i++) { const u = units[i]; add(p, u.key, r2(u.unit)); sum += u.unit; }
          units.forEach(u => touched.add(u.key));
        } else {
          units.sort((a, b) => b.unit - a.unit);
          for (let s = 0; s < sets; s++) {
            const grp = units.slice(s * N, s * N + N);
            const full = grp.reduce((a, u) => a + u.unit, 0);
            const save = r2(full - Number(p.price || 0));
            if (save <= 0) continue;
            grp.forEach(u => add(p, u.key, r2(save * u.unit / full)));
            sum += save;
          }
          units.forEach(u => touched.add(u.key));
        }
      }
    }
    sum = r2(sum);
    if (sum > 0) {
      res.applied.push({ id: p.id, name: p.name, amount: sum });
      res.total = r2(res.total + sum);
      touched.forEach(k => used.add(k));
    }
  }

  // spend thresholds: the best qualifying one applies to the remaining amount
  const base = r2(items.reduce((s, it) => s + lineTotal(it), 0) - res.total);
  const th = active.filter(p => p.type === 'threshold').sort((a, b) => Number(a.minAmount) - Number(b.minAmount));
  const ok = th.filter(p => base >= Number(p.minAmount)).sort((a, b) => b.pct - a.pct)[0];
  if (ok && base > 0) {
    const a = r2(base * Number(ok.pct) / 100);
    res.applied.push({ id: ok.id, name: ok.name, amount: a });
    res.total = r2(res.total + a);
  }
  const next = th.find(p => base > 0 && base < Number(p.minAmount) && (!ok || p.pct > ok.pct));
  if (next) {
    const gap = r2(Number(next.minAmount) - base);
    if (gap <= Number(next.minAmount) * 0.5) res.hints.push(`עוד ${money(gap)} בקנייה ותקבל ${next.pct}% הנחה על כל הקנייה!`);
  }
  return res;
}

/* ---------------- cashier → customer screen channel ---------------- */
const displayChannel = 'BroadcastChannel' in window ? new BroadcastChannel('pos-display') : null;
