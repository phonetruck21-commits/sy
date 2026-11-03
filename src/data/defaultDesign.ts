import type { TruckDesign } from '../types';

export const DEFAULT_BRAND = {
  title: 'PHONE TRUCK',
  tagline: 'מעבדת סלולר ומחשבים ניידת',
  company: 'S.Y',
  companyTagline: 'פתרונות טכנולוגיים חכמים',
  website: 'phonetruck.co.il',
  phone: '052-546-6304',
};

export function createDefaultDesign(id = 'default', name = 'PHONE TRUCK מקורי'): TruckDesign {
  return {
    id,
    name,
    cabColor: '#f4f6f8',
    boxColor: '#f4f6f8',
    chassisColor: '#1b1d22',
    accentColor: '#1e7bff',
    rimStyle: 'steel',
    underglow: '#1e9bff',
    lightBar: false,
    beacons: false,
    sideSkirts: true,
    brand: { ...DEFAULT_BRAND },
    sides: {
      left: { theme: 'tech-blue', headline: '', subheadline: '', showServices: true, showContact: true, showLogo: true },
      right: { theme: 'tech-blue', headline: '', subheadline: '', showServices: true, showContact: true, showLogo: true },
      rear: { theme: 'tech-blue', headline: '', subheadline: '', showServices: false, showContact: true, showLogo: true },
    },
    logoDataUrl: null,
  };
}
