"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteHome } from "@/lib/actions/homes";

export function DeleteHomeDialog({
  homeId,
  homeName,
  roomCount,
}: {
  homeId: string;
  homeName: string;
  roomCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const canDelete = confirmText.trim() === homeName;

  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        Delete Home
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{homeName}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently deletes this home along with all {roomCount} room{roomCount === 1 ? "" : "s"}, every
            piece of furniture, every storage location, and every item inside it. This can&apos;t be undone.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-home-name">
              Type <span className="font-semibold text-foreground">{homeName}</span> to confirm
            </Label>
            <Input id="confirm-home-name" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canDelete || pending}
              onClick={() => startTransition(() => deleteHome(homeId))}
            >
              <Trash2 className="size-4" />
              Delete Home
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
