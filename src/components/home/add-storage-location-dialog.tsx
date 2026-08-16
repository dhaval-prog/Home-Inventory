"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STORAGE_LOCATION_PRESETS } from "@/lib/constants";
import { addStorageLocation } from "@/lib/actions/storage";
import { cn } from "@/lib/utils";

export function AddStorageLocationDialog({
  furnitureId,
  roomId,
  furnitureType,
  existingNames,
}: {
  furnitureId: string;
  roomId: string;
  furnitureType: string;
  existingNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const presets = (STORAGE_LOCATION_PRESETS[furnitureType] ?? STORAGE_LOCATION_PRESETS.default).filter(
    (p) => !existingNames.includes(p)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setName("");
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Plus className="size-4" />
            Add Storage Location
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a storage location</DialogTitle>
        </DialogHeader>

        {presets.length > 0 && (
          <div className="space-y-2">
            <Label>Quick picks</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setName(p)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    name === p ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="location-name">Or name your own</Label>
          <Input
            id="location-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Top Shelf, Drawer 2, Left Section"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                await addStorageLocation(furnitureId, roomId, name.trim());
                setName("");
                setOpen(false);
              })
            }
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
