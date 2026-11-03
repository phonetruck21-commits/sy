import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { race } from '../game/race/raceRuntime';
import { readPlayers, useOnline } from './onlineStore';
import type { OnlineRaceInfo } from '../store/gameStore';

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Bridges the race simulation and the room: publishes our truck ~20×/s,
 * applies the other players' trucks, and runs the synchronized start
 * (everyone loaded → first racer in the grid order says "go").
 */
export function OnlineSync({ info, ready, onGo }: { info: OnlineRaceInfo; ready: boolean; onGo: () => void }) {
  const lastSend = useRef(0);
  const lastPresence = useRef(new Map<string, unknown>());
  const readySince = useRef<number | null>(null);
  const goSent = useRef(false);
  const started = useRef(false);

  useFrame(() => {
    const { room, setPresence } = useOnline.getState();
    if (!room) return;
    const now = performance.now();
    const peers = room.peers();
    const players = readPlayers(peers);
    const byPeer = new Map(players.map((p) => [p.peer, p]));

    // other players' trucks
    for (const r of race.racers) {
      if (!r.remote) continue;
      const peer = r.id.slice(4);
      const p = byPeer.get(peer);
      if (!p) {
        if (started.current) r.gone = true;
        continue;
      }
      r.gone = false;
      const raw = peers.find((x) => x.peer === peer)?.presence;
      if (raw === lastPresence.current.get(peer)) continue;
      lastPresence.current.set(peer, raw);
      const c = p.car;
      if (!c || c.id !== info.raceId) continue;
      r.net = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, sp: c.sp, recv: now };
      r.speed = c.sp;
      r.total = c.tot;
      r.lapsDone = c.lap;
      r.nitroActive = c.ni;
      if (c.fin && !r.finished) {
        r.finished = true;
        r.finishTime = c.ft;
      }
    }

    // synchronized start
    if (ready && !started.current) {
      if (readySince.current == null) readySince.current = now;
      const inRace = info.order.map((peer) => byPeer.get(peer)).filter((p) => !!p);
      if (players.some((p) => p.go === info.raceId)) {
        started.current = true;
        onGo();
      } else if (!goSent.current && inRace[0]?.isMe) {
        const allLoaded = inRace.every((p) => p!.loaded === info.raceId);
        if (allLoaded || now - readySince.current > 15000) {
          goSent.current = true;
          setPresence({ go: info.raceId });
        }
      }
    }

    // publish our own truck
    const me = race.racers.find((r) => r.isPlayer);
    if (me && now - lastSend.current > 50) {
      lastSend.current = now;
      setPresence({
        car: { id: info.raceId, x: r2(me.x), y: r2(me.y), z: r2(me.z), yaw: r2(me.yaw), sp: r2(me.speed), tot: me.total, lap: me.lapsDone, fin: me.finished, ft: r2(me.finishTime), ni: me.nitroActive },
      });
    }
  });
  return null;
}
