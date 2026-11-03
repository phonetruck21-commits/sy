import type { DriveInput } from '../input/input';
import type { RacerRuntime } from '../race/raceRuntime';
import { wrapIndex, type TrackData } from '../track/trackData';

export interface AIProfile {
  skill: number; // multiplier on target speed
  aggression: number; // nitro usage tendency
  lane: number; // preferred lateral offset (m)
  rubberBand: number; // 0..1 strength of catch-up
}

export interface AIState {
  profile: AIProfile;
  laneOffset: number;
  laneTimer: number;
  nitroTimer: number;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Produces driving input for an AI racer following the racing line. */
export function aiThink(r: RacerRuntime, ai: AIState, track: TrackData, all: RacerRuntime[], player: RacerRuntime | null, dt: number): DriveInput {
  const n = track.count;
  const speed = Math.max(0, r.speed);
  const sp = track.spacing;

  // occasional lane changes + avoidance of trucks right ahead
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTimer = 3 + Math.random() * 4;
    ai.profile.lane = (Math.random() * 2 - 1) * (track.halfWidth - 3);
  }
  let targetLane = ai.profile.lane;
  for (const o of all) {
    if (o === r) continue;
    const dx = o.x - r.x, dz = o.z - r.z;
    const ahead = dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw);
    const side = dx * -Math.cos(r.yaw) + dz * Math.sin(r.yaw);
    if (ahead > 2 && ahead < 16 && Math.abs(side) < 3.2) {
      targetLane = side > 0 ? -track.halfWidth * 0.55 : track.halfWidth * 0.55;
      break;
    }
  }
  ai.laneOffset += (targetLane - ai.laneOffset) * Math.min(1, dt * 1.2);

  // steer towards a look-ahead point
  const look = Math.round((9 + speed * 0.75) / sp);
  const li = wrapIndex(r.idx + look, n);
  const p = track.points[li];
  const rt = track.rights[li];
  const tx = p.x + rt.x * ai.laneOffset;
  const tz = p.z + rt.z * ai.laneOffset;
  const desired = Math.atan2(tx - r.x, tz - r.z);
  const diff = wrapAngle(desired - r.yaw);
  const steer = Math.max(-1, Math.min(1, diff * 3.2));

  // target speed from upcoming curvature
  let maxCurv = 0;
  const horizon = Math.round((25 + speed * 1.6) / sp);
  for (let k = 2; k < horizon; k += 3) maxCurv = Math.max(maxCurv, track.curvature[wrapIndex(r.idx + k, n)]);
  const cornerSpeed = Math.sqrt(9.5 / Math.max(maxCurv, 0.002)); // lateral accel budget
  let targetSpeed = Math.min(r.stats.maxSpeed * ai.profile.skill, cornerSpeed);

  // rubber banding keeps races close
  if (player) {
    const gap = ((r.total - player.total) * sp);
    if (gap > 60) targetSpeed *= 1 - Math.min(0.12, (gap - 60) / 800) * ai.profile.rubberBand;
    else if (gap < -60) targetSpeed *= 1 + Math.min(0.1, (-gap - 60) / 800) * ai.profile.rubberBand;
  }
  targetSpeed = Math.max(11, targetSpeed);

  // nitro on straights
  ai.nitroTimer -= dt;
  let nitro = false;
  if (maxCurv < 0.012 && r.nitro > 1 && speed > 15) {
    if (ai.nitroTimer <= 0) {
      ai.nitroTimer = 1 + Math.random() * 3;
      nitro = Math.random() < ai.profile.aggression;
    } else nitro = r.nitroActive;
  }

  return {
    throttle: speed < targetSpeed,
    brake: speed > targetSpeed + 4,
    left: steer > 0.08,
    right: steer < -0.08,
    nitro,
    steer,
  };
}
