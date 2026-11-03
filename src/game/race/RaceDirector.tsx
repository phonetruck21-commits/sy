import { useRef } from 'react';
import { useAfterPhysicsStep } from '@react-three/rapier';
import { getPlayer, race, type RacerRuntime } from './raceRuntime';
import { respawnAt } from '../vehicle/vehiclePhysics';
import { audio } from '../audio/audio';
import { wrapIndex } from '../track/trackData';

/**
 * Owns the race clock, countdown, lap counting, standings and respawns.
 * Runs on the fixed physics step so race timing is exact regardless of FPS.
 * Calls onFinish once the player has crossed the line (plus a short delay).
 * Must be mounted inside <Physics>.
 */
export function RaceDirector({ onFinish }: { onFinish: () => void }) {
  const lastIdx = useRef(new Map<string, number>());
  const lastBeep = useRef(99);
  const finishSent = useRef(false);

  useAfterPhysicsStep((world) => {
    const track = race.track;
    if (!track || race.paused || race.phase === 'loading') return;
    const dt = world.timestep;
    const n = track.count;

    if (race.phase === 'countdown') {
      race.countdown -= dt;
      const c = Math.ceil(race.countdown);
      if (c !== lastBeep.current && c <= 3 && c >= 1) {
        lastBeep.current = c;
        audio.beep(false);
      }
      if (race.countdown <= 0) {
        race.phase = 'racing';
        race.time = 0;
        audio.beep(true);
      }
    } else {
      race.time += dt;
    }

    // progress + laps
    for (const r of race.racers) {
      if (r.remote) continue; // progress of other humans comes from the network
      if (!r.body) continue;
      const prev = lastIdx.current.get(r.id);
      if (prev !== undefined) {
        let d = r.idx - prev;
        if (d < -n / 2) d += n;
        if (d > n / 2) d -= n;
        r.total += d;
      }
      lastIdx.current.set(r.id, r.idx);
      if (race.phase === 'countdown') continue;
      const completed = Math.floor(r.total / n);
      while (!r.finished && completed > r.lapsDone) {
        const lt = race.time - r.lapStartTime;
        r.lapTimes.push(lt);
        r.bestLap = r.bestLap == null ? lt : Math.min(r.bestLap, lt);
        r.lapStartTime = race.time;
        r.lapsDone++;
        if (r.lapsDone >= race.laps) {
          r.finished = true;
          r.finishTime = race.time;
        }
      }

      // falling out of the world / stuck detection
      const t = r.body.translation();
      if (t.y < -5) respawnAt(r, track, wrapIndex(r.idx, n));
      if (r.respawnRequested) {
        r.respawnRequested = false;
        respawnAt(r, track, wrapIndex(r.idx + 2, n));
      }
      r.stuckTimer += dt;
      if (r.stuckTimer > 3.5) {
        const progressed = r.total - r.lastCheckTotal;
        r.lastCheckTotal = r.total;
        r.stuckTimer = 0;
        if (progressed < 3 && (!r.isPlayer || r.finished)) {
          respawnAt(r, track, wrapIndex(r.idx + 3, n), (Math.random() - 0.5) * 6);
        }
      }
    }

    // standings
    const sorted = [...race.racers].sort(compareRacers);
    sorted.forEach((r, i) => (r.position = i + 1));

    const player = getPlayer();
    if (player) {
      audio.updateEngine(Math.max(0, player.speed) / player.stats.maxSpeed, player.speed > 1 || race.phase === 'countdown', player.nitroActive);
      if (player.finished && race.phase === 'racing') {
        race.phase = 'finished';
        race.playerFinishedAt = race.time;
      }
      const sinceFinish = race.time - (race.playerFinishedAt ?? 0);
      // online: wait (up to 45 s) for the other humans to cross the line too
      const othersDone = !race.online || race.racers.every((r) => !r.remote || r.finished || r.gone);
      if (race.phase === 'finished' && !finishSent.current && sinceFinish > 3 && (othersDone || sinceFinish > 45)) {
        finishSent.current = true;
        onFinish();
      }
    }
  });
  return null;
}

export function compareRacers(a: RacerRuntime, b: RacerRuntime) {
  if (a.finished && b.finished) return a.finishTime - b.finishTime;
  if (a.finished) return -1;
  if (b.finished) return 1;
  return b.total - a.total;
}
