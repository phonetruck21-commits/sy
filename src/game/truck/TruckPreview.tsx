import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { TruckModel } from './TruckModel';
import { RoomEnv } from './RoomEnv';
import type { TruckDesign } from '../../types';
import type { TruckModelParams } from '../../data/trucks';

export type PreviewView = 'free' | 'left' | 'right' | 'front' | 'rear';

const VIEW_POS: Record<Exclude<PreviewView, 'free'>, [number, number, number]> = {
  left: [15, 3, -0.3],
  right: [-15, 3, -0.3],
  front: [5, 3.2, 14],
  rear: [-3, 3.2, -14],
};

function ViewController({ view, controls }: { view: PreviewView; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const anim = useRef(0);
  const target = useRef(new THREE.Vector3());
  useEffect(() => {
    if (view === 'free') return;
    target.current.set(...VIEW_POS[view]);
    anim.current = 1;
  }, [view]);
  useFrame((_, dt) => {
    if (anim.current <= 0) return;
    anim.current -= dt * 1.2;
    camera.position.lerp(target.current, 1 - Math.exp(-dt * 6));
    controls.current?.update();
  });
  return null;
}

interface Props {
  design: TruckDesign;
  model: TruckModelParams;
  view?: PreviewView;
  autoRotate?: boolean;
  preserveDrawingBuffer?: boolean;
  onCanvas?: (c: HTMLCanvasElement) => void;
  interactive?: boolean;
  floorColor?: string;
}

export function TruckPreview({ design, model, view = 'free', autoRotate = false, preserveDrawingBuffer = false, onCanvas, interactive = true, floorColor = '#0a1a36' }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [10, 4.5, 11], fov: 40, near: 0.5, far: 200 }}
      gl={{ preserveDrawingBuffer, antialias: true, alpha: true }}
      onCreated={({ gl }) => onCanvas?.(gl.domElement)}
      style={{ touchAction: 'none' }}
    >
      <RoomEnv intensity={0.9} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 12, 6]} intensity={2.2} />
      <directionalLight position={[-8, 6, -6]} intensity={0.8} color="#7fb8ff" />
      <TruckModel design={design} params={model} hiRes castShadow={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color={floorColor} roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[8.7, 9, 64]} />
        <meshBasicMaterial color="#1e9bff" />
      </mesh>
      <ContactShadows position={[0, 0.01, 0]} opacity={0.6} scale={20} blur={2.2} far={5} />
      <OrbitControls
        ref={controls}
        target={[0, 1.8, 0]}
        enablePan={false}
        enabled={interactive}
        minDistance={7}
        maxDistance={24}
        maxPolarAngle={1.5}
        autoRotate={autoRotate}
        autoRotateSpeed={1.2}
      />
      <ViewController view={view} controls={controls} />
    </Canvas>
  );
}
