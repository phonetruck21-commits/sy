import { useRef, useState } from 'react';
import { useProfile } from '../../store/profileStore';
import { TRUCKS } from '../../data/trucks';
import { THEME_LIST, BRAND_THEMES } from '../../data/themes';
import { createDefaultDesign } from '../../data/defaultDesign';
import { TruckPreview, type PreviewView } from '../../game/truck/TruckPreview';
import { fileToLogoDataUrl } from '../../game/truck/branding';
import { Button, Panel, ScreenFrame, Toggle } from '../components/UI';
import type { RimStyle, SideDesign, SideId, ThemeId, TruckDesign } from '../../types';

type Tab = 'colors' | 'texts' | 'layout' | 'logo' | 'parts' | 'designs' | 'export';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'colors', icon: '🎨', label: 'שינוי צבעים' },
  { id: 'texts', icon: 'Aa', label: 'שינוי טקסטים' },
  { id: 'layout', icon: '▦', label: 'סידור שירותים' },
  { id: 'logo', icon: '🖼️', label: 'החלפת לוגו' },
  { id: 'parts', icon: '🛞', label: 'ג׳נטים ואביזרים' },
  { id: 'designs', icon: '💾', label: 'עיצובים שמורים' },
  { id: 'export', icon: '⬇️', label: 'ייצוא לקובץ' },
];
const VIEWS: { id: PreviewView; label: string }[] = [
  { id: 'right', label: 'צד ימין' },
  { id: 'left', label: 'צד שמאל' },
  { id: 'front', label: 'חזית' },
  { id: 'rear', label: 'אחור' },
  { id: 'free', label: '360°' },
];
const SIDE_LABEL: Record<SideId | 'all', string> = { all: 'כל הצדדים', left: 'צד שמאל', right: 'צד ימין', rear: 'אחור' };
const SWATCHES = ['#f4f6f8', '#111318', '#1e7bff', '#c81e1e', '#1f9e4a', '#f0a020', '#5b1aa8', '#d9a93a', '#7d8a99', '#ff4fa3'];
const RIMS: { id: RimStyle; label: string }[] = [
  { id: 'steel', label: 'פלדה' }, { id: 'chrome', label: 'כרום' }, { id: 'black', label: 'שחור' }, { id: 'gold', label: 'זהב' }, { id: 'neon', label: 'ניאון' },
];
const GLOWS = [null, '#1e9bff', '#35e0ff', '#ff2bd6', '#3dff6e', '#ff2a2a', '#b44dff', '#ffcc00'];

const clone = (d: TruckDesign): TruckDesign => JSON.parse(JSON.stringify(d));
const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span>{label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((c) => (
          <button key={c} onClick={() => onChange(c)} aria-label={c} className={`w-6 h-6 rounded-md border-2 ${value.toLowerCase() === c ? 'border-cyan-300' : 'border-white/20'}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, dir, placeholder }: { label: string; value: string; onChange: (v: string) => void; dir?: 'ltr' | 'rtl'; placeholder?: string }) {
  return (
    <label className="block py-1">
      <span className="text-sm text-sky-200">{label}</span>
      <input
        className="mt-1 w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2 outline-none focus:border-cyan-300"
        value={value}
        dir={dir}
        maxLength={48}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function DesignScreen() {
  const designs = useProfile((s) => s.designs);
  const activeId = useProfile((s) => s.activeDesignId);
  const saveDesign = useProfile((s) => s.saveDesign);
  const deleteDesign = useProfile((s) => s.deleteDesign);
  const setActive = useProfile((s) => s.setActiveDesign);
  const truckId = useProfile((s) => s.selectedTruck);

  const [draft, setDraft] = useState<TruckDesign>(() => clone(designs.find((d) => d.id === activeId) ?? designs[0]));
  const [tab, setTab] = useState<Tab>('colors');
  const [view, setView] = useState<PreviewView>('right');
  const [side, setSide] = useState<SideId | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const edit = (fn: (d: TruckDesign) => void) => {
    setDraft((d) => { const n = clone(d); fn(n); return n; });
    setDirty(true);
  };
  const sides: SideId[] = side === 'all' ? ['left', 'right', 'rear'] : [side];
  const editSides = (patch: Partial<SideDesign>) => edit((d) => sides.forEach((s) => Object.assign(d.sides[s], patch)));
  const cur = draft.sides[side === 'all' ? 'left' : side];

  const pickSide = (s: SideId | 'all') => {
    setSide(s);
    if (s !== 'all') setView(s);
  };

  const download = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <ScreenFrame
      title="קונפיגורטור מיתוג למשאית"
      icon="✏️"
      right={
        <>
          {dirty && <span className="hidden sm:inline text-xs text-amber-300">שינויים לא שמורים</span>}
          <Button size="sm" variant="neon" data-testid="save-design" onClick={() => { saveDesign(draft); setDirty(false); flash('העיצוב נשמר והוחל על המשאית ✓'); }}>💾 שמור</Button>
        </>
      }
    >
      <div className="flex flex-col lg:flex-row gap-3 h-full min-h-0">
        {/* tool sidebar */}
        <Panel className="p-2 lg:w-56 shrink-0 flex lg:flex-col gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-bold border transition ${tab === t.id ? 'btn-neon' : 'border-white/10 bg-slate-900/50 hover:border-sky-400/50'}`}
            >
              <span>{t.label}</span>
              <span className="text-lg w-6 text-center">{t.icon}</span>
            </button>
          ))}
        </Panel>

        {/* 3D view */}
        <div className="relative flex-1 min-h-[280px] rounded-2xl overflow-hidden glass">
          <TruckPreview design={draft} model={TRUCKS[truckId].model} view={view} autoRotate={view === 'free'} preserveDrawingBuffer onCanvas={(c) => (canvasRef.current = c)} />
          <div className="absolute top-2 inset-x-2 flex flex-wrap gap-1.5 justify-center">
            <span className="glass rounded-lg px-2 py-1 text-xs self-center hidden sm:inline">בחר תצוגה:</span>
            {VIEWS.map((v) => (
              <button key={v.id} onClick={() => setView(v.id)} className={`rounded-lg px-3 py-1.5 text-sm font-bold border ${view === v.id ? 'btn-neon' : 'glass'}`}>{v.label}</button>
            ))}
          </div>
          {toast && <div className="absolute bottom-24 inset-x-0 text-center"><span className="glass rounded-xl px-4 py-2 font-bold animate-in inline-block">{toast}</span></div>}
          {/* theme strip */}
          <div className="absolute bottom-2 inset-x-2">
            <div className="glass rounded-xl p-2">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="font-bold">סגנונות עיצוב מוכנים · {SIDE_LABEL[side]}</span>
                <div className="flex gap-1">
                  {(['all', 'left', 'right', 'rear'] as const).map((s) => (
                    <button key={s} onClick={() => pickSide(s)} className={`rounded-md px-2 py-0.5 border ${side === s ? 'border-cyan-300 bg-sky-800/60' : 'border-white/15'}`}>{SIDE_LABEL[s]}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {THEME_LIST.map((th) => (
                  <button
                    key={th.id}
                    data-testid={`theme-${th.id}`}
                    onClick={() => editSides({ theme: th.id as ThemeId })}
                    className={`shrink-0 w-24 md:w-28 rounded-lg overflow-hidden border-2 ${cur.theme === th.id ? 'border-cyan-300' : 'border-transparent'}`}
                  >
                    <div className="h-9 relative" style={{ background: `linear-gradient(115deg, ${th.bg[0]} 0%, ${th.bg[1]} 45%, ${th.accent} 50%, ${th.bg[1]} 55%, ${th.bg[2]} 100%)` }}>
                      {cur.theme === th.id && <span className="absolute top-0.5 left-0.5 text-xs bg-cyan-400 text-black rounded-full w-4 h-4 flex items-center justify-center">✓</span>}
                    </div>
                    <div className="text-[11px] py-0.5 bg-black/60">{th.nameHe}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* tool panel */}
        <Panel className="p-4 lg:w-80 shrink-0 overflow-y-auto max-h-[45vh] lg:max-h-none">
          {tab === 'colors' && (
            <div>
              <h3 className="font-black mb-2">🎨 צבעי המשאית</h3>
              <ColorRow label="צבע תא הנהג" value={draft.cabColor} onChange={(v) => edit((d) => (d.cabColor = v))} />
              <ColorRow label="צבע הארגז" value={draft.boxColor} onChange={(v) => edit((d) => (d.boxColor = v))} />
              <ColorRow label="צבע הדגשה / פסים" value={draft.accentColor} onChange={(v) => edit((d) => (d.accentColor = v))} />
              <ColorRow label="צבע שלדה" value={draft.chassisColor} onChange={(v) => edit((d) => (d.chassisColor = v))} />
              <p className="text-xs text-slate-400 mt-2">צבע הרקע של המיתוג נקבע לפי הסגנון שנבחר בפס התחתון.</p>
            </div>
          )}
          {tab === 'texts' && (
            <div>
              <h3 className="font-black mb-1">Aa טקסטים ומיתוג</h3>
              <Field label="שם המותג" value={draft.brand.title} dir="ltr" onChange={(v) => edit((d) => (d.brand.title = v))} />
              <Field label="תיאור" value={draft.brand.tagline} onChange={(v) => edit((d) => (d.brand.tagline = v))} />
              <Field label="שם החברה" value={draft.brand.company} dir="ltr" onChange={(v) => edit((d) => (d.brand.company = v))} />
              <Field label="סלוגן החברה" value={draft.brand.companyTagline} onChange={(v) => edit((d) => (d.brand.companyTagline = v))} />
              <Field label="אתר" value={draft.brand.website} dir="ltr" onChange={(v) => edit((d) => (d.brand.website = v))} />
              <Field label="טלפון" value={draft.brand.phone} dir="ltr" onChange={(v) => edit((d) => (d.brand.phone = v))} />
              <div className="border-t border-white/10 mt-3 pt-2">
                <div className="text-sm font-bold mb-1">כותרת מיוחדת · {SIDE_LABEL[side]}</div>
                <Field label="כותרת" value={cur.headline} placeholder="לדוגמה: תיקון במקום — עד אליך!" onChange={(v) => editSides({ headline: v })} />
                <Field label="כותרת משנה" value={cur.subheadline} onChange={(v) => editSides({ subheadline: v })} />
              </div>
            </div>
          )}
          {tab === 'layout' && (
            <div>
              <h3 className="font-black mb-1">▦ סידור תוכן · {SIDE_LABEL[side]}</h3>
              <p className="text-xs text-slate-400 mb-2">בחר צד בפס התחתון כדי לעצב כל צד בנפרד.</p>
              {side !== 'rear' && <Toggle label="הצג שירותים (סלולר, מחשבים…)" checked={cur.showServices} onChange={(v) => editSides({ showServices: v })} />}
              <Toggle label="הצג אתר וטלפון" checked={cur.showContact} onChange={(v) => editSides({ showContact: v })} />
              <Toggle label="הצג לוגו שהועלה" checked={cur.showLogo} onChange={(v) => editSides({ showLogo: v })} />
              <div className="mt-3 text-sm">סגנון נוכחי: <b>{BRAND_THEMES[cur.theme].nameHe}</b></div>
            </div>
          )}
          {tab === 'logo' && (
            <div>
              <h3 className="font-black mb-2">🖼️ לוגו אישי</h3>
              <div className="rounded-xl bg-white/95 h-32 flex items-center justify-center mb-3">
                {draft.logoDataUrl ? <img src={draft.logoDataUrl} alt="לוגו" className="max-h-28 max-w-[90%] object-contain" /> : <span className="text-slate-500 text-sm">לא הועלה לוגו</span>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const url = await fileToLogoDataUrl(f);
                    edit((d) => {
                      d.logoDataUrl = url;
                      (['left', 'right', 'rear'] as const).forEach((s) => (d.sides[s].showLogo = true));
                    });
                    flash('הלוגו הועלה ✓');
                  } catch {
                    flash('לא ניתן לקרוא את הקובץ');
                  }
                  e.target.value = '';
                }}
              />
              <Button variant="neon" className="w-full" onClick={() => fileRef.current?.click()}>⬆️ העלאת לוגו (PNG/JPG)</Button>
              {draft.logoDataUrl && <Button className="w-full mt-2" onClick={() => edit((d) => (d.logoDataUrl = null))}>🗑 הסר לוגו</Button>}
              <p className="text-xs text-slate-400 mt-2">הלוגו מוקטן אוטומטית ונשמר במכשיר שלך בלבד.</p>
            </div>
          )}
          {tab === 'parts' && (
            <div>
              <h3 className="font-black mb-2">🛞 ג׳נטים</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {RIMS.map((r) => (
                  <Button key={r.id} size="sm" variant={draft.rimStyle === r.id ? 'neon' : 'ghost'} onClick={() => edit((d) => (d.rimStyle = r.id))}>{r.label}</Button>
                ))}
              </div>
              <h3 className="font-black mb-2">💡 תאורה תחתונה</h3>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {GLOWS.map((g) => (
                  <button key={g ?? 'none'} onClick={() => edit((d) => (d.underglow = g))} aria-label={g ?? 'ללא'} className={`w-8 h-8 rounded-full border-2 ${draft.underglow === g ? 'border-white' : 'border-white/20'}`} style={{ background: g ?? 'repeating-linear-gradient(45deg,#333 0 4px,#555 4px 8px)', boxShadow: g ? `0 0 10px ${g}` : undefined }} />
                ))}
              </div>
              <h3 className="font-black mb-1">🔧 אביזרים</h3>
              <Toggle label="בר תאורה על הגג" checked={draft.lightBar} onChange={(v) => edit((d) => (d.lightBar = v))} />
              <Toggle label="פנסי איתות כתומים" checked={draft.beacons} onChange={(v) => edit((d) => (d.beacons = v))} />
              <Toggle label="חצאיות צד" checked={draft.sideSkirts} onChange={(v) => edit((d) => (d.sideSkirts = v))} />
            </div>
          )}
          {tab === 'designs' && (
            <div>
              <h3 className="font-black mb-2">💾 העיצובים שלי</h3>
              <Field label="שם העיצוב" value={draft.name} onChange={(v) => edit((d) => (d.name = v))} />
              <div className="flex gap-2 my-2">
                <Button size="sm" variant="neon" className="flex-1" onClick={() => { saveDesign(draft); setDirty(false); flash('נשמר ✓'); }}>שמור</Button>
                <Button size="sm" className="flex-1" onClick={() => { const n = { ...clone(draft), id: newId(), name: `${draft.name} (עותק)` }; saveDesign(n); setDraft(n); setDirty(false); flash('נשמר כעיצוב חדש ✓'); }}>שמור כחדש</Button>
              </div>
              <div className="flex flex-col gap-1.5 mt-3">
                {designs.map((d) => (
                  <div key={d.id} className={`flex items-center gap-2 rounded-xl p-2 border ${d.id === activeId ? 'border-cyan-300 bg-sky-900/40' : 'border-white/10 bg-slate-900/50'}`}>
                    <span className="w-4 h-8 rounded" style={{ background: BRAND_THEMES[d.sides.left.theme].accent }} />
                    <span className="flex-1 truncate text-sm">{d.name}{d.id === activeId && ' ✓'}</span>
                    <Button size="sm" onClick={() => { setActive(d.id); setDraft(clone(d)); setDirty(false); }}>טען</Button>
                    <Button size="sm" variant="danger" onClick={() => { deleteDesign(d.id); if (d.id === draft.id) { const s = useProfile.getState(); setDraft(clone(s.activeDesign())); } }}>✕</Button>
                  </div>
                ))}
              </div>
              <Button size="sm" className="w-full mt-3" onClick={() => { setDraft(createDefaultDesign(newId(), 'PHONE TRUCK חדש')); setDirty(true); }}>↺ התחל מהמיתוג המקורי</Button>
            </div>
          )}
          {tab === 'export' && (
            <div className="flex flex-col gap-2">
              <h3 className="font-black mb-1">⬇️ ייצוא וייבוא</h3>
              <Button variant="neon" onClick={() => { const c = canvasRef.current; if (c) download(c.toDataURL('image/png'), `${draft.name || 'truck'}.png`); }}>📸 ייצוא תמונה (PNG)</Button>
              <Button onClick={() => { const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); download(url, `${draft.name || 'truck-design'}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>📄 ייצוא קובץ עיצוב (JSON)</Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const d = JSON.parse(await f.text()) as TruckDesign;
                    if (!d.brand || !d.sides?.left) throw new Error('bad');
                    const base = createDefaultDesign(newId(), d.name || 'עיצוב מיובא');
                    setDraft({ ...base, ...d, id: newId(), brand: { ...base.brand, ...d.brand }, sides: { ...base.sides, ...d.sides } });
                    setDirty(true);
                    flash('העיצוב יובא — לחץ שמור');
                  } catch {
                    flash('קובץ עיצוב לא תקין');
                  }
                  e.target.value = '';
                }}
              />
              <Button onClick={() => importRef.current?.click()}>📂 ייבוא קובץ עיצוב</Button>
              <p className="text-xs text-slate-400">התמונה נלקחת מהתצוגה התלת־ממדית הנוכחית — סובב את המשאית לזווית הרצויה לפני הייצוא.</p>
            </div>
          )}
        </Panel>
      </div>
    </ScreenFrame>
  );
}
