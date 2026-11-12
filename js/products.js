// קטלוג המוצרים של החנות – כאן משנים מוצרים, מחירים וצבעים.
//
// שדות של מוצר:
//   model:    קובץ דגם תלת-ממדי (GLB) בתיקייה assets/models
//   scale:    הגדלה/הקטנה של הדגם (1 = הגודל המקורי של הקובץ)
//   display:  איפה המוצר מוצג בחנות – floor (ריהוט על הרצפה) | plinth (על במה) | table (על שולחן תצוגה)
//   price:    המחיר שגובים (השרת מחשב לפיו)
//   oldPrice: מחיר קודם להצגה מחוקה (מבצע) – לא חובה
//   variants: צבעים לבחירה. id = שם הווריאנט בתוך קובץ הדגם, label = שם לתצוגה, color = צבע העיגול
//   details:  שורות מידע נוספות (חומרים, אחריות וכו')
// המידות (רוחב × גובה × עומק) מחושבות אוטומטית מהדגם.

(function (root) {
const STORE_CONFIG = {
  name: 'לוּמָה',
  tagline: 'סטודיו לעיצוב הבית',
  currency: '₪',
  currencyCode: 'ILS',    // קוד מטבע לסליקה ב-PayPal
  shippingCost: 49,       // דמי משלוח
  freeShippingOver: 500,  // משלוח חינם מעל סכום זה (0 = תמיד חינם)
};

const CATEGORIES = [
  { id: 'living', name: 'ריהוט' },
  { id: 'light', name: 'תאורה' },
  { id: 'objects', name: 'אובייקטים' },
];

const PRODUCTS = [
  {
    id: 'sofa-velvet', category: 'living', display: 'floor',
    name: 'ספת קטיפה מילאנו', price: 6900,
    model: 'assets/models/sofa-velvet.glb', scale: 1,
    description: 'ספה תלת-מושבית בריפוד קטיפה רכה, עם רגלי מתכת בגימור זהב מוברש.',
    details: ['ריפוד קטיפה עמידה לשפשוף', 'מילוי קצף בצפיפות גבוהה', 'אחריות 5 שנים לשלד'],
    variants: [
      { id: 'Champagne', label: 'שמפניה', color: '#d9c7a7' },
      { id: 'Navy', label: 'כחול לילה', color: '#28324a' },
      { id: 'Gray', label: 'אפור', color: '#8d8f92' },
      { id: 'Black', label: 'שחור', color: '#1d1d1f' },
      { id: 'Pale Pink', label: 'ורוד עתיק', color: '#d9b2ad' },
    ],
  },
  {
    id: 'sofa-leather', category: 'living', display: 'floor',
    name: 'ספת עור ועץ אוסלו', price: 9400, oldPrice: 11200,
    model: 'assets/models/sofa-leather.glb', scale: 1,
    description: 'ספה מעוצבת במסגרת עץ מלא, עם כריות עור רך שמתיישן יפה עם הזמן.',
    details: ['מסגרת עץ אגוז מלא', 'עור בקר בצביעה טבעית', 'אחריות 7 שנים לשלד'],
  },
  {
    id: 'armchair-velvet', category: 'living', display: 'floor',
    name: 'כורסת קטיפה לונה', price: 2450,
    model: 'assets/models/armchair-velvet.glb', scale: 1,
    description: 'כורסה נמוכה ועוטפת בקטיפה עשירה, מתאימה לפינת קריאה או לסלון.',
    details: ['ריפוד קטיפה', 'רגלי עץ אלון', 'אחריות 3 שנים'],
    variants: [
      { id: 'Mango Velvet', label: 'מנגו', color: '#d98a2b' },
      { id: 'Peacock Velvet', label: 'טווס', color: '#1f5c63' },
    ],
  },
  {
    id: 'armchair-damask', category: 'living', display: 'floor',
    name: 'כורסת דמשק ורסאי', price: 2650,
    model: 'assets/models/armchair-damask.glb', scale: 1,
    description: 'כורסה בבד ג׳קארד בדוגמת דמשק סגול-זהב, נגיעה קלאסית לחלל מודרני.',
    details: ['בד ג׳קארד ארוג', 'רגלי עץ אלון', 'אחריות 3 שנים'],
  },
  {
    id: 'lamp-opal', category: 'light', display: 'plinth',
    name: 'מנורת שולחן אופל', price: 890,
    model: 'assets/models/lamp-opal.glb', scale: 1,
    description: 'אהיל זכוכית בגימור אופל משתנה – הגוון זז עם זווית המבט.',
    details: ['זכוכית מנופחת', 'נורת LED חמה כלולה', 'כבל בד באורך 2 מ׳'],
  },
  {
    id: 'lamp-metal', category: 'light', display: 'plinth',
    name: 'מנורת מתכת פורג׳', price: 540,
    model: 'assets/models/lamp-metal.glb', scale: 1.6,
    description: 'מנורה בהשראה תעשייתית, מתכת מוברשת ואהיל זכוכית שקוף.',
    details: ['פלדה מוברשת', 'מתאים לנורת E27', 'אחריות שנתיים'],
  },
  {
    id: 'vase-flowers', category: 'objects', display: 'table',
    name: 'אגרטל זכוכית וזר', price: 320,
    model: 'assets/models/vase-flowers.glb', scale: 1.4,
    description: 'אגרטל זכוכית שקופה עם זר פרחים מיובשים בהרכבה ידנית.',
    details: ['זכוכית עבה', 'פרחים מיובשים – ללא צורך בהשקיה'],
  },
  {
    id: 'speaker-retro', category: 'objects', display: 'table',
    name: 'רמקול רטרו', price: 1290, oldPrice: 1490,
    model: 'assets/models/speaker-retro.glb', scale: 22,
    description: 'רמקול בעיצוב רטרו עם סאונד מודרני, חיבור Bluetooth וסוללה ל-20 שעות.',
    details: ['Bluetooth 5.3', 'סוללה ל-20 שעות', 'אחריות שנתיים'],
  },
  {
    id: 'bottle', category: 'objects', display: 'table',
    name: 'בקבוק תרמי', price: 149,
    model: 'assets/models/bottle.glb', scale: 1,
    description: 'בקבוק נירוסטה כפול דופן ששומר על קור 24 שעות ועל חום 12 שעות.',
    details: ['נפח 750 מ״ל', 'נירוסטה 18/8', 'ללא BPA'],
  },
  {
    id: 'sneaker', category: 'objects', display: 'table',
    name: 'סניקרס אורבן', price: 590,
    model: 'assets/models/sneaker.glb', scale: 1,
    description: 'נעל יום-יום קלה עם סוליית קצף גמישה ובד נושם.',
    details: ['מידות 36–46', 'סוליית קצף', 'החלפה חינם תוך 30 יום'],
    variants: [
      { id: 'midnight', label: 'חצות', color: '#22252e' },
      { id: 'beach', label: 'חוף', color: '#e3d3b8' },
      { id: 'street', label: 'רחוב', color: '#b23a32' },
    ],
  },
];

// משותף לדפדפן ולשרת (השרת מחשב את המחירים מכאן – הלקוח לא יכול לשנות אותם)
const data = { STORE_CONFIG, CATEGORIES, PRODUCTS };
if (typeof module !== 'undefined' && module.exports) module.exports = data;
else Object.assign(root, data);
})(this);
