"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Home as HomeIcon, Clock, Boxes, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocationPath } from "@/components/shared/location-path";
import { ItemList } from "@/components/items/item-list";
import { VoiceMicButton } from "@/components/search/voice-mic-button";
import { VoiceSearchPanel } from "@/components/search/voice-search-panel";
import { searchItems, type SearchResult } from "@/lib/actions/search";
import { getCompactIcon } from "@/lib/icon-map";
import { relativeDay } from "@/lib/utils";
import type { RecentItem, StorageAreaUsage } from "@/lib/dashboard-data";

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

type BrowseTab = "search" | "recent" | "storage" | "all";

const BROWSE_TABS: { key: BrowseTab; label: string; icon: typeof Clock }[] = [
  { key: "search", label: "Search", icon: Search },
  { key: "recent", label: "Recently added", icon: Clock },
  { key: "storage", label: "Most used storage", icon: Boxes },
  { key: "all", label: "All Items", icon: LayoutGrid },
];

function BrowseTabBar({ active, onChange }: { active: BrowseTab; onChange: (tab: BrowseTab) => void }) {
  const activeIndex = BROWSE_TABS.findIndex((t) => t.key === active);
  return (
    <div className="relative grid grid-cols-4 rounded-full bg-[#0b0b14]/5 p-1">
      <span
        className="absolute inset-y-1 left-1 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
        style={{ width: "calc((100% - 0.5rem) / 4)", transform: `translateX(${activeIndex * 100}%)` }}
      />
      {BROWSE_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[13px] font-medium transition-colors ${
              isActive ? "text-[#0b0b14]" : "text-[#0b0b14]/50"
            }`}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SearchInner({
  recentItems,
  topAreas,
  allItems,
}: {
  recentItems: RecentItem[];
  topAreas: StorageAreaUsage[];
  allItems: SearchResult[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [browseTab, setBrowseTab] = useState<BrowseTab>("search");
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    const term = query.trim();
    const handle = setTimeout(() => {
      if (!term) {
        setResults([]);
        setSearched(false);
        return;
      }
      startTransition(async () => {
        const r = await searchItems(term);
        setResults(r);
        setSearched(true);
      });
      router.replace(`/search?q=${encodeURIComponent(term)}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <BrowseTabBar active={browseTab} onChange={setBrowseTab} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you looking for?"
            className="h-12 pl-10 text-base"
          />
        </div>
        <VoiceMicButton isListening={false} onClick={() => setVoiceOpen(true)} />
      </div>

      <VoiceSearchPanel open={voiceOpen} onOpenChange={setVoiceOpen} />

      {!searched && !pending && (
        <div className="space-y-8">
          <p className="text-center text-sm text-muted-foreground">
            Try searching for &ldquo;passport&rdquo;, &ldquo;winter&rdquo;, or &ldquo;charger&rdquo;.
          </p>

          {((browseTab === "recent" && recentItems.length > 0) ||
            (browseTab === "storage" && topAreas.length > 0) ||
            (browseTab === "all" && allItems.length > 0)) && (
            <div className="space-y-5">
              {browseTab === "recent" && recentItems.length > 0 && (
                <Card className="p-5">
                  <CardHeader className="flex-row items-baseline p-0">
                    <h3 className="text-[17px] font-semibold tracking-tight">Recently added</h3>
                    <Link href="/recent" className="ml-auto text-xs font-medium">
                      All
                    </Link>
                  </CardHeader>
                  <CardContent className="mt-3 p-0">
                    <ul className="divide-y divide-[#0b0b14]/6">
                      {recentItems.map(({ item, path }, i) => (
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
                              <span className="block truncate text-[13px] font-semibold">{item.name}</span>
                              <LocationPath nodes={path} container={item.container} className="mt-0.5" />
                            </span>
                            <span className="shrink-0 text-[11px] text-[#0b0b14]/45">
                              {relativeDay(item.created_at)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {browseTab === "storage" && topAreas.length > 0 && (
                <Card className="p-5">
                  <CardHeader className="p-0">
                    <h3 className="text-[17px] font-semibold tracking-tight">Most used storage</h3>
                  </CardHeader>
                  <CardContent className="mt-3 p-0">
                    <ol className="space-y-3">
                      {topAreas.map((area, i) => {
                        const Icon = getCompactIcon(area.icon);
                        return (
                          <li key={area.furnitureId} className="flex items-center gap-2.5 text-[13px]">
                            <span
                              className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${STORAGE_BADGE_STYLES[i % STORAGE_BADGE_STYLES.length]}`}
                            >
                              {i + 1}
                            </span>
                            <Icon className="size-4 shrink-0 text-[#0b0b14]/45" />
                            <span className="min-w-0 flex-1 truncate">
                              {area.roomName} {area.roomName && "·"} {area.furnitureName}
                            </span>
                            <Badge variant="secondary" className="shrink-0 bg-[#0b0b14]/7 text-[#0b0b14]">
                              {area.itemCount} items
                            </Badge>
                          </li>
                        );
                      })}
                    </ol>
                  </CardContent>
                </Card>
              )}

              {browseTab === "all" && allItems.length > 0 && <ItemList results={allItems} />}
            </div>
          )}
        </div>
      )}

      {searched && !pending && results.length === 0 && (
        <div className="py-12 text-center">
          <p className="font-medium">We couldn&apos;t find anything matching &ldquo;{query}&rdquo;.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try searching by item name, category, or tag.</p>
        </div>
      )}

      {results.length > 0 && <ItemList results={results} />}
    </div>
  );
}

export function SearchPageClient({
  recentItems,
  topAreas,
  allItems,
}: {
  recentItems: RecentItem[];
  topAreas: StorageAreaUsage[];
  allItems: SearchResult[];
}) {
  return (
    <Suspense>
      <SearchInner recentItems={recentItems} topAreas={topAreas} allItems={allItems} />
    </Suspense>
  );
}
