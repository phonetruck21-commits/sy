/* חלק חברתי: מבקרים אמיתיים בזמן אמת, חיות מחמד, צ'אט, קבוצות וסל משותף.
 * מתחבר לשרת דרך WebSocket (/live). בלי שרת – מוצגת הודעה, והחנות ממשיכה לעבוד לבד.
 */
(function () {
  'use strict';

  const V = () => window.VRStore;
  const C = () => window.StoreCharacters;
  const $ = (s) => document.querySelector(s);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e7dbe', '#2a9d8f', '#e76f51'];
  const PET_COLORS = { dog: ['#d8a35d', '#2b2b2b', '#f2efe8', '#8b5a2b'], cat: ['#8a8f98', '#e8e2d6', '#d98b3a', '#2b2b2b'] };
  const PROFILE_KEY = 'vrstore-profile-v1';
  const QUICK_FALLBACK = { hi: 'שלום! 👋', nice: 'איזה יופי!', join: 'רוצים לקנות ביחד?', look: 'בואו לראות את זה', pet: 'איזו חיה חמודה!', thanks: 'תודה!', bye: 'להתראות! 👋' };
  const EMOJI_FALLBACK = ['👋', '😀', '❤️', '👍', '🎉', '🐶', '🐱', '😂', '😮', '🛍️'];


  const Social = {
    profile: null,
    ws: null,
    online: false,
    me: null,
    players: new Map(),
    group: null,
    tab: 'all',
    unread: { all: 0, group: 0 },
    log: [],
    quick: QUICK_FALLBACK,
    emoji: EMOJI_FALLBACK,
    muted: new Set(),
    retries: 0,
    sendTimer: 0,
    myPet: null,

    /* ---------- פרופיל ---------- */
    initForm() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { /* ignore */ }
      const cast = C().CAST || {};
      const order = ['Female_Adult_01', 'Male_Adult_08', 'Female_Adult_08', 'Male_Adult_09', 'Female_Adult_17', 'Male_Adult_16', 'Female_Child_01', 'Male_Child_01'].filter((id) => cast[id]);
      const box = $('#pf-avatars');
      const current = order.includes(saved.avatar) ? saved.avatar : order[0];
      order.forEach((id) => {
        const m = cast[id];
        const l = h('label', 'avatar-card');
        const r = h('input'); r.type = 'radio'; r.name = 'avatar'; r.value = id; r.checked = id === current;
        const img = h('img'); img.src = `assets/people/thumbs/${id}.webp`; img.alt = ''; img.loading = 'lazy'; img.width = 160; img.height = 200;
        const cap = h('span', 'avatar-cap', m.kid ? (m.g === 'f' ? 'ילדה' : 'ילד') : m.name);
        r.setAttribute('aria-label', m.kid ? (m.g === 'f' ? 'ילדה' : 'ילד') : `${m.g === 'f' ? 'אישה' : 'גבר'} – ${m.name}`);
        l.append(r, img, cap); box.append(l);
      });
      const petSaved = saved.pet === 'dog' ? (saved.petColor === '#2b2b2b' ? 'shepherd' : 'beagle') : saved.pet === 'none' ? 'none' : null;
      if (petSaved) { const pr = document.querySelector(`input[name="pet"][value="${petSaved}"]`); if (pr) pr.checked = true; }
      if (saved.name) $('#pf-name').value = saved.name;
      const syncKid = () => { $('#pf-kid-note').hidden = !this.currentLook().kid; };
      syncKid();
      $('#profile').addEventListener('change', (e) => { if (e.target.name === 'avatar') { syncKid(); C().preload && C().preload([e.target.value]); } });
      C().preload && C().preload([current]);
    },
    currentLook() {
      const v = (name, def) => (document.querySelector(`input[name="${name}"]:checked`) || {}).value || def;
      const avatar = v('avatar', 'Female_Adult_01');
      const m = (C().CAST || {})[avatar] || {};
      const petChoice = v('pet', 'beagle');
      const pet = petChoice === 'none' ? 'none' : 'dog';
      return {
        avatar, kid: !!m.kid, color: COLORS[1], skin: '#e0ac69', hair: '#2b2018',
        hairStyle: m.g === 'f' ? 'long' : 'short', acc: 'none', pet, petColor: pet === 'dog' ? (petChoice === 'shepherd' ? '#2b2b2b' : '#d8a35d') : null,
      };
    },
    readProfile(validate) {
      let name = ($('#pf-name').value || '').trim().slice(0, 16);
      if (!name) name = 'אורח/ת ' + Math.floor(100 + Math.random() * 900);
      if (validate && name.length < 2) {
        const el = $('#pf-name');
        el.setAttribute('aria-invalid', 'true');
        el.focus();
        let err = $('#pf-name-err');
        if (!err) { err = h('p', 'field-err'); err.id = 'pf-name-err'; el.after(err); }
        err.textContent = 'נא לבחור כינוי (לפחות 2 תווים)';
        return null;
      }
      this.profile = { name, ...this.currentLook() };
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile)); } catch (e) { /* ignore */ }
      return this.profile;
    },

    /* ---------- התחלה ---------- */
    start() {
      if (this.started) return;
      this.started = true;
      const root = $('#others').object3D;
      const p = this.profile;
      // הדמות שלי – נראית במבט "לראות את עצמי"
      this.myAv = C().person({ ...p });
      root.add(this.myAv.object);
      this.myLast = new THREE.Vector3();
      // החיה שלי
      if (p.pet !== 'none') {
        const pet = C().pet(p.pet, p.petColor);
        root.add(pet.object);
        const eye = new THREE.Vector3();
        const fwd = new THREE.Vector3();
        this.myPet = C().follower(pet, (v) => {
          this.eye(eye, fwd);
          const y = $('#rig').object3D.position.y;
          // במבט מבחוץ: לצידי. במבט מהעיניים: קצת לפניי בצד, כדי שרואים אותה
          if (this.viewNow === 'third') return v.set(eye.x - fwd.z * 0.6 - fwd.x * 0.2, y, eye.z + fwd.x * 0.6 - fwd.z * 0.2);
          return v.set(eye.x + fwd.x * 1.5 - fwd.z * 0.85, y, eye.z + fwd.z * 1.5 + fwd.x * 0.85);
        }, { offset: 0.15 });
      }
      this.view = V().inVR() ? 'first' : 'third';
      this.viewNow = this.view;
      this.boom = 0;
      this.setupUI();
      this.setupMeBar();
      $('#chat').hidden = false;
      this.connect();
    },

    /* מיקום העיניים (נקודת המבקר) וכיוון ההליכה – בלי קשר למצלמה שמאחור */
    eye(pos, fwd) {
      const e = $('#camera').object3D;
      e.getWorldPosition(pos);
      if (fwd) {
        e.getWorldDirection(fwd); // ‎+z של היישות = אחורה
        fwd.negate(); fwd.y = 0;
        if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
        fwd.normalize();
      }
      return pos;
    },

    /* מבט מבחוץ: המצלמה מתרחקת מאחורי הדמות; מבט מהעיניים: המצלמה בתוך הראש */
    setView(v) {
      this.view = v;
      const b = $('#me-view');
      b.setAttribute('aria-pressed', v === 'third');
      b.querySelector('span').textContent = v === 'third' ? 'מבט מהעיניים' : 'לראות את עצמי';
    },
    snapFirst() {
      const cam = $('#camera').getObject3D('camera');
      if (!cam) return;
      this.boom = 0;
      cam.position.set(0, 0, 0);
      cam.updateMatrixWorld(true);
    },
    updateCamera(dt) {
      const camEl = $('#camera');
      const cam = camEl.getObject3D('camera');
      if (!cam) return;
      const Vs = V();
      const busy = Vs.inVR() || Vs.Sheet.id || Vs.Inspect.lifted;
      this.viewNow = busy ? 'first' : this.view;
      const Tk = window.StoreTruck;
      const eye = this.eye(new THREE.Vector3());
      const inside = Tk.inInterior(eye.x, eye.z) || (Tk.inSteps(eye.x, eye.z) && eye.z < Tk.T.Z1 + 0.4);
      // בתוך המשאית צפוף – מבט מהעיניים. בחוץ – רואים את עצמנו
      if (inside) this.viewNow = 'first';
      let want = this.viewNow === 'third' ? 2.7 : 0;
      // לא לתת למצלמה לצאת דרך קירות המשאית
      if (want) {
        const e = camEl.object3D;
        const test = new THREE.Vector3();
        for (let d = want; d > 0.4; d -= 0.15) {
          test.set(0, d * 0.2, d); e.localToWorld(test);
          const obst = (window.StorePlaza && window.StorePlaza.obstacles) || [];
          const ok = !(test.x > Tk.T.X0 - 0.3 && test.x < Tk.T.CAB_X1 + 0.2 && test.z > Tk.T.Z0 - 0.3 && test.z < Tk.T.Z1 + 0.2 && test.y < Tk.T.ROOF + 0.3)
            && !obst.some(([ox, oz, r]) => Math.hypot(test.x - ox, test.z - oz) < r && test.y < 4.5);
          want = d;
          if (ok) break;
        }
      }
      if (this.viewNow === 'first') this.boom = 0;
      else this.boom += (want - this.boom) * Math.min(1, dt * 4);
      cam.position.set(0, this.boom * 0.2 + (this.boom > 0.05 ? 0.15 : 0), this.boom);
      // הדמות שלי
      const av = this.myAv;
      if (av) {
        const show = this.viewNow === 'third' && this.boom > 0.6;
        av.object.visible = show;
        const fwd = new THREE.Vector3();
        this.eye(eye, fwd);
        const y = $('#rig').object3D.position.y;
        const moved = Math.hypot(eye.x - this.myLast.x, eye.z - this.myLast.z) / Math.max(dt, 1e-3);
        this.myLast.copy(eye);
        av.object.position.set(eye.x, y, eye.z);
        const want2 = Math.atan2(fwd.x, fwd.z);
        const d = Math.atan2(Math.sin(want2 - av.object.rotation.y), Math.cos(want2 - av.object.rotation.y));
        av.object.rotation.y += d * Math.min(1, dt * 10);
        av.update(dt, Math.min(moved, 4));
      }
    },
    act(a) {
      if (this.myAv) this.myAv.play(a);
      if (this.view !== 'third') this.setView('third');
      this.send({ t: 'anim', a });
    },
    setupMeBar() {
      $('#me-bar').hidden = false;
      $('#me-view').addEventListener('click', () => this.setView(this.view === 'third' ? 'first' : 'third'));
      document.querySelectorAll('#me-bar [data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
      this.setView(this.view);
    },

    connect() {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { this.offline(); return; }
      this.ws = ws;
      ws.onopen = () => {
        this.retries = 0;
        const p = this.profile;
        ws.send(JSON.stringify({ t: 'hello', name: p.name, kid: p.kid, pet: p.pet, look: { avatar: p.avatar, color: p.color, skin: p.skin, hair: p.hair, hairStyle: p.hairStyle, acc: p.acc, petColor: p.petColor } }));
      };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.handle(m); };
      ws.onclose = () => {
        const was = this.online;
        this.online = false;
        this.players.forEach((pl, id) => this.removePlayer(id));
        this.updateStatus();
        if (this.group) { this.group = null; V().Cart.useShared(null); this.renderPeople(); }
        if (this.retries < 6) { this.retries++; setTimeout(() => this.connect(), 1500 * this.retries); }
        if (!was && this.retries === 1) this.offline();
      };
    },
    offline() {
      if (this.offlineShown) return;
      this.offlineShown = true;
      this.system('המפגש עם מבקרים, הצ׳אט והקנייה המשותפת פועלים כשהחנות רצה על השרת שלה. כרגע זו תצוגה בלבד.');
      this.updateStatus();
    },
    send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); },

    handle(m) {
      switch (m.t) {
        case 'welcome':
          this.online = true;
          this.me = { id: m.id, name: m.name };
          this.quick = m.quick || this.quick;
          this.emoji = m.emoji || this.emoji;
          m.players.forEach((p) => this.addPlayer(p));
          this.log = [];
          (m.chat || []).forEach((c) => this.pushChat(c, true));
          this.system(`ברוכים הבאים, ${m.name}! ${this.players.size ? `יש כאן עוד ${this.players.size} מבקרים.` : 'אתם הראשונים כאן היום.'} אפשר להזמין חברים לקנות ביחד מרשימת המבקרים.`);
          this.renderQuick();
          this.updateStatus();
          break;
        case 'join': this.addPlayer(m.player); this.system(`${m.player.name} נכנס/ה לחנות${m.player.pet !== 'none' ? (m.player.pet === 'dog' ? ' עם כלב' : ' עם חתול') : ''}`); break;
        case 'leave': { const p = this.players.get(m.id); if (p) this.system(`${p.info.name} יצא/ה`); this.removePlayer(m.id); break; }
        case 'player': { const p = this.players.get(m.player.id); if (p) { p.info = m.player; this.refreshLabel(p); } this.renderPeople(); break; }
        case 'tick':
          m.s.forEach(([id, x, y, z, r]) => { const p = this.players.get(id); if (p) { p.target.set(x, y, z); p.targetRy = r; } });
          break;
        case 'chat': this.pushChat(m); break;
        case 'emoji': this.emote(m.id, m.e); break;
        case 'anim': { const p = this.players.get(m.id); if (p) p.av.play(m.a); break; }
        case 'group': this.onGroup(m); break;
        case 'invite': this.showInvite(m); break;
        case 'notice': V().toast(m.msg); break;
        case 'error': V().toast(m.msg); break;
        default:
      }
    },

    /* ---------- מבקרים אחרים ---------- */
    addPlayer(info) {
      if (!info || (this.me && info.id === this.me.id) || this.players.has(info.id)) return;
      const root = $('#others').object3D;
      const av = C().person({ ...info.look, kid: info.kid });
      const group = new THREE.Group();
      group.add(av.object);
      group.position.fromArray(info.pos || [0, 0, 8]);
      root.add(group);
      const p = { info, av, group, target: group.position.clone(), targetRy: info.ry || 0, last: group.position.clone(), label: null, bubble: null, bubbleUntil: 0 };
      if (info.pet && info.pet !== 'none') {
        const pet = C().pet(info.pet, info.look.petColor || PET_COLORS[info.pet][info.id % PET_COLORS[info.pet].length]);
        root.add(pet.object);
        p.pet = pet;
        p.petF = C().follower(pet, (v) => v.copy(group.position), { offset: 0.8 });
      }
      this.players.set(info.id, p);
      this.refreshLabel(p);
      this.renderPeople();
      this.updateStatus();
    },
    removePlayer(id) {
      const p = this.players.get(id);
      if (!p) return;
      p.group.parent && p.group.parent.remove(p.group);
      if (p.pet) p.pet.object.parent && p.pet.object.parent.remove(p.pet.object);
      [p.label, p.bubble].forEach((s) => s && s.userData.dispose && s.userData.dispose());
      this.players.delete(id);
      this.renderPeople();
      this.updateStatus();
    },
    refreshLabel(p) {
      if (p.label) { p.group.remove(p.label); p.label.userData.dispose(); }
      const inGroup = this.group && p.info.group === this.group.code;
      p.label = C().label(p.info.name, { bg: inGroup ? 'rgba(76,141,255,0.92)' : 'rgba(20,20,22,0.8)', size: 0.06 });
      p.label.position.y = p.av.height + 0.18;
      p.group.add(p.label);
    },
    say(p, text) {
      if (p.bubble) { p.group.remove(p.bubble); p.bubble.userData.dispose(); }
      p.bubble = C().label(text, { bg: 'rgba(255,255,255,0.96)', fg: '#1d1c1a', size: 0.065, maxW: 1.3, bold: 400 });
      p.bubble.position.y = p.av.height + 0.36 + p.bubble.scale.y / 2;
      p.group.add(p.bubble);
      p.bubbleUntil = performance.now() + 6000;
    },
    emote(id, e) {
      const p = this.players.get(id);
      if (id === (this.me && this.me.id)) { V().toast(`שלחת ${e}`); return; }
      if (!p) return;
      const s = C().label(e, { bg: 'rgba(0,0,0,0)', size: 0.16 });
      s.position.y = p.av.height + 0.5;
      s.userData.born = performance.now();
      p.group.add(s);
      (p.emotes = p.emotes || []).push(s);
      if (e === '👋') p.av.play('wave');
      if (e === '🎉') p.av.play('jump');
    },

    tick(dt) {
      const now = performance.now();
      this.players.forEach((p) => {
        const g = p.group;
        const before = g.position.clone();
        g.position.lerp(p.target, Math.min(1, dt * 8));
        const moved = before.distanceTo(g.position) / Math.max(dt, 1e-3);
        const want = p.targetRy;
        const d = Math.atan2(Math.sin(want - p.av.object.rotation.y), Math.cos(want - p.av.object.rotation.y));
        p.av.object.rotation.y += d * Math.min(1, dt * 8);
        p.av.update(dt, moved);
        if (p.petF) p.petF.update(dt);
        if (p.bubble && now > p.bubbleUntil) { g.remove(p.bubble); p.bubble.userData.dispose(); p.bubble = null; }
        if (p.emotes) p.emotes = p.emotes.filter((s) => {
          const age = (now - s.userData.born) / 1000;
          s.position.y += dt * 0.35;
          s.material.opacity = Math.max(0, 1 - age / 2);
          if (age > 2) { g.remove(s); s.userData.dispose(); return false; }
          return true;
        });
      });
      this.updateCamera(dt);
      if (this.myPet) this.myPet.update(dt);
      // שליחת המיקום שלי
      this.sendTimer -= dt;
      if (this.online && this.sendTimer <= 0) {
        this.sendTimer = 0.12;
        const pos = new THREE.Vector3(); const dir = new THREE.Vector3();
        this.eye(pos, dir);
        const y = $('#rig').object3D.position.y;
        const key = `${pos.x.toFixed(2)},${pos.z.toFixed(2)},${y.toFixed(2)},${Math.atan2(dir.x, dir.z).toFixed(2)}`;
        if (key !== this.lastSent) {
          this.lastSent = key;
          this.send({ t: 'pos', p: [pos.x, y, pos.z], r: Math.atan2(dir.x, dir.z) });
        }
      }
    },

    /* ---------- צ'אט ---------- */
    system(text, to = this.tab) { this.pushChat({ id: 0, name: 'החנות', text, to, ts: Date.now() }); },
    pushChat(c, silent) {
      if (c.id && this.muted.has(c.id)) return;
      this.log.push(c);
      if (this.log.length > 120) this.log.shift();
      if (c.id && c.id !== (this.me && this.me.id)) {
        const p = this.players.get(c.id);
        if (p) this.say(p, c.text);
      }
      if (!silent && c.to !== this.tab && c.id) { this.unread[c.to] = (this.unread[c.to] || 0) + 1; }
      this.renderLog();
      if (V().Panel.kind === 'vr-chat') openVRChat(true);
    },
    renderLog() {
      const ol = $('#chat-log');
      if (!ol) return;
      ol.innerHTML = '';
      this.log.filter((c) => c.to === this.tab || c.id === 0 && !c.to).slice(-60).forEach((c) => {
        const li = h('li', c.id === 0 ? 'sys' : c.id === (this.me && this.me.id) ? 'mine' : '');
        if (c.id !== 0) li.append(h('b', '', c.name));
        li.append(h('span', '', c.text));
        ol.append(li);
      });
      ol.scrollTop = ol.scrollHeight;
      $('#tab-all').dataset.unread = this.unread.all || '';
      $('#tab-group').dataset.unread = this.unread.group || '';
    },
    setTab(t) {
      if (t === 'group' && !this.group) { this.openPeople(); V().toast('פתחו קבוצה או הצטרפו לקבוצה כדי לדבר עם המשפחה והחברים'); return; }
      this.tab = t;
      this.unread[t] = 0;
      $('#tab-all').setAttribute('aria-selected', t === 'all');
      $('#tab-group').setAttribute('aria-selected', t === 'group');
      this.renderQuick();
      this.renderLog();
    },
    renderQuick() {
      const box = $('#chat-quick');
      box.innerHTML = '';
      const row = h('div', 'emoji-row');
      this.emoji.forEach((e) => {
        const b = h('button', '', e); b.type = 'button'; b.setAttribute('aria-label', `תגובה ${e}`);
        b.addEventListener('click', () => { if (!this.online) return this.needServer(); this.send({ t: 'emoji', e }); });
        row.append(b);
      });
      box.append(row);
      const phrases = h('div', 'phrase-row');
      Object.entries(this.quick).forEach(([id, text]) => {
        const b = h('button', '', text); b.type = 'button';
        b.addEventListener('click', () => { if (!this.online) return this.needServer(); this.send({ t: 'chat', quick: id, to: this.tab }); });
        phrases.append(b);
      });
      box.append(phrases);
      // מצב ילדים: לכולם רק משפטים מוכנים
      const kidLock = this.profile.kid && this.tab === 'all';
      $('#chat-input').disabled = kidLock || !this.online;
      $('#chat-input').placeholder = !this.online ? 'הצ׳אט פועל כשהחנות מחוברת לשרת' : kidLock ? 'במצב ילדים שולחים לכולם משפטים מוכנים' : this.tab === 'group' ? 'הודעה לקבוצה…' : 'הודעה לכולם…';
    },
    needServer() { V().toast('הצ׳אט פועל כשהחנות מחוברת לשרת'); },

    /* ---------- קבוצה וסל משותף ---------- */
    onGroup(m) {
      const Cart = V().Cart;
      if (!m.code) {
        this.group = null;
        Cart.useShared(null);
        if (this.tab === 'group') this.setTab('all');
      } else {
        const fresh = !this.group || this.group.code !== m.code;
        this.group = m;
        if (!Cart.adapter) {
          Cart.useShared({
            code: () => this.group && this.group.code,
            add: (key, qty) => this.send({ t: 'gcart', key, qty, op: 'add' }),
            set: (key, qty) => this.send({ t: 'gcart', key, qty, op: 'set' }),
            clear: (paid) => this.send({ t: 'gcart-clear', paid: !!paid }),
          });
        }
        Cart.applyShared(m.cart);
        if (fresh) { this.setTab('group'); V().toast(`את/ה בקבוצה ${m.code} – הסל עכשיו משותף`); }
      }
      this.players.forEach((p) => this.refreshLabel(p));
      this.renderPeople();
      this.updateStatus();
    },
    showInvite(m) {
      this.pendingInvite = m;
      $('#invite-text').textContent = `${m.name} מזמין/ה אותך לקנות ביחד בסל משותף`;
      $('#invite-toast').hidden = false;
      $('#invite-yes').focus();
    },

    /* ---------- רשימת מבקרים וקבוצה ---------- */
    openPeople() { V().Sheet.close(); V().CartDrawer.close(); this.renderPeople(); $('#people').hidden = false; },
    closePeople() { $('#people').hidden = true; },
    renderPeople() {
      const box = $('#group-box');
      if (!box) return;
      box.innerHTML = '';
      if (!this.online) {
        box.append(h('p', 'muted', 'קבוצות וקנייה משותפת פועלות כשהחנות מחוברת לשרת.'));
      } else if (!this.group) {
        box.append(h('h3', '', 'קונים ביחד'));
        box.append(h('p', 'muted', 'פתחו קבוצה למשפחה או לחברים: כולם מוסיפים לאותו סל, מדברים בצ׳אט של הקבוצה, ומשלמים פעם אחת עם משלוח הביתה.'));
        const b = h('button', 'btn-buy', 'פתיחת קבוצה'); b.type = 'button';
        b.addEventListener('click', () => this.send({ t: 'group-create' }));
        box.append(b);
        const f = h('form', 'join');
        const inp = h('input'); inp.placeholder = 'קוד קבוצה'; inp.maxLength = 4; inp.setAttribute('aria-label', 'קוד קבוצה'); inp.dir = 'ltr';
        const jb = h('button', '', 'הצטרפות'); jb.type = 'submit';
        f.append(inp, jb);
        f.addEventListener('submit', (e) => { e.preventDefault(); if (inp.value.trim()) this.send({ t: 'group-join', code: inp.value.trim() }); });
        box.append(f);
      } else {
        box.append(h('h3', '', 'הקבוצה שלך'));
        const code = h('div', 'code');
        code.append(h('span', '', 'קוד להצטרפות'), h('b', '', this.group.code));
        const cp = h('button', 'link', 'העתקה'); cp.type = 'button';
        cp.addEventListener('click', () => {
          const text = `בואו לקנות איתי בחנות ${window.STORE_CONFIG.name}! קוד הקבוצה: ${this.group.code}`;
          (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => V().toast('הקוד הועתק – שלחו אותו למשפחה ולחברים')).catch(() => V().toast(`הקוד: ${this.group.code}`));
        });
        code.append(cp);
        box.append(code);
        const ul = h('ul', 'members');
        this.group.members.forEach((m) => ul.append(h('li', '', `${m.name}${this.me && m.id === this.me.id ? ' (את/ה)' : ''}`)));
        box.append(ul);
        const row = h('div', 'row');
        const cart = h('button', 'btn-buy', `לסל המשותף (${V().Cart.count()})`); cart.type = 'button';
        cart.addEventListener('click', () => { this.closePeople(); V().CartDrawer.open(); });
        const leave = h('button', 'link', 'יציאה מהקבוצה'); leave.type = 'button';
        leave.addEventListener('click', () => this.send({ t: 'group-leave' }));
        row.append(cart, leave);
        box.append(row);
      }
      const list = $('#people-list');
      list.innerHTML = '';
      if (!this.players.size) list.append(h('li', 'muted', this.online ? 'עוד אין מבקרים אחרים. שלחו קוד קבוצה למשפחה ולחברים כדי שיצטרפו.' : '—'));
      this.players.forEach((p, id) => {
        const li = h('li', 'person');
        const dot = h('i'); dot.style.background = p.info.look.color;
        const name = h('span', 'n', p.info.name);
        const tags = [];
        if (p.info.kid) tags.push('ילד/ה');
        if (p.info.pet === 'dog') tags.push('עם כלב'); else if (p.info.pet === 'cat') tags.push('עם חתול');
        if (this.group && p.info.group === this.group.code) tags.push('בקבוצה שלך');
        li.append(dot, name, h('span', 'tags', tags.join(' · ')));
        const acts = h('div', 'acts');
        const go = h('button', '', 'לגשת'); go.type = 'button';
        go.addEventListener('click', () => { this.closePeople(); const t = p.group.position; V().Nav.go({ x: t.x + 0.9, z: t.z + 0.9, yaw: Math.atan2(0.9, 0.9), pitch: -0.05 }); });
        acts.append(go);
        if (!(this.group && p.info.group === this.group.code)) {
          const inv = h('button', '', 'הזמנה לקנות יחד'); inv.type = 'button';
          inv.addEventListener('click', () => this.send({ t: 'invite', id }));
          acts.append(inv);
        }
        const mute = h('button', 'quiet', this.muted.has(id) ? 'ביטול השתקה' : 'השתקה'); mute.type = 'button';
        mute.addEventListener('click', () => {
          if (this.muted.has(id)) { this.muted.delete(id); this.send({ t: 'unmute', id }); } else { this.muted.add(id); this.send({ t: 'mute', id }); }
          this.renderPeople();
        });
        const rep = h('button', 'quiet', 'דיווח'); rep.type = 'button';
        rep.addEventListener('click', () => { this.muted.add(id); this.send({ t: 'report', id }); this.renderPeople(); });
        acts.append(mute, rep);
        li.append(acts);
        list.append(li);
      });
    },
    updateStatus() {
      const n = this.players.size + (this.online ? 1 : 0);
      $('#hud-people-label').textContent = this.online ? `${n} בחנות${this.group ? ` · קבוצה ${this.group.code}` : ''}` : 'מבקרים';
      $('#live-dot').classList.toggle('on', this.online);
      this.renderQuick();
    },

    setupUI() {
      $('#chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const inp = $('#chat-input');
        const text = inp.value.trim();
        if (!text) return;
        if (!this.online) return this.needServer();
        this.send({ t: 'chat', text, to: this.tab });
        inp.value = '';
      });
      $('#tab-all').addEventListener('click', () => this.setTab('all'));
      $('#tab-group').addEventListener('click', () => this.setTab('group'));
      $('#chat-toggle').addEventListener('click', () => {
        const min = $('#chat').classList.toggle('min');
        $('#chat-toggle').textContent = min ? '+' : '–';
        $('#chat-toggle').setAttribute('aria-label', min ? 'פתיחת הצ׳אט' : 'מזעור הצ׳אט');
      });
      $('#chat').classList.add('min'); $('#chat-toggle').textContent = '+'; $('#chat-toggle').setAttribute('aria-label', 'פתיחת הצ׳אט'); // מתחיל ממוזער – מסך נקי
      $('#hud-people').addEventListener('click', () => ($('#people').hidden ? this.openPeople() : this.closePeople()));
      $('#people .drawer-x').addEventListener('click', () => this.closePeople());
      $('#invite-yes').addEventListener('click', () => { $('#invite-toast').hidden = true; if (this.pendingInvite) this.send({ t: 'group-join', code: this.pendingInvite.code }); });
      $('#invite-no').addEventListener('click', () => { $('#invite-toast').hidden = true; });
      this.renderQuick();
      this.renderPeople();
      this.updateStatus();
    },
  };

  /* ---------- צ'אט מהיר במשקף (אי אפשר להקליד שם בנוחות) ---------- */
  function openVRChat(keep) {
    const { Panel, UI } = V();
    Panel.open('vr-chat', (L) => {
      L.text('צ׳אט', { size: 0.04, weight: 700, gap: 0.01 });
      const msgs = Social.log.filter((c) => c.to === Social.tab).slice(-4);
      if (!msgs.length) L.text('עוד אין הודעות', { size: 0.022, color: UI.muted, gap: 0.01 });
      msgs.forEach((c) => L.text(c.id ? `${c.name}: ${c.text}` : c.text, { size: 0.022, color: c.id ? UI.ink : UI.muted, gap: 0.006 }));
      L.divider(0.02);
      const items = Object.entries(Social.quick).slice(0, 6);
      items.forEach(([id, text], i) => {
        const w = (L.inner - 0.02) / 2;
        const x = i % 2 === 0 ? L.inner / 2 - w / 2 : -L.inner / 2 + w / 2;
        L.button(text, () => Social.send({ t: 'chat', quick: id, to: Social.tab }), { primary: false, h: 0.055, w, x, inline: i % 2 === 0 });
      });
      L.space(0.01);
      const es = Social.emoji.slice(0, 6);
      const ew = (L.inner - 0.05) / es.length;
      es.forEach((e, i) => L.button(e, () => Social.send({ t: 'emoji', e }), { primary: false, h: 0.06, w: ew, x: L.inner / 2 - ew / 2 - i * (ew + 0.01), inline: i < es.length - 1 }));
    }, { width: 0.6, place: keep ? false : undefined });
  }

  AFRAME.registerComponent('social-tick', {
    tick(t, dt) { if (Social.started) Social.tick(Math.min(dt, 100) / 1000); },
  });

  document.addEventListener('DOMContentLoaded', () => {
    Social.initForm();
    const others = $('#others');
    const attach = () => {
      others.setAttribute('social-tick', '');
      // כפתור צ'אט על פרק היד (במשקף)
      const btn = V().entity($('#leftHand'), { position: '0 0.1 0.08', rotation: '-60 0 0' });
      btn.setAttribute('canvas-text', { text: 'צ׳אט', width: 0.12, height: 0.042, fontSize: 0.018, weight: 500, align: 'center', bg: '#4c8dff', color: '#ffffff', radius: 0.021 });
      btn.classList.add('clickable');
      btn.addEventListener('click', () => openVRChat());
    };
    if (others.hasLoaded) attach(); else others.addEventListener('loaded', attach);
  });

  window.StoreSocial = Social;
})();
