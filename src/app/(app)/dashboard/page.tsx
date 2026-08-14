import Link from "next/link";
import { Plus, Search, Home as HomeIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { getHomeSceneData } from "@/lib/home-scene-data";
import { getIcon } from "@/lib/icon-map";
import { HOME_TYPE_META } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocationPath } from "@/components/shared/location-path";
import { relativeDay } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { SeedDemoButton } from "@/components/shared/seed-demo-button";
import { DashboardHomeScene } from "@/components/home/dashboard-home-scene";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ItemPreviewContent } from "@/components/items/item-preview-content";

const ICON_BADGE_GRADIENTS = [
  "from-[#fdf3c8] to-[#f4a8cf]",
  "from-[#f4a8cf] to-[#c9a1f0]",
  "from-[#fbdcc4] to-[#f4a8cf]",
];

const STORAGE_BADGE_STYLES = [
  "bg-[#0b0b14] text-white",
  "bg-gradient-to-br from-[#f4a8cf] to-[#c9a1f0] text-[#0b0b14]",
  "bg-[#0b0b14]/8 text-[#0b0b14]",
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .maybeSingle();
  const data = await getDashboardData(supabase);
  const sceneDataByHome = Object.fromEntries(
    (
      await Promise.all(
        data.homes.map(
          async ({ home }) =>
            [home.id, await getHomeSceneData(supabase, home.id)] as const,
        ),
      )
    ).filter(([, scene]) => scene !== null),
  );

  const name = profile?.name || user?.email?.split("@")[0] || "there";
  const subtext =
    data.homes.length > 0
      ? `${data.totals.rooms} room${data.totals.rooms === 1 ? "" : "s"}, ${data.totals.items} item${data.totals.items === 1 ? "" : "s"} catalogued.` +
        (data.totals.noPhoto > 0
          ? ` ${data.totals.noPhoto} thing${data.totals.noPhoto === 1 ? "" : "s"} need${data.totals.noPhoto === 1 ? "s" : ""} a photo.`
          : "")
      : "Here's what's going on in your home.";

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {greeting()}, {name}.
          </h1>
          <p className="mt-2 text-[15px] text-[#0b0b14]/60">{subtext}</p>
        </div>
        {data.homes.length > 0 && (
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-white/60 px-3.5 py-1.5 text-xs text-[#0b0b14]/60 md:inline-flex">
            <span className="size-1.5 rounded-full bg-[#0b0b14]" />
            Synced just now
          </span>
        )}
      </div>

      {data.homes.length === 0 ? (
        <EmptyState
          icon="Home"
          title="Let's set up your home"
          description="Create your first home to start mapping out rooms, furniture, and everything stored inside them."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                render={
                  <Link href="/home/new">
                    <Plus className="size-4" />
                    Create your home
                  </Link>
                }
              />
              <SeedDemoButton />
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-5">
            <div className={data.homes.length > 1 ? "grid gap-5 xl:grid-cols-2" : "grid gap-5"}>
              {data.homes.map(
                ({ home, roomCount, furnitureCount, itemCount }) => {
                  const meta = HOME_TYPE_META[home.home_type];
                  return (
                    <Card key={home.id} className="p-5">
                      <CardHeader className="flex-row items-start justify-between space-y-0 p-0">
                        <div>
                          <p className="text-[10.5px] font-medium uppercase tracking-widest text-[#0b0b14]/45">
                            Your home
                          </p>
                          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                            {home.name}
                          </h2>
                          <div className="mt-2 flex gap-1.5">
                            <Badge className="bg-[#0b0b14] text-white">
                              {meta.label}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="bg-[#0b0b14]/7 text-[#0b0b14]"
                            >
                              {roomCount} room{roomCount === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#0b0b14]/12 bg-white"
                          render={
                            <Link href={`/home?id=${home.id}&manage=1`}>
                              Manage
                            </Link>
                          }
                        />
                      </CardHeader>
                      <CardContent className="mt-3.5 space-y-3.5 p-0">
                        {roomCount > 0 && sceneDataByHome[home.id] ? (
                          <DashboardHomeScene
                            rooms={sceneDataByHome[home.id]!.rooms}
                            furnitureByRoom={
                              sceneDataByHome[home.id]!.furnitureByRoom
                            }
                            itemsByFurniture={
                              sceneDataByHome[home.id]!.itemsByFurniture
                            }
                          />
                        ) : (
                          <div className="flex h-64 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#fdf3c8] via-[#f4a8cf] to-[#c9a1f0] text-[11px] font-medium uppercase tracking-widest text-[#0b0b14]/45 sm:h-72">
                            <HomeIcon className="mr-2 size-4" /> 3D home view
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 rounded-[20px] bg-white p-3 text-center">
                          <Stat label="Rooms" value={roomCount} />
                          <Stat label="Furniture" value={furnitureCount} />
                          <Stat label="Items" value={itemCount} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            render={
                              <Link href={`/home?id=${home.id}`}>
                                View home
                              </Link>
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-[#0b0b14]/12 bg-white"
                            render={
                              <Link
                                href={`/quick-add?type=item&homeId=${home.id}`}
                              >
                                <Plus className="size-4" />
                                Add item
                              </Link>
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-[#0b0b14]/12 bg-white"
                            render={
                              <Link href="/search">
                                <Search className="size-4" />
                                Search items
                              </Link>
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                },
              )}
            </div>
          </div>

          <div className="space-y-5 lg:w-[380px] lg:shrink-0">
            <Card className="p-5">
              <CardHeader className="flex-row items-baseline p-0">
                <h3 className="text-[17px] font-semibold tracking-tight">
                  Recently added
                </h3>
                <Link href="/recent" className="ml-auto text-xs font-medium">
                  All
                </Link>
              </CardHeader>
              <CardContent className="mt-3 p-0">
                {data.recentItems.length === 0 ? (
                  <p className="text-sm text-[#0b0b14]/55">
                    Nothing added yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#0b0b14]/6">
                    {data.recentItems.map(({ item, path }, i) => (
                      <li key={item.id}>
                        <HoverCard>
                          <HoverCardTrigger
                            render={
                              <Link
                                href={`/items/${item.id}`}
                                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
                              >
                                <span
                                  className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${ICON_BADGE_GRADIENTS[i % ICON_BADGE_GRADIENTS.length]}`}
                                >
                                  <HomeIcon className="size-3.5 text-[#0b0b14]" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-semibold">
                                    {item.name}
                                  </span>
                                  <LocationPath
                                    nodes={path}
                                    container={item.container}
                                    className="mt-0.5"
                                  />
                                </span>
                                <span className="shrink-0 text-[11px] text-[#0b0b14]/45">
                                  {relativeDay(item.created_at)}
                                </span>
                              </Link>
                            }
                          />
                          <HoverCardContent>
                            <ItemPreviewContent item={item} path={path} />
                          </HoverCardContent>
                        </HoverCard>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="p-5">
              <CardHeader className="p-0">
                <h3 className="text-[17px] font-semibold tracking-tight">
                  Most used storage
                </h3>
              </CardHeader>
              <CardContent className="mt-3 p-0">
                {data.topAreas.length === 0 ? (
                  <p className="text-sm text-[#0b0b14]/55">
                    No storage areas in use yet.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {data.topAreas.map((area, i) => {
                      const Icon = getIcon(area.icon);
                      return (
                        <li
                          key={area.furnitureId}
                          className="flex items-center gap-2.5 text-[13px]"
                        >
                          <span
                            className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${STORAGE_BADGE_STYLES[i % STORAGE_BADGE_STYLES.length]}`}
                          >
                            {i + 1}
                          </span>
                          <Icon className="size-4 shrink-0 text-[#0b0b14]/45" />
                          <span className="min-w-0 flex-1 truncate">
                            {area.roomName} {area.roomName && "·"}{" "}
                            {area.furnitureName}
                          </span>
                          <Badge
                            variant="secondary"
                            className="shrink-0 bg-[#0b0b14]/7 text-[#0b0b14]"
                          >
                            {area.itemCount} items
                          </Badge>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-medium leading-none tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[#0b0b14]/50">{label}</p>
    </div>
  );
}
