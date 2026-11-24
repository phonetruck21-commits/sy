/* שירותי המעבדה: בקשה נשמרת רק אחרי אישור מהשרת. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const placeholders = window.PRODUCTS?.some(p => !p.mall && !p.published);
    if (placeholders) {
      const notice = document.createElement('p'); notice.id = 'catalog-notice'; notice.setAttribute('role', 'note');
      notice.textContent = 'פריטים שלא אושרו למכירה מוצגים להמחשה בלבד. דגמי התלת־ממד להמחשה; מחיר ומפרט מחייבים לפי המוצר.';
      document.querySelector('.intro-inner')?.append(notice);
    }
    const dialog = document.createElement('dialog');
    dialog.id = 'service-dialog';
    dialog.dir = 'rtl';
    dialog.setAttribute('aria-labelledby', 'service-title');
    dialog.innerHTML = `<button type="button" class="drawer-x" aria-label="סגירה">×</button>
      <p class="eyebrow">S.Y PHONE TRUCK</p><h2 id="service-title">שירותי המעבדה והתקנות</h2>
      <p>ספרו מה צריך לתקן או להתקין. מחיר ומועד יתואמו אחרי בדיקה.</p>
      <form id="service-form"><label>השירות המבוקש<select name="service" required><option value="">בחירת שירות</option></select></label>
      <label>שם מלא<input name="name" autocomplete="name" required minlength="2" maxlength="60"></label>
      <label>טלפון<input name="phone" type="tel" dir="ltr" autocomplete="tel" required maxlength="20"></label>
      <label>עיר<input name="city" autocomplete="address-level2" maxlength="60"></label>
      <label>מה צריך לעשות?<textarea name="description" required minlength="5" maxlength="1000" rows="3" placeholder="דגם המכשיר, התקלה או פרטי ההתקנה"></textarea></label>
      <label class="service-consent"><input name="consent" type="checkbox" required> אני מאשר/ת לשמור את פרטי הבקשה לצורך טיפול ויצירת קשר.</label>
      <button type="submit" class="btn btn-dark">שליחת בקשת שירות</button></form>
      <p id="service-status" role="status" aria-live="polite"></p>
      <a href="tel:0525466304">התקשרות: 052-546-6304</a> · <a href="https://wa.me/972525466304" target="_blank" rel="noopener">WhatsApp</a>`;
    document.body.append(dialog);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'מעבדה והתקנות';
    document.querySelector('#zones').append(button);
    button.addEventListener('click', async () => {
      dialog.showModal();
      const status = dialog.querySelector('#service-status');
      if (dialog.querySelector('select').options.length > 1) return;
      try {
        const response = await fetch('/api/services'); if (!response.ok) throw new Error();
        for (const service of await response.json()) { const option = document.createElement('option'); option.value = service.id; option.textContent = service.name; dialog.querySelector('select').append(option); }
        status.textContent = '';
      } catch { status.textContent = 'לא ניתן לטעון את השירותים כרגע. אפשר להתקשר או לפנות ב־WhatsApp.'; }
    });
    dialog.querySelector('.drawer-x').onclick = () => dialog.close();
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, submit = form.querySelector('[type=submit]'), status = dialog.querySelector('#service-status');
      submit.disabled = true; status.textContent = 'שומר את הבקשה…';
      try {
        const body = Object.fromEntries(new FormData(form)); body.consent = form.elements.consent.checked;
        const response = await fetch('/api/service-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'שליחת הבקשה נכשלה');
        status.textContent = `${data.message} מספר פנייה: ${data.id}`; form.reset();
      } catch (error) { status.textContent = error.message || 'אין חיבור לשרת. נסו שוב.'; }
      finally { submit.disabled = false; }
    });
    const motion = document.createElement('button'); motion.type = 'button'; motion.textContent = 'תנועה מופחתת';
    motion.setAttribute('aria-pressed', matchMedia('(prefers-reduced-motion: reduce)').matches);
    window.storeReducedMotion = motion.getAttribute('aria-pressed') === 'true';
    motion.onclick = () => { window.storeReducedMotion = !window.storeReducedMotion; motion.setAttribute('aria-pressed', window.storeReducedMotion); };
    document.querySelector('#zones').append(motion);
    document.addEventListener('focusin', event => {
      const camera = document.querySelector('#camera');
      if (camera?.hasAttribute('wasd-controls')) camera.setAttribute('wasd-controls', 'enabled', !event.target.matches('input, textarea, select'));
    });
    dialog.addEventListener('close', () => { document.querySelector('#camera')?.setAttribute('wasd-controls', 'enabled', true); button.focus(); });
  });
})();
