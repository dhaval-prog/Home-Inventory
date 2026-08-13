"use client";

import { useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";
import { getIcon } from "@/lib/icon-map";
import { categoryIcon } from "@/lib/constants";
import type { SceneItemSummary } from "@/lib/home-scene-data";

const MAX_TOOLTIP_ITEMS = 5;

export function FurnitureMesh({
  name,
  type,
  position,
  rotationY = 0,
  onClick,
  highlighted = false,
  items,
}: {
  name: string;
  type: string;
  position: [number, number, number];
  rotationY?: number;
  onClick?: () => void;
  highlighted?: boolean;
  items?: SceneItemSummary[];
}) {
  const recipe = getFurnitureRecipe(type);
  const [hovered, setHovered] = useState(false);
  const topY = useMemo(
    () => Math.max(0.4, ...recipe.parts.map((p) => p.position[1] + p.size[1] / 2)),
    [recipe]
  );

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = onClick ? "pointer" : "default";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
      scale={hovered && onClick ? 1.04 : 1}
    >
      {recipe.parts.map((part, i) => (
        <mesh key={i} position={part.position} castShadow receiveShadow>
          <boxGeometry args={part.size} />
          <meshStandardMaterial
            color={part.color}
            roughness={part.roughness ?? 0.55}
            metalness={part.metalness ?? 0.08}
            emissive={highlighted ? "#f5b942" : "#000000"}
            emissiveIntensity={highlighted ? 0.35 : 0}
          />
        </mesh>
      ))}

      {hovered && (
        <Html position={[0, topY + 0.25, 0]} center distanceFactor={9} occlude={false}>
          <div className="pointer-events-none w-44 rounded-xl border bg-popover/95 p-2.5 text-left shadow-lg">
            <p className="truncate text-xs font-semibold">{name}</p>
            {!items || items.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Nothing stored here yet</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {items.slice(0, MAX_TOOLTIP_ITEMS).map((item) => {
                  const Icon = getIcon(categoryIcon(item.category));
                  return (
                    <li key={item.id} className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Icon className="size-3 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </li>
                  );
                })}
                {items.length > MAX_TOOLTIP_ITEMS && (
                  <li className="text-[11px] text-muted-foreground">+{items.length - MAX_TOOLTIP_ITEMS} more</li>
                )}
              </ul>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
