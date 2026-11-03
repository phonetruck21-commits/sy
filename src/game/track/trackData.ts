import * as THREE from 'three';
import type { TrackDef } from '../../types';

/**
 * Pre-computed track centreline data. Everything in the race (AI, progress,
 * lap counting, scenery placement, respawn) works off these samples.
 */
export interface TrackData {
  def: TrackDef;
  count: number;
  spacing: number; // metres between samples
  length: number;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  rights: THREE.Vector3[]; // points to the driver's right when following the track
  curvature: Float32Array; // absolute heading change per metre (smoothed)
  halfWidth: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  ramps: number[]; // sample indices of ramps
}

const cache = new Map<string, TrackData>();

export function getTrackData(def: TrackDef): TrackData {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const curve = new THREE.CatmullRomCurve3(
    def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const approxLen = curve.getLength();
  const spacing = 2;
  const count = Math.round(approxLen / spacing);
  const points = curve.getSpacedPoints(count).slice(0, count);
  const tangents: THREE.Vector3[] = [];
  const rights: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const a = points[(i - 1 + count) % count];
    const b = points[(i + 1) % count];
    const t = b.clone().sub(a).setY(0).normalize();
    tangents.push(t);
    // right-hand side when facing along t (y up): t x up
    rights.push(t.clone().cross(up).normalize());
  }
  const curvature = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t0 = tangents[i];
    const t1 = tangents[(i + 3) % count];
    curvature[i] = Math.acos(THREE.MathUtils.clamp(t0.dot(t1), -1, 1)) / (3 * spacing);
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  });
  const data: TrackData = {
    def,
    count,
    spacing: approxLen / count,
    length: approxLen,
    points,
    tangents,
    rights,
    curvature,
    halfWidth: def.width / 2,
    bounds: { minX, maxX, minZ, maxZ },
    ramps: (def.ramps ?? []).map((f) => Math.floor(f * count)),
  };
  cache.set(def.id, data);
  return data;
}

export const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

/** Find nearest sample, searching around a hint index first (cheap), falling back to full scan. */
export function nearestIndex(track: TrackData, x: number, z: number, hint = -1, window = 30): number {
  const n = track.count;
  let best = -1;
  let bestD = Infinity;
  if (hint >= 0) {
    for (let k = -window; k <= window; k++) {
      const i = wrapIndex(hint + k, n);
      const p = track.points[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD < (track.halfWidth * 3) ** 2) return best;
  }
  for (let i = 0; i < n; i++) {
    const p = track.points[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Signed lateral offset from centreline (positive = right of track direction). */
export function lateralOffset(track: TrackData, idx: number, x: number, z: number): number {
  const p = track.points[idx];
  const r = track.rights[idx];
  return (x - p.x) * r.x + (z - p.z) * r.z;
}

/** Minimum distance from (x,z) to the centreline (brute force; used at build time only). */
export function distanceToTrack(track: TrackData, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < track.count; i += 2) {
    const p = track.points[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function yawFromTangent(t: THREE.Vector3) {
  return Math.atan2(t.x, t.z);
}
