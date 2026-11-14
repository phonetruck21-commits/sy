// קטלוג המוצרים של החנות – כאן משנים מוצרים, מחירים וצבעים.
//
// שדות של מוצר:
//   device:   דגם שנבנה בקוד – phone | tablet | watch | buds | charger | powerbank | case
//   model:    או קובץ דגם תלת-ממדי (GLB) בתיקייה assets/models
//   scale:    הגדלה/הקטנה של קובץ GLB (1 = הגודל המקורי)
//   dims:     מידות במטרים לטלפון/טאבלט { w: רוחב, h: גובה, d: עובי }
//   cameras:  מספר עדשות מצלמה (טלפון/טאבלט)
//   screen:   שני צבעים לרקע המסך
//   display:  איפה המוצר מוצג במשאית – table (שולחן התצוגה) | shelf (קיר האביזרים)
//   price:    המחיר שגובים (השרת מחשב לפיו)
//   oldPrice: מחיר קודם להצגה מחוקה (מבצע) – לא חובה
//   variants: צבעים לבחירה – id, label (שם לתצוגה), color (צבע הגוף)
//   details:  שורות מידע נוספות
// המידות שמוצגות ללקוח (רוחב × גובה × עומק) מחושבות אוטומטית מהדגם.

(function (root) {
const STORE_CONFIG = {
  name: 'נובה',
  tagline: 'חנות סלולר ניידת',
  currency: '₪',
  currencyCode: 'ILS',    // קוד מטבע לסליקה ב-PayPal
  shippingCost: 29,       // דמי משלוח
  freeShippingOver: 300,  // משלוח חינם מעל סכום זה (0 = תמיד חינם)
};

const CATEGORIES = [
  { id: 'phones', name: 'סמארטפונים' },
  { id: 'tablets', name: 'טאבלטים' },
  { id: 'wearables', name: 'לבישים' },
  { id: 'audio', name: 'אודיו' },
  { id: 'power', name: 'טעינה' },
  { id: 'cases', name: 'כיסויים' },
];

const PRODUCTS = [
  {
    id: 'nova-x-pro', category: 'phones', display: 'table', device: 'phone',
    name: 'נובה X Pro', price: 4290,
    dims: { w: 0.0772, h: 0.1631, d: 0.0083 }, cameras: 3, screen: ['#0f1b3d', '#6b4bb8'],
    description: 'מסגרת טיטניום, מסך 6.7 אינץ׳ 120Hz ומערכת שלוש מצלמות עם זום אופטי פי 5.',
    details: ['256GB', 'מצלמה ראשית 50MP', 'סוללה 5,000mAh', 'אחריות שנתיים'],
    variants: [
      { id: 'natural', label: 'טיטניום טבעי', color: '#b8b1a6' },
      { id: 'black', label: 'טיטניום שחור', color: '#3a3a3c' },
      { id: 'desert', label: 'חול מדברי', color: '#c4a98a' },
      { id: 'blue', label: 'כחול עמוק', color: '#2f3d52' },
    ],
  },
  {
    id: 'nova-x', category: 'phones', display: 'table', device: 'phone',
    name: 'נובה X', price: 3290,
    dims: { w: 0.0716, h: 0.1475, d: 0.0078 }, cameras: 2, screen: ['#103a3a', '#c97b4a'],
    description: 'מסך 6.1 אינץ׳ בהיר במיוחד, גוף אלומיניום וזכוכית מט, ומצלמה כפולה לצילום לילה.',
    details: ['128GB', 'מצלמה ראשית 48MP', 'טעינה מהירה 45W', 'אחריות שנתיים'],
    variants: [
      { id: 'midnight', label: 'שחור', color: '#232428' },
      { id: 'white', label: 'לבן', color: '#e7e4df' },
      { id: 'sage', label: 'ירוק מרווה', color: '#9db29e' },
      { id: 'rose', label: 'ורוד', color: '#e2c1bf' },
    ],
  },
  {
    id: 'nova-a5', category: 'phones', display: 'table', device: 'phone',
    name: 'נובה A5', price: 1490, oldPrice: 1690,
    dims: { w: 0.0764, h: 0.1642, d: 0.0082 }, cameras: 2, screen: ['#2b1d4f', '#4fa3a5'],
    description: 'כל מה שצריך במחיר נגיש: מסך 6.5 אינץ׳, סוללה ליומיים ומצלמה של 50MP.',
    details: ['128GB', 'סוללה 5,000mAh', 'עמיד במים IP67', 'אחריות שנתיים'],
    variants: [
      { id: 'lilac', label: 'לילך', color: '#b7a7d4' },
      { id: 'mint', label: 'מנטה', color: '#a6d3c1' },
      { id: 'graphite', label: 'גרפיט', color: '#2b2c30' },
    ],
  },
  {
    id: 'nova-tab', category: 'tablets', display: 'table', device: 'tablet',
    name: 'נובה Tab 11', price: 2190,
    dims: { w: 0.1785, h: 0.2565, d: 0.0062 }, cameras: 1, screen: ['#1c2c4c', '#d17d6e'],
    description: 'טאבלט 11 אינץ׳ קל ודק לעבודה, לימודים וצפייה, עם תמיכה בעט ובמקלדת.',
    details: ['128GB', 'מסך 11 אינץ׳ 90Hz', 'ארבעה רמקולים', 'אחריות שנתיים'],
    variants: [
      { id: 'silver', label: 'כסוף', color: '#c9cacc' },
      { id: 'graphite', label: 'גרפיט', color: '#3b3c40' },
    ],
  },
  {
    id: 'nova-watch', category: 'wearables', display: 'table', device: 'watch',
    name: 'נובה Watch 3', price: 1190,
    description: 'שעון חכם עם מדידת דופק וחמצן, GPS מובנה ועד שלושה ימי סוללה.',
    details: ['מסך AMOLED', 'עמיד במים 5ATM', 'מתאים לאנדרואיד', 'רצועה ניתנת להחלפה'],
    variants: [
      { id: 'black', label: 'ספורט שחור', color: '#25262a' },
      { id: 'sand', label: 'חול', color: '#d6c5ab' },
      { id: 'ocean', label: 'כחול אוקיינוס', color: '#35577a' },
    ],
  },
  {
    id: 'nova-buds', category: 'audio', display: 'shelf', device: 'buds',
    name: 'אוזניות נובה Buds', price: 590,
    description: 'אוזניות אלחוטיות עם סינון רעשים אקטיבי ועד 30 שעות האזנה עם הקופסה.',
    details: ['סינון רעשים אקטיבי', 'טעינה אלחוטית', 'עמידות IPX4'],
    variants: [
      { id: 'white', label: 'לבן', color: '#f2f1ee' },
      { id: 'black', label: 'שחור', color: '#222326' },
    ],
  },
  {
    id: 'speaker-retro', category: 'audio', display: 'shelf',
    name: 'רמקול בלוטות׳ רטרו', price: 449, oldPrice: 549,
    model: 'assets/models/speaker-retro.glb', scale: 13,
    description: 'רמקול נייד בעיצוב רטרו עם סאונד מודרני וסוללה ל-20 שעות.',
    details: ['Bluetooth 5.3', 'סוללה ל-20 שעות', 'אחריות שנה'],
  },
  {
    id: 'charger-45', category: 'power', display: 'shelf', device: 'charger',
    name: 'מטען מהיר 45W', price: 149,
    description: 'מטען קיר קומפקטי עם יציאת USB-C, טוען טלפון ל-50% בתוך 20 דקות.',
    details: ['USB-C', 'כבל 1 מ׳ כלול', 'הגנה מחימום'],
  },
  {
    id: 'powerbank', category: 'power', display: 'shelf', device: 'powerbank',
    name: 'סוללה ניידת 10,000mAh', price: 199,
    description: 'סוללה דקה שנכנסת לכיס, מטעינה טלפון פעמיים, עם טעינה מהירה דו-כיוונית.',
    details: ['10,000mAh', 'USB-C 20W', 'מחוון טעינה'],
    variants: [
      { id: 'white', label: 'לבן', color: '#eceae6' },
      { id: 'black', label: 'שחור', color: '#26272a' },
      { id: 'blue', label: 'כחול', color: '#4f6f9c' },
    ],
  },
  {
    id: 'case-x-pro', category: 'cases', display: 'shelf', device: 'case',
    name: 'כיסוי סיליקון ל-X Pro', price: 99,
    description: 'כיסוי סיליקון רך עם בטנת מיקרופייבר ושוליים מוגבהים שמגינים על המסך והמצלמה.',
    details: ['מתאים לנובה X Pro', 'תומך בטעינה אלחוטית'],
    variants: [
      { id: 'clay', label: 'חימר', color: '#c07a5c' },
      { id: 'olive', label: 'זית', color: '#7c8160' },
      { id: 'navy', label: 'כחול כהה', color: '#2c3550' },
      { id: 'chalk', label: 'גיר', color: '#e3ddd2' },
    ],
  },
];

// משותף לדפדפן ולשרת (השרת מחשב את המחירים מכאן – הלקוח לא יכול לשנות אותם)
const data = { STORE_CONFIG, CATEGORIES, PRODUCTS };
if (typeof module !== 'undefined' && module.exports) module.exports = data;
else Object.assign(root, data);
})(this);
