import { expandSearchTerms } from "@/lib/voice/synonyms";
import type { NluResult } from "@/lib/voice/types";

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
  intent: "search" | "add" | "unclear";
  search_query: string | null;
  item_name: string | null;
  room: string | null;
  furniture: string | null;
  storage_location: string | null;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["search", "add", "unclear"] },
    search_query: { type: ["string", "null"] },
    item_name: { type: ["string", "null"] },
    room: { type: ["string", "null"] },
    furniture: { type: ["string", "null"] },
    storage_location: { type: ["string", "null"] },
  },
  required: ["intent", "search_query", "item_name", "room", "furniture", "storage_location"],
};

const SYSTEM_PROMPT = `You are the natural-language layer for a home inventory app's voice search.
Given a single spoken sentence, classify it as one of two intents and extract structured fields.

"search" — the user wants to find where something is (e.g. "where is my passport", "find my camera", "show me winter clothes").
"add" — the user wants to add a new item to their inventory (e.g. "add my black headphones", "I have a new camera", "I kept my charger in the wardrobe, add it").
"unclear" — you cannot confidently tell which of the two the user means, or the sentence isn't about finding/adding anything.

Fields:
- search_query: for "search" intent, the core item/category being searched for (e.g. "passport", "winter clothes"). null otherwise.
- item_name: for "add" intent, the name of the item to add, cleaned of filler words like "my"/"a"/"new" but keeping descriptive words like brand/color (e.g. "Black Sony Headphones"). null otherwise.
- room: for "add" intent, the room mentioned, if any (e.g. "Bedroom 1", "Kitchen"). null if not mentioned.
- furniture: for "add" intent, the furniture piece mentioned, if any (e.g. "Wardrobe", "TV Unit"). null if not mentioned.
- storage_location: for "add" intent, the specific shelf/drawer/section mentioned, if any (e.g. "Second Shelf", "Top Shelf"). null if not mentioned.

Respond with strict JSON matching the schema. Do not invent a room/furniture/storage location that wasn't actually said.`;

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim() ? key.trim() : null;
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
