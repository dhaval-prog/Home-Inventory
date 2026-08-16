"use client";

import { useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { AdditiveBlending, Color, type ShaderMaterial } from "three";
import type { EnvironmentTarget } from "@/lib/three/environment";

const GLOW_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT = `
  uniform vec3 glowColor;
  uniform float glowOpacity;
  varying vec2 vUv;
  void main() {
    float dist = distance(vUv, vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, dist);
    gl_FragColor = vec4(glowColor, alpha * glowOpacity);
  }
`;

/**
 * Cheap, self-contained "fake bloom" — a camera-facing soft radial glow,
 * additively blended, no postprocessing pipeline needed. Used sparingly
 * behind house windows and outdoor/path lights at night (section 10: "very
 * subtle bloom... do not overdo it").
 */
export function GlowSprite({
  position,
  color,
  size = 0.5,
  envRef,
  select,
  maxOpacity = 0.55,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
  envRef: MutableRefObject<EnvironmentTarget>;
  select: (env: EnvironmentTarget) => number;
  maxOpacity?: number;
}) {
  const materialRef = useRef<ShaderMaterial>(null);

  useFrame(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.glowOpacity.value = select(envRef.current) * maxOpacity;
  });

  return (
    <Billboard position={position}>
      <mesh>
        <planeGeometry args={[size, size]} />
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          uniforms={{ glowColor: { value: new Color(color) }, glowOpacity: { value: 0 } }}
          vertexShader={GLOW_VERTEX}
          fragmentShader={GLOW_FRAGMENT}
          fog={false}
        />
      </mesh>
    </Billboard>
  );
}
