"use client";

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MeshBasicMaterial, type Group } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import type { EnvironmentTarget } from "@/lib/three/environment";

interface Puff {
  offset: [number, number, number];
  parts: { pos: [number, number, number]; scale: number }[];
}

function makePuffs(count: number, spread: number, seed: number): Puff[] {
  const rand = seededRandom(seed);
  const puffs: Puff[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = spread * (0.35 + rand() * 0.65);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const y = spread * 0.1 + rand() * spread * 0.06;
    const baseScale = 1.6 + rand() * 2.4;
    const partCount = 2 + Math.floor(rand() * 2);
    const parts = Array.from({ length: partCount }, (_, j) => ({
      pos: [(rand() - 0.5) * baseScale * 0.9, (rand() - 0.5) * baseScale * 0.22, (rand() - 0.5) * baseScale * 0.7] as [
        number,
        number,
        number,
      ],
      scale: baseScale * (0.55 + rand() * 0.5) * (j === 0 ? 1.15 : 1),
    }));
    puffs.push({ offset: [x, y, z], parts });
  }
  return puffs;
}

function CloudLayer({
  envRef,
  center,
  layerRadius,
  height,
  speed,
  count,
  seed,
  opacityScale,
}: {
  envRef: MutableRefObject<EnvironmentTarget>;
  center: [number, number];
  layerRadius: number;
  height: number;
  speed: number;
  count: number;
  seed: number;
  opacityScale: number;
}) {
  const groupRef = useRef<Group>(null);
  const puffs = useMemo(() => makePuffs(count, layerRadius, seed), [count, layerRadius, seed]);
  // One material shared by every part in this layer — they all animate
  // identically (same opacity/color target), so there's no need for N
  // separate material instances/draw-call state changes.
  const material = useMemo(
    () => new MeshBasicMaterial({ color: new Color("#ffffff"), transparent: true, opacity: 0, depthWrite: false, fog: false }),
    []
  );

  // Mutating the shared material in place (rather than replacing it) avoids
  // reallocating a Material every frame; same established r3f pattern as the
  // scene's other environment-driven refs.
  /* eslint-disable react-hooks/immutability */
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * speed;
      groupRef.current.position.set(center[0], height, center[1]);
    }
    // env.cloudOpacity is already smoothed frame-rate-independently by
    // useEnvironment — assigning it directly here (rather than lerping
    // toward it a second time with a fixed per-frame step) avoids a
    // transition that's implicitly tied to frame rate rather than time.
    const env = envRef.current;
    material.opacity = env.cloudOpacity * opacityScale;
    // Heavy coverage (overcast/storm) should read as brooding grey, not
    // bright white — blend toward the environment's precomputed dark-cloud
    // tone as coverage climbs past half, rather than always using the
    // (lit-topside) base cloud color.
    const darkT = Math.max(0, Math.min(1, (env.cloudCoverage - 0.5) / 0.45));
    material.color.copy(env.cloudColor).lerp(env.cloudDarkColor, darkT * 0.75);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={groupRef}>
      {puffs.map((puff, pi) => (
        <group key={pi} position={puff.offset}>
          {puff.parts.map((part, i) => (
            <mesh key={i} position={part.pos} scale={part.scale} material={material}>
              <sphereGeometry args={[1, 8, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Three independent depth layers drifting at different speeds (section 16).
 * Each layer is one rotating group — cheap (a single transform update per
 * layer per frame) and loops forever with no wraparound bookkeeping needed.
 *
 * Heights/radii are deliberately modest multiples of `radius` (not multiples
 * greater than 1): the dashboard/home camera is a low, downward-tilted
 * "dollhouse" framing (see CameraRig in home-scene.tsx), not a ground-level
 * view looking up into open sky — anything positioned much above the yard's
 * own horizon line falls outside its view frustum and never appears at all
 * (verified empirically: puffs positioned at radius*1+ heights were
 * invisible even forced to full opacity/a contrasting color).
 */
export function Clouds({
  envRef,
  center,
  radius,
  lowQuality = false,
}: {
  envRef: MutableRefObject<EnvironmentTarget>;
  center: [number, number];
  radius: number;
  lowQuality?: boolean;
}) {
  const scale = lowQuality ? 0.55 : 1;
  return (
    <>
      <CloudLayer
        envRef={envRef}
        center={center}
        layerRadius={radius * 1.8}
        height={radius * 0.52}
        speed={0.006}
        count={Math.round(6 * scale)}
        seed={11}
        opacityScale={0.7}
      />
      <CloudLayer
        envRef={envRef}
        center={center}
        layerRadius={radius * 1.4}
        height={radius * 0.42}
        speed={0.012}
        count={Math.round(5 * scale)}
        seed={37}
        opacityScale={0.9}
      />
      <CloudLayer
        envRef={envRef}
        center={center}
        layerRadius={radius * 1.05}
        height={radius * 0.34}
        speed={0.02}
        count={Math.round(4 * scale)}
        seed={59}
        opacityScale={1}
      />
    </>
  );
}
