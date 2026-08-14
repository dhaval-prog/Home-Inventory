"use client";

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { AdditiveBlending, Color, DoubleSide, type Group, type Mesh, type MeshStandardMaterial, type ShaderMaterial } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import { yardBoundaryRadius, yardPadHalf, useGroundLayout } from "@/components/three/vegetation";
import type { EnvironmentTarget, WeatherCondition } from "@/lib/three/environment";

interface Bounds {
  centerX: number;
  centerZ: number;
  radius: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* ------------------------------------------------------------------ */
/* Butterflies                                                         */
/* ------------------------------------------------------------------ */

// Base wing color paired with a contrasting wingtip-patch accent, so each
// butterfly reads as an actual patterned wing rather than a flat triangle.
const BUTTERFLY_PALETTE: { base: string; accent: string }[] = [
  { base: "#f2a552", accent: "#7a3d12" },
  { base: "#f5e26b", accent: "#8a6a1a" },
  { base: "#f2f2f5", accent: "#2b2b2b" },
  { base: "#e88fb0", accent: "#7a2f47" },
];

interface ButterflyRuntime {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  hover: number; // seconds remaining in current hover pause
  phase: number;
  bobPhase: number;
  speed: number;
}

function pickWaypoint(waypoints: [number, number][], bounds: Bounds, boundary: number, rand: () => number): [number, number] {
  if (rand() < 0.55 && waypoints.length > 0) {
    const base = waypoints[Math.floor(rand() * waypoints.length)];
    return [base[0] + (rand() - 0.5) * 0.6, base[1] + (rand() - 0.5) * 0.6];
  }
  const angle = rand() * Math.PI * 2;
  const dist = boundary * (0.4 + rand() * 0.55);
  return [bounds.centerX + Math.cos(angle) * dist, bounds.centerZ + Math.sin(angle) * dist];
}

function Butterfly({
  envRef,
  bounds,
  waypoints,
  seed,
  color,
  accentColor,
}: {
  envRef: MutableRefObject<EnvironmentTarget>;
  bounds: Bounds;
  waypoints: [number, number][];
  seed: number;
  color: string;
  accentColor: string;
}) {
  const groupRef = useRef<Group>(null);
  const wingLRef = useRef<Group>(null);
  const wingRRef = useRef<Group>(null);
  const matRef = useRef<MeshStandardMaterial>(null);
  const wingMatLRef = useRef<MeshStandardMaterial>(null);
  const wingMatRRef = useRef<MeshStandardMaterial>(null);
  const accentMatLRef = useRef<MeshStandardMaterial>(null);
  const accentMatRRef = useRef<MeshStandardMaterial>(null);
  const boundary = yardBoundaryRadius(bounds.radius);

  const runtime = useRef<ButterflyRuntime | null>(null);
  if (runtime.current == null) {
    const rand = seededRandom(seed);
    const [tx, tz] = pickWaypoint(waypoints, bounds, boundary, rand);
    runtime.current = {
      x: tx + (rand() - 0.5) * 0.5,
      z: tz + (rand() - 0.5) * 0.5,
      targetX: tx,
      targetZ: tz,
      hover: 0,
      phase: rand() * Math.PI * 2,
      bobPhase: rand() * Math.PI * 2,
      speed: 0.28 + rand() * 0.16,
    };
  }
  const r = runtime.current;

   
  useFrame(({ clock }, delta) => {
    const env = envRef.current;
    const active = env.dayAmount;
    if (!groupRef.current) return;

    if (active < 0.01) {
      groupRef.current.visible = false;
    } else {
      groupRef.current.visible = true;
      const dx = r.targetX - r.x;
      const dz = r.targetZ - r.z;
      const dist = Math.hypot(dx, dz);

      if (r.hover > 0) {
        r.hover -= delta;
      } else if (dist < 0.18) {
        if (Math.random() < 0.4) {
          r.hover = 0.6 + Math.random() * 1.4;
        } else {
          const rand = () => Math.random();
          const [tx, tz] = pickWaypoint(waypoints, bounds, boundary, rand);
          r.targetX = tx;
          r.targetZ = tz;
        }
      } else {
        const invDist = 1 / Math.max(dist, 0.0001);
        const dirX = dx * invDist;
        const dirZ = dz * invDist;
        const wobble = Math.sin(clock.elapsedTime * 2.2 + r.phase) * 0.5;
        r.x += (dirX * r.speed - dirZ * wobble * r.speed) * delta;
        r.z += (dirZ * r.speed + dirX * wobble * r.speed) * delta;
      }

      const baseY = 0.55 + Math.sin(clock.elapsedTime * 1.6 + r.bobPhase) * 0.08;
      groupRef.current.position.set(r.x, baseY, r.z);
      const heading = Math.atan2(r.targetZ - r.z, r.targetX - r.x);
      groupRef.current.rotation.y = -heading + Math.PI / 2;
    }

    const flap = Math.sin(clock.elapsedTime * 13 + r.phase);
    if (wingLRef.current) wingLRef.current.rotation.y = flap * 0.9;
    if (wingRRef.current) wingRRef.current.rotation.y = -flap * 0.9;
    if (matRef.current) matRef.current.opacity = active * 0.95;
    if (wingMatLRef.current) wingMatLRef.current.opacity = active * 0.92;
    if (wingMatRRef.current) wingMatRRef.current.opacity = active * 0.92;
    if (accentMatLRef.current) accentMatLRef.current.opacity = active * 0.9;
    if (accentMatRRef.current) accentMatRRef.current.opacity = active * 0.9;
  });
   

  return (
    <group ref={groupRef} scale={0.11}>
      <mesh>
        <sphereGeometry args={[0.15, 6, 5]} />
        <meshStandardMaterial ref={matRef} color="#2b2b2b" transparent opacity={0} roughness={0.6} />
      </mesh>
      {/* Each wing is a group so the smaller wingtip-patch overlay inherits the flap rotation automatically. */}
      <group ref={wingLRef} position={[-0.05, 0.05, 0]}>
        <mesh>
          <planeGeometry args={[0.55, 0.4]} />
          <meshStandardMaterial ref={wingMatLRef} color={color} transparent opacity={0.92} side={DoubleSide} roughness={0.5} />
        </mesh>
        <mesh position={[-0.14, -0.06, 0.001]}>
          <planeGeometry args={[0.24, 0.16]} />
          <meshStandardMaterial ref={accentMatLRef} color={accentColor} transparent opacity={0.9} side={DoubleSide} roughness={0.5} />
        </mesh>
      </group>
      <group ref={wingRRef} position={[0.05, 0.05, 0]}>
        <mesh>
          <planeGeometry args={[0.55, 0.4]} />
          <meshStandardMaterial ref={wingMatRRef} color={color} transparent opacity={0.92} side={DoubleSide} roughness={0.5} />
        </mesh>
        <mesh position={[0.14, -0.06, 0.001]}>
          <planeGeometry args={[0.24, 0.16]} />
          <meshStandardMaterial ref={accentMatRRef} color={accentColor} transparent opacity={0.9} side={DoubleSide} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 3-6 small butterflies that wander the garden by day — steering toward
 * flower beds/random yard points with a sine wobble for a curved, organic
 * path rather than flying straight across the scene. Fade out smoothly as
 * dayAmount drops toward evening (section 3/15).
 */
export function Butterflies({
  bounds,
  envRef,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  mobile?: boolean;
}) {
  const layout = useGroundLayout(bounds, mobile);
  const waypoints = useMemo<[number, number][]>(() => layout.flowerClusters.map((f) => f.center), [layout]);
  const count = mobile ? 3 : 5;
  const specs = useMemo(() => {
    const rand = seededRandom(919);
    return Array.from({ length: count }, (_, i) => ({
      seed: 920 + i * 17,
      ...BUTTERFLY_PALETTE[Math.floor(rand() * BUTTERFLY_PALETTE.length)],
    }));
  }, [count]);

  return (
    <>
      {specs.map((s, i) => (
        <Butterfly
          key={i}
          envRef={envRef}
          bounds={bounds}
          waypoints={waypoints}
          seed={s.seed}
          color={s.base}
          accentColor={s.accent}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Fireflies                                                            */
/* ------------------------------------------------------------------ */

const FIREFLY_GLOW_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FIREFLY_GLOW_FRAGMENT = `
  uniform vec3 glowColor;
  uniform float glowOpacity;
  varying vec2 vUv;
  void main() {
    float dist = distance(vUv, vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, dist);
    gl_FragColor = vec4(glowColor, alpha * glowOpacity);
  }
`;

const FIREFLY_COLORS = ["#e8e08a", "#d7e894", "#f0d67a"];

interface FireflyRuntime {
  x: number;
  z: number;
  y: number;
  trailX: number;
  trailZ: number;
  trailY: number;
  targetX: number;
  targetZ: number;
  targetY: number;
  flickerPhase: number;
  flickerFreq: number;
  speed: number;
}

function Firefly({ envRef, bounds, seed }: { envRef: MutableRefObject<EnvironmentTarget>; bounds: Bounds; seed: number }) {
  const groupRef = useRef<Group>(null);
  const trailGroupRef = useRef<Group>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const trailMatRef = useRef<ShaderMaterial>(null);
  const boundary = yardBoundaryRadius(bounds.radius);
  const padHalf = yardPadHalf(bounds.radius);
  const color = useMemo(() => new Color(FIREFLY_COLORS[seed % FIREFLY_COLORS.length]), [seed]);
  // A static per-instance size (not the shared env-driven flicker) so the
  // swarm doesn't read as a set of identical clones.
  const sizeScale = useMemo(() => {
    const rand = seededRandom(seed + 500);
    return 0.7 + rand() * 0.7;
  }, [seed]);

  const runtime = useRef<FireflyRuntime | null>(null);
  if (runtime.current == null) {
    const rand = seededRandom(seed);
    const angle = rand() * Math.PI * 2;
    const dist = padHalf * 1.15 + rand() * (boundary - padHalf);
    const x = bounds.centerX + Math.cos(angle) * dist;
    const z = bounds.centerZ + Math.sin(angle) * dist;
    const y = 0.25 + rand() * 0.55;
    runtime.current = {
      x,
      z,
      y,
      trailX: x,
      trailZ: z,
      trailY: y,
      targetX: x,
      targetZ: z,
      targetY: y,
      flickerPhase: rand() * Math.PI * 2,
      flickerFreq: 0.5 + rand() * 0.7,
      speed: 0.1 + rand() * 0.08,
    };
  }
  const r = runtime.current;


  useFrame(({ clock }, delta) => {
    const env = envRef.current;
    const active = env.nightAmount;
    if (!groupRef.current) return;

    if (active < 0.02) {
      groupRef.current.visible = false;
      if (trailGroupRef.current) trailGroupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    if (trailGroupRef.current) trailGroupRef.current.visible = true;

    const dx = r.targetX - r.x;
    const dz = r.targetZ - r.z;
    if (Math.hypot(dx, dz) < 0.12 && Math.random() < 0.01) {
      const angle = Math.random() * Math.PI * 2;
      const dist = padHalf * 1.15 + Math.random() * (boundary - padHalf);
      r.targetX = bounds.centerX + Math.cos(angle) * dist;
      r.targetZ = bounds.centerZ + Math.sin(angle) * dist;
      r.targetY = 0.2 + Math.random() * 0.65;
    }
    r.x += dx * Math.min(1, r.speed * delta);
    r.z += dz * Math.min(1, r.speed * delta);
    r.y += (r.targetY - r.y) * Math.min(1, r.speed * delta * 0.6);
    // The trail lags behind the real position at a slower catch-up rate,
    // leaving a faint smear of where the firefly just was.
    r.trailX += (r.x - r.trailX) * Math.min(1, delta * 1.6);
    r.trailZ += (r.z - r.trailZ) * Math.min(1, delta * 1.6);
    r.trailY += (r.y - r.trailY) * Math.min(1, delta * 1.6);

    const wobbleX = Math.sin(clock.elapsedTime * 0.7 + r.flickerPhase) * 0.06;
    const wobbleZ = Math.cos(clock.elapsedTime * 0.6 + r.flickerPhase) * 0.06;
    groupRef.current.position.set(r.x + wobbleX, r.y, r.z + wobbleZ);
    if (trailGroupRef.current) {
      trailGroupRef.current.position.set(r.trailX + wobbleX * 0.8, r.trailY, r.trailZ + wobbleZ * 0.8);
    }

    // Glow / fade / move / glow again — an eased pulse, not a flat blink.
    const pulse = (Math.sin(clock.elapsedTime * r.flickerFreq + r.flickerPhase) + 1) / 2;
    const eased = pulse * pulse * (3 - 2 * pulse);
    if (matRef.current) {
      matRef.current.uniforms.glowOpacity.value = active * eased * 0.55;
    }
    if (trailMatRef.current) {
      trailMatRef.current.uniforms.glowOpacity.value = active * eased * 0.55 * 0.32;
    }
  });


  return (
    <>
      <group ref={groupRef}>
        <Billboard>
          <mesh scale={sizeScale}>
            <planeGeometry args={[0.22, 0.22]} />
            <shaderMaterial
              ref={matRef}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              uniforms={{ glowColor: { value: color }, glowOpacity: { value: 0 } }}
              vertexShader={FIREFLY_GLOW_VERTEX}
              fragmentShader={FIREFLY_GLOW_FRAGMENT}
              fog={false}
            />
          </mesh>
        </Billboard>
      </group>
      <group ref={trailGroupRef}>
        <Billboard>
          <mesh scale={sizeScale * 0.75}>
            <planeGeometry args={[0.22, 0.22]} />
            <shaderMaterial
              ref={trailMatRef}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              uniforms={{ glowColor: { value: color }, glowOpacity: { value: 0 } }}
              vertexShader={FIREFLY_GLOW_VERTEX}
              fragmentShader={FIREFLY_GLOW_FRAGMENT}
              fog={false}
            />
          </mesh>
        </Billboard>
      </group>
    </>
  );
}

/**
 * 8-15 soft fireflies that take over from the butterflies at night — slow,
 * independently-flickering glows that wander the darker garden areas and
 * stay clear of the house footprint (section 4/15).
 */
export function Fireflies({
  bounds,
  envRef,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  mobile?: boolean;
}) {
  const count = mobile ? 8 : 13;
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => 4100 + i * 31), [count]);
  return (
    <>
      {seeds.map((seed) => (
        <Firefly key={seed} envRef={envRef} bounds={bounds} seed={seed} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dogs                                                                 */
/* ------------------------------------------------------------------ */

function dogTargetCount(weather: WeatherCondition): number {
  switch (weather) {
    case "sunny":
      return 1;
    case "partly-cloudy":
      return 1;
    case "cloudy":
      return 2;
    case "rain":
      return 3;
    case "storm":
      return 0;
    default:
      return 1;
  }
}

function dogBaseSpeed(weather: WeatherCondition): number {
  switch (weather) {
    case "rain":
      return 1.15;
    case "storm":
      return 0.55;
    case "cloudy":
      return 0.42;
    case "partly-cloudy":
      return 0.38;
    default:
      return 0.3;
  }
}

interface DogSpec {
  size: number;
  bodyColor: string;
  earColor: string;
  speedMul: number;
  gaitFreq: number;
  slotIndex: number;
}

interface DogRuntime {
  x: number;
  z: number;
  facing: number;
  targetX: number;
  targetZ: number;
  activeAmt: number;
  gaitPhase: number;
  pauseTimer: number;
  shakeTimer: number;
  shakeUntil: number;
}

function DogModel({
  spec,
  runtime,
  bodyMatRef,
}: {
  spec: DogSpec;
  runtime: MutableRefObject<DogRuntime | null>;
  bodyMatRef: MutableRefObject<MeshStandardMaterial | null>;
}) {
  const legFLRef = useRef<Mesh>(null);
  const legFRRef = useRef<Mesh>(null);
  const legBLRef = useRef<Mesh>(null);
  const legBRRef = useRef<Mesh>(null);
  const tailRef = useRef<Mesh>(null);

  // Reads the shared runtime ref every frame (not during render) to drive the
  // trot cycle — front-left/back-right swing together, front-right/back-left
  // opposite, a classic four-beat gait, speed/amplitude following activeAmt.
   
  useFrame(() => {
    const r = runtime.current;
    if (!r) return;
    const legAmp = 0.55 * Math.min(1, 0.3 + r.activeAmt);
    const legSwing = Math.sin(r.gaitPhase) * legAmp;
    const legSwingOpp = Math.sin(r.gaitPhase + Math.PI) * legAmp;
    const tailWag = Math.sin(r.gaitPhase * 1.7) * 0.5;
    if (legFLRef.current) legFLRef.current.rotation.x = legSwing;
    if (legBRRef.current) legBRRef.current.rotation.x = legSwing;
    if (legFRRef.current) legFRRef.current.rotation.x = legSwingOpp;
    if (legBLRef.current) legBLRef.current.rotation.x = legSwingOpp;
    if (tailRef.current) tailRef.current.rotation.z = 0.9 + tailWag;
  });
   

  return (
    <group scale={spec.size}>
      {/* Body: a horizontal capsule reads far rounder than a box at this small scale. */}
      <mesh position={[0, 0.22, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.1, 0.22, 4, 8]} />
        <meshStandardMaterial ref={bodyMatRef} color={spec.bodyColor} roughness={0.85} />
      </mesh>
      <mesh position={[0.24, 0.28, 0]} scale={[1.15, 1, 0.95]} castShadow>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color={spec.bodyColor} roughness={0.85} />
      </mesh>
      <mesh position={[0.34, 0.25, 0]} scale={[1.3, 0.85, 0.85]} castShadow>
        <sphereGeometry args={[0.05, 8, 7]} />
        <meshStandardMaterial color={spec.bodyColor} roughness={0.85} />
      </mesh>
      <mesh position={[0.19, 0.37, 0.06]} rotation={[0, 0, -0.3]} castShadow>
        <coneGeometry args={[0.04, 0.09, 5]} />
        <meshStandardMaterial color={spec.earColor} roughness={0.9} />
      </mesh>
      <mesh position={[0.19, 0.37, -0.06]} rotation={[0, 0, -0.3]} castShadow>
        <coneGeometry args={[0.04, 0.09, 5]} />
        <meshStandardMaterial color={spec.earColor} roughness={0.9} />
      </mesh>
      <mesh ref={legFLRef} position={[0.15, 0.12, 0.06]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 5]} />
        <meshStandardMaterial color={spec.earColor} roughness={0.9} />
      </mesh>
      <mesh ref={legFRRef} position={[0.15, 0.12, -0.06]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 5]} />
        <meshStandardMaterial color={spec.earColor} roughness={0.9} />
      </mesh>
      <mesh ref={legBLRef} position={[-0.15, 0.12, 0.06]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.2, 5]} />
        <meshStandardMaterial color={spec.earColor} roughness={0.9} />
      </mesh>
      <mesh ref={legBRRef} position={[-0.15, 0.12, -0.06]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.2, 5]} />
        <meshStandardMaterial color={spec.earColor} roughness={0.9} />
      </mesh>
      <mesh ref={tailRef} position={[-0.24, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.03, 0.22, 5]} />
        <meshStandardMaterial color={spec.bodyColor} roughness={0.85} />
      </mesh>
    </group>
  );
}

function Dog({
  spec,
  envRef,
  bounds,
  weather,
}: {
  spec: DogSpec;
  envRef: MutableRefObject<EnvironmentTarget>;
  bounds: Bounds;
  weather: WeatherCondition;
}) {
  const groupRef = useRef<Group>(null);
  const bodyMatRef = useRef<MeshStandardMaterial | null>(null);
  const boundary = yardBoundaryRadius(bounds.radius);
  const padHalf = yardPadHalf(bounds.radius);
  const shelter: [number, number] = [bounds.centerX + padHalf * 0.9, bounds.centerZ - padHalf * 0.9];
  const bodyDry = useMemo(() => new Color(spec.bodyColor), [spec.bodyColor]);
  const bodyWet = useMemo(() => bodyDry.clone().multiplyScalar(0.6), [bodyDry]);

  const runtime = useRef<DogRuntime | null>(null);
  if (runtime.current == null) {
    const rand = seededRandom(6100 + spec.slotIndex * 53);
    runtime.current = {
      x: shelter[0],
      z: shelter[1],
      facing: 0,
      targetX: shelter[0],
      targetZ: shelter[1],
      activeAmt: 0,
      gaitPhase: rand() * Math.PI * 2,
      pauseTimer: 0,
      shakeTimer: 4 + rand() * 4,
      shakeUntil: 0,
    };
  }
  const r = runtime.current;

   
  useFrame(({ clock }, delta) => {
    const env = envRef.current;
    const rawCount = dogTargetCount(weather) * (1 - env.nightAmount);
    const slotTarget = clamp01(rawCount - spec.slotIndex);
    r.activeAmt = lerpNum(r.activeAmt, slotTarget, Math.min(1, delta * 0.6));

    const sheltering = slotTarget < 0.5;
    if (sheltering) {
      r.targetX = shelter[0];
      r.targetZ = shelter[1];
    } else {
      r.pauseTimer -= delta;
      const dx = r.targetX - r.x;
      const dz = r.targetZ - r.z;
      if (r.pauseTimer <= 0 && Math.hypot(dx, dz) < 0.3) {
        if (Math.random() < 0.15) {
          r.pauseTimer = 1 + Math.random() * 2; // occasional slow-down / direction change pause
        }
        const angle = Math.random() * Math.PI * 2;
        const dist = padHalf * 1.2 + Math.random() * (boundary - padHalf) * 1.3;
        r.targetX = bounds.centerX + Math.cos(angle) * dist;
        r.targetZ = bounds.centerZ + Math.sin(angle) * dist;
      }
    }

    const speedMul = r.pauseTimer > 0 ? 0.25 : 1;
    const speed = dogBaseSpeed(weather) * spec.speedMul * speedMul * (0.4 + r.activeAmt * 0.6);
    const dx = r.targetX - r.x;
    const dz = r.targetZ - r.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.02) {
      const invDist = 1 / dist;
      r.x += dx * invDist * speed * delta;
      r.z += dz * invDist * speed * delta;
      const heading = Math.atan2(dz, dx);
      let diff = heading - r.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      r.facing += diff * Math.min(1, delta * 4);
    }
    r.gaitPhase += delta * (6 + speed * 4) * spec.gaitFreq;

    if (groupRef.current) {
      groupRef.current.visible = r.activeAmt > 0.02;
      groupRef.current.position.set(r.x, 0, r.z);
      groupRef.current.rotation.y = -r.facing + Math.PI / 2;
      const wetness = env.groundWetness;
      r.shakeTimer -= delta;
      if (r.shakeTimer <= 0 && wetness > 0.3) {
        r.shakeTimer = 6 + Math.random() * 5;
        r.shakeUntil = clock.elapsedTime + 0.5;
      }
      const shaking = clock.elapsedTime < r.shakeUntil;
      const shakeWiggle = shaking ? Math.sin(clock.elapsedTime * 40) * 0.06 : 0;
      groupRef.current.scale.set(r.activeAmt * (1 + shakeWiggle), r.activeAmt, r.activeAmt * (1 - shakeWiggle));
      if (bodyMatRef.current) {
        bodyMatRef.current.color.copy(bodyDry).lerp(bodyWet, wetness * 0.85);
      }
    }
  });
   

  return (
    <group ref={groupRef}>
      <DogModel spec={spec} runtime={runtime} bodyMatRef={bodyMatRef} />
    </group>
  );
}

const DOG_PALETTE: { bodyColor: string; earColor: string }[] = [
  { bodyColor: "#b9814f", earColor: "#7a5230" },
  { bodyColor: "#3a3530", earColor: "#221f1c" },
  { bodyColor: "#e8dcc4", earColor: "#c2a877" },
];

/**
 * 3 dog "slots" whose active count/speed continuously follows the weather
 * (resting/walking on a calm day, running in rain) and fades toward zero at
 * night — sections 5-7. Rather than popping away in a storm, a slot that's
 * losing activity redirects toward a sheltered corner near the house and
 * shrinks out once it arrives, instead of vanishing mid-lawn.
 */
export function Dogs({
  bounds,
  envRef,
  weather,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  weather: WeatherCondition;
  mobile?: boolean;
}) {
  const specs = useMemo<DogSpec[]>(
    () => [
      { size: 0.85, ...DOG_PALETTE[0], speedMul: 0.9, gaitFreq: 0.95, slotIndex: 0 },
      { size: 1.05, ...DOG_PALETTE[1], speedMul: 1.05, gaitFreq: 1.05, slotIndex: 1 },
      { size: 0.7, ...DOG_PALETTE[2], speedMul: 1.15, gaitFreq: 1.15, slotIndex: 2 },
    ],
    []
  );

  if (mobile) return null;

  return (
    <>
      {specs.map((spec) => (
        <Dog key={spec.slotIndex} spec={spec} envRef={envRef} bounds={bounds} weather={weather} />
      ))}
    </>
  );
}
