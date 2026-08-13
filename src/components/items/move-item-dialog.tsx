"use client";

import { useState, useTransition } from "react";
import { MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LocationPicker } from "@/components/items/location-picker";
import { moveItem } from "@/lib/actions/items";

export function MoveItemDialog({
  itemId,
  currentHomeId,
  currentRoomId,
  currentFurnitureId,
  currentStorageLocationId,
}: {
  itemId: string;
  currentHomeId: string;
  currentRoomId: string;
  currentFurnitureId: string;
  currentStorageLocationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ storageLocationId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <MoveRight className="size-4" />
            Move
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move item</DialogTitle>
        </DialogHeader>
        <LocationPicker
          initialHomeId={currentHomeId}
          initialRoomId={currentRoomId}
          initialFurnitureId={currentFurnitureId}
          initialStorageLocationId={currentStorageLocationId}
          onChange={setSelection}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !selection || selection.storageLocationId === currentStorageLocationId || pending
            }
            onClick={() =>
              startTransition(async () => {
                if (!selection) return;
                await moveItem(itemId, selection.storageLocationId);
              })
            }
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
