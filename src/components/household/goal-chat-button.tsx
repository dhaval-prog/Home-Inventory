"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listGoalMessages, type GoalChatMessageWithSender } from "@/lib/actions/household-goal-chat";
import { GoalChatPanel } from "@/components/household/goal-chat-panel";

/** The "Goal Chat" entry point inside a goal's detail sheet — the New Goal mirror of SplitChatButton. */
export function GoalChatButton({ goalId, currentUserId }: { goalId: string; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GoalChatMessageWithSender[] | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    listGoalMessages(goalId).then(setMessages);
  }, [open, goalId]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <MessageCircle className="size-4" />
        Goal Chat
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>💬 Goal Chat</SheetTitle>
          </SheetHeader>
          {messages ? (
            <GoalChatPanel goalId={goalId} currentUserId={currentUserId} initialMessages={messages} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
