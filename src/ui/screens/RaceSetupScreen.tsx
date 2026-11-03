import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { TRACK_LIST } from '../../data/tracks';
import { TRUCKS } from '../../data/trucks';
import { DIFFICULTY } from '../../game/race/buildRace';
import { formatTime } from '../../utils/random';
import { Button, Panel, ScreenFrame } from '../components/UI';
import type { Difficulty, TrackId } from '../../types';

export const TRACK_GRADIENT: Record<TrackId, string> = {
  ashdod: 'linear-gradient(135deg, #f0a070 0%, #6b4e7a 55%, #1d2a44 100%)',
  desert: 'linear-gradient(135deg, #ffe0a3 0%, #d9a45a 50%, #8a5a33 100%)',
  neon: 'linear-gradient(135deg, #ff2bd6 0%, #3a0f6b 50%, #050414 100%)',
};

export function RaceSetupScreen() {
  const startRace = useGame((s) => s.startRace);
  const go = useGame((s) => s.go);
  const defaultLaps = useGame((s) => s.raceConfig.laps);
  const records = useProfile((s) => s.records);
  const difficulty = useProfile((s) => s.settings.difficulty);
  const update = useProfile((s) => s.updateSettings);
  const truckId = useProfile((s) => s.selectedTruck);
  const [track, setTrack] = useState<TrackId>('ashdod');
  const [laps, setLaps] = useState(defaultLaps);

  return (
    <ScreenFrame title="מירוץ מהיר" icon="🏁">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <section>
          <h2 className="text-lg font-bold mb-2 text-sky-200">בחר מסלול</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TRACK_LIST.map((t) => {
              const rec = records[t.id];
              const sel = track === t.id;
              return (
                <button
                  key={t.id}
                  data-testid={`track-${t.id}`}
                  onClick={() => setTrack(t.id)}
                  className={`text-right rounded-2xl overflow-hidden border-2 transition ${sel ? 'border-cyan-300 shadow-[0_0_24px_rgba(53,224,255,0.6)] scale-[1.02]' : 'border-white/10 hover:border-sky-400/60'}`}
                >
                  <div className="h-24 md:h-32 flex items-center justify-center text-6xl relative" style={{ background: TRACK_GRADIENT[t.id] }}>
                    {t.emoji}
                    {sel && <span className="absolute top-2 left-2 bg-cyan-400 text-black rounded-full w-7 h-7 flex items-center justify-center font-black">✓</span>}
                  </div>
                  <div className="p-3 bg-slate-900/80">
                    <div className="font-black text-lg">{t.nameHe}</div>
                    <div className="text-xs text-sky-300" dir="ltr">{t.name}</div>
                    <div className="text-sm text-slate-300 mt-1 min-h-10">{t.description}</div>
                    <div className="text-xs text-emerald-300 mt-1">
                      הקפה מהירה: <span dir="ltr">{formatTime(rec?.bestLap)}</span> · מקום הכי טוב: {rec?.bestPosition ?? '—'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid md:grid-cols-3 gap-3">
          <Panel className="p-4">
            <h3 className="font-bold mb-2 text-sky-200">רמת קושי</h3>
            <div className="flex gap-2">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                <Button key={d} size="sm" variant={difficulty === d ? 'neon' : 'ghost'} className="flex-1" onClick={() => update({ difficulty: d })}>{DIFFICULTY[d].nameHe}</Button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">פרסים: ×{DIFFICULTY[difficulty].coins} מטבעות</p>
          </Panel>
          <Panel className="p-4">
            <h3 className="font-bold mb-2 text-sky-200">מספר הקפות</h3>
            <div className="flex gap-2">
              {[1, 3, 5].map((n) => (
                <Button key={n} size="sm" variant={laps === n ? 'neon' : 'ghost'} className="flex-1" onClick={() => setLaps(n)}>{n}</Button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">אליפות תמיד ב־3 הקפות</p>
          </Panel>
          <Panel className="p-4 flex flex-col">
            <h3 className="font-bold mb-1 text-sky-200">המשאית שלך</h3>
            <div className="font-black">{TRUCKS[truckId].nameHe}</div>
            <Button size="sm" className="mt-auto" onClick={() => go('garage')}>🚚 החלף / שדרג במוסך</Button>
          </Panel>
        </div>

        <Button variant="neon" size="lg" className="w-full md:w-auto md:self-center md:px-16 animate-glow" data-testid="start-race" onClick={() => startRace({ trackId: track, mode: 'quick', laps })}>
          🏁 לזינוק!
        </Button>
        <p className="text-center text-xs text-slate-400">6 משאיות · AI ממוחשב · מקלדת: חצים / WASD, Shift לניטרו, C מצלמה · בטלפון: כפתורי מגע</p>
      </div>
    </ScreenFrame>
  );
}
