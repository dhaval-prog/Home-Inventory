"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getIcon } from "@/lib/icon-map";
import { FURNITURE_BY_ROOM_TYPE, GENERIC_FURNITURE, type RoomType } from "@/lib/constants";
import { addFurniture } from "@/lib/actions/furniture";
import { cn } from "@/lib/utils";

export function AddFurnitureDialog({ roomId, roomType }: { roomId: string; roomType: RoomType }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ name: string; type: string; icon: string } | null>(null);
  const [customName, setCustomName] = useState("");
  const [pending, startTransition] = useTransition();

  const options = FURNITURE_BY_ROOM_TYPE[roomType] ?? [];
  const showGeneric = options.length === 0;
  const combined = showGeneric ? GENERIC_FURNITURE : [...options, ...GENERIC_FURNITURE];
  const allOptions = combined.filter((opt, i) => combined.findIndex((o) => o.name === opt.name) === i);

  function reset() {
    setSelected(null);
    setCustomName("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Add Furniture
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add furniture</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {allOptions.map((opt) => {
            const Icon = getIcon(opt.icon);
            const active = selected?.name === opt.name;
            return (
              <button
                key={opt.name}
                onClick={() => setSelected(opt)}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors",
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                )}
              >
                {active && (
                  <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                )}
                <Icon className="size-6 text-primary" />
                <span className="text-xs font-medium">{opt.name}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="furniture-name">Name it (optional)</Label>
            <Input
              id="furniture-name"
              placeholder={selected.name}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected || pending}
            onClick={() =>
              startTransition(async () => {
                if (!selected) return;
                const id = await addFurniture(
                  roomId,
                  customName.trim() || selected.name,
                  selected.type,
                  selected.icon
                );
                setOpen(false);
                reset();
                router.push(`/home/rooms/${roomId}/furniture/${id}`);
              })
            }
          >
            Add Furniture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
