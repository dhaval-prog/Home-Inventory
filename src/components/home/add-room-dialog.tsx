"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROOM_TYPE_META, type RoomType } from "@/lib/constants";
import { addRoom } from "@/lib/actions/homes";

export function AddRoomDialog({ homeId }: { homeId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<RoomType>("bedroom");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Plus className="size-4" />
            Add Room
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a room</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="room-name">Room name</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Guest Room"
            />
          </div>
          <div className="space-y-2">
            <Label>Room type</Label>
            <Select value={type} onValueChange={(v) => setType(v as RoomType)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: RoomType) => ROOM_TYPE_META[v]?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROOM_TYPE_META) as RoomType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {ROOM_TYPE_META[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                await addRoom(homeId, name.trim(), type, ROOM_TYPE_META[type].icon);
                setName("");
                setOpen(false);
              })
            }
          >
            Add Room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
