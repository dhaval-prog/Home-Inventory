import { expandSearchTerms } from "@/lib/voice/synonyms";
import {
  VAULT_CATEGORIES,
  type ConfidenceLevel,
  type InventoryAction,
  type InventoryIntent,
  type NluResult,
  type VaultAction,
  type VaultCategory,
  type VaultIntent,
} from "@/lib/voice/types";

/**
 * Optional richer NLU layer, and the primary brain for the vault voice
 * assistant — regex alone can't reliably parse multi-turn corrections,
 * open-ended insight questions, or multi-intent commands. Activates only
 * when GEMINI_API_KEY is set in the server environment (never exposed to
 * the client); otherwise `parseWithGemini` returns null immediately and the
 * caller falls back to the zero-dependency rule-based engine in
 * nlu-rules.ts (which only covers the clear-cut vault operations). A
 * network error, timeout, or malformed response also falls back silently —
 * voice search must never hard-fail just because an optional AI enhancement
 * is down.
 */

const DEFAULT_MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 8000;

/**
 * Session-local conversational context, threaded in by the caller (never
 * persisted server-side) so a bare follow-up reply like "groceries" can be
 * understood as answering the assistant's own prior question, and a
 * correction like "actually make that 4000" can be understood as amending
 * the most recent voice transaction.
 */
export interface VaultNluContext {
  pendingQuestion?: string | null;
  lastTransactionSummary?: string | null;
  /**
   * A plain-English sentence describing the previous turn's *result*
   * (search or vault alike), e.g. "Showed grocery spending: ₹3,200 this
   * month." or "Found the camera in Bedroom → Wardrobe." — generalizes
   * lastTransactionSummary to read-only queries so a short follow-up like
   * "what about last month?" or "what else is there?" resolves against
   * what was just shown, not just the last money movement.
   */
  previousTurnSummary?: string | null;
  /** Names of the current household's real goals (e.g. ["Family Vacation", "Emergency Fund"]), so "the vacation fund" can be recognized as naming one of them. Omit/empty when the caller has no active household context. */
  householdGoalNames?: string[];
}

interface GeminiVaultAction {
  intent: VaultIntent;
  amount: number | null;
  category: string | null;
  comment: string | null;
  date_phrase: string | null;
  reference_ordinal: "last" | null;
  reference_kind: "add" | "deduct" | "recurring" | null;
  reference_category: string | null;
  reference_date_phrase: string | null;
  new_amount: number | null;
  new_category: string | null;
  recurring_amount: number | null;
  recurring_schedule_mode: "salary" | "date" | null;
  recurring_day_of_month: number | null;
  recurring_enabled: boolean | null;
  /** A physical item named alongside this money question/action, e.g. "the TV" in "how much did I spend on the TV?". Resolved read-only against inventory downstream — never invents or edits an item. */
  item_entity: string | null;
  /** For check_household_balance/contribute_household_goal — the goal name as spoken (e.g. "vacation fund"), matched against the "Known household goals" context line when present. Null for check_household_balance means the household's total, not one goal. */
  goal_name: string | null;
  confidence: ConfidenceLevel;
}

const INVENTORY_INTENT_ENUM: InventoryIntent[] = ["search", "item_details", "location_search", "category_search", "recently_added"];

interface GeminiExtraction {
  domain: "search" | "add" | "vault" | "unclear";
  search_intent: InventoryIntent | null;
  /** The cleaned target entity/item phrase being searched for, e.g. "passport", "TV", "winter clothes" — filler words already stripped. */
  search_query: string | null;
  /** For category_search — a category name/synonym as spoken, e.g. "electronics". */
  search_category: string | null;
  /** Your own semantic/brand-name/synonym expansion of search_query, e.g. "Bravia" -> ["tv","television","sony"], "sneakers" -> ["shoes","nike","air max"]. Empty array if nothing beyond the literal words applies. */
  expanded_terms: string[];
  /** Confidence for the search/add domains (vault actions carry their own per-action confidence). */
  confidence: ConfidenceLevel;
  item_name: string | null;
  room: string | null;
  furniture: string | null;
  storage_location: string | null;
  vault_actions: GeminiVaultAction[];
}

const VAULT_INTENT_ENUM: VaultIntent[] = [
  "add_money",
  "deduct_money",
  "check_balance",
  "check_total_saved",
  "check_spending",
  "view_history",
  "undo_transaction",
  "edit_transaction",
  "delete_transaction",
  "set_recurring",
  "vault_insight",
  "help",
  "check_household_balance",
  "contribute_household_goal",
];

const VAULT_ACTION_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: VAULT_INTENT_ENUM },
    amount: { type: ["number", "null"] },
    category: { type: ["string", "null"] },
    comment: { type: ["string", "null"] },
    date_phrase: { type: ["string", "null"] },
    reference_ordinal: { type: ["string", "null"], enum: ["last", null] },
    reference_kind: { type: ["string", "null"], enum: ["add", "deduct", "recurring", null] },
    reference_category: { type: ["string", "null"] },
    reference_date_phrase: { type: ["string", "null"] },
    new_amount: { type: ["number", "null"] },
    new_category: { type: ["string", "null"] },
    recurring_amount: { type: ["number", "null"] },
    recurring_schedule_mode: { type: ["string", "null"], enum: ["salary", "date", null] },
    recurring_day_of_month: { type: ["number", "null"] },
    recurring_enabled: { type: ["boolean", "null"] },
    item_entity: { type: ["string", "null"] },
    goal_name: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "intent",
    "amount",
    "category",
    "comment",
    "date_phrase",
    "reference_ordinal",
    "reference_kind",
    "reference_category",
    "reference_date_phrase",
    "new_amount",
    "new_category",
    "recurring_amount",
    "recurring_schedule_mode",
    "recurring_day_of_month",
    "recurring_enabled",
    "item_entity",
    "goal_name",
    "confidence",
  ],
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    domain: { type: "string", enum: ["search", "add", "vault", "unclear"] },
    search_intent: { type: ["string", "null"], enum: [...INVENTORY_INTENT_ENUM, null] },
    search_query: { type: ["string", "null"] },
    search_category: { type: ["string", "null"] },
    expanded_terms: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    item_name: { type: ["string", "null"] },
    room: { type: ["string", "null"] },
    furniture: { type: ["string", "null"] },
    storage_location: { type: ["string", "null"] },
    vault_actions: { type: "array", items: VAULT_ACTION_SCHEMA },
  },
  required: [
    "domain",
    "search_intent",
    "search_query",
    "search_category",
    "expanded_terms",
    "confidence",
    "item_name",
    "room",
    "furniture",
    "storage_location",
    "vault_actions",
  ],
};

const SYSTEM_PROMPT = `You are the natural-language layer for a home inventory app's search bar (both typed and spoken) AND its savings vault voice assistant. Given a single utterance (plus optional prior-turn context), classify it into a domain and extract structured fields. Never invent numbers, categories, rooms, or references that weren't actually said or clearly implied. Be tolerant of typos, missing punctuation, and casual/conversational phrasing (typed queries especially) — never fall back to "unclear" just because of a misspelling ("wher is my pasport" is still search, entity "passport").

Four domains:
- "search" — the user wants to find, list, or ask about physical inventory items. Covers five sub-intents (search_intent) described below.
- "add" — the user wants to add a new physical item to their inventory (e.g. "add my black headphones", "I have a new camera", "I kept my charger in the wardrobe, add it").
- "vault" — the user wants to do ANYTHING with their savings vault: add/deduct money, check balance or spending, view or modify transaction history, manage recurring savings, or ask an analytical question about their spending. See the vault intent list below.
- "unclear" — you cannot confidently tell which of the above the user means, OR the query is too vague to act on (e.g. "show me my stuff", "what have I got") — still set search_intent="search" with entity null in this vague case so the caller can offer helpful categories, rather than a hard "unclear".

Distinguishing "vault" from "search"/"add" — money vs. physical items:
"how much did I spend on groceries?" -> vault (check_spending). "where did I keep the groceries?" -> search. "show me my grocery spending" -> vault. "where is my grocery stock?" -> search. When in doubt, a question about money amounts (spent/saved/added/balance) is vault; a question about a physical location, container, or "what do I have" is search.

Search sub-intents (search_intent) — with search_query as the cleaned target entity/item phrase (filler words like "my"/"the"/"where is" stripped):
- "search": general "where is X" / "find X" lookup, e.g. "where is my passport" (search_query="passport"), "find my camera".
- "item_details": the user names one specific item and wants more about it, e.g. "tell me about my Sony TV", "what's in the box with my passport".
- "location_search": the user names a room/furniture/container and wants everything in it, e.g. "what's in my bedroom wardrobe" (room="Bedroom", furniture="Wardrobe", search_query null), "what's on the kitchen shelf".
- "category_search": the user names a category rather than a specific item, e.g. "show me my electronics", "what clothes do I have" (search_category="Electronics"/"Clothes").
- "recently_added": e.g. "what did I add recently", "show me my newest items", "what's new in my inventory".

Semantic/brand matching (expanded_terms): expand the entity into what it actually refers to using real-world knowledge — brand names to product types ("Bravia" -> ["tv","television","sony"], "iPhone" -> ["phone","smartphone","apple"]), colloquial names to catalog terms ("sneakers" -> ["shoes","nike","air max"]), synonyms ("specs"/"shades" -> ["glasses","sunglasses"]). Leave it an empty array when the entity is already literal with nothing more to add.

Location-aware search: when a room or furniture name is mentioned (own field or as part of the phrase), fill room/furniture so results can be scoped to that container even if the item name itself is vague or absent.

Vault intents (put in vault_actions[].intent) with examples straight from real usage:
- "add_money": "add 5000 to my vault", "deposit 2000", "put 10k into savings".
- "deduct_money": "deduct 500", "remove 500", "minus 500", "I spent 500", "I paid 500", "I just paid 500 for groceries", "take 500 out of my vault", "spent 500 on dinner", "500 gone for groceries", "please subtract 500", "can you take 500 from my savings?", "deduct 1200 for groceries because I stocked up for the week" (comment = "Stocked up for the week").
- "check_balance": "how much do I have?", "what's my balance?".
- "check_total_saved": "how much have I saved?", "how much did I add this year?".
- "check_spending": "how much did I spend this month?", "how much did I spend on groceries last month?", "show me everything I deducted yesterday" (also acceptable for view_history). Fill category and/or date_phrase (raw, e.g. "last month", "yesterday", "this week") whenever mentioned — leave both null for an all-time, all-category total.
- "view_history": "show me my transaction history", "show me what I spent yesterday".
- "undo_transaction": "undo that", "undo the last transaction", "remove the last deduction" (reference_ordinal="last", reference_kind="deduct").
- "edit_transaction": "change that to 800", "actually make that 4000" (a correction immediately following a transaction — new_amount is the corrected amount), "deduct 500 for food, actually make that 700" (single utterance: intent deduct_money is NOT used here since the user corrected themselves before finishing — instead emit ONE deduct_money action with the FINAL corrected amount/category, since this is a same-utterance self-correction, not a reference to a past transaction).
- "delete_transaction": "delete the grocery transaction from today" (reference_category="Groceries", reference_date_phrase="today").
- "set_recurring": "add 5000 to my vault and remind me to add another 5000 next month" -> TWO actions: add_money (amount=5000) AND set_recurring (recurring_amount=5000, recurring_enabled=true, recurring_schedule_mode="date" only if a specific day was named, else "salary").
- "vault_insight": open-ended analytical questions like "where did most of my money go?", "what's my biggest expense this month?", "did I spend more this month than last month?", "what category is eating up my savings?".
- "help": "what can you do?", "help".
- "check_household_balance": a question about the HOUSEHOLD's pooled/shared money, not the user's own personal vault — "how much have we saved?", "how much is in the vacation fund?" (goal_name="vacation fund"), "how much more do we need for the emergency fund?" (goal_name="emergency fund"), "what's in our shared vault?". Leave goal_name null when the question is about the household's total, not one goal.
- "contribute_household_goal": the user commits to putting money toward a HOUSEHOLD goal — "I'll contribute 5000 to the vacation fund" (amount=5000, goal_name="vacation fund"), "I can add 2000 to the emergency fund", "let's put 3000 toward the new TV". This is distinct from add_money (which only ever means the user's own personal vault) — if a goal/fund is named, or the phrasing is clearly about "we"/"our"/"the household", use contribute_household_goal instead of add_money.

Combined vault+inventory queries (item_entity): when a vault question names a physical item rather than (or alongside) a category, e.g. "how much did I spend on the TV?" or "what did I spend on my new Sony TV last month?", keep intent as check_spending (category likely null unless also stated) and set item_entity to the item phrase ("TV"/"Sony TV") — this is resolved read-only against inventory downstream, never used to create or edit an item.

Household goal names (goal_name): when a "Known household goals" context line is present, match the user's phrase against those exact names when it's a clear reference (e.g. "the vacation fund" -> "Family Vacation") and return the REAL goal name, not the user's paraphrase — resolution against the actual database row still happens downstream, so when genuinely ambiguous just return the phrase as heard.

Same-utterance self-correction (e.g. "Deduct 500 for food — actually make that 700", "Add 2000, sorry I meant 3000", "Deduct 800 for groceries... no, that's shopping"): resolve to ONE action with the user's FINAL intended amount/category — do not emit two actions and do not use edit_transaction/undo_transaction for these, since nothing was recorded yet.

Multi-intent (up to 2 actions): only split into two vault_actions when the utterance clearly names two distinct requests joined by "and"/"then", e.g. "Deduct 1500 for groceries and tell me how much I have left" -> [deduct_money(amount=1500, category="Groceries"), check_balance]. Otherwise return exactly one action.

References to past transactions (reference_ordinal/reference_kind/reference_category/reference_date_phrase) — used by undo_transaction, edit_transaction (when NOT a same-utterance self-correction, e.g. a bare "change that to 800" with no amount/category context, referring to something said earlier), and delete_transaction:
- "that" / "the last one" with no other detail -> reference_ordinal="last", other reference fields null (resolved against the most recent transaction in this session, or the most recent overall).
- "the last deduction" -> reference_ordinal="last", reference_kind="deduct".
- "the grocery transaction from today" -> reference_category="Groceries", reference_date_phrase="today", reference_ordinal null unless "last"/"most recent" is also said.

Categories — map natural language onto exactly these values, or null if nothing matches: ${VAULT_CATEGORIES.join(", ")}.
Examples: "bought vegetables"->Groceries, "bought a shirt"->New Clothes, "had dinner"->Food, "ordered something from Amazon"->Shopping, "paid electricity bill"->Bills, "Uber to the office"->Travel, "bought medicine"->Medical, "watched a movie"->Entertainment. Category is always optional — leave it null rather than guessing.

Comments: only capture genuinely useful context the user actually gave (e.g. "because I stocked up for the week", "bought a new shirt for the wedding") — do not invent a comment when there is none.

Money amounts: parse natural expressions like "₹500", "500 rupees", "five hundred rupees", "1k", "1.5k", "2 grand", "two thousand", "₹2,500", "2.5 thousand", "one point five K" into a plain number (e.g. 1500). If a deduct/add/edit action clearly has NO confident amount (e.g. "deduct some money", "take some money out for that thing"), set amount (or new_amount) to null and confidence to "low" — never guess a number.

Confidence: "high" when the request is unambiguous (clear amount + clear intent). "medium" when you understood the intent but something is a guess (e.g. inferred category from a vague clue). "low" when a required field (usually the amount) is missing or the whole utterance is vague — the app will ask the user to clarify rather than execute.

Context you may receive before the final user utterance: a line like "(context: known household goals: ...)" listing the current household's real goal names — use it only to resolve goal_name references (see above); if absent, the user has no active household and check_household_balance/contribute_household_goal should not be guessed from an ambiguous utterance. A separate line like "(context: ...)" describes the most recent transaction in this session — use it to resolve corrections ("actually make that 4000") and bare "undo that" references. A second, similar line may describe the previous turn's *result* in plain English regardless of domain (e.g. "Showed grocery spending: ₹3,200 this month." or "Found the camera in Bedroom → Wardrobe.") — use it to resolve short follow-ups that only make sense against what was just shown: "what about last month?" (re-run the same query with a new date_phrase/no other change), "what else is there?" (location_search/category_search again, same room/category), "show me another one" (search again, excluding what was just shown is not possible but re-run the same query). A message attributed to you (the model) is a clarifying question you just asked (e.g. "What was it for?") — interpret the user's final utterance as a direct, complete answer to that question (e.g. the user just says "groceries" — treat it as the category for the pending deduction, not as a new/unclear command).

Respond with strict JSON matching the schema.`;

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function normalizeCategory(raw: string | null): VaultCategory | null {
  if (!raw) return null;
  const found = VAULT_CATEGORIES.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  return found ?? null;
}

function toVaultAction(a: GeminiVaultAction): VaultAction {
  return {
    intent: a.intent,
    amount: typeof a.amount === "number" && a.amount > 0 ? a.amount : null,
    category: normalizeCategory(a.category),
    comment: a.comment?.trim() || null,
    datePhrase: a.date_phrase?.trim() || null,
    reference:
      a.reference_ordinal || a.reference_kind || a.reference_category || a.reference_date_phrase
        ? {
            ordinal: a.reference_ordinal ?? null,
            kind: a.reference_kind ?? null,
            category: normalizeCategory(a.reference_category),
            datePhrase: a.reference_date_phrase?.trim() || null,
          }
        : null,
    newAmount: typeof a.new_amount === "number" && a.new_amount > 0 ? a.new_amount : null,
    newCategory: normalizeCategory(a.new_category),
    recurring:
      a.recurring_amount != null || a.recurring_enabled != null
        ? {
            amount: typeof a.recurring_amount === "number" && a.recurring_amount > 0 ? a.recurring_amount : null,
            scheduleMode: a.recurring_schedule_mode ?? null,
            dayOfMonth: a.recurring_day_of_month ?? null,
            enabled: a.recurring_enabled ?? null,
          }
        : null,
    itemEntity: a.item_entity?.trim() || null,
    goalName: a.goal_name?.trim() || null,
    confidence: a.confidence,
  };
}

function toInventoryAction(extraction: GeminiExtraction): InventoryAction {
  const entity = extraction.search_query?.trim() || null;
  const localExpansion = entity ? expandSearchTerms(entity) : [];
  const geminiExpansion = (extraction.expanded_terms ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return {
    intent: extraction.search_intent ?? "search",
    entity,
    category: extraction.search_category?.trim() || null,
    roomPhrase: extraction.room?.trim() || null,
    furniturePhrase: extraction.furniture?.trim() || null,
    expandedTerms: Array.from(new Set([...localExpansion, ...geminiExpansion])),
    confidence: extraction.confidence,
  };
}

function toNluResult(transcript: string, extraction: GeminiExtraction): NluResult {
  if (extraction.domain === "search") {
    return { intent: "inventory", action: toInventoryAction(extraction) };
  }
  if (extraction.domain === "add") {
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
  if (extraction.domain === "vault") {
    const actions = (extraction.vault_actions ?? []).slice(0, 2).map(toVaultAction);
    if (actions.length === 0) return { intent: "unclear", transcript };
    return { intent: "vault", actions };
  }
  return { intent: "unclear", transcript };
}

export async function parseWithGemini(transcript: string, context?: VaultNluContext): Promise<NluResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const contents: { role: string; parts: { text: string }[] }[] = [];
  if (context?.householdGoalNames && context.householdGoalNames.length > 0) {
    contents.push({ role: "user", parts: [{ text: `(context: known household goals: ${context.householdGoalNames.join(", ")})` }] });
  }
  if (context?.lastTransactionSummary) {
    contents.push({ role: "user", parts: [{ text: `(context: ${context.lastTransactionSummary})` }] });
  }
  if (context?.previousTurnSummary) {
    contents.push({ role: "user", parts: [{ text: `(context: previous result — ${context.previousTurnSummary})` }] });
  }
  if (context?.pendingQuestion) {
    contents.push({ role: "model", parts: [{ text: context.pendingQuestion }] });
  }
  contents.push({ role: "user", parts: [{ text: transcript }] });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
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
    if (!parsed || typeof parsed.domain !== "string") return null;

    return toNluResult(transcript, parsed);
  } catch {
    // Network error, timeout, or malformed JSON — silently fall back to rules.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
