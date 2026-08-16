"use client";

import { MapPin } from "lucide-react";
import { HomeSceneBoundary } from "@/components/three/home-scene-boundary";
import { useFurnitureNavigation } from "@/lib/three/use-furniture-navigation";
import type { Furniture, Room } from "@/lib/supabase/types";
import type { SceneItemSummary } from "@/lib/home-scene-data";

export function ItemLocationScene({
  rooms,
  furnitureByRoom,
  itemsByFurniture,
  focusRoomId,
  highlightFurnitureId,
}: {
  rooms: Room[];
  furnitureByRoom: Record<string, Furniture[]>;
  itemsByFurniture?: Record<string, SceneItemSummary[]>;
  focusRoomId: string;
  highlightFurnitureId: string;
}) {
  const { onRoomClick, onFurnitureClick } = useFurnitureNavigation(furnitureByRoom, focusRoomId);

  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-1.5 border-b bg-background/60 px-4 py-2 text-xs font-medium text-muted-foreground">
        <MapPin className="size-3.5 text-primary" />
        Drag to look around · Tap the room or furniture to open it
      </div>
      <HomeSceneBoundary
        className="h-72 w-full sm:h-80"
        rooms={rooms}
        furnitureByRoom={furnitureByRoom}
        itemsByFurniture={itemsByFurniture}
        focusRoomId={focusRoomId}
        highlightFurnitureId={highlightFurnitureId}
        onRoomClick={onRoomClick}
        onFurnitureClick={onFurnitureClick}
      />
    </div>
  );
}
