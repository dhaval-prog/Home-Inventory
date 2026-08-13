"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

export function LocationMarker({ position }: { position: [number, number, number] }) {
  const pinRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (pinRef.current) {
      pinRef.current.position.y = position[1] + 1.1 + Math.sin(t * 2) * 0.08;
    }
    if (ringRef.current) {
      const pulse = 1 + Math.sin(t * 2.5) * 0.15;
      ringRef.current.scale.set(pulse, pulse, pulse);
      const material = ringRef.current.material as { opacity: number };
      material.opacity = 0.55 + Math.sin(t * 2.5) * 0.2;
    }
  });

  return (
    <group>
      <mesh ref={ringRef} position={[position[0], position[1] + 0.02, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.5, 32]} />
        <meshBasicMaterial color="#f5b942" transparent opacity={0.6} />
      </mesh>
      <group ref={pinRef} position={[position[0], position[1] + 1.1, position[2]]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <sphereGeometry args={[0.16, 24, 24]} />
          <meshStandardMaterial color="#e6483f" emissive="#e6483f" emissiveIntensity={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.1, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.1, 0.3, 24]} />
          <meshStandardMaterial color="#e6483f" emissive="#e6483f" emissiveIntensity={0.4} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}
