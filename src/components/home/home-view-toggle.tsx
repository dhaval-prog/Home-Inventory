"use client";

import { RoomCard } from "@/components/home/room-card";
import type { RoomWithFurniture } from "@/lib/home-data";

export function HomeViewToggle({
  homeId,
  rooms,
}: {
  homeId: string;
  rooms: RoomWithFurniture[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((r, i) => (
        <RoomCard key={r.room.id} homeId={homeId} data={r} isFirst={i === 0} isLast={i === rooms.length - 1} />
      ))}
    </div>
  );
}
