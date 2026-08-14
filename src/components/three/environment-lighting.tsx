"use client";

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, type AmbientLight, type DirectionalLight, type Fog, type HemisphereLight, type Mesh, type MeshStandardMaterial, type PointLight } from "three";
import { GlowSprite } from "@/components/three/glow-sprite";
import type { EnvironmentTarget } from "@/lib/three/environment";

interface Bounds {
  centerX: number;
  centerZ: number;
  radius: number;
}

/** Drives scene.background/scene.fog from the environment state every frame. */
export function SceneAtmosphere({ envRef, bounds }: { envRef: MutableRefObject<EnvironmentTarget>; bounds: Bounds }) {
  const { scene } = useThree();

  // Mutating scene.background/scene.fog in place is the standard r3f pattern
  // for animating them (matching how drei's own environment helpers work) —
  // the alternative, replacing them wholesale every frame, would fight the
  // <color>/<fog> elements that own those slots.
  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    const env = envRef.current;
    const bg = scene.background;
    if (bg && "copy" in bg) (bg as { copy: (c: unknown) => void }).copy(env.bgColor);

    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.color.copy(env.fogColor);
      fog.near = Math.max(0.1, bounds.radius * env.fogNearFactor);
      fog.far = Math.max(fog.near + 1, bounds.radius * env.fogFarFactor);
    }
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

/** Sun + moon (directional) and sky/ambient fill lights, all ref-driven from environment state. */
export function DynamicLights({ envRef, bounds, mobile }: { envRef: MutableRefObject<EnvironmentTarget>; bounds: Bounds; mobile: boolean }) {
  const sunRef = useRef<DirectionalLight>(null);
  const moonRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);
  const ambientRef = useRef<AmbientLight>(null);
  const dist = Math.max(bounds.radius * 2.2, 14);

  useFrame(() => {
    const env = envRef.current;

    if (sunRef.current) {
      const l = sunRef.current;
      l.position.set(
        bounds.centerX + env.sunDirection[0] * dist,
        Math.max(env.sunDirection[1], 0.03) * dist,
        bounds.centerZ + env.sunDirection[2] * dist
      );
      l.target.position.set(bounds.centerX, 0, bounds.centerZ);
      l.target.updateMatrixWorld();
      l.intensity = env.sunIntensity * 1.7;
      l.color.copy(env.sunColor);
    }
    if (moonRef.current) {
      const l = moonRef.current;
      l.position.set(
        bounds.centerX - env.sunDirection[0] * dist,
        Math.max(-env.sunDirection[1], 0.03) * dist,
        bounds.centerZ - env.sunDirection[2] * dist
      );
      l.target.position.set(bounds.centerX, 0, bounds.centerZ);
      l.target.updateMatrixWorld();
      l.intensity = env.moonIntensity;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(env.hemiSkyColor);
      hemiRef.current.groundColor.copy(env.hemiGroundColor);
      hemiRef.current.intensity = 0.32 + env.ambientIntensity * 0.4;
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = env.ambientIntensity * 0.5;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} intensity={0.5} />
      <ambientLight ref={ambientRef} intensity={0.2} />
      <directionalLight
        ref={sunRef}
        intensity={0}
        castShadow={!mobile}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-bounds.radius}
        shadow-camera-right={bounds.radius}
        shadow-camera-top={bounds.radius}
        shadow-camera-bottom={-bounds.radius}
        shadow-bias={-0.0015}
      />
      <directionalLight ref={moonRef} intensity={0} color="#aebeee" />
    </>
  );
}

function HouseLight({ envRef, x, z }: { envRef: MutableRefObject<EnvironmentTarget>; x: number; z: number }) {
  const lightRef = useRef<PointLight>(null);
  useFrame(() => {
    if (lightRef.current) lightRef.current.intensity = envRef.current.houseLightIntensity * 0.9;
  });
  return (
    <>
      <pointLight ref={lightRef} position={[x, 1.1, z]} color="#ffd8a0" intensity={0} distance={4} decay={2} />
      <GlowSprite
        position={[x, 1.1, z]}
        color="#ffd8a0"
        size={0.7}
        envRef={envRef}
        select={(e) => e.houseLightIntensity}
        maxOpacity={0.4}
      />
    </>
  );
}

/** A warm glow near each room's center — reads as interior light through the windows at night, without touching the room/wall geometry itself. */
export function HouseLights({
  envRef,
  layout,
}: {
  envRef: MutableRefObject<EnvironmentTarget>;
  layout: { room: { id: string }; x: number; z: number }[];
}) {
  return (
    <>
      {layout.map(({ room, x, z }) => (
        <HouseLight key={room.id} envRef={envRef} x={x} z={z} />
      ))}
    </>
  );
}

/** A slim modern residential lamp post: dark pole, small warm fixture, and a soft light pool on the ground that brightens/spreads when the ground is wet. */
function OutdoorLight({ envRef, x, z }: { envRef: MutableRefObject<EnvironmentTarget>; x: number; z: number }) {
  const lightRef = useRef<PointLight>(null);
  const bulbRef = useRef<Mesh>(null);
  const poolRef = useRef<Mesh>(null);
  const poolMatRef = useRef<MeshStandardMaterial>(null);
  const poolDry = useMemo(() => new Color("#ffcf8a"), []);
  const poolWet = useMemo(() => new Color("#fff2d6"), []);

   
  useFrame(() => {
    const env = envRef.current;
    const intensity = env.outdoorLightIntensity;
    if (lightRef.current) lightRef.current.intensity = intensity * 0.6;
    if (bulbRef.current) {
      const mat = bulbRef.current.material as MeshStandardMaterial;
      mat.emissiveIntensity = intensity * 1.4;
    }
    if (poolRef.current && poolMatRef.current) {
      // Rain pools light around the base of each lamp rather than staying a
      // tight dry circle — a cheap stand-in for a wet-ground reflection.
      const wetSpread = 1 + env.groundWetness * 0.6;
      poolRef.current.scale.set(wetSpread, wetSpread, 1);
      poolMatRef.current.opacity = intensity * (0.22 + env.groundWetness * 0.2);
      poolMatRef.current.color.copy(poolDry).lerp(poolWet, env.groundWetness);
    }
  });
   

  return (
    <group position={[x, 0, z]}>
      {/* Ground light pool */}
      <mesh ref={poolRef} position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshStandardMaterial ref={poolMatRef} color="#ffcf8a" transparent opacity={0} depthWrite={false} roughness={1} />
      </mesh>

      {/* Slim pole */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.56, 8]} />
        <meshStandardMaterial color="#2b2c33" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Small fixture housing */}
      <mesh position={[0, 0.58, 0]} castShadow>
        <coneGeometry args={[0.05, 0.08, 8]} />
        <meshStandardMaterial color="#2b2c33" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Warm bulb — self-illuminated via emissive so it visibly glows even before the point light/GlowSprite bloom kicks in */}
      <mesh ref={bulbRef} position={[0, 0.53, 0]}>
        <sphereGeometry args={[0.032, 10, 8]} />
        <meshStandardMaterial color="#3a2c18" emissive="#ffcf8a" emissiveIntensity={0} roughness={0.5} />
      </mesh>

      <pointLight ref={lightRef} position={[0, 0.55, 0]} color="#ffcf8a" intensity={0} distance={2.5} decay={2} />
      <GlowSprite
        position={[0, 0.55, 0]}
        color="#ffcf8a"
        size={0.35}
        envRef={envRef}
        select={(e) => e.outdoorLightIntensity}
        maxOpacity={0.5}
      />
    </group>
  );
}

/** Elegant residential lamp posts around the yard perimeter/boundary — off by day, gradually glowing on at dusk (section 8-11). */
export function OutdoorLights({ envRef, bounds }: { envRef: MutableRefObject<EnvironmentTarget>; bounds: Bounds }) {
  const positions = useMemo(() => {
    const r = bounds.radius * 1.25;
    const count = 8;
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      return [bounds.centerX + Math.cos(a) * r, bounds.centerZ + Math.sin(a) * r] as [number, number];
    });
  }, [bounds.centerX, bounds.centerZ, bounds.radius]);

  return (
    <>
      {positions.map(([x, z], i) => (
        <OutdoorLight key={i} envRef={envRef} x={x} z={z} />
      ))}
    </>
  );
}
