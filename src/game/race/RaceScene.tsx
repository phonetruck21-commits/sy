import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { TrackView } from '../track/Track';
import { Scenery } from '../track/Scenery';
import { Crowd } from '../track/Crowd';
import { Environment } from './Environment';
import { CameraRig } from '../camera/CameraRig';
import { RaceDirector } from './RaceDirector';
import { Truck } from '../vehicle/Truck';
import { Dust } from './Dust';
import { Pickups } from './Pickups';
import type { Pickup } from './pickups';
import { RemoteTruck } from '../vehicle/RemoteTruck';
import { OnlineSync } from '../../net/OnlineSync';
import type { OnlineRaceInfo } from '../../store/gameStore';
import type { TrackData } from '../track/trackData';
import type { RacerRuntime } from './raceRuntime';
import type { AIState } from '../ai/aiDriver';
import type { TruckDesign } from '../../types';
import type { TruckModelParams } from '../../data/trucks';

export interface RacerSetup {
  runtime: RacerRuntime;
  design: TruckDesign;
  model: TruckModelParams;
  ai: AIState;
  spawn: { x: number; z: number; yaw: number };
  remote?: boolean;
}

interface Props {
  track: TrackData;
  racers: RacerSetup[];
  quality: 'low' | 'high';
  paused: boolean;
  autopilot: boolean;
  onFinish: () => void;
  onReady: () => void;
  online?: { info: OnlineRaceInfo; ready: boolean; onGo: () => void } | null;
  pickups?: Pickup[];
  respawnPickups?: boolean;
}

export function RaceScene({ track, racers, quality, paused, autopilot, onFinish, onReady, online, pickups, respawnPickups = false }: Props) {
  const hi = quality === 'high';
  const [dpr] = useState(() => Math.min(window.devicePixelRatio || 1, hi ? 1.75 : 1));
  const night = track.def.theme.night;
  const dustColor = track.def.scenery === 'desert' ? '#d9b783' : track.def.scenery === 'neon' ? '#7a6cff' : '#bfbfbf';
  const sceneKey = useMemo(() => `${track.def.id}`, [track]);
  return (
    <Canvas
      key={sceneKey}
      shadows={hi}
      dpr={dpr}
      camera={{ fov: 62, near: 0.3, far: 2600, position: [0, 20, -40] }}
      gl={{ antialias: hi, powerPreference: 'high-performance' }}
      onCreated={(st) => {
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__three = st;
        onReady();
      }}
    >
      <Environment theme={track.def.theme} shadows={hi} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -20, 0]} timeStep={1 / 60} paused={paused} interpolate>
          <TrackView track={track} shadows={hi} />
          {racers.map((r) => r.remote ? (
            <RemoteTruck key={r.runtime.id} racer={r.runtime} design={r.design} model={r.model} spawn={r.spawn} />
          ) : (
            <Truck
              key={r.runtime.id}
              racer={r.runtime}
              design={r.design}
              model={r.model}
              ai={r.ai}
              autopilot={autopilot}
              spawn={r.spawn}
              hiRes={hi && r.runtime.isPlayer}
              shadows={hi}
              headlights={night && r.runtime.isPlayer}
            />
          ))}
          <RaceDirector onFinish={onFinish} />
        </Physics>
      </Suspense>
      <Scenery track={track} shadows={hi} />
      <Crowd track={track} hi={hi} />
      {pickups && pickups.length > 0 && <Pickups items={pickups} trackId={track.def.id} respawn={respawnPickups} />}
      <Dust color={dustColor} />
      <CameraRig />
      {hi && (
        <EffectComposer multisampling={4}>
          <Bloom intensity={night ? 1.1 : 0.45} luminanceThreshold={night ? 0.45 : 0.82} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette offset={0.32} darkness={0.55} />
        </EffectComposer>
      )}
      {online && <OnlineSync info={online.info} ready={online.ready} onGo={online.onGo} />}
    </Canvas>
  );
}
