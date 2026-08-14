import type { Furniture, Room } from "@/lib/supabase/types";
import { getCachedFurniturePosition } from "@/lib/three/furniture-position-cache";

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

/**
 * Furniture the user has dragged into place keeps that spot — from the database
 * once position_x/position_z are set there, or from the local autosave cache in
 * the meantime — so the 2D floor plan and 3D scene always agree. Everything else
 * falls back to the deterministic auto-arranged grid so newly added furniture
 * always starts somewhere sensible.
 */
export function placeFurniture(
  furniture: Furniture[],
  width: number,
  depth: number,
  options: { useLocalCache?: boolean } = {}
): PlacedFurniture[] {
  const { useLocalCache = true } = options;
  const marginX = width / 2 - 0.3;
  const marginZ = depth / 2 - 0.3;
  const clamp = (x: number, z: number) => ({
    x: Math.max(-marginX, Math.min(marginX, x)),
    z: Math.max(-marginZ, Math.min(marginZ, z)),
  });

  const resolved = furniture.map((f) => {
    if (f.position_x != null && f.position_z != null) {
      return { furniture: f, pos: clamp(f.position_x, f.position_z) };
    }
    const cached = useLocalCache ? getCachedFurniturePosition(f.id) : null;
    if (cached) {
      return { furniture: f, pos: clamp(cached.x, cached.z) };
    }
    return { furniture: f, pos: null };
  });

  const slots = computeFurnitureSlots(resolved.filter((r) => !r.pos).length, width, depth);
  let autoIndex = 0;

  return resolved.map((r) => {
    if (r.pos) return { furniture: r.furniture, ...r.pos, rotationY: 0 };
    const slot = slots[autoIndex];
    autoIndex += 1;
    return { furniture: r.furniture, ...slot };
  });
}
