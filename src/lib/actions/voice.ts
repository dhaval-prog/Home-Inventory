"use server";

import { createClient } from "@/lib/supabase/server";
import { buildLocationIndex, pathForStorageLocation, type LocationIndex, type LocationNode } from "@/lib/location";
import { parseTranscript } from "@/lib/voice/nlu";
import { fuzzyMatchByName } from "@/lib/voice/synonyms";
import type { ParsedAddEntities } from "@/lib/voice/types";
import type { Item } from "@/lib/supabase/types";

export interface VoiceSearchResult {
  kind: "search";
  query: string;
  results: { item: Item; path: LocationNode[] }[];
}

export interface ResolvedLocation {
  roomId: string | null;
  roomName: string | null;
  furnitureId: string | null;
  furnitureName: string | null;
  storageLocationId: string | null;
  storageLocationName: string | null;
}

export type MissingField = "itemName" | "room" | "furniture" | "storageLocation";

export interface VoiceAddResult {
  kind: "add";
  itemName: string | null;
  location: ResolvedLocation;
  missingFields: MissingField[];
}

export interface VoiceUnclearResult {
  kind: "unclear";
  transcript: string;
}

export type VoiceProcessResult = VoiceSearchResult | VoiceAddResult | VoiceUnclearResult;

/** Priority order from section 19: exact name > partial name > category > tags > description > location. */
function scoreItemAgainstTerms(item: Item, terms: string[]): number {
  const name = item.name.toLowerCase();
  const category = item.category.toLowerCase();
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  const desc = (item.description ?? "").toLowerCase();
  const container = (item.container ?? "").toLowerCase();

  let best = 0;
  for (const raw of terms) {
    const term = raw.toLowerCase().trim();
    if (!term) continue;
    if (name === term) best = Math.max(best, 100);
    else if (name.includes(term)) best = Math.max(best, 80);
    if (category === term) best = Math.max(best, 60);
    if (tags.some((t) => t === term || t.includes(term))) best = Math.max(best, 50);
    if (desc.includes(term) || container.includes(term)) best = Math.max(best, 30);
  }
  return best;
}

function resolveAddLocation(
  add: ParsedAddEntities,
  index: LocationIndex,
  contextRoomId?: string
): ResolvedLocation {
  const rooms = Array.from(index.rooms.values());
  let room = add.roomPhrase ? fuzzyMatchByName(add.roomPhrase, rooms) : null;
  if (!room && !add.roomPhrase && contextRoomId) {
    room = index.rooms.get(contextRoomId) ?? null;
  }

  const allFurniture = Array.from(index.furniture.values());
  const furnitureCandidates = room ? allFurniture.filter((f) => f.room_id === room!.id) : allFurniture;
  const furniture = add.furniturePhrase ? fuzzyMatchByName(add.furniturePhrase, furnitureCandidates) : null;

  const resolvedRoom = room ?? (furniture ? (index.rooms.get(furniture.room_id) ?? null) : null);

  const allStorage = Array.from(index.storageLocations.values());
  const storageCandidates = furniture ? allStorage.filter((s) => s.furniture_id === furniture.id) : allStorage;
  const storage = add.storagePhrase ? fuzzyMatchByName(add.storagePhrase, storageCandidates) : null;

  return {
    roomId: resolvedRoom?.id ?? null,
    roomName: resolvedRoom?.name ?? null,
    furnitureId: furniture?.id ?? null,
    furnitureName: furniture?.name ?? null,
    storageLocationId: storage?.id ?? null,
    storageLocationName: storage?.name ?? null,
  };
}

function missingFieldsFor(itemName: string | null, location: ResolvedLocation): MissingField[] {
  const missing: MissingField[] = [];
  if (!itemName) missing.push("itemName");
  if (!location.roomId) missing.push("room");
  else if (!location.furnitureId) missing.push("furniture");
  else if (!location.storageLocationId) missing.push("storageLocation");
  return missing;
}

/**
 * Turns a voice transcript into either search results or an extracted
 * (possibly incomplete) add-item request. `context.roomId`, when the user
 * is voice-searching/adding from inside a specific room page, is used to
 * lightly prioritize that room's items in search and to fill in the room
 * for an add request that didn't mention one (section 21).
 */
export async function processVoiceCommand(
  transcript: string,
  context?: { roomId?: string }
): Promise<VoiceProcessResult> {
  const nlu = await parseTranscript(transcript);
  const supabase = await createClient();
  const index = await buildLocationIndex(supabase);

  if (nlu.intent === "search") {
    const { data: items } = await supabase.from("items").select("*");
    const terms = nlu.search.expandedTerms.length ? nlu.search.expandedTerms : [nlu.search.queryRaw];

    const scored = (items ?? [])
      .map((item) => {
        const path = pathForStorageLocation(index, item.storage_location_id);
        if (!path) return null;

        let score = scoreItemAgainstTerms(item, terms);
        const locationNames = path.map((n) => n.name.toLowerCase());
        if (terms.some((t) => locationNames.some((n) => n.includes(t.toLowerCase())))) {
          score = Math.max(score, 20);
        }
        if (context?.roomId && path.some((n) => n.type === "room" && n.id === context.roomId)) {
          score += 5;
        }
        return score > 0 ? { item, path, score } : null;
      })
      .filter((r): r is { item: Item; path: LocationNode[]; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ item, path }) => ({ item, path }));

    return { kind: "search", query: nlu.search.queryRaw, results: scored };
  }

  if (nlu.intent === "add") {
    const location = resolveAddLocation(nlu.add, index, context?.roomId);
    return {
      kind: "add",
      itemName: nlu.add.itemNameRaw,
      location,
      missingFields: missingFieldsFor(nlu.add.itemNameRaw, location),
    };
  }

  return { kind: "unclear", transcript };
}

/**
 * Resolves a single follow-up answer (spoken or typed) for whichever slot is
 * still missing in a conversational add flow — e.g. the user is asked "which
 * room?" and answers "Bedroom 2", or asked "which furniture?" and answers
 * "the wardrobe". Scoped to the parent already chosen, so "top shelf" only
 * matches storage locations that actually belong to the chosen furniture.
 */
export async function resolveVoiceSlot(
  field: Extract<MissingField, "room" | "furniture" | "storageLocation">,
  phrase: string,
  parent: { roomId?: string; furnitureId?: string }
): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const index = await buildLocationIndex(supabase);
  const cleanedPhrase = phrase.replace(/^(in|at|inside|on|the|a|an)\s+/i, "").trim();

  if (field === "room") {
    const match = fuzzyMatchByName(cleanedPhrase, Array.from(index.rooms.values()));
    return match ? { id: match.id, name: match.name } : null;
  }

  if (field === "furniture") {
    const all = Array.from(index.furniture.values());
    const candidates = parent.roomId ? all.filter((f) => f.room_id === parent.roomId) : all;
    const match = fuzzyMatchByName(cleanedPhrase, candidates);
    return match ? { id: match.id, name: match.name } : null;
  }

  const all = Array.from(index.storageLocations.values());
  const candidates = parent.furnitureId ? all.filter((s) => s.furniture_id === parent.furnitureId) : all;
  const match = fuzzyMatchByName(cleanedPhrase, candidates);
  return match ? { id: match.id, name: match.name } : null;
}
