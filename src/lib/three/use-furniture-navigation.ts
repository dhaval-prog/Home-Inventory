"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Furniture } from "@/lib/supabase/types";

/** Click-through navigation shared by every 3D scene embed: room -> room page, furniture -> furniture page. */
export function useFurnitureNavigation(furnitureByRoom: Record<string, Furniture[]>, fallbackRoomId?: string) {
  const router = useRouter();

  const furnitureRoomMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [roomId, list] of Object.entries(furnitureByRoom)) {
      for (const f of list) map[f.id] = roomId;
    }
    return map;
  }, [furnitureByRoom]);

  return {
    onRoomClick: (roomId: string) => router.push(`/home/rooms/${roomId}`),
    onFurnitureClick: (furnitureId: string) => {
      const roomId = furnitureRoomMap[furnitureId] ?? fallbackRoomId;
      if (roomId) router.push(`/home/rooms/${roomId}/furniture/${furnitureId}`);
    },
  };
}
