import { useState } from 'react';
import { useProfile } from '../../store/profileStore';
import { audio } from '../../game/audio/audio';
import { DIFFICULTY } from '../../game/race/buildRace';
import { Button, Panel, ScreenFrame } from '../components/UI';
import type { CameraMode, Difficulty } from '../../types';

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(([v, l]) => <Button key={v} size="sm" variant={value === v ? 'neon' : 'ghost'} onClick={() => onChange(v)}>{l}</Button>)}
    </div>
  );
}

export function SettingsScreen() {
  const s = useProfile((x) => x.settings);
  const update = useProfile((x) => x.updateSettings);
  const name = useProfile((x) => x.playerName);
  const setName = useProfile((x) => x.setPlayerName);
  const reset = useProfile((x) => x.resetProgress);
  const [confirm, setConfirm] = useState(false);

  return (
    <ScreenFrame title="הגדרות" icon="⚙️">
      <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-4">
        <Panel className="p-4 flex flex-col gap-4">
          <div>
            <div className="font-bold mb-1">👤 שם הנהג</div>
            <input className="w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2 outline-none focus:border-cyan-300" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="font-bold mb-1">🔊 עוצמת צליל: {Math.round(s.volume * 100)}%</div>
            <input type="range" className="w-full" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => { const v = Number(e.target.value); update({ volume: v }); audio.unlock(); audio.setVolume(v); }} onPointerUp={() => audio.click()} />
          </div>
          <div>
            <div className="font-bold mb-1">🖥 איכות גרפיקה</div>
            <Choice value={s.quality} options={[['low', 'נמוכה (טלפון)'], ['high', 'גבוהה (מחשב)']]} onChange={(v) => update({ quality: v })} />
            <p className="text-xs text-slate-400 mt-1">איכות נמוכה מבטלת צללים ומקטינה רזולוציה — מומלץ לטלפונים.</p>
          </div>
          <div>
            <div className="font-bold mb-1">📱 פקדי מגע</div>
            <Choice value={s.touchControls} options={[['auto', 'אוטומטי'], ['on', 'תמיד'], ['off', 'כבוי']]} onChange={(v) => update({ touchControls: v })} />
          </div>
          <div>
            <div className="font-bold mb-1">🎥 מצלמת ברירת מחדל</div>
            <Choice<CameraMode> value={s.camera} options={[['chase', 'מאחורי המשאית'], ['cab', 'תא נהג'], ['far', 'מרחוק']]} onChange={(v) => update({ camera: v })} />
          </div>
          <div>
            <div className="font-bold mb-1">🤖 רמת קושי</div>
            <Choice<Difficulty> value={s.difficulty} options={(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => [d, DIFFICULTY[d].nameHe])} onChange={(v) => update({ difficulty: v })} />
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            <h3 className="font-bold mb-2">🎮 שליטה</h3>
            <table className="w-full text-sm">
              <tbody>
                {[['גז', '↑ / W'], ['בלם / רוורס', '↓ / S / רווח'], ['היגוי', '← → / A D'], ['ניטרו', 'Shift / N'], ['החלפת מצלמה', 'C'], ['חזרה למסלול', 'R'], ['הפסקה', 'Esc / P']].map(([a, k]) => (
                  <tr key={a} className="border-t border-white/10"><td className="py-1.5">{a}</td><td className="text-left text-sky-300" dir="ltr">{k}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-2">בטלפון: כפתורי היגוי משמאל, גז/בלם/ניטרו מימין. מומלץ לשחק לרוחב המסך.</p>
          </Panel>
          <Panel className="p-4">
            <h3 className="font-bold mb-2">💾 התקדמות</h3>
            <p className="text-sm text-slate-300">ההתקדמות, העיצובים והשיאים נשמרים בדפדפן במכשיר הזה (LocalStorage).</p>
            {!confirm ? (
              <Button variant="danger" className="mt-3" onClick={() => setConfirm(true)}>🗑 איפוס כל ההתקדמות</Button>
            ) : (
              <div className="flex gap-2 mt-3 items-center">
                <span className="text-sm text-red-300">בטוח? הפעולה תמחק הכל.</span>
                <Button variant="danger" size="sm" onClick={() => { reset(); setConfirm(false); }}>כן, אפס</Button>
                <Button size="sm" onClick={() => setConfirm(false)}>ביטול</Button>
              </div>
            )}
          </Panel>
          <Panel className="p-4 text-sm text-slate-300">
            <div className="font-bold text-white">PHONE TRUCK — מעבדת סלולר ומחשבים ניידת</div>
            <div>S.Y פתרונות טכנולוגיים חכמים</div>
            <div dir="ltr" className="text-right">phonetruck.co.il · 052-546-6304</div>
            <div className="text-xs text-slate-500 mt-2">גרסה 0.1 · כל המודלים, הצלילים והגרפיקה נוצרו באופן פרוצדורלי במשחק.</div>
          </Panel>
        </div>
      </div>
    </ScreenFrame>
  );
}
