"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import {
  sendHouseholdMessage,
  listHouseholdMessages,
  markHouseholdChatSeen,
  editHouseholdMessage,
  deleteHouseholdMessage,
  type HouseholdChatMessageWithSender,
} from "@/lib/actions/household-chat";
import { createGoal } from "@/lib/actions/household-goals";

const POLL_MS = 4000;

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function GoalSuggestionChip({ householdId, name, targetAmount }: { householdId: string; name: string; targetAmount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <p className="mt-1.5 text-xs text-muted-foreground">✓ Goal created — {name}</p>;
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
      <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        Save {inr(targetAmount)} for {name}?
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto h-7 text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createGoal(householdId, { name, targetAmount });
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setDone(true);
            router.refresh();
          })
        }
      >
        Create Goal
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ChatBubble({
  message,
  isMine,
  householdId,
  onChanged,
}: {
  message: HouseholdChatMessageWithSender;
  isMine: boolean;
  householdId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (message.kind === "system") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">{message.message}</p>
      </div>
    );
  }

  const suggestion =
    message.metadata?.type === "suggest_goal" ? (message.metadata as { name: string; target_amount: number }) : null;

  if (editing) {
    return (
      <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
        <div className="flex max-w-[75%] flex-1 flex-col items-end gap-1.5">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-1.5">
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              disabled={pending || !draft.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await editHouseholdMessage(message.id, draft);
                  if ("error" in result) {
                    setError(result.error);
                    return;
                  }
                  setEditing(false);
                  onChanged();
                })
              }
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      {!isMine && (
        <Avatar size="sm" className="mt-0.5 shrink-0">
          <AvatarFallback>{initials(message.senderName)}</AvatarFallback>
        </Avatar>
      )}
      <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        {!isMine && <p className="mb-0.5 text-xs text-muted-foreground">{message.senderName}</p>}
        <div className="flex items-center gap-1.5">
          {isMine && message.editable && (
            <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button size="icon-sm" variant="ghost" className="size-6" onClick={() => setEditing(true)}>
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteHouseholdMessage(message.id);
                    if (!("error" in result)) onChanged();
                  })
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
          <div className={`rounded-2xl px-3.5 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {message.message}
          </div>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatTime(message.created_at)}
          {message.edited_at && " · edited"}
          {isMine && message.seenByOthers && message.seenAt && ` · Seen ${formatTime(message.seenAt)}`}
        </p>
        {suggestion && <GoalSuggestionChip householdId={householdId} name={suggestion.name} targetAmount={suggestion.target_amount} />}
      </div>
    </div>
  );
}

export function ChatPanel({
  householdId,
  currentUserId,
  initialMessages,
}: {
  householdId: string;
  currentUserId: string;
  initialMessages: HouseholdChatMessageWithSender[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    await markHouseholdChatSeen(householdId);
    const fresh = await listHouseholdMessages(householdId);
    setMessages(fresh);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const canSend = text.trim().length > 0 && !pending;

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    setError(null);
    startTransition(async () => {
      const result = await sendHouseholdMessage(householdId, trimmed);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="flex h-[32rem] flex-col rounded-2xl border bg-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Say hello, or try &ldquo;we should save ₹45,000 for a fridge&rdquo; — I&rsquo;ll help turn it into a goal.
          </p>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} message={m} isMine={m.user_id === currentUserId} householdId={householdId} onChanged={refresh} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3">
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message your household…"
          />
          <Button size="icon" disabled={!canSend} onClick={handleSend}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
