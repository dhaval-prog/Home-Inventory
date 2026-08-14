"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { getIcon } from "@/lib/icon-map";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";
import { placeFurniture, ROOM_WIDTH, ROOM_DEPTH } from "@/lib/three/layout";
import { roomFloorColor } from "@/lib/three/room-colors";
import { updateFurniturePosition } from "@/lib/actions/furniture";
import { getCachedFurniturePosition, setCachedFurniturePosition } from "@/lib/three/furniture-position-cache";
import type { Furniture, Room } from "@/lib/supabase/types";

const SCALE = 42; // pixels per meter
const MARGIN_X = ROOM_WIDTH / 2 - 0.3;
const MARGIN_Z = ROOM_DEPTH / 2 - 0.3;
const DRAG_THRESHOLD_PX = 4;

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startZ: number;
  moved: boolean;
}

export function RoomFloorPlan2D({
  room,
  furniture,
  itemCountByFurniture,
}: {
  room: Room;
  furniture: Furniture[];
  itemCountByFurniture: Record<string, number>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Seed with the server-matching layout (DB position or auto-arranged grid) so
  // the very first client render matches SSR exactly — the local autosave cache
  // is only ever consulted after mount, below, to avoid a hydration mismatch.
  const [positions, setPositions] = useState<Record<string, { x: number; z: number }>>(() => {
    const placed = placeFurniture(furniture, ROOM_WIDTH, ROOM_DEPTH, { useLocalCache: false });
    return Object.fromEntries(placed.map((p) => [p.furniture.id, { x: p.x, z: p.z }]));
  });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of furniture) {
        if (f.position_x != null && f.position_z != null) continue; // DB already authoritative
        const cached = getCachedFurniturePosition(f.id);
        if (cached && (next[f.id]?.x !== cached.x || next[f.id]?.z !== cached.z)) {
          next[f.id] = cached;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Runs once after mount, client-only — deliberately not re-syncing on every
    // `furniture` identity change since drags update `positions` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const widthPx = ROOM_WIDTH * SCALE;
  const depthPx = ROOM_DEPTH * SCALE;

  function toPixels(x: number, z: number) {
    return { left: (x + ROOM_WIDTH / 2) * SCALE, top: (z + ROOM_DEPTH / 2) * SCALE };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, id: string) {
    const pos = positions[id];
    if (!pos) return;
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: pos.x,
      startZ: pos.z,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    if (!drag.moved && (Math.abs(dxPx) > DRAG_THRESHOLD_PX || Math.abs(dyPx) > DRAG_THRESHOLD_PX)) {
      drag.moved = true;
    }
    const nextX = Math.max(-MARGIN_X, Math.min(MARGIN_X, drag.startX + dxPx / SCALE));
    const nextZ = Math.max(-MARGIN_Z, Math.min(MARGIN_Z, drag.startZ + dyPx / SCALE));
    setPositions((prev) => ({ ...prev, [drag.id]: { x: nextX, z: nextZ } }));
  }

  function onPointerUp(id: string) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      router.push(`/home/rooms/${room.id}/furniture/${id}`);
      return;
    }
    const pos = positions[id];
    if (!pos) return;
    setCachedFurniturePosition(id, pos.x, pos.z);
    startTransition(() => {
      updateFurniturePosition(id, room.id, pos.x, pos.z);
    });
  }

  return (
    <div className="overflow-auto rounded-2xl border bg-muted/20 p-4 md:p-6">
      <div
        className="relative mx-auto touch-none select-none rounded-xl border-2"
        style={{
          width: widthPx,
          height: depthPx,
          backgroundColor: roomFloorColor(room.type),
          borderColor: "rgba(11,11,20,0.15)",
        }}
      >
        {furniture.map((f) => {
          const pos = positions[f.id] ?? { x: 0, z: 0 };
          const recipe = getFurnitureRecipe(f.type);
          const [fw, fd] = recipe.footprint;
          const color = recipe.parts[0]?.color ?? "#c9baa3";
          const { left, top } = toPixels(pos.x, pos.z);
          const Icon = getIcon(f.icon);
          const count = itemCountByFurniture[f.id] ?? 0;

          return (
            <div
              key={f.id}
              onPointerDown={(e) => onPointerDown(e, f.id)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(f.id)}
              className="absolute flex cursor-grab touch-none select-none flex-col items-center justify-center gap-0.5 rounded-lg shadow-sm transition-shadow active:cursor-grabbing active:shadow-md"
              style={{
                left,
                top,
                width: Math.max(fw * SCALE, 30),
                height: Math.max(fd * SCALE, 30),
                transform: "translate(-50%, -50%)",
                backgroundColor: color,
              }}
            >
              <Icon className="size-4 text-white drop-shadow" />
              <span className="max-w-full truncate px-1 text-center text-[10px] font-medium leading-tight text-white drop-shadow">
                {f.name}
              </span>
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-[#0b0b14] text-[9px] font-bold text-white">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Drag furniture to rearrange · Tap to open</p>
    </div>
  );
}
