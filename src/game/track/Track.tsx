import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import type { TrackData } from './trackData';
import { createLabelTexture } from '../truck/branding';

const WALL_OFFSET = 3; // run-off between road edge and barrier (slow "shoulder")
export const WALL_DIST_FROM_EDGE = WALL_OFFSET;

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function roadTexture(road: string, line: string, night: boolean) {
  return canvasTex(256, 512, (ctx) => {
    ctx.fillStyle = road;
    ctx.fillRect(0, 0, 256, 512);
    // asphalt grain
    for (let i = 0; i < 3500; i++) {
      const v = Math.random() * 40 - 20;
      ctx.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.08)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
    }
    ctx.fillStyle = line;
    if (night) {
      ctx.shadowColor = line;
      ctx.shadowBlur = 12;
    }
    ctx.fillRect(8, 0, 6, 512);
    ctx.fillRect(242, 0, 6, 512);
    // dashed lane lines (3 lanes)
    [256 / 3, (256 * 2) / 3].forEach((x) => {
      for (let y = 0; y < 512; y += 128) ctx.fillRect(x - 3, y + 20, 6, 70);
    });
  });
}

function ribbon(track: TrackData, offA: number, offB: number, yA: number, yB: number, vScale: number) {
  const n = track.count;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const p = track.points[k];
    const r = track.rights[k];
    if (i > 0) dist += track.spacing;
    pos.set([p.x + r.x * offA, yA, p.z + r.z * offA, p.x + r.x * offB, yB, p.z + r.z * offB], i * 6);
    uv.set([0, dist / vScale, 1, dist / vScale], i * 4);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rampGeometry() {
  const shape = new THREE.Shape();
  // kicker ramp: trucks keep their vertical speed off the lip and fly
  const prof: [number, number][] = [[-9, 0], [0, 1.9], [0.8, 1.9], [0.8, 0]];
  prof.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 11, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(5.5, 0, 0);
  return { geo: g, hull: new Float32Array(prof.flatMap(([z, y]) => [-5.5, y, z, 5.5, y, z])) };
}

export function TrackView({ track, shadows }: { track: TrackData; shadows: boolean }) {
  const th = track.def.theme;
  const hw = track.halfWidth;
  const scenery = track.def.scenery;

  const assets = useMemo(() => {
    const roadTex = roadTexture(th.road, th.roadLine, th.night);
    const road = ribbon(track, -hw, hw, 0.02, 0.02, 16);
    const shoulderL = ribbon(track, -hw - WALL_OFFSET, -hw, 0.015, 0.015, 8);
    const shoulderR = ribbon(track, hw, hw + WALL_OFFSET, 0.015, 0.015, 8);
    const curbL = ribbon(track, -hw - 1.2, -hw, 0.03, 0.03, 4);
    const curbR = ribbon(track, hw, hw + 1.2, 0.03, 0.03, 4);
    const wd = hw + WALL_OFFSET;
    const wallL = ribbon(track, -wd, -wd, 0, 1.3, 6);
    const wallR = ribbon(track, wd, wd, 1.3, 0, 6);
    const wallTopL = ribbon(track, -wd - 0.2, -wd + 0.2, 1.32, 1.32, 6);
    const wallTopR = ribbon(track, wd - 0.2, wd + 0.2, 1.32, 1.32, 6);
    const curbTex = canvasTex(64, 128, (ctx) => {
      const [a, b] = scenery === 'neon' ? ['#ff2bd6', '#35e0ff'] : scenery === 'desert' ? ['#c0392b', '#f4e3c1'] : ['#d61f26', '#f5f5f5'];
      ctx.fillStyle = a; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = b; ctx.fillRect(0, 64, 64, 64);
    });
    const wallTex = canvasTex(256, 64, (ctx) => {
      if (scenery === 'city') {
        ctx.fillStyle = '#d9dadc'; ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#c62828';
        for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 32, 64);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 56, 256, 8);
      } else if (scenery === 'desert') {
        ctx.fillStyle = '#7a4a26'; ctx.fillRect(0, 0, 256, 64);
        for (let x = 0; x < 256; x += 32) { ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(x + 16, 32, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x + 16, 32, 7, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = '#0d0d18'; ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#35e0ff'; ctx.fillRect(0, 6, 256, 4);
        ctx.fillStyle = '#ff2bd6'; ctx.fillRect(0, 50, 256, 4);
        ctx.fillStyle = 'rgba(53,224,255,0.25)';
        for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 10, 2, 40);
      }
    });
    const checker = canvasTex(256, 64, (ctx) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        ctx.fillRect(x * 16, y * 16, 16, 16);
      }
    }, false);
    const banner = createLabelTexture('PHONE TRUCK  •  S.Y  •  TRUCK RACING CHAMPIONSHIP', '#06122b', '#35c8ff', 1024, 96);
    const ramp = rampGeometry();
    const rampTex = canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#f2b705'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#111';
      for (let i = -2; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 48, 0); ctx.lineTo(i * 48 + 24, 0); ctx.lineTo(i * 48 + 24 + 64, 128); ctx.lineTo(i * 48 + 64, 128); ctx.fill(); }
    });
    // barrier colliders: one thin box per wall segment
    const colliders: { pos: [number, number, number]; yaw: number; half: [number, number, number] }[] = [];
    const step = 4;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < track.count; i += step) {
        const j = (i + step) % track.count;
        const a = track.points[i], b = track.points[j];
        const ra = track.rights[i], rb = track.rights[j];
        const off = side * (wd + 0.5);
        const ax = a.x + ra.x * off, az = a.z + ra.z * off;
        const bx = b.x + rb.x * off, bz = b.z + rb.z * off;
        const len = Math.hypot(bx - ax, bz - az);
        colliders.push({ pos: [(ax + bx) / 2, 1.5, (az + bz) / 2], yaw: Math.atan2(bx - ax, bz - az), half: [0.5, 1.5, len / 2 + 0.4] });
      }
    }
    return { roadTex, road, shoulderL, shoulderR, curbL, curbR, wallL, wallR, wallTopL, wallTopR, curbTex, wallTex, checker, banner, ramp, rampTex, colliders };
  }, [track, th.road, th.roadLine, th.night, hw, scenery]);

  useEffect(() => () => {
    Object.values(assets).forEach((a) => {
      if (a && typeof (a as THREE.BufferGeometry).dispose === 'function') (a as THREE.BufferGeometry).dispose();
    });
    assets.ramp.geo.dispose();
  }, [assets]);

  const start = track.points[0];
  const startT = track.tangents[0];
  const startYaw = Math.atan2(startT.x, startT.z);
  const neon = scenery === 'neon';

  return (
    <group>
      {/* ground */}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'ground' }}>
        <CuboidCollider args={[3000, 1, 3000]} position={[0, -1, 0]} friction={0} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={th.ground} roughness={1} />
      </mesh>
      {neon && <gridHelper args={[1600, 160, '#ff2bd6', '#1b2f6b']} position={[0, 0.01, 0]} />}

      {/* road surface */}
      <mesh geometry={assets.road} receiveShadow={shadows}>
        <meshStandardMaterial map={assets.roadTex} roughness={neon ? 0.35 : 0.9} metalness={neon ? 0.4 : 0} />
      </mesh>
      <mesh geometry={assets.shoulderL} receiveShadow={shadows}><meshStandardMaterial color={scenery === 'desert' ? '#c9a46a' : neon ? '#0a0a14' : '#6b6e72'} roughness={1} /></mesh>
      <mesh geometry={assets.shoulderR} receiveShadow={shadows}><meshStandardMaterial color={scenery === 'desert' ? '#c9a46a' : neon ? '#0a0a14' : '#6b6e72'} roughness={1} /></mesh>
      <mesh geometry={assets.curbL}>{neon ? <meshBasicMaterial map={assets.curbTex} /> : <meshStandardMaterial map={assets.curbTex} />}</mesh>
      <mesh geometry={assets.curbR}>{neon ? <meshBasicMaterial map={assets.curbTex} /> : <meshStandardMaterial map={assets.curbTex} />}</mesh>

      {/* barriers */}
      {[assets.wallL, assets.wallR].map((g, i) => (
        <mesh key={i} geometry={g} castShadow={false} receiveShadow={shadows}>
          {neon ? <meshBasicMaterial map={assets.wallTex} side={THREE.DoubleSide} /> : <meshStandardMaterial map={assets.wallTex} side={THREE.DoubleSide} roughness={0.8} />}
        </mesh>
      ))}
      {[assets.wallTopL, assets.wallTopR].map((g, i) => (
        <mesh key={i} geometry={g}>
          {neon ? <meshBasicMaterial color={th.barrierEmissive} /> : <meshStandardMaterial color={th.barrier} />}
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'wall' }}>
        {assets.colliders.map((c, i) => (
          <CuboidCollider key={i} args={c.half} position={c.pos} rotation={[0, c.yaw, 0]} friction={0} restitution={0.2} />
        ))}
      </RigidBody>

      {/* start / finish */}
      <group position={[start.x, 0, start.z]} rotation={[0, startYaw, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <planeGeometry args={[hw * 2, 3]} />
          <meshBasicMaterial map={assets.checker} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[s * (hw + WALL_OFFSET + 1.2), 4.5, 0]} castShadow={shadows}>
            <boxGeometry args={[1, 9, 1]} />
            <meshStandardMaterial color="#20242c" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 8.5, 0]} castShadow={shadows}>
          <boxGeometry args={[(hw + WALL_OFFSET) * 2 + 3.4, 2, 0.8]} />
          <meshStandardMaterial color="#06122b" />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, 8.5, s * 0.41]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[(hw + WALL_OFFSET) * 2 + 3, 1.7]} />
            <meshBasicMaterial map={assets.banner} />
          </mesh>
        ))}
      </group>

      {/* ramps (jumps) */}
      {track.ramps.map((ri) => {
        const p = track.points[ri];
        const t = track.tangents[ri];
        const yaw = Math.atan2(t.x, t.z);
        return (
          <group key={ri}>
            <mesh geometry={assets.ramp.geo} position={[p.x, 0, p.z]} rotation={[0, yaw, 0]} castShadow={shadows} receiveShadow={shadows}>
              <meshStandardMaterial map={assets.rampTex} roughness={0.7} />
            </mesh>
            <RigidBody type="fixed" colliders={false} position={[p.x, 0, p.z]} rotation={[0, yaw, 0]} userData={{ kind: 'ground' }}>
              <ConvexHullCollider args={[assets.ramp.hull]} friction={0} />
            </RigidBody>
          </group>
        );
      })}
    </group>
  );
}
