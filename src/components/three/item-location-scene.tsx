"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { HomeSceneBoundary } from "@/components/three/home-scene-boundary";
import type { Furniture, Room } from "@/lib/supabase/types";

export function ItemLocationScene({
  rooms,
  furnitureByRoom,
  focusRoomId,
  highlightFurnitureId,
}: {
  rooms: Room[];
  furnitureByRoom: Record<string, Furniture[]>;
  focusRoomId: string;
  highlightFurnitureId: string;
}) {
  const router = useRouter();
  const furnitureRoomMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [roomId, list] of Object.entries(furnitureByRoom)) {
      for (const f of list) map[f.id] = roomId;
    }
    return map;
  }, [furnitureByRoom]);

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
        focusRoomId={focusRoomId}
        highlightFurnitureId={highlightFurnitureId}
        onRoomClick={(roomId) => router.push(`/home/rooms/${roomId}`)}
        onFurnitureClick={(furnitureId) => {
          const roomId = furnitureRoomMap[furnitureId] ?? focusRoomId;
          router.push(`/home/rooms/${roomId}/furniture/${furnitureId}`);
        }}
      />
    </div>
  );
}
