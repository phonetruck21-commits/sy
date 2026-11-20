/* שרת "חי": מבקרים בזמן אמת, צ'אט, קבוצות וסל משותף.
 * עובד מעל WebSocket בנתיב /live. הכול בזיכרון – מתאים לחנות אחת.
 *
 * בטיחות:
 *  - שמות והודעות עוברים סינון מילים וקיצור אורך
 *  - הגבלת קצב הודעות לכל מבקר
 *  - "מצב ילדים": שולחים רק משפטים מוכנים ואמוג'י, ולא מקבלים הודעות
 *    חופשיות מזרים (רק מחברי הקבוצה שלהם)
 *  - חסימת מספרי טלפון, מיילים וקישורים בהודעות חופשיות
 */
'use strict';

const { WebSocketServer } = require('ws');
const { PRODUCTS } = require('./js/products.js');

const MAX_PLAYERS = 60;
const TICK_MS = 100;

/* משפטים מוכנים (הלקוח שולח רק מזהה) */
const QUICK = {
  hi: 'שלום! 👋',
  nice: 'איזה יופי!',
  join: 'רוצים לקנות ביחד?',
  look: 'בואו לראות את זה',
  pet: 'איזו חיה חמודה!',
  thanks: 'תודה!',
  bye: 'להתראות! 👋',
  yes: 'כן',
  no: 'לא, תודה',
};
const EMOJI = ['👋', '😀', '❤️', '👍', '🎉', '🐶', '🐱', '😂', '😮', '🛍️'];

/* סינון בסיסי – אפשר להרחיב לפי הצורך */
const BAD = [
  'זונה', 'שרמוטה', 'מניאק', 'בן זונה', 'כוס', 'זין', 'חרא', 'מטומטם', 'אידיוט', 'דביל', 'סתום', 'תמות',
  'fuck', 'shit', 'bitch', 'dick', 'cunt', 'whore', 'nigger', 'faggot', 'retard', 'kill yourself',
];
const badRe = new RegExp(BAD.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
const personalRe = /(\+?\d[\d\s-]{7,}\d)|([^\s@]+@[^\s@]+\.[^\s@]+)|(https?:\/\/\S+)|(www\.\S+)|(\b\S+\.(com|co\.il|net|org|io|ly)\b)/gi;

function clean(text, max) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(badRe, (m) => '•'.repeat(Math.min(m.length, 5)));
}
function cleanChat(text) {
  return clean(text, 140).replace(personalRe, '[הוסר]');
}

const COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e7dbe', '#2a9d8f', '#e76f51'];

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/live', maxPayload: 8 * 1024 });
  const players = new Map(); // id -> player
  const groups = new Map();  // code -> { code, members:Set<id>, cart: {key: {qty, by:Set<name>}} }
  const recent = [];         // הודעות אחרונות בצ'אט הכללי
  let nextId = 1;

  const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, filter) => {
    const data = JSON.stringify(msg);
    players.forEach((p) => { if (p.ready && p.ws.readyState === 1 && (!filter || filter(p))) p.ws.send(data); });
  };
  const pub = (p) => ({ id: p.id, name: p.name, look: p.look, pet: p.pet, kid: p.kid, pos: p.pos, ry: p.ry, group: p.group });

  function groupState(g) {
    return {
      t: 'group',
      code: g.code,
      members: [...g.members].map((id) => players.get(id)).filter(Boolean).map((p) => ({ id: p.id, name: p.name, kid: p.kid })),
      cart: Object.fromEntries(Object.entries(g.cart).map(([k, v]) => [k, { qty: v.qty, by: [...v.by] }])),
    };
  }
  const groupBroadcast = (g) => { const st = groupState(g); g.members.forEach((id) => { const p = players.get(id); if (p) send(p, st); }); };
  const groupSay = (g, text) => g.members.forEach((id) => { const p = players.get(id); if (p) send(p, { t: 'chat', id: 0, name: 'החנות', text, to: 'group', ts: Date.now() }); });

  function newCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c;
    do { c = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join(''); } while (groups.has(c));
    return c;
  }

  function leaveGroup(p) {
    if (!p.group) return;
    const g = groups.get(p.group);
    p.group = null;
    if (!g) return;
    g.members.delete(p.id);
    if (!g.members.size) groups.delete(g.code);
    else { groupBroadcast(g); groupSay(g, `${p.name} יצא/ה מהקבוצה`); }
    broadcast({ t: 'player', player: pub(p) });
  }

  function joinGroup(p, code) {
    const g = groups.get(String(code || '').toUpperCase().trim());
    if (!g) return send(p, { t: 'error', msg: 'לא נמצאה קבוצה עם הקוד הזה' });
    if (g.members.size >= 8) return send(p, { t: 'error', msg: 'הקבוצה מלאה (עד 8 חברים)' });
    if (p.group === g.code) return groupBroadcast(g);
    leaveGroup(p);
    g.members.add(p.id);
    p.group = g.code;
    groupBroadcast(g);
    groupSay(g, `${p.name} הצטרף/ה לקבוצה 🎉`);
    broadcast({ t: 'player', player: pub(p) });
  }

  function rateOk(p) {
    const now = Date.now();
    p.msgTimes = p.msgTimes.filter((t) => now - t < 10000);
    if (p.msgTimes.length >= 6 || now - (p.msgTimes[p.msgTimes.length - 1] || 0) < 700) return false;
    p.msgTimes.push(now);
    return true;
  }

  wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) { ws.close(1013, 'full'); return; }
    const p = { id: nextId++, ws, ready: false, name: 'אורח', look: {}, pet: 'none', kid: false, pos: [0, 0, 8], ry: 0, group: null, msgTimes: [], muted: new Set(), moved: false };
    players.set(p.id, p);

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'hello' && !p.ready) {
        p.name = clean(m.name, 16) || `אורח ${p.id}`;
        p.kid = !!m.kid;
        const L = m.look || {};
        const pickOne = (v, list, def) => (list.includes(v) ? v : def);
        const AVATARS = ['Female_Adult_01', 'Female_Adult_08', 'Female_Adult_17', 'Male_Adult_08', 'Male_Adult_09', 'Male_Adult_16', 'Female_Child_01', 'Male_Child_01'];
        p.look = {
          avatar: pickOne(L.avatar, AVATARS, null),
          color: pickOne(L.color, COLORS, COLORS[p.id % COLORS.length]),
          skin: pickOne(L.skin, ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'], '#e0ac69'),
          hair: pickOne(L.hair, ['#2b2018', '#5a3a22', '#a8642c', '#d9b26a', '#9a9a9a'], '#2b2018'),
          hairStyle: pickOne(L.hairStyle, ['short', 'long', 'ponytail', 'curly'], 'short'),
          acc: pickOne(L.acc, ['none', 'cap', 'glasses'], 'none'),
          petColor: /^#[0-9a-f]{6}$/i.test(L.petColor || '') ? L.petColor : null,
        };
        p.pet = ['dog', 'cat', 'none'].includes(m.pet) ? m.pet : 'none';
        p.ready = true;
        send(p, {
          t: 'welcome', id: p.id, name: p.name,
          players: [...players.values()].filter((o) => o.ready && o.id !== p.id).map(pub),
          chat: p.kid ? recent.filter((c) => c.quick) : recent,
          quick: QUICK, emoji: EMOJI,
        });
        broadcast({ t: 'join', player: pub(p) }, (o) => o.id !== p.id);
        return;
      }
      if (!p.ready) return;

      switch (m.t) {
        case 'pos': {
          if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
          p.pos = m.p.map((v) => Math.max(-40, Math.min(40, Math.round(v * 100) / 100)));
          p.ry = Number.isFinite(m.r) ? Math.round(m.r * 100) / 100 : 0;
          p.moved = true;
          break;
        }
        case 'chat': {
          if (!rateOk(p)) return send(p, { t: 'error', msg: 'רגע, לאט יותר 🙂' });
          const to = m.to === 'group' && p.group ? 'group' : 'all';
          let text, quick = false;
          if (m.quick && QUICK[m.quick]) { text = QUICK[m.quick]; quick = true; }
          else {
            // ילדים שולחים רק משפטים מוכנים לכולם; בקבוצה (משפחה וחברים) מותר טקסט חופשי
            if (p.kid && to === 'all') return send(p, { t: 'error', msg: 'במצב ילדים שולחים לכולם רק משפטים מוכנים' });
            text = cleanChat(m.text);
          }
          if (!text) return;
          const msg = { t: 'chat', id: p.id, name: p.name, text, to, quick, ts: Date.now() };
          if (to === 'group') {
            const g = groups.get(p.group);
            g.members.forEach((id) => { const o = players.get(id); if (o && !o.muted.has(p.id)) send(o, msg); });
          } else {
            recent.push(msg); if (recent.length > 30) recent.shift();
            // ילדים לא מקבלים הודעות חופשיות מזרים
            broadcast(msg, (o) => !o.muted.has(p.id) && (!o.kid || quick || o.id === p.id));
          }
          break;
        }
        case 'emoji': {
          if (!EMOJI.includes(m.e) || !rateOk(p)) return;
          broadcast({ t: 'emoji', id: p.id, e: m.e }, (o) => !o.muted.has(p.id));
          break;
        }
        case 'anim': {
          if (!['wave', 'dance', 'jump'].includes(m.a) || !rateOk(p)) return;
          broadcast({ t: 'anim', id: p.id, a: m.a }, (o) => o.id !== p.id && !o.muted.has(p.id));
          break;
        }
        case 'mute': { const id = Number(m.id); if (players.has(id)) p.muted.add(id); break; }
        case 'unmute': { p.muted.delete(Number(m.id)); break; }
        case 'report': {
          const o = players.get(Number(m.id));
          if (o) console.warn(`[report] ${p.name}#${p.id} reported ${o.name}#${o.id}`);
          send(p, { t: 'notice', msg: 'תודה, הדיווח התקבל. המבקר הושתק אצלך.' });
          p.muted.add(Number(m.id));
          break;
        }
        case 'group-create': {
          leaveGroup(p);
          const g = { code: newCode(), members: new Set([p.id]), cart: {} };
          groups.set(g.code, g);
          p.group = g.code;
          groupBroadcast(g);
          broadcast({ t: 'player', player: pub(p) });
          break;
        }
        case 'group-join': joinGroup(p, m.code); break;
        case 'group-leave': leaveGroup(p); send(p, { t: 'group', code: null }); break;
        case 'invite': {
          const o = players.get(Number(m.id));
          if (!o || o.id === p.id || o.muted.has(p.id)) return;
          if (!p.group) {
            const g = { code: newCode(), members: new Set([p.id]), cart: {} };
            groups.set(g.code, g); p.group = g.code; groupBroadcast(g);
            broadcast({ t: 'player', player: pub(p) });
          }
          if (!rateOk(p)) return;
          send(o, { t: 'invite', from: p.id, name: p.name, code: p.group });
          send(p, { t: 'notice', msg: `ההזמנה נשלחה ל${o.name}` });
          break;
        }
        case 'gcart': {
          const g = p.group && groups.get(p.group);
          if (!g) return;
          const key = String(m.key || '');
          const [id, vid] = key.split('|');
          const prod = PRODUCTS.find((x) => x.id === id);
          if (!prod || (vid && !(prod.variants || []).some((v) => v.id === vid))) return;
          const cur = g.cart[key] || { qty: 0, by: new Set() };
          const qty = Math.max(0, Math.min(99, m.op === 'set' ? Number(m.qty) || 0 : cur.qty + (Number(m.qty) || 1)));
          if (qty === 0) delete g.cart[key];
          else { cur.qty = qty; if (m.op !== 'set') cur.by.add(p.name); g.cart[key] = cur; }
          groupBroadcast(g);
          if (m.op !== 'set' && qty > cur.qty - (Number(m.qty) || 1)) groupSay(g, `${p.name} הוסיף/ה לסל המשותף: ${prod.name}`);
          break;
        }
        case 'gcart-clear': {
          const g = p.group && groups.get(p.group);
          if (!g) return;
          g.cart = {};
          groupBroadcast(g);
          if (m.paid) groupSay(g, `🎉 ${p.name} שילם/ה על הסל המשותף. המשלוח בדרך הביתה!`);
          break;
        }
        default:
      }
    });

    ws.on('close', () => {
      leaveGroup(p);
      players.delete(p.id);
      if (p.ready) broadcast({ t: 'leave', id: p.id });
    });
    ws.on('error', () => {});
  });

  // עדכוני מיקום מרוכזים
  setInterval(() => {
    const moved = [...players.values()].filter((p) => p.ready && p.moved);
    if (!moved.length) return;
    const s = moved.map((p) => { p.moved = false; return [p.id, ...p.pos, p.ry]; });
    broadcast({ t: 'tick', s });
  }, TICK_MS).unref();

  return { wss, players, groups };
}

module.exports = { attach, clean, cleanChat, QUICK, EMOJI };
