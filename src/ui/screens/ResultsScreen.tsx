import { useEffect } from 'react';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { TRACKS, CHAMPIONSHIP_TRACKS, CHAMPIONSHIP_POINTS } from '../../data/tracks';
import { ACHIEVEMENT_MAP } from '../../data/achievements';
import { formatTime } from '../../utils/random';
import { audio } from '../../game/audio/audio';
import { Button, Panel, Coins } from '../components/UI';

export function ResultsScreen() {
  const result = useGame((s) => s.lastResult);
  const cfg = useGame((s) => s.raceConfig);
  const go = useGame((s) => s.go);
  const restart = useGame((s) => s.restartRace);
  const startRace = useGame((s) => s.startRace);
  const champ = useProfile((s) => s.championship);

  useEffect(() => {
    if (result && result.coinsEarned > 0) setTimeout(() => audio.coin(), 600);
  }, [result]);

  if (!result) return null;
  const pos = result.playerPosition;
  const win = pos === 1;
  const title = win ? 'ניצחון!' : pos <= 3 ? 'על הפודיום!' : 'סיימת את המירוץ';
  const medal = pos === 1 ? '🏆' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏁';
  const isChamp = cfg.mode === 'championship';
  const isOnline = cfg.mode === 'online';
  const nextTrack = isChamp && champ && !champ.finished ? CHAMPIONSHIP_TRACKS[champ.round] : null;

  return (
    <div className="absolute inset-0 overflow-y-auto speed-lines" style={{ background: win ? 'radial-gradient(ellipse at top, #5a4a10 0%, #050b18 65%)' : 'radial-gradient(ellipse at top, #0d2450 0%, #050b18 65%)' }} data-testid="results-screen">
      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
        <div className="flex justify-end"><Coins /></div>
        <div className="text-center animate-in">
          <div className="text-7xl md:text-8xl">{medal}</div>
          <h1 className={`text-4xl md:text-6xl font-black neon-text ${win ? 'text-yellow-300' : ''}`} data-testid="result-title">{title}</h1>
          <div className="text-xl mt-1">מקום <b data-testid="result-position">{pos}</b> מתוך {result.entries.length} · {TRACKS[result.trackId].nameHe}</div>
          {isOnline && <div className="text-sky-300 mt-1">🌐 מירוץ אונליין</div>}
          {isChamp && <div className="text-sky-300 mt-1">אליפות · מירוץ {(result.championshipRound ?? 0) + 1} · +{CHAMPIONSHIP_POINTS[pos - 1] ?? 0} נקודות</div>}
        </div>

        <Panel className="p-3 md:p-4">
          <table className="w-full text-sm md:text-base">
            <thead><tr className="text-sky-300 text-right"><th className="py-1">#</th><th>נהג</th><th className="text-left">הקפה מהירה</th><th className="text-left">זמן</th></tr></thead>
            <tbody>
              {result.entries.map((e) => (
                <tr key={e.id} className={`border-t border-white/10 ${e.isPlayer ? 'text-cyan-300 font-bold bg-sky-900/30' : ''}`}>
                  <td className="py-2 px-1">{e.position}</td>
                  <td><span className="inline-block w-2.5 h-2.5 rounded-full ml-2" style={{ background: e.isPlayer ? '#35e0ff' : e.color }} />{e.name}</td>
                  <td className="text-left" dir="ltr">{formatTime(e.bestLap)}</td>
                  <td className="text-left" dir="ltr">{e.finished ? formatTime(e.time) : `~${formatTime(e.time)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="grid sm:grid-cols-2 gap-3">
          <Panel className="p-4 text-center">
            <div className="text-sm text-sky-300">פרס המירוץ</div>
            <div className="text-4xl font-black text-yellow-300" dir="ltr">+{result.coinsEarned} 🪙</div>
            {!!result.xpEarned && <div className="text-cyan-300 font-bold mt-1" dir="ltr">+{result.xpEarned} XP</div>}
            {result.bestLapRecord && <div className="mt-1 text-emerald-300 font-bold">⏱ שיא הקפה חדש!</div>}
          </Panel>
          <Panel className="p-4">
            <div className="text-sm text-sky-300 mb-1">הישגים חדשים</div>
            {result.newAchievements.length === 0 && <div className="text-slate-400 text-sm">אין הפעם — נסה לנצח!</div>}
            {result.newAchievements.map((id) => (
              <div key={id} className="flex items-center gap-2 animate-in">
                <span className="text-2xl">{ACHIEVEMENT_MAP[id].icon}</span>
                <span className="font-bold">{ACHIEVEMENT_MAP[id].nameHe}</span>
                <span className="text-yellow-300 text-sm mr-auto">+{ACHIEVEMENT_MAP[id].reward}</span>
              </div>
            ))}
          </Panel>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {nextTrack && <Button variant="neon" size="lg" className="animate-glow" onClick={() => startRace({ trackId: nextTrack, mode: 'championship', laps: 3 })}>🏁 למירוץ הבא: {TRACKS[nextTrack].nameHe}</Button>}
          {isChamp && <Button size="lg" onClick={() => go('championship')}>🏆 טבלת האליפות</Button>}
          {isOnline && <Button variant="neon" size="lg" data-testid="back-to-lobby" onClick={() => go('online')}>🌐 חזרה ללובי</Button>}
          {!isChamp && !isOnline && <Button variant="neon" size="lg" data-testid="race-again" onClick={() => restart()}>🔄 מירוץ חוזר</Button>}
          <Button size="lg" onClick={() => go('garage')}>🚚 למוסך</Button>
          <Button size="lg" data-testid="to-home" onClick={() => go('home')}>🏠 תפריט ראשי</Button>
        </div>
      </div>
    </div>
  );
}
