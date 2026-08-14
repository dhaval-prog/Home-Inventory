import type { Furniture, Room } from "@/lib/supabase/types";
import { getCachedFurniturePlacement } from "@/lib/three/furniture-position-cache";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";

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

/**
 * Deterministic grid placement, sized from the pieces' actual footprints so
 * adjacent auto-arranged furniture never visually overlaps (which would make
 * pieces behind others un-draggable and their rotate handles unreachable).
 */
export function computeFurnitureSlots(items: Furniture[], width: number, depth: number): FurnitureSlot[] {
  const count = items.length;
  if (count === 0) return [];

  const footprints = items.map((f) => getFurnitureRecipe(f.type).footprint);
  const maxW = Math.max(...footprints.map(([w]) => w));
  const maxD = Math.max(...footprints.map(([, d]) => d));
  const marginX = width * 0.1;
  const marginZ = depth * 0.12;
  const usableW = Math.max(width - marginX * 2, maxW);
  const usableD = Math.max(depth - marginZ * 2, maxD);
  const cellW = maxW + 0.5;
  const cellD = maxD + 0.5;

  const cols = Math.max(1, Math.min(count, Math.floor(usableW / cellW) || 1));
  const rows = Math.ceil(count / cols);
  const maxZSpan = usableD / 2;

  const slots: FurnitureSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const col = i - rowStart;
    // Fixed cellW/cellD spacing between slot centers (not spread evenly across
    // usableW) — that guarantees the gap the cell size was chosen for actually
    // exists, instead of shrinking to nothing once a row is exactly full.
    const x = (col - (rowCount - 1) / 2) * cellW;
    const rawZ = (row - (rows - 1) / 2) * cellD;
    const z = Math.max(-maxZSpan, Math.min(maxZSpan, rawZ));
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
 * Furniture the user has dragged/rotated into place keeps that spot — from the
 * database once position_x/position_z/rotation_y are set there, or from the
 * local autosave cache in the meantime — so the 2D floor plan and 3D scene
 * always agree. Everything else falls back to the deterministic auto-arranged
 * grid so newly added furniture always starts somewhere sensible.
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
  const clamp = (x: number, z: number, rotationY: number) => ({
    x: Math.max(-marginX, Math.min(marginX, x)),
    z: Math.max(-marginZ, Math.min(marginZ, z)),
    rotationY,
  });

  const resolved = furniture.map((f) => {
    if (f.position_x != null && f.position_z != null) {
      return { furniture: f, pos: clamp(f.position_x, f.position_z, f.rotation_y ?? 0) };
    }
    const cached = useLocalCache ? getCachedFurniturePlacement(f.id) : null;
    if (cached) {
      return { furniture: f, pos: clamp(cached.x, cached.z, cached.rotationY) };
    }
    return { furniture: f, pos: null };
  });

  const autoFurniture = resolved.filter((r) => !r.pos).map((r) => r.furniture);
  const slots = computeFurnitureSlots(autoFurniture, width, depth);
  let autoIndex = 0;

  return resolved.map((r) => {
    if (r.pos) return { furniture: r.furniture, ...r.pos };
    const slot = slots[autoIndex];
    autoIndex += 1;
    return { furniture: r.furniture, ...slot };
  });
}
