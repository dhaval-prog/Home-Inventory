import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Home as HomeIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFurnitureDetail } from "@/lib/furniture-data";
import { getIcon, getCompactIcon } from "@/lib/icon-map";
import { AddStorageLocationDialog } from "@/components/home/add-storage-location-dialog";
import { StorageLocationSection } from "@/components/home/storage-location-section";
import { EmptyState } from "@/components/shared/empty-state";

export default async function FurniturePage({
  params,
}: {
  params: Promise<{ roomId: string; furnitureId: string }>;
}) {
  const { roomId, furnitureId } = await params;
  const supabase = await createClient();
  const detail = await getFurnitureDetail(supabase, furnitureId);
  if (!detail) notFound();

  const { home, room, furniture, locations, totalItems } = detail;
  const RoomIcon = getCompactIcon(room.icon);
  const FurnitureIcon = getIcon(furniture.icon);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/home?id=${home.id}`} className="flex items-center gap-1 hover:text-foreground">
          <HomeIcon className="size-3.5" />
          {home.name}
        </Link>
        <ChevronRight className="size-3.5 opacity-50" />
        <Link href={`/home/rooms/${roomId}`} className="flex items-center gap-1 hover:text-foreground">
          <RoomIcon className="size-3.5" />
          {room.name}
        </Link>
        <ChevronRight className="size-3.5 opacity-50" />
        <span className="flex items-center gap-1 font-medium text-foreground">
          <FurnitureIcon className="size-3.5" />
          {furniture.name}
        </span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{furniture.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {locations.length} storage location{locations.length === 1 ? "" : "s"} · {totalItems} item
            {totalItems === 1 ? "" : "s"}
          </p>
        </div>
        <AddStorageLocationDialog
          furnitureId={furnitureId}
          roomId={roomId}
          furnitureType={furniture.type}
          existingNames={locations.map((l) => l.location.name)}
        />
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon={furniture.icon}
          title="No storage locations yet"
          description="Break this furniture down into shelves, drawers, or sections so you always know exactly where things are."
          action={
            <AddStorageLocationDialog
              furnitureId={furnitureId}
              roomId={roomId}
              furnitureType={furniture.type}
              existingNames={[]}
            />
          }
        />
      ) : (
        <div className="space-y-4">
          {locations.map((loc) => (
            <StorageLocationSection key={loc.location.id} roomId={roomId} furnitureId={furnitureId} data={loc} />
          ))}
        </div>
      )}
    </div>
  );
}
