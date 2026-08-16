import { expandSearchTerms, normalizeNumberWords } from "@/lib/voice/synonyms";
import { matchCategory } from "@/lib/vault/categories";
import { parseMoneyExpression } from "@/lib/vault/money-parser";
import type { InventoryAction, NluResult, ParsedAddEntities, VaultAction } from "@/lib/voice/types";

/**
 * Zero-dependency, zero-cost intent classifier + entity extractor. This is
 * the guaranteed-working baseline (works with no API key, no setup); an
 * optional Gemini-backed layer (src/lib/voice/nlu-gemini.ts) can produce a
 * richer NluResult when GEMINI_API_KEY is configured, falling back to this
 * module whenever that's unavailable or fails. Only the clear-cut vault
 * operations are covered here (add/deduct money, balance, total saved,
 * simple spending queries) — multi-turn corrections, undo/edit/delete by
 * reference, free-form insights, and multi-intent commands need real
 * language understanding and are Gemini-only.
 */

const SEARCH_PATTERNS = [
  /^(can you (please )?)?(tell me )?where\s+(is|are)\b/i,
  /^(can you (please )?)?(tell me )?where\s+(?:(?:did|do|would|could)\s+)?i\s+(keep|kept|put|leave|left)\b/i,
  /^(can you (please )?)?find\b/i,
  /^(can you (please )?)?locate\b/i,
  /^(can you (please )?)?search(\s+for)?\b/i,
  /^(can you (please )?)?look for\b/i,
  /^show me\b/i,
];

const SEARCH_FILLERS = [
  /^(can you (please )?)?(tell me )?where\s+(is|are)\s+(my|the)?\s*/i,
  /^(can you (please )?)?(tell me )?where\s+(?:(?:did|do|would|could)\s+)?i\s+(keep|kept|put|leave|left)\s+(my|the)?\s*/i,
  /^(can you (please )?)?find\s+(my|the)?\s*/i,
  /^(can you (please )?)?locate\s+(my|the)?\s*/i,
  /^(can you (please )?)?search(\s+for)?\s+(my|the)?\s*/i,
  /^(can you (please )?)?look\s+for\s+(my|the)?\s*/i,
  /^show me\s+(my|the)?\s*/i,
];

const ADD_PATTERNS = [
  /^(please\s+)?add\b/i,
  /^i\s+(want|would like|'d like)\s+to add\b/i,
  /^i\s+(have|got|bought)\s+(a|an)?\s*new\b/i,
  /^i'?m adding\b/i,
  /\badd it\b\.?\s*$/i,
  /\badd this\b\.?\s*$/i,
  /\badd them\b\.?\s*$/i,
];

// All vault patterns are anchored to the start of the phrase (like
// ADD_PATTERNS above) so common search phrases sharing a trigger word
// ("where is my pay stub") never misfire — every spec example phrases the
// verb first, and this is checked before the search/add patterns below.
const DEDUCT_MONEY_PATTERNS = [
  /^(please\s+)?deduct\b/i,
  /^(please\s+)?remove\b/i,
  /^minus\b/i,
  /^(i\s+)?paid\b/i,
  /^(please\s+)?pay\b/i,
  /^(i\s+)?spent\b/i,
  /^(i\s+)?(?:'d like to |want to |would like to )?spend\b/i,
  /^(i\s+)?took\s+out\b/i,
  /^(please\s+)?take\s+out\b/i,
];

const ADD_MONEY_PATTERNS = [
  /^(please\s+)?add\b.*\bto\s+(my\s+)?(vault|savings)\b/i,
  /^(please\s+)?put\b.*\b(in(to)?)\s+(my\s+)?(vault|savings)\b/i,
  /^(please\s+)?deposit\b/i,
];

const CHECK_BALANCE_PATTERNS = [
  /how much (do i have|is in (my|the) vault|('s| is) my (vault )?balance)\b/i,
  /what('s| is) my (vault )?balance\b/i,
  /what('s| is) (in|left in) my vault\b/i,
];

const CHECK_TOTAL_SAVED_PATTERNS = [/how much (have i saved|did i (add|save)|have i added)\b/i, /\btotal (saved|savings)\b/i];

const CHECK_SPENDING_PATTERNS = [/how much (did i|have i) spen[td]\b/i, /what did i spend\b/i];

const HOUSEHOLD_BALANCE_PATTERNS = [
  /how much (have|has) we saved\b/i,
  /how much (is|do we have) in\b.+\b(fund|goal)\b/i,
  /what(?:'s| is) (?:in|our) (?:household|shared) (?:savings|vault)\b/i,
  /how much more do we need\b/i,
];

const CONTRIBUTE_HOUSEHOLD_PATTERNS = [
  /^(i'?ll|i will|i can|let me)\s+(contribute|chip in|add|put in)\b/i,
  /^(please\s+)?contribute\b/i,
];

function extractHouseholdGoalName(normalized: string): string | null {
  const m = normalized.match(/how much (?:is|do we have) in\s+(?:the |our )?(.+?)\s*(?:fund|goal)\b/i);
  return m ? m[1].trim() : null;
}

function extractContributeEntities(normalized: string, rawTranscript: string): { amount: number | null; goalName: string | null } {
  const amount = parseMoneyExpression(rawTranscript);
  const m =
    normalized.match(/\bto\s+(?:the |our )?(.+?)\s*(?:fund|goal)?[.!]*$/i) ??
    normalized.match(/\bfor\s+(?:the |our )?(.+?)\s*(?:fund|goal)?[.!]*$/i);
  return { amount, goalName: m ? m[1].trim() : null };
}

function stripPunctuation(text: string): string {
  return text.replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripLeadingFillers(text: string): string {
  let out = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const next = out.replace(/^(my|a|an|the|new|some)\s+/i, "");
    if (next !== out) {
      out = next;
      changed = true;
    }
  }
  return out.trim();
}

function titleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function isSearchIntent(normalized: string): boolean {
  return SEARCH_PATTERNS.some((re) => re.test(normalized));
}

export function isAddIntent(normalized: string): boolean {
  return ADD_PATTERNS.some((re) => re.test(normalized));
}

function sentenceCase(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const EMPTY_VAULT_ACTION: Omit<VaultAction, "intent" | "confidence"> = {
  amount: null,
  category: null,
  comment: null,
  datePhrase: null,
  reference: null,
  newAmount: null,
  newCategory: null,
  recurring: null,
  itemEntity: null,
  goalName: null,
};

/** Shared by add_money/deduct_money — amount from the raw transcript (never the 1-6-word-normalized text, which would mangle "five hundred" into "5 hundred"), category/comment from the trailing clause. */
function extractMoneyEntities(normalized: string, rawTranscript: string): Pick<VaultAction, "amount" | "category" | "comment"> {
  const amount = parseMoneyExpression(rawTranscript);

  const commentMarker = rawTranscript.match(/comment\s*[:\-]?\s*(.+)$/i);
  let comment = commentMarker ? commentMarker[1].trim() : null;

  const forOnMatch = normalized.match(/\b(?:for|on)\s+(.+?)[.!]*$/i);
  let category = forOnMatch ? matchCategory(forOnMatch[1]) : null;
  if (!category) category = matchCategory(normalized);

  if (!comment && !forOnMatch) {
    const commaClause = rawTranscript.match(/,\s*([a-zA-Z].*)$/);
    if (commaClause) comment = commaClause[1].trim().replace(/[.!]+$/, "");
  }

  return { amount, category, comment: comment ? sentenceCase(comment) : null };
}

function classifyVaultAction(normalized: string, rawTranscript: string): VaultAction | null {
  if (CONTRIBUTE_HOUSEHOLD_PATTERNS.some((re) => re.test(normalized))) {
    const { amount, goalName } = extractContributeEntities(normalized, rawTranscript);
    return {
      ...EMPTY_VAULT_ACTION,
      intent: "contribute_household_goal",
      confidence: amount != null && goalName ? "high" : "low",
      amount,
      goalName,
    };
  }
  if (HOUSEHOLD_BALANCE_PATTERNS.some((re) => re.test(normalized))) {
    return { ...EMPTY_VAULT_ACTION, intent: "check_household_balance", confidence: "high", goalName: extractHouseholdGoalName(normalized) };
  }
  if (DEDUCT_MONEY_PATTERNS.some((re) => re.test(normalized))) {
    return { ...EMPTY_VAULT_ACTION, intent: "deduct_money", confidence: "high", ...extractMoneyEntities(normalized, rawTranscript) };
  }
  if (ADD_MONEY_PATTERNS.some((re) => re.test(normalized))) {
    return { ...EMPTY_VAULT_ACTION, intent: "add_money", confidence: "high", ...extractMoneyEntities(normalized, rawTranscript) };
  }
  if (CHECK_BALANCE_PATTERNS.some((re) => re.test(normalized))) {
    return { ...EMPTY_VAULT_ACTION, intent: "check_balance", confidence: "high" };
  }
  if (CHECK_TOTAL_SAVED_PATTERNS.some((re) => re.test(normalized))) {
    return { ...EMPTY_VAULT_ACTION, intent: "check_total_saved", confidence: "high", datePhrase: normalized };
  }
  if (CHECK_SPENDING_PATTERNS.some((re) => re.test(normalized))) {
    return {
      ...EMPTY_VAULT_ACTION,
      intent: "check_spending",
      confidence: "high",
      category: matchCategory(normalized),
      datePhrase: normalized,
    };
  }
  return null;
}

function buildInventoryAction(normalized: string): InventoryAction {
  let remainder = normalized.trim();
  for (const re of SEARCH_FILLERS) {
    if (re.test(remainder)) {
      remainder = remainder.replace(re, "").trim();
      break;
    }
  }
  remainder = stripPunctuation(remainder);
  return {
    intent: "search",
    entity: remainder || null,
    category: null,
    roomPhrase: null,
    furniturePhrase: null,
    expandedTerms: expandSearchTerms(remainder),
    confidence: "high",
  };
}

const ROOM_WORDS = [
  "bedroom", "bed room", "kitchen", "hall", "living room", "lounge", "bathroom", "washroom",
  "balcony", "terrace", "study", "office", "storeroom", "store room", "storage room",
];

const STORAGE_NOUN = "(?:shelf|shelves|drawer|cabinet|section|rack)";

function extractStoragePhrase(text: string): { phrase: string | null; rest: string } {
  // "second shelf" / "top drawer" style (number/adjective before the noun).
  const preRe = new RegExp(`\\b((?:\\d+|top|bottom|middle)\\s+${STORAGE_NOUN})\\b`, "i");
  const preMatch = text.match(preRe);
  if (preMatch) return { phrase: preMatch[1].trim(), rest: text.replace(preMatch[0], " ") };

  // "Shelf 1" / "Drawer 2" style (noun before the number) — how storage
  // locations are actually named in this app (see STORAGE_LOCATION_PRESETS).
  const postRe = new RegExp(`\\b(${STORAGE_NOUN}\\s+\\d+)\\b`, "i");
  const postMatch = text.match(postRe);
  if (postMatch) return { phrase: postMatch[1].trim(), rest: text.replace(postMatch[0], " ") };

  return { phrase: null, rest: text };
}

function extractRoomPhrase(text: string): { phrase: string | null; rest: string } {
  for (const word of ROOM_WORDS) {
    const re = new RegExp(`\\b(${word})\\s*(\\d+)?\\b`, "i");
    const m = text.match(re);
    if (m) return { phrase: m[0].trim(), rest: text.replace(m[0], " ") };
  }
  return { phrase: null, rest: text };
}

function splitLocationPhrase(phrase: string): Pick<ParsedAddEntities, "roomPhrase" | "furniturePhrase" | "storagePhrase"> {
  const { phrase: storagePhrase, rest: afterStorage } = extractStoragePhrase(phrase);
  const { phrase: roomPhrase, rest: afterRoom } = extractRoomPhrase(afterStorage);
  const furniturePhrase = afterRoom
    .replace(/\b(of|the|in|inside|at|on|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    roomPhrase,
    furniturePhrase: furniturePhrase.length > 1 ? furniturePhrase : null,
    storagePhrase,
  };
}

const ADD_WITH_LOCATION_FIRST =
  /\bi\s+(kept|keep|put|placed|placing)\s+(my\s+|the\s+)?(.+?)\s+(in|inside|at|on)\s+(.+?)[.!]*\s*(add it|add this|add them)?[.!]*$/i;
const ADD_WITH_LOCATION = /^(please\s+)?add\s+(my\s+|a\s+|an\s+|the\s+)?(.+?)\s+(to|in|at|inside)\s+(.+?)[.!]*$/i;
const ADD_SIMPLE = /^(please\s+)?add\s+(my\s+|a\s+|an\s+|the\s+)?(.+?)[.!]*$/i;
const ADD_WANT = /^i\s+(?:want|would like|'d like)\s+to add\s+(my\s+|a\s+|an\s+|the\s+)?(.+?)[.!]*$/i;
const ADD_HAVE_NEW = /^i\s+(?:have|got|bought)\s+(?:a|an)?\s*new\s+(.+?)[.!]*$/i;

function extractAddEntities(rawNormalized: string): ParsedAddEntities {
  // Location-first phrasing keeps its punctuation so the trailing "add it"
  // clause boundary stays anchored — try it before stripping punctuation.
  const locationFirst = rawNormalized.match(ADD_WITH_LOCATION_FIRST);
  if (locationFirst) {
    const itemName = stripLeadingFillers(stripPunctuation(locationFirst[3]));
    const location = splitLocationPhrase(stripPunctuation(locationFirst[5]));
    return { itemNameRaw: itemName ? titleCase(itemName) : null, ...location };
  }

  const cleaned = stripPunctuation(rawNormalized);

  const withLoc = cleaned.match(ADD_WITH_LOCATION);
  if (withLoc) {
    const itemName = stripLeadingFillers(withLoc[3]);
    const location = splitLocationPhrase(withLoc[5]);
    return { itemNameRaw: itemName ? titleCase(itemName) : null, ...location };
  }

  const wanted = cleaned.match(ADD_WANT);
  if (wanted) {
    const itemName = stripLeadingFillers(wanted[2]);
    return { itemNameRaw: itemName ? titleCase(itemName) : null, roomPhrase: null, furniturePhrase: null, storagePhrase: null };
  }

  const haveNew = cleaned.match(ADD_HAVE_NEW);
  if (haveNew) {
    const itemName = stripLeadingFillers(haveNew[1]);
    return { itemNameRaw: itemName ? titleCase(itemName) : null, roomPhrase: null, furniturePhrase: null, storagePhrase: null };
  }

  const simple = cleaned.match(ADD_SIMPLE);
  if (simple) {
    const itemName = stripLeadingFillers(simple[3]);
    // "add it" / "add this" alone carry no new item name — the caller falls
    // back to whatever was mentioned earlier in a multi-turn conversation.
    const isPlaceholder = /^(it|this|them)$/i.test(itemName);
    return {
      itemNameRaw: isPlaceholder || !itemName ? null : titleCase(itemName),
      roomPhrase: null,
      furniturePhrase: null,
      storagePhrase: null,
    };
  }

  return { itemNameRaw: null, roomPhrase: null, furniturePhrase: null, storagePhrase: null };
}

export function parseVoiceTranscript(rawTranscript: string): NluResult {
  const transcript = rawTranscript.trim();
  if (!transcript) return { intent: "unclear", transcript };

  const normalized = normalizeNumberWords(transcript.toLowerCase());

  // Checked first: every vault pattern is anchored to the start of the
  // phrase, so none of them overlap with the search/add patterns below.
  const vaultAction = classifyVaultAction(normalized, transcript);
  if (vaultAction) return { intent: "vault", actions: [vaultAction] };

  if (isSearchIntent(normalized)) {
    return { intent: "inventory", action: buildInventoryAction(normalized) };
  }
  if (isAddIntent(normalized)) {
    return { intent: "add", add: extractAddEntities(normalized) };
  }
  return { intent: "unclear", transcript };
}
