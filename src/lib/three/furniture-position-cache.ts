// Client-only autosave cache for dragged furniture positions. This is the
// immediate, reliable persistence layer (works with zero backend setup);
// the furniture table's position_x/position_z columns are the durable,
// cross-device layer once that migration is applied. placeFurniture() reads
// this cache as a fallback whenever the database hasn't caught up yet, so
// both the 2D floor plan and the 3D scene stay in sync either way.

const STORAGE_PREFIX = "home-inventory:furniture-position:";

export function getCachedFurniturePosition(furnitureId: string): { x: number; z: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + furnitureId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: unknown; z?: unknown };
    if (typeof parsed.x === "number" && typeof parsed.z === "number") {
      return { x: parsed.x, z: parsed.z };
    }
    return null;
  } catch {
    return null;
  }
}

export function setCachedFurniturePosition(furnitureId: string, x: number, z: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + furnitureId, JSON.stringify({ x, z }));
  } catch {
    // Private browsing / storage quota — the drag still works for this session, just won't autosave.
  }
}
