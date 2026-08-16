"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import type { EnvironmentTarget } from "@/lib/three/environment";

const dummy = new Object3D();

const LEAF_COLORS = ["#c96b3f", "#d98a4a", "#b8532f", "#e0a25c", "#8a4a2a"];

interface Leaf {
  x: number;
  z: number;
  y: number;
  fallSpeed: number;
  swayPhase: number;
  swaySpeed: number;
  spinSpeed: number;
  colorIndex: number;
}

/**
 * A light drift of autumn leaves — always-on ambient atmosphere in that
 * season (independent of the weather condition, unlike rain/snow), reusing
 * the same reusable-InstancedMesh pattern as Rain (section 14/27).
 */
export function FallingLeaves({
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
  const count = lowQuality ? 30 : 60;
  const area = radius * 2.4;
  const topY = radius * 0.85;

  const leavesRef = useRef<Leaf[] | null>(null);
  if (leavesRef.current == null) {
    const rand = seededRandom(701);
    leavesRef.current = Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * area,
      z: (rand() - 0.5) * area,
      y: rand() * topY,
      fallSpeed: 0.35 + rand() * 0.3,
      swayPhase: rand() * Math.PI * 2,
      swaySpeed: 0.6 + rand() * 0.8,
      spinSpeed: 1.5 + rand() * 2.5,
      colorIndex: Math.floor(rand() * LEAF_COLORS.length),
    }));
  }
  const leaves = leavesRef.current;

  // Per-instance color variety (autumn palette), set once — leaves keep the
  // same color for their whole lifetime, so this never needs to run per frame.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = new Color();
    leaves.forEach((l, i) => {
      c.set(LEAF_COLORS[l.colorIndex]);
      mesh.setColorAt(i, c);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Runs once on mount only — `leaves` is a stable lazily-initialized ref
    // value, not a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(({ clock }, delta) => {
    const env = envRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const active = env.season === "autumn";
    mesh.visible = active;
    if (!active) return;

    const t = clock.elapsedTime;
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      l.y -= l.fallSpeed * delta;
      if (l.y < 0) {
        l.y = topY;
        l.x = (Math.random() - 0.5) * area;
        l.z = (Math.random() - 0.5) * area;
      }
      const sway = Math.sin(t * l.swaySpeed + l.swayPhase) * (0.5 + env.windStrength * 0.8);
      dummy.position.set(center[0] + l.x + sway, l.y, center[1] + l.z + Math.cos(t * l.swaySpeed * 0.7 + l.swayPhase) * 0.3);
      dummy.rotation.set(t * l.spinSpeed * 0.4, t * l.spinSpeed, t * l.spinSpeed * 0.6);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.07, 0.008, 0.09]} />
      <meshStandardMaterial color={LEAF_COLORS[0]} roughness={0.9} />
    </instancedMesh>
  );
}

interface Snowflake {
  x: number;
  z: number;
  y: number;
  fallSpeed: number;
  swayPhase: number;
  swaySpeed: number;
}

/**
 * Slow, gentle snowfall replacing rain when winter's precipitation is cold
 * enough to be snow instead (season === "winter" — see rain.tsx, which hides
 * itself in that case so the two are mutually exclusive).
 */
export function Snow({
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
  const count = lowQuality ? 120 : 260;
  const area = radius * 2.6;
  const topY = radius * 1.2;

  const flakesRef = useRef<Snowflake[] | null>(null);
  if (flakesRef.current == null) {
    const rand = seededRandom(919);
    flakesRef.current = Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * area,
      z: (rand() - 0.5) * area,
      y: rand() * topY,
      fallSpeed: 0.5 + rand() * 0.5,
      swayPhase: rand() * Math.PI * 2,
      swaySpeed: 0.5 + rand() * 0.6,
    }));
  }
  const flakes = flakesRef.current;

  useFrame(({ clock }, delta) => {
    const env = envRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const active = env.season === "winter" && env.rainIntensity > 0.02;
    mesh.visible = active;
    if (!active) return;

    const t = clock.elapsedTime;
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y -= f.fallSpeed * delta;
      if (f.y < 0) {
        f.y = topY;
        f.x = (Math.random() - 0.5) * area;
        f.z = (Math.random() - 0.5) * area;
      }
      const sway = Math.sin(t * f.swaySpeed + f.swayPhase) * (0.4 + env.windStrength * 0.5);
      dummy.position.set(center[0] + f.x + sway, f.y, center[1] + f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.max(1, Math.round(count * env.rainIntensity));
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.018, 6, 5]} />
      <meshBasicMaterial color="#f5f9ff" transparent opacity={0.85} depthWrite={false} fog={false} />
    </instancedMesh>
  );
}
