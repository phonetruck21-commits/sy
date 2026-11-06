import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { race } from './raceRuntime';
import { usePickupFx, type Pickup } from './pickups';
import { useProfile } from '../../store/profileStore';
import { audio } from '../audio/audio';
import type { TrackId } from '../../types';

const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#a86b00', emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 });
const tmp = new THREE.Object3D();

/**
 * Spinning coins + the hidden treasure. Only the local player collects.
 * In free-roam coins come back after a while; in races they stay taken.
 */
export function Pickups({ items, trackId, respawn }: { items: Pickup[]; trackId: TrackId; respawn: boolean }) {
  const coins = useMemo(() => items.filter((p) => p.kind === 'coin'), [items]);
  const stash = useMemo(() => items.find((p) => p.kind === 'stash') ?? null, [items]);
  const inst = useRef<THREE.InstancedMesh>(null);
  const stashGroup = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const prev = useRef<{ x: number; y: number; z: number } | null>(null);

  useLayoutEffect(() => {
    usePickupFx.getState().reset();
  }, [items]);

  useFrame((_, dt) => {
    const player = race.racers.find((r) => r.isPlayer);
    spin.current += dt * 3;
    const t = race.time;
    let gained = 0;
    if (player && race.phase !== 'loading' && !race.paused) {
      // test the whole segment driven since last frame, so fast trucks / low FPS can't skip a pickup
      const a = prev.current && Math.hypot(player.x - prev.current.x, player.z - prev.current.z) < 30 ? prev.current : { x: player.x, y: player.y, z: player.z };
      const sx = player.x - a.x, sz = player.z - a.z;
      const segLen2 = sx * sx + sz * sz;
      prev.current = { x: player.x, y: player.y, z: player.z };
      for (const p of items) {
        if (p.takenAt != null) {
          if (respawn && t - p.takenAt > (p.kind === 'coin' ? 25 : 1e9)) p.takenAt = null;
          continue;
        }
        const k = segLen2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * sx + (p.z - a.z) * sz) / segLen2)) : 1;
        const cx = a.x + sx * k, cz = a.z + sz * k, cy = a.y + (player.y - a.y) * k;
        const dx = p.x - cx, dz = p.z - cz;
        // an elevated (jump) treasure is caught anywhere across the ramp; ground ones need you to really find them
        if (dx * dx + dz * dz > (p.kind === 'stash' ? (p.y > 3 ? 64 : 16) : 9)) continue;
        if (p.y < cy - 0.6 || p.y > cy + 3.9) continue; // must reach it in height (jumps!)
        p.takenAt = t;
        if (p.kind === 'stash') {
          if (useProfile.getState().claimStash(trackId)) {
            useProfile.getState().addCoins(p.value);
            usePickupFx.getState().push(p.value, true);
            audio.fanfare(true);
          }
        } else {
          gained += p.value;
        }
      }
    }
    if (gained) {
      useProfile.getState().addCoins(gained);
      usePickupFx.getState().push(gained, false);
      audio.coin();
    }
    const m = inst.current;
    if (m) {
      coins.forEach((p, i) => {
        tmp.position.set(p.x, p.takenAt == null ? p.y + Math.sin(spin.current + i) * 0.15 : -50, p.z);
        tmp.rotation.set(0, spin.current + i * 0.3, 0);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    if (stashGroup.current && stash) {
      stashGroup.current.visible = stash.takenAt == null;
      stashGroup.current.rotation.y = spin.current * 0.5;
      stashGroup.current.position.y = stash.y + Math.sin(spin.current * 0.8) * 0.2;
    }
  });

  return (
    <group>
      {coins.length > 0 && <instancedMesh ref={inst} args={[coinGeo, coinMat, coins.length]} frustumCulled={false} />}
      {stash && (
        <group ref={stashGroup} position={[stash.x, stash.y, stash.z]}>
          {/* money bag */}
          <mesh position={[0, 0, 0]} castShadow>
            <sphereGeometry args={[1.1, 18, 14]} />
            <meshStandardMaterial color="#3e8e41" roughness={0.8} emissive="#0d3a10" />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <cylinderGeometry args={[0.35, 0.55, 0.5, 12]} />
            <meshStandardMaterial color="#2f6f33" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.1, 1.08]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={dollarTexture()} transparent />
          </mesh>
          {/* gold coins pile + glow */}
          {[[-1.1, -0.8, 0.4], [1.0, -0.85, -0.3], [0.3, -0.9, 1.0]].map(([x, y, z], i) => (
            <mesh key={i} geometry={coinGeo} material={coinMat} position={[x, y, z]} rotation={[Math.PI / 2, 0, i]} />
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]}>
            <circleGeometry args={[3, 32]} />
            <meshBasicMaterial color="#ffd54a" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[1.6, 16, 12]} />
            <meshBasicMaterial color="#ffcc33" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

let dollarTex: THREE.Texture | null = null;
function dollarTexture() {
  if (dollarTex) return dollarTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffe27a';
  ctx.font = '900 100px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 64, 70);
  dollarTex = new THREE.CanvasTexture(c);
  return dollarTex;
}
