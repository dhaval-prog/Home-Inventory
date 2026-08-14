"use client";

import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  PerspectiveCamera,
  RoundedBox,
  Sparkles,
} from "@react-three/drei";
import {
  AdditiveBlending,
  Color,
  MathUtils,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type ShaderMaterial,
} from "three";
import { Lock, LockOpen } from "lucide-react";

export type VaultPhase = "closed" | "opening" | "open" | "closing";

function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

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

/** Cheap camera-facing "fake bloom" halo, additively blended — no postprocessing pipeline needed. */
function Glow({
  position,
  color,
  size,
  intensityRef,
}: {
  position: [number, number, number];
  color: string;
  size: number;
  intensityRef: MutableRefObject<number>;
}) {
  const matRef = useRef<ShaderMaterial>(null);
  useFrame(() => {
    if (matRef.current) matRef.current.uniforms.glowOpacity.value = intensityRef.current;
  });
  return (
    <Billboard position={position}>
      <mesh>
        <planeGeometry args={[size, size]} />
        <shaderMaterial
          ref={matRef}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          uniforms={{ glowColor: { value: new Color(color) }, glowOpacity: { value: 0 } }}
          vertexShader={GLOW_VERTEX}
          fragmentShader={GLOW_FRAGMENT}
        />
      </mesh>
    </Billboard>
  );
}

function CameraDolly({ phase }: { phase: VaultPhase }) {
  useFrame((state, delta) => {
    const opened = phase === "open" || phase === "opening";
    state.camera.position.z = MathUtils.damp(state.camera.position.z, opened ? 5.5 : 6.4, 3, delta);
    state.camera.position.y = MathUtils.damp(state.camera.position.y, opened ? 0.15 : 0.3, 3, delta);
  });
  return null;
}

function Vault({
  phase,
  hovered,
  onClick,
  onPointerOver,
  onPointerOut,
}: {
  phase: VaultPhase;
  hovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const { pointer } = useThree();
  const groupRef = useRef<Group>(null);
  const doorPivotRef = useRef<Group>(null);
  const lockRingRef = useRef<Mesh>(null);
  const lockCoreMatRef = useRef<MeshStandardMaterial>(null);
  const interiorLightRef = useRef<import("three").PointLight>(null);
  const spin = useRef(0);
  const scale = useRef(1);
  const glowIntensity = useRef(0.5);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    g.position.y = Math.sin(t * 0.6) * 0.06;

    if (phase === "closed") spin.current += delta * 0.18;
    const targetRotY = spin.current + pointer.x * 0.3;
    const targetRotX = -pointer.y * 0.15;
    g.rotation.y = MathUtils.damp(g.rotation.y, targetRotY, 4, delta);
    g.rotation.x = MathUtils.damp(g.rotation.x, targetRotX, 4, delta);

    const targetScale = hovered ? 1.045 : 1;
    scale.current = MathUtils.damp(scale.current, targetScale, 6, delta);
    g.scale.setScalar(scale.current);

    const doorOpen = phase === "open" || phase === "opening";
    if (doorPivotRef.current) {
      doorPivotRef.current.rotation.y = MathUtils.damp(
        doorPivotRef.current.rotation.y,
        doorOpen ? -2.15 : 0,
        3,
        delta
      );
    }

    if (lockRingRef.current) {
      if (phase === "opening") lockRingRef.current.rotation.z += delta * 8;
    }

    const basePulse = 0.55 + Math.sin(t * 2.2) * 0.18;
    const hoverBoost = hovered ? 0.35 : 0;
    const unlockFlash = phase === "opening" ? 1.1 : phase === "open" ? 0.25 : 0;
    const targetGlow = basePulse + hoverBoost + unlockFlash;
    glowIntensity.current = MathUtils.damp(glowIntensity.current, targetGlow, 5, delta);
    if (lockCoreMatRef.current) lockCoreMatRef.current.emissiveIntensity = glowIntensity.current;

    if (interiorLightRef.current) {
      const targetInterior = phase === "open" ? 1.4 : phase === "opening" ? 0.7 : 0;
      interiorLightRef.current.intensity = MathUtils.damp(interiorLightRef.current.intensity, targetInterior, 4, delta);
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onPointerOver();
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
        onPointerOut();
      }}
    >
      {/* Body */}
      <RoundedBox args={[1.6, 2, 1.2]} radius={0.08} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial color="#c9ced6" metalness={0.9} roughness={0.28} clearcoat={0.6} clearcoatRoughness={0.2} envMapIntensity={1.2} />
      </RoundedBox>

      {/* Interior cavity + contents, revealed once the door swings away */}
      <group position={[0, 0, 0.15]}>
        <RoundedBox args={[1.3, 1.6, 0.5]} radius={0.03} smoothness={2} position={[0, 0, -0.15]}>
          <meshStandardMaterial color="#0b0b14" metalness={0.15} roughness={0.9} />
        </RoundedBox>
        <mesh position={[0, 0, 0.05]}>
          <icosahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial
            color="#0a0a0a"
            emissive="#c084fc"
            emissiveIntensity={phase === "open" ? 0.9 : 0}
            toneMapped={false}
            metalness={0.4}
            roughness={0.3}
          />
        </mesh>
        <pointLight ref={interiorLightRef} position={[0, 0, 0.3]} intensity={0} distance={2} color="#a855f7" />
        {phase === "open" && (
          <Html position={[0, -0.55, 0.3]} center distanceFactor={8} occlude={false}>
            <div className="w-40 rounded-xl bg-black/70 px-3 py-1.5 text-center text-[11px] font-medium text-white backdrop-blur-sm">
              Vault contents — nothing stored yet
            </div>
          </Html>
        )}
      </group>

      {/* Hinges */}
      {[0.6, -0.6].map((y) => (
        <mesh key={y} position={[-0.78, y, 0.62]}>
          <cylinderGeometry args={[0.055, 0.055, 0.28, 16]} />
          <meshStandardMaterial color="#8a8f97" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}

      {/* Door, pivoted on its left edge */}
      <group position={[-0.78, 0, 0.62]} ref={doorPivotRef}>
        <group position={[0.78, 0, 0]}>
          <RoundedBox args={[1.5, 1.85, 0.12]} radius={0.06} smoothness={4} castShadow>
            <meshPhysicalMaterial color="#dfe3e8" metalness={0.85} roughness={0.32} clearcoat={0.7} envMapIntensity={1.3} />
          </RoundedBox>
          <RoundedBox args={[1.28, 1.58, 0.02]} radius={0.04} smoothness={2} position={[0, 0, 0.07]}>
            <meshPhysicalMaterial color="#b7bcc3" metalness={0.8} roughness={0.4} />
          </RoundedBox>

          {/* Lock assembly */}
          <group position={[0, 0, 0.09]}>
            <mesh ref={lockRingRef}>
              <torusGeometry args={[0.22, 0.045, 24, 48]} />
              <meshStandardMaterial color="#161616" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.05, 32]} />
              <meshStandardMaterial
                ref={lockCoreMatRef}
                color="#0a0a0a"
                emissive="#67e8f9"
                emissiveIntensity={0.55}
                toneMapped={false}
                metalness={0.5}
                roughness={0.4}
              />
            </mesh>
            <Glow position={[0, 0, 0.03]} color="#67e8f9" size={1} intensityRef={glowIntensity} />
          </group>
        </group>
      </group>
    </group>
  );
}

function SceneContents({
  phase,
  hovered,
  onClick,
  onPointerOver,
  onPointerOut,
  mobile,
}: {
  phase: VaultPhase;
  hovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
  mobile: boolean;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.3, 6.4]} fov={32} />
      <CameraDolly phase={phase} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} color="#fff4e0" castShadow={!mobile} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#7aa7ff" />
      <pointLight position={[0, -1, 3]} intensity={0.2} color="#22d3ee" />

      <Environment resolution={mobile ? 128 : 256}>
        <Lightformer form="rect" intensity={2.2} color="#dfe9ff" position={[-4, 3, 2]} scale={[3, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[4, 2, 4]} scale={[2, 4, 1]} />
        <Lightformer form="ring" intensity={2} color="#22d3ee" position={[0, -3, -2]} scale={5} />
      </Environment>

      <Vault phase={phase} hovered={hovered} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} />

      <ContactShadows position={[0, -1.05, 0]} opacity={0.45} blur={2.6} far={3} scale={9} />
      {!mobile && <Sparkles count={35} scale={[6, 4, 6]} size={2} speed={0.25} color="#67e8f9" opacity={0.35} />}
    </>
  );
}

export default function LockerVaultScene({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<VaultPhase>("closed");
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobile = isMobileViewport();

  function toggle() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (phase === "closed") {
      setPhase("opening");
      timerRef.current = setTimeout(() => setPhase("open"), 900);
    } else if (phase === "open") {
      setPhase("closing");
      timerRef.current = setTimeout(() => setPhase("closed"), 700);
    }
  }

  const open = phase === "open" || phase === "opening";

  return (
    <div className="relative mx-auto max-w-md overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#0b0b14] to-[#15151f] shadow-[0_40px_80px_-20px_rgba(11,11,20,0.6)]">
      <div className="h-[420px] w-full">
        <Canvas shadows={!mobile} dpr={mobile ? 1 : [1, 2]} gl={{ antialias: true }}>
          <SceneContents
            phase={phase}
            hovered={hovered}
            onClick={toggle}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            mobile={mobile}
          />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
          {open ? <LockOpen className="size-3.5 text-cyan-300" /> : <Lock className="size-3.5 text-cyan-300" />}
          {open ? "Unlocked" : "Locked"}
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-md">
          0 assets secured
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-5 text-center">
        <p className="text-xs text-white/50">{open ? "Tap the vault to seal it again" : "Tap the vault to unlock it"}</p>
        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
        >
          Exit Locker
        </button>
      </div>
    </div>
  );
}
