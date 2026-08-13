"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { RoomBlock } from "@/components/three/room-block";
import { computeRoomLayout, layoutBounds } from "@/lib/three/layout";
import type { Furniture, Room } from "@/lib/supabase/types";

export interface HomeScene3DProps {
  rooms: Room[];
  furnitureByRoom: Record<string, Furniture[]>;
  onRoomClick?: (roomId: string) => void;
  onFurnitureClick?: (furnitureId: string) => void;
  focusRoomId?: string;
  highlightFurnitureId?: string;
  className?: string;
}

function SceneContents({
  rooms,
  furnitureByRoom,
  onRoomClick,
  onFurnitureClick,
  focusRoomId,
  highlightFurnitureId,
}: HomeScene3DProps) {
  const layout = useMemo(() => computeRoomLayout(rooms), [rooms]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);

  const focused = focusRoomId ? layout.find((l) => l.room.id === focusRoomId) : undefined;
  const targetX = focused ? focused.x : bounds.centerX;
  const targetZ = focused ? focused.z : bounds.centerZ;
  const camDistance = focused ? Math.max(focused.width, focused.depth) * 1.3 : bounds.radius * 0.95;

  return (
    <>
      {/* Fully local lighting rig (no external HDR/CDN assets) so the scene
          never depends on network access to render. */}
      <hemisphereLight color="#e8ecf5" groundColor="#c9baa3" intensity={0.65} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[bounds.centerX + 8, 12, bounds.centerZ + 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-bounds.radius}
        shadow-camera-right={bounds.radius}
        shadow-camera-top={bounds.radius}
        shadow-camera-bottom={-bounds.radius}
      />
      <directionalLight position={[bounds.centerX - 10, 6, bounds.centerZ - 8]} intensity={0.35} />
      <directionalLight position={[bounds.centerX, 5, bounds.centerZ + 12]} intensity={0.25} />

      <mesh position={[bounds.centerX, -0.01, bounds.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[bounds.radius * 3, bounds.radius * 3]} />
        <meshStandardMaterial color="#e5e0d3" roughness={1} />
      </mesh>

      {layout.map(({ room, x, z, width, depth }) => (
        <RoomBlock
          key={room.id}
          room={room}
          furniture={furnitureByRoom[room.id] ?? []}
          x={x}
          z={z}
          width={width}
          depth={depth}
          onRoomClick={onRoomClick}
          onFurnitureClick={onFurnitureClick}
          highlightFurnitureId={highlightFurnitureId}
        />
      ))}

      <OrbitControls
        makeDefault
        target={[targetX, 0.6, targetZ]}
        minDistance={focused ? camDistance * 0.6 : 4}
        maxDistance={focused ? camDistance * 2.2 : bounds.radius * 2.2}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enableDamping
        dampingFactor={0.1}
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

  return (
    <div className={props.className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: [camX, camY, camZ], fov: 45, near: 0.1, far: 200 }}
      >
        <color attach="background" args={["#f5f2ea"]} />
        <fog attach="fog" args={["#f5f2ea", bounds.radius * 1.5, bounds.radius * 6]} />
        <SceneContents {...props} />
      </Canvas>
    </div>
  );
}
