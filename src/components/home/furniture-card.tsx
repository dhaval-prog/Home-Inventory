"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getIcon } from "@/lib/icon-map";
import type { Furniture } from "@/lib/supabase/types";
import { deleteFurniture, renameFurniture } from "@/lib/actions/furniture";

export function FurnitureCard({
  roomId,
  furniture,
  itemCount,
}: {
  roomId: string;
  furniture: Furniture;
  itemCount: number;
}) {
  const Icon = getIcon(furniture.icon);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(furniture.name);
  const [pending, startTransition] = useTransition();

  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card">
      <Link href={`/home/rooms/${roomId}/furniture/${furniture.id}`} className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-7" />
        </span>
        <p className="font-semibold">{furniture.name}</p>
        <p className="text-xs text-muted-foreground">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </p>
      </Link>

      <div className="absolute right-2 top-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" variant="secondary" className="size-7">
                <MoreVertical className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename furniture</DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !name.trim()}
              onClick={() =>
                startTransition(async () => {
                  await renameFurniture(furniture.id, roomId, name.trim());
                  setRenaming(false);
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{furniture.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this furniture along with its storage locations and {itemCount} item
            {itemCount === 1 ? "" : "s"}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => deleteFurniture(furniture.id, roomId))}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
