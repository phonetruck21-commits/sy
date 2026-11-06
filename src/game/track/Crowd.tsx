import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { distanceToTrack, wrapIndex, type TrackData } from './trackData';
import { WALL_DIST_FROM_EDGE } from './Track';
import { createLabelTexture } from '../truck/branding';
import { race } from '../race/raceRuntime';
import { audio } from '../audio/audio';
import { mulberry32 } from '../../utils/random';

/**
 * Grandstands full of spectators beside the track. Spectators are instanced
 * and animated in the vertex shader (bobbing, jumping when you pass), so even
 * thousands of them cost only a few draw calls.
 */
interface Stand {
  x: number;
  z: number;
  yaw: number;
  away: number; // +1/-1: which local-X direction the tiers climb (away from the track)
  length: number;
  cx: number; // centre of the seating, world
  cz: number;
}

const TIERS = 7;
const TIER_DEPTH = 1.25;
const TIER_RISE = 0.65;

const standCache = new Map<string, Stand[]>();
export function findStands(track: TrackData): Stand[] {
  const hit = standCache.get(track.def.id);
  if (hit) return hit;
  const out: Stand[] = [];
  const base = track.halfWidth + WALL_DIST_FROM_EDGE + 1.6;
  const depth = TIERS * TIER_DEPTH + 2;
  for (const f of [0.012, 0.25, 0.5, 0.74]) {
    const i = wrapIndex(Math.floor(f * track.count) + 12, track.count);
    const p = track.points[i], r = track.rights[i], t = track.tangents[i];
    const length = 64;
    for (const side of [1, -1]) {
      // the whole footprint must stay clear of every part of the track
      let ok = true;
      for (const along of [-length / 2, 0, length / 2]) {
        for (const off of [base + 1, base + depth]) {
          const x = p.x + t.x * along + r.x * side * off;
          const z = p.z + t.z * along + r.z * side * off;
          if (distanceToTrack(track, x, z) < track.halfWidth + WALL_DIST_FROM_EDGE + 0.5) ok = false;
        }
      }
      if (!ok) continue;
      const yaw = Math.atan2(t.x, t.z);
      // local +X of a yaw-rotated group points to the track's left (= -right)
      const away = side > 0 ? -1 : 1;
      const x = p.x + r.x * side * base;
      const z = p.z + r.z * side * base;
      out.push({ x, z, yaw, away, length, cx: p.x + r.x * side * (base + depth / 2), cz: p.z + r.z * side * (base + depth / 2) });
      break;
    }
  }
  standCache.set(track.def.id, out);
  return out;
}

/** Is (x, z) inside a grandstand footprint (plus margin)? Used to keep scenery out. */
export function insideStand(stands: Stand[], x: number, z: number, margin: number) {
  const depth = TIERS * TIER_DEPTH + 2;
  for (const s of stands) {
    const dx = x - s.x, dz = z - s.z;
    const along = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    const lx = (dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw)) * s.away;
    if (Math.abs(along) < s.length / 2 + margin && lx > -margin - 1 && lx < depth + margin) return true;
  }
  return false;
}

function crowdMaterial(color: string | null) {
  const m = new THREE.MeshLambertMaterial(color ? { color } : {});
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uExcite = uniforms.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uExcite;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float idle = sin(uTime * (1.5 + ph) + ph * 6.283) * 0.04;
        float jump = max(0.0, sin(uTime * (7.0 + ph * 5.0) + ph * 6.283)) * uExcite * (0.25 + ph * 0.35);
        transformed.y += idle + jump;`,
      );
  };
  return { m, uniforms };
}

function StandView({ stand, hi, night }: { stand: Stand; hi: boolean; night: boolean }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const cheered = useRef(-100);

  const people = useMemo(() => {
    const rnd = mulberry32(Math.round(stand.x * 13 + stand.z * 7));
    const list: { x: number; y: number; z: number; shirt: string; skin: string }[] = [];
    const spacing = hi ? 0.85 : 1.4;
    const shirts = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#ffffff', '#00acc1', '#212121', '#d81b60', '#1e9bff'];
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    for (let tier = 0; tier < TIERS; tier++) {
      for (let z = -stand.length / 2 + 1; z < stand.length / 2 - 1; z += spacing) {
        if (rnd() < 0.12) continue;
        list.push({
          x: stand.away * (tier * TIER_DEPTH + TIER_DEPTH * 0.55),
          y: (tier + 1) * TIER_RISE,
          z: z + (rnd() - 0.5) * 0.25,
          shirt: shirts[Math.floor(rnd() * shirts.length)],
          skin: skins[Math.floor(rnd() * skins.length)],
        });
      }
    }
    return list;
  }, [stand, hi]);

  const mats = useMemo(() => ({ body: crowdMaterial(null), head: crowdMaterial(null) }), []);
  useEffect(() => () => { mats.body.m.dispose(); mats.head.m.dispose(); }, [mats]);

  const geos = useMemo(() => {
    const body = new THREE.CylinderGeometry(0.2, 0.24, 0.75, 6);
    body.translate(0, 0.38, 0);
    const head = new THREE.SphereGeometry(0.14, 8, 6);
    head.translate(0, 0.92, 0);
    return { body, head };
  }, []);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    people.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, stand.away > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      o.updateMatrix();
      bodies.current?.setMatrixAt(i, o.matrix);
      heads.current?.setMatrixAt(i, o.matrix);
      bodies.current?.setColorAt(i, c.set(p.shirt));
      heads.current?.setColorAt(i, c.set(p.skin));
    });
    [bodies.current, heads.current].forEach((m) => {
      if (!m) return;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [people, stand]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const player = race.racers.find((r) => r.isPlayer);
    let excite = race.phase === 'countdown' ? 0.5 : race.phase === 'finished' ? 1 : 0.12;
    if (player) {
      const d = Math.hypot(player.x - stand.cx, player.z - stand.cz);
      excite = Math.max(excite, Math.max(0, 1 - (d - 15) / 70));
      if (d < 45 && race.phase === 'racing' && t - cheered.current > 20) {
        cheered.current = t;
        audio.cheer(0.7);
      }
    }
    const u = mats.body.uniforms;
    u.uTime.value = t;
    u.uExcite.value += (excite - u.uExcite.value) * 0.05;
    mats.head.uniforms.uTime.value = t;
    mats.head.uniforms.uExcite.value = u.uExcite.value;
  });

  const banner = useMemo(() => createLabelTexture('PHONE TRUCK  •  S.Y  •  052-546-6304', night ? '#0b0626' : '#06122b', night ? '#ff2bd6' : '#35c8ff', 1024, 64), [night]);
  const structure = night ? '#1a1a2a' : '#9aa3ad';
  const seat = night ? '#2a1a40' : '#c62828';
  const L = stand.length;

  return (
    <group position={[stand.x, 0, stand.z]} rotation={[0, stand.yaw, 0]}>
      {/* stepped seating */}
      {Array.from({ length: TIERS }).map((_, i) => (
        <mesh key={i} position={[stand.away * (i * TIER_DEPTH + TIER_DEPTH / 2), ((i + 1) * TIER_RISE) / 2, 0]} castShadow={hi && i === TIERS - 1} receiveShadow={hi}>
          <boxGeometry args={[TIER_DEPTH, (i + 1) * TIER_RISE, L]} />
          <meshStandardMaterial color={i % 2 ? seat : structure} roughness={0.8} />
        </mesh>
      ))}
      {/* back wall + roof */}
      <mesh position={[stand.away * (TIERS * TIER_DEPTH + 0.2), 3.6, 0]}>
        <boxGeometry args={[0.4, 7.2, L]} />
        <meshStandardMaterial color={structure} />
      </mesh>
      <mesh position={[stand.away * (TIERS * TIER_DEPTH * 0.5), 7.4, 0]} rotation={[0, 0, stand.away * 0.08]}>
        <boxGeometry args={[TIERS * TIER_DEPTH + 2.5, 0.3, L + 2]} />
        <meshStandardMaterial color={night ? '#120a24' : '#e8eef4'} metalness={0.4} roughness={0.5} />
      </mesh>
      {[-L / 2, 0, L / 2].map((z) => (
        <mesh key={z} position={[-stand.away * 0.4, 3.7, z]}>
          <boxGeometry args={[0.25, 7.4, 0.25]} />
          <meshStandardMaterial color={structure} metalness={0.6} />
        </mesh>
      ))}
      {/* sponsor banner facing the track */}
      <mesh position={[-stand.away * 0.02, 0.5, 0]} rotation={[0, stand.away > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
        <planeGeometry args={[L, 0.9]} />
        <meshBasicMaterial map={banner} />
      </mesh>
      {/* crowd */}
      <instancedMesh ref={bodies} args={[geos.body, mats.body.m, people.length]} />
      <instancedMesh ref={heads} args={[geos.head, mats.head.m, people.length]} />
      {night && (
        <mesh position={[-stand.away * 0.3, 7.2, 0]}>
          <boxGeometry args={[0.15, 0.15, L]} />
          <meshBasicMaterial color="#ff2bd6" />
        </mesh>
      )}
    </group>
  );
}

export function Crowd({ track, hi }: { track: TrackData; hi: boolean }) {
  const stands = useMemo(() => findStands(track), [track]);
  // crowd loudness for the sound engine: nearest stand
  useFrame(() => {
    const p = race.racers.find((r) => r.isPlayer);
    if (!p) return;
    let lvl = 0;
    for (const s of stands) lvl = Math.max(lvl, 1 - Math.max(0, Math.hypot(p.x - s.cx, p.z - s.cz) - 20) / 120);
    race.crowd = lvl;
  });
  return (
    <group>
      {stands.map((s, i) => <StandView key={i} stand={s} hi={hi} night={track.def.theme.night} />)}
    </group>
  );
}
