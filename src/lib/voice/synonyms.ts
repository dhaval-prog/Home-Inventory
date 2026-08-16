/**
 * Domain vocabulary used to expand a spoken phrase into a broader set of
 * search terms (e.g. "car documents" -> also matches items tagged/categorized
 * as registration, insurance, RC) and to resolve spoken room/furniture/
 * storage-location phrases against the user's actual data.
 */

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  documents: [
    "document", "documents", "paper", "papers", "file", "files", "certificate", "certificates",
    "id", "passport", "license", "licence", "registration", "rc", "insurance", "warranty",
    "policy", "aadhar", "pan card", "visa",
  ],
  electronics: [
    "electronic", "electronics", "gadget", "gadgets", "charger", "cable", "camera", "phone",
    "mobile", "smartphone", "laptop", "headphone", "headphones", "earphone", "earphones", "earbuds", "speaker",
    "remote", "adapter", "battery", "router", "tv", "television", "monitor", "tablet", "smartwatch",
  ],
  clothes: [
    "clothes", "clothing", "shirt", "shirts", "pant", "pants", "trouser", "trousers", "jacket",
    "jackets", "sweater", "sweaters", "coat", "coats", "dress", "dresses", "sari", "saree",
  ],
  shoes: ["shoe", "shoes", "sneaker", "sneakers", "sandals", "sandal", "boots", "boot", "footwear", "slippers"],
  kitchen: ["utensil", "utensils", "cookware", "cutlery", "plate", "plates", "pan", "pans", "pot", "pots", "bowl", "bowls"],
  food: ["food", "grocery", "groceries", "snack", "snacks", "spice", "spices", "ration"],
  tools: ["tool", "tools", "hammer", "screwdriver", "wrench", "drill", "toolbox", "spanner"],
  toys: ["toy", "toys", "game", "games", "puzzle", "puzzles", "lego"],
  books: ["book", "books", "novel", "notebook", "notebooks", "magazine", "textbook", "textbooks"],
  medicines: ["medicine", "medicines", "medication", "tablet", "tablets", "pill", "pills", "syrup", "first aid", "bandage"],
  cleaning: ["cleaning", "detergent", "broom", "mop", "cleaner", "vacuum", "soap"],
  travel: ["travel", "suitcase", "suitcases", "luggage", "backpack", "trolley", "duffel"],
  personal: ["personal", "wallet", "keys", "key", "jewelry", "jewellery", "watch", "watches", "glasses", "sunglasses"],
  accessories: ["accessory", "accessories", "belt", "belts", "cap", "caps", "hat", "hats", "scarf"],
  important: ["important", "valuable", "valuables", "precious"],
};

/** Extra phrase-level associations that don't map cleanly to a single category. */
const PHRASE_EXPANSIONS: Record<string, string[]> = {
  car: ["vehicle", "registration", "rc", "insurance", "car"],
  vehicle: ["car", "registration", "rc", "insurance", "vehicle"],
  bike: ["vehicle", "registration", "rc", "insurance", "bike", "motorcycle"],
  winter: ["jacket", "sweater", "blanket", "coat", "heater", "winter"],
  summer: ["t-shirt", "shorts", "sandals", "sunscreen", "summer"],
  baby: ["diaper", "diapers", "toy", "toys", "baby"],
  bravia: ["tv", "television", "sony"],
  iphone: ["phone", "smartphone", "apple", "mobile"],
  airpods: ["earbuds", "earphones", "apple"],
};

/**
 * Expands a spoken phrase (already stripped of filler words) into a wider
 * bag of search terms: the original words, any category the phrase seems to
 * describe (plus that category's sibling keywords), and any phrase-specific
 * related terms. Used so "find my winter clothes" also matches an item
 * literally named "Winter Jacket" even though "clothes" never appears in it.
 */
export function expandSearchTerms(phrase: string): string[] {
  const normalized = phrase.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(words);
  if (normalized) expanded.add(normalized);

  for (const word of words) {
    const extra = PHRASE_EXPANSIONS[word];
    if (extra) extra.forEach((t) => expanded.add(t));
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => normalized.includes(k))) {
      expanded.add(category);
      keywords.forEach((k) => expanded.add(k));
    }
  }

  return Array.from(expanded);
}

const NUMBER_WORDS: Record<string, string> = {
  first: "1", "1st": "1", one: "1",
  second: "2", "2nd": "2", two: "2",
  third: "3", "3rd": "3", three: "3",
  fourth: "4", "4th": "4", four: "4",
  fifth: "5", "5th": "5", five: "5",
  sixth: "6", "6th": "6", six: "6",
};

/** Converts spoken ordinal/number words to digits so "second shelf" lines up with "Shelf 2". */
export function normalizeNumberWords(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => NUMBER_WORDS[w.toLowerCase()] ?? w)
    .join(" ");
}

function normalizeForCompare(text: string): string {
  return normalizeNumberWords(text.toLowerCase())
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeForCompare(text).split(" ").filter(Boolean));
}

/**
 * Fuzzy-matches a spoken phrase against a list of real named records (rooms,
 * furniture, or storage locations) and returns the best match, if any is
 * good enough to trust. Handles exact match, substring containment either
 * direction, and token-overlap scoring (so "second shelf" matches a storage
 * location literally named "Shelf 2").
 */
export function fuzzyMatchByName<T extends { name: string }>(
  spoken: string,
  candidates: T[]
): T | null {
  const needle = normalizeForCompare(spoken);
  if (!needle || candidates.length === 0) return null;

  for (const c of candidates) {
    if (normalizeForCompare(c.name) === needle) return c;
  }

  const needleTokens = tokenSet(spoken);
  let best: { candidate: T; score: number } | null = null;
  for (const c of candidates) {
    const hayNorm = normalizeForCompare(c.name);
    const containment = hayNorm.includes(needle) || needle.includes(hayNorm) ? 0.5 : 0;
    const hayTokens = tokenSet(c.name);
    const shared = [...needleTokens].filter((t) => hayTokens.has(t)).length;
    const overlap = shared / Math.max(needleTokens.size, hayTokens.size, 1);
    const score = containment + overlap;
    if (score > 0 && (!best || score > best.score)) {
      best = { candidate: c, score };
    }
  }

  return best && best.score >= 0.4 ? best.candidate : null;
}
