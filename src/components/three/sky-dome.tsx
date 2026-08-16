"use client";

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { BackSide, Color, type Mesh, type MeshBasicMaterial, type Points, type PointsMaterial, type ShaderMaterial } from "three";
import { seededRandom } from "@/lib/three/seeded-random";
import type { EnvironmentTarget } from "@/lib/three/environment";

const SKY_VERTEX = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    float t = max(pow(max(h, 0.0), exponent), 0.0);
    gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
  }
`;

/**
 * A gradient sky dome (inline shader, no external HDR/texture), plus a
 * billboarded sun/moon disc and a faint star field — all positioned in
 * world space around the scene so they never rotate with the camera's
 * auto-orbit (section 24: the environment stays put, the viewpoint moves).
 */
export function SkyDome({
  envRef,
  radius,
  sceneRadius,
  center,
}: {
  envRef: MutableRefObject<EnvironmentTarget>;
  radius: number;
  /** Scene's own bounding radius (small, unlike the big enclosing `radius`
   * dome) — sun/moon/stars are placed relative to this so they land in the
   * same modest height band as the clouds, not high up near the dome shell
   * (see Clouds' comment: the dollhouse camera's fixed downward pitch never
   * looks that high, so anything up there is invisible regardless of the
   * dome radius it's nominally "attached" to). */
  sceneRadius: number;
  center: [number, number];
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const sunRef = useRef<Mesh>(null);
  const moonRef = useRef<Mesh>(null);
  const starsRef = useRef<Points>(null);

  const uniforms = useMemo(
    () => ({
      topColor: { value: new Color("#bfe0ff") },
      horizonColor: { value: new Color("#eaf3ff") },
      offset: { value: radius * 0.25 },
      exponent: { value: 0.7 },
    }),
    [radius]
  );

  const starPositions = useMemo(() => {
    const count = 130;
    const arr = new Float32Array(count * 3);
    // Spread across the full horizontal circle but keep height in the same
    // modest band the sun/moon/clouds live in — see the sceneRadius comment
    // above; a true upper-hemisphere spread puts most stars where this
    // camera's fixed downward pitch can never see them.
    const spread = sceneRadius * 1.6;
    const rand = seededRandom(97);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const height = sceneRadius * (0.15 + rand() * 0.55);
      arr[i * 3] = spread * Math.cos(theta);
      arr[i * 3 + 1] = height;
      arr[i * 3 + 2] = spread * Math.sin(theta);
    }
    return arr;
  }, [sceneRadius]);

  useFrame(() => {
    const env = envRef.current;

    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.topColor.value.copy(env.skyTopColor);
      u.horizonColor.value.copy(env.skyHorizonColor);
    }

    // Fixed horizontal distance + a compressed height band (rather than
    // scaling straight off sunDirection, which would put the disc near the
    // dome shell at high elevation) — same reasoning as Clouds/star field
    // above: this camera's downward pitch only ever sees a modest height
    // band above the yard, regardless of azimuth.
    const horizDist = sceneRadius * 1.7;
    const minHeight = sceneRadius * 0.12;
    const maxHeight = sceneRadius * 0.55;
    const sunAzimuth = Math.atan2(env.sunDirection[2], env.sunDirection[0]);
    if (sunRef.current) {
      sunRef.current.position.set(
        center[0] + Math.cos(sunAzimuth) * horizDist,
        minHeight + Math.max(0, env.sunDirection[1]) * (maxHeight - minHeight),
        center[1] + Math.sin(sunAzimuth) * horizDist
      );
      const mat = sunRef.current.material as MeshBasicMaterial;
      mat.color.copy(env.sunColor);
      mat.opacity = env.sunDirection[1] > -0.05 ? Math.min(1, env.sunIntensity * 1.3 + 0.1) : 0;
    }
    if (moonRef.current) {
      const moonAzimuth = sunAzimuth + Math.PI;
      moonRef.current.position.set(
        center[0] + Math.cos(moonAzimuth) * horizDist,
        minHeight + Math.max(0, -env.sunDirection[1]) * (maxHeight - minHeight),
        center[1] + Math.sin(moonAzimuth) * horizDist
      );
      const mat = moonRef.current.material as MeshBasicMaterial;
      mat.opacity = env.moonOpacity;
    }
    if (starsRef.current) {
      starsRef.current.position.set(center[0], 0, center[1]);
      const mat = starsRef.current.material as PointsMaterial;
      mat.opacity = env.starOpacity;
    }
  });

  return (
    <>
      <mesh scale={radius} renderOrder={-10}>
        <sphereGeometry args={[1, 24, 16]} />
        <shaderMaterial
          ref={materialRef}
          side={BackSide}
          uniforms={uniforms}
          vertexShader={SKY_VERTEX}
          fragmentShader={SKY_FRAGMENT}
          fog={false}
          depthWrite={false}
        />
      </mesh>

      <Billboard>
        <mesh ref={sunRef}>
          <circleGeometry args={[radius * 0.045, 24]} />
          <meshBasicMaterial color="#fff4de" transparent opacity={0} depthWrite={false} fog={false} />
        </mesh>
      </Billboard>

      <Billboard>
        <mesh ref={moonRef}>
          <circleGeometry args={[radius * 0.032, 24]} />
          <meshBasicMaterial color="#e8ecf5" transparent opacity={0} depthWrite={false} fog={false} />
        </mesh>
      </Billboard>

      <points ref={starsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={radius * 0.006} color="#ffffff" transparent opacity={0} sizeAttenuation depthWrite={false} fog={false} />
      </points>
    </>
  );
}
