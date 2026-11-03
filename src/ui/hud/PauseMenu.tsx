import { Button, Panel } from '../components/UI';
import { useProfile } from '../../store/profileStore';
import { audio } from '../../game/audio/audio';

export function PauseMenu({ onResume, onRestart, onExit, onCamera, camera }: { onResume: () => void; onRestart: () => void; onExit: () => void; onCamera: () => void; camera: string }) {
  const volume = useProfile((s) => s.settings.volume);
  const update = useProfile((s) => s.updateSettings);
  const camName: Record<string, string> = { chase: 'מאחורי המשאית', cab: 'תא נהג', far: 'מרחוק' };
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4" data-testid="pause-menu">
      <Panel className="p-6 w-full max-w-sm flex flex-col gap-3 animate-in">
        <h2 className="text-3xl font-black text-center neon-text mb-2">⏸ הפסקה</h2>
        <Button variant="neon" size="lg" onClick={onResume}>▶ המשך מירוץ</Button>
        <Button onClick={onRestart}>🔄 התחל מחדש</Button>
        <Button onClick={onCamera}>🎥 מצלמה: {camName[camera]}</Button>
        <label className="flex items-center gap-3 px-1">
          <span>🔊</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} className="flex-1" onChange={(e) => { const v = Number(e.target.value); update({ volume: v }); audio.setVolume(v); }} />
        </label>
        <Button variant="danger" onClick={onExit}>🏠 יציאה לתפריט</Button>
        <p className="text-xs text-slate-400 text-center mt-1">מקלדת: חצים/WASD לנהיגה · Shift/N ניטרו · C מצלמה · R חזרה למסלול · Esc הפסקה</p>
      </Panel>
    </div>
  );
}
