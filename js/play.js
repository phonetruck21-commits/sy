/* אינטראקציות: טלפון שאפשר לנסות, מוכרת שמדברת, כדור לכלב, מגלשה,
 * חיפוש אוצרות עם קופון, ספסלים לישיבה, ג'ויסטיק בנייד וריצה.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const V = () => window.VRStore;
  const S = () => window.StoreSocial;
  const FX = () => window.StoreFX.Sound;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const btn = (label, cls, onClick) => { const b = h('button', cls, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
  const scene = () => $('a-scene');
  const rig = () => $('#rig');
  const eye = (v = new THREE.Vector3()) => { $('#camera').object3D.getWorldPosition(v); return v; };
  const look = () => { const d = new THREE.Vector3(); $('#camera').object3D.getWorldDirection(d); return d.negate(); };
  const toast = (m) => V().toast(m);

  /* ================================================================ *
   *  1. טלפון שאפשר לנסות: מסך בית, מצלמה אמיתית, גלריה, צליל          *
   * ================================================================ */
  const PhoneTry = {
    id: null, mode: 'home', rt: null, cam: null, photos: [],
    onSheet(id, el) {
      const entry = V().Products[id];
      const p = entry.product;
      if (this.id !== id) this.stop();
      this.id = id;
      if (entry.device && entry.device.screen) {
        const box = h('section', 'try');
        box.append(h('h3', '', 'נסו את המכשיר'));
        const row = h('div', 'try-row');
        row.append(
          btn(this.mode === 'camera' ? 'סגירת המצלמה' : '📷 פתיחת המצלמה', 'try-btn', () => { this.mode === 'camera' ? this.home(entry) : this.camera(entry); V().Sheet.open(id); }),
          btn('צילום', 'try-btn primary', () => this.shoot(entry)),
        );
        row.lastChild.disabled = this.mode !== 'camera';
        box.append(row);
        box.append(h('p', 'try-hint', this.mode === 'camera' ? 'המצלמה האחורית מצלמת את מה שמולכם בחנות. גררו כדי לכוון.' : 'פתחו את המצלמה וצלמו את החנות דרך הטלפון.'));
        if (this.photos.length) {
          const gal = h('div', 'gallery');
          this.photos.slice(-6).reverse().forEach((src) => { const im = h('img'); im.src = src; im.alt = 'תמונה שצילמתם בחנות'; gal.append(im); });
          box.append(h('p', 'try-sub', `הגלריה (${this.photos.length})`), gal);
        }
        el.querySelector('.sheet-buy').before(box);
      } else if (p.category === 'audio') {
        const box = h('section', 'try');
        box.append(h('h3', '', 'שמעו איך זה נשמע'));
        box.append(btn('🎵 השמעת דוגמה', 'try-btn', () => this.music()));
        el.querySelector('.sheet-buy').before(box);
      }
    },
    onSheetClose() { this.stop(); this.id = null; },
    camera(entry) {
      const r = scene().renderer;
      if (!this.rt) {
        this.rt = new THREE.WebGLRenderTarget(360, 760);
        this.cam = new THREE.PerspectiveCamera(62, 360 / 760, 0.05, 200);
      }
      this.mode = 'camera';
      this.entry = entry;
      const scr = entry.device.screen;
      scr.material.map = this.rt.texture; scr.material.toneMapped = true; scr.material.needsUpdate = true;
      const lifted = V().Inspect.lifted;
      if (lifted) lifted.spin = false;
      void r;
    },
    home(entry) {
      if (!entry || !entry.device) return;
      const scr = entry.device.screen;
      scr.material.map = entry.device.wallpaper; scr.material.toneMapped = false; scr.material.needsUpdate = true;
      this.mode = 'home';
    },
    stop() { if (this.entry) this.home(this.entry); this.entry = null; this.mode = 'home'; },
    tick() {
      if (this.mode !== 'camera' || !this.entry || V().inVR()) return;
      const obj = this.entry.el.object3D;
      // הטלפון פונה אליכם; המצלמה האחורית מסתכלת קדימה, אל החנות
      const e = eye();
      obj.lookAt(e);
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
      const pos = obj.getWorldPosition(new THREE.Vector3()).addScaledVector(back, 0.05);
      pos.y += 0.04;
      this.cam.position.copy(pos);
      this.cam.lookAt(pos.clone().add(back));
      const r = scene().renderer, sc = scene().object3D;
      const was = r.getRenderTarget();
      obj.visible = false;
      r.setRenderTarget(this.rt); r.render(sc, this.cam); r.setRenderTarget(was);
      obj.visible = true;
    },
    shoot(entry) {
      if (this.mode !== 'camera' || !this.rt) return;
      const r = scene().renderer;
      const w = this.rt.width, hh = this.rt.height;
      const buf = new Uint8Array(w * hh * 4);
      r.readRenderTargetPixels(this.rt, 0, 0, w, hh, buf);
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, hh);
      for (let y = 0; y < hh; y++) { // היפוך אנכי + המרה ל-sRGB
        for (let x = 0; x < w; x++) {
          const si = ((hh - 1 - y) * w + x) * 4, di = (y * w + x) * 4;
          for (let k = 0; k < 3; k++) img.data[di + k] = Math.min(255, Math.pow(buf[si + k] / 255, 1 / 2.2) * 255);
          img.data[di + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      this.photos.push(c.toDataURL('image/jpeg', 0.85));
      FX().tone(1200, 0.05, 0.05); FX().tone(800, 0.08, 0.04, 0.05);
      const flash = h('div', 'flash'); document.body.append(flash); setTimeout(() => flash.remove(), 350);
      toast('צולם! התמונה בגלריה של הטלפון');
      V().Sheet.open(entry.product.id);
    },
    music() {
      FX().unlock();
      const notes = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047];
      notes.forEach((f, i) => { FX().tone(f, 0.35, 0.05, i * 0.18, 'triangle'); if (i % 4 === 0) FX().tone(f / 2, 0.6, 0.06, i * 0.18); });
      toast('🎵 מנגן…');
    },
  };

  /* ================================================================ *
   *  2. מוכרת שמדברת (מבוסס /api/seller)                              *
   * ================================================================ */
  const Seller = {
    history: [], busy: false, speak: false, av: null,
    build(root) {
      const C = window.StoreCharacters;
      this.av = C.person({ avatar: 'Business_Female_01' });
      const g = this.av.object;
      g.position.set(5.45, 0.95, -0.25); g.rotation.y = -Math.PI / 2;
      root.object3D.add(g);
      const tag = C.label('נועה · שאלו אותי', { size: 0.055, bg: 'rgba(76,141,255,0.95)' });
      tag.position.y = this.av.height + 0.25; g.add(tag);
      // אזור לחיצה
      const hit = document.createElement('a-entity');
      hit.setAttribute('geometry', 'primitive: box; width: 0.7; height: 1.8; depth: 0.7');
      hit.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false');
      hit.setAttribute('position', '5.45 1.85 -0.25');
      hit.classList.add('clickable');
      hit.addEventListener('click', () => this.open());
      root.appendChild(hit);
    },
    tick(dt) {
      if (!this.av) return;
      this.av.update(dt, 0);
      if (this.talking > 0) { this.talking -= dt; this.av.play('talk'); this.talking = 0; }
    },
    open() {
      if (V().inVR()) return this.openVR();
      V().Sheet.close(); V().CartDrawer.close();
      $('#seller').hidden = false;
      this.av.play('wave');
      if (!this.history.length) this.add('assistant', 'שלום! אני נועה מ-' + window.STORE_CONFIG.name + '. מה חשוב לך בטלפון – מצלמה, סוללה או מחיר? אשמח להמליץ 🙂');
      setTimeout(() => $('#seller-input').focus(), 50);
    },
    close() { $('#seller').hidden = true; if (this.rec) try { this.rec.stop(); } catch (e) { /* ignore */ } },
    add(role, text, products) {
      if (role === 'assistant' || role === 'user') this.history.push({ role, content: text });
      const li = h('li', role);
      li.append(h('p', '', text));
      if (products && products.length) {
        const row = h('div', 'chips');
        products.forEach((id) => {
          const e = V().Products[id];
          if (!e) return;
          const b = btn('', 'chip-prod', () => { this.close(); V().Nav.toProduct(id).then(() => V().openProduct(id)); });
          if (e.thumb) { const im = h('img'); im.src = e.thumb; im.alt = ''; b.append(im); }
          b.append(h('span', '', e.product.name));
          row.append(b);
        });
        li.append(row);
      }
      $('#seller-log').append(li);
      $('#seller-log').scrollTop = $('#seller-log').scrollHeight;
    },
    async send(text) {
      text = String(text || '').trim();
      if (!text || this.busy) return;
      this.add('user', text);
      $('#seller-input').value = '';
      this.busy = true;
      const typing = h('li', 'assistant typing'); typing.append(h('p', '', 'נועה מקלידה…'));
      $('#seller-log').append(typing);
      try {
        // לא שולחים את הודעת הפתיחה (השיחה חייבת להתחיל מהמבקר)
        const msgs = this.history.filter((m, i) => !(i === 0 && m.role === 'assistant')).slice(-20);
        const res = await fetch('api/seller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, kid: !!(S().profile && S().profile.kid) }) });
        const data = await res.json().catch(() => ({}));
        typing.remove();
        if (!res.ok) throw new Error(data.error || 'המוכרת לא זמינה כרגע');
        this.add('assistant', data.reply, data.products);
        this.talking = Math.min(6, data.reply.length / 18);
        if (this.speak) this.say(data.reply);
      } catch (e) {
        typing.remove();
        const li = h('li', 'error'); li.append(h('p', '', /fetch|Failed|NetworkError/i.test(e.message) ? 'המוכרת עונה כשהחנות רצה על השרת שלה.' : e.message));
        $('#seller-log').append(li);
        this.history.pop();
      } finally { this.busy = false; }
    },
    say(text) {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?'"%₪-]/gu, ''));
      u.lang = 'he-IL'; u.rate = 1.02;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    },
    listen() {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) { toast('הדפדפן הזה לא תומך בדיבור. אפשר להקליד 🙂'); return; }
      const rec = new R(); this.rec = rec;
      rec.lang = 'he-IL'; rec.interimResults = false;
      $('#seller-mic').classList.add('on');
      rec.onresult = (e) => { const t = e.results[0][0].transcript; this.send(t); };
      rec.onend = () => $('#seller-mic').classList.remove('on');
      rec.onerror = () => { $('#seller-mic').classList.remove('on'); toast('לא הצלחתי לשמוע. נסו שוב או הקלידו.'); };
      rec.start();
    },
    /* במשקף: שאלות מוכנות בחלון צף */
    openVR() {
      const Q = ['איזה טלפון הכי טוב לצילום?', 'מה ההבדל בין X Pro ל-X?', 'מה כדאי לקנות עד 1,500 ₪?', 'איזה אביזר מתאים לטלפון?'];
      const last = this.history.filter((m) => m.role === 'assistant').slice(-1)[0];
      V().Panel.open('seller', (L) => {
        L.text('נועה · המוכרת', { size: 0.04, weight: 700, gap: 0.01 });
        L.text(last ? last.content : 'שלום! במה אפשר לעזור?', { size: 0.024, lineHeight: 1.5, gap: 0.016 });
        Q.forEach((q) => L.button(q, () => this.send(q).then(() => this.openVR()), { primary: false, h: 0.06 }));
      }, { width: 0.6 });
    },
    setup() {
      $('#seller-form').addEventListener('submit', (e) => { e.preventDefault(); this.send($('#seller-input').value); });
      $('#seller-mic').addEventListener('click', () => this.listen());
      $('#seller .drawer-x').addEventListener('click', () => this.close());
      $('#seller-speak').addEventListener('change', (e) => { this.speak = e.target.checked; });
      document.querySelectorAll('#seller-quick button').forEach((b) => b.addEventListener('click', () => this.send(b.textContent)));
    },
  };

  /* ================================================================ *
   *  3א. כדור לכלב                                                     *
   * ================================================================ */
  const Ball = {
    mesh: null, vel: new THREE.Vector3(), state: 'idle', // idle | flying | resting | carried
    build(root) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), new THREE.MeshStandardMaterial({ color: '#d7f542', roughness: 0.55 }));
      m.castShadow = true; m.visible = false;
      root.object3D.add(m); this.mesh = m;
    },
    throw() {
      const Tk = window.StoreTruck, e = eye();
      if (Tk.inInterior(e.x, e.z)) { toast('בתוך המשאית לא זורקים כדור 🙂 צאו לרחבה'); return; }
      const d = look(); d.y = Math.max(d.y, 0.15); d.normalize();
      this.mesh.position.copy(e).addScaledVector(d, 0.5); this.mesh.position.y -= 0.3;
      this.vel.copy(d).multiplyScalar(7); this.vel.y += 2.2;
      this.mesh.visible = true; this.state = 'flying';
      S().act && S().myAv && S().myAv.play('wave');
      FX().tone(500, 0.12, 0.04, 0, 'triangle');
      const pet = S().myPet;
      if (!pet || S().profile.pet !== 'dog') toast('בכניסה אפשר לבחור כלב שיביא את הכדור 🐶');
    },
    tick(dt) {
      if (!this.mesh || this.state === 'idle') return;
      const pet = S().myPet, isDog = S().profile && S().profile.pet === 'dog';
      const p = this.mesh.position;
      if (this.state === 'flying' || this.state === 'resting') {
        this.vel.y -= 9.8 * dt;
        p.addScaledVector(this.vel, dt);
        const floor = window.StoreTruck.floorAt(p.x, p.z) + 0.065;
        if (p.y < floor) {
          p.y = floor; this.vel.y *= -0.5; this.vel.x *= 0.6; this.vel.z *= 0.6;
          if (Math.abs(this.vel.y) < 1.2) { this.vel.set(0, 0, 0); this.state = 'resting'; }
        }
        // גבולות הרחבה: הכדור נעצר בקצה במקום להתגלגל לאורך הגדר
        if (p.x < -14 || p.x > 14) { p.x = THREE.MathUtils.clamp(p.x, -14, 14); this.vel.x = 0; }
        if (p.z < 2.2 || p.z > 12.5) { p.z = THREE.MathUtils.clamp(p.z, 2.2, 12.5); this.vel.z = 0; }
        if (isDog && pet) {
          // הכלב רץ על הקרקע אל הנקודה שמתחת לכדור
          this.ground = this.ground || new THREE.Vector3();
          pet.chase = this.ground.set(p.x, window.StoreTruck.floorAt(p.x, p.z), p.z);
          if (this.state === 'resting' && Math.hypot(pet.position.x - p.x, pet.position.z - p.z) < 0.4) { this.state = 'carried'; pet.chase = null; }
        }
      } else if (this.state === 'carried') {
        const dog = pet.position;
        p.set(dog.x, dog.y + 0.48, dog.z);
        const e = eye();
        if (Math.hypot(e.x - dog.x, e.z - dog.z) < 1.6) {
          this.state = 'idle'; this.mesh.visible = false;
          toast('כל הכבוד! 🐶 הכלב החזיר את הכדור');
          FX().add && FX().add();
        }
      }
    },
  };

  /* ================================================================ *
   *  3ב. מגלשה                                                        *
   * ================================================================ */
  const Slide = {
    riding: false,
    build(root) {
      const hit = document.createElement('a-entity');
      hit.setAttribute('geometry', 'primitive: box; width: 0.9; height: 1.6; depth: 2.6');
      hit.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false');
      hit.setAttribute('position', '5.9 0.8 5.9');
      hit.classList.add('clickable');
      hit.addEventListener('click', () => this.ride());
      root.appendChild(hit);
    },
    async ride() {
      if (this.riding) return;
      this.riding = true;
      const N = V().Nav, w = rig().components.walker;
      Sit.stand();
      await N.go({ x: 5.9, z: 4.35, yaw: Math.PI, pitch: -0.1 });
      const r = rig().object3D;
      const av = S().myAv;
      w.flying = true;
      const tw = window.StoreEnv.tween;
      const go = (dur, from, to, y0, y1, ease) => new Promise((res) => {
        tw(dur, (k) => { r.position.x = from.x + (to.x - from.x) * k; r.position.z = from.z + (to.z - from.z) * k; w.rideY = y0 + (y1 - y0) * k; }, res, ease);
      });
      const ex = eye();
      const off = { x: r.position.x - ex.x, z: r.position.z - ex.z };
      const P = (x, z) => ({ x: x + off.x, z: z + off.z });
      // טיפוס בסולם, ואז גלישה למטה
      await go(1100, P(5.9, 4.35), P(5.9, 5.2), 0.06, 1.38, (t) => t);
      if (av) av.setPose('slide');
      FX().tone(900, 0.9, 0.04, 0, 'sine'); FX().tone(450, 0.9, 0.03, 0.1, 'sine');
      await go(900, P(5.9, 5.2), P(5.9, 7.3), 1.38, 0.06, (t) => t * t);
      if (av) av.setPose(null);
      w.rideY = null; w.flying = false; w.last = null;
      this.riding = false;
      toast('ווווי! 🛝');
    },
  };

  /* ================================================================ *
   *  3ג. חיפוש אוצרות: 5 טלפונים מוזהבים -> קופון SY10                *
   * ================================================================ */
  const HUNT_KEY = 'vrstore-hunt-v1';
  const Hunt = {
    spots: [
      { id: 'h1', x: -9.0, z: 9.0 },   // ליד בית הכלב
      { id: 'h2', x: 8.9, z: 8.9 },    // מאחורי הבלונים
      { id: 'h3', x: -11.3, z: 2.9 },  // למרגלות דקל
      { id: 'h4', x: 4.6, z: 12.6 },   // ליד ברז הכיבוי
      { id: 'h5', x: -4.6, z: 3.0 },   // ליד העציץ שליד המדרגות
    ],
    found: (() => { try { return JSON.parse(localStorage.getItem(HUNT_KEY)) || []; } catch (e) { return []; } })(),
    items: [],
    build(root) {
      const gold = new THREE.MeshStandardMaterial({ color: '#e8b923', metalness: 1, roughness: 0.25, emissive: '#5a3d00', emissiveIntensity: 0.4 });
      const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,215,90,0.9)'); g.addColorStop(1, 'rgba(255,215,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
      this.spots.forEach((s) => {
        if (this.found.includes(s.id)) return;
        const el = document.createElement('a-entity');
        const g = new THREE.Group();
        const ph = new THREE.Mesh(window.StoreDevices.slab(0.12, 0.24, 0.018, 0.02, 0.006), gold);
        g.add(ph);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.set(0.7, 0.7, 1); halo.raycast = () => {}; g.add(halo);
        el.setObject3D('mesh', g);
        el.setAttribute('position', `${s.x} 0.55 ${s.z}`);
        el.classList.add('clickable');
        el.addEventListener('click', () => this.collect(s, el));
        root.appendChild(el);
        this.items.push({ el, g, s });
      });
      this.update();
    },
    tick(dt, t) { this.items.forEach((it, i) => { it.g.rotation.y += dt * 1.6; it.g.position.y = Math.sin(t * 2 + i) * 0.06; }); },
    collect(s, el) {
      if (this.found.includes(s.id)) return;
      this.found.push(s.id);
      try { localStorage.setItem(HUNT_KEY, JSON.stringify(this.found)); } catch (e) { /* ignore */ }
      el.parentNode.removeChild(el);
      this.items = this.items.filter((it) => it.el !== el);
      [880, 1175, 1568].forEach((f, i) => FX().tone(f, 0.25, 0.05, i * 0.08, 'triangle'));
      if (S().myAv) S().myAv.play('jump');
      this.update();
      if (this.found.length >= this.spots.length) {
        V().Cart.setCoupon('SY10');
        $('#hunt-done').hidden = false;
      } else toast(`מצאת טלפון מוזהב! ${this.found.length} מתוך ${this.spots.length}`);
    },
    update() {
      const n = this.found.length, all = this.spots.length;
      $('#hunt-count').textContent = n >= all ? 'קופון SY10 פעיל' : `${n}/${all}`;
      $('#hud-hunt').classList.toggle('done', n >= all);
    },
  };

  /* ================================================================ *
   *  4. הליכה חופשית: ספסלים, ג'ויסטיק בנייד, ריצה וקפיצה              *
   * ================================================================ */
  const Sit = {
    seat: null,
    benches: [{ x: -2.9, z: 9.9 }, { x: 2.9, z: 9.9 }],
    build(root) {
      const wood = new THREE.MeshStandardMaterial({ color: '#9a6b43', roughness: 0.6 });
      const metal = new THREE.MeshStandardMaterial({ color: '#26272a', metalness: 0.7, roughness: 0.4 });
      this.benches.forEach((b) => {
        const g = new THREE.Group();
        for (let i = 0; i < 4; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.035, 0.09), wood); sl.position.set(0, 0.45, -0.17 + i * 0.11); sl.castShadow = true; g.add(sl); }
        for (let i = 0; i < 3; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.03), wood); sl.position.set(0, 0.62 + i * 0.12, 0.26); sl.rotation.x = -0.15; sl.castShadow = true; g.add(sl); }
        [-0.75, 0.75].forEach((x) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), metal); leg.position.set(x, 0.225, 0); g.add(leg); });
        g.position.set(b.x, 0.04, b.z); g.rotation.y = Math.PI; // פונה אל המשאית
        root.object3D.add(g);
        const el = document.createElement('a-entity');
        el.setAttribute('geometry', 'primitive: box; width: 1.8; height: 0.9; depth: 0.7');
        el.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false');
        el.setAttribute('position', `${b.x} 0.5 ${b.z}`);
        el.classList.add('clickable');
        el.addEventListener('click', () => this.sit(b));
        root.appendChild(el);
        (window.StorePlaza.obstacles || []).push([b.x, b.z, 0.9]);
      });
    },
    async sit(b) {
      await V().Nav.go({ x: b.x, z: b.z - 0.25, yaw: 0, pitch: 0.02 });
      this.seat = b;
      $('#camera').object3D.position.y = 1.15;
      if (S().myAv) S().myAv.setPose('sit');
      toast('ישבת על הספסל. כל תנועה תקים אותך.');
    },
    stand() {
      if (!this.seat) return;
      this.seat = null;
      $('#camera').object3D.position.y = 1.6;
      if (S().myAv) S().myAv.setPose(null);
    },
  };

  const Joystick = {
    setup() {
      const pad = $('#joystick'), knob = pad.querySelector('i');
      let id = null, cx = 0, cy = 0;
      const tm = () => rig().components['thumbstick-move'];
      const move = (e) => {
        const dx = THREE.MathUtils.clamp(e.clientX - cx, -40, 40), dy = THREE.MathUtils.clamp(e.clientY - cy, -40, 40);
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        tm().axis.x = dx / 40; tm().axis.y = dy / 40;
      };
      pad.addEventListener('pointerdown', (e) => {
        id = e.pointerId; pad.setPointerCapture(id);
        const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        Sit.stand();
        const N = V().Nav; if (N.flight) N.flight.cancel = true; rig().components.walker.flying = false;
        move(e);
      });
      pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
      const end = () => { id = null; knob.style.transform = ''; tm().axis.x = 0; tm().axis.y = 0; };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    },
  };

  function keys() {
    const cam = $('#camera');
    window.addEventListener('keydown', (e) => {
      if (/input|textarea/i.test(document.activeElement && document.activeElement.tagName)) return;
      if (/^(KeyW|KeyA|KeyS|KeyD|Arrow)/.test(e.code)) Sit.stand();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') cam.setAttribute('wasd-controls', 'acceleration', 40);
      if (e.code === 'Space' && S().started) { e.preventDefault(); S().act('jump'); }
      if (e.code === 'KeyF' && S().started) Ball.throw();
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') cam.setAttribute('wasd-controls', 'acceleration', 18); });
    // כל ניווט מקים מהספסל
    const N = V().Nav, go = N.go.bind(N);
    N.go = (...a) => { if (!Slide.riding) Sit.stand(); return go(...a); };
  }

  /* ================================================================ */
  AFRAME.registerComponent('play', {
    init() {
      const root = this.el;
      const build = () => {
        Seller.build($('#store-root'));
        Ball.build(root); Slide.build(root); Hunt.build(root); Sit.build(root);
        Seller.setup(); Joystick.setup(); keys();
        $('#me-ball').addEventListener('click', () => Ball.throw());
        $('#hud-hunt').addEventListener('click', () => { $('#hunt-help').hidden = !$('#hunt-help').hidden; });
        $('#hunt-done button').addEventListener('click', () => { $('#hunt-done').hidden = true; });
        $('#zones-seller').addEventListener('click', () => V().Nav.go('checkout').then(() => Seller.open()));
      };
      this.build = build; this.built = false;
      this.t = 0;
    },
    tick(t, dt) {
      // בונים פעם אחת, אחרי שכל המוצרים נטענו
      if (!this.built) { if (!document.body.classList.contains('store-ready')) return; this.built = true; this.build(); }
      const s = Math.min(dt, 50) / 1000; this.t += s;
      PhoneTry.tick(); Seller.tick(s); Ball.tick(s); Hunt.tick(s, this.t);
    },
  });

  window.StorePlay = { onSheet: (id, el) => PhoneTry.onSheet(id, el), onSheetClose: () => PhoneTry.onSheetClose(), PhoneTry, Seller, Ball, Slide, Hunt, Sit };
})();
