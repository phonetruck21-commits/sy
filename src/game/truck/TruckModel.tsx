import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RimStyle, TruckDesign } from '../../types';
import type { TruckModelParams } from '../../data/trucks';
import { createLabelTexture, createPanelTexture, panelKey, type PanelKind } from './branding';

/**
 * Procedural truck modelled after a 2011 Nissan Atleon 80.19 box truck:
 * cab-over-engine, white box body, single rear axle with dual wheels and a
 * DHOLLANDIA tuck-away tail lift. Origin = ground level, centre of truck, facing +Z.
 *
 * To swap in a real GLB later, render <primitive object={gltf.scene}/> in place
 * of <TruckModel/> — the rig handle (wheels/flames) is optional.
 */
export interface TruckRig {
  body: THREE.Group | null;
  frontWheels: THREE.Group[];
  allWheels: THREE.Group[];
  flames: THREE.Object3D | null;
  brakeLights: THREE.MeshStandardMaterial | null;
}

interface Props {
  design: TruckDesign;
  params: TruckModelParams;
  hiRes?: boolean;
  castShadow?: boolean;
  headlights?: boolean;
}

// ---------- shared geometries ----------
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  cylLow: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 12, 1, true),
  plane: new THREE.PlaneGeometry(1, 1),
};

const M = {
  dark: new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.8 }),
  tire: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: '#1d3350', roughness: 0.06, metalness: 0.7, envMapIntensity: 1.6 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#e8ecf0', roughness: 0.15, metalness: 1 }),
  alu: new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.35, metalness: 0.8 }),
  grille: new THREE.MeshStandardMaterial({ color: '#202328', roughness: 0.5, metalness: 0.6 }),
  headlight: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6dd', emissiveIntensity: 1.6 }),
  indicator: new THREE.MeshStandardMaterial({ color: '#ff9a1f', emissive: '#ff8a00', emissiveIntensity: 0.8 }),
  amber: new THREE.MeshStandardMaterial({ color: '#ffb52e', emissive: '#ff9a00', emissiveIntensity: 2 }),
  flame: new THREE.MeshBasicMaterial({ color: '#4fd1ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  flameCore: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
};

const RIM: Record<RimStyle, THREE.MeshStandardMaterial> = {
  steel: new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.4, metalness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 1 }),
  black: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.35, metalness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: '#d9a93a', roughness: 0.2, metalness: 1 }),
  neon: new THREE.MeshStandardMaterial({ color: '#0ff', emissive: '#35e0ff', emissiveIntensity: 1.6, roughness: 0.3 }),
};

let glowTex: THREE.Texture | null = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let dhollandiaTex: THREE.Texture | null = null;
let plateTex: THREE.Texture | null = null;

function profileGeometry(pts: [number, number][], depth: number, bevel = 0.05) {
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  // map: shape x -> world z (forward), shape y -> world y, extrude -> world x (centred)
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function usePanelTextures(design: TruckDesign, hiRes: boolean) {
  const keys = (['left', 'right', 'rear', 'door'] as PanelKind[]).map((k) => panelKey(design, k)).join('|');
  const textures = useMemo(() => ({
    left: createPanelTexture(design, 'left', hiRes),
    right: createPanelTexture(design, 'right', hiRes),
    rear: createPanelTexture(design, 'rear', hiRes),
    door: createPanelTexture(design, 'door', hiRes),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [keys, hiRes]);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  return textures;
}

function HeadLight({ y, z }: { y: number; z: number }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (light.current && target.current) light.current.target = target.current;
  }, []);
  return (
    <>
      <spotLight ref={light} position={[0, y, z]} angle={0.55} penumbra={0.6} intensity={80} distance={80} decay={1.1} color="#fff4dd" />
      <object3D ref={target} position={[0, 0, z + 25]} />
    </>
  );
}

const Part = ({ geo = G.box, mat, p, s, r, shadow }: { geo?: THREE.BufferGeometry; mat: THREE.Material; p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; shadow?: boolean }) => (
  <mesh geometry={geo} material={mat} position={p} scale={s} rotation={r} castShadow={shadow} />
);

export const TruckModel = forwardRef<TruckRig, Props>(function TruckModel({ design, params, hiRes = true, castShadow = true, headlights = false }, ref) {
  const bodyRef = useRef<THREE.Group>(null);
  const flamesRef = useRef<THREE.Group>(null);
  const wheelRefs = useRef<THREE.Group[]>([]);
  const frontRefs = useRef<THREE.Group[]>([]);
  const tex = usePanelTextures(design, hiRes);

  const cabStyle = params.cabStyle;
  const wheelR = cabStyle === 'heavy' ? 0.56 : 0.5;
  const ride = cabStyle === 'heavy' ? 0.15 : cabStyle === 'sleek' ? -0.05 : 0;
  const L = params.boxLength;
  const BH = params.boxHeight;
  const W = 2.45;
  const cabW = 2.3;
  const boxFront = 1.95;
  const boxRear = boxFront - L;
  const boxBottom = 1.05 + ride;
  const cabZ0 = 1.98;
  const cabLen = 1.97;
  const cabTop = (cabStyle === 'heavy' ? 3.2 : cabStyle === 'sleek' ? 2.75 : 3.0) + ride;
  const frontAxle = 2.95;
  const rearAxle = boxRear + L * 0.36;

  const mats = useMemo(() => {
    const cab = new THREE.MeshStandardMaterial({ color: design.cabColor, roughness: 0.32, metalness: 0.25 });
    const boxWhite = new THREE.MeshStandardMaterial({ color: design.boxColor, roughness: 0.45, metalness: 0.1 });
    const chassis = new THREE.MeshStandardMaterial({ color: design.chassisColor, roughness: 0.7, metalness: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: design.accentColor, roughness: 0.4, metalness: 0.3 });
    const side = (t: THREE.Texture) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.38, metalness: 0.15 });
    const boxMats = [side(tex.left), side(tex.right), boxWhite, chassis, boxWhite, side(tex.rear)];
    const door = new THREE.MeshStandardMaterial({ map: tex.door, transparent: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
    const brake = new THREE.MeshStandardMaterial({ color: '#a00', emissive: '#ff1a1a', emissiveIntensity: 0.6 });
    const glow = design.underglow
      ? new THREE.MeshBasicMaterial({ color: design.underglow, map: getGlowTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      : null;
    return { cab, boxWhite, chassis, accent, boxMats, door, brake, glow };
  }, [design.cabColor, design.boxColor, design.chassisColor, design.accentColor, design.underglow, tex]);
  useEffect(() => () => {
    Object.values(mats).forEach((m) => {
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
  }, [mats]);

  const geos = useMemo(() => {
    const slant = cabStyle === 'sleek' ? 0.55 : cabStyle === 'heavy' ? 0.15 : 0.23;
    const cab = profileGeometry([
      [0, 0.75 + ride], [cabLen, 0.75 + ride], [cabLen + 0.05, 1.55 + ride], [cabLen, 1.85 + ride],
      [cabLen - slant, cabTop - 0.05], [cabLen - slant - 0.15, cabTop], [0, cabTop],
    ], cabW - 0.1, 0.05);
    const roofTop = boxBottom + BH;
    const deflector = cabStyle === 'sleek'
      ? profileGeometry([[0, cabTop], [cabLen - 0.8, cabTop], [0, cabTop + 0.35]], cabW - 0.3, 0.03)
      : roofTop > cabTop + 0.1
        ? profileGeometry([[0, cabTop - 0.02], [cabLen - 0.45, cabTop - 0.02], [0.05, roofTop + 0.05]], cabW - 0.2, 0.04)
        : null;
    return { cab, deflector, slant };
  }, [cabStyle, ride, cabTop, cabLen, cabW, boxBottom, BH]);
  useEffect(() => () => { geos.cab.dispose(); geos.deflector?.dispose(); }, [geos]);

  if (!dhollandiaTex) dhollandiaTex = createLabelTexture('DHOLLANDIA', '#d9dde3', '#c8102e', 512, 80);
  if (!plateTex) plateTex = createLabelTexture('PHONE TRUCK', '#f7c600', '#111111', 384, 96);

  useImperativeHandle(ref, () => ({
    get body() { return bodyRef.current; },
    get frontWheels() { return frontRefs.current; },
    get allWheels() { return wheelRefs.current; },
    get flames() { return flamesRef.current; },
    brakeLights: mats.brake,
  }), [mats.brake]);

  wheelRefs.current = [];
  frontRefs.current = [];

  const wheel = (x: number, z: number, front: boolean, dual: boolean, key: string) => {
    const side = Math.sign(x);
    const tireW = dual ? 0.56 : 0.32;
    return (
      <group key={key} position={[x, wheelR, z]} ref={(g) => { if (g && front) frontRefs.current.push(g); }}>
        <group ref={(g) => { if (g) wheelRefs.current.push(g); }}>
          <mesh geometry={G.cyl} material={M.tire} rotation={[0, 0, Math.PI / 2]} scale={[wheelR, tireW, wheelR]} castShadow={castShadow} />
          <mesh geometry={G.cylLow} material={RIM[design.rimStyle]} rotation={[0, 0, Math.PI / 2]} position={[side * (tireW / 2 + 0.005), 0, 0]} scale={[wheelR * 0.62, 0.02, wheelR * 0.62]} />
          <mesh geometry={G.cylLow} material={M.chrome} rotation={[0, 0, Math.PI / 2]} position={[side * (tireW / 2 + 0.03), 0, 0]} scale={[wheelR * 0.18, 0.06, wheelR * 0.18]} />
          {/* spokes so rotation is visible */}
          <mesh geometry={G.box} material={M.dark} position={[side * (tireW / 2 + 0.012), 0, 0]} scale={[0.01, wheelR * 1.1, 0.08]} />
          <mesh geometry={G.box} material={M.dark} position={[side * (tireW / 2 + 0.012), 0, 0]} scale={[0.01, 0.08, wheelR * 1.1]} />
        </group>
      </group>
    );
  };

  const wheelX = 1.02;
  const rearX = params.dualRear ? 0.95 : 1.02;
  const cabFront = cabZ0 + cabLen;
  const glassMidY = (1.85 + ride + cabTop - 0.05) / 2;
  const glassH = cabTop - 0.05 - (1.85 + ride);

  return (
    <group>
      <group ref={bodyRef}>
        {/* chassis rails */}
        <Part mat={mats.chassis} p={[0.45, 0.68 + ride, (boxRear + cabFront) / 2]} s={[0.14, 0.25, cabFront - boxRear - 0.3]} />
        <Part mat={mats.chassis} p={[-0.45, 0.68 + ride, (boxRear + cabFront) / 2]} s={[0.14, 0.25, cabFront - boxRear - 0.3]} />

        {/* cargo box */}
        <mesh position={[0, boxBottom + BH / 2, (boxFront + boxRear) / 2]} scale={[W, BH, L]} geometry={G.box} material={mats.boxMats} castShadow={castShadow} receiveShadow />
        {/* aluminium corner posts & rails */}
        {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz], i) => (
          <Part key={i} mat={M.alu} p={[sx * (W / 2 + 0.01), boxBottom + BH / 2, sz > 0 ? boxFront - 0.02 : boxRear + 0.02]} s={[0.08, BH + 0.04, 0.08]} />
        ))}
        {[1, -1].map((sx) => (
          <group key={sx}>
            <Part mat={M.alu} p={[sx * (W / 2 + 0.01), boxBottom + BH, (boxFront + boxRear) / 2]} s={[0.07, 0.07, L]} />
            <Part mat={M.alu} p={[sx * (W / 2 + 0.01), boxBottom, (boxFront + boxRear) / 2]} s={[0.09, 0.12, L]} />
          </group>
        ))}

        {/* cab */}
        <mesh geometry={geos.cab} material={mats.cab} position={[0, 0, cabZ0]} castShadow={castShadow} />
        {geos.deflector && <mesh geometry={geos.deflector} material={cabStyle === 'sleek' ? mats.accent : mats.cab} position={[0, 0, cabZ0]} castShadow={castShadow} />}
        {/* windshield */}
        <mesh geometry={G.plane} material={M.glass} position={[0, glassMidY, cabFront - geos.slant / 2 + 0.06]} rotation={[-Math.atan2(geos.slant, glassH), 0, 0]} scale={[cabW - 0.25, glassH * 1.02, 1]} />
        {/* side windows */}
        {[1, -1].map((sx) => (
          <mesh key={sx} geometry={G.plane} material={M.glass} position={[sx * (cabW / 2 + 0.005), glassMidY + 0.05, cabZ0 + cabLen * 0.6 - 0.05]} rotation={[0, sx * Math.PI / 2, 0]} scale={[cabLen * 0.62, glassH * 0.85, 1]} />
        ))}
        {/* door decals */}
        <mesh geometry={G.plane} material={mats.door} position={[cabW / 2 + 0.01, 1.3 + ride, cabZ0 + cabLen * 0.5]} rotation={[0, Math.PI / 2, 0]} scale={[cabLen * 0.95, 1.05, 1]} />
        <mesh geometry={G.plane} material={mats.door} position={[-cabW / 2 - 0.01, 1.3 + ride, cabZ0 + cabLen * 0.5]} rotation={[0, -Math.PI / 2, 0]} scale={[cabLen * 0.95, 1.05, 1]} />
        {/* door seams + handles */}
        {[1, -1].map((sx) => (
          <group key={sx}>
            <Part mat={M.dark} p={[sx * (cabW / 2 + 0.012), 1.75 + ride, cabZ0 + 0.18]} s={[0.01, 1.9, 0.02]} />
            <Part mat={M.chrome} p={[sx * (cabW / 2 + 0.03), 1.75 + ride, cabZ0 + 0.35]} s={[0.03, 0.05, 0.22]} />
          </group>
        ))}
        {/* front: grille, lights, bumper */}
        <Part mat={M.grille} p={[0, 1.38 + ride, cabFront + 0.04]} s={[1.5, 0.32, 0.04]} />
        <Part mat={mats.accent} p={[0, 1.6 + ride, cabFront + 0.05]} s={[1.6, 0.05, 0.03]} />
        {[1, -1].map((sx) => (
          <group key={sx}>
            <Part mat={M.headlight} p={[sx * 0.88, 1.32 + ride, cabFront + 0.04]} s={[0.42, 0.22, 0.05]} />
            <Part mat={M.indicator} p={[sx * 1.1, 1.32 + ride, cabFront + 0.02]} s={[0.1, 0.22, 0.05]} />
            {/* mirrors */}
            <Part mat={M.dark} p={[sx * 1.3, 2.3 + ride, cabFront - 0.3]} s={[0.35, 0.05, 0.05]} />
            <Part mat={M.dark} p={[sx * 1.47, 2.2 + ride, cabFront - 0.3]} s={[0.07, 0.5, 0.22]} />
            {/* front fenders */}
            <Part mat={M.dark} p={[sx * 1.07, wheelR * 2 + 0.06, frontAxle]} s={[0.36, 0.06, wheelR * 2.3]} />
          </group>
        ))}
        <Part mat={cabStyle === 'heavy' ? M.chrome : M.dark} p={[0, 0.92 + ride, cabFront + 0.1]} s={[cabW + 0.05, 0.3, 0.2]} shadow={castShadow} />
        <mesh geometry={G.plane} position={[0, 0.92 + ride, cabFront + 0.205]} scale={[0.5, 0.12, 1]}>
          <meshStandardMaterial map={plateTex} />
        </mesh>
        {cabStyle === 'heavy' && (
          <group>
            {[1, -1].map((sx) => <Part key={sx} geo={G.cylLow} mat={M.chrome} p={[sx * 0.7, 1.3, cabFront + 0.35]} s={[0.05, 0.9, 0.05]} />)}
            <Part geo={G.cylLow} mat={M.chrome} p={[0, 1.7, cabFront + 0.35]} s={[0.05, 1.5, 0.05]} r={[0, 0, Math.PI / 2]} />
          </group>
        )}
        {/* step under door */}
        {[1, -1].map((sx) => <Part key={sx} mat={M.alu} p={[sx * 1.08, 0.55 + ride, cabZ0 + 0.6]} s={[0.25, 0.05, 0.6]} />)}

        {/* fuel tank & side skirts */}
        <Part geo={G.cyl} mat={M.alu} p={[-0.95, 0.7 + ride, rearAxle + 1.7]} s={[0.28, 1.1, 0.28]} r={[Math.PI / 2, 0, 0]} />
        {design.sideSkirts && [1, -1].map((sx) => (
          <Part key={sx} mat={mats.accent} p={[sx * 1.15, 0.72 + ride, (frontAxle - 0.8 + rearAxle + 0.9) / 2]} s={[0.05, 0.4, Math.max(0.5, frontAxle - 0.8 - (rearAxle + 0.9) - 0.1)]} />
        ))}
        {/* rear mud guards */}
        {[1, -1].map((sx) => <Part key={sx} mat={M.dark} p={[sx * 1.0, wheelR * 2 + 0.08, rearAxle]} s={[0.62, 0.06, wheelR * 2.4]} />)}

        {/* rear: under-run bar, tail lights, DHOLLANDIA tuck-away tail lift */}
        <Part mat={M.alu} p={[0, 0.62 + ride, boxRear + 0.28]} s={[2.25, 0.32, 0.6]} />
        <mesh geometry={G.plane} position={[0, 0.62 + ride, boxRear - 0.021]} rotation={[0, Math.PI, 0]} scale={[1.4, 0.22, 1]}>
          <meshStandardMaterial map={dhollandiaTex} />
        </mesh>
        <Part mat={M.dark} p={[0, 0.9 + ride, boxRear + 0.4]} s={[0.12, 0.3, 0.12]} />
        {[1, -1].map((sx) => (
          <group key={sx}>
            <Part mat={mats.brake} p={[sx * 0.98, 0.98 + ride, boxRear - 0.02]} s={[0.36, 0.14, 0.04]} />
            <Part mat={M.indicator} p={[sx * 0.7, 0.98 + ride, boxRear - 0.02]} s={[0.14, 0.14, 0.04]} />
          </group>
        ))}

        {/* accessories */}
        {design.lightBar && (
          <group position={[0, cabTop + 0.06, cabFront - 0.35]}>
            <Part mat={M.dark} p={[0, 0, 0]} s={[1.7, 0.1, 0.14]} />
            {[-3, -2, -1, 0, 1, 2, 3].map((i) => <Part key={i} mat={M.headlight} p={[i * 0.22, 0, 0.075]} s={[0.15, 0.07, 0.02]} />)}
          </group>
        )}
        {design.beacons && [1, -1].map((sx) => (
          <Part key={sx} geo={G.cylLow} mat={M.amber} p={[sx * 0.9, boxBottom + BH + 0.12, boxFront - 0.3]} s={[0.12, 0.2, 0.12]} />
        ))}
        {headlights && <HeadLight y={1.4 + ride} z={cabFront + 0.3} />}
      </group>

      {/* wheels (not tilted with body) */}
      {wheel(wheelX, frontAxle, true, false, 'fl')}
      {wheel(-wheelX, frontAxle, true, false, 'fr')}
      {wheel(rearX, rearAxle, false, params.dualRear, 'rl')}
      {wheel(-rearX, rearAxle, false, params.dualRear, 'rr')}

      {mats.glow && (
        <mesh geometry={G.plane} material={mats.glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, (boxRear + cabFront) / 2]} scale={[4.2, cabFront - boxRear + 2.5, 1]} renderOrder={1} />
      )}

      {/* nitro flames */}
      <group ref={flamesRef} visible={false} position={[0, 0.65 + ride, boxRear - 0.2]}>
        {[0.55, -0.55].map((x) => (
          <group key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={G.cone} material={M.flame} position={[0, -0.6, 0]} scale={[0.22, 1.2, 0.22]} rotation={[Math.PI, 0, 0]} />
            <mesh geometry={G.cone} material={M.flameCore} position={[0, -0.35, 0]} scale={[0.1, 0.7, 0.1]} rotation={[Math.PI, 0, 0]} />
          </group>
        ))}
      </group>
    </group>
  );
});
