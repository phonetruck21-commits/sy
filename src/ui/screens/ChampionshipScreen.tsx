import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { CHAMPIONSHIP_POINTS, CHAMPIONSHIP_TRACKS, TRACKS, TRACK_LIST } from '../../data/tracks';
import { OPPONENTS } from '../../data/opponents';
import { ACHIEVEMENTS } from '../../data/achievements';
import { TRUCKS } from '../../data/trucks';
import { formatTime } from '../../utils/random';
import { Button, Panel, ScreenFrame } from '../components/UI';
import { TRACK_GRADIENT } from './RaceSetupScreen';

type Tab = 'cup' | 'trophies' | 'records';

export function ChampionshipScreen() {
  const [tab, setTab] = useState<Tab>('cup');
  return (
    <ScreenFrame title="אליפות המשאיות" icon="🏆">
      <div className="max-w-5xl mx-auto">
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {([['cup', '🏆 אליפות'], ['trophies', '🎖️ גביעים והישגים'], ['records', '📊 דירוג ושיאים']] as [Tab, string][]).map(([id, l]) => (
            <Button key={id} variant={tab === id ? 'neon' : 'ghost'} onClick={() => setTab(id)} className="shrink-0">{l}</Button>
          ))}
        </div>
        {tab === 'cup' && <Cup />}
        {tab === 'trophies' && <Trophies />}
        {tab === 'records' && <Records />}
      </div>
    </ScreenFrame>
  );
}

function Cup() {
  const champ = useProfile((s) => s.championship);
  const start = useProfile((s) => s.startChampionship);
  const abandon = useProfile((s) => s.abandonChampionship);
  const name = useProfile((s) => s.playerName);
  const startRace = useGame((s) => s.startRace);

  const begin = () => {
    const names: Record<string, string> = { player: name };
    OPPONENTS.forEach((o) => (names[o.id] = o.name));
    start(names);
  };
  const standings = champ ? Object.entries(champ.points).sort((a, b) => b[1] - a[1]) : [];
  const nextTrack = champ && !champ.finished ? CHAMPIONSHIP_TRACKS[champ.round] : null;
  const playerRank = standings.findIndex(([id]) => id === 'player') + 1;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Panel className="p-4">
        <h3 className="font-black text-lg mb-2">מסלולי האליפות</h3>
        <div className="flex flex-col gap-2">
          {CHAMPIONSHIP_TRACKS.map((t, i) => {
            const res = champ?.results[i];
            const current = champ && !champ.finished && champ.round === i;
            return (
              <div key={t} className={`flex items-center gap-3 rounded-xl p-2 border ${current ? 'border-cyan-300 bg-sky-900/40' : 'border-white/10 bg-slate-900/40'}`}>
                <div className="w-14 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ background: TRACK_GRADIENT[t] }}>{TRACKS[t].emoji}</div>
                <div className="flex-1">
                  <div className="font-bold">מירוץ {i + 1}: {TRACKS[t].nameHe}</div>
                  <div className="text-xs text-slate-400">{res ? `סיימת במקום ${res.playerPosition} · +${CHAMPIONSHIP_POINTS[res.playerPosition - 1] ?? 0} נק׳` : current ? 'המירוץ הבא' : 'ממתין'}</div>
                </div>
                {res && <span className="text-2xl">{res.playerPosition === 1 ? '🥇' : res.playerPosition === 2 ? '🥈' : res.playerPosition === 3 ? '🥉' : '✓'}</span>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">ניקוד: {CHAMPIONSHIP_POINTS.join(' · ')} (מקום 1 עד 6). הזוכה באליפות פותח את משאית Neon Phantom!</p>
        <div className="flex gap-2 mt-4">
          {!champ && <Button variant="neon" size="lg" className="flex-1 animate-glow" data-testid="start-championship" onClick={begin}>🏆 התחל אליפות חדשה</Button>}
          {nextTrack && (
            <Button variant="neon" size="lg" className="flex-1 animate-glow" data-testid="next-championship-race" onClick={() => startRace({ trackId: nextTrack, mode: 'championship', laps: 3 })}>
              🏁 למירוץ {champ!.round + 1}: {TRACKS[nextTrack].nameHe}
            </Button>
          )}
          {champ?.finished && <Button variant="neon" size="lg" className="flex-1" onClick={begin}>🔄 אליפות חדשה</Button>}
          {champ && !champ.finished && <Button variant="danger" onClick={abandon}>פרוש</Button>}
        </div>
      </Panel>

      <Panel className="p-4">
        <h3 className="font-black text-lg mb-2">טבלת האליפות</h3>
        {!champ && <p className="text-slate-400">עוד לא התחלת אליפות. התחל אליפות כדי להתחרות ב־3 מירוצים עם ניקוד מצטבר.</p>}
        {champ && (
          <>
            {champ.finished && (
              <div className="text-center mb-3 animate-in">
                <div className="text-6xl">{playerRank === 1 ? '🏆' : playerRank === 2 ? '🥈' : playerRank === 3 ? '🥉' : '🏁'}</div>
                <div className="text-2xl font-black neon-text">{playerRank === 1 ? 'אלוף המשאיות!' : `סיימת את האליפות במקום ${playerRank}`}</div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead><tr className="text-sky-300 text-right"><th className="py-1">#</th><th>נהג</th><th className="text-left">נקודות</th></tr></thead>
              <tbody>
                {standings.map(([id, pts], i) => (
                  <tr key={id} className={`border-t border-white/10 ${id === 'player' ? 'text-cyan-300 font-bold' : ''}`}>
                    <td className="py-1.5">{i + 1}</td>
                    <td>{champ.names[id] ?? id}</td>
                    <td className="text-left">{pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel className="p-4 md:col-span-2 border-dashed">
        <h3 className="font-black">🌐 מרובה משתתפים אונליין</h3>
        <p className="text-sm text-slate-300 mt-1">
          בפיתוח — עדיין לא פעיל. חדרי משחק, חשבונות שחקנים ודירוג עולמי יתווספו בשלב 3 עם שרת ייעודי (Colyseus).
          כרגע כל המירוצים הם נגד נהגי מחשב, וההתקדמות נשמרת במכשיר שלך.
        </p>
      </Panel>
    </div>
  );
}

function Trophies() {
  const got = useProfile((s) => s.achievements);
  return (
    <div>
      <p className="text-sm text-slate-300 mb-3">פתחת {got.length} מתוך {ACHIEVEMENTS.length} הישגים. כל הישג מעניק מטבעות, וחלקם פותחים משאיות חדשות.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {ACHIEVEMENTS.map((a) => {
          const ok = got.includes(a.id);
          return (
            <Panel key={a.id} className={`p-3 text-center ${ok ? '' : 'opacity-50 grayscale'}`}>
              <div className="text-4xl">{ok ? a.icon : '🔒'}</div>
              <div className="font-bold mt-1">{a.nameHe}</div>
              <div className="text-xs text-slate-400 min-h-8">{a.descHe}</div>
              <div className="text-xs text-yellow-300 mt-1">🪙 {a.reward}</div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function Records() {
  const records = useProfile((s) => s.records);
  const history = useProfile((s) => s.history);
  const stats = useProfile((s) => s.stats);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Panel className="p-4">
        <h3 className="font-black mb-2">📈 הסטטיסטיקה שלי</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[['מירוצים', stats.races, '🏁'], ['ניצחונות', stats.wins, '🥇'], ['פודיומים', stats.podiums, '🥉'], ['אליפויות', stats.championships, '🏆']].map(([l, v, i]) => (
            <div key={l as string} className="bg-slate-900/60 rounded-xl p-2"><div className="text-2xl">{i}</div><div className="text-2xl font-black">{v}</div><div className="text-xs text-slate-400">{l}</div></div>
          ))}
        </div>
        <h3 className="font-black mt-4 mb-2">⏱ שיאי מסלול</h3>
        {TRACK_LIST.map((t) => {
          const r = records[t.id];
          return (
            <div key={t.id} className="flex justify-between border-t border-white/10 py-1.5 text-sm">
              <span>{t.emoji} {t.nameHe}</span>
              <span dir="ltr" className="text-emerald-300">LAP {formatTime(r?.bestLap)} · RACE {formatTime(r?.bestRace)}</span>
            </div>
          );
        })}
      </Panel>
      <Panel className="p-4">
        <h3 className="font-black mb-2">🗒 מירוצים אחרונים</h3>
        {history.length === 0 && <p className="text-slate-400 text-sm">עוד אין מירוצים — צא לזינוק!</p>}
        <div className="flex flex-col">
          {history.slice(0, 12).map((h) => (
            <div key={h.date} className="flex items-center gap-2 border-t border-white/10 py-1.5 text-sm">
              <span className="w-8 text-center font-black">{h.position === 1 ? '🥇' : h.position === 2 ? '🥈' : h.position === 3 ? '🥉' : h.position}</span>
              <span className="flex-1">{TRACKS[h.trackId].nameHe}</span>
              <span className="text-xs text-slate-400">{TRUCKS[h.truckId].name}</span>
              <span dir="ltr" className="text-sky-300 w-20 text-left">{formatTime(h.time)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
