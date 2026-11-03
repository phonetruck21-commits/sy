import * as THREE from 'three';
import type { SideId, TruckDesign } from '../../types';
import { BRAND_THEMES, SERVICES, type BrandTheme } from '../../data/themes';

const FONT = 'Heebo, "Arial Hebrew", Arial, sans-serif';
const hasHebrew = (s: string) => /[֐-׿]/.test(s);

let fontsReadyPromise: Promise<unknown> | null = null;
export function fontsReady() {
  if (!fontsReadyPromise) {
    fontsReadyPromise = typeof document !== 'undefined' && document.fonts
      ? Promise.all([
          document.fonts.load(`900 40px Heebo`, 'PHONE'),
          document.fonts.load(`800 40px Heebo`, 'אבג'),
          document.fonts.load(`700 40px Heebo`, 'אבג'),
          document.fonts.load(`400 40px Heebo`, 'אבג'),
        ]).catch(() => undefined)
      : Promise.resolve();
  }
  return fontsReadyPromise;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}
const loadedImages = new Map<string, HTMLImageElement>();

// ---------- drawing helpers ----------
type Ctx = CanvasRenderingContext2D;

function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { weight?: number; align?: CanvasTextAlign; maxWidth?: number; italic?: boolean; glow?: string } = {}) {
  if (!s) return;
  const { weight = 700, align = 'center', maxWidth, italic = false, glow } = opts;
  ctx.save();
  ctx.direction = hasHebrew(s) ? 'rtl' : 'ltr';
  let sz = size;
  const setFont = () => (ctx.font = `${italic ? 'italic ' : ''}${weight} ${sz}px ${FONT}`);
  setFont();
  if (maxWidth) {
    while (ctx.measureText(s).width > maxWidth && sz > 8) {
      sz *= 0.92;
      setFont();
    }
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = sz * 0.35;
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function background(ctx: Ctx, w: number, h: number, th: BrandTheme) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, th.bg[0]);
  g.addColorStop(0.5, th.bg[1]);
  g.addColorStop(1, th.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // subtle hex pattern
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = th.accent;
  ctx.lineWidth = 1.5;
  const s = 26;
  for (let row = 0; row * s * 0.86 < h + s; row++) {
    for (let col = 0; col * s * 1.5 < w + s; col++) {
      const cx = col * s * 1.5;
      const cy = row * s * 1.73 + (col % 2 ? s * 0.86 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const px = cx + Math.cos(a) * s * 0.55;
        const py = cy + Math.sin(a) * s * 0.55;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
  // light streaks
  ctx.save();
  ctx.globalCompositeOperation = th.id === 'clean-white' ? 'source-over' : 'lighter';
  const streak = (x0: number, w0: number, alpha: number, color: string) => {
    ctx.globalAlpha = alpha;
    const lg = ctx.createLinearGradient(x0, 0, x0 + w0, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.5, color);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(x0 + h * 0.35, 0);
    ctx.lineTo(x0 + h * 0.35 + w0, 0);
    ctx.lineTo(x0 + w0, h);
    ctx.lineTo(x0, h);
    ctx.closePath();
    ctx.fill();
  };
  streak(w * 0.5, 30, 0.55, th.accent);
  streak(w * 0.53, 8, 0.8, th.accent2);
  streak(w * 0.04, 60, 0.25, th.accent);
  ctx.restore();
  // top + bottom glow lines
  ctx.save();
  ctx.shadowColor = th.accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = th.accent;
  ctx.fillRect(0, 6, w, 5);
  ctx.fillRect(0, h - 11, w, 5);
  ctx.restore();
}

/** PHONE TRUCK style emblem: rounded "phone" frame with two-tone italic text. */
export function drawEmblem(ctx: Ctx, cx: number, cy: number, w: number, title: string, th: BrandTheme) {
  const words = title.trim().split(/\s+/);
  const h = w * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.07);
  ctx.shadowColor = th.accent;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = th.accent;
  ctx.lineWidth = w * 0.022;
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.32);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // speaker slot
  ctx.fillStyle = th.accent;
  roundRect(ctx, w * 0.3, -h / 2 - h * 0.02, w * 0.1, h * 0.06, h * 0.03);
  ctx.fill();
  ctx.restore();
  if (words.length >= 2) {
    const first = words[0];
    const rest = words.slice(1).join(' ');
    text(ctx, first, cx, cy - h * 0.17, h * 0.42, th.text, { weight: 900, italic: true, maxWidth: w * 0.92 });
    text(ctx, rest, cx + w * 0.04, cy + h * 0.2, h * 0.38, th.accent2, { weight: 900, italic: true, maxWidth: w * 0.85, glow: th.accent });
  } else {
    text(ctx, title, cx, cy, h * 0.45, th.text, { weight: 900, italic: true, maxWidth: w * 0.9, glow: th.accent });
  }
}

function drawCompany(ctx: Ctx, cx: number, cy: number, size: number, company: string, tagline: string, th: BrandTheme) {
  if (!company && !tagline) return;
  if (company) {
    text(ctx, company, cx, cy, size, th.text, { weight: 900, italic: true, maxWidth: size * 4 });
    // swoosh
    ctx.save();
    ctx.strokeStyle = th.accent;
    ctx.shadowColor = th.accent;
    ctx.shadowBlur = 14;
    ctx.lineWidth = size * 0.07;
    ctx.beginPath();
    ctx.ellipse(cx + size * 0.2, cy + size * 0.05, size * 1.35, size * 0.55, -0.25, Math.PI * 1.65, Math.PI * 2.35);
    ctx.stroke();
    ctx.restore();
  }
  text(ctx, tagline, cx, cy + size * 0.85, size * 0.32, th.subText, { weight: 800, maxWidth: size * 4.6 });
}

// ---------- vector service icons (white line art) ----------
function icon(ctx: Ctx, idx: number, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.08;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const r = (x: number, y: number, w: number, h: number, rr = s * 0.08) => { roundRect(ctx, x * s, y * s, w * s, h * s, rr); ctx.stroke(); };
  const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1 * s, y1 * s); ctx.lineTo(x2 * s, y2 * s); ctx.stroke(); };
  const circ = (x: number, y: number, rad: number, fill = false) => { ctx.beginPath(); ctx.arc(x * s, y * s, rad * s, 0, Math.PI * 2); if (fill) ctx.fill(); else ctx.stroke(); };
  switch (idx) {
    case 0: r(-0.22, -0.42, 0.44, 0.84); line(-0.06, 0.32, 0.06, 0.32); break; // phone
    case 1: r(-0.36, -0.3, 0.72, 0.46, s * 0.04); line(-0.48, 0.28, 0.48, 0.28); break; // laptop
    case 2: r(-0.32, -0.4, 0.64, 0.8); circ(0, 0.3, 0.03, true); break; // tablet
    case 3: r(-0.45, -0.2, 0.9, 0.42, s * 0.2); line(-0.28, 0, -0.12, 0); line(-0.2, -0.08, -0.2, 0.08); circ(0.2, -0.04, 0.035, true); circ(0.3, 0.06, 0.035, true); break; // gamepad
    case 4: r(-0.4, -0.12, 0.8, 0.36); r(-0.24, -0.4, 0.48, 0.28, 2); r(-0.24, 0.12, 0.48, 0.3, 2); break; // printer
    case 5: circ(0, 0, 0.09, true); [[-0.32, -0.3], [0.32, -0.3], [-0.32, 0.3], [0.32, 0.3]].forEach(([x, y]) => { line(0, 0, x, y); circ(x, y, 0.08, true); }); break; // network
    case 6: r(-0.26, -0.42, 0.52, 0.84); circ(0, -0.18, 0.1); for (let i = 0; i < 3; i++) line(-0.14, 0.06 + i * 0.1, 0.14, 0.06 + i * 0.1); break; // intercom
    case 7: ctx.beginPath(); ctx.moveTo(-0.3 * s, 0.22 * s); ctx.quadraticCurveTo(-0.28 * s, -0.36 * s, 0, -0.36 * s); ctx.quadraticCurveTo(0.28 * s, -0.36 * s, 0.3 * s, 0.22 * s); ctx.closePath(); ctx.stroke(); circ(0, 0.32, 0.07, true); break; // bell
    case 8: r(-0.4, -0.18, 0.62, 0.34, s * 0.1); circ(0.06, 0, 0.09); line(0.22, -0.05, 0.42, -0.2); line(0.22, 0.08, 0.42, 0.2); line(-0.1, 0.16, -0.1, 0.38); break; // camera
    case 9: ctx.beginPath(); ctx.moveTo(0, -0.44 * s); ctx.quadraticCurveTo(0.42 * s, 0, 0.26 * s, 0.32 * s); ctx.quadraticCurveTo(0, 0.48 * s, -0.26 * s, 0.32 * s); ctx.quadraticCurveTo(-0.42 * s, 0.02 * s, -0.08 * s, -0.12 * s); ctx.quadraticCurveTo(0.02 * s, -0.24 * s, 0, -0.44 * s); ctx.stroke(); break; // flame
  }
  ctx.restore();
}

function drawServices(ctx: Ctx, x0: number, y0: number, w: number, h: number, th: BrandTheme) {
  const n = SERVICES.length;
  const gap = 8;
  const groupGap = 26;
  const tileW = (w - gap * (n - 2) - groupGap) / n;
  // RTL order: first service on the right
  for (let i = 0; i < n; i++) {
    const offset = i < 5 ? 0 : groupGap - gap;
    const x = x0 + w - (i + 1) * tileW - i * gap - offset;
    ctx.save();
    ctx.fillStyle = th.panel;
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = th.accent;
    ctx.shadowBlur = 8;
    roundRect(ctx, x, y0, tileW, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    icon(ctx, i, x + tileW / 2, y0 + h * 0.36, h * 0.42, th.text);
    text(ctx, SERVICES[i].label, x + tileW / 2, y0 + h * 0.8, h * 0.17, th.text, { weight: 700, maxWidth: tileW - 8 });
  }
}

function drawContact(ctx: Ctx, x0: number, y0: number, w: number, h: number, website: string, phone: string, th: BrandTheme) {
  if (!website && !phone) return;
  ctx.save();
  ctx.fillStyle = th.id === 'clean-white' ? 'rgba(11,31,61,0.9)' : 'rgba(0,0,0,0.45)';
  roundRect(ctx, x0, y0, w, h, 10);
  ctx.fill();
  ctx.restore();
  const textColor = th.id === 'clean-white' ? '#ffffff' : th.text;
  if (website && phone) {
    // globe
    ctx.save();
    ctx.strokeStyle = th.accent2;
    ctx.lineWidth = 3;
    const gx = x0 + w * 0.12, gy = y0 + h / 2, gr = h * 0.3;
    ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(gx, gy, gr * 0.45, gr, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx - gr, gy); ctx.lineTo(gx + gr, gy); ctx.stroke();
    ctx.restore();
    text(ctx, website, x0 + w * 0.15, y0 + h / 2, h * 0.5, textColor, { weight: 700, align: 'left', maxWidth: w * 0.36 });
    ctx.fillStyle = th.accent;
    ctx.fillRect(x0 + w * 0.535, y0 + h * 0.2, 3, h * 0.6);
    // phone handset circle
    ctx.save();
    ctx.fillStyle = '#25c463';
    ctx.beginPath(); ctx.arc(x0 + w * 0.6, y0 + h / 2, h * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    icon(ctx, 0, x0 + w * 0.6, y0 + h / 2, h * 0.45, '#ffffff');
    text(ctx, phone, x0 + w * 0.64, y0 + h / 2, h * 0.62, textColor, { weight: 900, align: 'left', maxWidth: w * 0.34 });
  } else {
    text(ctx, website || phone, x0 + w / 2, y0 + h / 2, h * 0.6, textColor, { weight: 900, maxWidth: w * 0.9 });
  }
}

function drawLogo(ctx: Ctx, dataUrl: string | null, x: number, y: number, size: number, th: BrandTheme) {
  if (!dataUrl) return;
  const img = loadedImages.get(dataUrl);
  if (!img) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = th.accent;
  ctx.shadowBlur = 14;
  roundRect(ctx, x, y, size, size, 16);
  ctx.fill();
  ctx.restore();
  const pad = size * 0.08;
  const s = Math.min((size - pad * 2) / img.width, (size - pad * 2) / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

// ---------- full panel layouts ----------
const SIDE_W = 1240;
const SIDE_H = 500;

function drawSide(ctx: Ctx, d: TruckDesign, side: SideId) {
  const sd = d.sides[side];
  const th = BRAND_THEMES[sd.theme];
  const W = SIDE_W, H = SIDE_H;
  background(ctx, W, H, th);
  const b = d.brand;
  const hasCompany = !!(b.company || b.companyTagline);
  const hasHeadline = !!(sd.headline || sd.subheadline);
  const lowerRows = (sd.showServices ? 1 : 0) + (sd.showContact && (b.website || b.phone) ? 1 : 0);
  const brandH = lowerRows === 0 ? H : lowerRows === 1 ? 330 : 255;
  const brandCy = brandH * (hasHeadline ? 0.4 : 0.5) + 6;

  // brand block
  if (hasCompany) {
    drawEmblem(ctx, W * 0.31, brandCy - 18, Math.min(470, brandH * 1.55), b.title, th);
    text(ctx, b.tagline, W * 0.31, brandCy + brandH * 0.33, Math.min(34, brandH * 0.12), th.subText, { weight: 800, maxWidth: 520 });
    drawCompany(ctx, W * 0.75, brandCy - 26, Math.min(130, brandH * 0.45), b.company, b.companyTagline, th);
  } else {
    drawEmblem(ctx, W * 0.5, brandCy - 14, Math.min(640, brandH * 1.9), b.title, th);
    text(ctx, b.tagline, W * 0.5, brandCy + brandH * 0.36, Math.min(40, brandH * 0.13), th.subText, { weight: 800, maxWidth: 700 });
  }
  if (sd.showLogo) drawLogo(ctx, d.logoDataUrl, 26, 26, Math.min(150, brandH * 0.5), th);

  let y = brandH;
  if (hasHeadline) {
    text(ctx, sd.headline, W / 2, brandH - (sd.subheadline ? 52 : 30), 40, th.text, { weight: 900, maxWidth: W * 0.9, glow: th.accent });
    if (sd.subheadline) text(ctx, sd.subheadline, W / 2, brandH - 16, 26, th.subText, { weight: 700, maxWidth: W * 0.9 });
  }
  if (sd.showServices) {
    const h = lowerRows === 2 ? 128 : 140;
    drawServices(ctx, 40, y, W - 80, h, th);
    y += h + 14;
  }
  if (sd.showContact && (b.website || b.phone)) {
    drawContact(ctx, 60, y, W - 120, Math.min(82, H - y - 22), b.website, b.phone, th);
  }
}

const REAR_W = 520;
const REAR_H = 540;
function drawRear(ctx: Ctx, d: TruckDesign) {
  const sd = d.sides.rear;
  const th = BRAND_THEMES[sd.theme];
  const W = REAR_W, H = REAR_H;
  background(ctx, W, H, th);
  const b = d.brand;
  drawEmblem(ctx, W / 2, 120, 380, b.title, th);
  text(ctx, b.tagline, W / 2, 222, 26, th.subText, { weight: 800, maxWidth: W - 60 });
  if (sd.headline) text(ctx, sd.headline, W / 2, 262, 30, th.text, { weight: 900, maxWidth: W - 60 });
  if (b.company) drawCompany(ctx, W / 2, 320, 70, b.company, b.companyTagline, th);
  if (sd.showContact) {
    if (b.phone) text(ctx, b.phone, W / 2, 430, 50, th.text, { weight: 900, maxWidth: W - 60, glow: th.accent });
    if (b.website) text(ctx, b.website, W / 2, 478, 30, th.subText, { weight: 700, maxWidth: W - 60 });
  }
  if (sd.showLogo) drawLogo(ctx, d.logoDataUrl, 20, H - 130, 100, th);
  // door seam + lock bars
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W / 2 - 2, 0, 4, H);
  ctx.fillStyle = 'rgba(200,200,210,0.9)';
  [W * 0.3, W * 0.42, W * 0.58, W * 0.7].forEach((x) => ctx.fillRect(x - 4, 10, 8, H - 20));
}

const DOOR_W = 520;
const DOOR_H = 400;
function drawDoor(ctx: Ctx, d: TruckDesign) {
  const th = BRAND_THEMES[d.sides.left.theme];
  const W = DOOR_W, H = DOOR_H;
  ctx.clearRect(0, 0, W, H);
  // swooshes
  ctx.save();
  ctx.fillStyle = d.accentColor;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.95);
  ctx.quadraticCurveTo(W * 0.5, H * 0.55, W, H * 0.05);
  ctx.lineTo(W, H * 0.22);
  ctx.quadraticCurveTo(W * 0.55, H * 0.7, 0, H);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.82);
  ctx.quadraticCurveTo(W * 0.45, H * 0.45, W, H * 0.0);
  ctx.lineTo(W, H * 0.05);
  ctx.quadraticCurveTo(W * 0.48, H * 0.52, 0, H * 0.88);
  ctx.fill();
  ctx.restore();
  const dark: BrandTheme = { ...th, text: '#0b1630', accent2: d.accentColor, accent: d.accentColor };
  drawEmblem(ctx, W * 0.5, H * 0.3, W * 0.72, d.brand.title, dark);
  if (d.brand.company) {
    text(ctx, d.brand.company, W * 0.5, H * 0.62, 66, '#0b1630', { weight: 900, italic: true });
    text(ctx, d.brand.companyTagline, W * 0.5, H * 0.75, 24, '#0b1630', { weight: 700, maxWidth: W * 0.8 });
  } else {
    text(ctx, d.brand.tagline, W * 0.5, H * 0.62, 28, '#0b1630', { weight: 800, maxWidth: W * 0.85 });
  }
}

// ---------- texture factory ----------
export type PanelKind = SideId | 'door';

const DIMS: Record<PanelKind, [number, number]> = {
  left: [SIDE_W, SIDE_H],
  right: [SIDE_W, SIDE_H],
  rear: [REAR_W, REAR_H],
  door: [DOOR_W, DOOR_H],
};

export function panelKey(d: TruckDesign, kind: PanelKind) {
  const base = { b: d.brand, logo: d.logoDataUrl ? d.logoDataUrl.length + d.logoDataUrl.slice(-32) : null };
  if (kind === 'door') return JSON.stringify({ ...base, a: d.accentColor, t: d.sides.left.theme });
  return JSON.stringify({ ...base, s: d.sides[kind], kind });
}

export function createPanelTexture(d: TruckDesign, kind: PanelKind, hiRes: boolean): THREE.CanvasTexture {
  const [lw, lh] = DIMS[kind];
  const scale = (hiRes ? 1.65 : 0.85) * (kind === 'door' ? 0.6 : 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(lw * scale);
  canvas.height = Math.round(lh * scale);
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = hiRes ? 8 : 2;
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / lw, canvas.height / lh);
    if (kind === 'rear') drawRear(ctx, d);
    else if (kind === 'door') drawDoor(ctx, d);
    else drawSide(ctx, d, kind);
    tex.needsUpdate = true;
  };
  draw();
  void fontsReady().then(draw);
  if (d.logoDataUrl && !loadedImages.has(d.logoDataUrl)) {
    const url = d.logoDataUrl;
    loadImage(url).then((img) => { loadedImages.set(url, img); draw(); }).catch(() => undefined);
  }
  return tex;
}

/** Simple text label texture (e.g. DHOLLANDIA, plate). */
export function createLabelTexture(label: string, bg: string, fg: string, w = 512, h = 96): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    text(ctx, label, w / 2, h / 2 + 2, h * 0.62, fg, { weight: 900, maxWidth: w * 0.92 });
    tex.needsUpdate = true;
  };
  draw();
  void fontsReady().then(draw);
  return tex;
}

/** Downscale an uploaded logo file to a small PNG data URL (keeps localStorage small). */
export function fileToLogoDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
