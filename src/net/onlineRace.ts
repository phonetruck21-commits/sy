import { createDefaultDesign } from '../data/defaultDesign';
import type { TruckDesign } from '../types';
import type { Look } from './onlineStore';

/** Build a displayable truck design from the small "look" another player shares. */
export function designFromLook(id: string, look: Look): TruckDesign {
  const d = createDefaultDesign(id, look.n);
  d.cabColor = look.c;
  d.boxColor = look.b;
  d.accentColor = look.a;
  d.underglow = null;
  d.brand = { title: look.n, tagline: '', company: '', companyTagline: '', website: '', phone: '' };
  (['left', 'right', 'rear'] as const).forEach((s) => {
    d.sides[s] = { theme: look.t, headline: '', subheadline: '', showServices: false, showContact: false, showLogo: false };
  });
  return d;
}

export function lookFromDesign(d: TruckDesign): Look {
  return { c: d.cabColor, b: d.boxColor, a: d.accentColor, t: d.sides.left.theme, n: (d.brand.title || 'TRUCK').slice(0, 20) };
}
