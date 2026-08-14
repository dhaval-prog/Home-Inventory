"use client";

import { useState } from "react";
import { HomeSceneBoundary } from "@/components/three/home-scene-boundary";
import { LiveWeatherToggle } from "@/components/home/live-weather-toggle";
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
  const [liveCondition, setLiveCondition] = useState<WeatherCondition | undefined>(undefined);
  // An explicit QA `?weather=` override always wins (someone testing a
  // specific scenario); otherwise live weather takes over once enabled.
  const effectiveWeather = weather ?? liveCondition;

  return (
    <div className="relative">
      <LiveWeatherToggle onWeatherChange={setLiveCondition} />
      <HomeSceneBoundary
        className="h-64 w-full overflow-hidden rounded-xl border bg-muted/20 sm:h-72"
        rooms={rooms}
        furnitureByRoom={furnitureByRoom}
        itemsByFurniture={itemsByFurniture}
        onRoomClick={onRoomClick}
        onFurnitureClick={onFurnitureClick}
        weather={effectiveWeather}
        timeOverrideHour={timeOverrideHour}
        seasonOverride={seasonOverride}
      />
    </div>
  );
}
