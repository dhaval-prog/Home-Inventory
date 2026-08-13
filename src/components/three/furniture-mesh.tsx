"use client";

import { useRef, useState } from "react";
import type { Mesh } from "three";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";

export function FurnitureMesh({
  type,
  position,
  rotationY = 0,
  onClick,
  highlighted = false,
}: {
  type: string;
  position: [number, number, number];
  rotationY?: number;
  onClick?: () => void;
  highlighted?: boolean;
}) {
  const recipe = getFurnitureRecipe(type);
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<Mesh>(null);

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
        <mesh key={i} ref={i === 0 ? groupRef : undefined} position={part.position} castShadow receiveShadow>
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
    </group>
  );
}
