"use server";

import { createClient } from "@/lib/supabase/server";
import { buildLocationIndex, pathForStorageLocation, type LocationNode } from "@/lib/location";
import type { Item } from "@/lib/supabase/types";

export interface SearchResult {
  item: Item;
  path: LocationNode[];
}

/**
 * Matches against item name, category, description, tags, and the names of
 * the room/furniture/storage location it lives in (sections 12 & 36).
 */
export async function searchItems(query: string): Promise<SearchResult[]> {
  const term = query.trim();
  if (!term) return [];

  const supabase = await createClient();
  const index = await buildLocationIndex(supabase);

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("updated_at", { ascending: false });

  if (!items) return [];

  const needle = term.toLowerCase();

  const matchingContainerIds = new Set<string>();
  for (const [id, room] of index.rooms) if (room.name.toLowerCase().includes(needle)) matchingContainerIds.add(id);
  for (const [id, f] of index.furniture) if (f.name.toLowerCase().includes(needle)) matchingContainerIds.add(id);
  for (const [id, s] of index.storageLocations) if (s.name.toLowerCase().includes(needle)) matchingContainerIds.add(id);

  const results: SearchResult[] = [];
  for (const item of items) {
    const haystack = [
      item.name,
      item.category,
      item.description ?? "",
      item.container ?? "",
      ...(item.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    const matchesDirectly = haystack.includes(needle);
    const matchesLocation = matchingContainerIds.has(item.storage_location_id);

    if (!matchesDirectly && !matchesLocation) continue;

    const path = pathForStorageLocation(index, item.storage_location_id);
    if (!path) continue;

    results.push({ item, path });
  }

  return results;
}

export async function searchSuggestions(query: string): Promise<string[]> {
  const results = await searchItems(query);
  const names = new Set<string>();
  for (const r of results) {
    names.add(r.item.name);
    if (names.size >= 8) break;
  }
  return Array.from(names);
}
