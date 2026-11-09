// קטלוג המוצרים של החנות.
// כדי להוסיף/לשנות מוצרים – ערכו את הרשימה כאן בלבד.
//
// shape: box | sphere | cylinder | cone | torus | octahedron | dodecahedron
// scale: גודל הדגם בתלת-ממד (במטרים, בערך)
// אפשר גם להחליף צורה בדגם תלת-ממדי אמיתי: model: 'assets/shoe.glb'

window.STORE_CONFIG = {
  name: 'החנות שלי',
  currency: '₪',
};

window.CATEGORIES = [
  { id: 'electronics', name: 'אלקטרוניקה', color: '#3b82f6' },
  { id: 'home',        name: 'בית ועיצוב', color: '#f59e0b' },
  { id: 'sport',       name: 'ספורט ופנאי', color: '#10b981' },
];

window.PRODUCTS = [
  // אלקטרוניקה
  { id: 'e1', category: 'electronics', name: 'רמקול חכם', price: 349,
    description: 'רמקול אלחוטי עם סאונד היקפי, עוזר קולי וסוללה ל-12 שעות.',
    shape: 'cylinder', color: '#1f2937', scale: 0.32 },
  { id: 'e2', category: 'electronics', name: 'אוזניות אלחוטיות', price: 499,
    description: 'סינון רעשים אקטיבי, טעינה מהירה ועד 30 שעות האזנה.',
    shape: 'torus', color: '#e5e7eb', scale: 0.3 },
  { id: 'e3', category: 'electronics', name: 'שעון חכם', price: 899,
    description: 'מד דופק, GPS מובנה, עמיד במים ומסך תמיד-דולק.',
    shape: 'box', color: '#111827', scale: 0.28 },
  { id: 'e4', category: 'electronics', name: 'מנורת לילה', price: 129,
    description: 'מנורת LED צבעונית עם שליטה מהאפליקציה.',
    shape: 'sphere', color: '#fde68a', scale: 0.3 },

  // בית ועיצוב
  { id: 'h1', category: 'home', name: 'עציץ קרמיקה', price: 89,
    description: 'עציץ בעבודת יד, מתאים לצמחי בית קטנים.',
    shape: 'cylinder', color: '#d97706', scale: 0.3 },
  { id: 'h2', category: 'home', name: 'פסל מודרני', price: 259,
    description: 'פסל גאומטרי מעוצב לסלון או למשרד.',
    shape: 'dodecahedron', color: '#a78bfa', scale: 0.3 },
  { id: 'h3', category: 'home', name: 'נר ריחני', price: 59,
    description: 'נר סויה טבעי בניחוח וניל ולבנדר, 40 שעות בעירה.',
    shape: 'cylinder', color: '#fef3c7', scale: 0.24 },
  { id: 'h4', category: 'home', name: 'אגרטל זכוכית', price: 149,
    description: 'אגרטל זכוכית מנופחת בגוון טורקיז.',
    shape: 'cone', color: '#2dd4bf', scale: 0.32 },

  // ספורט ופנאי
  { id: 's1', category: 'sport', name: 'כדורסל', price: 119,
    description: 'כדורסל מקצועי מידה 7, מתאים למגרשי חוץ ופנים.',
    shape: 'sphere', color: '#ea580c', scale: 0.3 },
  { id: 's2', category: 'sport', name: 'בקבוק ספורט', price: 79,
    description: 'בקבוק נירוסטה תרמי, שומר על קור 24 שעות.',
    shape: 'cylinder', color: '#0ea5e9', scale: 0.26 },
  { id: 's3', category: 'sport', name: 'משקולת', price: 199,
    description: 'משקולת יד מצופה 5 ק"ג.',
    shape: 'octahedron', color: '#4b5563', scale: 0.28 },
  { id: 's4', category: 'sport', name: 'מזרן יוגה', price: 169,
    description: 'מזרן יוגה מונע החלקה, עובי 6 מ"מ.',
    shape: 'box', color: '#ec4899', scale: 0.3 },
];
