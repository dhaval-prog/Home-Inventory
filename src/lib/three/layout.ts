import type { Furniture } from "@/lib/supabase/types";
import { getCachedFurniturePlacement } from "@/lib/three/furniture-position-cache";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";

export const ROOM_WIDTH = 6.4;
export const ROOM_DEPTH = 5.2;

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
 * A 90°/270° rotation swaps which footprint axis faces the room's width vs.
 * depth, so the clamp bounds have to swap with it — otherwise a rotated piece
 * clamped using its un-rotated half-extents can still poke through a wall.
 */
export function rotatedFootprintHalfExtents(type: string, rotationY: number): [number, number] {
  const [footprintW, footprintD] = getFurnitureRecipe(type).footprint;
  const swapped = Math.round(rotationY / 90) % 2 !== 0;
  return swapped ? [footprintD / 2, footprintW / 2] : [footprintW / 2, footprintD / 2];
}

/**
 * Clamps a furniture position so its full footprint (not just its center
 * point) stays inside the room walls, accounting for the piece's own size and
 * current rotation.
 */
export function clampPositionToRoom(
  type: string,
  rotationY: number,
  x: number,
  z: number,
  width: number,
  depth: number
): { x: number; z: number } {
  const [halfW, halfD] = rotatedFootprintHalfExtents(type, rotationY);
  const marginX = Math.max(0, width / 2 - 0.3 - halfW);
  const marginZ = Math.max(0, depth / 2 - 0.3 - halfD);
  return {
    x: Math.max(-marginX, Math.min(marginX, x)),
    z: Math.max(-marginZ, Math.min(marginZ, z)),
  };
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
  const clamp = (f: Furniture, x: number, z: number, rotationY: number) => ({
    ...clampPositionToRoom(f.type, rotationY, x, z, width, depth),
    rotationY,
  });

  const resolved = furniture.map((f) => {
    if (f.position_x != null && f.position_z != null) {
      return { furniture: f, pos: clamp(f, f.position_x, f.position_z, f.rotation_y ?? 0) };
    }
    const cached = useLocalCache ? getCachedFurniturePlacement(f.id) : null;
    if (cached) {
      return { furniture: f, pos: clamp(f, cached.x, cached.z, cached.rotationY) };
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
