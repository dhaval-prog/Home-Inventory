import Link from "next/link";
import { Plus, Home as HomeIcon, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { getCompactIcon } from "@/lib/icon-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocationPath } from "@/components/shared/location-path";
import { relativeDay } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { SeedDemoButton } from "@/components/shared/seed-demo-button";
import { listMyHouseholds } from "@/lib/actions/household";
import { getHouseholdSummary } from "@/lib/actions/household-dashboard";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

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
  const memberships = await listMyHouseholds();
  const primaryHousehold = memberships[0];
  const householdSummary = primaryHousehold ? await getHouseholdSummary(primaryHousehold.household.id) : null;

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
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-5">
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
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
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
                      const Icon = getCompactIcon(area.icon);
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

            <Card className="p-5">
              <CardHeader className="flex-row items-baseline p-0">
                <h3 className="text-[17px] font-semibold tracking-tight">Household</h3>
                <Link href="/household" className="ml-auto text-xs font-medium">
                  {primaryHousehold ? "View" : "Get started"}
                </Link>
              </CardHeader>
              <CardContent className="mt-3 p-0">
                {primaryHousehold && householdSummary ? (
                  <Link href={`/household?id=${primaryHousehold.household.id}`} className="block">
                    <p className="text-xs text-[#0b0b14]/55">{primaryHousehold.household.name} — Household Savings</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{inr(householdSummary.totalSharedSavings)}</p>
                    <p className="mt-1 text-[13px] text-[#0b0b14]/55">
                      {householdSummary.goals.filter((g) => g.goal.status === "active").length} active goal
                      {householdSummary.goals.filter((g) => g.goal.status === "active").length === 1 ? "" : "s"}
                    </p>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="size-4" />
                    </span>
                    <p className="text-sm text-[#0b0b14]/55">Pool savings with the people you share a home with.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
    </div>
  );
}
