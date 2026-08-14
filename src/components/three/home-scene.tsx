"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { RoomBlock } from "@/components/three/room-block";
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

/** A small tree: cylinder trunk + a couple of stacked cone/sphere tops. Cute, low-poly. */
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.6, 8]} />
        <meshStandardMaterial color="#8a6444" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <coneGeometry args={[0.42, 0.7, 10]} />
        <meshStandardMaterial color="#5f9155" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <coneGeometry args={[0.3, 0.55, 10]} />
        <meshStandardMaterial color="#79ab68" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Bush({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={[position[0], 0.18, position[2]]} castShadow>
      <sphereGeometry args={[0.22, 10, 10]} />
      <meshStandardMaterial color="#6f9c5e" roughness={0.9} />
    </mesh>
  );
}

/**
 * Dresses the scene as a small house sitting on its own plot: a grass field, a raised
 * cream foundation pad sized to the room layout, a low picket fence around the plot,
 * and a few corner trees/bushes — evoking a "mini home" diorama without capping the
 * rooms with a roof (which would hide the furniture the rest of the app needs visible).
 */
function Yard({ bounds }: { bounds: SceneBounds }) {
  const padHalf = (bounds.radius * 1.18) / 2;
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

  const treeCorners: [number, number, number][] = [
    [bounds.centerX - fenceHalf - 0.4, 0, bounds.centerZ - fenceHalf - 0.4],
    [bounds.centerX + fenceHalf + 0.4, 0, bounds.centerZ - fenceHalf - 0.5],
    [bounds.centerX - fenceHalf - 0.5, 0, bounds.centerZ + fenceHalf + 0.4],
    [bounds.centerX + fenceHalf + 0.45, 0, bounds.centerZ + fenceHalf + 0.45],
  ];

  return (
    <>
      {/* Grass field */}
      <mesh position={[bounds.centerX, -0.02, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[bounds.radius * 3, bounds.radius * 3]} />
        <meshStandardMaterial color="#8fbf6a" roughness={1} />
      </mesh>

      {/* House foundation pad */}
      <mesh position={[bounds.centerX, -0.005, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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

      {treeCorners.map((p, i) => (i % 2 === 0 ? <Tree key={i} position={p} scale={0.9 + (i % 3) * 0.1} /> : <Bush key={i} position={p} />))}
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
  mobile,
}: HomeScene3DProps & { mobile: boolean }) {
  const layout = useMemo(() => computeRoomLayout(rooms), [rooms]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);

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
      {/* Fully local lighting rig (no external HDR/CDN assets) so the scene
          never depends on network access to render. Warm key + cool fill for depth. */}
      <hemisphereLight color="#eef1fb" groundColor="#c9baa3" intensity={0.5} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[bounds.centerX + 8, 12, bounds.centerZ + 6]}
        intensity={1.55}
        color="#fff2da"
        castShadow={!mobile}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-bounds.radius}
        shadow-camera-right={bounds.radius}
        shadow-camera-top={bounds.radius}
        shadow-camera-bottom={-bounds.radius}
        shadow-bias={-0.0015}
      />
      <directionalLight position={[bounds.centerX - 10, 6, bounds.centerZ - 8]} intensity={0.32} color="#dbe6f7" />
      <directionalLight position={[bounds.centerX, 5, bounds.centerZ + 12]} intensity={0.22} color="#f5ece0" />

      <Yard bounds={bounds} />

      {!mobile && (
        <ContactShadows
          position={[bounds.centerX, 0, bounds.centerZ]}
          opacity={0.5}
          scale={bounds.radius * 3}
          blur={1.8}
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
        <color attach="background" args={["#f5f2ea"]} />
        <fog attach="fog" args={["#f5f2ea", bounds.radius * 1.5, bounds.radius * 6]} />
        <SceneContents {...props} mobile={mobile} />
      </Canvas>
    </div>
  );
}
