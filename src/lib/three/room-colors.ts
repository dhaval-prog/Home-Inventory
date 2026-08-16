export const ROOM_FLOOR_COLORS: Record<string, string> = {
  hall: "#d8cdb6",
  kitchen: "#c9d6cf",
  bedroom: "#d9c9c2",
  bathroom: "#c7d8de",
  balcony: "#d6d6c2",
  study: "#cdd0d8",
  storeroom: "#cfc7bb",
  other: "#d3d3ce",
};

export const ROOM_WALL_COLOR = "#f2ede2";

export function roomFloorColor(type: string): string {
  return ROOM_FLOOR_COLORS[type] ?? ROOM_FLOOR_COLORS.other;
}
