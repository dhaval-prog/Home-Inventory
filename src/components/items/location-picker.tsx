"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listFurniture, listHomes, listRooms, listStorageLocations } from "@/lib/actions/browse";

interface Option {
  id: string;
  name: string;
}

export function LocationPicker({
  initialHomeId,
  initialRoomId,
  initialFurnitureId,
  initialStorageLocationId,
  onChange,
}: {
  initialHomeId?: string;
  initialRoomId?: string;
  initialFurnitureId?: string;
  initialStorageLocationId?: string;
  onChange: (value: { roomId: string; furnitureId: string; storageLocationId: string } | null) => void;
}) {
  const [homes, setHomes] = useState<Option[]>([]);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [furniture, setFurniture] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);

  const [homeId, setHomeId] = useState(initialHomeId ?? "");
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [furnitureId, setFurnitureId] = useState(initialFurnitureId ?? "");
  const [locationId, setLocationId] = useState(initialStorageLocationId ?? "");

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
    listFurniture(roomId).then(setFurniture);
  }, [roomId]);

  useEffect(() => {
    if (!furnitureId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocations([]);
      return;
    }
    listStorageLocations(furnitureId).then(setLocations);
  }, [furnitureId]);

  useEffect(() => {
    if (roomId && furnitureId && locationId) {
      onChange({ roomId, furnitureId, storageLocationId: locationId });
    } else {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, furnitureId, locationId]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Home</Label>
        <Select
          value={homeId}
          onValueChange={(v) => {
            setHomeId(v ?? "");
            setRoomId("");
            setFurnitureId("");
            setLocationId("");
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
            setLocationId("");
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

      <div className="space-y-1.5">
        <Label>Furniture</Label>
        <Select
          value={furnitureId}
          disabled={!roomId}
          onValueChange={(v) => {
            setFurnitureId(v ?? "");
            setLocationId("");
          }}
        >
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

      <div className="space-y-1.5">
        <Label>Storage Location</Label>
        <Select value={locationId} disabled={!furnitureId} onValueChange={(v) => setLocationId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v) => locations.find((l) => l.id === v)?.name ?? "Select a location"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
