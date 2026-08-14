"use client";

import { useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type InstancedMesh, type PointLight } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import type { EnvironmentTarget } from "@/lib/three/environment";

const dummy = new Object3D();
const WIND_X = 0.6; // subtle horizontal drift so streaks aren't perfectly vertical

interface Drop {
  x: number;
  z: number;
  y: number;
  speed: number;
  length: number;
}

/**
 * A single reusable InstancedMesh of raindrop streaks (section 27:
 * instancing, no per-frame object creation). The instance buffer is mutated
 * in place every frame; visible instance count scales with rain intensity
 * so the effect fades in/out smoothly rather than popping in at full force.
 */
export function Rain({
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
  const meshRef = useRef<InstancedMesh>(null);
  const count = lowQuality ? 220 : 480;
  const area = radius * 2.6;
  const topY = radius * 1.4;

  // Lazily-initialized ref (not useMemo) since useFrame mutates its contents
  // every frame — a ref is the correct place for that, a memoized value isn't.
  const dropsRef = useRef<Drop[] | null>(null);
  if (dropsRef.current == null) {
    const rand = seededRandom(13);
    dropsRef.current = Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * area,
      z: (rand() - 0.5) * area,
      y: rand() * topY,
      speed: 9 + rand() * 5,
      length: 0.35 + rand() * 0.25,
    }));
  }
  const drops = dropsRef.current;

  useFrame((_, delta) => {
    const env = envRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const active = env.rainIntensity > 0.02;
    mesh.visible = active;
    if (!active) return;

    // Section 14: the same global wind scalar that sways trees/grass also
    // slants the rain further in a storm's gusts, rather than a fixed drift.
    const windX = WIND_X * (0.5 + env.windStrength * 1.1);

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y -= d.speed * delta;
      d.x += windX * delta;
      if (d.y < 0) {
        d.y = topY;
        d.x = (Math.random() - 0.5) * area;
        d.z = (Math.random() - 0.5) * area;
      }
      dummy.position.set(center[0] + d.x, d.y, center[1] + d.z);
      dummy.rotation.z = -Math.atan2(windX, d.speed);
      dummy.scale.set(1, d.length, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.max(1, Math.round(count * env.rainIntensity));
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <cylinderGeometry args={[0.006, 0.006, 1, 3]} />
      <meshBasicMaterial color="#bcd4e8" transparent opacity={0.35} depthWrite={false} fog={false} />
    </instancedMesh>
  );
}

/**
 * Occasional, brief, random storm-lightning flash — a point light spiking
 * for a handful of frames then decaying, never a continuous strobe.
 */
export function Lightning({
  envRef,
  center,
  radius,
}: {
  envRef: MutableRefObject<EnvironmentTarget>;
  center: [number, number];
  radius: number;
}) {
  const lightRef = useRef<PointLight>(null);
  const flash = useRef(0);
  const timer = useRef(0);
  // First strike always ~3.5s after storm conditions begin; useFrame below
  // re-randomizes the interval for every subsequent strike.
  const nextStrike = useRef(3.5);

  useFrame((_, delta) => {
    const env = envRef.current;
    const light = lightRef.current;
    if (!light) return;

    if (!env.lightningEnabled) {
      flash.current = 0;
      light.intensity = 0;
      return;
    }

    timer.current += delta;
    if (timer.current > nextStrike.current) {
      timer.current = 0;
      nextStrike.current = 3 + Math.random() * 6;
      flash.current = 6 + Math.random() * 4;
      light.position.set(
        center[0] + (Math.random() - 0.5) * radius,
        radius * 2,
        center[1] + (Math.random() - 0.5) * radius
      );
    }
    flash.current *= 0.78;
    light.intensity = flash.current;
  });

  return <pointLight ref={lightRef} color="#dce6ff" intensity={0} distance={radius * 8} decay={1.5} />;
}
