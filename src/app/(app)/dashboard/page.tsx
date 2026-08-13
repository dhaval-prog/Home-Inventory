import Link from "next/link";
import { Sparkles, Eye, Plus, Search, Settings2, Home as HomeIcon } from "lucide-react";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ItemPreviewContent } from "@/components/items/item-preview-content";

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
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
  const data = await getDashboardData(supabase);
  const sceneDataByHome = Object.fromEntries(
    (
      await Promise.all(
        data.homes.map(async ({ home }) => [home.id, await getHomeSceneData(supabase, home.id)] as const)
      )
    ).filter(([, scene]) => scene !== null)
  );

  const name = profile?.name || user?.email?.split("@")[0] || "there";

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {greeting()}, {name} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">Here&apos;s what&apos;s going on in your home.</p>
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
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.homes.map(({ home, roomCount, furnitureCount, itemCount }) => {
              const meta = HOME_TYPE_META[home.home_type];
              return (
                <Card key={home.id} className="overflow-hidden">
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Your Home
                      </p>
                      <h2 className="text-xl font-semibold">{home.name}</h2>
                      <Badge variant="secondary" className="mt-2">
                        {meta.label}
                      </Badge>
                    </div>
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <HomeIcon className="size-5" />
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {roomCount > 0 && sceneDataByHome[home.id] && (
                      <DashboardHomeScene
                        rooms={sceneDataByHome[home.id]!.rooms}
                        furnitureByRoom={sceneDataByHome[home.id]!.furnitureByRoom}
                        itemsByFurniture={sceneDataByHome[home.id]!.itemsByFurniture}
                      />
                    )}
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-center">
                      <Stat label="Rooms" value={roomCount} />
                      <Stat label="Furniture" value={furnitureCount} />
                      <Stat label="Items" value={itemCount} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        render={
                          <Link href={`/home?id=${home.id}`}>
                            <Eye className="size-4" />
                            View Home
                          </Link>
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link href={`/quick-add?type=item&homeId=${home.id}`}>
                            <Plus className="size-4" />
                            Add Item
                          </Link>
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link href="/search">
                            <Search className="size-4" />
                            Search Items
                          </Link>
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        render={
                          <Link href={`/home?id=${home.id}&manage=1`}>
                            <Settings2 className="size-4" />
                            Manage Home
                          </Link>
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Rooms" value={data.totals.rooms} />
            <StatTile label="Furniture" value={data.totals.furniture} />
            <StatTile label="Items" value={data.totals.items} />
            <StatTile label="Categories" value={data.totals.categories} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h3 className="font-semibold">Recently Added</h3>
              </CardHeader>
              <CardContent>
                {data.recentItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing added yet.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recentItems.map(({ item, path }) => (
                      <li key={item.id}>
                        <HoverCard>
                          <HoverCardTrigger
                            render={
                              <Link
                                href={`/items/${item.id}`}
                                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 hover:opacity-80"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{item.name}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {relativeDay(item.created_at)}
                                  </span>
                                </div>
                                <LocationPath nodes={path} container={item.container} />
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

            <Card>
              <CardHeader>
                <h3 className="font-semibold">Most Used Storage Areas</h3>
              </CardHeader>
              <CardContent>
                {data.topAreas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No storage areas in use yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {data.topAreas.map((area, i) => {
                      const Icon = getIcon(area.icon);
                      return (
                        <li key={area.furnitureId} className="flex items-center gap-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {i + 1}
                          </span>
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {area.roomName} {area.roomName && "·"} {area.furnitureName}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
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
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="flex items-center justify-center gap-1 text-2xl font-semibold">
          {value}
          {label === "Categories" && <Sparkles className="size-4 text-primary" />}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
