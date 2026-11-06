import type { TruckId, TruckStats, UpgradeKey } from '../types';

export interface TruckModelParams {
  boxLength: number; // metres
  boxHeight: number;
  cabStyle: 'atleon' | 'heavy' | 'sleek';
  dualRear: boolean;
}

export interface TruckDef {
  id: TruckId;
  nameHe: string;
  name: string;
  description: string;
  stats: TruckStats;
  model: TruckModelParams;
  /** unlocked by an achievement, or bought with coins (price) */
  unlock: { achievement: string | null; textHe: string; price: number };
}

export const TRUCKS: Record<TruckId, TruckDef> = {
  atleon: {
    id: 'atleon',
    name: 'Nissan Atleon 80.19',
    nameHe: 'ניסאן אטלאון 80.19 (2011)',
    description: 'משאית הארגז המקורית של PHONE TRUCK — סרן אחורי יחיד ורמפה אחורית DHOLLANDIA.',
    stats: { maxSpeed: 33, accel: 9, handling: 1.5, nitroCapacity: 4, mass: 1, offroad: 0.5 },
    model: { boxLength: 6.2, boxHeight: 2.5, cabStyle: 'atleon', dualRear: true },
    unlock: { achievement: null, textHe: 'זמינה מההתחלה', price: 0 },
  },
  hauler: {
    id: 'hauler',
    name: 'Desert Hauler',
    nameHe: 'דזרט הולר',
    description: 'משאית שטח קשוחה עם מתלה מוגבה — שומרת מהירות בחול ובשטח.',
    stats: { maxSpeed: 34, accel: 10.5, handling: 1.55, nitroCapacity: 5, mass: 1.15, offroad: 0.85 },
    model: { boxLength: 5.4, boxHeight: 2.3, cabStyle: 'heavy', dualRear: true },
    unlock: { achievement: 'first_win', textHe: 'נפתחת בניצחון ראשון במירוץ', price: 3000 },
  },
  phantom: {
    id: 'phantom',
    name: 'Neon Phantom',
    nameHe: 'ניאון פנטום',
    description: 'משאית מירוץ עתידנית — המהירה ביותר במוסך.',
    stats: { maxSpeed: 37, accel: 11.5, handling: 1.65, nitroCapacity: 5.5, mass: 0.95, offroad: 0.6 },
    model: { boxLength: 5.8, boxHeight: 2.2, cabStyle: 'sleek', dualRear: false },
    unlock: { achievement: 'champion', textHe: 'נפתחת בזכייה באליפות המשאיות', price: 8000 },
  },
};

export const TRUCK_LIST = Object.values(TRUCKS);

export const UPGRADE_INFO: Record<UpgradeKey, { nameHe: string; icon: string; desc: string }> = {
  engine: { nameHe: 'מנוע', icon: '⚙️', desc: 'מהירות מרבית +4 קמ"ש לכל רמה' },
  acceleration: { nameHe: 'תאוצה', icon: '🚀', desc: 'תאוצה חזקה יותר' },
  handling: { nameHe: 'היגוי', icon: '🛞', desc: 'פניות חדות ויציבות' },
  nitro: { nameHe: 'ניטרו', icon: '🔥', desc: 'מיכל ניטרו גדול יותר' },
};

export const MAX_UPGRADE = 5;
export const upgradeCost = (level: number) => 250 + level * 250;

export function applyUpgrades(stats: TruckStats, up: Record<UpgradeKey, number>): TruckStats {
  return {
    ...stats,
    maxSpeed: stats.maxSpeed + up.engine * 1.1,
    accel: stats.accel + up.acceleration * 0.8,
    handling: stats.handling + up.handling * 0.06,
    nitroCapacity: stats.nitroCapacity + up.nitro * 0.6,
  };
}
