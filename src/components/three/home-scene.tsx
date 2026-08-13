"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
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

/** Flies the camera in from a wide overview to the framed target once on mount, then hands off to OrbitControls. */
function CameraRig({
  overviewPosition,
  finalPosition,
  overviewTarget,
  finalTarget,
  fly,
  minDistance,
  maxDistance,
}: {
  overviewPosition: Vector3;
  finalPosition: Vector3;
  overviewTarget: Vector3;
  finalTarget: Vector3;
  fly: boolean;
  minDistance: number;
  maxDistance: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const animating = useRef(fly);

  useLayoutEffect(() => {
    if (fly) {
      camera.position.copy(overviewPosition);
      controlsRef.current?.target.copy(overviewTarget);
      controlsRef.current?.update();
      animating.current = true;
    } else {
      controlsRef.current?.target.copy(finalTarget);
      controlsRef.current?.update();
    }
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
    />
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

  const overviewPosition = useMemo(
    () =>
      new Vector3(
        bounds.centerX + bounds.radius * 0.75,
        bounds.radius * 0.6,
        bounds.centerZ + bounds.radius * 0.75
      ),
    [bounds.centerX, bounds.centerZ, bounds.radius]
  );
  const overviewTarget = useMemo(
    () => new Vector3(bounds.centerX, 0.6, bounds.centerZ),
    [bounds.centerX, bounds.centerZ]
  );
  const finalPosition = useMemo(() => {
    if (!focused) return overviewPosition.clone();
    const span = Math.max(focused.width, focused.depth) * 0.9;
    return new Vector3(focused.x + span, span * 0.85, focused.z + span);
  }, [focused, overviewPosition]);
  const finalTarget = useMemo(() => new Vector3(targetX, 0.6, targetZ), [targetX, targetZ]);

  return (
    <>
      {/* Fully local lighting rig (no external HDR/CDN assets) so the scene
          never depends on network access to render. Warm key + cool fill for depth. */}
      <hemisphereLight color="#eef1fb" groundColor="#c9baa3" intensity={0.55} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[bounds.centerX + 8, 12, bounds.centerZ + 6]}
        intensity={1.3}
        color="#fff3df"
        castShadow={!mobile}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-bounds.radius}
        shadow-camera-right={bounds.radius}
        shadow-camera-top={bounds.radius}
        shadow-camera-bottom={-bounds.radius}
        shadow-bias={-0.0015}
      />
      <directionalLight position={[bounds.centerX - 10, 6, bounds.centerZ - 8]} intensity={0.3} color="#dde6f5" />
      <directionalLight position={[bounds.centerX, 5, bounds.centerZ + 12]} intensity={0.2} color="#f5ece0" />

      <mesh position={[bounds.centerX, -0.01, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[bounds.radius * 3, bounds.radius * 3]} />
        <meshStandardMaterial color="#e5e0d3" roughness={1} />
      </mesh>

      {!mobile && (
        <ContactShadows
          position={[bounds.centerX, 0, bounds.centerZ]}
          opacity={0.35}
          scale={bounds.radius * 3}
          blur={2}
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
        overviewPosition={overviewPosition}
        finalPosition={finalPosition}
        overviewTarget={overviewTarget}
        finalTarget={finalTarget}
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
  const focused = props.focusRoomId ? layout.find((l) => l.room.id === props.focusRoomId) : undefined;
  const camX = focused ? focused.x + Math.max(focused.width, focused.depth) * 0.9 : bounds.centerX + bounds.radius * 0.75;
  const camZ = focused ? focused.z + Math.max(focused.width, focused.depth) * 0.9 : bounds.centerZ + bounds.radius * 0.75;
  const camY = focused ? Math.max(focused.width, focused.depth) * 0.75 : bounds.radius * 0.6;
  const mobile = useMemo(() => isMobileViewport(), []);

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
