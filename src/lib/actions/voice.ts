"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { buildLocationIndex, pathForStorageLocation, type LocationIndex, type LocationNode } from "@/lib/location";
import { parseTranscript } from "@/lib/voice/nlu";
import { fuzzyMatchByName } from "@/lib/voice/synonyms";
import type { ParsedAddEntities } from "@/lib/voice/types";
import type { Database, Item, StorageLocation } from "@/lib/supabase/types";

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

function titleCaseWords(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function pickDefaultStorageLocation(candidates: StorageLocation[]): StorageLocation | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.sort_order - b.sort_order)[0];
}

/**
 * Every item needs a storage_location_id (DB constraint), but voice add
 * shouldn't stall the user with "which shelf, drawer, or section?" — pick
 * the furniture's first storage location automatically, creating one named
 * "General" on the rare furniture that somehow has none at all.
 */
async function resolveOrCreateDefaultStorage(
  supabase: SupabaseClient<Database>,
  userId: string,
  furnitureId: string,
  candidates: StorageLocation[]
): Promise<{ id: string; name: string } | null> {
  const existing = pickDefaultStorageLocation(candidates);
  if (existing) return { id: existing.id, name: existing.name };

  const { data: created } = await supabase
    .from("storage_locations")
    .insert({ user_id: userId, furniture_id: furnitureId, name: "General", type: "shelf", sort_order: 0 })
    .select()
    .single();
  return created ? { id: created.id, name: created.name } : null;
}

/**
 * The user named a furniture piece that doesn't already exist — rather than
 * asking "which furniture?", create it under the generic "Other" category
 * using exactly the name they spoke, with a default "General" storage
 * location so the item has somewhere to land immediately.
 */
async function createFurnitureFromSpokenName(
  supabase: SupabaseClient<Database>,
  userId: string,
  roomId: string,
  spokenName: string
): Promise<{ id: string; name: string; storage: { id: string; name: string } | null } | null> {
  const { count } = await supabase
    .from("furniture")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  const { data: furniture } = await supabase
    .from("furniture")
    .insert({
      user_id: userId,
      room_id: roomId,
      name: titleCaseWords(spokenName),
      type: "other",
      icon: "Package",
      sort_order: count ?? 0,
    })
    .select()
    .single();
  if (!furniture) return null;

  const storage = await resolveOrCreateDefaultStorage(supabase, userId, furniture.id, []);
  return { id: furniture.id, name: furniture.name, storage };
}

async function resolveAddLocation(
  supabase: SupabaseClient<Database>,
  userId: string,
  add: ParsedAddEntities,
  index: LocationIndex,
  contextRoomId?: string
): Promise<ResolvedLocation> {
  const rooms = Array.from(index.rooms.values());
  let room = add.roomPhrase ? fuzzyMatchByName(add.roomPhrase, rooms) : null;
  if (!room && !add.roomPhrase && contextRoomId) {
    room = index.rooms.get(contextRoomId) ?? null;
  }

  const allFurniture = Array.from(index.furniture.values());
  const furnitureCandidates = room ? allFurniture.filter((f) => f.room_id === room!.id) : allFurniture;
  const matchedFurniture = add.furniturePhrase ? fuzzyMatchByName(add.furniturePhrase, furnitureCandidates) : null;

  const resolvedRoom = room ?? (matchedFurniture ? (index.rooms.get(matchedFurniture.room_id) ?? null) : null);

  let furnitureId = matchedFurniture?.id ?? null;
  let furnitureName = matchedFurniture?.name ?? null;
  let storage: { id: string; name: string } | null = null;

  if (!matchedFurniture && add.furniturePhrase && resolvedRoom) {
    const created = await createFurnitureFromSpokenName(supabase, userId, resolvedRoom.id, add.furniturePhrase);
    if (created) {
      furnitureId = created.id;
      furnitureName = created.name;
      storage = created.storage;
    }
  } else if (matchedFurniture) {
    const allStorage = Array.from(index.storageLocations.values());
    const storageCandidates = allStorage.filter((s) => s.furniture_id === matchedFurniture.id);
    const matchedStorage = add.storagePhrase ? fuzzyMatchByName(add.storagePhrase, storageCandidates) : null;
    storage = matchedStorage
      ? { id: matchedStorage.id, name: matchedStorage.name }
      : await resolveOrCreateDefaultStorage(supabase, userId, matchedFurniture.id, storageCandidates);
  }

  return {
    roomId: resolvedRoom?.id ?? null,
    roomName: resolvedRoom?.name ?? null,
    furnitureId,
    furnitureName,
    storageLocationId: storage?.id ?? null,
    storageLocationName: storage?.name ?? null,
  };
}

/**
 * Storage location is deliberately never a blocking question (section: voice
 * add should default rather than stall) — resolveAddLocation/resolveVoiceSlot
 * always resolve or create one alongside furniture.
 */
function missingFieldsFor(itemName: string | null, location: ResolvedLocation): MissingField[] {
  const missing: MissingField[] = [];
  if (!itemName) missing.push("itemName");
  if (!location.roomId) missing.push("room");
  else if (!location.furnitureId) missing.push("furniture");
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "unclear", transcript };
    const location = await resolveAddLocation(supabase, user.id, nlu.add, index, context?.roomId);
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
    if (match) return { id: match.id, name: match.name };

    // They named a furniture piece that doesn't exist — create it under
    // "Other" with the spoken name rather than reporting a match failure.
    if (!parent.roomId) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const created = await createFurnitureFromSpokenName(supabase, user.id, parent.roomId, cleanedPhrase);
    return created ? { id: created.id, name: created.name } : null;
  }

  const all = Array.from(index.storageLocations.values());
  const candidates = parent.furnitureId ? all.filter((s) => s.furniture_id === parent.furnitureId) : all;
  const match = fuzzyMatchByName(cleanedPhrase, candidates);
  return match ? { id: match.id, name: match.name } : null;
}

/**
 * Fetches (or creates, if this furniture somehow has none) the default
 * storage location for a piece of furniture — used after a follow-up
 * resolves "which furniture?" so storage never becomes a second question.
 */
export async function getDefaultStorageLocation(furnitureId: string): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: candidates } = await supabase.from("storage_locations").select("*").eq("furniture_id", furnitureId);
  return resolveOrCreateDefaultStorage(supabase, user.id, furnitureId, candidates ?? []);
}
