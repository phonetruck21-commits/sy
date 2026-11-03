import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RoundCuboidCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { TruckModel, type TruckRig } from '../truck/TruckModel';
import type { TruckDesign } from '../../types';
import type { TruckModelParams } from '../../data/trucks';
import type { RacerRuntime } from '../race/raceRuntime';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Another online player's truck. Kinematic body (our trucks bump into it),
 * position smoothed toward the latest network state with short extrapolation.
 */
export function RemoteTruck({ racer, design, model, spawn }: { racer: RacerRuntime; design: TruckDesign; model: TruckModelParams; spawn: { x: number; z: number; yaw: number } }) {
  const body = useRef<RapierRigidBody>(null);
  const rig = useRef<TruckRig>(null);
  const cur = useRef({ x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw });
  const spin = useRef(0);

  useBeforePhysicsStep((world) => {
    const b = body.current;
    if (!b) return;
    racer.body = b;
    const dt = world.timestep;
    const n = racer.net;
    const c = cur.current;
    if (n) {
      const ahead = Math.min(0.25, (performance.now() - n.recv) / 1000);
      const tx = n.x + Math.sin(n.yaw) * n.sp * ahead;
      const tz = n.z + Math.cos(n.yaw) * n.sp * ahead;
      const k = 1 - Math.exp(-10 * dt);
      const far = Math.hypot(tx - c.x, tz - c.z) > 25; // teleport (respawn)
      c.x = far ? tx : c.x + (tx - c.x) * k;
      c.z = far ? tz : c.z + (tz - c.z) * k;
      c.y += (n.y - c.y) * k;
      c.yaw += wrap(n.yaw - c.yaw) * (far ? 1 : k);
    }
    b.setNextKinematicTranslation({ x: c.x, y: c.y, z: c.z });
    b.setNextKinematicRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) });
    racer.x = c.x;
    racer.y = c.y;
    racer.z = c.z;
    racer.yaw = c.yaw;
  });

  useFrame((_, dt) => {
    const r = rig.current;
    if (!r) return;
    spin.current += (racer.speed / 0.5) * dt;
    r.allWheels.forEach((w) => (w.rotation.x = spin.current));
    if (r.flames) r.flames.visible = racer.nitroActive;
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" position={[spawn.x, 0, spawn.z]} rotation={[0, spawn.yaw, 0]} colliders={false} userData={{ kind: 'truck', id: racer.id }}>
      <RoundCuboidCollider args={[0.98, 1.5, 3.95, 0.25]} position={[0, 1.76, -0.05]} friction={0} restitution={0.1} />
      <TruckModel ref={rig} design={design} params={model} hiRes={false} castShadow={false} />
    </RigidBody>
  );
}

