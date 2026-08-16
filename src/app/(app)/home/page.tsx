import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHomeViewData } from "@/lib/home-data";
import { HOME_TYPE_META } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { HomeViewToggle } from "@/components/home/home-view-toggle";
import { AddRoomDialog } from "@/components/home/add-room-dialog";
import { DeleteHomeDialog } from "@/components/home/delete-home-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Plus, Star, AlertTriangle } from "lucide-react";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: homes }, { data: profile }] = await Promise.all([
    supabase.from("homes").select("id, name").order("created_at", { ascending: true }),
    supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
  ]);

  if (!homes || homes.length === 0) {
    redirect("/home/new");
  }

  const homeId = id && homes.some((h) => h.id === id) ? id : homes[0].id;
  const data = await getHomeViewData(supabase, homeId);
  if (!data) redirect("/home/new");

  const { home, rooms, totals } = data!;
  const meta = HOME_TYPE_META[home.home_type];
  const name = profile?.name || user?.email?.split("@")[0] || "there";
  const subtext =
    `${rooms.length} room${rooms.length === 1 ? "" : "s"}, ${totals.items} item${totals.items === 1 ? "" : "s"} catalogued.` +
    (totals.noPhoto > 0
      ? ` ${totals.noPhoto} thing${totals.noPhoto === 1 ? "" : "s"} need${totals.noPhoto === 1 ? "s" : ""} a photo.`
      : "");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          {greeting()}, {name}.
        </h1>
        <p className="mt-2 text-[15px] text-[#0b0b14]/60">{subtext}</p>
      </div>

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
        <div className="flex flex-wrap items-center gap-2">
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
          <Link href={`/quick-add?type=item&homeId=${homeId}`}>
            <Button size="sm">
              <Plus className="size-4" />
              Add Item
            </Button>
          </Link>
          {homes.length > 1 && <DeleteHomeDialog homeId={homeId} homeName={home.name} roomCount={rooms.length} />}
          <span className="mx-1 hidden h-6 w-px bg-[#0b0b14]/10 sm:block" />
          <Link href="/favorites">
            <Button variant="outline" size="sm" className="border-[#0b0b14]/12 bg-white">
              <Star className="size-4" />
              Favorites
            </Button>
          </Link>
          <Link href="/important">
            <Button variant="outline" size="sm" className="border-[#0b0b14]/12 bg-white">
              <AlertTriangle className="size-4" />
              Important
            </Button>
          </Link>
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
        <HomeViewToggle homeId={homeId} rooms={rooms} />
      )}
    </div>
  );
}
