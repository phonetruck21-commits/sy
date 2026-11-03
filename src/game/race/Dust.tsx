import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { race } from './raceRuntime';

const MAX = 400;

/** Dust / smoke puffs kicked up behind the trucks' rear wheels. */
export function Dust({ color }: { color: string }) {
  const ref = useRef<THREE.Points>(null);
  const state = useMemo(() => ({
    pos: new Float32Array(MAX * 3),
    vel: new Float32Array(MAX * 3),
    life: new Float32Array(MAX),
    next: 0,
    acc: 0,
  }), []);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const pts = ref.current;
    if (!pts || race.paused) return;
    const { pos, vel, life } = state;
    state.acc += dt;
    if (state.acc > 0.03) {
      state.acc = 0;
      for (const r of race.racers) {
        const sp = Math.abs(r.speed);
        if (sp < 8 || r.airborne) continue;
        const chance = r.offroad ? 0.8 : race.track?.def.scenery === 'desert' ? 0.5 : r.nitroActive ? 0.35 : 0;
        if (Math.random() > chance) continue;
        for (const side of [-1, 1]) {
          const i = state.next;
          state.next = (state.next + 1) % MAX;
          const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
          const rx = -Math.cos(r.yaw), rz = Math.sin(r.yaw);
          pos[i * 3] = r.x - fx * 2.5 + rx * side * 1.1;
          pos[i * 3 + 1] = 0.4;
          pos[i * 3 + 2] = r.z - fz * 2.5 + rz * side * 1.1;
          vel[i * 3] = -fx * sp * 0.15 + (Math.random() - 0.5) * 2;
          vel[i * 3 + 1] = 1 + Math.random() * 1.5;
          vel[i * 3 + 2] = -fz * sp * 0.15 + (Math.random() - 0.5) * 2;
          life[i] = 1;
        }
      }
    }
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      life[i] -= dt * 0.9;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3] *= 0.97;
      vel[i * 3 + 2] *= 0.97;
    }
    (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} size={3.2} color={color} transparent opacity={0.45} depthWrite={false} sizeAttenuation />
    </points>
  );
}
