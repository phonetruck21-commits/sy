import { useState } from 'react';
import { create } from 'zustand';
import { useCloud } from '../../net/cloud';
import { AVATARS, COLORS, levelOf, saveMyPlayer, usePlayers, usePublicStats, validateUsername, usernameTaken } from '../../net/players';
import { TRUCKS } from '../../data/trucks';
import { TRACK_LIST } from '../../data/tracks';
import { formatTime } from '../../utils/random';
import { Button, Panel } from './UI';
import type { TruckId } from '../../types';

/** Avatar bubble in the player's colour. */
export function Avatar({ avatar, color, size = 32 }: { avatar: string; color: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, fontSize: size * 0.55, background: `${color}33`, boxShadow: `0 0 0 2px ${color}` }}>
      {avatar}
    </span>
  );
}

/** A player's name with avatar; tap to open their profile card. */
export function PlayerName({ uid, fallback, className = '' }: { uid: string; fallback: string; className?: string }) {
  const p = usePlayers((s) => s.byUid[uid]);
  const open = usePlayerCard((s) => s.open);
  return (
    <button type="button" className={`inline-flex items-center gap-2 text-right hover:underline ${className}`} onClick={() => open(uid)}>
      {p ? <Avatar avatar={p.avatar} color={p.color} size={24} /> : null}
      <span dir="auto">{p?.username ?? fallback}</span>
    </button>
  );
}

// ---------------------------------------------------------------- profile card
export const usePlayerCard = create<{ uid: string | null; open: (uid: string) => void; close: () => void }>()((set) => ({
  uid: null,
  open: (uid) => set({ uid }),
  close: () => set({ uid: null }),
}));

export function PlayerCardModal() {
  const uid = usePlayerCard((s) => s.uid);
  const close = usePlayerCard((s) => s.close);
  const p = usePlayers((s) => (uid ? s.byUid[uid] : undefined));
  const stats = usePublicStats(uid);
  const myUid = useCloud((s) => s.cloud?.uid);
  if (!uid) return null;
  const xp = stats?.xp ?? 0;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={close} data-testid="player-card">
      <Panel className="p-5 w-full max-w-sm animate-in">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <Avatar avatar={p?.avatar ?? '🚚'} color={p?.color ?? '#35e0ff'} size={64} />
            <div className="min-w-0">
              <div className="text-2xl font-black truncate" dir="auto">{p?.username ?? 'נהג'}</div>
              <div className="text-sm text-cyan-300">רמה {levelOf(xp)} · {xp.toLocaleString()} XP{uid === myUid ? ' · זה אתה' : ''}</div>
            </div>
          </div>
          {stats ? (
            <>
              <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                {[['🏁', stats.races, 'מירוצים'], ['🥇', stats.wins, 'ניצחונות'], ['🥉', stats.podiums, 'פודיומים'], ['🏆', stats.champs, 'אליפויות']].map(([i, v, l]) => (
                  <div key={l as string} className="bg-slate-900/60 rounded-xl p-2"><div>{i}</div><div className="font-black text-lg">{v}</div><div className="text-[10px] text-slate-400">{l}</div></div>
                ))}
              </div>
              <div className="mt-3 text-sm">🚚 {TRUCKS[(stats.truck in TRUCKS ? stats.truck : 'atleon') as TruckId].nameHe}</div>
              <div className="mt-2 text-xs text-slate-300 flex flex-col gap-0.5">
                {TRACK_LIST.map((t) => <div key={t.id} className="flex justify-between"><span>{t.emoji} {t.nameHe}</span><span dir="ltr">{formatTime(stats.best[t.id] ?? null)}</span></div>)}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 mt-4">עוד אין נתוני מירוצים לנהג הזה.</p>
          )}
          <Button className="w-full mt-4" onClick={close}>סגור</Button>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- sign-up / edit form
export function PlayerForm({ onDone, submitLabel }: { onDone?: () => void; submitLabel: string }) {
  const cloud = useCloud((s) => s.cloud);
  const me = usePlayers((s) => s.me);
  const [username, setUsername] = useState(me?.username ?? '');
  const [avatar, setAvatar] = useState(me?.avatar ?? '🚚');
  const [color, setColor] = useState(me?.color ?? '#35e0ff');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!cloud) return null;
  const invalid = validateUsername(username) ?? (usernameTaken(username, cloud.uid) ? 'השם הזה כבר תפוס' : null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (invalid) return;
        setBusy(true);
        setErr(null);
        try {
          await saveMyPlayer(cloud, { username, avatar, color });
          onDone?.();
        } catch (ex) {
          setErr((ex as Error).message && !(ex as { code?: string }).code ? (ex as Error).message : 'השמירה נכשלה — ייתכן שאין לך הרשאת השתתפות בעמוד הזה. בקש מבעל המשחק להזמין אותך.');
        }
        setBusy(false);
      }}
    >
      <div className="flex items-center gap-3 justify-center">
        <Avatar avatar={avatar} color={color} size={64} />
        <div className="text-xl font-black" dir="auto">{username.trim() || 'השם שלך'}</div>
      </div>
      <label className="block">
        <span className="text-sm text-sky-200">שם משתמש (ייחודי)</span>
        <input id="player-username" className="mt-1 w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2 outline-none focus:border-cyan-300" maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        {username && invalid && <span className="text-xs text-amber-300">{invalid}</span>}
      </label>
      <div>
        <span className="text-sm text-sky-200">אווטאר</span>
        <div className="grid grid-cols-8 gap-1.5 mt-1">
          {AVATARS.map((a) => (
            <button type="button" key={a} onClick={() => setAvatar(a)} className={`text-2xl rounded-lg py-1 ${avatar === a ? 'bg-sky-700/70 ring-2 ring-cyan-300' : 'bg-slate-900/60'}`} aria-label={a}>{a}</button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-sm text-sky-200">צבע</span>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          {COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setColor(c)} aria-label={c} className={`w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      <Button type="submit" variant="neon" size="lg" disabled={busy || !!invalid} data-testid="save-player">{busy ? 'שומר…' : submitLabel}</Button>
      {err && <p className="text-sm text-amber-300">{err}</p>}
    </form>
  );
}

/** First-run sign-up for signed-in players without an account yet. */
export function SignupModal() {
  const cloud = useCloud((s) => s.cloud);
  const loaded = usePlayers((s) => s.loaded);
  const me = usePlayers((s) => s.me);
  const dismissed = usePlayers((s) => s.dismissedSignup);
  if (!cloud || !loaded || me || dismissed) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 overflow-y-auto" data-testid="signup">
      <Panel className="p-5 w-full max-w-md animate-in my-auto">
        <h2 className="text-2xl font-black text-center neon-text">👤 צור את המשתמש שלך</h2>
        <p className="text-sm text-slate-300 text-center mt-1 mb-3">שם משתמש ואווטאר שיופיעו בדירוג, בטורנירים ובאונליין. ההתקדמות נשמרת בחשבון שלך.</p>
        <PlayerForm submitLabel="✨ צור משתמש" />
        <button className="w-full text-center text-xs text-slate-400 underline mt-3" onClick={() => usePlayers.setState({ dismissedSignup: true })}>אחר כך</button>
      </Panel>
    </div>
  );
}
