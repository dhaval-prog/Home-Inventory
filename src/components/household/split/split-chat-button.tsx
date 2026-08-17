"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  listSplitMessages,
  type SplitChatMessageWithSender,
} from "@/lib/actions/split-chat";
import { SplitChatPanel } from "@/components/household/split/split-chat-panel";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";

/**
 * The "obvious entry point" into Split Chat (spec §6) — a lightweight button
 * that slides in the same group-scoped chat used everywhere else, native to
 * the existing Home + Vault sheet/dialog language rather than a separate
 * messaging surface.
 */
export function SplitChatButton({
  householdId,
  groupId,
  currentUserId,
  members,
}: {
  householdId: string;
  groupId: string;
  currentUserId: string;
  members: HouseholdMemberLite[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SplitChatMessageWithSender[] | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    listSplitMessages(groupId).then(setMessages);
  }, [open, groupId]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <MessageCircle className="size-4" />
        Split Chat
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>💬 Split Chat</SheetTitle>
          </SheetHeader>
          {messages ? (
            <SplitChatPanel
              householdId={householdId}
              groupId={groupId}
              currentUserId={currentUserId}
              members={members}
              initialMessages={messages}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
