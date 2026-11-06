import { useMemo, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { useCloud } from '../../net/cloud';
import { closeTournament, createTournament, deleteTournament, entriesFor, joinClub, leaveClub, setRedeemed, tournamentOpen, useClubData, type Tournament } from '../../net/club';
import { TRACK_LIST, TRACKS } from '../../data/tracks';
import { DIFFICULTY } from '../../game/race/buildRace';
import { formatTime } from '../../utils/random';
import { Button, Panel, ScreenFrame, Toggle } from '../components/UI';
import type { Difficulty, TrackId } from '../../types';
import { PlayerName } from '../components/PlayerUI';
import { removePlayer, resetPlayerName, usePlayers } from '../../net/players';

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1));

function timeLeft(ms: number) {
  if (ms <= 0) return 'הסתיים';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `עוד ${d} ימים ו־${h} שעות` : h > 0 ? `עוד ${h} שעות ו־${m} דק׳` : `עוד ${m} דקות`;
}

export function ClubScreen() {
  const status = useCloud((s) => s.status);
  const data = useClubData();
  const { cloud, members, error } = data;

  let body: React.ReactNode;
  if (status === 'loading') body = <Panel className="p-4 animate-pulse">מתחבר למועדון…</Panel>;
  else if (!cloud) {
    body = (
      <Panel className="p-4">
        <div className="font-black">🔒 המועדון זמין רק למשתמשים מחוברים</div>
        <p className="text-sm text-slate-300 mt-1">פתח את המשחק מהקישור שלו באפליקציית Claude או בדפדפן כשאתה מחובר לחשבון — ואז תוכל להצטרף למועדון ולהתחרות בטורנירים על הטבות של PHONE TRUCK.</p>
      </Panel>
    );
  } else if (!members) body = <Panel className="p-4 animate-pulse">טוען את המועדון…</Panel>;
  else {
    const isMember = members.some((m) => m.uid === cloud.uid);
    body = (
      <div className="flex flex-col gap-4">
        {!isMember && !cloud.isOwner ? <JoinCard /> : <MemberArea data={data} />}
        {cloud.isOwner && <OwnerPanel data={data} />}
      </div>
    );
  }

  return (
    <ScreenFrame title="מועדון החברים" icon="🏅">
      <div className="max-w-5xl mx-auto">
        {error && <Panel className="p-3 mb-3 text-amber-300 text-sm">חלק מהנתונים לא נטענו ({error}).</Panel>}
        {body}
      </div>
    </ScreenFrame>
  );
}

function JoinCard() {
  const cloud = useCloud((s) => s.cloud)!;
  const name = useProfile((s) => s.playerName);
  const setName = useProfile((s) => s.setPlayerName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Panel className="p-5 flex flex-col gap-3 max-w-xl mx-auto text-center">
      <div className="text-6xl">🏅</div>
      <h2 className="text-2xl font-black neon-text">הצטרף למועדון החברים של PHONE TRUCK</h2>
      <p className="text-slate-300">טורנירים שבועיים בין חברים — והזוכים מקבלים הטבות אמיתיות בפונטראק (קוד שובר אישי).</p>
      <label className="text-right">
        <span className="text-sm text-sky-200">השם שלך בטבלאות</span>
        <input id="club-name" className="mt-1 w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2 outline-none focus:border-cyan-300" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <Button variant="neon" size="lg" disabled={busy || !name.trim()} data-testid="join-club" onClick={async () => {
        setBusy(true); setErr(null);
        try { await joinClub(cloud, name.trim()); } catch { setErr('לא הצלחנו לצרף אותך — ייתכן שאין לך הרשאת השתתפות בעמוד הזה. בקש מבעל המשחק להזמין אותך.'); }
        setBusy(false);
      }}>✨ הצטרף למועדון</Button>
      {err && <p className="text-sm text-amber-300">{err}</p>}
    </Panel>
  );
}

function MemberArea({ data }: { data: ReturnType<typeof useClubData> }) {
  const { cloud, tournaments, entryDocs, members, myPrizes } = data;
  const startRace = useGame((s) => s.startRace);
  const now = Date.now();
  const active = (tournaments ?? []).filter((t) => tournamentOpen(t, now));
  const past = (tournaments ?? []).filter((t) => !tournamentOpen(t, now)).slice(0, 6);
  if (!cloud) return null;

  return (
    <>
      {myPrizes.length > 0 && (
        <Panel className="p-4 border-yellow-400/50">
          <h3 className="font-black text-lg mb-2">🎁 הפרסים שלי</h3>
          <div className="flex flex-col gap-2">
            {myPrizes.map((p) => (
              <div key={p.code} className={`rounded-xl p-3 border ${p.redeemed ? 'border-white/10 opacity-60' : 'border-yellow-300/60 bg-yellow-500/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="text-xl">{medal(p.rank - 1)}</span> <b>{p.prize}</b><div className="text-xs text-slate-400">{p.tname}</div></div>
                  <div className="text-2xl font-black tracking-widest" dir="ltr" data-testid="my-code">{p.code}</div>
                </div>
                <div className="text-xs mt-1 text-slate-300">{p.redeemed ? '✓ מומש' : 'הצג את הקוד בפונטראק כדי לממש · 052-546-6304'}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {active.length === 0 && <Panel className="p-4 text-slate-300">אין כרגע טורניר פעיל. הטורניר הבא יופיע כאן ברגע שייפתח.</Panel>}
      {active.map((t) => {
        const rows = entriesFor(entryDocs, t.id);
        const myIdx = rows.findIndex((r) => r.uid === cloud.uid);
        return (
          <Panel key={t.id} className="p-4 border-cyan-300/50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-cyan-300 font-bold">🏁 טורניר פעיל · {timeLeft(t.endsAt - now)}</div>
                <h2 className="text-2xl font-black neon-text">{t.name}</h2>
                <div className="text-sm text-slate-300">{TRACKS[t.track].emoji} {TRACKS[t.track].nameHe} · {t.laps} הקפות · קושי {DIFFICULTY[t.difficulty].nameHe}{t.equal ? ' · משאית סטנדרטית לכולם' : ''}</div>
              </div>
              <Button variant="neon" size="lg" className="animate-glow" data-testid="play-tournament" onClick={() => startRace({ trackId: t.track, laps: t.laps, mode: 'tournament', tournament: { id: t.id, name: t.name, difficulty: t.difficulty, equal: t.equal } })}>
                🏁 שחק בטורניר
              </Button>
            </div>
            <div className="grid sm:grid-cols-3 gap-2 mt-3">
              {[0, 1, 2].map((i) => t.prizes[i] ? (
                <div key={i} className="rounded-xl bg-slate-900/60 p-2 text-center"><div className="text-2xl">{medal(i)}</div><div className="text-sm font-bold">{t.prizes[i]}</div></div>
              ) : null)}
            </div>
            <div className="mt-3 text-sm">{myIdx >= 0 ? <span className="text-cyan-300">הזמן הכי טוב שלך: <b dir="ltr">{formatTime(rows[myIdx].best)}</b> — מקום <b>{myIdx + 1}</b> מתוך {rows.length}</span> : <span className="text-slate-300">עוד לא השתתפת — הזמן הכי טוב שלך נכנס לטבלה. אפשר לנסות כמה פעמים שרוצים.</span>}</div>
            <Table rows={rows} me={cloud.uid} />
          </Panel>
        );
      })}

      {past.length > 0 && (
        <Panel className="p-4">
          <h3 className="font-black mb-2">🏆 טורנירים קודמים</h3>
          <div className="flex flex-col gap-2">
            {past.map((t) => (
              <div key={t.id} className="rounded-xl bg-slate-900/50 p-3">
                <div className="flex justify-between flex-wrap gap-2"><b>{t.name}</b><span className="text-xs text-slate-400">{TRACKS[t.track].nameHe} · {t.status === 'closed' ? 'הוכרזו זוכים' : 'ממתין להכרזה'}</span></div>
                {t.winners.length > 0 && <div className="text-sm mt-1 flex flex-wrap gap-x-4">{t.winners.map((w) => <span key={w.uid}>{medal(w.rank - 1)} <span dir="auto">{w.name}</span> <span className="text-slate-400" dir="ltr">{formatTime(w.time)}</span></span>)}</div>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-4 text-sm flex flex-wrap items-center justify-between gap-2">
        <span>👥 {members?.length ?? 0} חברים במועדון</span>
        {members?.some((m) => m.uid === cloud.uid) && <button className="text-xs text-slate-400 underline" onClick={() => void leaveClub(cloud)}>עזוב את המועדון</button>}
      </Panel>
    </>
  );
}

function Table({ rows, me }: { rows: ReturnType<typeof entriesFor>; me: string }) {
  if (rows.length === 0) return <p className="text-slate-400 text-sm mt-2">הטבלה ריקה — היה הראשון!</p>;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm" data-testid="tournament-table">
        <thead><tr className="text-sky-300 text-right"><th className="py-1 w-10">#</th><th>נהג</th><th className="text-left">זמן</th><th className="text-left">ניסיונות</th></tr></thead>
        <tbody>
          {rows.slice(0, 50).map((r, i) => (
            <tr key={r.uid} className={`border-t border-white/10 ${r.uid === me ? 'text-cyan-300 font-bold bg-sky-900/30' : ''}`}>
              <td className="py-1.5">{medal(i)}</td>
              <td><PlayerName uid={r.uid} fallback={r.name} />{r.uid === me && ' (אתה)'}</td>
              <td className="text-left tabular-nums" dir="ltr">{formatTime(r.best)}</td>
              <td className="text-left tabular-nums">{r.tries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OwnerPanel({ data }: { data: ReturnType<typeof useClubData> }) {
  const { cloud, tournaments, entryDocs, allPrizes, members } = data;
  const [name, setName] = useState('טורניר השבוע');
  const [track, setTrack] = useState<TrackId>('ashdod');
  const [laps, setLaps] = useState(2);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [days, setDays] = useState(7);
  const [equal, setEqual] = useState(true);
  const [prizes, setPrizes] = useState(['20% הנחה על תיקון מסך', '10% הנחה על אביזרים', 'מגן מסך במתנה']);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const now = Date.now();
  const open = useMemo(() => (tournaments ?? []).filter((t) => t.status === 'active'), [tournaments]);
  const issued = allPrizes.flatMap((p) => p.items.map((it) => ({ ...it, uid: p.uid, all: p.items })));
  const memberName = (uid: string) => members?.find((m) => m.uid === uid)?.name ?? 'נהג';
  if (!cloud) return null;

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label); setMsg(null);
    try { await fn(); setMsg(ok); } catch { setMsg('הפעולה נכשלה, נסה שוב.'); }
    setBusy(null);
  };

  return (
    <Panel className="p-4 border-amber-400/50">
      <h3 className="font-black text-lg">🛠️ ניהול (רק אתה רואה את זה)</h3>
      {msg && <div className="text-sm text-emerald-300 mt-1">{msg}</div>}

      {open.map((t: Tournament) => {
        const rows = entriesFor(entryDocs, t.id);
        return (
          <div key={t.id} className="mt-3 rounded-xl bg-slate-900/60 p-3 flex flex-wrap items-center gap-2 justify-between">
            <div><b>{t.name}</b> <span className="text-xs text-slate-400">{timeLeft(t.endsAt - now)} · {rows.length} משתתפים</span></div>
            {confirmClose === t.id ? (
              <span className="flex gap-2 items-center text-sm">
                להכריז על {Math.min(3, rows.length)} זוכים ולהנפיק קודים?
                <Button size="sm" variant="neon" disabled={!!busy} data-testid="confirm-close" onClick={() => { setConfirmClose(null); void run('close', () => closeTournament(cloud, t, rows), 'הזוכים הוכרזו וקודי השובר נשלחו אליהם במועדון ✓'); }}>כן, הכרז</Button>
                <Button size="sm" onClick={() => setConfirmClose(null)}>ביטול</Button>
              </span>
            ) : (
              <span className="flex gap-2">
                <Button size="sm" variant="neon" disabled={!!busy} data-testid="close-tournament" onClick={() => setConfirmClose(t.id)}>🏆 סגור והכרז זוכים</Button>
                <Button size="sm" variant="danger" disabled={!!busy} onClick={() => void run('del', () => deleteTournament(cloud, t.id), 'הטורניר נמחק')}>מחק</Button>
              </span>
            )}
          </div>
        );
      })}

      <details className="mt-4" open={open.length === 0}>
        <summary className="cursor-pointer font-bold">➕ טורניר חדש</summary>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <label className="block"><span className="text-sm text-sky-200">שם הטורניר</span>
            <input id="t-name" className="mt-1 w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div><span className="text-sm text-sky-200">מסלול</span>
            <div className="flex gap-1.5 mt-1 flex-wrap">{TRACK_LIST.map((tr) => <Button key={tr.id} size="sm" variant={track === tr.id ? 'neon' : 'ghost'} onClick={() => setTrack(tr.id)}>{tr.emoji} {tr.nameHe}</Button>)}</div></div>
          <div><span className="text-sm text-sky-200">הקפות</span>
            <div className="flex gap-1.5 mt-1">{[1, 2, 3].map((n) => <Button key={n} data-testid={`t-laps-${n}`} size="sm" variant={laps === n ? 'neon' : 'ghost'} onClick={() => setLaps(n)}>{n}</Button>)}</div></div>
          <div><span className="text-sm text-sky-200">רמת קושי</span>
            <div className="flex gap-1.5 mt-1 flex-wrap">{(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => <Button key={d} size="sm" variant={diff === d ? 'neon' : 'ghost'} onClick={() => setDiff(d)}>{DIFFICULTY[d].nameHe}</Button>)}</div></div>
          <div><span className="text-sm text-sky-200">משך</span>
            <div className="flex gap-1.5 mt-1">{[1, 3, 7, 14].map((n) => <Button key={n} size="sm" variant={days === n ? 'neon' : 'ghost'} onClick={() => setDays(n)}>{n === 1 ? 'יום' : `${n} ימים`}</Button>)}</div></div>
          <Toggle label="משאית סטנדרטית לכולם (בלי שדרוגים — הוגן לכולם)" checked={equal} onChange={setEqual} />
          {[0, 1, 2].map((i) => (
            <label key={i} className="block"><span className="text-sm text-sky-200">{medal(i)} פרס למקום {i + 1}</span>
              <input id={`t-prize-${i}`} className="mt-1 w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2" maxLength={80} value={prizes[i]} placeholder="ריק = בלי פרס" onChange={(e) => setPrizes((p) => p.map((x, j) => (j === i ? e.target.value : x)))} /></label>
          ))}
        </div>
        <Button variant="neon" size="lg" className="mt-3" disabled={!!busy || !name.trim()} data-testid="create-tournament" onClick={() => void run('create', () => createTournament(cloud, { name: name.trim(), track, laps, difficulty: diff, equal, prizes: prizes.map((p) => p.trim()), endsAt: Date.now() + days * 86400000 }), 'הטורניר נפתח ✓ החברים יראו אותו במועדון')}>🚀 פתח טורניר</Button>
      </details>

      <UsersAdmin />

      <div className="mt-5">
        <h4 className="font-bold mb-2">🎟️ שוברים שהונפקו ({issued.length})</h4>
        {issued.length === 0 && <p className="text-sm text-slate-400">עוד לא הונפקו שוברים.</p>}
        <div className="flex flex-col gap-1.5">
          {issued.sort((a, b) => b.issuedAt - a.issuedAt).map((p) => (
            <div key={p.code} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/50 p-2 text-sm">
              <span className="font-black tracking-widest" dir="ltr">{p.code}</span>
              <span dir="auto">{memberName(p.uid)}</span>
              <span className="text-slate-400">{medal(p.rank - 1)} {p.prize} · {p.tname}</span>
              <span className="mr-auto" />
              <Button size="sm" variant={p.redeemed ? 'ghost' : 'neon'} onClick={() => void run('redeem', () => setRedeemed(cloud, p.uid, p.all, p.code, !p.redeemed), p.redeemed ? 'סומן כלא מומש' : 'סומן כמומש ✓')}>{p.redeemed ? '↺ בטל מימוש' : '✓ סמן כמומש'}</Button>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function UsersAdmin() {
  const cloud = useCloud((s) => s.cloud);
  const byUid = usePlayers((s) => s.byUid);
  const players = useMemo(() => Object.values(byUid), [byUid]);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!cloud) return null;
  return (
    <div className="mt-5">
      <h4 className="font-bold mb-2">👥 משתמשים ({players.length})</h4>
      {players.length === 0 && <p className="text-sm text-slate-400">עוד אין משתמשים רשומים.</p>}
      <div className="flex flex-col gap-1.5">
        {players.sort((a, b) => b.createdAt - a.createdAt).map((p) => (
          <div key={p.uid} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/50 p-2 text-sm">
            <PlayerName uid={p.uid} fallback={p.username} />
            <span className="text-xs text-slate-400">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('he-IL') : ''}</span>
            <span className="mr-auto" />
            {p.uid !== cloud.uid && (confirm === p.uid ? (
              <>
                <span className="text-xs text-red-300">להסיר את המשתמש?</span>
                <Button size="sm" variant="danger" onClick={() => { setConfirm(null); void removePlayer(cloud, p.uid); }}>הסר</Button>
                <Button size="sm" onClick={() => setConfirm(null)}>ביטול</Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => void resetPlayerName(cloud, p)} title="מחליף שם לא מתאים בשם כללי">איפוס שם</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirm(p.uid)}>הסר</Button>
              </>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
