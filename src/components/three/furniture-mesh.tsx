"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial, PointLight } from "three";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";
import { getIcon } from "@/lib/icon-map";
import { categoryIcon } from "@/lib/constants";
import type { SceneItemSummary } from "@/lib/home-scene-data";

const MAX_TOOLTIP_ITEMS = 5;
const GLOW_COLOR = "#f5b942";

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
  const materialRefs = useRef<Mesh[]>([]);
  const glowLightRef = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    if (!highlighted) return;
    const pulse = 0.3 + Math.sin(clock.getElapsedTime() * 2.4) * 0.15;
    for (const mesh of materialRefs.current) {
      if (!mesh) continue;
      const material = mesh.material as MeshStandardMaterial;
      material.emissiveIntensity = pulse;
    }
    if (glowLightRef.current) {
      glowLightRef.current.intensity = 0.6 + pulse * 0.8;
    }
  });

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
        <mesh
          key={i}
          position={part.position}
          castShadow
          receiveShadow
          ref={(mesh) => {
            if (mesh) materialRefs.current[i] = mesh;
          }}
        >
          <boxGeometry args={part.size} />
          <meshStandardMaterial
            color={part.color}
            roughness={part.roughness ?? 0.55}
            metalness={part.metalness ?? 0.08}
            emissive={highlighted ? GLOW_COLOR : "#000000"}
            emissiveIntensity={highlighted ? 0.3 : 0}
          />
        </mesh>
      ))}

      {highlighted && (
        <pointLight ref={glowLightRef} position={[0, topY * 0.6, 0]} color={GLOW_COLOR} intensity={0.8} distance={2.2} decay={2} />
      )}

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
