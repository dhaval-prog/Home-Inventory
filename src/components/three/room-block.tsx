"use client";

import { useState } from "react";
import { Html } from "@react-three/drei";
import { FurnitureMesh } from "@/components/three/furniture-mesh";
import { LocationMarker } from "@/components/three/location-marker";
import { roomFloorColor, ROOM_WALL_COLOR } from "@/lib/three/room-colors";
import { WALL_HEIGHT, WALL_THICKNESS, placeFurniture } from "@/lib/three/layout";
import { getIcon } from "@/lib/icon-map";
import type { Furniture, Room } from "@/lib/supabase/types";

export function RoomBlock({
  room,
  furniture,
  x,
  z,
  width,
  depth,
  onRoomClick,
  onFurnitureClick,
  highlightFurnitureId,
}: {
  room: Room;
  furniture: Furniture[];
  x: number;
  z: number;
  width: number;
  depth: number;
  onRoomClick?: (roomId: string) => void;
  onFurnitureClick?: (furnitureId: string) => void;
  highlightFurnitureId?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const placed = placeFurniture(furniture, width, depth);
  const RoomIcon = getIcon(room.icon);
  const floorColor = roomFloorColor(room.type);
  const highlighted = placed.find((p) => p.furniture.id === highlightFurnitureId);

  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onRoomClick?.(room.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = onRoomClick ? "pointer" : "default";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floorColor} roughness={0.85} emissive={hovered ? "#ffffff" : "#000000"} emissiveIntensity={hovered ? 0.08 : 0} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, WALL_HEIGHT / 2, -depth / 2]} receiveShadow>
        <boxGeometry args={[width, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={ROOM_WALL_COLOR} roughness={0.95} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-width / 2, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial color={ROOM_WALL_COLOR} roughness={0.95} />
      </mesh>

      {placed.map(({ furniture: f, x: fx, z: fz, rotationY }) => (
        <FurnitureMesh
          key={f.id}
          type={f.type}
          position={[fx, 0, fz]}
          rotationY={rotationY}
          onClick={onFurnitureClick ? () => onFurnitureClick(f.id) : undefined}
          highlighted={f.id === highlightFurnitureId}
        />
      ))}

      {highlighted && <LocationMarker position={[highlighted.x, 0, highlighted.z]} />}

      <Html position={[0, WALL_HEIGHT + 0.35, -depth / 2 + 0.1]} center distanceFactor={9} occlude={false}>
        <div className="pointer-events-none flex items-center gap-1.5 whitespace-nowrap rounded-full bg-background/90 px-3 py-1 text-sm font-semibold shadow-md ring-1 ring-border">
          <RoomIcon className="size-3.5" />
          {room.name}
        </div>
      </Html>
    </group>
  );
}
