export type VoiceIntent = "search" | "add" | "deduct" | "unclear";

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

export interface ParsedDeductEntities {
  /** null means a deduction was clearly intended but no confident amount was heard. */
  amount: number | null;
  category: VaultCategory | null;
  comment: string | null;
}

export type NluResult =
  | { intent: "search"; search: ParsedSearchQuery }
  | { intent: "add"; add: ParsedAddEntities }
  | { intent: "deduct"; deduct: ParsedDeductEntities }
  | { intent: "unclear"; transcript: string };
