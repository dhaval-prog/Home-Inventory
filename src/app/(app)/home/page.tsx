import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHomeViewData } from "@/lib/home-data";
import { HOME_TYPE_META } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { RoomCard } from "@/components/home/room-card";
import { AddRoomDialog } from "@/components/home/add-room-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await createClient();
  const { data: homes } = await supabase
    .from("homes")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (!homes || homes.length === 0) {
    redirect("/home/new");
  }

  const homeId = id && homes.some((h) => h.id === id) ? id : homes[0].id;
  const data = await getHomeViewData(supabase, homeId);
  if (!data) redirect("/home/new");

  const { home, rooms } = data!;
  const meta = HOME_TYPE_META[home.home_type];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{home.name}</h1>
            <Badge variant="secondary">{meta.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rooms.length} room{rooms.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {homes.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {homes.map((h) => (
                <Link key={h.id} href={`/home?id=${h.id}`}>
                  <Badge variant={h.id === homeId ? "default" : "outline"}>{h.name}</Badge>
                </Link>
              ))}
            </div>
          )}
          <Link href="/home/new">
            <Button variant="ghost" size="sm">
              <Plus className="size-4" />
              New Home
            </Button>
          </Link>
          <AddRoomDialog homeId={homeId} />
        </div>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon="DoorOpen"
          title="No rooms yet"
          description="Add your first room to start mapping out this home."
          action={<AddRoomDialog homeId={homeId} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r, i) => (
            <RoomCard
              key={r.room.id}
              homeId={homeId}
              data={r}
              isFirst={i === 0}
              isLast={i === rooms.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
