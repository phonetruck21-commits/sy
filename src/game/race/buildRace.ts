import { TRACKS, RACE_COINS } from '../../data/tracks';
import { TRUCKS, applyUpgrades } from '../../data/trucks';
import { OPPONENTS } from '../../data/opponents';
import type { Difficulty, RaceResult, TruckDesign } from '../../types';
import type { RaceConfig } from '../../store/gameStore';
import { getTrackData, wrapIndex } from '../track/trackData';
import { createRacer, race, resetRace } from './raceRuntime';
import type { RacerSetup } from './RaceScene';
import { compareRacers } from './RaceDirector';
import type { TruckId, UpgradeKey, CameraMode } from '../../types';
import { designFromLook } from '../../net/onlineRace';

export const DIFFICULTY: Record<Difficulty, { speed: number; rubber: number; corner: number; handling: number; nitro: number; coins: number; nameHe: string }> = {
  easy: { speed: 0.92, rubber: 0.8, corner: 12, handling: 1.6, nitro: 0.4, coins: 0.7, nameHe: 'קל' },
  normal: { speed: 1.0, rubber: 0.5, corner: 17, handling: 1.75, nitro: 0.7, coins: 1, nameHe: 'רגיל' },
  hard: { speed: 1.07, rubber: 0.25, corner: 21, handling: 1.9, nitro: 0.9, coins: 1.5, nameHe: 'קשה' },
  expert: { speed: 1.13, rubber: 0.1, corner: 25, handling: 2.05, nitro: 1, coins: 2, nameHe: 'מומחה' },
};

export interface ProfileSnapshot {
  playerName: string;
  selectedTruck: TruckId;
  upgrades: Record<TruckId, Record<UpgradeKey, number>>;
  design: TruckDesign;
  difficulty: Difficulty;
  camera: CameraMode;
}

export function buildRace(cfg: RaceConfig, p: ProfileSnapshot) {
  const track = getTrackData(TRACKS[cfg.trackId]);
  resetRace(track, cfg.laps, p.camera);
  const diff = DIFFICULTY[p.difficulty];
  const truck = TRUCKS[p.selectedTruck];
  const playerStats = applyUpgrades(truck.stats, p.upgrades[p.selectedTruck]);

  if (cfg.online) return buildOnline(cfg, p, track, playerStats);
  if (cfg.mode === 'explore') {
    // free roam: just you, no laps to finish
    race.laps = 9999;
    const { idx, lateral, spawn } = gridSpawn(track, 0);
    const runtime = createRacer({ id: 'player', name: p.playerName || 'אתה', isPlayer: true, color: '#35e0ff', stats: playerStats, idx, total: idx - track.count });
    const ai = { profile: { skill: 0.98, aggression: 0.5, lane: lateral, rubberBand: 0, cornerGrip: 17 }, laneOffset: lateral, laneTimer: 2, nitroTimer: 0 };
    const setups: RacerSetup[] = [{ runtime, design: p.design, model: truck.model, ai, spawn }];
    race.racers = setups.map((s) => s.runtime);
    return { track, setups };
  }

  const ais = [...OPPONENTS].sort((a, b) => b.skill - a.skill);
  const order: ('player' | (typeof OPPONENTS)[number])[] = [...ais];
  order.splice(4, 0, 'player');

  const n = track.count;
  const setups: RacerSetup[] = order.map((o, k) => {
    const row = Math.floor(k / 2);
    const col = k % 2;
    const idx = wrapIndex(n - 7 - row * 6, n);
    const lateral = col ? 4.5 : -4.5;
    const pt = track.points[idx];
    const rt = track.rights[idx];
    const tn = track.tangents[idx];
    const spawn = { x: pt.x + rt.x * lateral, z: pt.z + rt.z * lateral, yaw: Math.atan2(tn.x, tn.z) };
    if (o === 'player') {
      const runtime = createRacer({ id: 'player', name: p.playerName || 'אתה', isPlayer: true, color: '#35e0ff', stats: playerStats, idx, total: idx - n });
      return {
        runtime,
        design: p.design,
        model: truck.model,
        ai: { profile: { skill: 0.98, aggression: 0.5, lane: lateral, rubberBand: 0, cornerGrip: 17 }, laneOffset: lateral, laneTimer: 2, nitroTimer: 0 },
        spawn,
      };
    }
    const modelTruck = o.id === 'ai1' ? TRUCKS.hauler : o.id === 'ai4' ? TRUCKS.phantom : TRUCKS.atleon;
    const stats = { maxSpeed: 33.5 * diff.speed, accel: 10.5 * diff.speed, handling: diff.handling, nitroCapacity: 4 + diff.nitro, mass: 1, offroad: 0.6 };
    const runtime = createRacer({ id: o.id, name: o.name, isPlayer: false, color: o.design.cabColor === '#222222' ? '#e8b84a' : o.design.cabColor, stats, idx, total: idx - n });
    return {
      runtime,
      design: o.design,
      model: modelTruck.model,
      ai: { profile: { skill: o.skill, aggression: Math.min(1, o.aggression * 0.5 + diff.nitro * 0.6), lane: lateral, rubberBand: diff.rubber, cornerGrip: diff.corner * (0.94 + o.skill * 0.06) }, laneOffset: lateral, laneTimer: 1 + Math.random() * 2, nitroTimer: 2 },
      spawn,
    };
  });
  race.racers = setups.map((s) => s.runtime);
  return { track, setups };
}

function gridSpawn(track: ReturnType<typeof getTrackData>, k: number) {
  const n = track.count;
  const row = Math.floor(k / 2);
  const col = k % 2;
  const idx = wrapIndex(n - 7 - row * 6, n);
  const lateral = col ? 4.5 : -4.5;
  const pt = track.points[idx];
  const rt = track.rights[idx];
  const tn = track.tangents[idx];
  return { idx, lateral, spawn: { x: pt.x + rt.x * lateral, z: pt.z + rt.z * lateral, yaw: Math.atan2(tn.x, tn.z) } };
}

/** Online race: only humans. Our own truck is simulated here, the others come from the network. */
function buildOnline(cfg: RaceConfig, p: ProfileSnapshot, track: ReturnType<typeof getTrackData>, playerStats: ReturnType<typeof applyUpgrades>) {
  const info = cfg.online!;
  const n = track.count;
  const truck = TRUCKS[p.selectedTruck];
  const setups: RacerSetup[] = info.order.map((peer, k) => {
    const { idx, lateral, spawn } = gridSpawn(track, k);
    const ai = { profile: { skill: 0.98, aggression: 0.5, lane: lateral, rubberBand: 0, cornerGrip: 17 }, laneOffset: lateral, laneTimer: 2, nitroTimer: 0 };
    if (peer === info.myPeer) {
      const runtime = createRacer({ id: 'player', name: p.playerName || 'אתה', isPlayer: true, color: '#35e0ff', stats: playerStats, idx, total: idx - n });
      return { runtime, design: p.design, model: truck.model, ai, spawn };
    }
    const pl = info.players[peer] ?? { name: 'נהג', look: { c: '#f4f6f8', b: '#f4f6f8', a: '#1e7bff', t: 'tech-blue' as const, n: 'TRUCK' }, truck: 'atleon' as TruckId };
    const runtime = createRacer({ id: `net-${peer}`, name: pl.name, isPlayer: false, color: pl.look.c === '#f4f6f8' ? pl.look.a : pl.look.c, stats: TRUCKS[pl.truck].stats, idx, total: idx - n });
    runtime.remote = true;
    runtime.x = spawn.x;
    runtime.z = spawn.z;
    runtime.yaw = spawn.yaw;
    return { runtime, design: designFromLook(runtime.id, pl.look), model: TRUCKS[pl.truck].model, ai, spawn, remote: true };
  });
  race.racers = setups.map((s) => s.runtime);
  return { track, setups };
}

/** Build the final standings once the player has finished. */
export function computeResult(cfg: RaceConfig, difficulty: Difficulty): RaceResult {
  const sorted = [...race.racers].sort(compareRacers);
  const n = race.track!.count;
  const entries = sorted.map((r, i) => {
    let time = r.finishTime;
    if (!r.finished) {
      const covered = Math.max(1, r.total) * race.track!.spacing;
      const avg = covered / Math.max(1, race.time);
      const remaining = (race.laps * n - r.total) * race.track!.spacing;
      time = race.time + remaining / Math.max(5, avg);
    }
    return { id: r.id, name: r.name, isPlayer: r.isPlayer, position: i + 1, finished: r.finished, time, bestLap: r.bestLap, color: r.color };
  });
  // estimated times must stay in finishing order
  for (let i = 1; i < entries.length; i++) if (entries[i].time < entries[i - 1].time) entries[i].time = entries[i - 1].time + 0.5;
  const player = entries.find((e) => e.isPlayer)!;
  const coins = Math.round((RACE_COINS[player.position - 1] ?? 0) * DIFFICULTY[difficulty].coins * (cfg.laps / 3));
  return { trackId: cfg.trackId, entries, playerPosition: player.position, coinsEarned: coins, newAchievements: [], bestLapRecord: false };
}
