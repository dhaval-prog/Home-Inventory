export type VoiceIntent = "search" | "add" | "vault" | "unclear";

export interface ParsedSearchQuery {
  queryRaw: string;
  expandedTerms: string[];
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
  | "help";

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
  confidence: ConfidenceLevel;
}

export type NluResult =
  | { intent: "search"; search: ParsedSearchQuery }
  | { intent: "add"; add: ParsedAddEntities }
  | { intent: "vault"; actions: VaultAction[] }
  | { intent: "unclear"; transcript: string };
