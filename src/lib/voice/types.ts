export type VoiceIntent = "search" | "add" | "unclear";

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

export type NluResult =
  | { intent: "search"; search: ParsedSearchQuery }
  | { intent: "add"; add: ParsedAddEntities }
  | { intent: "unclear"; transcript: string };
