import type { ComponentType } from "react";
import {
  Tv,
  Refrigerator,
  Bed,
  Shirt,
  Archive,
  Box,
  ShoppingBag,
  Briefcase,
  Lamp,
  UtensilsCrossed,
  Package,
  DoorOpen,
  Home,
  ChefHat,
  Bath,
  Warehouse,
  BookOpen,
  Wrench,
  Pill,
  Star,
  FileText,
  Camera,
  Key,
  Backpack,
  Container,
  Folder,
  Armchair,
  Table2,
  WashingMachine,
  ToyBrick,
  Gamepad2,
  Gem,
  Luggage,
  Rows3,
  Columns3,
  Layers,
  SquareStack,
  Grid2x2,
  AlertTriangle,
  Clock,
  Search,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { SofaIcon } from "@/components/icons/sofa-icon";

export type AppIcon = ComponentType<{ className?: string }>;

export const ICON_MAP: Record<string, AppIcon> = {
  Sofa: SofaIcon,
  Tv,
  Refrigerator,
  Bed,
  Shirt,
  Archive,
  Box,
  ShoppingBag,
  Briefcase,
  Lamp,
  UtensilsCrossed,
  Package,
  DoorOpen,
  Home,
  ChefHat,
  Bath,
  Warehouse,
  BookOpen,
  Wrench,
  Pill,
  Star,
  FileText,
  Camera,
  Key,
  Backpack,
  Container,
  Folder,
  Armchair,
  Table2,
  WashingMachine,
  ToyBrick,
  Gamepad2,
  Gem,
  Luggage,
  Rows3,
  Columns3,
  Layers,
  SquareStack,
  Grid2x2,
  AlertTriangle,
  Clock,
  Search,
  Settings,
  LayoutDashboard,
};

export function getIcon(name: string | null | undefined): AppIcon {
  return (name && ICON_MAP[name]) || Package;
}

// The Sofa furniture icon is a photo, which doesn't read well at the small
// sizes used in breadcrumbs, room labels, and dense ranked lists — those
// contexts fall back to a plain glyph instead.
const COMPACT_ICON_OVERRIDES: Record<string, AppIcon> = {
  Sofa: Armchair,
};

export function getCompactIcon(name: string | null | undefined): AppIcon {
  if (name && COMPACT_ICON_OVERRIDES[name]) return COMPACT_ICON_OVERRIDES[name];
  return getIcon(name);
}
