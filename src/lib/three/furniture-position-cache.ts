// Client-only autosave cache for dragged/rotated furniture placement. This is
// the immediate, reliable persistence layer (works with zero backend setup);
// the furniture table's position_x/position_z/rotation_y columns are the
// durable, cross-device layer once that migration is applied. placeFurniture()
// reads this cache as a fallback whenever the database hasn't caught up yet,
// so both the 2D floor plan and the 3D scene stay in sync either way.

export interface FurniturePlacement {
  x: number;
  z: number;
  rotationY: number;
}

const STORAGE_PREFIX = "home-inventory:furniture-position:";

export function getCachedFurniturePlacement(furnitureId: string): FurniturePlacement | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + furnitureId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: unknown; z?: unknown; rotationY?: unknown };
    if (typeof parsed.x === "number" && typeof parsed.z === "number") {
      return { x: parsed.x, z: parsed.z, rotationY: typeof parsed.rotationY === "number" ? parsed.rotationY : 0 };
    }
    return null;
  } catch {
    return null;
  }
}

export function setCachedFurniturePlacement(furnitureId: string, x: number, z: number, rotationY: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + furnitureId, JSON.stringify({ x, z, rotationY }));
  } catch {
    // Private browsing / storage quota — the drag still works for this session, just won't autosave.
  }
}
