import { RoomTopViewBoundary } from "@/components/three/room-top-view-boundary";
import type { Furniture, Room } from "@/lib/supabase/types";

export function RoomTopView({
  room,
  furniture,
  itemCountByFurniture,
}: {
  room: Room;
  furniture: Furniture[];
  itemCountByFurniture: Record<string, number>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/20 p-4 md:p-6">
      <RoomTopViewBoundary
        className="mx-auto h-72 w-full overflow-hidden rounded-xl sm:h-80"
        room={room}
        furniture={furniture}
        itemCountByFurniture={itemCountByFurniture}
      />
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Drag to rearrange · Tap the ↻ icon to rotate · Tap the item to open
      </p>
    </div>
  );
}
