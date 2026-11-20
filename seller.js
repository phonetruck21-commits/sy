/* מוכר/ת AI בחנות: עונה על שאלות, ממליצה ומשווה בין מוצרים מהקטלוג.
 * משמש גם את האתר וגם את אפליקציית Unreal (אותו endpoint: POST /api/seller).
 * דורש מפתח API של Anthropic בשרת (ANTHROPIC_API_KEY); הוא לא מגיע לדפדפן.
 */
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { STORE_CONFIG, CATEGORIES, PRODUCTS } = require('./js/products.js');

const MODEL = 'claude-opus-5-5';

/* הקטלוג נכנס להנחיית המערכת – קבוע, כדי שיישמר במטמון (prompt caching) */
function catalogText() {
  const cat = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || id;
  return PRODUCTS.map((p) => [
    `- id: ${p.id}`,
    `  שם: ${p.name} (${cat(p.category)})`,
    `  מחיר: ${p.price} ${STORE_CONFIG.currency}${p.oldPrice ? ` (במקום ${p.oldPrice}, מבצע)` : ''}`,
    `  תיאור: ${p.description}`,
    p.details ? `  פרטים: ${p.details.join(', ')}` : null,
    p.variants ? `  צבעים: ${p.variants.map((v) => v.label).join(', ')}` : null,
  ].filter(Boolean).join('\n')).join('\n');
}

function systemPrompt(kid) {
  const ship = STORE_CONFIG.freeShippingOver
    ? `משלוח עד הבית ב-${STORE_CONFIG.shippingCost} ${STORE_CONFIG.currency}, וחינם בהזמנה מעל ${STORE_CONFIG.freeShippingOver} ${STORE_CONFIG.currency}. אפשר לבחור מועד: מחר או בעוד יומיים, בוקר או ערב.`
    : 'המשלוח עד הבית חינם.';
  return `את/ה המוכר/ת בחנות הסלולר "${STORE_CONFIG.name}" – חנות במשאית שחונה ברחבה עם גינת כלבים ופינת ילדים, בעולם וירטואלי.
מבקרים מדברים איתך בתוך החנות. עני/ה בעברית, בחום ובקצרה (2–4 משפטים), כמו מוכר/ת טוב/ה בחנות אמיתית: שאל/י שאלה אחת כשחסר מידע כדי להמליץ, השווה/י בין מוצרים כשמבקשים, והצע/י אביזר מתאים כשזה באמת עוזר.

כללים:
- המלצי/ץ רק על מוצרים מהקטלוג שלמטה, עם המחירים שמופיעים בו. אל תמציא/י מוצרים, מבצעים, מלאי או מפרטים שלא כתובים.
- אם שואלים על משהו שלא בקטלוג או שאת/ה לא יודע/ת – אמור/י זאת בפשטות.
- את התשלום והמשלוח עושים בסל הקניות בחנות; אל תבקש/י פרטי תשלום, כתובת או טלפון בשיחה.
- ${ship}
${kid ? '- המבקר/ת הוא ילד/ה: דבר/י בפשטות ובעדינות, בלי לחץ לקנות, והציע/י לשתף את ההורים בהחלטה.\n' : ''}
החזר/י JSON לפי הסכימה: reply – התשובה למבקר; products – מזהי המוצרים (id) שהזכרת, לפי הסדר, כדי שהחנות תוכל להאיר אותם (רשימה ריקה אם לא הזכרת מוצר).

הקטלוג:
${catalogText()}`;
}

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    products: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'products'],
  additionalProperties: false,
};

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // מפתח מ-ANTHROPIC_API_KEY בסביבת השרת
  return client;
}

/* בדיקת היסטוריית השיחה שהדפדפן/האפליקציה שולחים */
function cleanHistory(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 24) return null;
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const content = m.content.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 600);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  if (out[0].role !== 'user' || out[out.length - 1].role !== 'user') return null;
  return out;
}

async function ask(messages, { kid = false } = {}) {
  const history = cleanHistory(messages);
  if (!history) { const e = new Error('שיחה לא תקינה'); e.status = 400; throw e; }

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    // שיחה בחנות: תשובה מהירה חשובה יותר מחשיבה עמוקה
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    // אם בקשה נדחית מטעמי בטיחות, השרת של Anthropic מנסה אוטומטית מודל חלופי
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: systemPrompt(kid), cache_control: { type: 'ephemeral' } }],
    messages: history,
  });

  if (response.stop_reason === 'refusal') {
    return { reply: 'סליחה, בזה אני לא יכול/ה לעזור. אשמח לעזור לבחור טלפון או אביזר 🙂', products: [] };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { reply: text.trim(), products: [] }; }
  const ids = new Set(PRODUCTS.map((p) => p.id));
  return {
    reply: String(data.reply || '').slice(0, 1200),
    products: (Array.isArray(data.products) ? data.products : []).filter((id) => ids.has(id)).slice(0, 4),
  };
}

module.exports = { ask, systemPrompt, cleanHistory, Anthropic };
