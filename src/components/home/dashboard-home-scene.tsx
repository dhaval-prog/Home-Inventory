"use client";

import { HomeSceneBoundary } from "@/components/three/home-scene-boundary";
import { useFurnitureNavigation } from "@/lib/three/use-furniture-navigation";
import type { Season, WeatherCondition } from "@/lib/three/environment";
import type { Furniture, Room } from "@/lib/supabase/types";
import type { SceneItemSummary } from "@/lib/home-scene-data";

export function DashboardHomeScene({
  rooms,
  furnitureByRoom,
  itemsByFurniture,
  weather,
  timeOverrideHour,
  seasonOverride,
}: {
  rooms: Room[];
  furnitureByRoom: Record<string, Furniture[]>;
  itemsByFurniture?: Record<string, SceneItemSummary[]>;
  weather?: WeatherCondition;
  timeOverrideHour?: number;
  seasonOverride?: Season;
}) {
  const { onRoomClick, onFurnitureClick } = useFurnitureNavigation(furnitureByRoom);

  return (
    <HomeSceneBoundary
      className="h-64 w-full overflow-hidden rounded-xl border bg-muted/20 sm:h-72"
      rooms={rooms}
      furnitureByRoom={furnitureByRoom}
      itemsByFurniture={itemsByFurniture}
      onRoomClick={onRoomClick}
      onFurnitureClick={onFurnitureClick}
      weather={weather}
      timeOverrideHour={timeOverrideHour}
      seasonOverride={seasonOverride}
    />
  );
}
