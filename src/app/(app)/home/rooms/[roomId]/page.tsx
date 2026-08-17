import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Home as HomeIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCompactIcon } from "@/lib/icon-map";
import { AddFurnitureDialog } from "@/components/home/add-furniture-dialog";
import { FurnitureCard } from "@/components/home/furniture-card";
import { EmptyState } from "@/components/shared/empty-state";
import type { RoomType } from "@/lib/constants";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const supabase = await createClient();

  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (!room) notFound();

  const { data: home } = await supabase.from("homes").select("*").eq("id", room.home_id).maybeSingle();
  if (!home) notFound();

  const { data: furniture } = await supabase
    .from("furniture")
    .select("*")
    .eq("room_id", roomId)
    .order("sort_order", { ascending: true });

  const furnitureIds = (furniture ?? []).map((f) => f.id);
  const { data: locations } = furnitureIds.length
    ? await supabase.from("storage_locations").select("id, furniture_id").in("furniture_id", furnitureIds)
    : { data: [] as { id: string; furniture_id: string }[] };

  const locationIds = (locations ?? []).map((l) => l.id);
  const { data: items } = locationIds.length
    ? await supabase.from("items").select("id, storage_location_id").in("storage_location_id", locationIds)
    : { data: [] as { id: string; storage_location_id: string }[] };

  const locToFurniture = new Map((locations ?? []).map((l) => [l.id, l.furniture_id]));
  const countByFurniture = new Map<string, number>();
  for (const item of items ?? []) {
    const fId = locToFurniture.get(item.storage_location_id);
    if (!fId) continue;
    countByFurniture.set(fId, (countByFurniture.get(fId) ?? 0) + 1);
  }

  const RoomIcon = getCompactIcon(room.icon);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/home?id=${home.id}`} className="flex items-center gap-1 hover:text-foreground">
          <HomeIcon className="size-3.5" />
          {home.name}
        </Link>
        <ChevronRight className="size-3.5 opacity-50" />
        <span className="flex items-center gap-1 font-medium text-foreground">
          <RoomIcon className="size-3.5" />
          {room.name}
        </span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{room.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {(furniture ?? []).length} furniture item{(furniture ?? []).length === 1 ? "" : "s"}
          </p>
        </div>
        <AddFurnitureDialog roomId={roomId} roomType={room.type as RoomType} />
      </div>

      {(furniture ?? []).length === 0 ? (
        <EmptyState
          icon={room.icon}
          isRoomIcon
          title="No furniture yet"
          description="This room is empty. Add your first piece of furniture to start organizing your belongings."
          action={<AddFurnitureDialog roomId={roomId} roomType={room.type as RoomType} />}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(furniture ?? []).map((f) => (
            <FurnitureCard key={f.id} roomId={roomId} furniture={f} itemCount={countByFurniture.get(f.id) ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
