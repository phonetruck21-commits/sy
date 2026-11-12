import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getPlayer, race } from '../race/raceRuntime';

const tmp = new THREE.Vector3();
// dev filming mode: camera locked tight to the truck even at low frame rates
const CINEMA = import.meta.env.DEV && new URLSearchParams(location.search).get('cinema') === '1';
const look = new THREE.Vector3();

/** Chase / cab / far cameras with speed-based FOV and collision shake. */
export function CameraRig() {
  const { camera } = useThree();
  const cur = useRef(new THREE.Vector3(0, 10, -20));
  const lookCur = useRef(new THREE.Vector3());
  const init = useRef(false);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = getPlayer();
    if (!p || !p.body) return;
    const t = p.body.translation();
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const mode = race.camera;
    let back = 13, up = 6, ahead = 6, lookUp = 2, stiffness = 6;
    if (mode === 'far') { back = 22; up = 11; ahead = 8; lookUp = 1; stiffness = 4; }
    if (mode === 'cab') { back = -3.35; up = 2.5; ahead = 30; lookUp = 1.6; stiffness = 40; }
    // countdown intro: swing around the truck
    if (race.phase === 'countdown' && mode !== 'cab') {
      const k = Math.max(0, race.countdown - 1) / 3;
      const ang = k * 1.6;
      const bx = Math.sin(p.yaw + ang), bz = Math.cos(p.yaw + ang);
      tmp.set(t.x - bx * (back + k * 6), t.y + up + k * 3, t.z - bz * (back + k * 6));
    } else {
      tmp.set(t.x - fx * back, t.y + up, t.z - fz * back);
    }
    look.set(t.x + fx * ahead, t.y + lookUp, t.z + fz * ahead);
    if (!init.current) {
      cur.current.copy(tmp);
      lookCur.current.copy(look);
      init.current = true;
    }
    const a = CINEMA ? 1 : 1 - Math.exp(-stiffness * dt);
    cur.current.lerp(tmp, mode === 'cab' ? 1 : a);
    lookCur.current.lerp(look, mode === 'cab' || CINEMA ? 1 : 1 - Math.exp(-10 * dt));
    camera.position.copy(cur.current);
    if (p.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * p.shake * 0.8;
      camera.position.y += (Math.random() - 0.5) * p.shake * 0.8;
      p.shake = Math.max(0, p.shake - dt * 2.5);
    }
    camera.lookAt(lookCur.current);
    const pc = camera as THREE.PerspectiveCamera;
    const speedK = Math.min(1.3, Math.max(0, p.speed) / p.stats.maxSpeed);
    const targetFov = (mode === 'cab' ? 70 : 62) + speedK * 10 + (p.nitroActive ? 8 : 0);
    pc.fov += (targetFov - pc.fov) * Math.min(1, dt * 3);
    pc.updateProjectionMatrix();
  });
  return null;
}
