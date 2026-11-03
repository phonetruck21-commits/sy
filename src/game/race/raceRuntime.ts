import type { RapierRigidBody } from '@react-three/rapier';
import type { TrackData } from '../track/trackData';
import type { CameraMode, TruckStats } from '../../types';

/**
 * Per-frame race state lives here (outside React) so the simulation never
 * triggers React re-renders. UI polls it at a low rate.
 * A future multiplayer layer (see src/net) would write remote racers' state here.
 */
export interface RacerRuntime {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  body: RapierRigidBody | null;
  stats: TruckStats;
  idx: number;
  total: number; // progress in samples since race start (negative before the start line)
  lapsDone: number;
  lapStartTime: number;
  lapTimes: number[];
  bestLap: number | null;
  finished: boolean;
  finishTime: number;
  speed: number; // signed forward speed m/s
  nitro: number; // seconds remaining
  nitroActive: boolean;
  nitroUsed: number;
  offroad: boolean;
  wrongWay: boolean;
  airborne: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  steer: number; // smoothed steering -1..1
  position: number; // race rank 1..n
  stuckTimer: number;
  lastCheckTotal: number;
  respawnRequested: boolean;
  shake: number; // camera shake impulse (player)
  /** online: another human, driven by network state instead of physics */
  remote: boolean;
  net: { x: number; y: number; z: number; yaw: number; sp: number; recv: number } | null;
  gone: boolean; // remote player left the room
}

export type RacePhase = 'loading' | 'countdown' | 'racing' | 'finished';

export interface RaceRuntime {
  phase: RacePhase;
  time: number; // race clock (seconds since GO)
  countdown: number; // seconds remaining before GO
  laps: number;
  track: TrackData | null;
  racers: RacerRuntime[];
  paused: boolean;
  camera: CameraMode;
  playerFinishedAt: number | null;
  online: boolean;
}

export const race: RaceRuntime = {
  phase: 'loading',
  time: 0,
  countdown: 0,
  laps: 3,
  track: null,
  racers: [],
  paused: false,
  camera: 'chase',
  playerFinishedAt: null,
  online: false,
};

export function resetRace(track: TrackData, laps: number, camera: CameraMode) {
  race.phase = 'loading';
  race.time = 0;
  race.countdown = 4;
  race.laps = laps;
  race.track = track;
  race.racers = [];
  race.paused = false;
  race.camera = camera;
  race.playerFinishedAt = null;
  race.online = false;
}

export function createRacer(p: { id: string; name: string; isPlayer: boolean; color: string; stats: TruckStats; idx: number; total: number }): RacerRuntime {
  return {
    ...p,
    body: null,
    lapsDone: 0,
    lapStartTime: 0,
    lapTimes: [],
    bestLap: null,
    finished: false,
    finishTime: 0,
    speed: 0,
    nitro: p.stats.nitroCapacity,
    nitroActive: false,
    nitroUsed: 0,
    offroad: false,
    wrongWay: false,
    airborne: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    steer: 0,
    position: 0,
    stuckTimer: 0,
    lastCheckTotal: p.total,
    respawnRequested: false,
    shake: 0,
    remote: false,
    net: null,
    gone: false,
  };
}

export const getPlayer = () => race.racers.find((r) => r.isPlayer) ?? null;
