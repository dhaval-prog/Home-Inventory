import type { Furniture, Room } from "@/lib/supabase/types";

export const ROOM_WIDTH = 6.4;
export const ROOM_DEPTH = 5.2;
export const ROOM_GAP = 2;
export const WALL_HEIGHT = 2.3;
export const WALL_THICKNESS = 0.12;

export interface RoomLayoutItem {
  room: Room;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export function computeRoomLayout(rooms: Room[]): RoomLayoutItem[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(rooms.length)));
  return rooms.map((room, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      room,
      x: col * (ROOM_WIDTH + ROOM_GAP),
      z: row * (ROOM_DEPTH + ROOM_GAP),
      width: ROOM_WIDTH,
      depth: ROOM_DEPTH,
    };
  });
}

export function layoutBounds(layout: RoomLayoutItem[]) {
  if (layout.length === 0) return { centerX: 0, centerZ: 0, radius: 8 };
  const minX = Math.min(...layout.map((l) => l.x - l.width / 2));
  const maxX = Math.max(...layout.map((l) => l.x + l.width / 2));
  const minZ = Math.min(...layout.map((l) => l.z - l.depth / 2));
  const maxZ = Math.max(...layout.map((l) => l.z + l.depth / 2));
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    radius: Math.max(maxX - minX, maxZ - minZ, 8),
  };
}

export interface FurnitureSlot {
  x: number;
  z: number;
  rotationY: number;
}

/** Deterministic grid placement along the back wall, wrapping forward for overflow. */
export function computeFurnitureSlots(count: number, width: number, depth: number): FurnitureSlot[] {
  if (count === 0) return [];
  const cols = Math.min(count, 3);
  const rows = Math.ceil(count / cols);
  const marginX = width * 0.18;
  const marginZ = depth * 0.2;
  const usableW = width - marginX * 2;
  const usableD = depth - marginZ * 2;

  const slots: FurnitureSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const col = i - rowStart;
    const x = -usableW / 2 + (usableW / (rowCount + 1)) * (col + 1);
    const z = rows === 1 ? -usableD / 2 : -usableD / 2 + (usableD / (rows + 1)) * (row + 1);
    slots.push({ x, z, rotationY: 0 });
  }
  return slots;
}

export interface PlacedFurniture {
  furniture: Furniture;
  x: number;
  z: number;
  rotationY: number;
}

export function placeFurniture(furniture: Furniture[], width: number, depth: number): PlacedFurniture[] {
  const slots = computeFurnitureSlots(furniture.length, width, depth);
  return furniture.map((f, i) => ({ furniture: f, ...slots[i] }));
}
