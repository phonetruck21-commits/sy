import { useEffect, useMemo, useRef, useState } from 'react';
import { race } from '../../game/race/raceRuntime';
import { compareRacers } from '../../game/race/RaceDirector';
import type { TrackData } from '../../game/track/trackData';
import { formatTime } from '../../utils/random';
import type { Pickup } from '../../game/race/pickups';
import { usePickupFx } from '../../game/race/pickups';
import { MoneyFx } from './MoneyFx';
import { BigMap } from './BigMap';

interface Snapshot {
  phase: typeof race.phase;
  countdown: number;
  time: number;
  speed: number;
  position: number;
  total: number;
  lap: number;
  laps: number;
  lapTime: number;
  bestLap: number | null;
  nitro: number;
  nitroActive: boolean;
  gear: number;
  rpm: number;
  shifting: boolean;
  wrongWay: boolean;
  offroad: boolean;
  me: { x: number; z: number; idx: number };
  dots: { id: string; x: number; z: number; color: string; player: boolean }[];
  board: { id: string; name: string; player: boolean; finished: boolean; color: string }[];
}

function snapshot(): Snapshot | null {
  const p = race.racers.find((r) => r.isPlayer);
  if (!p) return null;
  const sorted = [...race.racers].sort(compareRacers);
  return {
    phase: race.phase,
    countdown: race.countdown,
    time: race.time,
    speed: Math.round(Math.abs(p.speed) * 3.6),
    position: p.position || race.racers.length,
    total: race.racers.length,
    lap: Math.min(race.laps, p.lapsDone + 1),
    laps: race.laps,
    lapTime: race.phase === 'countdown' ? 0 : race.time - p.lapStartTime,
    bestLap: p.bestLap,
    nitro: p.nitro / p.stats.nitroCapacity,
    gear: p.gear,
    rpm: p.rpm,
    shifting: p.shiftTimer > 0,
    nitroActive: p.nitroActive,
    wrongWay: p.wrongWay,
    offroad: p.offroad,
    me: { x: p.x, z: p.z, idx: p.idx },
    dots: race.racers.map((r) => ({ id: r.id, x: r.x, z: r.z, color: r.color, player: r.isPlayer })),
    board: sorted.map((r) => ({ id: r.id, name: r.name, player: r.isPlayer, finished: r.finished, color: r.color })),
  };
}

export function useRaceSnapshot(hz = 12) {
  const [s, setS] = useState<Snapshot | null>(null);
  useEffect(() => {
    const id = setInterval(() => setS(snapshot()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return s;
}

function Minimap({ track, dots, stash }: { track: TrackData; dots: Snapshot['dots']; stash?: Pickup | null }) {
  const { path, view } = useMemo(() => {
    const b = track.bounds;
    const pad = 20;
    const pts = track.points.filter((_, i) => i % 3 === 0).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ');
    return { path: pts, view: `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}` };
  }, [track]);
  const s = track.points[0];
  return (
    <svg viewBox={view} className="w-28 h-28 md:w-40 md:h-40 short:w-24 short:h-24">
      <polygon points={path} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={22} strokeLinejoin="round" />
      <polygon points={path} fill="none" stroke="rgba(160,210,255,0.85)" strokeWidth={10} strokeLinejoin="round" />
      <circle cx={s.x} cy={s.z} r={9} fill="#fff" stroke="#000" strokeWidth={3} />
      {stash && <circle cx={stash.x} cy={stash.z} r={13} fill="#b44dff" stroke="#fff" strokeWidth={3} />}
      {dots.filter((d) => !d.player).map((d) => <circle key={d.id} cx={d.x} cy={d.z} r={11} fill={d.color} stroke="#000" strokeWidth={3} />)}
      {dots.filter((d) => d.player).map((d) => <circle key={d.id} cx={d.x} cy={d.z} r={16} fill="#35e0ff" stroke="#fff" strokeWidth={5} />)}
    </svg>
  );
}

export function HUD({ track, onPause, onCamera, explore = false, pickups = [], touch = false }: { track: TrackData; onPause: () => void; onCamera: () => void; explore?: boolean; pickups?: Pickup[]; touch?: boolean }) {
  const s = useRaceSnapshot();
  const [mapOpen, setMapOpen] = useState(false);
  const collected = usePickupFx((x) => x.total);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyM' && !e.repeat) setMapOpen((v) => !v);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const stashPickup = pickups.find((p) => p.kind === 'stash' && p.takenAt == null) ?? null;
  const [goFlash, setGoFlash] = useState(false);
  const slowSince = useRef<number | null>(null);
  let stuck = false;
  if (s && s.phase === 'racing' && s.time > 4 && s.speed < 6) {
    if (slowSince.current == null) slowSince.current = s.time;
    stuck = s.time - slowSince.current > 3;
  } else slowSince.current = null;
  useEffect(() => {
    if (s?.phase === 'racing' && s.time < 1.2) setGoFlash(true);
    else if (goFlash && s && s.time >= 1.2) setGoFlash(false);
  }, [s, goFlash]);
  if (!s) return null;
  const cd = Math.ceil(s.countdown);
  return (
    <div className="absolute inset-0 pointer-events-none select-none" data-testid="hud">
      {/* top bar */}
      <div className="absolute top-2 right-2 left-2 flex justify-between items-start gap-2">
        {explore ? (
          <div className="flex flex-col gap-2">
            <div className="glass rounded-2xl px-4 py-2">
              <div className="text-xs text-sky-300">מצב</div>
              <div className="text-xl font-black">🗺️ סיור חופשי</div>
            </div>
            <div className="glass rounded-xl px-3 py-1.5 text-sm">נאספו: <b className="text-yellow-300" dir="ltr">🪙 {collected.toLocaleString()}</b></div>
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          <div className="glass rounded-2xl px-4 py-2 flex items-baseline gap-2">
            <span className="text-xs text-sky-300">מיקום</span>
            <span className="text-4xl md:text-5xl font-black neon-text" data-testid="hud-position">{s.position}</span>
            <span className="text-lg text-sky-200">/{s.total}</span>
          </div>
          <div className="glass rounded-xl px-3 py-1.5 hidden sm:block short:hidden">
            {s.board.map((b, i) => (
              <div key={b.id} className={`flex items-center gap-2 text-sm ${b.player ? 'text-cyan-300 font-bold' : 'text-slate-200'}`}>
                <span className="w-4 text-left" dir="ltr">{i + 1}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.player ? '#35e0ff' : b.color }} />
                <span className="truncate max-w-28" dir="auto">{b.name}</span>
                {b.finished && <span>🏁</span>}
              </div>
            ))}
          </div>
        </div>
        )}

        <div className={`flex flex-col items-center gap-2 ${touch ? 'mt-11' : ''}`}>
          {!explore && <div className={`glass rounded-2xl text-center ${touch ? 'px-3 py-0.5 flex items-baseline gap-2' : 'px-4 py-2'}`}>
            <div className="text-xs text-sky-300">הקפה</div>
            <div className={`${touch ? 'text-lg' : 'text-2xl md:text-3xl'} font-black`} data-testid="hud-lap"><span dir="ltr">{s.lap}/{s.laps}</span></div>
          </div>}
          <div className="flex gap-2 pointer-events-auto">
            <button className="glass rounded-xl px-3 py-2 text-lg" onClick={onPause} aria-label="השהיה">⏸</button>
            <button className="glass rounded-xl px-3 py-2 text-lg" onClick={onCamera} aria-label="החלפת מצלמה">🎥</button>
            <button className="glass rounded-xl px-3 py-2 text-lg" onClick={() => setMapOpen(true)} aria-label="מפה" data-testid="open-map">🗺️</button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button className="glass rounded-2xl p-1.5 pointer-events-auto" onClick={() => setMapOpen(true)} aria-label="פתח מפה"><Minimap track={track} dots={s.dots} stash={stashPickup} /></button>
          {!explore && <div className="glass rounded-xl px-3 py-1.5 text-sm text-left" dir="ltr">
            <div>⏱ {formatTime(s.time)}</div>
            <div className="text-sky-300">LAP {formatTime(s.lapTime)}</div>
            <div className="text-emerald-300">BEST {formatTime(s.bestLap)}</div>
          </div>}
        </div>
      </div>

      {/* speedometer + nitro — with touch controls it moves to the top so it never covers the pedals */}
      <div className={touch ? 'absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center' : 'absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center'} data-testid="speedo">
        {touch ? (
          <div className="glass rounded-xl px-3 py-1 flex items-center gap-2" dir="ltr">
            <span className={`text-lg font-black tabular-nums ${s.shifting ? 'text-yellow-300' : 'text-white'}`}>{s.gear === 0 ? 'R' : s.gear}</span>
            <span className="text-2xl font-black tabular-nums neon-text" data-testid="hud-speed">{s.speed}</span>
            <span className="text-[10px] text-sky-300">קמ"ש</span>
            <span className="h-2 w-14 rounded-full bg-slate-800 overflow-hidden">
              <span className={`block h-full ${s.nitroActive ? 'bg-cyan-200' : 'bg-gradient-to-r from-orange-500 to-yellow-300'}`} style={{ width: `${Math.round(s.nitro * 100)}%` }} />
            </span>
          </div>
        ) : (
        <div className="glass rounded-2xl px-5 py-2 text-center min-w-36 short:px-3 short:py-1">
          <div className="flex items-end justify-center gap-3" dir="ltr">
            <div className={`text-2xl md:text-3xl font-black tabular-nums w-9 text-center rounded-md ${s.shifting ? 'text-yellow-300' : 'text-white'}`} title="הילוך">{s.gear === 0 ? 'R' : s.gear}</div>
            <div>
              <div className="text-5xl md:text-6xl short:text-4xl font-black tabular-nums neon-text" data-testid="hud-speed">{s.speed}</div>
              <div className="text-xs text-sky-300 -mt-1">קמ"ש</div>
            </div>
          </div>
          <Tacho rpm={s.rpm} />
          <div className="mt-1.5 h-2.5 w-40 short:w-28 rounded-full bg-slate-800 overflow-hidden" dir="ltr">
            <div className={`h-full ${s.nitroActive ? 'bg-gradient-to-r from-cyan-300 to-white' : 'bg-gradient-to-r from-orange-500 to-yellow-300'}`} style={{ width: `${Math.round(s.nitro * 100)}%` }} />
          </div>
          <div className="text-[10px] text-orange-300 mt-0.5">NITRO</div>
        </div>
        )}
      </div>

      {/* center messages */}
      {s.phase === 'countdown' && cd <= 3 && cd >= 1 && (
        <div key={cd} className="absolute inset-0 flex items-center justify-center">
          <div className="text-[9rem] md:text-[12rem] font-black neon-text animate-pop">{cd}</div>
        </div>
      )}
      {s.phase === 'countdown' && cd > 3 && (
        <div className="absolute inset-x-0 top-1/3 text-center">
          <div className="inline-block glass rounded-2xl px-6 py-3 text-2xl font-black animate-in">היכונו לזינוק!</div>
        </div>
      )}
      {goFlash && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[7rem] md:text-[10rem] font-black text-emerald-300 neon-text animate-pop">GO!</div>
        </div>
      )}
      {s.wrongWay && s.phase === 'racing' && (
        <div className="absolute inset-x-0 top-1/3 text-center">
          <div className="inline-block bg-red-600/90 rounded-2xl px-6 py-3 text-3xl font-black animate-pulse">⚠ כיוון שגוי!</div>
        </div>
      )}
      <MoneyFx />
      {mapOpen && <BigMap track={track} me={s.me} pickups={pickups} onClose={() => setMapOpen(false)} />}
      {!explore && s.phase === 'racing' && s.lap === s.laps && s.lapTime < 2.5 && s.time > 3 && (
        <div className="absolute inset-x-0 top-1/4 text-center">
          <div className="inline-block glass rounded-2xl px-6 py-3 text-3xl font-black text-yellow-300 animate-pop">הקפה אחרונה!</div>
        </div>
      )}
      {stuck && !s.wrongWay && (
        <div className="absolute inset-x-0 top-[42%] text-center">
          <div className="inline-block glass rounded-2xl px-5 py-2 text-lg font-bold animate-in">תקוע? לחץ <b dir="ltr">R</b> או ↺ כדי לחזור למסלול</div>
        </div>
      )}
      {s.phase === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="glass rounded-3xl px-10 py-6 text-center animate-pop">
            <div className="text-6xl">🏁</div>
            <div className="text-4xl font-black neon-text mt-2">סיימת במקום {s.position}!</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Segmented rev counter: idle 650 … red line 2300 RPM. */
function Tacho({ rpm }: { rpm: number }) {
  const segs = 16;
  const lit = Math.round(((rpm - 650) / 1650) * segs);
  return (
    <div className="flex gap-0.5 mt-1 justify-center" dir="ltr" aria-label={`${Math.round(rpm)} סל"ד`}>
      {Array.from({ length: segs }).map((_, i) => (
        <span key={i} className="w-2 h-2.5 rounded-sm" style={{ background: i < lit ? (i >= 13 ? '#ff3b3b' : i >= 10 ? '#ffcc33' : '#35e0ff') : '#1c2433' }} />
      ))}
    </div>
  );
}
