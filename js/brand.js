/* מיתוג S.Y Phone Truck – הלוגו של העסק.
 * assets/brand/badge.webp – התג העגול המלא (משאית, מסך פתיחה)
 * assets/brand/sy.webp    – סמל SY (סרגל עליון, אייקון)
 * צבעי המותג: צהוב, כחול ושחור.
 */
(function () {
  'use strict';

  const IMG = { badge: 'assets/brand/badge.webp', mark: 'assets/brand/sy.webp', favicon: 'assets/brand/favicon.png' };
  const COLORS = { yellow: '#ffd21f', blue: '#1e6bff', ink: '#070b16' };
  const PHONE = '052-546-6304';
  const SITE = 'phonetruck.co.il';

  const images = {};
  const waiting = [];
  function load(key) {
    const im = new Image();
    im.onload = () => { waiting.splice(0).forEach((fn) => fn()); if (window.StoreTruck) window.StoreTruck.redraw(); };
    im.src = IMG[key];
    images[key] = im;
  }
  load('badge'); load('mark');
  const ready = (k) => images[k] && images[k].complete && images[k].naturalWidth > 0;

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  }

  // סמל SY בריבוע מעוגל
  function drawMark(ctx, x, y, s) {
    ctx.save();
    rr(ctx, x, y, s, s, s * 0.2); ctx.fillStyle = COLORS.ink; ctx.fill(); ctx.clip();
    if (ready('mark')) ctx.drawImage(images.mark, x, y, s, s);
    ctx.restore();
    ctx.save(); rr(ctx, x, y, s, s, s * 0.2); ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = s * 0.035; ctx.stroke(); ctx.restore();
  }

  // התג העגול המלא
  function drawBadge(ctx, cx, cy, d) {
    if (!ready('badge')) return;
    ctx.save();
    ctx.shadowColor = 'rgba(30,107,255,0.55)'; ctx.shadowBlur = d * 0.06;
    ctx.drawImage(images.badge, cx - d / 2, cy - d / 2, d, d);
    ctx.restore();
  }

  // "PHONE TRUCK" – PHONE בלבן ו-TRUCK בצהוב, נטוי ומודגש. מחזיר רוחב
  function drawWordmark(ctx, x, yBase, h, { align = 'left', font } = {}) {
    const F = font || 'Heebo, Arial, sans-serif';
    ctx.save();
    ctx.direction = 'ltr'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `italic 900 ${h}px ${F}`;
    const a = 'S.Y ', b = 'PHONE ', c = 'TRUCK';
    const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, wc = ctx.measureText(c).width;
    const total = wa + wb + wc;
    let x0 = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.fillStyle = COLORS.yellow; ctx.fillText(a, x0, yBase); x0 += wa;
    ctx.fillStyle = '#ffffff'; ctx.fillText(b, x0, yBase); x0 += wb;
    ctx.fillStyle = COLORS.yellow; ctx.fillText(c, x0, yBase);
    ctx.restore();
    return total;
  }

  function markHTML(size, kind = 'mark') {
    return `<img src="${IMG[kind]}" alt="S.Y Phone Truck" width="${size}" height="${size}" decoding="async">`;
  }

  function mount() {
    document.querySelectorAll('[data-logo]').forEach((el) => { el.innerHTML = markHTML(+el.dataset.logo || 40, el.dataset.kind || 'mark'); });
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = IMG.favicon;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.StoreBrand = { drawMark, drawBadge, drawWordmark, markHTML, ready, COLORS, PHONE, SITE, colors: [COLORS.blue, COLORS.yellow] };
})();
