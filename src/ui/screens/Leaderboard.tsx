import { useEffect, useMemo, useState } from 'react';
import { useCloud } from '../../net/cloud';
import { TRACK_LIST, TRACKS } from '../../data/tracks';
import { TRUCKS } from '../../data/trucks';
import { formatTime } from '../../utils/random';
import { Button, Panel } from '../components/UI';
import type { TrackId, TruckId } from '../../types';
import { PlayerName } from '../components/PlayerUI';

interface Entry {
  id: string;
  name: string;
  xp: number;
  races: number;
  wins: number;
  champs: number;
  truck: TruckId;
  color: string;
  best: Partial<Record<TrackId, number | null>>;
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

/** Other players' rows are untrusted — read every field defensively. */
function parse(id: string, d: Record<string, unknown> | undefined): Entry | null {
  if (!d) return null;
  const best: Entry['best'] = {};
  const b = (d.best ?? {}) as Record<string, unknown>;
  TRACK_LIST.forEach((t) => {
    const v = b[t.id];
    best[t.id] = typeof v === 'number' && isFinite(v) && v > 5 ? v : null;
  });
  return {
    id,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.slice(0, 24) : 'נהג',
    xp: num(d.xp),
    races: num(d.races),
    wins: num(d.wins),
    champs: num(d.champs),
    truck: (String(d.truck) in TRUCKS ? d.truck : 'atleon') as TruckId,
    color: typeof d.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#f4f6f8',
    best,
  };
}

type Board = 'xp' | TrackId;

export function Leaderboard() {
  const status = useCloud((s) => s.status);
  const cloud = useCloud((s) => s.cloud);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [board, setBoard] = useState<Board>('xp');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud) return;
    const t = setTimeout(() => setTimedOut(true), 10000);
    const unsub = cloud.db.collection('scores').limit(1000).onSnapshot(
      (snap) => {
        clearTimeout(t);
        setTimedOut(false);
        setRows(snap.docs.map((d) => parse(d.id, d.data())).filter((x): x is Entry => !!x));
      },
      (e) => { clearTimeout(t); setError(e.code); },
    );
    return () => { clearTimeout(t); unsub(); };
  }, [cloud]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (board === 'xp') return [...rows].filter((r) => r.races > 0).sort((a, b) => b.xp - a.xp || b.wins - a.wins);
    return rows.filter((r) => r.best[board] != null).sort((a, b) => a.best[board]! - b.best[board]!);
  }, [rows, board]);

  if (status === 'loading') return <Panel className="p-4 animate-pulse">מתחבר לדירוג העולמי…</Panel>;
  if (status === 'off' || !cloud) {
    return (
      <Panel className="p-4">
        <div className="font-black">🌍 הדירוג העולמי לא זמין כאן</div>
        <p className="text-sm text-slate-300 mt-1">הדירוג העולמי והחשבון עובדים כשהמשחק פתוח מהקישור שלו ב־claude.ai ואתה מחובר. השיאים שלך במכשיר הזה מופיעים בלשונית "השיאים שלי".</p>
      </Panel>
    );
  }

  const meIdx = sorted.findIndex((r) => r.id === cloud.uid);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={board === 'xp' ? 'neon' : 'ghost'} onClick={() => setBoard('xp')}>🏆 דירוג כללי (XP)</Button>
        {TRACK_LIST.map((t) => (
          <Button key={t.id} size="sm" variant={board === t.id ? 'neon' : 'ghost'} onClick={() => setBoard(t.id)}>⏱ {t.emoji} {t.nameHe}</Button>
        ))}
      </div>
      {meIdx >= 0 && <div className="text-sm text-cyan-300">אתה במקום <b>{meIdx + 1}</b> מתוך {sorted.length}</div>}
      <Panel className="p-3 md:p-4" >
        {error && <div className="text-red-300 text-sm mb-2">לא ניתן לטעון את הדירוג ({error}).</div>}
        {!rows && !error && <div className="text-slate-300 animate-pulse">{timedOut ? 'הדירוג עוד לא נטען — בדוק את החיבור.' : 'טוען דירוג…'}</div>}
        {rows && sorted.length === 0 && (
          <div className="text-slate-300">{board === 'xp' ? 'עוד אין נהגים בדירוג — סיים מירוץ ותהיה הראשון!' : `עוד אין זמני הקפה ב${TRACKS[board].nameHe}.`}</div>
        )}
        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:text-base" data-testid="leaderboard">
              <thead>
                <tr className="text-sky-300 text-right">
                  <th className="py-1 w-10">#</th>
                  <th>נהג</th>
                  {board === 'xp' ? (
                    <><th className="text-left">XP</th><th className="text-left hidden sm:table-cell">ניצחונות</th><th className="text-left hidden sm:table-cell">מירוצים</th></>
                  ) : (
                    <th className="text-left">הקפה</th>
                  )}
                  {cloud.isOwner && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 100).map((r, i) => (
                  <tr key={r.id} className={`border-t border-white/10 ${r.id === cloud.uid ? 'text-cyan-300 font-bold bg-sky-900/30' : ''}`}>
                    <td className="py-2 px-1">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                    <td>
                      <PlayerName uid={r.id} fallback={r.name} />
                      {r.champs > 0 && <span title="אלוף" className="mr-1">🏆</span>}
                      {r.id === cloud.uid && <span className="text-xs mr-2">(אתה)</span>}
                      <span className="block text-[11px] text-slate-400 font-normal">{TRUCKS[r.truck].name}</span>
                    </td>
                    {board === 'xp' ? (
                      <><td className="text-left tabular-nums">{r.xp.toLocaleString()}</td><td className="text-left hidden sm:table-cell tabular-nums">{r.wins}</td><td className="text-left hidden sm:table-cell tabular-nums">{r.races}</td></>
                    ) : (
                      <td className="text-left tabular-nums" dir="ltr">{formatTime(r.best[board] ?? null)}</td>
                    )}
                    {cloud.isOwner && (
                      <td>
                        {r.id !== cloud.uid && <DeleteRow onDelete={() => cloud.db.doc(`scores/${r.id}`).delete()} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-xs text-slate-400">XP מתקבל על כל מירוץ לפי המקום ורמת הקושי (מירוצי אונליין שווים ×1.5). הדירוג מתעדכן בזמן אמת.</p>
    </div>
  );
}

function DeleteRow({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button className="text-slate-500 hover:text-red-400 px-1" title="הסר מהדירוג" onClick={() => setConfirm(true)}>✕</button>;
  return (
    <span className="flex gap-1">
      <button className="text-red-400 text-xs font-bold" onClick={() => void onDelete().catch(() => undefined)}>הסר</button>
      <button className="text-slate-400 text-xs" onClick={() => setConfirm(false)}>ביטול</button>
    </span>
  );
}
