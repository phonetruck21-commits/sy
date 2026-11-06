import type { TrackDef, TrackId } from '../types';

export const TRACKS: Record<TrackId, TrackDef> = {
  ashdod: {
    id: 'ashdod',
    name: 'Ashdod Street Race',
    nameHe: 'מירוץ רחובות אשדוד',
    description: 'מירוץ עירוני בין מגדלים, אזור התעשייה ומנופי הנמל — בשקיעה.',
    emoji: '🏙️',
    scenery: 'city',
    stash: { at: 0.44, lateral: -11.2, height: 0, hintHe: 'צמוד לקיר הפנימי, ביציאה מהפנייה ליד הנמל' },
    width: 18,
    scale: 1.6,
    points: [
      [0, -200], [120, -210], [195, -150], [205, -40], [150, 20], [165, 110], [100, 195],
      [-20, 205], [-125, 170], [-175, 80], [-110, 10], [-185, -80], [-140, -180],
    ],
    theme: {
      sky: '#f0a070', fog: '#e8a27c', fogNear: 120, fogFar: 520, ground: '#5b5e63', road: '#2c2e33',
      roadLine: '#f5f5f5', barrier: '#d8d8d8', ambient: 0.65, sunColor: '#ffd2a0', sunIntensity: 2.2, night: false,
    },
  },
  desert: {
    id: 'desert',
    name: 'Desert Truck Rally',
    nameHe: 'ראלי משאיות במדבר',
    description: 'אבק, קפיצות ופניות חדות במדבר הנגב. משאיות שטח מרגישות כאן בבית.',
    emoji: '🏜️',
    scenery: 'desert',
    stash: { at: 0.52, ahead: 1, lateral: 0, height: 3.4, hintHe: 'באוויר מעל הרמפה השנייה — עלה עליה באמצע' },
    width: 18,
    scale: 1.6,
    points: [
      [0, -220], [150, -200], [230, -100], [170, -20], [240, 80], [180, 200], [40, 180],
      [-30, 90], [-120, 190], [-230, 120], [-210, -20], [-120, -60], [-180, -170],
    ],
    ramps: [0.17, 0.52, 0.8],
    theme: {
      sky: '#9ecbf0', fog: '#e6cfa0', fogNear: 110, fogFar: 480, ground: '#d9b47a', road: '#b8925c',
      roadLine: '#fff1d0', barrier: '#a86a3a', ambient: 0.85, sunColor: '#fff2d6', sunIntensity: 2.6, night: false,
    },
  },
  neon: {
    id: 'neon',
    name: 'Night Neon Championship',
    nameHe: 'אליפות הניאון הלילית',
    description: 'מירוץ לילי עתידני עם תאורת ניאון זוהרת ומגדלים מוארים.',
    emoji: '🌃',
    scenery: 'neon',
    stash: { at: 0.78, lateral: 11.2, height: 0, hintHe: 'בשוליים החיצוניים, אחרי השער הוורוד' },
    width: 18,
    scale: 1.6,
    points: [
      [0, -180], [140, -170], [200, -90], [130, -20], [200, 60], [150, 170], [20, 150],
      [-60, 200], [-180, 140], [-150, 30], [-200, -80], [-120, -170],
    ],
    theme: {
      sky: '#050414', fog: '#0b0626', fogNear: 80, fogFar: 420, ground: '#07070f', road: '#14141f',
      roadLine: '#35e0ff', barrier: '#1a1a2a', barrierEmissive: '#ff2bd6', ambient: 0.35, sunColor: '#8a7dff', sunIntensity: 0.8, night: true,
    },
  },
};

export const TRACK_LIST = Object.values(TRACKS);
export const CHAMPIONSHIP_TRACKS: TrackId[] = ['ashdod', 'desert', 'neon'];
export const CHAMPIONSHIP_POINTS = [10, 8, 6, 4, 2, 1];
export const RACE_COINS = [500, 350, 250, 150, 100, 50];
export const LAPS = 3;
export const STASH_COINS = 2500;
export const COIN_VALUE = 20;
