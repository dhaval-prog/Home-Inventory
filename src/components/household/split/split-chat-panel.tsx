"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import {
  sendSplitMessage,
  listSplitMessages,
  editSplitMessage,
  deleteSplitMessage,
  type SplitChatMessageWithSender,
} from "@/lib/actions/split-chat";
import { AddExpenseDialog } from "@/components/household/split/add-expense-dialog";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";

const POLL_MS = 4000;

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ExpenseSuggestionChip({
  householdId,
  members,
  currentUserId,
  description,
  amount,
}: {
  householdId: string;
  members: HouseholdMemberLite[];
  currentUserId: string;
  description: string;
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const perPerson = members.length > 0 ? amount / members.length : amount;

  if (done) {
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        ✓ Expense added — {description}
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
      <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        💡 {description} — {inr(amount)}, split between {members.length} member
        {members.length === 1 ? "" : "s"} ({inr(perPerson)} each)
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        Review &amp; Add
      </Button>
      <AddExpenseDialog
        householdId={householdId}
        members={members}
        currentUserId={currentUserId}
        open={open}
        onOpenChange={setOpen}
        prefill={{
          description,
          amount: String(amount),
          splitMethod: "equal",
          participantIds: members.map((m) => m.userId),
        }}
        onCreated={() => setDone(true)}
      />
    </div>
  );
}

function ChatBubble({
  message,
  isMine,
  householdId,
  members,
  currentUserId,
  onChanged,
}: {
  message: SplitChatMessageWithSender;
  isMine: boolean;
  householdId: string;
  members: HouseholdMemberLite[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (message.kind === "system") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
          {message.message}
        </p>
      </div>
    );
  }

  const suggestion =
    message.metadata?.type === "suggest_expense"
      ? (message.metadata as { description: string; amount: number })
      : null;

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
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              <X className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              disabled={pending || !draft.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await editSplitMessage(message.id, draft);
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
      <div
        className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col`}
      >
        {!isMine && (
          <p className="mb-0.5 text-xs text-muted-foreground">
            {message.senderName}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {isMine && message.editable && (
            <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-6"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteSplitMessage(message.id);
                    if (!("error" in result)) onChanged();
                  })
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
          <div
            className={`rounded-2xl px-3.5 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {message.message}
          </div>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatTime(message.created_at)}
          {message.edited_at && " · edited"}
        </p>
        {suggestion && (
          <ExpenseSuggestionChip
            householdId={householdId}
            members={members}
            currentUserId={currentUserId}
            description={suggestion.description}
            amount={suggestion.amount}
          />
        )}
      </div>
    </div>
  );
}

/** Split Chat's message list + composer — same visual language as Home Chat (ChatPanel), scoped to one split group instead of the whole household. Fills the height of whatever container renders it (see SplitChatButton's Sheet). */
export function SplitChatPanel({
  householdId,
  groupId,
  currentUserId,
  members,
  initialMessages,
}: {
  householdId: string;
  groupId: string;
  currentUserId: string;
  members: HouseholdMemberLite[];
  initialMessages: SplitChatMessageWithSender[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const fresh = await listSplitMessages(groupId);
    setMessages(fresh);
  }

  useEffect(() => {
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

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
      const result = await sendSplitMessage(groupId, trimmed);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Talk expenses and settlements here — try &ldquo;I paid the
            electricity bill, ₹4,500, split between all of us&rdquo; and
            I&rsquo;ll offer to add it.
          </p>
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              isMine={m.user_id === currentUserId}
              householdId={householdId}
              members={members}
              currentUserId={currentUserId}
              onChanged={refresh}
            />
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
            placeholder="Message this split group…"
          />
          <Button size="icon" disabled={!canSend} onClick={handleSend}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
