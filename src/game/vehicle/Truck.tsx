import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RoundCuboidCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { TruckModel, type TruckRig } from '../truck/TruckModel';
import type { TruckDesign } from '../../types';
import type { TruckModelParams } from '../../data/trucks';
import { race, type RacerRuntime } from '../race/raceRuntime';
import { readPlayerInput, type DriveInput } from '../input/input';
import { aiThink, type AIState } from '../ai/aiDriver';
import { stepVehicle } from './vehiclePhysics';
import { audio } from '../audio/audio';

interface Props {
  racer: RacerRuntime;
  design: TruckDesign;
  model: TruckModelParams;
  ai: AIState;
  /** player-controlled unless autopilot */
  autopilot: boolean;
  spawn: { x: number; z: number; yaw: number };
  hiRes: boolean;
  shadows: boolean;
  headlights: boolean;
}

const HOLD: DriveInput = { throttle: false, brake: true, left: false, right: false, nitro: false };

export function Truck({ racer, design, model, ai, autopilot, spawn, hiRes, shadows, headlights }: Props) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const rig = useRef<TruckRig>(null);
  const tilt = useRef<THREE.Group>(null);
  const lastInput = useRef<DriveInput>(HOLD);
  const wheelSpin = useRef(0);
  const lastHit = useRef(0);

  useEffect(() => {
    racer.body = bodyRef.current;
    return () => {
      racer.body = null;
    };
  }, [racer]);

  useBeforePhysicsStep((world) => {
    const track = race.track;
    if (!track || race.paused || !racer.body) return;
    const dt = world.timestep;
    let input: DriveInput;
    if (race.phase === 'countdown' || race.phase === 'loading') input = HOLD;
    else if (!racer.isPlayer || autopilot || racer.finished) {
      const player = race.racers.find((r) => r.isPlayer) ?? null;
      input = aiThink(racer, ai, track, race.racers, racer.isPlayer ? null : player, dt);
    } else input = readPlayerInput();
    lastInput.current = input;
    stepVehicle(racer, input, dt, track, race.phase === 'racing' || race.phase === 'finished');
  });

  useFrame((_, dt) => {
    const r = rig.current;
    const body = bodyRef.current;
    if (!r || !body) return;
    const radius = model.cabStyle === 'heavy' ? 0.56 : 0.5;
    wheelSpin.current += (racer.speed / radius) * dt;
    r.allWheels.forEach((w) => (w.rotation.x = wheelSpin.current));
    r.frontWheels.forEach((w) => (w.rotation.y = racer.steer * 0.45));
    if (tilt.current) {
      const v = body.linvel();
      const pitchTarget = THREE.MathUtils.clamp(-Math.atan2(v.y, Math.max(6, Math.abs(racer.speed))), -0.3, 0.3);
      const rollTarget = racer.airborne ? 0 : -racer.steer * Math.min(1, Math.abs(racer.speed) / racer.stats.maxSpeed) * 0.07;
      tilt.current.rotation.x += (pitchTarget - tilt.current.rotation.x) * Math.min(1, dt * 6);
      tilt.current.rotation.z += (rollTarget - tilt.current.rotation.z) * Math.min(1, dt * 5);
    }
    if (r.flames) {
      r.flames.visible = racer.nitroActive;
      if (racer.nitroActive) r.flames.scale.setScalar(0.85 + Math.random() * 0.35);
    }
    if (r.brakeLights) r.brakeLights.emissiveIntensity = lastInput.current.brake && racer.speed > 0.5 ? 3 : 0.6;
  });

  return (
    <RigidBody
      ref={bodyRef}
      position={[spawn.x, 0.05, spawn.z]}
      rotation={[0, spawn.yaw, 0]}
      enabledRotations={[false, true, false]}
      colliders={false}
      canSleep={false}
      ccd
      userData={{ kind: 'truck', id: racer.id }}
      onCollisionEnter={({ other }) => {
        const kind = (other.rigidBodyObject?.userData as { kind?: string } | undefined)?.kind;
        if (kind === 'ground') return;
        const impact = Math.abs(racer.speed);
        if (racer.isPlayer && impact > 4 && race.time - lastHit.current > 0.4) {
          lastHit.current = race.time;
          racer.shake = Math.min(1, impact / 25);
          audio.thud(impact);
        }
      }}
    >
      <RoundCuboidCollider args={[0.98, 1.5, 3.95, 0.25]} position={[0, 1.76, -0.05]} friction={0} restitution={0.1} mass={racer.stats.mass * 6} />
      <group ref={tilt}>
        <TruckModel ref={rig} design={design} params={model} hiRes={hiRes} castShadow={shadows} headlights={headlights} />
      </group>
    </RigidBody>
  );
}
