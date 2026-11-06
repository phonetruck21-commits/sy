import { useState } from 'react';
import { useCloud } from '../../net/cloud';
import { levelOf, usePlayers, xpForLevel } from '../../net/players';
import { useProfile } from '../../store/profileStore';
import { useGame } from '../../store/gameStore';
import { ACHIEVEMENTS } from '../../data/achievements';
import { TRUCK_LIST } from '../../data/trucks';
import { Avatar, PlayerForm } from '../components/PlayerUI';
import { Button, Panel, ScreenFrame } from '../components/UI';

export function ProfileScreen() {
  const status = useCloud((s) => s.status);
  const me = usePlayers((s) => s.me);
  const loaded = usePlayers((s) => s.loaded);
  const xp = useProfile((s) => s.xp ?? 0);
  const stats = useProfile((s) => s.stats);
  const achievements = useProfile((s) => s.achievements);
  const isOpen = useProfile((s) => s.isTruckUnlocked);
  const go = useGame((s) => s.go);
  const [editing, setEditing] = useState(false);
  const lvl = levelOf(xp);
  const from = xpForLevel(lvl), to = xpForLevel(lvl + 1);

  return (
    <ScreenFrame title="הפרופיל שלי" icon="👤">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {status !== 'on' && (
          <Panel className="p-4">
            <div className="font-black">אתה משחק כאורח</div>
            <p className="text-sm text-slate-300 mt-1">כדי ליצור משתמש — שם ייחודי, אווטאר, שמירה בענן, דירוג וטורנירים — פתח את המשחק מהקישור שלו באפליקציית Claude או בדפדפן כשאתה מחובר לחשבון.</p>
          </Panel>
        )}
        {status === 'on' && loaded && (!me || editing) && (
          <Panel className="p-5">
            <h2 className="font-black text-xl mb-3">{me ? '✏️ עריכת משתמש' : '👤 צור את המשתמש שלך'}</h2>
            <PlayerForm submitLabel={me ? '💾 שמור' : '✨ צור משתמש'} onDone={() => setEditing(false)} />
            {me && <Button className="w-full mt-2" onClick={() => setEditing(false)}>ביטול</Button>}
          </Panel>
        )}
        {me && !editing && (
          <Panel className="p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <Avatar avatar={me.avatar} color={me.color} size={80} />
              <div className="flex-1 min-w-0">
                <div className="text-3xl font-black truncate" dir="auto" data-testid="my-username">{me.username}</div>
                <div className="text-cyan-300">רמה {lvl} · {xp.toLocaleString()} XP</div>
                <div className="h-2 rounded-full bg-slate-800 mt-2 overflow-hidden" dir="ltr"><div className="h-full bg-gradient-to-r from-sky-500 to-cyan-300" style={{ width: `${Math.min(100, ((xp - from) / (to - from)) * 100)}%` }} /></div>
                <div className="text-xs text-slate-400 mt-1">עוד {(to - xp).toLocaleString()} XP לרמה {lvl + 1}</div>
              </div>
              <Button onClick={() => setEditing(true)}>✏️ ערוך</Button>
            </div>
          </Panel>
        )}
        <Panel className="p-4">
          <h3 className="font-black mb-2">📈 סטטיסטיקה</h3>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[['🏁', stats.races, 'מירוצים'], ['🥇', stats.wins, 'ניצחונות'], ['🥉', stats.podiums, 'פודיומים'], ['🏆', stats.championships, 'אליפויות']].map(([i, v, l]) => (
              <div key={l as string} className="bg-slate-900/60 rounded-xl p-2"><div className="text-xl">{i}</div><div className="font-black text-xl">{v}</div><div className="text-xs text-slate-400">{l}</div></div>
            ))}
          </div>
        </Panel>
        <Panel className="p-4">
          <h3 className="font-black mb-2">🚚 המשאיות שלי</h3>
          <div className="flex flex-wrap gap-2">{TRUCK_LIST.map((t) => <span key={t.id} className={`rounded-lg px-3 py-1.5 text-sm ${isOpen(t.id) ? 'bg-sky-900/60' : 'bg-slate-900/60 opacity-50'}`}>{isOpen(t.id) ? '✓' : '🔒'} {t.nameHe}</span>)}</div>
        </Panel>
        <Panel className="p-4">
          <h3 className="font-black mb-2">🎖️ הישגים ({achievements.length}/{ACHIEVEMENTS.length})</h3>
          <div className="flex flex-wrap gap-2">{ACHIEVEMENTS.map((a) => <span key={a.id} title={a.descHe} className={`rounded-lg px-2 py-1 text-sm ${achievements.includes(a.id) ? 'bg-amber-500/20' : 'bg-slate-900/60 opacity-40'}`}>{a.icon} {a.nameHe}</span>)}</div>
        </Panel>
        <div className="flex gap-2 justify-center flex-wrap">
          <Button onClick={() => go('club')}>🏅 למועדון</Button>
          <Button onClick={() => go('championship')}>🌍 לדירוג העולמי</Button>
        </div>
      </div>
    </ScreenFrame>
  );
}
