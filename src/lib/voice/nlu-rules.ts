import { expandSearchTerms, normalizeNumberWords } from "@/lib/voice/synonyms";
import type { NluResult, ParsedAddEntities, ParsedDeductEntities, ParsedSearchQuery, VaultCategory } from "@/lib/voice/types";

/**
 * Zero-dependency, zero-cost intent classifier + entity extractor. This is
 * the guaranteed-working baseline (works with no API key, no setup); an
 * optional Gemini-backed layer (src/lib/voice/nlu-gemini.ts) can produce a
 * richer NluResult when GEMINI_API_KEY is configured, falling back to this
 * module whenever that's unavailable or fails.
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

// Anchored to the start of the phrase (like ADD_PATTERNS above) so common
// search phrases sharing a trigger word ("where is my pay stub") never
// misfire as a vault deduction — every spec example phrases the verb first.
const DEDUCT_PATTERNS = [
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

const CATEGORY_SYNONYMS: [RegExp, VaultCategory][] = [
  [/\bgroceries?\b/i, "Groceries"],
  [/\bnew\s+clothes\b|\bclothes\b|\bclothing\b/i, "New Clothes"],
  [/\bfood\b/i, "Food"],
  [/\bshopping\b/i, "Shopping"],
  [/\bbills?\b/i, "Bills"],
  [/\btravell?ing\b|\btravel\b|\btrip\b/i, "Travel"],
  [/\bentertainment\b|\bmovies?\b/i, "Entertainment"],
  [/\bmedical\b|\bdoctor\b|\bhealth\b|\bhospital\b|\bmedicine\b/i, "Medical"],
  [/\bother\b/i, "Other"],
];

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

export function isDeductIntent(normalized: string): boolean {
  return DEDUCT_PATTERNS.some((re) => re.test(normalized));
}

function matchCategory(text: string): VaultCategory | null {
  for (const [re, category] of CATEGORY_SYNONYMS) {
    if (re.test(text)) return category;
  }
  return null;
}

function extractAmount(normalized: string): number | null {
  const m = normalized.match(/[\d][\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sentenceCase(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function extractDeductEntities(normalized: string, rawTranscript: string): ParsedDeductEntities {
  const amount = extractAmount(normalized);

  // An explicit "comment: ..." marker always wins, verbatim.
  const commentMarker = rawTranscript.match(/comment\s*[:\-]?\s*(.+)$/i);
  let comment = commentMarker ? commentMarker[1].trim() : null;

  // "for X" / "on X" trailing phrase drives the category; if present, it
  // fully accounts for the trailing clause so there's no leftover comment.
  const forOnMatch = normalized.match(/\b(?:for|on)\s+(.+?)[.!]*$/i);
  let category = forOnMatch ? matchCategory(forOnMatch[1]) : null;
  if (!category) category = matchCategory(normalized);

  // No "for/on" and no explicit comment marker — fall back to a trailing
  // comma clause as the comment, e.g. "minus 2000, bought new clothes".
  // Requires a leading letter so a thousands-separator comma inside the
  // amount itself (e.g. "₹1,000") is never mistaken for a comment clause.
  if (!comment && !forOnMatch) {
    const commaClause = rawTranscript.match(/,\s*([a-zA-Z].*)$/);
    if (commaClause) comment = commaClause[1].trim().replace(/[.!]+$/, "");
  }

  return { amount, category, comment: comment ? sentenceCase(comment) : null };
}

function buildSearchQuery(normalized: string): ParsedSearchQuery {
  let remainder = normalized.trim();
  for (const re of SEARCH_FILLERS) {
    if (re.test(remainder)) {
      remainder = remainder.replace(re, "").trim();
      break;
    }
  }
  remainder = stripPunctuation(remainder);
  return { queryRaw: remainder, expandedTerms: expandSearchTerms(remainder) };
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

  // Checked first: DEDUCT_PATTERNS is anchored to the start of the phrase,
  // so it never overlaps with the search/add patterns below.
  if (isDeductIntent(normalized)) {
    return { intent: "deduct", deduct: extractDeductEntities(normalized, transcript) };
  }
  if (isSearchIntent(normalized)) {
    return { intent: "search", search: buildSearchQuery(normalized) };
  }
  if (isAddIntent(normalized)) {
    return { intent: "add", add: extractAddEntities(normalized) };
  }
  return { intent: "unclear", transcript };
}
