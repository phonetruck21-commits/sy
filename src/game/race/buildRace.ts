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

export const DIFFICULTY: Record<Difficulty, { speed: number; rubber: number; coins: number; nameHe: string }> = {
  easy: { speed: 0.87, rubber: 1, coins: 0.7, nameHe: 'קל' },
  normal: { speed: 0.96, rubber: 0.75, coins: 1, nameHe: 'רגיל' },
  hard: { speed: 1.04, rubber: 0.35, coins: 1.4, nameHe: 'קשה' },
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
        ai: { profile: { skill: 0.98, aggression: 0.5, lane: lateral, rubberBand: 0 }, laneOffset: lateral, laneTimer: 2, nitroTimer: 0 },
        spawn,
      };
    }
    const modelTruck = o.id === 'ai1' ? TRUCKS.hauler : o.id === 'ai4' ? TRUCKS.phantom : TRUCKS.atleon;
    const stats = { maxSpeed: 33 * diff.speed, accel: 9.6 * diff.speed, handling: 1.6, nitroCapacity: 4, mass: 1, offroad: 0.6 };
    const runtime = createRacer({ id: o.id, name: o.name, isPlayer: false, color: o.design.cabColor === '#222222' ? '#e8b84a' : o.design.cabColor, stats, idx, total: idx - n });
    return {
      runtime,
      design: o.design,
      model: modelTruck.model,
      ai: { profile: { skill: o.skill, aggression: o.aggression, lane: lateral, rubberBand: diff.rubber }, laneOffset: lateral, laneTimer: 1 + Math.random() * 2, nitroTimer: 2 },
      spawn,
    };
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
