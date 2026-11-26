/* חוויית משתמש במשקף VR:
 *  - תפריט ראשי (כפתור "תפריט" על פרק היד השמאלי, או כפתור Y / B): אזורי המשאית, מתחם הקניות, המוכרת, סל, צ'אט, נוחות
 *  - מתחם הקניות בתוך המשקף: חלון מוצר, מדריך חנויות ו"להשכרה" כחלונות תלת-ממדיים (חלונות אתר לא נראים במשקף)
 *  - קפיצה (טלפורט) שמסובבת אתכם אל היעד
 *  - נוחות: מסגרת כהה עדינה בזמן הליכה עם הסטיק (מפחיתה בחילה), סיבוב בקפיצות
 *  - חלון "ברוכים הבאים" עם הסבר על הבקרים בכניסה הראשונה
 */
(function () {
  'use strict';
  const V = () => window.VRStore;
  const M = () => window.StoreMall;
  const $ = (s) => document.querySelector(s);
  const PREF_KEY = 'vrstore-vr-prefs';
  const prefs = (() => { try { return { vignette: true, snap: 30, ...JSON.parse(localStorage.getItem(PREF_KEY)) }; } catch (e) { return { vignette: true, snap: 30 }; } })();
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
  const fmt = (n) => `${Number(n).toLocaleString('he-IL')} ₪`;

  /* ---------- כפתורים בעמודות ---------- */
  function grid(L, items, cols = 2, h = 0.065) {
    const gap = 0.012;
    const w = (L.inner - gap * (cols - 1)) / cols;
    items.forEach((it, i) => {
      const c = i % cols;
      const x = L.inner / 2 - w / 2 - c * (w + gap); // מימין לשמאל
      const last = c === cols - 1 || i === items.length - 1;
      L.button(it.label, it.act, { primary: !!it.primary, h, w, x, inline: !last, gap });
    });
  }

  const VRUX = {
    prefs,
    /* ---------- תפריט ראשי ---------- */
    menu() {
      const { Panel, Nav, Cart, UI } = V();
      if (Panel.kind === 'vr-menu') { Panel.close(); return; }
      Panel.open('vr-menu', (L) => {
        L.text('S.Y PHONE TRUCK', { size: 0.018, color: UI.muted, weight: 500, letterSpacing: 0.12, gap: 0.004 });
        L.text('לאן הולכים?', { size: 0.04, weight: 700, gap: 0.014 });
        const zones = window.StoreTruck.VIEWS.map((v) => ({ label: v.label, act: () => { Panel.close(); Nav.go(v.id); } }));
        grid(L, zones, 2);
        L.divider(0.016);
        grid(L, [
          { label: 'מתחם הקניות', act: () => this.directory(), primary: true },
          { label: 'שאלו את נועה', act: () => { Panel.close(); window.StorePlay && window.StorePlay.Seller.openVR(); } },
          { label: `סל הקניות (${Cart.count()})`, act: () => V().openCart() },
          { label: 'צ׳אט', act: () => window.StoreSocial && window.StoreSocial.openVRChat && window.StoreSocial.openVRChat() },
        ], 2, 0.07);
        L.divider(0.016);
        grid(L, [
          { label: `מסגרת נוחות: ${prefs.vignette ? 'פועלת' : 'כבויה'}`, act: () => { prefs.vignette = !prefs.vignette; savePrefs(); Panel.close(); this.menu(); } },
          { label: `סיבוב: ${prefs.snap}°`, act: () => { prefs.snap = prefs.snap === 30 ? 45 : prefs.snap === 45 ? 22 : 30; savePrefs(); this.applySnap(); Panel.close(); this.menu(); } },
        ], 2, 0.055);
        L.button('איך משתמשים בבקרים?', () => this.welcome(true), { primary: false, h: 0.055 });
      }, { width: 0.64 });
    },

    /* ---------- מתחם הקניות ---------- */
    directory() {
      const { Panel, UI } = V();
      const data = M() && M().Mall.data;
      Panel.open('vr-mall', (L) => {
        L.text('S.Y MALL', { size: 0.018, color: UI.muted, weight: 500, letterSpacing: 0.12, gap: 0.004 });
        L.text('מדריך המתחם', { size: 0.04, weight: 700, gap: 0.014 });
        if (!data) { L.text('המתחם עוד נטען…', { size: 0.024, color: UI.muted }); return; }
        const items = data.slots.map((s) => ({
          label: s.store ? s.store.name : 'מקום פנוי להשכרה',
          act: () => { Panel.close(); M().go(s.id); },
          primary: !!s.store,
        }));
        grid(L, items, 2, 0.065);
        L.space(0.006);
        L.button('פתחו חנות במתחם', () => this.rent(), { primary: false, h: 0.06 });
        L.button('חזרה לתפריט', () => { Panel.close(); this.menu(); }, { primary: false, h: 0.05 });
      }, { width: 0.64 });
    },
    product(id, qty = 1) {
      const { Panel, UI, Cart } = V();
      const Mall = M().Mall;
      const p = Mall.product(id); if (!p) return;
      const st = Mall.store(p.storeId) || {};
      Panel.open('vr-mall-product', (L) => {
        L.text(p.store || '', { size: 0.019, color: UI.muted, weight: 500, letterSpacing: 0.08, gap: 0.006 });
        L.text(p.name, { size: 0.044, weight: 700, lineHeight: 1.2, gap: 0.008 });
        L.text(fmt(p.price), { size: 0.032, weight: 500, gap: 0.012 });
        if (p.description) L.text(p.description, { size: 0.023, lineHeight: 1.5, gap: 0.014 });
        L.divider(0.012);
        // כמות
        const w = 0.07;
        L.button('+', () => this.product(id, Math.min(99, qty + 1)), { primary: false, h: 0.06, w, x: L.inner / 2 - w / 2, inline: true });
        L.text(`כמות ${qty}`, { size: 0.026, weight: 500, width: 0.2, x: L.inner / 2 - w - 0.13, inline: true, align: 'center' });
        L.button('−', () => this.product(id, Math.max(1, qty - 1)), { primary: false, h: 0.06, w, x: L.inner / 2 - w - 0.26 - w / 2 });
        if (p.demo) L.text('זוהי חנות לדוגמה – המוצרים לא למכירה', { size: 0.022, color: UI.sale, gap: 0.01 });
        else L.button(`הוספה לסל · ${fmt(p.price * qty)}`, () => { Cart.add(p, null, qty); V().toast(`נוסף לסל: ${p.name}`); this.product(id, 1); }, { h: 0.075 });
        if (Cart.count()) L.button(`לסל הקניות (${Cart.count()})`, () => V().openCart(), { primary: false, h: 0.06 });
        const more = (st.products || []).filter((x) => x.id !== id).slice(0, 4);
        if (more.length) {
          L.divider(0.012);
          L.text(`עוד מ${p.store}`, { size: 0.022, weight: 700, gap: 0.008 });
          grid(L, more.map((x) => ({ label: `${x.name} · ${fmt(x.price)}`, act: () => this.product(x.id) })), 2, 0.055);
        }
      }, { width: 0.6 });
    },
    rent() {
      const { Panel, UI } = V();
      const plans = (M() && M().Mall.data && M().Mall.data.plans) || [];
      Panel.open('vr-rent', (L) => {
        L.text('S.Y MALL', { size: 0.018, color: UI.muted, weight: 500, letterSpacing: 0.12, gap: 0.004 });
        L.text('פתחו חנות במתחם', { size: 0.04, weight: 700, gap: 0.01 });
        L.text('החנות שלכם ברחבה ליד משאית S.Y. מנוי חודשי, בלי דמי הקמה, ביטול בכל חודש.', { size: 0.023, lineHeight: 1.5, gap: 0.012 });
        plans.forEach((pl) => L.pair(pl.name, `${fmt(pl.price)} לחודש`, { size: 0.025, gap: 0.006 }));
        L.divider(0.014);
        L.text('טלפון 052-546-6304 · phonetruck.co.il', { size: 0.026, weight: 700, gap: 0.014 });
        L.button('יציאה מהמשקף ומילוי פרטים', () => {
          Panel.close();
          const scene = $('a-scene');
          const open = () => { scene.removeEventListener('exit-vr', open); M().Rent.open(); };
          scene.addEventListener('exit-vr', open);
          scene.exitVR();
        }, { h: 0.07 });
        L.button('חזרה למתחם', () => this.directory(), { primary: false, h: 0.055 });
      }, { width: 0.6 });
    },

    /* ---------- ברוכים הבאים ---------- */
    welcome(force) {
      const { Panel, UI } = V();
      let seen = false;
      try { seen = sessionStorage.getItem('vrstore-vr-welcome') === '1'; } catch (e) { /* ignore */ }
      if (seen && !force) return;
      try { sessionStorage.setItem('vrstore-vr-welcome', '1'); } catch (e) { /* ignore */ }
      Panel.open('vr-welcome', (L) => {
        L.text('ברוכים הבאים ל-S.Y Phone Truck', { size: 0.036, weight: 700, gap: 0.014 });
        [
          ['לבחור / ללחוץ', 'מכוונים את הקרן ולוחצים על ההדק'],
          ['ללכת', 'סטיק שמאלי'],
          ['להסתובב', 'סטיק ימני (בקפיצות)'],
          ['לקפוץ למקום', 'מכוונים לעיגול על הרצפה ולוחצים'],
          ['תפריט', 'כפתור "תפריט" על פרק היד, או Y / B'],
          ['להרים מוצר', 'מכוונים ולוחצים על כפתור האחיזה (Grip)'],
        ].forEach(([a, b]) => L.text(`${a} – ${b}`, { size: 0.027, lineHeight: 1.4, gap: 0.01 }));
        L.space(0.008);
        L.button('יאללה, לקניות', () => Panel.close(), { h: 0.075 });
        L.button('פתיחת התפריט', () => { Panel.close(); this.menu(); }, { primary: false, h: 0.06 });
      }, { width: 0.64 });
    },

    applySnap() {
      const tm = $('#rig') && $('#rig').components['thumbstick-move'];
      if (tm) tm.data.snap = prefs.snap;
    },
  };

  /* ---------- קפיצה שמסובבת אל היעד ---------- */
  function patchTeleport() {
    const Nav = V().Nav;
    if (Nav._vrux) return;
    Nav._vrux = true;
    const orig = Nav.teleport.bind(Nav);
    const camPos = new THREE.Vector3(), dir = new THREE.Vector3();
    Nav.teleport = (v) => {
      // מעבר קצר בחושך – פחות מבלבל מקפיצה חדה
      fade(() => {
        orig(v);
        if (typeof v.yaw !== 'number') return;
        const rig = $('#rig').object3D;
        const cam = $('a-scene').camera;
        rig.updateMatrixWorld(true);
        $('#camera').object3D.getWorldPosition(camPos);
        cam.getWorldDirection(dir);
        const cur = Math.atan2(-dir.x, -dir.z);
        const d = Math.atan2(Math.sin(v.yaw - cur), Math.cos(v.yaw - cur));
        // מסובבים את ה-rig סביב הראש
        const off = rig.position.clone().sub(camPos); off.y = 0;
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), d);
        rig.position.x = camPos.x + off.x; rig.position.z = camPos.z + off.z;
        rig.rotation.y += d;
      });
    };
  }

  /* מסך מחשיך לרגע (בתוך המשקף) */
  let fadeMesh = null;
  function fade(mid) {
    const scene = $('a-scene');
    if (!fadeMesh) {
      fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: '#000', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
      fadeMesh.renderOrder = 9999; fadeMesh.frustumCulled = false;
      $('#camera').object3D.add(fadeMesh);
    }
    if (!scene.is('vr-mode')) { mid(); return; }
    const m = fadeMesh.material;
    const t0 = performance.now();
    let done = false;
    // בתוך XR לולאת requestAnimationFrame של החלון לא רצה – משתמשים בטיימר
    const iv = setInterval(() => {
      const t = performance.now() - t0;
      if (t < 120) m.opacity = t / 120;
      else if (!done) { done = true; m.opacity = 1; mid(); }
      else m.opacity = Math.max(0, 1 - (t - 120) / 160);
      if (t >= 290) { clearInterval(iv); m.opacity = 0; }
    }, 16);
  }

  /* ---------- מסגרת נוחות בזמן הליכה ---------- */
  AFRAME.registerComponent('vr-comfort', {
    init() {
      const g = new THREE.RingGeometry(0.17, 1.2, 48); // פתח באמצע ≈ 30° לכל צד
      this.mat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.position.z = -0.3; this.mesh.renderOrder = 9998; this.mesh.frustumCulled = false;
      this.el.object3D.add(this.mesh);
      this.level = 0;
    },
    tick(t, dt) {
      const scene = this.el.sceneEl;
      const tm = $('#rig') && $('#rig').components['thumbstick-move'];
      const moving = tm && Math.hypot(tm.axis.x, tm.axis.y) > 0.15;
      const want = scene.is('vr-mode') && prefs.vignette && moving ? 0.82 : 0;
      this.level += (want - this.level) * Math.min(1, (dt / 1000) * 8);
      this.mat.opacity = this.level;
      this.mesh.visible = this.level > 0.01;
    },
  });

  /* ---------- חיבור ---------- */
  function init() {
    const scene = $('a-scene');
    patchTeleport();
    VRUX.applySnap();
    $('#camera').setAttribute('vr-comfort', '');
    const tm = $('#rig').components['thumbstick-move'];
    if (tm) tm.data.speed = 2.0;

    // המתחם: במשקף פותחים חלונות תלת-ממדיים
    const SM = M();
    if (SM) {
      const sheetOpen = SM.Sheet.open.bind(SM.Sheet), rentOpen = SM.Rent.open.bind(SM.Rent), dirOpen = SM.Directory.open.bind(SM.Directory);
      SM.Sheet.open = (id) => (V().inVR() ? VRUX.product(id) : sheetOpen(id));
      SM.Rent.open = () => (V().inVR() ? VRUX.rent() : rentOpen());
      SM.Directory.open = () => (V().inVR() ? VRUX.directory() : dirOpen());
    }

    // כפתורי תפריט בבקרים
    ['ybuttondown', 'bbuttondown'].forEach((ev) => {
      ['#leftHand', '#rightHand'].forEach((h) => $(h).addEventListener(ev, () => VRUX.menu()));
    });

    scene.addEventListener('enter-vr', () => {
      document.body.classList.add('vr');
      setTimeout(() => VRUX.welcome(false), 900);
    });
    scene.addEventListener('exit-vr', () => {
      document.body.classList.remove('vr');
      if (V().Panel.kind && V().Panel.kind.startsWith('vr-')) V().Panel.close();
    });
  }

  const wait = setInterval(() => {
    if (window.VRStore && window.StoreMall && document.body.classList.contains('store-ready') && $('#rig') && $('#rig').components['thumbstick-move']) {
      clearInterval(wait);
      init();
    }
  }, 300);

  window.StoreVR = VRUX;
})();
