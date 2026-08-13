"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listFurniture, listHomes, listRooms } from "@/lib/actions/browse";

interface Option {
  id: string;
  name: string;
}

export function QuickAddNavigator({
  type,
  initialHomeId,
}: {
  type: "furniture" | "storage";
  initialHomeId?: string;
}) {
  const router = useRouter();
  const [homes, setHomes] = useState<Option[]>([]);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [furniture, setFurniture] = useState<Option[]>([]);

  const [homeId, setHomeId] = useState(initialHomeId ?? "");
  const [roomId, setRoomId] = useState("");
  const [furnitureId, setFurnitureId] = useState("");

  useEffect(() => {
    listHomes().then((data) => {
      setHomes(data);
      if (!homeId && data.length === 1) setHomeId(data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!homeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRooms([]);
      return;
    }
    listRooms(homeId).then(setRooms);
  }, [homeId]);

  useEffect(() => {
    if (!roomId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFurniture([]);
      return;
    }
    if (type === "storage") listFurniture(roomId).then(setFurniture);
  }, [roomId, type]);

  const ready = type === "furniture" ? Boolean(roomId) : Boolean(furnitureId);

  return (
    <div className="mx-auto max-w-md space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {type === "furniture" ? "Add Furniture" : "Add Storage Location"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          First, tell us where — we&apos;ll take you straight there to finish adding it.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Home</Label>
          <Select
            value={homeId}
            onValueChange={(v) => {
              setHomeId(v ?? "");
              setRoomId("");
              setFurnitureId("");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(v) => homes.find((h) => h.id === v)?.name ?? "Select a home"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {homes.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Room</Label>
          <Select
            value={roomId}
            disabled={!homeId}
            onValueChange={(v) => {
              setRoomId(v ?? "");
              setFurnitureId("");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(v) => rooms.find((r) => r.id === v)?.name ?? "Select a room"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {type === "storage" && (
          <div className="space-y-1.5">
            <Label>Furniture</Label>
            <Select value={furnitureId} disabled={!roomId} onValueChange={(v) => setFurnitureId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => furniture.find((f) => f.id === v)?.name ?? "Select furniture"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {furniture.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Button
        className="w-full"
        disabled={!ready}
        onClick={() => {
          if (type === "furniture") router.push(`/home/rooms/${roomId}`);
          else router.push(`/home/rooms/${roomId}/furniture/${furnitureId}`);
        }}
      >
        Continue
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
