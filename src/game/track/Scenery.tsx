import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { distanceToTrack, type TrackData } from './trackData';
import { mulberry32 } from '../../utils/random';
import { WALL_DIST_FROM_EDGE } from './Track';
import { findStands, insideStand } from './Crowd';

interface Inst {
  p: [number, number, number];
  s: [number, number, number];
  ry?: number;
  c?: string;
}

function Instanced({ geo, mat, items, shadows = false }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[]; shadows?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.scale.set(...it.s);
      o.rotation.set(0, it.ry ?? 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (it.c) m.setColorAt(i, col.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={shadows} receiveShadow={false} frustumCulled={false} />;
}

const GEO = {
  box: (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })(),
  cyl: (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); g.translate(0, 0.5, 0); return g; })(),
  trunk: (() => { const g = new THREE.CylinderGeometry(0.25, 0.4, 1, 6); g.translate(0, 0.5, 0); return g; })(),
  cone: (() => { const g = new THREE.ConeGeometry(0.5, 1, 7); g.translate(0, 0.5, 0); return g; })(),
  rock: new THREE.DodecahedronGeometry(1, 0),
  sphere: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  crown: (() => { const g = new THREE.ConeGeometry(1, 0.6, 7); g.rotateX(Math.PI); g.translate(0, 0.3, 0); return g; })(),
};

function windowsTexture(night: boolean) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 256; y += 16) {
    for (let x = 6; x < 128; x += 16) {
      const lit = night && Math.random() < 0.35;
      ctx.fillStyle = lit ? '#ffe9a8' : Math.random() < 0.5 ? '#7d8a99' : '#9aa8b8';
      ctx.fillRect(x, y, 10, 9);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Scenery({ track, shadows }: { track: TrackData; shadows: boolean }) {
  const kind = track.def.scenery;
  const data = useMemo(() => {
    const rnd = mulberry32(track.def.id.length * 977 + track.count);
    const b = track.bounds;
    const clear = track.halfWidth + WALL_DIST_FROM_EDGE + 6;
    const place = (n: number, margin: number, minSize: number, gen: (x: number, z: number) => Inst | Inst[] | null, maxTries = n * 12) => {
      const out: Inst[] = [];
      let tries = 0;
      let count = 0;
      while (count < n && tries < maxTries) {
        tries++;
        const x = b.minX - margin + rnd() * (b.maxX - b.minX + margin * 2);
        const z = b.minZ - margin + rnd() * (b.maxZ - b.minZ + margin * 2);
        if (distanceToTrack(track, x, z) < clear + minSize) continue;
        const r = gen(x, z);
        if (!r) continue;
        if (Array.isArray(r)) out.push(...r);
        else out.push(r);
        count++;
      }
      return out;
    };
    const alongTrack = (every: number, offset: number, fn: (x: number, z: number, i: number, side: number, yaw: number) => Inst[]) => {
      const out: Inst[] = [];
      for (let i = 0; i < track.count; i += every) {
        for (const side of [-1, 1]) {
          const p = track.points[i], r = track.rights[i], t = track.tangents[i];
          const x = p.x + r.x * side * offset, z = p.z + r.z * side * offset;
          // skip if this spot is too close to another part of the track
          if (distanceToTrack(track, x, z) < offset - 2) continue;
          out.push(...fn(x, z, i, side, Math.atan2(t.x, t.z)));
        }
      }
      return out;
    };
    const lampOffset = track.halfWidth + WALL_DIST_FROM_EDGE + 2.5;

    if (kind === 'city') {
      const palette = ['#c9c2b5', '#a9b4c2', '#8d99a8', '#d8cfc0', '#7b8794', '#b7c6d6', '#e0d6c8'];
      const buildings = place(120, 160, 14, (x, z) => {
        const w = 12 + rnd() * 18, d = 12 + rnd() * 18;
        const tall = rnd() < 0.2;
        const h = tall ? 50 + rnd() * 50 : 12 + rnd() * 30;
        return { p: [x, 0, z], s: [w, h, d], ry: rnd() * 0.3, c: palette[Math.floor(rnd() * palette.length)] };
      });
      // port: containers + cranes on the east side next to the sea
      const portX = b.maxX + 60;
      const containerColors = ['#c0392b', '#2471a3', '#1e8449', '#d68910', '#7d3c98', '#5d6d7e', '#a04000'];
      const containers: Inst[] = [];
      for (let gx = 0; gx < 6; gx++) for (let gz = 0; gz < 14; gz++) {
        const x = portX + gx * 9, z = b.minZ + 20 + gz * 26;
        if (distanceToTrack(track, x, z) < track.halfWidth + 20) continue;
        const stack = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < stack; k++) containers.push({ p: [x, k * 2.7, z], s: [2.5, 2.6, 12], c: containerColors[Math.floor(rnd() * containerColors.length)] });
      }
      const cranes: Inst[] = [];
      const craneArms: Inst[] = [];
      for (let k = 0; k < 4; k++) {
        const z = b.minZ + 40 + k * ((b.maxZ - b.minZ) / 4);
        const x = portX + 70;
        [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([dx, dz]) => cranes.push({ p: [x + dx, 0, z + dz], s: [1.2, 42, 1.2], c: '#d4a017' }));
        craneArms.push({ p: [x - 20, 40, z], s: [70, 3, 3], c: '#d4a017' });
        craneArms.push({ p: [x - 4, 44, z], s: [10, 8, 8], c: '#c0392b' });
      }
      const palms = alongTrack(18, lampOffset + 2, (x, z) => {
        const h = 6 + rnd() * 3;
        return [{ p: [x, 0, z], s: [1, h, 1], c: '#8b6b4a' }, { p: [x, h - 0.2, z], s: [3.2, 2, 3.2], ry: rnd() * 6, c: '#2f7d32' }];
      });
      const lamps = alongTrack(24, lampOffset, (x, z, _i, side, yaw) => [
        { p: [x, 0, z], s: [0.25, 9, 0.25], c: '#555b63' },
        { p: [x, 8.8, z], s: [0.6, 0.25, 2.2], ry: yaw + (side > 0 ? 0 : Math.PI) + Math.PI / 2, c: '#fff6d0' },
      ]);
      return { kind: 'city' as const, buildings, containers, cranes, craneArms, palms, lamps, sea: { x: portX + 130 } };
    }
    if (kind === 'desert') {
      const rocks = place(170, 220, 3, (x, z) => {
        const s = 1.5 + rnd() * (rnd() < 0.15 ? 12 : 4);
        return { p: [x, s * 0.3, z], s: [s, s * (0.6 + rnd() * 0.5), s * (0.8 + rnd() * 0.4)], ry: rnd() * 6, c: rnd() < 0.5 ? '#a0703f' : '#8a5a33' };
      });
      const dunes = place(45, 260, 20, (x, z) => {
        const s = 18 + rnd() * 30;
        return { p: [x, -1, z], s: [s, 4 + rnd() * 8, s * (0.6 + rnd() * 0.6)], ry: rnd() * 6, c: rnd() < 0.5 ? '#e0bd82' : '#d1a868' };
      });
      const trees = place(45, 150, 4, (x, z) => {
        const h = 3 + rnd() * 2;
        return [{ p: [x, 0, z], s: [0.7, h, 0.7], c: '#5d4630' }, { p: [x, h - 0.3, z], s: [4 + rnd() * 2, 1.2, 4 + rnd() * 2], ry: rnd() * 6, c: '#6d8a3a' }];
      });
      const tires = alongTrack(30, lampOffset - 1, (x, z) => [
        { p: [x, 0, z], s: [1.4, 0.45, 1.4], c: '#151515' }, { p: [x, 0.45, z], s: [1.4, 0.45, 1.4], c: '#151515' }, { p: [x, 0.9, z], s: [1.4, 0.45, 1.4], c: '#c0392b' },
      ]);
      const flags = alongTrack(40, lampOffset + 1, (x, z, i) => [
        { p: [x, 0, z], s: [0.12, 6, 0.12], c: '#ddd' }, { p: [x, 4.8, z], s: [0.08, 1.2, 1.8], c: i % 80 === 0 ? '#1e9bff' : '#ff6b1a' },
      ]);
      return { kind: 'desert' as const, rocks, dunes, trees, tires, flags };
    }
    // neon
    const neonColors = ['#ff2bd6', '#35e0ff', '#8a5bff', '#2bff88', '#ffcc00'];
    const towers: Inst[] = [];
    const strips: Inst[] = [];
    place(110, 180, 12, (x, z) => {
      const w = 10 + rnd() * 16, d = 10 + rnd() * 16, h = 20 + rnd() * 90;
      const c = neonColors[Math.floor(rnd() * neonColors.length)];
      towers.push({ p: [x, 0, z], s: [w, h, d], c: '#0c0c18' });
      [[w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].forEach(([dx, dz]) => strips.push({ p: [x + dx, 0, z + dz], s: [0.5, h + 0.2, 0.5], c }));
      for (let y = 8; y < h; y += 14 + rnd() * 10) strips.push({ p: [x, y, z], s: [w + 0.4, 0.4, d + 0.4], c });
      return [];
    });
    const arches: Inst[] = [];
    for (let i = 20; i < track.count; i += 70) {
      const p = track.points[i], r = track.rights[i], t = track.tangents[i];
      const yaw = Math.atan2(t.x, t.z);
      const span = track.halfWidth + WALL_DIST_FROM_EDGE + 1;
      const c = neonColors[(i / 70) % 2 === 0 ? 0 : 1];
      arches.push({ p: [p.x + r.x * span, 0, p.z + r.z * span], s: [0.7, 10, 0.7], ry: yaw, c });
      arches.push({ p: [p.x - r.x * span, 0, p.z - r.z * span], s: [0.7, 10, 0.7], ry: yaw, c });
      // local X of a yaw-rotated box points across the track
      arches.push({ p: [p.x, 9.6, p.z], s: [span * 2 + 0.7, 0.7, 0.7], ry: yaw, c });
    }
    const lamps = alongTrack(16, lampOffset, (x, z, i) => [{ p: [x, 0, z], s: [0.35, 5, 0.35], c: neonColors[i % 3] }]);
    const stars = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const th = rnd() * Math.PI * 2, ph = rnd() * Math.PI * 0.45;
      stars.set([Math.cos(th) * Math.cos(ph) * 900, 80 + Math.sin(ph) * 700, Math.sin(th) * Math.cos(ph) * 900], i * 3);
    }
    return { kind: 'neon' as const, towers, strips, arches, lamps, stars };
  }, [track, kind]);

  const clean = useMemo(() => {
    const stands = findStands(track);
    const f = (arr: Inst[], margin = 3) => arr.filter((it) => !insideStand(stands, it.p[0], it.p[2], margin + Math.max(it.s[0], it.s[2]) / 2));
    const out: Record<string, unknown> = { ...data };
    for (const [k, v] of Object.entries(data)) if (Array.isArray(v)) out[k] = f(v as Inst[]);
    return out as typeof data;
  }, [data, track]);

  const mats = useMemo(() => ({
    std: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    windows: new THREE.MeshStandardMaterial({ map: windowsTexture(false), roughness: 0.6, metalness: 0.2 }),
    flat: new THREE.MeshLambertMaterial({ flatShading: true }),
    basic: new THREE.MeshBasicMaterial(),
    lamp: new THREE.MeshBasicMaterial({ color: '#fff6d0' }),
    dark: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.7 }),
    sea: new THREE.MeshStandardMaterial({ color: '#2e6f9e', roughness: 0.15, metalness: 0.6 }),
  }), []);

  // distant hills / skyline ring (cheap backdrop)
  const ring = useMemo(() => {
    const rnd = mulberry32(7);
    const items: Inst[] = [];
    const c = { x: (track.bounds.minX + track.bounds.maxX) / 2, z: (track.bounds.minZ + track.bounds.maxZ) / 2 };
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 700 + rnd() * 100;
      const h = kind === 'desert' ? 60 + rnd() * 90 : kind === 'neon' ? 80 + rnd() * 160 : 40 + rnd() * 70;
      items.push({ p: [c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r], s: [160 + rnd() * 120, h, 160 + rnd() * 120], ry: rnd() * 6, c: kind === 'desert' ? '#b48a5a' : kind === 'neon' ? '#120c2a' : '#8e8a90' });
    }
    return items;
  }, [track, kind]);

  if (clean.kind === 'city') {
    return (
      <group>
        <Instanced geo={GEO.box} mat={mats.windows} items={clean.buildings} shadows={shadows} />
        <Instanced geo={GEO.box} mat={mats.std} items={clean.containers} />
        <Instanced geo={GEO.box} mat={mats.std} items={clean.cranes} />
        <Instanced geo={GEO.box} mat={mats.std} items={clean.craneArms} />
        <Instanced geo={GEO.trunk} mat={mats.flat} items={clean.palms.filter((_, i) => i % 2 === 0)} />
        <Instanced geo={GEO.crown} mat={mats.flat} items={clean.palms.filter((_, i) => i % 2 === 1)} />
        <Instanced geo={GEO.box} mat={mats.std} items={clean.lamps.filter((_, i) => i % 2 === 0)} />
        <Instanced geo={GEO.box} mat={mats.lamp} items={clean.lamps.filter((_, i) => i % 2 === 1)} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[clean.sea.x + 600, 0.05, 0]} material={mats.sea}>
          <planeGeometry args={[1200, 4000]} />
        </mesh>
        <Instanced geo={GEO.cone} mat={mats.flat} items={ring} />
      </group>
    );
  }
  if (clean.kind === 'desert') {
    return (
      <group>
        <Instanced geo={GEO.rock} mat={mats.flat} items={clean.rocks} shadows={shadows} />
        <Instanced geo={GEO.sphere} mat={mats.flat} items={clean.dunes} />
        <Instanced geo={GEO.trunk} mat={mats.flat} items={clean.trees.filter((_, i) => i % 2 === 0)} />
        <Instanced geo={GEO.sphere} mat={mats.flat} items={clean.trees.filter((_, i) => i % 2 === 1)} />
        <Instanced geo={GEO.cyl} mat={mats.std} items={clean.tires} />
        <Instanced geo={GEO.box} mat={mats.flat} items={clean.flags} />
        <Instanced geo={GEO.cone} mat={mats.flat} items={ring} />
      </group>
    );
  }
  if (clean.kind === 'neon') {
    return (
      <group>
        <Instanced geo={GEO.box} mat={mats.dark} items={clean.towers} />
        <Instanced geo={GEO.box} mat={mats.basic} items={clean.strips} />
        <Instanced geo={GEO.box} mat={mats.basic} items={clean.arches} />
        <Instanced geo={GEO.box} mat={mats.basic} items={clean.lamps} />
        <Instanced geo={GEO.box} mat={mats.dark} items={ring} />
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[clean.stars, 3]} />
          </bufferGeometry>
          <pointsMaterial size={2.2} sizeAttenuation={false} color="#ffffff" fog={false} />
        </points>
      </group>
    );
  }
  return null;
}
