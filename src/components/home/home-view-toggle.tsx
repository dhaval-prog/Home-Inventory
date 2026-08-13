"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeSceneBoundary } from "@/components/three/home-scene-boundary";
import { RoomCard } from "@/components/home/room-card";
import type { RoomWithFurniture } from "@/lib/home-data";

export function HomeViewToggle({ homeId, rooms }: { homeId: string; rooms: RoomWithFurniture[] }) {
  const router = useRouter();
  const [view, setView] = useState<"3d" | "list">("3d");

  const furnitureByRoom = useMemo(() => {
    const map: Record<string, RoomWithFurniture["furniture"]> = {};
    for (const r of rooms) map[r.room.id] = r.furniture;
    return map;
  }, [rooms]);

  const furnitureRoomMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rooms) for (const f of r.furniture) map[f.id] = r.room.id;
    return map;
  }, [rooms]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === "3d" ? "default" : "ghost"}
            className="gap-1.5"
            onClick={() => setView("3d")}
          >
            <Box className="size-3.5" />
            3D View
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            className="gap-1.5"
            onClick={() => setView("list")}
          >
            <LayoutGrid className="size-3.5" />
            List View
          </Button>
        </div>
        {view === "3d" && (
          <p className="hidden text-xs text-muted-foreground sm:block">
            Drag to orbit · Scroll/pinch to zoom · Tap a room or furniture to open it
          </p>
        )}
      </div>

      {view === "3d" ? (
        <HomeSceneBoundary
          className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border bg-muted/20"
          rooms={rooms.map((r) => r.room)}
          furnitureByRoom={furnitureByRoom}
          onRoomClick={(roomId) => router.push(`/home/rooms/${roomId}`)}
          onFurnitureClick={(furnitureId) => {
            const roomId = furnitureRoomMap[furnitureId];
            if (roomId) router.push(`/home/rooms/${roomId}/furniture/${furnitureId}`);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r, i) => (
            <RoomCard key={r.room.id} homeId={homeId} data={r} isFirst={i === 0} isLast={i === rooms.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
