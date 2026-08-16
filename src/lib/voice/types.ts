/**
 * The home-inventory (physical item) side of the assistant's intent
 * taxonomy — mirrors VaultIntent below. Several of the spec's named intents
 * are the same underlying lookup with different filters: "search" and
 * "item_details" both resolve to a scored item list (item_details usually
 * narrows to one clear match), "location_search" lists everything under a
 * named room/furniture, "category_search" filters by item.category, and
 * "recently_added" is a plain recency-ordered list.
 */
export type InventoryIntent = "search" | "item_details" | "location_search" | "category_search" | "recently_added";

export interface InventoryAction {
  intent: InventoryIntent;
  /** Cleaned entity phrase, e.g. "passport", "TV" — filler words stripped. */
  entity: string | null;
  /** For category_search — a category name/synonym as spoken. */
  category: string | null;
  roomPhrase: string | null;
  furniturePhrase: string | null;
  /** Gemini's own synonym/brand-name expansion (e.g. "Bravia" -> ["tv", "television"]); merged with the local expandSearchTerms dictionary downstream. */
  expandedTerms: string[];
  confidence: ConfidenceLevel;
}

export interface ParsedAddEntities {
  itemNameRaw: string | null;
  roomPhrase: string | null;
  furniturePhrase: string | null;
  storagePhrase: string | null;
}

export const VAULT_CATEGORIES = [
  "Groceries",
  "New Clothes",
  "Food",
  "Shopping",
  "Bills",
  "Travel",
  "Entertainment",
  "Medical",
  "Other",
] as const;
export type VaultCategory = (typeof VAULT_CATEGORIES)[number];

/**
 * The vault assistant's full intent taxonomy. Several of the spec's named
 * intents collapse into one here because they're the same underlying
 * operation with different filters (e.g. SEARCH_SPENDING /
 * CHECK_CATEGORY_SPENDING / CHECK_TIME_PERIOD_SPENDING are all
 * "check_spending" with optional category/date filters).
 */
export type VaultIntent =
  | "add_money"
  | "deduct_money"
  | "check_balance"
  | "check_total_saved"
  | "check_spending"
  | "view_history"
  | "undo_transaction"
  | "edit_transaction"
  | "delete_transaction"
  | "set_recurring"
  | "vault_insight"
  | "help"
  | "check_household_balance"
  | "contribute_household_goal";

export type ConfidenceLevel = "high" | "medium" | "low";

export type VaultTxnKind = "add" | "deduct" | "recurring";

/**
 * A natural-language pointer at an existing transaction — "that", "the last
 * deduction", "the grocery transaction from today". Resolved against real
 * ledger rows (plus in-session memory of the last voice transaction) by the
 * context-resolution stage, never guessed.
 */
export interface TransactionReference {
  ordinal: "last" | null;
  kind: VaultTxnKind | null;
  category: VaultCategory | null;
  datePhrase: string | null;
}

export interface RecurringEntities {
  amount: number | null;
  scheduleMode: "salary" | "date" | null;
  dayOfMonth: number | null;
  enabled: boolean | null;
}

export interface VaultAction {
  intent: VaultIntent;
  amount: number | null;
  category: VaultCategory | null;
  comment: string | null;
  /** Raw natural date phrase (e.g. "last month") — resolved via parseDateRange downstream. */
  datePhrase: string | null;
  reference: TransactionReference | null;
  /** For edit_transaction — the replacement values; null fields mean "leave unchanged". */
  newAmount: number | null;
  newCategory: VaultCategory | null;
  recurring: RecurringEntities | null;
  /** Combined vault+inventory query — a physical item named alongside a money question, e.g. "how much did I spend on the TV?". Resolved read-only against inventory; never creates or edits an item. */
  itemEntity: string | null;
  /** For check_household_balance/contribute_household_goal — the goal name as spoken (e.g. "vacation fund"), fuzzy-matched against the active household's real goals downstream. Null for check_household_balance means "the household's total shared savings," not any one goal. */
  goalName: string | null;
  confidence: ConfidenceLevel;
}

export type NluResult =
  | { intent: "inventory"; action: InventoryAction }
  | { intent: "add"; add: ParsedAddEntities }
  | { intent: "vault"; actions: VaultAction[] }
  | { intent: "unclear"; transcript: string };
