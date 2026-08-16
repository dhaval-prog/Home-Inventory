import { expandSearchTerms } from "@/lib/voice/synonyms";
import { VAULT_CATEGORIES, type NluResult, type VaultCategory } from "@/lib/voice/types";

/**
 * Optional richer NLU layer. Activates only when GEMINI_API_KEY is set in
 * the server environment (never exposed to the client); otherwise
 * `parseWithGemini` returns null immediately and the caller falls back to
 * the zero-dependency rule-based engine in nlu-rules.ts. A network error,
 * timeout, or malformed response also falls back silently — voice search
 * must never hard-fail just because an optional AI enhancement is down.
 */

const DEFAULT_MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 6000;

interface GeminiExtraction {
  intent: "search" | "add" | "deduct" | "unclear";
  search_query: string | null;
  item_name: string | null;
  room: string | null;
  furniture: string | null;
  storage_location: string | null;
  amount: number | null;
  category: string | null;
  comment: string | null;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["search", "add", "deduct", "unclear"] },
    search_query: { type: ["string", "null"] },
    item_name: { type: ["string", "null"] },
    room: { type: ["string", "null"] },
    furniture: { type: ["string", "null"] },
    storage_location: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
    category: { type: ["string", "null"] },
    comment: { type: ["string", "null"] },
  },
  required: [
    "intent",
    "search_query",
    "item_name",
    "room",
    "furniture",
    "storage_location",
    "amount",
    "category",
    "comment",
  ],
};

const SYSTEM_PROMPT = `You are the natural-language layer for a home inventory app's voice search and its savings vault.
Given a single spoken sentence, classify it as one of three intents and extract structured fields.

"search" — the user wants to find where something is (e.g. "where is my passport", "find my camera", "show me winter clothes").
"add" — the user wants to add a new item to their inventory (e.g. "add my black headphones", "I have a new camera", "I kept my charger in the wardrobe, add it").
"deduct" — the user wants to record money spent/deducted from their savings vault (e.g. "deduct 500", "remove 1000 for groceries", "paid 750 for groceries", "I spent 1200 on shopping today", "minus 2000, bought new clothes"). Trigger words: deduct, remove, minus, paid, pay, spent, spend, take out, took out.
"unclear" — you cannot confidently tell which of the three the user means, or the sentence isn't about finding/adding an item or deducting money.

Fields:
- search_query: for "search" intent, the core item/category being searched for (e.g. "passport", "winter clothes"). null otherwise.
- item_name: for "add" intent, the name of the item to add, cleaned of filler words like "my"/"a"/"new" but keeping descriptive words like brand/color (e.g. "Black Sony Headphones"). null otherwise.
- room: for "add" intent, the room mentioned, if any (e.g. "Bedroom 1", "Kitchen"). null if not mentioned.
- furniture: for "add" intent, the furniture piece mentioned, if any (e.g. "Wardrobe", "TV Unit"). null if not mentioned.
- storage_location: for "add" intent, the specific shelf/drawer/section mentioned, if any (e.g. "Second Shelf", "Top Shelf"). null if not mentioned.
- amount: for "deduct" intent, the numeric amount of money mentioned (just the number, no currency symbol). null otherwise, or if no clear amount was stated.
- category: for "deduct" intent, one of exactly these values if it clearly matches: ${VAULT_CATEGORIES.join(", ")}. null if none clearly matches.
- comment: for "deduct" intent, any free-text note the user gave about the expense (e.g. "bought a new shirt"), preserved close to as spoken. null if none given.

Respond with strict JSON matching the schema. Do not invent a room/furniture/storage location that wasn't actually said, and do not invent a category that wasn't implied.`;

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function normalizeCategory(raw: string | null): VaultCategory | null {
  if (!raw) return null;
  const found = VAULT_CATEGORIES.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  return found ?? null;
}

function toNluResult(transcript: string, extraction: GeminiExtraction): NluResult {
  if (extraction.intent === "search") {
    const query = (extraction.search_query ?? transcript).trim();
    return { intent: "search", search: { queryRaw: query, expandedTerms: expandSearchTerms(query) } };
  }
  if (extraction.intent === "add") {
    return {
      intent: "add",
      add: {
        itemNameRaw: extraction.item_name?.trim() || null,
        roomPhrase: extraction.room?.trim() || null,
        furniturePhrase: extraction.furniture?.trim() || null,
        storagePhrase: extraction.storage_location?.trim() || null,
      },
    };
  }
  if (extraction.intent === "deduct") {
    return {
      intent: "deduct",
      deduct: {
        amount: typeof extraction.amount === "number" && extraction.amount > 0 ? extraction.amount : null,
        category: normalizeCategory(extraction.category),
        comment: extraction.comment?.trim() || null,
      },
    };
  }
  return { intent: "unclear", transcript };
}

export async function parseWithGemini(transcript: string): Promise<NluResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: transcript }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0,
          },
        }),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as GeminiExtraction;
    if (!parsed || typeof parsed.intent !== "string") return null;

    return toNluResult(transcript, parsed);
  } catch {
    // Network error, timeout, or malformed JSON — silently fall back to rules.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
