"use client";

import dynamic from "next/dynamic";
import type { HomeScene3DProps } from "@/components/three/home-scene";
import { SceneErrorBoundary } from "@/components/three/scene-error-boundary";

const HomeScene3D = dynamic(() => import("@/components/three/home-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
      Loading 3D view…
    </div>
  ),
});

export function HomeSceneBoundary(props: HomeScene3DProps) {
  return (
    <SceneErrorBoundary className={props.className}>
      <HomeScene3D {...props} />
    </SceneErrorBoundary>
  );
}
