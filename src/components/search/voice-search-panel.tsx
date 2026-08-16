"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VoiceMicButton } from "@/components/search/voice-mic-button";
import { VoiceResultCard } from "@/components/search/voice-result-card";
import { VoiceSlotFollowUp } from "@/components/search/voice-slot-followup";
import { useSpeechRecognition, type VoiceErrorKind } from "@/hooks/use-speech-recognition";
import { listHomes } from "@/lib/actions/browse";
import { listMyHouseholds } from "@/lib/actions/household";
import { createItemFromVoice } from "@/lib/actions/items";
import {
  getDefaultStorageLocation,
  processVoiceCommand,
  resolveVoiceSlot,
  type MissingField,
  type ResolvedLocation,
  type VaultSessionContext,
  type VaultVoiceHistoryRow,
  type VaultVoiceResult,
  type VoiceProcessResult,
} from "@/lib/actions/voice";
import { ITEM_CATEGORIES } from "@/lib/constants";
import type { LocationNode } from "@/lib/location";
import type { Item } from "@/lib/supabase/types";
import { CATEGORY_KEYWORDS } from "@/lib/voice/synonyms";
import type { VaultIntent } from "@/lib/voice/types";

type Phase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "search-results"; query: string; results: { item: Item; path: LocationNode[] }[] }
  | { kind: "no-results"; query: string; suggestedCategory: { value: string; label: string } | null }
  | { kind: "inventory-location"; roomName: string | null; furnitureName: string | null; results: { item: Item; path: LocationNode[] }[] }
  | { kind: "disambiguate"; transcript: string }
  | { kind: "add-flow"; itemName: string | null; location: ResolvedLocation; missingFields: MissingField[] }
  | { kind: "add-confirm"; itemName: string; location: ResolvedLocation }
  | { kind: "saved"; itemName: string }
  | { kind: "vault-result"; intent: VaultIntent; message: string; amount?: number | null; detail?: string }
  | { kind: "vault-history"; message: string; transactions: VaultVoiceHistoryRow[] }
  | { kind: "vault-clarify"; question: string }
  | { kind: "vault-confirm"; message: string }
  | { kind: "vault-disambiguate"; message: string; options: { id: string; label: string }[] }
  | { kind: "error"; message: string; allowRetry: boolean };

// Same-origin channel the vault's 3D scene (public/vault/vault.html) listens
// on to refresh its balance/history immediately after a voice-driven change,
// even though that iframe has no direct access to this React state.
const vaultChannel = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("vault-sync") : null;

const EMPTY_VAULT_SESSION: VaultSessionContext = { lastTransaction: null, pending: null, previousTurnSummary: null };

// A completed action is fire-and-forget by design — the card auto-dismisses
// after a moment; read-only answers/history/questions stay open to be read.
const AUTO_DISMISS_INTENTS = new Set<VaultIntent>([
  "deduct_money",
  "add_money",
  "undo_transaction",
  "delete_transaction",
  "edit_transaction",
  "set_recurring",
  "contribute_household_goal",
]);

const QUICK_PICKS: { label: string; run: string }[] = [
  { label: "Recently added", run: "show me recently added items" },
  { label: "Vault balance", run: "how much do I have" },
  { label: "This month's spending", run: "how much did I spend this month" },
  { label: "My electronics", run: "show me my electronics" },
];

const EXAMPLE_PROMPTS = [
  'Try "where is my passport"',
  'Try "what\'s in my bedroom wardrobe"',
  'Try "I spent 500 on groceries"',
  'Try "how much do I have in my vault"',
  'Try "show me my electronics"',
];

/** Cheap client-side category guess for a no-results query — offers "Search {category}" as an alternative rather than a dead end. Real semantic matching happens server-side via Gemini; this is just a fallback nudge. */
function suggestCategoryFor(query: string): { value: string; label: string } | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  for (const [value, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => words.some((w) => w.includes(k) || k.includes(w)))) {
      const known = ITEM_CATEGORIES.find((c) => c.value === value);
      if (known) return { value: known.value, label: known.label };
    }
  }
  return null;
}

const ERROR_MESSAGES: Record<VoiceErrorKind, string> = {
  "permission-denied": "Microphone access is required to use voice search.",
  "no-speech": "I couldn't understand that. Please try again.",
  "no-mic": "No microphone was found on this device.",
  network: "Voice recognition needs an internet connection. Please try again.",
  unknown: "Something went wrong with voice recognition. Please try again.",
};

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function extractRoomId(pathname: string): string | undefined {
  const m = pathname.match(/^\/home\/rooms\/([^/]+)/);
  return m?.[1];
}

function lightTitleCase(text: string): string {
  return text
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Storage location is never a blocking question here — the server actions
// (resolveAddLocation/resolveVoiceSlot/getDefaultStorageLocation) always
// resolve or auto-create one alongside furniture, so voice add never stalls
// on "which shelf, drawer, or section?".
function recomputeMissing(itemName: string | null, location: ResolvedLocation): MissingField[] {
  const missing: MissingField[] = [];
  if (!itemName) missing.push("itemName");
  if (!location.roomId) missing.push("room");
  else if (!location.furnitureId) missing.push("furniture");
  return missing;
}

function withField(location: ResolvedLocation, field: MissingField, id: string, name: string): ResolvedLocation {
  if (field === "room") return { ...location, roomId: id, roomName: name };
  if (field === "furniture") return { ...location, furnitureId: id, furnitureName: name };
  if (field === "storageLocation") return { ...location, storageLocationId: id, storageLocationName: name };
  return location;
}

export function VoiceSearchPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const speech = useSpeechRecognition();

  const [query, setQuery] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [homeId, setHomeId] = useState<string | undefined>(undefined);
  const [householdId, setHouseholdId] = useState<string | undefined>(undefined);
  const [vaultSession, setVaultSession] = useState<VaultSessionContext>(EMPTY_VAULT_SESSION);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    listHomes().then((homes) => setHomeId(homes[0]?.id));
    // Defaults to the user's first household membership — explicit multi-household
    // selection for voice/text happens via the /household page switcher.
    listMyHouseholds().then((memberships) => setHouseholdId(memberships[0]?.household.id));
  }, [open]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({ kind: "idle" });
      setQuery("");
      setVaultSession(EMPTY_VAULT_SESSION);
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!speech.error) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase({ kind: "error", message: ERROR_MESSAGES[speech.error], allowRetry: speech.error !== "no-mic" });
  }, [speech.error]);

  // Typed queries run through the same NLU pipeline as voice: a short
  // typing-pause debounce (only once the panel is idle and the query is
  // non-trivial) triggers runCommand, exactly like Enter or a spoken
  // transcript would.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (phase.kind !== "idle" || query.trim().length < 3) return;
    debounceRef.current = setTimeout(() => {
      runCommand(query.trim());
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // A short rotating list of example prompts while the panel sits idle and
  // empty — gives new users a feel for what they can ask without a dead
  // "type to search" placeholder being the only guidance.
  useEffect(() => {
    if (!open || phase.kind !== "idle" || query.trim()) return;
    const timer = setInterval(() => setPromptIndex((i) => (i + 1) % EXAMPLE_PROMPTS.length), 3000);
    return () => clearInterval(timer);
  }, [open, phase.kind, query]);

  function goToSearchPage(term: string) {
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  function applyVaultResult(result: VaultVoiceResult) {
    if (result.kind === "vault-executed") {
      setVaultSession({
        lastTransaction: result.transactionId
          ? {
              id: result.transactionId,
              type: result.intent === "deduct_money" ? "deduct" : result.intent === "add_money" ? "add" : "recurring",
              amount: result.amount ?? 0,
              category: result.category ?? null,
              comment: result.comment ?? null,
            }
          : null,
        pending: null,
        previousTurnSummary: result.message,
      });
      setPhase({ kind: "vault-result", intent: result.intent, message: result.message, amount: result.amount });
      const isDeduct = result.intent === "deduct_money" || result.intent === "delete_transaction" || result.intent === "undo_transaction";
      toast[isDeduct ? "success" : "success"](result.message);
      vaultChannel?.postMessage({ type: "vault-sync" });
      return;
    }
    if (result.kind === "vault-answer") {
      setVaultSession((s) => ({ ...s, pending: null, previousTurnSummary: result.message }));
      setPhase({ kind: "vault-result", intent: result.intent, message: result.message, amount: result.amount, detail: result.detail });
      return;
    }
    if (result.kind === "vault-history") {
      setVaultSession((s) => ({ ...s, pending: null, previousTurnSummary: result.message }));
      setPhase({ kind: "vault-history", message: result.message, transactions: result.transactions });
      return;
    }
    if (result.kind === "vault-clarify") {
      setVaultSession((s) => ({ ...s, pending: { kind: result.pendingKind, action: result.pendingAction } }));
      setPhase({ kind: "vault-clarify", question: result.question });
      return;
    }
    if (result.kind === "vault-confirm") {
      setVaultSession((s) => ({ ...s, pending: { kind: result.pendingKind, action: result.pendingAction } }));
      setPhase({ kind: "vault-confirm", message: result.message });
      return;
    }
    if (result.kind === "vault-disambiguate") {
      setVaultSession((s) => ({
        ...s,
        pending: { kind: result.pendingKind, action: result.pendingAction, options: result.options },
      }));
      setPhase({ kind: "vault-disambiguate", message: result.message, options: result.options });
      return;
    }
    // vault-error
    setVaultSession((s) => ({ ...s, pending: null }));
    toast.error(result.message);
    setPhase({ kind: "error", message: result.message, allowRetry: true });
  }

  function applyResult(result: VoiceProcessResult) {
    if (result.kind === "search") {
      setVaultSession((s) => ({ ...s, previousTurnSummary: result.summary }));
      setPhase(
        result.results.length > 0
          ? { kind: "search-results", query: result.query, results: result.results }
          : { kind: "no-results", query: result.query, suggestedCategory: suggestCategoryFor(result.query) }
      );
    } else if (result.kind === "inventory-location") {
      setVaultSession((s) => ({ ...s, previousTurnSummary: result.summary }));
      setPhase({ kind: "inventory-location", roomName: result.roomName, furnitureName: result.furnitureName, results: result.results });
    } else if (result.kind === "add") {
      const missing = recomputeMissing(result.itemName, result.location);
      setPhase(
        missing.length === 0 && result.itemName
          ? { kind: "add-confirm", itemName: result.itemName, location: result.location }
          : { kind: "add-flow", itemName: result.itemName, location: result.location, missingFields: missing }
      );
    } else if (result.kind === "unclear") {
      setPhase({ kind: "disambiguate", transcript: result.transcript });
    } else {
      applyVaultResult(result);
    }
  }

  // A completed voice transaction is fire-and-forget by design (no
  // confirmation step) — a brief card plus the toast above is enough, then
  // it gets out of the way. Answers/history/questions stay open to be read.
  useEffect(() => {
    if (phase.kind !== "vault-result") return;
    if (!AUTO_DISMISS_INTENTS.has(phase.intent)) return;
    const timer = setTimeout(() => onOpenChange(false), 1800);
    return () => clearTimeout(timer);
  }, [phase, onOpenChange]);

  async function runCommand(transcript: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPhase({ kind: "processing" });
    try {
      const result = await processVoiceCommand(transcript, { roomId: extractRoomId(pathname), vaultSession, householdId });
      applyResult(result);
    } catch {
      setPhase({ kind: "error", message: "Something went wrong processing that. Please try again.", allowRetry: true });
    }
  }

  function startMainRecording() {
    setQuery("");
    speech.start((transcript) => {
      setQuery(transcript);
      runCommand(transcript);
    });
  }

  async function submitItemNameAnswer(current: Extract<Phase, { kind: "add-flow" }>, name: string) {
    const cleaned = lightTitleCase(name);
    const missing = recomputeMissing(cleaned, current.location);
    setPhase(
      missing.length === 0
        ? { kind: "add-confirm", itemName: cleaned, location: current.location }
        : { kind: "add-flow", itemName: cleaned, location: current.location, missingFields: missing }
    );
  }

  async function submitSlotPhrase(current: Extract<Phase, { kind: "add-flow" }>, field: MissingField, phrase: string) {
    if (field === "itemName") {
      submitItemNameAnswer(current, phrase);
      return;
    }
    setPhase({ kind: "processing" });
    const resolved = await resolveVoiceSlot(field, phrase, {
      roomId: current.location.roomId ?? undefined,
      furnitureId: current.location.furnitureId ?? undefined,
    });
    if (!resolved) {
      setPhase({
        kind: "error",
        message: `I couldn't match that to one of your ${field === "room" ? "rooms" : field === "furniture" ? "furniture" : "storage locations"}. Try again or pick from the list.`,
        allowRetry: true,
      });
      return;
    }
    await applySlotResolution(current, field, resolved.id, resolved.name);
  }

  async function applySlotResolution(
    current: Extract<Phase, { kind: "add-flow" }>,
    field: MissingField,
    id: string,
    name: string
  ) {
    let newLocation = withField(current.location, field, id, name);
    // Resolving furniture never leaves storage unset — it's the one field
    // voice add always defaults rather than asking about (matches
    // resolveAddLocation's behavior for the initial command).
    if (field === "furniture") {
      const storage = await getDefaultStorageLocation(id);
      if (storage) newLocation = withField(newLocation, "storageLocation", storage.id, storage.name);
    }
    const missing = recomputeMissing(current.itemName, newLocation);
    setPhase(
      missing.length === 0 && current.itemName
        ? { kind: "add-confirm", itemName: current.itemName, location: newLocation }
        : { kind: "add-flow", itemName: current.itemName, location: newLocation, missingFields: missing }
    );
  }

  async function handleSave(current: Extract<Phase, { kind: "add-confirm" }>) {
    setPhase({ kind: "processing" });
    const result = await createItemFromVoice({
      name: current.itemName,
      storageLocationId: current.location.storageLocationId!,
      roomId: current.location.roomId!,
      furnitureId: current.location.furnitureId!,
    });
    if ("error" in result) {
      setPhase({ kind: "error", message: result.error, allowRetry: false });
      return;
    }
    router.refresh();
    setPhase({ kind: "saved", itemName: current.itemName });
  }

  function handleEdit(current: Extract<Phase, { kind: "add-confirm" }>) {
    const params = new URLSearchParams();
    if (current.location.roomId) params.set("roomId", current.location.roomId);
    if (current.location.furnitureId) params.set("furnitureId", current.location.furnitureId);
    if (current.location.storageLocationId) params.set("storageLocationId", current.location.storageLocationId);
    params.set("name", current.itemName);
    onOpenChange(false);
    router.push(`/items/new?${params.toString()}`);
  }

  function cancelPending() {
    setVaultSession((s) => ({ ...s, pending: null }));
    setPhase({ kind: "idle" });
  }

  const isVaultFollowUp = phase.kind === "vault-clarify" || phase.kind === "vault-confirm" || phase.kind === "vault-disambiguate";
  const showListeningTakeover = speech.isListening && phase.kind !== "add-flow";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-8 flex max-h-[80vh] w-[calc(100%-2rem)] max-w-lg translate-y-0 flex-col overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="flex items-center gap-2 border-b p-3">
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="size-4" />
          </Button>

          {showListeningTakeover ? (
            <div className="flex flex-1 items-center gap-2 text-sm">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-rose-500" />
              <span className="font-medium text-rose-600">Listening…</span>
              <span className="truncate text-muted-foreground">{speech.transcript}</span>
            </div>
          ) : isVaultFollowUp ? (
            <div className="flex-1 text-sm font-medium">Vault Assistant</div>
          ) : (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPhase({ kind: "idle" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) runCommand(query.trim());
                }}
                placeholder="Search your home…"
                className="pl-9 pr-8"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}

          {speech.isSupported && phase.kind !== "add-flow" && (
            <VoiceMicButton
              isListening={speech.isListening}
              onClick={() => (speech.isListening ? speech.stop() : startMainRecording())}
              size="sm"
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {phase.kind === "idle" && (
            <div className="space-y-4">
              <p className="px-1 pt-2 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? "Keep typing, press Enter, or tap the mic…"
                  : speech.isSupported
                    ? EXAMPLE_PROMPTS[promptIndex]
                    : "Type to search. Voice search isn't available in this browser."}
              </p>
              {!query.trim() && (
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_PICKS.map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => runCommand(qp.run)}
                      className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="text-center">
                <button
                  onClick={() => goToSearchPage(query.trim())}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Browse all in Search →
                </button>
              </div>
            </div>
          )}

          {phase.kind === "processing" && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              One moment…
            </div>
          )}

          {phase.kind === "search-results" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {phase.results.length} result{phase.results.length === 1 ? "" : "s"} found
              </p>
              <div className="space-y-2">
                {phase.results.map(({ item, path }) => (
                  <VoiceResultCard key={item.id} item={item} path={path} onNavigate={() => onOpenChange(false)} />
                ))}
              </div>
            </div>
          )}

          {phase.kind === "no-results" && (
            <div className="space-y-3 py-4 text-center">
              <p className="text-sm">
                We couldn&apos;t find <span className="font-medium">&ldquo;{phase.query}&rdquo;</span>.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {phase.suggestedCategory && (
                  <Button size="sm" onClick={() => runCommand(`show me my ${phase.suggestedCategory!.label.toLowerCase()}`)}>
                    Search {phase.suggestedCategory.label}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => runCommand("show me recently added items")}>
                  Recently added
                </Button>
                {speech.isSupported && (
                  <Button size="sm" variant="outline" onClick={startMainRecording}>
                    🎙️ Try again
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => goToSearchPage(phase.query)}>
                  Search manually
                </Button>
              </div>
            </div>
          )}

          {phase.kind === "inventory-location" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {[phase.roomName, phase.furnitureName].filter(Boolean).join(" → ") || "That location"} — {phase.results.length} item
                {phase.results.length === 1 ? "" : "s"}
              </p>
              <div className="space-y-2">
                {phase.results.map(({ item, path }) => (
                  <VoiceResultCard key={item.id} item={item} path={path} onNavigate={() => onOpenChange(false)} />
                ))}
                {phase.results.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing found there yet.</p>}
              </div>
            </div>
          )}

          {phase.kind === "disambiguate" && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">I&apos;m not sure if you want to search or add. You said:</p>
              <p className="font-medium">&ldquo;{phase.transcript}&rdquo;</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button size="sm" onClick={() => runCommand(`find ${phase.transcript}`)}>
                  🔍 Search for it
                </Button>
                <Button size="sm" variant="outline" onClick={() => runCommand(`add ${phase.transcript}`)}>
                  ➕ Add as new item
                </Button>
              </div>
            </div>
          )}

          {phase.kind === "add-flow" && (
            <VoiceSlotFollowUp
              field={phase.missingFields[0]}
              homeId={homeId}
              parentRoomId={phase.location.roomId ?? undefined}
              parentFurnitureId={phase.location.furnitureId ?? undefined}
              isListening={speech.isListening}
              liveTranscript={speech.transcript}
              onMicClick={() => speech.start((t) => submitSlotPhrase(phase, phase.missingFields[0], t))}
              onSubmitText={(t) => submitSlotPhrase(phase, phase.missingFields[0], t)}
              onSelectOption={(opt) => applySlotResolution(phase, phase.missingFields[0], opt.id, opt.name)}
            />
          )}

          {phase.kind === "add-confirm" && (
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Confirm New Item</p>
                <p className="mt-1 text-lg font-semibold">{phase.itemName}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p>{phase.location.roomName}</p>
                <p className="text-muted-foreground">→ {phase.location.furnitureName}</p>
                <p className="text-muted-foreground">→ {phase.location.storageLocationName}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => handleSave(phase)}>
                  Confirm & Save
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleEdit(phase)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phase.kind === "saved" && (
            <div className="space-y-3 rounded-xl border bg-card p-6 text-center">
              <Check className="mx-auto size-8 text-emerald-500" />
              <p className="font-semibold">&ldquo;{phase.itemName}&rdquo; added to your inventory.</p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}

          {phase.kind === "vault-result" && (
            <div className="space-y-1.5 rounded-xl border bg-card p-6 text-center">
              {phase.amount != null && (
                <p className={`text-2xl font-semibold ${phase.intent === "deduct_money" ? "text-rose-600" : "text-emerald-600"}`}>
                  {phase.intent === "deduct_money" ? "− " : phase.intent === "add_money" || phase.intent === "contribute_household_goal" ? "+ " : ""}
                  {inr(phase.amount)}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{phase.message}</p>
              {phase.detail && <p className="text-xs text-muted-foreground">{phase.detail}</p>}
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}

          {phase.kind === "vault-history" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{phase.message}</p>
              <div className="space-y-2">
                {phase.transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{t.category ?? (t.type === "deduct" ? "Deducted" : t.type === "add" ? "Added" : "Recurring")}</p>
                      {t.comment && <p className="text-xs text-muted-foreground">{t.comment}</p>}
                    </div>
                    <span className={t.type === "deduct" ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>
                      {t.type === "deduct" ? "− " : "+ "}
                      {inr(t.amount)}
                    </span>
                  </div>
                ))}
                {phase.transactions.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No transactions found.</p>}
              </div>
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {phase.kind === "vault-clarify" && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium">{phase.question}</p>
              <p className="text-xs text-muted-foreground">
                {speech.isListening ? speech.transcript || "Listening…" : "Tap the mic to answer, or type below."}
              </p>
              <VaultTextReply onSubmit={runCommand} onCancel={cancelPending} />
            </div>
          )}

          {phase.kind === "vault-confirm" && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium">{phase.message}</p>
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={() => runCommand("yes")}>
                  Yes, continue
                </Button>
                <Button size="sm" variant="outline" onClick={() => runCommand("no")}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phase.kind === "vault-disambiguate" && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <p className="text-center text-sm font-medium">{phase.message}</p>
              <div className="space-y-2">
                {phase.options.map((opt, i) => (
                  <button
                    key={opt.id}
                    onClick={() => runCommand(opt.label)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-center">
                <Button variant="ghost" size="sm" onClick={cancelPending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phase.kind === "error" && (
            <div className="space-y-3 rounded-xl border bg-destructive/10 p-4 text-center">
              <p className="text-sm text-destructive">{phase.message}</p>
              <div className="flex justify-center gap-2">
                {phase.allowRetry && speech.isSupported && (
                  <Button size="sm" onClick={startMainRecording}>
                    Try Again
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setPhase({ kind: "idle" })}>
                  Type Instead
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Minimal typed-reply fallback for vault follow-up questions (the mic already answers via the header's shared mic button). */
function VaultTextReply({ onSubmit, onCancel }: { onSubmit: (text: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue("");
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Type your answer…" className="flex-1" autoFocus />
      <Button type="submit" size="sm">
        Send
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
