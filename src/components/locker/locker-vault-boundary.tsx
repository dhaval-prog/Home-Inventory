"use client";

import dynamic from "next/dynamic";
import { SceneErrorBoundary } from "@/components/three/scene-error-boundary";

const LockerVaultScene = dynamic(() => import("@/components/locker/locker-vault-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-[2rem] bg-gradient-to-b from-[#0b0b14] to-[#15151f] text-sm text-white/50">
      Loading vault…
    </div>
  ),
});

export function LockerVaultBoundary({ onExit }: { onExit: () => void }) {
  return (
    <SceneErrorBoundary>
      <LockerVaultScene onExit={onExit} />
    </SceneErrorBoundary>
  );
}
