"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type Group, type InstancedMesh, type MeshStandardMaterial } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import type { EnvironmentTarget } from "@/lib/three/environment";

interface Bounds {
  centerX: number;
  centerZ: number;
  radius: number;
}

const dummy = new Object3D();

/** Shared with Yard (home-scene.tsx) so the fence, trees and ground detail all agree on where the house foundation ends. */
export function yardPadHalf(radius: number): number {
  return (radius * 1.18) / 2;
}

/** Shared with Yard (home-scene.tsx) so the fence, trees and ground detail all agree on where the plot boundary sits. */
export function yardBoundaryRadius(radius: number): number {
  return yardPadHalf(radius) + 0.55;
}

const TRUNK_COLORS = ["#8a6444", "#7c5a3d", "#93714f", "#846043"];
const FOLIAGE_COLORS = ["#5f9155", "#6fa15f", "#4f8a52", "#7aab68", "#5a8f6a", "#699a5c"];

type TreeShape = "conical" | "round" | "sparse";

interface TreeSpec {
  position: [number, number, number];
  scale: number;
  trunkHeight: number;
  trunkRadius: number;
  trunkColor: string;
  shape: TreeShape;
  foliageColor: string;
  foliageColor2: string;
  foliageRadius: number;
  lean: [number, number];
  windPhase: number;
  windFreq: number;
  branch: boolean;
}

function makeTreeSpecs(bounds: Bounds, count: number): TreeSpec[] {
  const rand = seededRandom(211);
  const boundary = yardBoundaryRadius(bounds.radius);
  const specs: TreeSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Roughly-even angular spacing, then jittered so it never reads as a ring/grid.
    const baseAngle = (i / count) * Math.PI * 2;
    const angle = baseAngle + (rand() - 0.5) * ((Math.PI * 2) / count) * 1.4;
    const dist = boundary + 0.1 + rand() * 2.5; // some hug the fence, some sit further back as background
    const shapes: TreeShape[] = ["conical", "round", "sparse"];
    specs.push({
      position: [bounds.centerX + Math.cos(angle) * dist, 0, bounds.centerZ + Math.sin(angle) * dist],
      scale: 0.75 + rand() * 0.55,
      trunkHeight: 0.42 + rand() * 0.34,
      trunkRadius: 0.055 + rand() * 0.03,
      trunkColor: TRUNK_COLORS[Math.floor(rand() * TRUNK_COLORS.length)],
      shape: shapes[Math.floor(rand() * shapes.length)],
      foliageColor: FOLIAGE_COLORS[Math.floor(rand() * FOLIAGE_COLORS.length)],
      foliageColor2: FOLIAGE_COLORS[Math.floor(rand() * FOLIAGE_COLORS.length)],
      foliageRadius: 0.3 + rand() * 0.24,
      lean: [(rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1],
      windPhase: rand() * Math.PI * 2,
      windFreq: 0.55 + rand() * 0.5,
      branch: rand() > 0.45,
    });
  }
  return specs;
}

function TreeFoliage({ spec }: { spec: TreeSpec }) {
  const { shape, foliageColor, foliageColor2, foliageRadius, trunkHeight } = spec;
  if (shape === "conical") {
    return (
      <>
        <mesh position={[0, trunkHeight + foliageRadius * 0.55, 0]} castShadow>
          <coneGeometry args={[foliageRadius, foliageRadius * 1.7, 9]} />
          <meshStandardMaterial color={foliageColor} roughness={0.85} />
        </mesh>
        <mesh position={[0, trunkHeight + foliageRadius * 1.15, 0]} castShadow>
          <coneGeometry args={[foliageRadius * 0.68, foliageRadius * 1.3, 9]} />
          <meshStandardMaterial color={foliageColor2} roughness={0.85} />
        </mesh>
      </>
    );
  }
  if (shape === "round") {
    return (
      <>
        <mesh position={[-foliageRadius * 0.3, trunkHeight + foliageRadius * 0.5, 0.05]} castShadow>
          <sphereGeometry args={[foliageRadius * 0.72, 9, 8]} />
          <meshStandardMaterial color={foliageColor} roughness={0.85} />
        </mesh>
        <mesh position={[foliageRadius * 0.32, trunkHeight + foliageRadius * 0.65, -0.06]} castShadow>
          <sphereGeometry args={[foliageRadius * 0.8, 9, 8]} />
          <meshStandardMaterial color={foliageColor2} roughness={0.85} />
        </mesh>
        <mesh position={[0, trunkHeight + foliageRadius * 1.15, 0]} castShadow>
          <sphereGeometry args={[foliageRadius * 0.6, 9, 8]} />
          <meshStandardMaterial color={foliageColor} roughness={0.85} />
        </mesh>
      </>
    );
  }
  // sparse: smaller, gappier clusters so trunk/branches read through
  return (
    <>
      <mesh position={[-foliageRadius * 0.45, trunkHeight + foliageRadius * 0.4, 0]} castShadow>
        <sphereGeometry args={[foliageRadius * 0.5, 8, 7]} />
        <meshStandardMaterial color={foliageColor} roughness={0.9} />
      </mesh>
      <mesh position={[foliageRadius * 0.4, trunkHeight + foliageRadius * 0.85, 0.1]} castShadow>
        <sphereGeometry args={[foliageRadius * 0.46, 8, 7]} />
        <meshStandardMaterial color={foliageColor2} roughness={0.9} />
      </mesh>
      <mesh position={[0, trunkHeight + foliageRadius * 1.3, -0.1]} castShadow>
        <sphereGeometry args={[foliageRadius * 0.4, 8, 7]} />
        <meshStandardMaterial color={foliageColor} roughness={0.9} />
      </mesh>
    </>
  );
}

function TreeInstance({ spec, envRef }: { spec: TreeSpec; envRef: MutableRefObject<EnvironmentTarget> }) {
  const swayRef = useRef<Group>(null);

   
  useFrame(({ clock }) => {
    if (!swayRef.current) return;
    const wind = envRef.current.windStrength;
    const t = clock.elapsedTime * spec.windFreq + spec.windPhase;
    swayRef.current.rotation.x = spec.lean[0] + Math.sin(t) * wind * 0.05;
    swayRef.current.rotation.z = spec.lean[1] + Math.cos(t * 0.85) * wind * 0.045;
  });
   

  return (
    <group position={spec.position} scale={spec.scale}>
      <mesh position={[0, spec.trunkHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[spec.trunkRadius * 0.75, spec.trunkRadius, spec.trunkHeight, 7]} />
        <meshStandardMaterial color={spec.trunkColor} roughness={0.9} />
      </mesh>
      {spec.branch && (
        <mesh position={[spec.trunkRadius * 2, spec.trunkHeight * 0.72, 0]} rotation={[0, 0, -0.9]} castShadow>
          <cylinderGeometry args={[spec.trunkRadius * 0.3, spec.trunkRadius * 0.45, spec.trunkHeight * 0.45, 5]} />
          <meshStandardMaterial color={spec.trunkColor} roughness={0.9} />
        </mesh>
      )}
      {/* Sway pivots the whole foliage mass gently around the trunk top — cheap (one group transform per tree) rather than per-leaf wind. */}
      <group ref={swayRef}>
        <TreeFoliage spec={spec} />
      </group>
    </group>
  );
}

/**
 * 5-10 trees scattered naturally around the plot boundary — jittered angle/
 * distance (never a ring or grid), varied trunk height, foliage shape/color
 * and a couple with a visible branch stub. Each sways independently in the
 * shared wind (section 14/16: subtle, scale-matched to the miniature house).
 */
export function Trees({
  bounds,
  envRef,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  mobile?: boolean;
}) {
  const count = mobile ? 5 : 8;
  const specs = useMemo(() => makeTreeSpecs(bounds, count), [bounds, count]);
  return (
    <>
      {specs.map((spec, i) => (
        <TreeInstance key={i} spec={spec} envRef={envRef} />
      ))}
    </>
  );
}

const FLOWER_COLORS = ["#f2a6c9", "#f5d76e", "#f7f3ea", "#e88fb0"];

interface FlowerClusterSpec {
  center: [number, number];
  petals: { offset: [number, number]; color: string; scale: number }[];
}

interface RockSpec {
  position: [number, number, number];
  scale: [number, number, number];
  rotationY: number;
}

interface SmallBushSpec {
  position: [number, number, number];
  scale: number;
  color: string;
}

/** Ground-detail layout: computed once per bounds, consumed by GroundDetail below. */
function makeGroundLayout(bounds: Bounds, mobile: boolean) {
  const rand = seededRandom(577);
  const boundary = yardBoundaryRadius(bounds.radius);
  const padHalf = yardPadHalf(bounds.radius);
  const innerR = padHalf * 1.05;
  const outerR = boundary + 2.0;

  const grassCount = mobile ? 90 : 190;
  const grass: { position: [number, number, number]; rotationY: number; scale: number }[] = [];
  for (let i = 0; i < grassCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = innerR + rand() * (outerR - innerR);
    grass.push({
      position: [bounds.centerX + Math.cos(angle) * dist, 0, bounds.centerZ + Math.sin(angle) * dist],
      rotationY: rand() * Math.PI * 2,
      scale: 0.6 + rand() * 0.7,
    });
  }

  const flowerClusterCount = mobile ? 2 : 3;
  const flowerClusters: FlowerClusterSpec[] = [];
  for (let i = 0; i < flowerClusterCount; i++) {
    const angle = ((i + 0.5) / flowerClusterCount) * Math.PI * 2 + rand() * 0.6;
    const dist = boundary * 0.55 + rand() * (boundary * 0.35);
    const center: [number, number] = [bounds.centerX + Math.cos(angle) * dist, bounds.centerZ + Math.sin(angle) * dist];
    const petals = Array.from({ length: 4 + Math.floor(rand() * 3) }, () => ({
      offset: [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5] as [number, number],
      color: FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)],
      scale: 0.75 + rand() * 0.5,
    }));
    flowerClusters.push({ center, petals });
  }

  const rockCount = mobile ? 3 : 6;
  const rocks: RockSpec[] = Array.from({ length: rockCount }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = boundary - 0.3 + rand() * 1.6;
    return {
      position: [bounds.centerX + Math.cos(angle) * dist, 0.05, bounds.centerZ + Math.sin(angle) * dist] as [number, number, number],
      scale: [0.1 + rand() * 0.08, 0.07 + rand() * 0.05, 0.1 + rand() * 0.08] as [number, number, number],
      rotationY: rand() * Math.PI * 2,
    };
  });

  const bushCount = mobile ? 3 : 5;
  const bushes: SmallBushSpec[] = Array.from({ length: bushCount }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = boundary - 0.2 + rand() * 1.1;
    return {
      position: [bounds.centerX + Math.cos(angle) * dist, 0, bounds.centerZ + Math.sin(angle) * dist] as [number, number, number],
      scale: 0.7 + rand() * 0.6,
      color: FOLIAGE_COLORS[Math.floor(rand() * FOLIAGE_COLORS.length)],
    };
  });

  return { grass, flowerClusters, rocks, bushes };
}

/** Exposed so Butterflies (critters.tsx) can steer toward the same flower spots without recomputing the layout. */
export function useGroundLayout(bounds: Bounds, mobile: boolean) {
  return useMemo(() => makeGroundLayout(bounds, mobile), [bounds, mobile]);
}

function GrassTufts({
  grass,
  envRef,
}: {
  grass: { position: [number, number, number]; rotationY: number; scale: number }[];
  envRef: MutableRefObject<EnvironmentTarget>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const swayRef = useRef<Group>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    grass.forEach((g, i) => {
      dummy.position.set(...g.position);
      dummy.rotation.set(0, g.rotationY, 0);
      dummy.scale.set(g.scale, g.scale * (0.85 + (i % 3) * 0.12), g.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [grass]);

  const grassColor = useMemo(() => new Color("#75a85b"), []);
  const grassWet = useMemo(() => new Color("#4c6f45"), []);
  const matRef = useRef<MeshStandardMaterial>(null);

   
  useFrame(({ clock }) => {
    const env = envRef.current;
    if (swayRef.current) {
      // A single shared tilt for the whole clump batch — visually "moves in
      // the wind" as one breathing mass without the cost of animating each
      // of ~200 instance matrices every frame.
      swayRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.1) * env.windStrength * 0.05;
    }
    if (matRef.current) {
      matRef.current.color.copy(grassColor).lerp(grassWet, env.groundWetness);
    }
  });
   

  return (
    <group ref={swayRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, grass.length]} castShadow>
        <coneGeometry args={[0.045, 0.22, 4]} />
        <meshStandardMaterial ref={matRef} color="#75a85b" roughness={1} />
      </instancedMesh>
    </group>
  );
}

function FlowerCluster({ spec }: { spec: FlowerClusterSpec }) {
  return (
    <group position={[spec.center[0], 0, spec.center[1]]}>
      {spec.petals.map((p, i) => (
        <group key={i} position={[p.offset[0], 0, p.offset[1]]} scale={p.scale}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.006, 0.008, 0.12, 4]} />
            <meshStandardMaterial color="#4f8a52" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.035, 6, 5]} />
            <meshStandardMaterial color={p.color} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Rock({ spec }: { spec: RockSpec }) {
  return (
    <mesh position={spec.position} scale={spec.scale} rotation={[0, spec.rotationY, 0]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#8f8d86" roughness={0.95} />
    </mesh>
  );
}

function SmallBush({ spec }: { spec: SmallBushSpec }) {
  return (
    <group position={spec.position} scale={spec.scale}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <sphereGeometry args={[0.19, 9, 8]} />
        <meshStandardMaterial color={spec.color} roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.12, 0.05]} castShadow>
        <sphereGeometry args={[0.13, 8, 7]} />
        <meshStandardMaterial color={spec.color} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Breaks up the flat lawn plane with instanced grass tufts, a couple of
 * small flower beds (also used as butterfly waypoints), scattered rocks and
 * small bushes — a natural house → garden → grass → boundary gradient
 * rather than one flat green plane (section 2).
 */
export function GroundDetail({
  bounds,
  envRef,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  mobile?: boolean;
}) {
  const layout = useGroundLayout(bounds, mobile);
  return (
    <>
      <GrassTufts grass={layout.grass} envRef={envRef} />
      {layout.flowerClusters.map((f, i) => (
        <FlowerCluster key={i} spec={f} />
      ))}
      {layout.rocks.map((r, i) => (
        <Rock key={i} spec={r} />
      ))}
      {layout.bushes.map((b, i) => (
        <SmallBush key={i} spec={b} />
      ))}
    </>
  );
}

export type { FlowerClusterSpec };
