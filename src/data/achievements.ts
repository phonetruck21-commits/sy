export interface AchievementDef {
  id: string;
  nameHe: string;
  descHe: string;
  icon: string;
  reward: number; // coins
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_race', nameHe: 'יציאה לדרך', descHe: 'סיים את המירוץ הראשון', icon: '🏁', reward: 100 },
  { id: 'podium', nameHe: 'על הפודיום', descHe: 'סיים במקום 1–3', icon: '🥉', reward: 200 },
  { id: 'first_win', nameHe: 'ניצחון ראשון', descHe: 'נצח במירוץ — פותח את Desert Hauler', icon: '🥇', reward: 400 },
  { id: 'win_ashdod', nameHe: 'מלך אשדוד', descHe: 'נצח במירוץ רחובות אשדוד', icon: '🏙️', reward: 300 },
  { id: 'win_desert', nameHe: 'שועל המדבר', descHe: 'נצח בראלי המדבר', icon: '🏜️', reward: 300 },
  { id: 'win_neon', nameHe: 'אגדת הניאון', descHe: 'נצח באליפות הניאון', icon: '🌃', reward: 300 },
  { id: 'champion', nameHe: 'אלוף המשאיות', descHe: 'זכה באליפות — פותח את Neon Phantom', icon: '🏆', reward: 1000 },
  { id: 'nitro_fan', nameHe: 'מכור לניטרו', descHe: 'השתמש בניטרו 10 שניות במירוץ אחד', icon: '🔥', reward: 150 },
  { id: 'designer', nameHe: 'מעצב מקצועי', descHe: 'שמור עיצוב משאית משלך', icon: '🎨', reward: 150 },
  { id: 'tuned', nameHe: 'מכונאי מוסמך', descHe: 'קנה שדרוג ראשון', icon: '🔧', reward: 100 },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
