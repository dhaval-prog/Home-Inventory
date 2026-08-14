"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef, MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Color, Vector3, type Mesh, type MeshStandardMaterial } from "three";
import { RoomBlock } from "@/components/three/room-block";
import { SkyDome } from "@/components/three/sky-dome";
import { Clouds } from "@/components/three/clouds";
import { Rain, Lightning } from "@/components/three/rain";
import { DynamicLights, HouseLights, OutdoorLights, SceneAtmosphere } from "@/components/three/environment-lighting";
import { GroundDetail, Trees, yardPadHalf } from "@/components/three/vegetation";
import { Butterflies, Dogs, Fireflies } from "@/components/three/critters";
import { useEnvironment } from "@/lib/three/use-environment";
import type { EnvironmentTarget, WeatherCondition } from "@/lib/three/environment";
import { computeRoomLayout, layoutBounds } from "@/lib/three/layout";
import type { Furniture, Room } from "@/lib/supabase/types";
import type { SceneItemSummary } from "@/lib/home-scene-data";

export interface HomeScene3DProps {
  rooms: Room[];
  furnitureByRoom: Record<string, Furniture[]>;
  itemsByFurniture?: Record<string, SceneItemSummary[]>;
  onRoomClick?: (roomId: string) => void;
  onFurnitureClick?: (furnitureId: string) => void;
  focusRoomId?: string;
  highlightFurnitureId?: string;
  className?: string;
  /** Optional live weather condition (section 22: connect a real API here later). Defaults to "sunny". */
  weather?: WeatherCondition;
  /** Optional fixed hour (0-24) to preview a specific time of day; omit to use the real local time. */
  timeOverrideHour?: number;
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

/**
 * A focused scene (a specific room/item highlighted, e.g. the "Where is it?" reveal)
 * gets a cinematic entrance: the camera starts pulled back/up from a wide establishing
 * shot and swoops in to the framed room/item. A plain overview (dashboard, whole-home
 * view) skips the flight entirely and starts right at rest — so the auto-rotate is
 * visibly spinning from the very first frame instead of reading as a static image
 * while a flight plays out. Either way, OrbitControls keeps a slow idle auto-rotate
 * going so the scene stays "alive" — it pauses while the user is actively dragging
 * and resumes on its own a couple of seconds after they let go, rather than
 * stopping for good the first time someone touches the scene.
 */
function CameraRig({
  introPosition,
  finalPosition,
  introTarget,
  finalTarget,
  fly,
  minDistance,
  maxDistance,
}: {
  introPosition: Vector3;
  finalPosition: Vector3;
  introTarget: Vector3;
  finalTarget: Vector3;
  fly: boolean;
  minDistance: number;
  maxDistance: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const animating = useRef(fly);
  const [autoRotate, setAutoRotate] = useState(true);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (fly) {
      camera.position.copy(introPosition);
      controlsRef.current?.target.copy(introTarget);
    } else {
      camera.position.copy(finalPosition);
      controlsRef.current?.target.copy(finalTarget);
    }
    controlsRef.current?.update();
    animating.current = fly;
    // Intentionally run once on mount only — this is a one-shot flight, not a reactive sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (!animating.current) return;
    const t = 1 - Math.pow(0.001, delta);
    camera.position.lerp(finalPosition, t);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(finalTarget, t);
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(finalPosition) < 0.03) {
      animating.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2 - 0.05}
      enableDamping
      dampingFactor={0.1}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
      onStart={() => {
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        setAutoRotate(false);
      }}
      onEnd={() => {
        resumeTimer.current = setTimeout(() => setAutoRotate(true), 2500);
      }}
    />
  );
}

interface SceneBounds {
  centerX: number;
  centerZ: number;
  radius: number;
}

/**
 * Dresses the scene as a small house sitting on its own plot: a grass field, a raised
 * cream foundation pad sized to the room layout, a low picket fence around the plot,
 * naturally-scattered trees/ground detail, and daytime/nighttime wildlife — evoking a
 * "mini home" diorama without capping the rooms with a roof (which would hide the
 * furniture the rest of the app needs visible).
 */
function Yard({
  bounds,
  envRef,
  weather,
  mobile,
}: {
  bounds: SceneBounds;
  envRef: MutableRefObject<EnvironmentTarget>;
  weather: WeatherCondition;
  mobile: boolean;
}) {
  const grassRef = useRef<Mesh>(null);
  const padRef = useRef<Mesh>(null);
  // Muted sage rather than saturated cartoon green — sits better next to the
  // app's pastel cream/pink/purple "Radiant" palette.
  const grassDryColor = useMemo(() => new Color("#9cb87a"), []);
  const grassWetColor = useMemo(() => new Color("#66805a"), []);
  const padDryColor = useMemo(() => new Color("#ede4d0"), []);
  const padWetColor = useMemo(() => new Color("#c9c0ab"), []);

  useFrame(() => {
    const wetness = envRef.current.groundWetness;
    const grassMat = grassRef.current?.material as MeshStandardMaterial | undefined;
    if (grassMat) {
      grassMat.color.copy(grassDryColor).lerp(grassWetColor, wetness);
      grassMat.roughness = 1 - wetness * 0.65;
    }
    const padMat = padRef.current?.material as MeshStandardMaterial | undefined;
    if (padMat) {
      padMat.color.copy(padDryColor).lerp(padWetColor, wetness);
      padMat.roughness = 0.95 - wetness * 0.7;
    }
  });

  const padHalf = yardPadHalf(bounds.radius);
  const fenceHalf = padHalf + 0.55;
  const fencePosts = useMemo(() => {
    const posts: [number, number, number][] = [];
    const perSide = 7;
    for (let i = 0; i <= perSide; i++) {
      const t = -fenceHalf + (fenceHalf * 2 * i) / perSide;
      posts.push([bounds.centerX + t, 0, bounds.centerZ - fenceHalf]);
      posts.push([bounds.centerX + t, 0, bounds.centerZ + fenceHalf]);
      posts.push([bounds.centerX - fenceHalf, 0, bounds.centerZ + t]);
      posts.push([bounds.centerX + fenceHalf, 0, bounds.centerZ + t]);
    }
    return posts;
  }, [bounds.centerX, bounds.centerZ, fenceHalf]);

  return (
    <>
      {/* Grass field */}
      <mesh ref={grassRef} position={[bounds.centerX, -0.02, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[bounds.radius * 3, bounds.radius * 3]} />
        <meshStandardMaterial color="#9cb87a" roughness={1} />
      </mesh>

      {/* House foundation pad */}
      <mesh ref={padRef} position={[bounds.centerX, -0.005, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[padHalf * 2, padHalf * 2]} />
        <meshStandardMaterial color="#ede4d0" roughness={0.95} />
      </mesh>

      {/* Low picket fence */}
      {fencePosts.map((p, i) => (
        <mesh key={i} position={[p[0], 0.14, p[2]]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.28, 6]} />
          <meshStandardMaterial color="#f5ead8" roughness={0.8} />
        </mesh>
      ))}

      <GroundDetail bounds={bounds} envRef={envRef} mobile={mobile} />
      <Trees bounds={bounds} envRef={envRef} mobile={mobile} />
      <Butterflies bounds={bounds} envRef={envRef} mobile={mobile} />
      <Fireflies bounds={bounds} envRef={envRef} mobile={mobile} />
      <Dogs bounds={bounds} envRef={envRef} weather={weather} mobile={mobile} />
    </>
  );
}

function SceneContents({
  rooms,
  furnitureByRoom,
  itemsByFurniture,
  onRoomClick,
  onFurnitureClick,
  focusRoomId,
  highlightFurnitureId,
  weather,
  timeOverrideHour,
  mobile,
}: HomeScene3DProps & { mobile: boolean }) {
  const layout = useMemo(() => computeRoomLayout(rooms), [rooms]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  const envRef = useEnvironment({ condition: weather ?? "sunny" }, timeOverrideHour);
  const skyRadius = Math.max(bounds.radius * 4, 14);

  const focused = focusRoomId ? layout.find((l) => l.room.id === focusRoomId) : undefined;
  const targetX = focused ? focused.x : bounds.centerX;
  const targetZ = focused ? focused.z : bounds.centerZ;
  const camDistance = focused ? Math.max(focused.width, focused.depth) * 1.3 : bounds.radius * 0.95;

  const restingPosition = useMemo(() => {
    if (!focused) {
      return new Vector3(
        bounds.centerX + bounds.radius * 0.75,
        bounds.radius * 0.6,
        bounds.centerZ + bounds.radius * 0.75
      );
    }
    const span = Math.max(focused.width, focused.depth) * 0.9;
    return new Vector3(focused.x + span, span * 0.85, focused.z + span);
  }, [focused, bounds.centerX, bounds.centerZ, bounds.radius]);
  const restingTarget = useMemo(() => new Vector3(targetX, 0.6, targetZ), [targetX, targetZ]);

  // Wide, elevated establishing shot every scene swoops in from — always noticeably
  // further back/up than the resting framing so the entrance is visible even when
  // there's no specific room/item focus (dashboard + whole-home overview).
  const introPosition = useMemo(
    () =>
      new Vector3(
        bounds.centerX + bounds.radius * 1.6,
        bounds.radius * 1.35 + 2,
        bounds.centerZ + bounds.radius * 1.6
      ),
    [bounds.centerX, bounds.centerZ, bounds.radius]
  );
  const introTarget = useMemo(
    () => new Vector3(bounds.centerX, 0.6, bounds.centerZ),
    [bounds.centerX, bounds.centerZ]
  );

  return (
    <>
      {/* Fully local environment + lighting rig (no external HDR/CDN assets) so
          the scene never depends on network access to render. Every visual —
          sky, sun/moon, clouds, rain, house/outdoor lights — derives from one
          smoothed environment snapshot (see lib/three/environment.ts), so time
          of day and weather always agree with each other. */}
      <color attach="background" args={["#dfe9f5"]} />
      <fog attach="fog" args={["#dfe9f5", bounds.radius * 1.5, bounds.radius * 6]} />
      <SceneAtmosphere envRef={envRef} bounds={bounds} />
      <DynamicLights envRef={envRef} bounds={bounds} mobile={mobile} />
      <SkyDome envRef={envRef} radius={skyRadius} sceneRadius={bounds.radius} center={[bounds.centerX, bounds.centerZ]} />
      <Clouds envRef={envRef} center={[bounds.centerX, bounds.centerZ]} radius={bounds.radius} lowQuality={mobile} />
      <Rain envRef={envRef} center={[bounds.centerX, bounds.centerZ]} radius={bounds.radius} lowQuality={mobile} />
      <Lightning envRef={envRef} center={[bounds.centerX, bounds.centerZ]} radius={bounds.radius} />
      <HouseLights envRef={envRef} layout={layout} />
      <OutdoorLights envRef={envRef} bounds={bounds} />

      <Yard bounds={bounds} envRef={envRef} weather={weather ?? "sunny"} mobile={mobile} />

      {!mobile && (
        <ContactShadows
          position={[bounds.centerX, 0, bounds.centerZ]}
          opacity={0.6}
          scale={bounds.radius * 3}
          blur={1.5}
          far={2}
        />
      )}

      {layout.map(({ room, x, z, width, depth }) => (
        <RoomBlock
          key={room.id}
          room={room}
          furniture={furnitureByRoom[room.id] ?? []}
          itemsByFurniture={itemsByFurniture}
          x={x}
          z={z}
          width={width}
          depth={depth}
          onRoomClick={onRoomClick}
          onFurnitureClick={onFurnitureClick}
          highlightFurnitureId={highlightFurnitureId}
        />
      ))}

      <CameraRig
        introPosition={introPosition}
        finalPosition={restingPosition}
        introTarget={introTarget}
        finalTarget={restingTarget}
        fly={Boolean(focused)}
        minDistance={focused ? camDistance * 0.6 : 4}
        maxDistance={focused ? camDistance * 2.2 : bounds.radius * 2.2}
      />
    </>
  );
}

export default function HomeScene3D(props: HomeScene3DProps) {
  const layout = useMemo(() => computeRoomLayout(props.rooms), [props.rooms]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  const mobile = useMemo(() => isMobileViewport(), []);
  const focused = props.focusRoomId ? layout.find((l) => l.room.id === props.focusRoomId) : undefined;
  // A focused scene seeds the Canvas camera at the same wide establishing shot the rig
  // flies in from (useLayoutEffect corrects it before first paint, this is just the seed).
  // A plain overview seeds it directly at rest, so auto-rotate is visibly spinning
  // from the first frame instead of waiting out a flight.
  const camX = focused
    ? bounds.centerX + bounds.radius * 1.6
    : bounds.centerX + bounds.radius * 0.75;
  const camZ = focused
    ? bounds.centerZ + bounds.radius * 1.6
    : bounds.centerZ + bounds.radius * 0.75;
  const camY = focused ? bounds.radius * 1.35 + 2 : bounds.radius * 0.6;

  return (
    <div className={props.className}>
      <Canvas
        shadows={!mobile}
        dpr={mobile ? 1 : [1, 2]}
        gl={{ antialias: true }}
        camera={{ position: [camX, camY, camZ], fov: 45, near: 0.1, far: 200 }}
      >
        <SceneContents {...props} mobile={mobile} />
      </Canvas>
    </div>
  );
}
