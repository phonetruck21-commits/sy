import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { useProfile } from '../../store/profileStore';
import { hostOf, MAX_ONLINE_PLAYERS, normalizeCode, PUBLIC_ROOM, randomCode, readPlayers, useOnline } from '../../net/onlineStore';
import { lookFromDesign } from '../../net/onlineRace';
import { usePlayers } from '../../net/players';
import { Avatar } from '../components/PlayerUI';
import { ChatPanel } from '../components/ChatPanel';
import { TRACK_LIST, TRACKS } from '../../data/tracks';
import { TRUCKS } from '../../data/trucks';
import { Button, Panel, ScreenFrame } from '../components/UI';
import { TRACK_GRADIENT } from './RaceSetupScreen';
import type { TrackId } from '../../types';

export function OnlineScreen() {
  const status = useOnline((s) => s.status);
  const code = useOnline((s) => s.code);
  const error = useOnline((s) => s.error);
  const mock = useOnline((s) => s.mock);
  const leave = useOnline((s) => s.leave);

  return (
    <ScreenFrame title="אונליין — מירוץ עם חברים" icon="🌐" right={status === 'connected' ? <Button size="sm" variant="danger" onClick={() => void leave()}>יציאה מהחדר</Button> : undefined}>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        {status === 'connected' && code ? <Lobby code={code} mock={mock} /> : <Join />}
        {status === 'connecting' && <Panel className="p-4 text-center animate-pulse">מתחבר לחדר…</Panel>}
        {status === 'unavailable' && (
          <Panel className="p-4 border-amber-400/50">
            <div className="font-black text-amber-300">אונליין לא זמין כאן</div>
            <p className="text-sm text-slate-300 mt-1">
              משחק אונליין עובד כשהמשחק פתוח מתוך הקישור שלו ב־claude.ai ואתה מחובר לחשבון. בקישור ציבורי או ללא התחברות אפשר לשחק רק נגד המחשב.
            </p>
          </Panel>
        )}
        {status === 'error' && <Panel className="p-4 text-red-300">החיבור לחדר נכשל ({error}). נסה שוב בעוד רגע.</Panel>}
      </div>
    </ScreenFrame>
  );
}

function Join() {
  const connect = useOnline((s) => s.connect);
  const name = useProfile((s) => s.playerName);
  const setName = useProfile((s) => s.setPlayerName);
  const [joinCode, setJoinCode] = useState('');

  const go = (c: string) => {
    const p = useProfile.getState();
    const me = usePlayers.getState().me;
    void connect(c, { name: p.playerName, look: { ...lookFromDesign(p.activeDesign()), av: me?.avatar, pc: me?.color }, truck: p.selectedTruck });
  };

  return (
    <>
      <Panel className="p-4 flex flex-col gap-3">
        <label className="block">
          <span className="text-sm text-sky-200">השם שיופיע לשאר הנהגים</span>
          <input id="online-name" disabled={!!usePlayers.getState().me} className="mt-1 w-full rounded-lg bg-slate-900/80 border border-sky-500/30 px-3 py-2 outline-none focus:border-cyan-300" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Button variant="neon" size="lg" data-testid="create-room" onClick={() => go(randomCode())}>➕ צור חדר חדש</Button>
            <p className="text-xs text-slate-400">תקבל קוד חדר — שלח אותו לחברים.</p>
          </div>
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); const c = normalizeCode(joinCode); if (c) go(c); }}>
            <div className="flex gap-2">
              <input id="join-code" dir="ltr" placeholder="קוד חדר" className="flex-1 min-w-0 rounded-xl bg-slate-900/80 border border-sky-500/30 px-3 text-xl font-black tracking-widest text-center outline-none focus:border-cyan-300" value={joinCode} maxLength={12} onChange={(e) => setJoinCode(e.target.value)} />
              <Button type="submit" size="lg" disabled={!normalizeCode(joinCode)}>הצטרף</Button>
            </div>
            <p className="text-xs text-slate-400">יש לך קוד מחבר? הקלד אותו כאן.</p>
          </form>
        </div>
        <Button data-testid="public-room" onClick={() => go(PUBLIC_ROOM)}>🌍 היכנס לחדר הכללי</Button>
      </Panel>
      <Panel className="p-4 text-sm text-slate-300">
        <div className="font-bold text-white mb-1">איך משחקים עם חברים?</div>
        <ol className="list-decimal pr-5 space-y-1">
          <li>שתף את המשחק עם החבר דרך כפתור Share בעמוד המשחק ב־claude.ai (או פתח אותו במכשיר שני מאותו חשבון).</li>
          <li>אחד יוצר חדר ושולח את הקוד, השני נכנס לאונליין ומקליד אותו.</li>
          <li>המארח בוחר מסלול ולוחץ "התחל" — עד {MAX_ONLINE_PLAYERS} נהגים במירוץ, בזמן אמת.</li>
        </ol>
      </Panel>
    </>
  );
}

function Lobby({ code, mock }: { code: string; mock: boolean }) {
  const peers = useOnline((s) => s.peers);
  const setPresence = useOnline((s) => s.setPresence);
  const lastRaceId = useOnline((s) => s.lastRaceId);
  const markRaceJoined = useOnline((s) => s.markRaceJoined);
  const startRace = useGame((s) => s.startRace);
  const players = useMemo(() => readPlayers(peers), [peers]);
  const me = players.find((p) => p.isMe);
  const host = hostOf(players);
  const amHost = !!me && host?.peer === me.peer;
  const [track, setTrack] = useState<TrackId>(host?.cfg?.track ?? 'ashdod');
  const [laps, setLaps] = useState(host?.cfg?.laps ?? 3);
  const [copied, setCopied] = useState(false);

  // host shares the lobby choice so everyone sees it
  useEffect(() => {
    if (amHost) setPresence({ cfg: { track, laps } });
  }, [amHost, track, laps, setPresence]);

  // follow the host into a race we are part of
  const hostRace = host?.race ?? null;
  useEffect(() => {
    if (!me || !hostRace || hostRace.id === lastRaceId || !hostRace.order.includes(me.peer)) return;
    markRaceJoined(hostRace.id);
    const info: Record<string, { name: string; look: typeof me.look; truck: typeof me.truck }> = {};
    players.forEach((p) => (info[p.peer] = { name: p.name, look: p.look, truck: p.truck }));
    startRace({ trackId: hostRace.track, mode: 'online', laps: hostRace.laps, online: { raceId: hostRace.id, order: hostRace.order, myPeer: me.peer, players: info } });
  }, [me, hostRace, lastRaceId, markRaceJoined, players, startRace]);

  const raceRunningWithoutMe = !!hostRace && hostRace.id !== lastRaceId && !!me && !hostRace.order.includes(me.peer);
  const shown = amHost ? { track, laps } : host?.cfg ?? { track: 'ashdod' as TrackId, laps: 3 };

  const start = () => {
    const order = players.slice(0, MAX_ONLINE_PLAYERS).map((p) => p.peer);
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setPresence({ race: { id, track, laps, order }, go: null, loaded: null });
  };

  return (
    <>
      <Panel className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-sky-300">{code === PUBLIC_ROOM ? 'החדר הכללי' : 'קוד החדר — שלח לחברים'}</div>
          <div className="text-4xl font-black tracking-[0.3em] neon-text" dir="ltr" data-testid="room-code">{code === PUBLIC_ROOM ? 'PUBLIC' : code.toUpperCase()}</div>
        </div>
        {code !== PUBLIC_ROOM && (
          <Button size="sm" onClick={() => { navigator.clipboard?.writeText(code.toUpperCase()).then(() => setCopied(true), () => undefined); }}>{copied ? '✓ הועתק' : '📋 העתק קוד'}</Button>
        )}
        {mock && <div className="w-full text-xs text-amber-300">מצב בדיקה מקומי: החדר משותף רק בין חלונות באותו מחשב.</div>}
      </Panel>

      <Panel className="p-4">
        <h3 className="font-black mb-2">💬 צ׳אט החדר</h3>
        <ChatPanel />
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel className="p-4">
          <h3 className="font-black mb-2">נהגים בחדר ({players.length})</h3>
          <div className="flex flex-col gap-1.5" data-testid="lobby-players">
            {players.map((p, i) => (
              <div key={p.peer} className={`flex items-center gap-2 rounded-xl p-2 border ${p.isMe ? 'border-cyan-300 bg-sky-900/40' : 'border-white/10 bg-slate-900/40'}`}>
                {p.look.av ? <Avatar avatar={p.look.av} color={p.look.pc ?? '#35e0ff'} size={26} /> : <span className="w-5 h-5 rounded" style={{ background: p.look.c, boxShadow: `inset 0 -6px 0 ${p.look.a}` }} />}
                <span className="flex-1 truncate" dir="auto">{p.name}</span>
                <span className="text-xs text-slate-400">{TRUCKS[p.truck].name}</span>
                {i === 0 && <span title="מארח">👑</span>}
                {p.isMe && <span className="text-xs text-cyan-300">אתה</span>}
              </div>
            ))}
          </div>
          {players.length < 2 && <p className="text-sm text-slate-400 mt-3">ממתין לחברים… שלח להם את קוד החדר.</p>}
        </Panel>

        <Panel className="p-4 flex flex-col gap-3">
          <h3 className="font-black">{amHost ? 'אתה המארח — בחר מסלול' : 'המסלול שהמארח בחר'}</h3>
          <div className="grid grid-cols-3 gap-2">
            {TRACK_LIST.map((t) => (
              <button
                key={t.id}
                disabled={!amHost}
                onClick={() => setTrack(t.id)}
                className={`rounded-xl overflow-hidden border-2 text-center ${shown.track === t.id ? 'border-cyan-300' : 'border-white/10'} ${amHost ? '' : 'cursor-default'}`}
              >
                <div className="h-12 flex items-center justify-center text-2xl" style={{ background: TRACK_GRADIENT[t.id] }}>{t.emoji}</div>
                <div className="text-xs p-1 bg-slate-900/80">{t.nameHe}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm">הקפות:</span>
            {[1, 3, 5].map((n) => (
              <Button key={n} size="sm" disabled={!amHost} variant={shown.laps === n ? 'neon' : 'ghost'} onClick={() => setLaps(n)}>{n}</Button>
            ))}
          </div>
          {amHost ? (
            <Button variant="neon" size="lg" className="animate-glow" data-testid="online-start" disabled={players.length < 2} onClick={start}>
              🏁 התחל מירוץ ({Math.min(players.length, MAX_ONLINE_PLAYERS)} נהגים)
            </Button>
          ) : (
            <div className="text-center text-sky-200 py-2">ממתין שהמארח יתחיל את המירוץ ב{TRACKS[shown.track].nameHe}…</div>
          )}
          {raceRunningWithoutMe && <div className="text-sm text-amber-300 text-center">מירוץ כבר בעיצומו — תצטרף למירוץ הבא.</div>}
        </Panel>
      </div>
    </>
  );
}
