import type { ThemeId } from '../types';

export interface BrandTheme {
  id: ThemeId;
  nameHe: string;
  bg: [string, string, string]; // gradient stops
  accent: string; // main accent (stripes, glow)
  accent2: string;
  text: string; // primary text colour
  subText: string;
  panel: string; // service tile background
}

export const BRAND_THEMES: Record<ThemeId, BrandTheme> = {
  'tech-blue': {
    id: 'tech-blue', nameHe: 'טכנולוגי – כחול',
    bg: ['#020814', '#06183a', '#020a1c'], accent: '#1e9bff', accent2: '#35e0ff',
    text: '#ffffff', subText: '#bfe6ff', panel: 'rgba(10,40,90,0.75)',
  },
  'dynamic-red': {
    id: 'dynamic-red', nameHe: 'דינמי – אדום',
    bg: ['#0a0204', '#2a0508', '#0a0204'], accent: '#ff2a2a', accent2: '#ff8a3d',
    text: '#ffffff', subText: '#ffd0c8', panel: 'rgba(90,10,15,0.75)',
  },
  'modern-green': {
    id: 'modern-green', nameHe: 'מודרני – ירוק',
    bg: ['#020a04', '#08301a', '#020a04'], accent: '#3dff6e', accent2: '#c6ff3d',
    text: '#ffffff', subText: '#d2ffd9', panel: 'rgba(10,70,30,0.75)',
  },
  'luxury-gold': {
    id: 'luxury-gold', nameHe: 'יוקרתי – זהב',
    bg: ['#0a0805', '#1d1a12', '#070604'], accent: '#e8b84a', accent2: '#fff1b8',
    text: '#fff6dc', subText: '#e8d3a0', panel: 'rgba(60,48,20,0.75)',
  },
  'clean-white': {
    id: 'clean-white', nameHe: 'נקי – לבן',
    bg: ['#ffffff', '#eef4fb', '#dfe9f5'], accent: '#1673e0', accent2: '#0b2a5c',
    text: '#0b1f3d', subText: '#2a4870', panel: 'rgba(22,115,224,0.12)',
  },
  'gaming-purple': {
    id: 'gaming-purple', nameHe: 'גיימינג / VR',
    bg: ['#08020f', '#2a0a4a', '#08020f'], accent: '#b44dff', accent2: '#ff4df0',
    text: '#ffffff', subText: '#ecd0ff', panel: 'rgba(70,15,110,0.75)',
  },
};

export const THEME_LIST = Object.values(BRAND_THEMES);

/** Services shown on the box sides (icon glyph + label). */
export const SERVICES: { icon: string; label: string }[] = [
  { icon: '📱', label: 'סלולר' },
  { icon: '💻', label: 'מחשבים' },
  { icon: '📲', label: 'טאבלטים' },
  { icon: '🎮', label: 'קונסולות' },
  { icon: '🖨️', label: 'ציוד משרדי' },
  { icon: '🌐', label: 'רשתות ותקשורת' },
  { icon: '📟', label: 'אינטרקום' },
  { icon: '🔔', label: 'מערכות אזעקה' },
  { icon: '📹', label: 'מערכות מצלמות' },
  { icon: '🔥', label: 'גילוי וכיבוי אש' },
];
