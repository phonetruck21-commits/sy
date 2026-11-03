import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TrackTheme } from '../../types';
import { getPlayer } from './raceRuntime';
import { RoomEnv } from '../truck/RoomEnv';

/** Gradient sky dome + fog + sun that follows the player (keeps shadow map tight). */
export function Environment({ theme, shadows }: { theme: TrackTheme; shadows: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();

  const sky = useMemo(() => {
    const top = new THREE.Color(theme.night ? '#02010a' : '#2f6fc9');
    const horizon = new THREE.Color(theme.sky);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: top }, horizon: { value: horizon } },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){ float h = normalize(vPos).y; float t = pow(clamp(h,0.0,1.0),0.55); gl_FragColor = vec4(mix(horizon, top, t),1.0); }`,
    });
    return mat;
  }, [theme.night, theme.sky]);

  useMemo(() => {
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    scene.background = new THREE.Color(theme.sky);
  }, [scene, theme]);

  useFrame(({ camera }) => {
    const p = getPlayer();
    const s = sun.current;
    const cx = p ? p.x : camera.position.x;
    const cz = p ? p.z : camera.position.z;
    if (s) {
      s.position.set(cx + 60, 110, cz + 40);
      s.target.position.set(cx, 0, cz);
      s.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <RoomEnv intensity={theme.night ? 0.25 : 0.45} />
      <mesh material={sky} scale={1100} renderOrder={-1}>
        <sphereGeometry args={[1, 24, 12]} />
      </mesh>
      <hemisphereLight args={[theme.night ? '#5a4bff' : '#ffffff', theme.night ? '#120a20' : '#6b5a45', theme.ambient]} />
      <ambientLight intensity={theme.night ? 0.25 : 0.2} />
      <directionalLight
        ref={sun}
        color={theme.sunColor}
        intensity={theme.sunIntensity}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={300}
        shadow-bias={-0.0005}
      />
    </>
  );
}
