"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type Group, type InstancedMesh, type MeshStandardMaterial } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import type { EnvironmentTarget, Season } from "@/lib/three/environment";

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
// Muted, slightly olive greens (rather than saturated cartoon green) so the
// yard sits comfortably next to the app's pastel cream/pink/purple palette.
// This is the spring/summer baseline; autumn/winter shift most trees toward
// their own palettes below (a minority of "evergreens" stay this color).
const FOLIAGE_COLORS = ["#7a9c63", "#8aab6f", "#6f9159", "#96b378", "#7f9c66", "#89a86e"];
const BLOSSOM_COLORS = ["#f0c3d8", "#f7dcc8", "#fbe9d6"];
const AUTUMN_COLORS = ["#d98a4a", "#c96b3f", "#e0a25c"];
const WINTER_COLORS = ["#9fae9c", "#8b9a8f", "#a8b5a5"];

/** Picks a tree's two foliage colors (and whether its canopy should look thinned-out) for the given season. */
function seasonalFoliagePalette(season: Season, rand: () => number): { colorA: string; colorB: string; thin: boolean } {
  if (season === "autumn") {
    const turned = rand() < 0.82; // most deciduous trees change color; a few evergreens don't
    const palette = turned ? AUTUMN_COLORS : FOLIAGE_COLORS;
    return {
      colorA: palette[Math.floor(rand() * palette.length)],
      colorB: palette[Math.floor(rand() * palette.length)],
      thin: turned && rand() < 0.35,
    };
  }
  if (season === "winter") {
    const evergreen = rand() < 0.3;
    const palette = evergreen ? FOLIAGE_COLORS : WINTER_COLORS;
    return {
      colorA: palette[Math.floor(rand() * palette.length)],
      colorB: palette[Math.floor(rand() * palette.length)],
      thin: !evergreen,
    };
  }
  if (season === "spring") {
    const blossom = rand() < 0.25;
    const palette = blossom ? BLOSSOM_COLORS : FOLIAGE_COLORS;
    return { colorA: palette[Math.floor(rand() * palette.length)], colorB: palette[Math.floor(rand() * palette.length)], thin: false };
  }
  // summer baseline
  return {
    colorA: FOLIAGE_COLORS[Math.floor(rand() * FOLIAGE_COLORS.length)],
    colorB: FOLIAGE_COLORS[Math.floor(rand() * FOLIAGE_COLORS.length)],
    thin: false,
  };
}

type TreeKind = "blob" | "pine";

interface FoliageLobe {
  offset: [number, number, number];
  scale: number;
  color: string;
}

interface PineTier {
  y: number;
  radius: number;
  height: number;
  offset: [number, number];
  color: string;
}

interface TreeSpec {
  position: [number, number, number];
  scale: number;
  trunkHeight: number;
  trunkRadius: number;
  trunkColor: string;
  kind: TreeKind;
  lobes: FoliageLobe[];
  pineTiers: PineTier[];
  foliageRadius: number;
  lean: [number, number];
  windPhase: number;
  windFreq: number;
  branch: boolean;
}

function makeTreeSpecs(bounds: Bounds, count: number, season: Season): TreeSpec[] {
  const rand = seededRandom(211);
  const boundary = yardBoundaryRadius(bounds.radius);
  const specs: TreeSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Roughly-even angular spacing, then jittered so it never reads as a ring/grid.
    const baseAngle = (i / count) * Math.PI * 2;
    const angle = baseAngle + (rand() - 0.5) * ((Math.PI * 2) / count) * 1.4;
    const dist = boundary + 0.1 + rand() * 3.2; // some hug the fence, some sit further back as background
    const trunkHeight = 0.42 + rand() * 0.34;
    const foliageRadius = 0.3 + rand() * 0.24;

    const { colorA, colorB, thin } = seasonalFoliagePalette(season, rand);
    const isAccent = colorA !== colorB || colorA !== FOLIAGE_COLORS[0]; // loose signal used only for kind selection below
    const kind: TreeKind = season !== "autumn" && season !== "winter" && !isAccent && rand() < 0.3 ? "pine" : "blob";

    const lobes: FoliageLobe[] = [];
    const pineTiers: PineTier[] = [];
    if (kind === "blob") {
      // Irregular, asymmetric canopy: each lobe gets its own random angle,
      // distance and size — never a neat mirrored/stacked arrangement.
      // A "thin" (autumn-turning / winter-bare) tree gets fewer, smaller lobes.
      const lobeCount = (thin ? 2 : 3) + Math.floor(rand() * 3);
      const lobeScale = thin ? 0.32 : 0.42;
      for (let l = 0; l < lobeCount; l++) {
        const a = rand() * Math.PI * 2;
        const r = foliageRadius * (0.12 + rand() * 0.42);
        lobes.push({
          offset: [Math.cos(a) * r, foliageRadius * (0.35 + rand() * 1.05), Math.sin(a) * r],
          scale: foliageRadius * (lobeScale + rand() * 0.46),
          color: rand() < 0.65 ? colorA : colorB,
        });
      }
    } else {
      // A looser pine: still tiered, but each tier gets a small random xz
      // offset so it doesn't read as a perfectly stacked toy shape.
      for (let t = 0; t < 3; t++) {
        pineTiers.push({
          y: foliageRadius * (0.5 + t * 0.55),
          radius: foliageRadius * (1 - t * 0.28),
          height: foliageRadius * (1.5 - t * 0.25),
          offset: [(rand() - 0.5) * foliageRadius * 0.18, (rand() - 0.5) * foliageRadius * 0.18],
          color: t % 2 === 0 ? colorA : colorB,
        });
      }
    }

    specs.push({
      position: [bounds.centerX + Math.cos(angle) * dist, 0, bounds.centerZ + Math.sin(angle) * dist],
      scale: 0.75 + rand() * 0.55,
      trunkHeight,
      trunkRadius: 0.055 + rand() * 0.03,
      trunkColor: TRUNK_COLORS[Math.floor(rand() * TRUNK_COLORS.length)],
      kind,
      lobes,
      pineTiers,
      foliageRadius,
      lean: [(rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1],
      windPhase: rand() * Math.PI * 2,
      windFreq: 0.55 + rand() * 0.5,
      branch: rand() > 0.45,
    });
  }
  return specs;
}

function TreeFoliage({ spec }: { spec: TreeSpec }) {
  const { trunkHeight } = spec;
  if (spec.kind === "pine") {
    return (
      <>
        {spec.pineTiers.map((tier, i) => (
          <mesh key={i} position={[tier.offset[0], trunkHeight + tier.y, tier.offset[1]]} castShadow>
            <coneGeometry args={[tier.radius, tier.height, 9]} />
            <meshStandardMaterial color={tier.color} roughness={0.85} />
          </mesh>
        ))}
      </>
    );
  }
  return (
    <>
      {spec.lobes.map((lobe, i) => (
        <mesh key={i} position={[lobe.offset[0], trunkHeight + lobe.offset[1], lobe.offset[2]]} castShadow>
          <sphereGeometry args={[lobe.scale, 8, 7]} />
          <meshStandardMaterial color={lobe.color} roughness={0.87} />
        </mesh>
      ))}
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
 * A dense ring of trees scattered naturally around the plot boundary —
 * jittered angle/distance (never a ring or grid), varied trunk height,
 * foliage shape/color and a couple with a visible branch stub. Each sways
 * independently in the shared wind (section 14/16: subtle, scale-matched to
 * the miniature house).
 */
export function Trees({
  bounds,
  envRef,
  season,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  season: Season;
  mobile?: boolean;
}) {
  const count = mobile ? 9 : 16;
  const specs = useMemo(() => makeTreeSpecs(bounds, count, season), [bounds, count, season]);
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

/** Shared by the grass-tuft instances here and the main lawn plane in Yard (home-scene.tsx) so they always agree. */
export function seasonalGrassColors(season: Season): { dry: string; wet: string } {
  switch (season) {
    case "autumn":
      return { dry: "#a89a5c", wet: "#7a6f42" };
    case "winter":
      return { dry: "#9aa08e", wet: "#6b7260" };
    default:
      return { dry: "#9cb87a", wet: "#66805a" };
  }
}

function seasonalBushPalette(season: Season): string[] {
  if (season === "autumn") return AUTUMN_COLORS;
  if (season === "winter") return WINTER_COLORS;
  return FOLIAGE_COLORS;
}

/** Ground-detail layout: computed once per bounds, consumed by GroundDetail below. */
function makeGroundLayout(bounds: Bounds, mobile: boolean, season: Season) {
  const rand = seededRandom(577);
  const boundary = yardBoundaryRadius(bounds.radius);
  const padHalf = yardPadHalf(bounds.radius);
  const innerR = padHalf * 1.05;
  const outerR = boundary + 2.0;

  const grassCount = mobile ? 160 : 380;
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

  const bushPalette = seasonalBushPalette(season);
  const bushCount = mobile ? 3 : 5;
  const bushes: SmallBushSpec[] = Array.from({ length: bushCount }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = boundary - 0.2 + rand() * 1.1;
    return {
      position: [bounds.centerX + Math.cos(angle) * dist, 0, bounds.centerZ + Math.sin(angle) * dist] as [number, number, number],
      scale: 0.7 + rand() * 0.6,
      color: bushPalette[Math.floor(rand() * bushPalette.length)],
    };
  });

  return { grass, flowerClusters, rocks, bushes };
}

/** Exposed so Butterflies (critters.tsx) can steer toward the same flower spots without recomputing the layout. */
export function useGroundLayout(bounds: Bounds, mobile: boolean, season: Season) {
  return useMemo(() => makeGroundLayout(bounds, mobile, season), [bounds, mobile, season]);
}

function GrassTufts({
  grass,
  envRef,
  season,
}: {
  grass: { position: [number, number, number]; rotationY: number; scale: number }[];
  envRef: MutableRefObject<EnvironmentTarget>;
  season: Season;
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

  // Same seasonal family as the lawn plane (home-scene.tsx Yard) so tufts blend in rather than reading as a different, oddly-timed green.
  const seasonColors = useMemo(() => seasonalGrassColors(season), [season]);
  const grassColor = useMemo(() => new Color(seasonColors.dry), [seasonColors]);
  const grassWet = useMemo(() => new Color(seasonColors.wet), [seasonColors]);
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
  season,
  mobile = false,
}: {
  bounds: Bounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  season: Season;
  mobile?: boolean;
}) {
  const layout = useGroundLayout(bounds, mobile, season);
  return (
    <>
      <GrassTufts grass={layout.grass} envRef={envRef} season={season} />
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
