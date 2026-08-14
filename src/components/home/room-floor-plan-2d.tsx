"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { getIcon } from "@/lib/icon-map";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";
import { placeFurniture, ROOM_WIDTH, ROOM_DEPTH } from "@/lib/three/layout";
import { roomFloorColor } from "@/lib/three/room-colors";
import { updateFurniturePlacement } from "@/lib/actions/furniture";
import { getCachedFurniturePlacement, setCachedFurniturePlacement } from "@/lib/three/furniture-position-cache";
import type { Furniture, Room } from "@/lib/supabase/types";

const SCALE = 42; // pixels per meter
const MARGIN_X = ROOM_WIDTH / 2 - 0.3;
const MARGIN_Z = ROOM_DEPTH / 2 - 0.3;
const DRAG_THRESHOLD_PX = 4;

interface Placement {
  x: number;
  z: number;
  rotationY: number;
}

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
  // Seed with the server-matching layout (DB position/rotation or auto-arranged
  // grid) so the very first client render matches SSR exactly — the local
  // autosave cache is only ever consulted after mount, below, to avoid a
  // hydration mismatch.
  const [placements, setPlacements] = useState<Record<string, Placement>>(() => {
    const placed = placeFurniture(furniture, ROOM_WIDTH, ROOM_DEPTH, { useLocalCache: false });
    return Object.fromEntries(placed.map((p) => [p.furniture.id, { x: p.x, z: p.z, rotationY: p.rotationY }]));
  });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlacements((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of furniture) {
        if (f.position_x != null && f.position_z != null) continue; // DB already authoritative
        const cached = getCachedFurniturePlacement(f.id);
        if (
          cached &&
          (next[f.id]?.x !== cached.x || next[f.id]?.z !== cached.z || next[f.id]?.rotationY !== cached.rotationY)
        ) {
          next[f.id] = cached;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Runs once after mount, client-only — deliberately not re-syncing on every
    // `furniture` identity change since drags/rotates update `placements` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const widthPx = ROOM_WIDTH * SCALE;
  const depthPx = ROOM_DEPTH * SCALE;

  function toPixels(x: number, z: number) {
    return { left: (x + ROOM_WIDTH / 2) * SCALE, top: (z + ROOM_DEPTH / 2) * SCALE };
  }

  function persist(id: string, placement: Placement) {
    setCachedFurniturePlacement(id, placement.x, placement.z, placement.rotationY);
    startTransition(() => {
      updateFurniturePlacement(id, room.id, placement.x, placement.z, placement.rotationY);
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, id: string) {
    const placement = placements[id];
    if (!placement) return;
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: placement.x,
      startZ: placement.z,
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
    setPlacements((prev) => ({ ...prev, [drag.id]: { ...prev[drag.id], x: nextX, z: nextZ, rotationY: prev[drag.id]?.rotationY ?? 0 } }));
  }

  function onPointerUp(id: string) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      router.push(`/home/rooms/${room.id}/furniture/${id}`);
      return;
    }
    const placement = placements[id];
    if (!placement) return;
    persist(id, placement);
  }

  function onRotate(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const current = placements[id];
    if (!current) return;
    const next = { ...current, rotationY: (current.rotationY + 90) % 360 };
    setPlacements((prev) => ({ ...prev, [id]: next }));
    persist(id, next);
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
          const placement = placements[f.id] ?? { x: 0, z: 0, rotationY: 0 };
          const recipe = getFurnitureRecipe(f.type);
          const [fw, fd] = recipe.footprint;
          const color = recipe.parts[0]?.color ?? "#c9baa3";
          const { left, top } = toPixels(placement.x, placement.z);
          const Icon = getIcon(f.icon);
          const count = itemCountByFurniture[f.id] ?? 0;

          return (
            <div
              key={f.id}
              onPointerDown={(e) => onPointerDown(e, f.id)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(f.id)}
              className="absolute z-0 flex cursor-grab touch-none select-none flex-col items-center justify-center gap-0.5 rounded-lg shadow-sm transition-shadow hover:z-20 focus-within:z-20 active:cursor-grabbing active:z-20 active:shadow-md"
              style={{
                left,
                top,
                width: Math.max(fw * SCALE, 30),
                height: Math.max(fd * SCALE, 30),
                transform: `translate(-50%, -50%) rotate(${placement.rotationY}deg)`,
                backgroundColor: color,
              }}
            >
              <Icon className="size-4 text-white drop-shadow" />
              <span className="max-w-full truncate px-1 text-center text-[10px] font-medium leading-tight text-white drop-shadow">
                {f.name}
              </span>
              {count > 0 && (
                <span className="absolute -left-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-[#0b0b14] text-[9px] font-bold text-white">
                  {count}
                </span>
              )}
              <button
                type="button"
                aria-label={`Rotate ${f.name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onRotate(e, f.id)}
                className="absolute -right-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-white text-[#0b0b14] shadow ring-1 ring-[#0b0b14]/10 hover:bg-white/90"
                style={{ transform: `rotate(${-placement.rotationY}deg)` }}
              >
                <RotateCw className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Drag to rearrange · Tap the ↻ icon to rotate · Tap the item to open
      </p>
    </div>
  );
}
