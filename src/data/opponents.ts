import { createDefaultDesign } from './defaultDesign';
import type { ThemeId, TruckDesign, RimStyle } from '../types';

export interface OpponentDef {
  id: string;
  name: string;
  skill: number; // multiplier on max speed
  aggression: number; // 0..1 how often uses nitro
  design: TruckDesign;
}

function opp(id: string, name: string, title: string, tagline: string, cab: string, box: string, theme: ThemeId, rim: RimStyle, skill: number, aggression: number): OpponentDef {
  const d = createDefaultDesign(id, name);
  d.cabColor = cab;
  d.boxColor = box;
  d.rimStyle = rim;
  d.underglow = null;
  d.brand = { title, tagline, company: '', companyTagline: '', website: '', phone: '' };
  (['left', 'right', 'rear'] as const).forEach((s) => {
    d.sides[s] = { theme, headline: '', subheadline: '', showServices: false, showContact: false, showLogo: false };
  });
  return { id, name, skill, aggression, design: d };
}

// Fictional rival teams
export const OPPONENTS: OpponentDef[] = [
  opp('ai1', 'רד פלקון', 'RED FALCON', 'הובלות מהירות', '#c81e1e', '#e8e8e8', 'dynamic-red', 'black', 1.0, 0.7),
  opp('ai2', 'גרין ליין', 'GREEN LINE', 'לוגיסטיקה ירוקה', '#1f9e4a', '#f2f2f2', 'modern-green', 'steel', 0.97, 0.4),
  opp('ai3', 'גולד קארגו', 'GOLD CARGO', 'משלוחי פרימיום', '#222222', '#2b2b2b', 'luxury-gold', 'gold', 0.99, 0.5),
  opp('ai4', 'סגול טורבו', 'TURBO VR', 'גיימינג על גלגלים', '#5b1aa8', '#1a0d2e', 'gaming-purple', 'neon', 0.95, 0.8),
  opp('ai5', 'פורט אקספרס', 'PORT EXPRESS', 'נמל אשדוד', '#f0a020', '#ffffff', 'clean-white', 'chrome', 0.93, 0.3),
];
