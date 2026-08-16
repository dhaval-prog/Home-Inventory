"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { buildLocationIndex, pathForStorageLocation, type LocationIndex, type LocationNode } from "@/lib/location";
import { parseTranscript } from "@/lib/voice/nlu";
import { fuzzyMatchByName } from "@/lib/voice/synonyms";
import { processVaultVoiceCommand, type VaultSessionContext, type VaultVoiceResult } from "@/lib/actions/vault-voice";
import { processHouseholdVoiceCommand } from "@/lib/actions/household-voice";
import { listGoals } from "@/lib/actions/household-goals";
import type { InventoryAction, ParsedAddEntities, VaultAction } from "@/lib/voice/types";
import type { Database, Item, StorageLocation } from "@/lib/supabase/types";

export type {
  VaultSessionContext,
  VaultVoiceResult,
  VaultVoiceHistoryRow,
  VaultPendingState,
  VaultPendingKind,
  VaultSessionTransactionSummary,
} from "@/lib/actions/vault-voice";

export interface VoiceSearchResult {
  kind: "search";
  query: string;
  results: { item: Item; path: LocationNode[] }[];
  /** Plain-English description of this result, stored client-side and threaded back as previousTurnSummary context so a short follow-up ("what about last month?", "what else is there?") resolves against what was just shown. */
  summary: string;
}

export interface VoiceLocationResult {
  kind: "inventory-location";
  roomName: string | null;
  furnitureName: string | null;
  results: { item: Item; path: LocationNode[] }[];
  summary: string;
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

export type VoiceProcessResult = VoiceSearchResult | VoiceLocationResult | VoiceAddResult | VoiceUnclearResult | VaultVoiceResult;

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

/** Shared scored-lookup used by search/item_details/category_search — ranks every item against a bag of terms, lightly boosting matches in the room the user is currently viewing. */
function searchInventoryItems(
  items: Item[],
  index: LocationIndex,
  terms: string[],
  contextRoomId: string | undefined,
  limit: number
): { item: Item; path: LocationNode[] }[] {
  return items
    .map((item) => {
      const path = pathForStorageLocation(index, item.storage_location_id);
      if (!path) return null;

      let score = scoreItemAgainstTerms(item, terms);
      const locationNames = path.map((n) => n.name.toLowerCase());
      if (terms.some((t) => t && locationNames.some((n) => n.includes(t.toLowerCase())))) {
        score = Math.max(score, 20);
      }
      if (contextRoomId && path.some((n) => n.type === "room" && n.id === contextRoomId)) {
        score += 5;
      }
      return score > 0 ? { item, path, score } : null;
    })
    .filter((r): r is { item: Item; path: LocationNode[]; score: number } => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, path }) => ({ item, path }));
}

function summarizeItemResults(label: string, results: { item: Item; path: LocationNode[] }[]): string {
  if (results.length === 0) return `No items found for ${label}.`;
  const names = results.slice(0, 3).map((r) => r.item.name);
  return `Found ${results.length} item${results.length === 1 ? "" : "s"} for ${label}: ${names.join(", ")}${results.length > 3 ? ", and more" : ""}.`;
}

/** search / item_details — a scored lookup driven by the entity + its expanded synonym/brand terms. item_details narrows the list since the user is asking about one specific thing. */
async function handleInventorySearch(
  supabase: SupabaseClient<Database>,
  index: LocationIndex,
  action: InventoryAction,
  contextRoomId?: string
): Promise<VoiceProcessResult> {
  const entity = action.entity?.trim() ?? "";
  const terms = action.expandedTerms.length ? action.expandedTerms : entity ? [entity] : [];

  if (terms.length === 0) {
    return { kind: "search", query: entity, results: [], summary: "Asked to search inventory with no clear item named." };
  }

  const { data: items } = await supabase.from("items").select("*");
  const limit = action.intent === "item_details" ? 5 : 10;
  const results = searchInventoryItems(items ?? [], index, terms, contextRoomId, limit);

  return { kind: "search", query: entity, results, summary: summarizeItemResults(`"${entity}"`, results) };
}

/** location_search — everything under a named room and/or furniture, not filtered by item identity at all. */
async function handleLocationSearch(
  supabase: SupabaseClient<Database>,
  index: LocationIndex,
  action: InventoryAction
): Promise<VoiceProcessResult> {
  const rooms = Array.from(index.rooms.values());
  const room = action.roomPhrase ? fuzzyMatchByName(action.roomPhrase, rooms) : null;

  const allFurniture = Array.from(index.furniture.values());
  const furnitureCandidates = room ? allFurniture.filter((f) => f.room_id === room.id) : allFurniture;
  const furniture = action.furniturePhrase ? fuzzyMatchByName(action.furniturePhrase, furnitureCandidates) : null;

  if (!room && !furniture) {
    return { kind: "unclear", transcript: [action.roomPhrase, action.furniturePhrase].filter(Boolean).join(" ") || "that location" };
  }

  const { data: items } = await supabase.from("items").select("*");
  const results = (items ?? [])
    .map((item) => {
      const path = pathForStorageLocation(index, item.storage_location_id);
      if (!path) return null;
      const matchesRoom = room ? path.some((n) => n.type === "room" && n.id === room.id) : true;
      const matchesFurniture = furniture ? path.some((n) => n.type === "furniture" && n.id === furniture.id) : true;
      return matchesRoom && matchesFurniture ? { item, path } : null;
    })
    .filter((r): r is { item: Item; path: LocationNode[] } => r !== null)
    .slice(0, 20);

  const label = [room?.name, furniture?.name].filter(Boolean).join(" → ") || "that location";
  return {
    kind: "inventory-location",
    roomName: room?.name ?? null,
    furnitureName: furniture?.name ?? null,
    results,
    summary: results.length
      ? `Found ${results.length} item${results.length === 1 ? "" : "s"} in ${label}.`
      : `Nothing found in ${label}.`,
  };
}

/** category_search — filtered by item.category rather than a scored name/synonym match. */
async function handleCategorySearch(
  supabase: SupabaseClient<Database>,
  index: LocationIndex,
  action: InventoryAction
): Promise<VoiceProcessResult> {
  const categoryPhrase = (action.category ?? action.entity ?? "").trim();
  const needle = categoryPhrase.toLowerCase();

  const { data: items } = await supabase.from("items").select("*");
  const results = (items ?? [])
    .filter((item) => {
      const category = item.category.toLowerCase();
      return needle ? category.includes(needle) || needle.includes(category) : false;
    })
    .map((item) => {
      const path = pathForStorageLocation(index, item.storage_location_id);
      return path ? { item, path } : null;
    })
    .filter((r): r is { item: Item; path: LocationNode[] } => r !== null)
    .slice(0, 20);

  return {
    kind: "search",
    query: categoryPhrase,
    results,
    summary: results.length
      ? `Found ${results.length} item${results.length === 1 ? "" : "s"} in ${categoryPhrase}.`
      : `No items found in category "${categoryPhrase}".`,
  };
}

/** recently_added — a plain recency-ordered list, no scoring involved. */
async function handleRecentlyAdded(supabase: SupabaseClient<Database>, index: LocationIndex): Promise<VoiceProcessResult> {
  const { data: items } = await supabase.from("items").select("*").order("created_at", { ascending: false }).limit(10);
  const results = (items ?? [])
    .map((item) => {
      const path = pathForStorageLocation(index, item.storage_location_id);
      return path ? { item, path } : null;
    })
    .filter((r): r is { item: Item; path: LocationNode[] } => r !== null);

  return {
    kind: "search",
    query: "Recently added",
    results,
    summary: results.length
      ? `Showed your ${results.length} most recently added items.`
      : "No items have been added yet.",
  };
}

async function handleInventoryAction(
  supabase: SupabaseClient<Database>,
  index: LocationIndex,
  action: InventoryAction,
  contextRoomId?: string
): Promise<VoiceProcessResult> {
  switch (action.intent) {
    case "location_search":
      return handleLocationSearch(supabase, index, action);
    case "category_search":
      return handleCategorySearch(supabase, index, action);
    case "recently_added":
      return handleRecentlyAdded(supabase, index);
    case "search":
    case "item_details":
    default:
      return handleInventorySearch(supabase, index, action, contextRoomId);
  }
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

const HOUSEHOLD_VAULT_INTENTS = new Set<VaultAction["intent"]>(["check_household_balance", "contribute_household_goal"]);

/**
 * Turns a voice transcript into either search results, an extracted
 * (possibly incomplete) add-item request, or a vault assistant result.
 * `context.roomId`, when the user is voice-searching/adding from inside a
 * specific room page, is used to lightly prioritize that room's items in
 * search and to fill in the room for an add request that didn't mention one
 * (section 21). `context.vaultSession` carries the ephemeral, client-held
 * vault conversation state (pending clarification/confirmation, last
 * transaction) — when a pending vault question is active, this transcript
 * is almost certainly answering it, so domain classification is skipped
 * entirely and it goes straight to the vault orchestrator. `context.householdId`
 * is the household the user currently has selected (via the household
 * switcher) — when set, its active goal names are fed to Gemini so "the
 * vacation fund" resolves to a real goal, and a classified household intent
 * (check_household_balance/contribute_household_goal) routes to the
 * household orchestrator instead of the personal-vault one.
 */
export async function processVoiceCommand(
  transcript: string,
  context?: { roomId?: string; vaultSession?: VaultSessionContext | null; householdId?: string | null }
): Promise<VoiceProcessResult> {
  if (context?.vaultSession?.pending) {
    return processVaultVoiceCommand(transcript, context.vaultSession);
  }

  const previousTurnSummary = context?.vaultSession?.previousTurnSummary ?? null;
  const householdGoalNames = context?.householdId
    ? (await listGoals(context.householdId, { status: "active" })).map((g) => g.goal.name)
    : [];
  const geminiContext =
    previousTurnSummary || householdGoalNames.length > 0 ? { previousTurnSummary, householdGoalNames } : undefined;
  const nlu = await parseTranscript(transcript, geminiContext);

  if (nlu.intent === "vault") {
    const first = nlu.actions[0];
    if (first && HOUSEHOLD_VAULT_INTENTS.has(first.intent)) {
      if (!context?.householdId) {
        return { kind: "vault-error", message: "You're not part of a household yet — create or join one first." };
      }
      return processHouseholdVoiceCommand(context.householdId, first);
    }
    return processVaultVoiceCommand(transcript, context?.vaultSession ?? null, nlu);
  }

  const supabase = await createClient();

  if (nlu.intent === "unclear") {
    return { kind: "unclear", transcript };
  }

  const index = await buildLocationIndex(supabase);

  if (nlu.intent === "inventory") {
    return handleInventoryAction(supabase, index, nlu.action, context?.roomId);
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
