"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VoiceMicButton } from "@/components/search/voice-mic-button";
import { listFurniture, listRooms, listStorageLocations } from "@/lib/actions/browse";
import type { MissingField } from "@/lib/actions/voice";

const QUESTIONS: Record<MissingField, string> = {
  itemName: "What would you like to add?",
  room: "Which room is it in?",
  furniture: "Which furniture?",
  storageLocation: "Which shelf, drawer, or section?",
};

interface Option {
  id: string;
  name: string;
}

/**
 * One step of the conversational add flow — the user can answer by speaking
 * (mic), typing, or picking directly from a dropdown of their real rooms/
 * furniture/storage locations (section 9: "speak, type, or select manually").
 */
export function VoiceSlotFollowUp({
  field,
  homeId,
  parentRoomId,
  parentFurnitureId,
  isListening,
  liveTranscript,
  onMicClick,
  onSubmitText,
  onSelectOption,
}: {
  field: MissingField;
  homeId?: string;
  parentRoomId?: string;
  parentFurnitureId?: string;
  isListening: boolean;
  liveTranscript: string;
  onMicClick: () => void;
  onSubmitText: (text: string) => void;
  onSelectOption: (option: Option) => void;
}) {
  const [typed, setTyped] = useState("");
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (field === "room" && homeId) {
        const data = await listRooms(homeId);
        if (!cancelled) setOptions(data);
      } else if (field === "furniture" && parentRoomId) {
        const data = await listFurniture(parentRoomId);
        if (!cancelled) setOptions(data);
      } else if (field === "storageLocation" && parentFurnitureId) {
        const data = await listStorageLocations(parentFurnitureId);
        if (!cancelled) setOptions(data);
      } else {
        setOptions([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [field, homeId, parentRoomId, parentFurnitureId]);

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <p className="text-sm font-medium">{QUESTIONS[field]}</p>

      <div className="flex items-center gap-2">
        <VoiceMicButton isListening={isListening} onClick={onMicClick} size="sm" />
        <div className="flex-1 text-sm text-muted-foreground">
          {isListening ? liveTranscript || "Listening…" : "Tap to speak your answer"}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) {
            onSubmitText(typed.trim());
            setTyped("");
          }
        }}
        className="flex gap-2"
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type your answer…"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={!typed.trim()}>
          Submit
        </Button>
      </form>

      {options.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Or select directly:</p>
          <Select
            onValueChange={(id) => {
              const opt = options.find((o) => o.id === id);
              if (opt) onSelectOption(opt);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{() => "Choose…"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
