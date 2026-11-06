import type { RapierRigidBody } from '@react-three/rapier';
import type { DriveInput } from '../input/input';
import type { RacerRuntime } from '../race/raceRuntime';
import { lateralOffset, nearestIndex, type TrackData } from '../track/trackData';

/**
 * Arcade truck dynamics on top of Rapier. Rapier owns the rigid body
 * (gravity, ramps, truck-to-truck and wall collisions); each fixed step we
 * read its velocity back, project onto the truck's heading, and apply
 * engine / brake / grip forces. Collisions therefore naturally cost speed.
 */
export const NITRO_SPEED = 1.3;
export const NITRO_ACCEL = 1.9;

// must match the kicker profile in Track.tsx
export const RAMP = { start: -9, lip: 0, end: 0.8, height: 1.9, halfWidth: 5.5 };

/** If the truck is on a ramp face, returns the vertical speed the slope imposes. */
function rampLift(track: TrackData, x: number, y: number, z: number, fwdSpeed: number): number {
  for (const ri of track.ramps) {
    const p = track.points[ri];
    if (Math.abs(p.x - x) > 14 || Math.abs(p.z - z) > 14) continue;
    const t = track.tangents[ri];
    const r = track.rights[ri];
    const lz = (x - p.x) * t.x + (z - p.z) * t.z;
    const lx = (x - p.x) * r.x + (z - p.z) * r.z;
    if (Math.abs(lx) > RAMP.halfWidth || lz < RAMP.start || lz > RAMP.lip) continue;
    const slope = RAMP.height / (RAMP.lip - RAMP.start);
    const h = (lz - RAMP.start) * slope;
    if (y > h + 0.6) continue;
    return Math.max(0, fwdSpeed) * slope * 1.6;
  }
  return 0;
}

export function yawOf(body: RapierRigidBody) {
  const q = body.rotation();
  // rotation is locked to Y, so the quaternion is (0, sin(y/2), 0, cos(y/2))
  return 2 * Math.atan2(q.y, q.w);
}

export function stepVehicle(r: RacerRuntime, input: DriveInput, dt: number, track: TrackData, controlEnabled: boolean) {
  const body = r.body;
  if (!body) return;
  const st = r.stats;
  const t = body.translation();
  const v = body.linvel();
  const yaw = yawOf(body);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -Math.cos(yaw), rz = Math.sin(yaw); // driver's right
  let fwd = v.x * fx + v.z * fz;
  let lat = v.x * rx + v.z * rz;

  // ground detection: low height and small vertical speed (ramps top out ~1.6m)
  const lift = track.ramps.length ? rampLift(track, t.x, t.y, t.z, fwd) : 0;
  let vy = v.y;
  if (lift > 0) vy = Math.max(vy, lift);
  const grounded = lift > 0 || t.y < 0.3 || Math.abs(v.y) < 0.8;
  r.airborne = !grounded;

  // track position
  r.idx = nearestIndex(track, t.x, t.z, r.idx);
  const off = lateralOffset(track, r.idx, t.x, t.z);
  r.offroad = Math.abs(off) > track.halfWidth + 0.5;

  // nitro always counts as full throttle (kids often hold only the 🔥 button)
  const throttle = controlEnabled && (input.throttle || input.nitro);
  const brake = controlEnabled && input.brake;
  const steerIn = controlEnabled ? (input.steer ?? (input.left ? 1 : 0) - (input.right ? 1 : 0)) : 0;

  // nitro
  const wantNitro = controlEnabled && input.nitro && r.nitro > 0.05 && fwd > 3;
  r.nitroActive = wantNitro;
  if (wantNitro) {
    r.nitro = Math.max(0, r.nitro - dt);
    r.nitroUsed += dt;
  } else {
    r.nitro = Math.min(st.nitroCapacity, r.nitro + dt * st.nitroCapacity / 22);
  }

  let maxSpeed = st.maxSpeed * (r.nitroActive ? NITRO_SPEED : 1);
  if (r.offroad) maxSpeed *= 0.55 + 0.4 * st.offroad;

  if (grounded) {
    if (throttle) {
      if (fwd < -0.5) fwd += 22 * dt;
      else {
        const ratio = Math.max(0, fwd) / maxSpeed;
        fwd += st.accel * (r.nitroActive ? NITRO_ACCEL : 1) * Math.max(0.08, 1 - ratio * ratio) * dt;
      }
    } else if (brake) {
      if (fwd > 0.5) fwd -= 24 * dt;
      else fwd = Math.max(-11, fwd - 7 * dt);
    } else {
      const drag = 2.2 + 0.004 * fwd * fwd;
      fwd = Math.abs(fwd) < drag * dt ? 0 : fwd - Math.sign(fwd) * drag * dt;
    }
    if (fwd > maxSpeed) fwd = Math.max(maxSpeed, fwd - 10 * dt);

    // lateral grip (lower grip = slight slide, feels like a heavy truck)
    const grip = r.offroad ? 5 : 8.5;
    lat *= Math.exp(-grip * dt);
  }

  // steering (smoothed so keyboard input isn't twitchy)
  const steerRate = input.steer !== undefined ? 10 : steerIn === 0 ? 7 : 4.5;
  r.steer += (steerIn - r.steer) * Math.min(1, steerRate * dt);
  const speedAbs = Math.abs(fwd);
  const lowSpeedFactor = Math.min(1, speedAbs / 5);
  const highSpeedFactor = 1 - 0.38 * Math.min(1, speedAbs / st.maxSpeed);
  let yawRate = r.steer * st.handling * lowSpeedFactor * highSpeedFactor * Math.sign(fwd || 1);
  if (!grounded) yawRate *= 0.3;

  body.setLinvel({ x: fx * fwd + rx * lat, y: vy, z: fz * fwd + rz * lat }, true);
  body.setAngvel({ x: 0, y: yawRate, z: 0 }, true);

  r.speed = fwd;
  r.throttle = throttle;
  r.braking = brake && fwd > 1;
  r.slip = Math.min(1, Math.abs(lat) / 6 + (r.offroad ? 0 : Math.abs(r.steer) * Math.max(0, speedAbs - 18) / 40));
  updateGearbox(r, dt);
  r.x = t.x;
  r.y = t.y;
  r.z = t.z;
  r.yaw = yaw;
  const tan = track.tangents[r.idx];
  r.wrongWay = fx * tan.x + fz * tan.z < -0.4 && fwd > 4;
}

/** Place a truck back on the track centre line facing forward. */
export function respawnAt(r: RacerRuntime, track: TrackData, idx: number, lane = 0) {
  const body = r.body;
  if (!body) return;
  const p = track.points[idx];
  const rr = track.rights[idx];
  const tn = track.tangents[idx];
  const yaw = Math.atan2(tn.x, tn.z);
  body.setTranslation({ x: p.x + rr.x * lane, y: 1.0, z: p.z + rr.z * lane }, true);
  body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  body.setLinvel({ x: tn.x * 8, y: 0, z: tn.z * 8 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  r.idx = idx;
  r.steer = 0;
  r.stuckTimer = 0;
}

// ---------------------------------------------------------------------------
// 8-speed truck gearbox: drives engine RPM for the sound and the tachometer.
export const IDLE_RPM = 650;
export const SHIFT_UP_RPM = 2050;
export const RED_RPM = 2300;
const GEAR_TOP = [0.13, 0.21, 0.31, 0.43, 0.56, 0.7, 0.85, 1.02]; // fraction of top speed each gear reaches at red line

export function updateGearbox(r: RacerRuntime, dt: number) {
  const vmax = r.stats.maxSpeed * 1.3;
  const v = Math.abs(r.speed);
  if (r.speed < -0.5) {
    r.gear = 0;
  } else if (r.gear === 0) {
    r.gear = 1;
  }
  const g = Math.max(1, r.gear);
  const topV = GEAR_TOP[g - 1] * vmax;
  let target = IDLE_RPM + (v / topV) * (RED_RPM - IDLE_RPM);
  if (r.gear === 0) target = IDLE_RPM + (v / (0.12 * vmax)) * (RED_RPM - IDLE_RPM);
  if (r.throttle && v < 2) target = Math.max(target, 1100); // pulling away
  if (r.shiftTimer > 0) {
    r.shiftTimer -= dt;
  } else if (r.gear > 0) {
    if (target > SHIFT_UP_RPM && r.gear < 8 && r.throttle) {
      r.gear++;
      r.shiftTimer = 0.32;
    } else if (r.gear > 1 && target < 1050) {
      r.gear--;
      r.shiftTimer = 0.2;
    }
  }
  const blend = r.shiftTimer > 0 ? 6 : 12;
  r.rpm += (Math.min(RED_RPM, Math.max(IDLE_RPM, target)) - r.rpm) * Math.min(1, blend * dt);
}
