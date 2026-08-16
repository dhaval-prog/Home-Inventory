"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getIcon, getCompactIcon } from "@/lib/icon-map";
import type { RoomWithFurniture } from "@/lib/home-data";
import { deleteRoom, moveRoom, renameRoom } from "@/lib/actions/homes";

export function RoomCard({
  homeId,
  data,
  isFirst,
  isLast,
}: {
  homeId: string;
  data: RoomWithFurniture;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { room, furniture, itemCount } = data;
  const Icon = getCompactIcon(room.icon);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(room.name);
  const [pending, startTransition] = useTransition();

  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card">
      <Link href={`/home/rooms/${room.id}`} className="block p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
          <div>
            <h3 className="font-semibold uppercase tracking-wide">{room.name}</h3>
            <p className="text-xs text-muted-foreground">
              {furniture.length} furniture · {itemCount} items
            </p>
          </div>
        </div>

        {furniture.length === 0 ? (
          <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
            No furniture yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {furniture.slice(0, 6).map((f) => {
              const FIcon = getIcon(f.icon);
              return (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                >
                  <FIcon className="size-3.5" />
                  {f.name}
                </span>
              );
            })}
            {furniture.length > 6 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                +{furniture.length - 6} more
              </span>
            )}
          </div>
        )}
      </Link>

      <div className="absolute right-3 top-3 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" variant="secondary" className="size-8">
                <MoreVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <Pencil className="size-4" />
              Rename Room
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isFirst} onClick={() => startTransition(() => moveRoom(homeId, room.id, "up"))}>
              <ArrowUp className="size-4" />
              Move Up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onClick={() => startTransition(() => moveRoom(homeId, room.id, "down"))}>
              <ArrowDown className="size-4" />
              Move Down
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete Room
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename room</DialogTitle>
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
                  await renameRoom(room.id, name.trim());
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
            <DialogTitle>Delete &ldquo;{room.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this room along with all its furniture, storage locations, and{" "}
            {itemCount} item{itemCount === 1 ? "" : "s"}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => startTransition(() => deleteRoom(room.id))}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
