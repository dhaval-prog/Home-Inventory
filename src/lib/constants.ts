import type { HomeType } from "@/lib/supabase/types";

export interface RoomTemplateEntry {
  name: string;
  type: RoomType;
  icon: string;
}

export type RoomType =
  | "hall"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "balcony"
  | "study"
  | "storeroom"
  | "other";

export const ROOM_TYPE_META: Record<RoomType, { label: string; icon: string }> = {
  hall: { label: "Hall", icon: "Sofa" },
  kitchen: { label: "Kitchen", icon: "ChefHat" },
  bedroom: { label: "Bedroom", icon: "Bed" },
  bathroom: { label: "Bathroom", icon: "Bath" },
  balcony: { label: "Balcony", icon: "DoorOpen" },
  study: { label: "Study", icon: "BookOpen" },
  storeroom: { label: "Storeroom", icon: "Warehouse" },
  other: { label: "Other", icon: "Home" },
};

export const HOME_TYPE_META: Record<HomeType, { label: string; description: string; icon: string }> = {
  "1bhk": { label: "1 BHK", description: "1 Hall, 1 Kitchen, 1 Bedroom", icon: "Home" },
  "2bhk": { label: "2 BHK", description: "1 Hall, 1 Kitchen, 2 Bedrooms", icon: "Home" },
  "3bhk": { label: "3 BHK", description: "1 Hall, 1 Kitchen, 3 Bedrooms", icon: "Home" },
  custom: { label: "Custom", description: "Build your own room layout", icon: "Grid2x2" },
};

export const ROOM_TEMPLATES: Record<HomeType, RoomTemplateEntry[]> = {
  "1bhk": [
    { name: "Hall", type: "hall", icon: "Sofa" },
    { name: "Kitchen", type: "kitchen", icon: "ChefHat" },
    { name: "Bedroom", type: "bedroom", icon: "Bed" },
  ],
  "2bhk": [
    { name: "Hall", type: "hall", icon: "Sofa" },
    { name: "Kitchen", type: "kitchen", icon: "ChefHat" },
    { name: "Bedroom 1", type: "bedroom", icon: "Bed" },
    { name: "Bedroom 2", type: "bedroom", icon: "Bed" },
  ],
  "3bhk": [
    { name: "Hall", type: "hall", icon: "Sofa" },
    { name: "Kitchen", type: "kitchen", icon: "ChefHat" },
    { name: "Bedroom 1", type: "bedroom", icon: "Bed" },
    { name: "Bedroom 2", type: "bedroom", icon: "Bed" },
    { name: "Bedroom 3", type: "bedroom", icon: "Bed" },
  ],
  custom: [],
};

export interface FurnitureOption {
  name: string;
  type: string;
  icon: string;
}

export const FURNITURE_BY_ROOM_TYPE: Record<RoomType, FurnitureOption[]> = {
  hall: [
    { name: "Sofa", type: "sofa", icon: "Sofa" },
    { name: "TV Unit", type: "tv_unit", icon: "Tv" },
    { name: "Coffee Table", type: "coffee_table", icon: "Table2" },
    { name: "Side Table", type: "side_table", icon: "Table2" },
    { name: "Bookshelf", type: "bookshelf", icon: "BookOpen" },
    { name: "Cabinet", type: "cabinet", icon: "Archive" },
    { name: "Showcase", type: "showcase", icon: "Grid2x2" },
    { name: "Shoe Rack", type: "shoe_rack", icon: "Rows3" },
    { name: "Storage Box", type: "storage_box", icon: "Box" },
  ],
  bedroom: [
    { name: "Bed", type: "bed", icon: "Bed" },
    { name: "Wardrobe", type: "wardrobe", icon: "Shirt" },
    { name: "Chest of Drawers", type: "chest_of_drawers", icon: "Columns3" },
    { name: "Bedside Table", type: "bedside_table", icon: "Lamp" },
    { name: "Dressing Table", type: "dressing_table", icon: "Table2" },
    { name: "Cabinet", type: "cabinet", icon: "Archive" },
    { name: "Storage Box", type: "storage_box", icon: "Box" },
    { name: "Suitcase", type: "suitcase", icon: "Luggage" },
  ],
  kitchen: [
    { name: "Kitchen Cabinet", type: "kitchen_cabinet", icon: "Archive" },
    { name: "Wall Cabinet", type: "wall_cabinet", icon: "Grid2x2" },
    { name: "Drawer", type: "drawer", icon: "Columns3" },
    { name: "Pantry", type: "pantry", icon: "Warehouse" },
    { name: "Refrigerator", type: "refrigerator", icon: "Refrigerator" },
    { name: "Storage Rack", type: "storage_rack", icon: "Rows3" },
    { name: "Container Shelf", type: "container_shelf", icon: "Layers" },
  ],
  bathroom: [
    { name: "Cabinet", type: "cabinet", icon: "Archive" },
    { name: "Shelf", type: "shelf", icon: "Rows3" },
    { name: "Storage Box", type: "storage_box", icon: "Box" },
  ],
  balcony: [
    { name: "Storage Cabinet", type: "cabinet", icon: "Archive" },
    { name: "Rack", type: "storage_rack", icon: "Rows3" },
    { name: "Box", type: "box", icon: "Box" },
  ],
  study: [
    { name: "Study Table", type: "study_table", icon: "Table2" },
    { name: "Bookshelf", type: "bookshelf", icon: "BookOpen" },
    { name: "Cabinet", type: "cabinet", icon: "Archive" },
    { name: "Drawer", type: "drawer", icon: "Columns3" },
  ],
  storeroom: [
    { name: "Shelf", type: "shelf", icon: "Rows3" },
    { name: "Cabinet", type: "cabinet", icon: "Archive" },
    { name: "Locker", type: "locker", icon: "SquareStack" },
    { name: "Box", type: "box", icon: "Box" },
  ],
  other: [],
};

export const GENERIC_FURNITURE: FurnitureOption[] = [
  { name: "Box", type: "box", icon: "Box" },
  { name: "Bag", type: "bag", icon: "ShoppingBag" },
  { name: "Suitcase", type: "suitcase", icon: "Luggage" },
  { name: "Drawer", type: "drawer", icon: "Columns3" },
  { name: "Shelf", type: "shelf", icon: "Rows3" },
  { name: "Cabinet", type: "cabinet", icon: "Archive" },
  { name: "Locker", type: "locker", icon: "SquareStack" },
  { name: "Other", type: "other", icon: "Package" },
];

export const STORAGE_LOCATION_PRESETS: Record<string, string[]> = {
  wardrobe: ["Top Shelf", "Middle Shelf", "Bottom Shelf", "Drawer 1", "Drawer 2", "Left Section", "Right Section"],
  chest_of_drawers: ["Drawer 1", "Drawer 2", "Drawer 3", "Drawer 4"],
  kitchen_cabinet: ["Cabinet 1", "Cabinet 2", "Cabinet 3", "Drawer 1", "Drawer 2"],
  wall_cabinet: ["Cabinet 1", "Cabinet 2", "Cabinet 3"],
  refrigerator: ["Freezer", "Top Shelf", "Middle Shelf", "Bottom Shelf", "Door Rack", "Vegetable Drawer"],
  cabinet: ["Top Shelf", "Middle Shelf", "Bottom Shelf", "Drawer 1", "Drawer 2"],
  bookshelf: ["Shelf 1", "Shelf 2", "Shelf 3", "Shelf 4"],
  tv_unit: ["Left Cabinet", "Right Cabinet", "Top Shelf", "Drawer 1"],
  default: ["Shelf 1", "Shelf 2", "Drawer 1", "Drawer 2", "Section A", "Section B"],
};

export const ITEM_CATEGORIES = [
  { value: "documents", label: "Documents", icon: "FileText" },
  { value: "electronics", label: "Electronics", icon: "Tv" },
  { value: "clothes", label: "Clothes", icon: "Shirt" },
  { value: "shoes", label: "Shoes", icon: "Rows3" },
  { value: "kitchen", label: "Kitchen", icon: "UtensilsCrossed" },
  { value: "food", label: "Food", icon: "Refrigerator" },
  { value: "tools", label: "Tools", icon: "Wrench" },
  { value: "toys", label: "Toys", icon: "ToyBrick" },
  { value: "books", label: "Books", icon: "BookOpen" },
  { value: "medicines", label: "Medicines", icon: "Pill" },
  { value: "cleaning", label: "Cleaning", icon: "WashingMachine" },
  { value: "travel", label: "Travel", icon: "Luggage" },
  { value: "personal", label: "Personal", icon: "Backpack" },
  { value: "accessories", label: "Accessories", icon: "Gem" },
  { value: "important", label: "Important", icon: "Star" },
  { value: "other", label: "Other", icon: "Package" },
] as const;

export const SUGGESTED_TAGS = [
  "Important",
  "Rarely Used",
  "Daily Use",
  "Travel",
  "Winter",
  "Summer",
  "Work",
  "Personal",
  "Kids",
  "Emergency",
];

export function categoryIcon(value: string): string {
  return ITEM_CATEGORIES.find((c) => c.value === value)?.icon ?? "Package";
}

export function categoryLabel(value: string): string {
  return ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}
