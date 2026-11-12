// קטלוג המוצרים של החנות.
// כדי להוסיף/לשנות מוצרים – ערכו את הרשימה כאן בלבד.
//
// kind:     דגם מוכן – speaker | headphones | watch | lamp | pot | sculpture | candle |
//           vase | basketball | bottle | dumbbell | yogamat
// shape:    צורה בסיסית אם אין kind – box | sphere | cylinder | cone | torus | octahedron | dodecahedron
// model:    דגם תלת-ממדי אמיתי (GLB), למשל 'assets/shoe.glb' – גובר על kind/shape
// image:    תמונת מוצר שתוצג בחלון הפרטים, למשל 'assets/shoe.jpg'
// price:    המחיר שגובים (השרת מחשב לפיו)
// oldPrice: מחיר קודם להצגה מחוקה (מבצע) – לא חובה
// badge:    תגית קטנה מעל המוצר, למשל 'חדש' – לא חובה
// featured: true – המוצר יוצג גם במעמד "מוצר החודש" המואר

(function (root) {
const STORE_CONFIG = {
  name: 'החנות שלי',
  currency: '₪',        // סימן להצגה
  currencyCode: 'ILS',  // קוד מטבע לסליקה ב-PayPal (ILS / USD / EUR ...)
  shippingCost: 29,     // דמי משלוח
  freeShippingOver: 300, // משלוח חינם מעל סכום זה (0 = תמיד משלוח חינם)
  sellerName: 'נובה',    // שם המוכר הרובוטי
};

const CATEGORIES = [
  { id: 'electronics', name: 'אלקטרוניקה', icon: '🎧', color: '#2563eb', color2: '#06b6d4' },
  { id: 'home',        name: 'בית ועיצוב', icon: '🪴', color: '#d97706', color2: '#f43f5e' },
  { id: 'sport',       name: 'ספורט ופנאי', icon: '🏀', color: '#059669', color2: '#84cc16' },
];

const PRODUCTS = [
  // אלקטרוניקה
  { id: 'e1', category: 'electronics', name: 'רמקול חכם', price: 349, kind: 'speaker',
    description: 'רמקול אלחוטי עם סאונד היקפי, עוזר קולי וסוללה ל-12 שעות.',
    shape: 'cylinder', color: '#1f2937', scale: 0.32 },
  { id: 'e2', category: 'electronics', name: 'אוזניות אלחוטיות', price: 499, oldPrice: 649, kind: 'headphones', featured: true,
    description: 'סינון רעשים אקטיבי, טעינה מהירה ועד 30 שעות האזנה.',
    shape: 'torus', color: '#e5e7eb', scale: 0.3 },
  { id: 'e3', category: 'electronics', name: 'שעון חכם', price: 899, kind: 'watch', badge: 'חדש',
    description: 'מד דופק, GPS מובנה, עמיד במים ומסך תמיד-דולק.',
    shape: 'box', color: '#111827', scale: 0.28 },
  { id: 'e4', category: 'electronics', name: 'מנורת לילה', price: 129, kind: 'lamp',
    description: 'מנורת LED צבעונית עם שליטה מהאפליקציה.',
    shape: 'sphere', color: '#fde68a', scale: 0.3 },

  // בית ועיצוב
  { id: 'h1', category: 'home', name: 'עציץ קרמיקה', price: 89, kind: 'pot',
    description: 'עציץ בעבודת יד, מתאים לצמחי בית קטנים.',
    shape: 'cylinder', color: '#d97706', scale: 0.3 },
  { id: 'h2', category: 'home', name: 'פסל מודרני', price: 259, kind: 'sculpture',
    description: 'פסל גאומטרי מעוצב לסלון או למשרד.',
    shape: 'dodecahedron', color: '#a78bfa', scale: 0.3 },
  { id: 'h3', category: 'home', name: 'נר ריחני', price: 59, oldPrice: 79, kind: 'candle',
    description: 'נר סויה טבעי בניחוח וניל ולבנדר, 40 שעות בעירה.',
    shape: 'cylinder', color: '#fef3c7', scale: 0.24 },
  { id: 'h4', category: 'home', name: 'אגרטל זכוכית', price: 149, kind: 'vase', badge: 'חדש',
    description: 'אגרטל זכוכית מנופחת בגוון טורקיז.',
    shape: 'cone', color: '#2dd4bf', scale: 0.32 },

  // ספורט ופנאי
  { id: 's1', category: 'sport', name: 'כדורסל', price: 119, oldPrice: 149, kind: 'basketball',
    description: 'כדורסל מקצועי מידה 7, מתאים למגרשי חוץ ופנים.',
    shape: 'sphere', color: '#ea580c', scale: 0.3 },
  { id: 's2', category: 'sport', name: 'בקבוק ספורט', price: 79, kind: 'bottle',
    description: 'בקבוק נירוסטה תרמי, שומר על קור 24 שעות.',
    shape: 'cylinder', color: '#0ea5e9', scale: 0.26 },
  { id: 's3', category: 'sport', name: 'משקולת', price: 199, kind: 'dumbbell',
    description: 'משקולת יד מצופה 5 ק"ג.',
    shape: 'octahedron', color: '#64748b', scale: 0.4 },
  { id: 's4', category: 'sport', name: 'מזרן יוגה', price: 169, kind: 'yogamat',
    description: 'מזרן יוגה מונע החלקה, עובי 6 מ"מ.',
    shape: 'box', color: '#ec4899', scale: 0.3 },
];

// משותף לדפדפן ולשרת (השרת מחשב את המחירים מכאן – הלקוח לא יכול לשנות אותם)
const data = { STORE_CONFIG, CATEGORIES, PRODUCTS };
if (typeof module !== 'undefined' && module.exports) module.exports = data;
else Object.assign(root, data);
})(this);
