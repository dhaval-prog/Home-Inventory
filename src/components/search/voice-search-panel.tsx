"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Search, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VoiceMicButton } from "@/components/search/voice-mic-button";
import { VoiceResultCard } from "@/components/search/voice-result-card";
import { VoiceSlotFollowUp } from "@/components/search/voice-slot-followup";
import { useSpeechRecognition, type VoiceErrorKind } from "@/hooks/use-speech-recognition";
import { searchSuggestions } from "@/lib/actions/search";
import { listHomes } from "@/lib/actions/browse";
import { createItemFromVoice } from "@/lib/actions/items";
import {
  getDefaultStorageLocation,
  processVoiceCommand,
  resolveVoiceSlot,
  type MissingField,
  type ResolvedLocation,
  type VoiceProcessResult,
} from "@/lib/actions/voice";
import type { LocationNode } from "@/lib/location";
import type { Item } from "@/lib/supabase/types";

type Phase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "search-results"; query: string; results: { item: Item; path: LocationNode[] }[] }
  | { kind: "no-results"; query: string }
  | { kind: "disambiguate"; transcript: string }
  | { kind: "add-flow"; itemName: string | null; location: ResolvedLocation; missingFields: MissingField[] }
  | { kind: "add-confirm"; itemName: string; location: ResolvedLocation }
  | { kind: "saved"; itemName: string }
  | { kind: "error"; message: string; allowRetry: boolean };

const ERROR_MESSAGES: Record<VoiceErrorKind, string> = {
  "permission-denied": "Microphone access is required to use voice search.",
  "no-speech": "I couldn't understand that. Please try again.",
  "no-mic": "No microphone was found on this device.",
  network: "Voice recognition needs an internet connection. Please try again.",
  unknown: "Something went wrong with voice recognition. Please try again.",
};

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [homeId, setHomeId] = useState<string | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    listHomes().then((homes) => setHomeId(homes[0]?.id));
  }, [open]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({ kind: "idle" });
      setQuery("");
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!speech.error) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase({ kind: "error", message: ERROR_MESSAGES[speech.error], allowRetry: speech.error !== "no-mic" });
  }, [speech.error]);

  // Typed-search suggestions — identical debounced behavior to the original
  // header search, untouched by the voice/NLU pipeline.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || phase.kind !== "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchSuggestions(query).then(setSuggestions);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function goToSearchPage(term: string) {
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  function applyResult(result: VoiceProcessResult) {
    if (result.kind === "search") {
      setPhase(
        result.results.length > 0
          ? { kind: "search-results", query: result.query, results: result.results }
          : { kind: "no-results", query: result.query }
      );
    } else if (result.kind === "add") {
      const missing = recomputeMissing(result.itemName, result.location);
      setPhase(
        missing.length === 0 && result.itemName
          ? { kind: "add-confirm", itemName: result.itemName, location: result.location }
          : { kind: "add-flow", itemName: result.itemName, location: result.location, missingFields: missing }
      );
    } else {
      setPhase({ kind: "disambiguate", transcript: result.transcript });
    }
  }

  async function runCommand(transcript: string) {
    setPhase({ kind: "processing" });
    try {
      const result = await processVoiceCommand(transcript, { roomId: extractRoomId(pathname) });
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
                  if (e.key === "Enter" && query.trim()) goToSearchPage(query.trim());
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
            <>
              {suggestions.length > 0 ? (
                <div className="space-y-0.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => goToSearchPage(s)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Search className="size-3.5 text-muted-foreground" />
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  {speech.isSupported
                    ? "Type to search, or tap the mic to search or add an item by voice."
                    : "Type to search. Voice search isn't available in this browser."}
                </p>
              )}
            </>
          )}

          {phase.kind === "processing" && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Searching your home…
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
