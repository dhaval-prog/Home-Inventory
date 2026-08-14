"use client";

import dynamic from "next/dynamic";
import type { RoomTopViewProps } from "@/components/three/room-top-view-scene";
import { SceneErrorBoundary } from "@/components/three/scene-error-boundary";

const RoomTopViewScene = dynamic(() => import("@/components/three/room-top-view-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
      Loading 3D view…
    </div>
  ),
});

export function RoomTopViewBoundary(props: RoomTopViewProps) {
  return (
    <SceneErrorBoundary className={props.className}>
      <RoomTopViewScene {...props} />
    </SceneErrorBoundary>
  );
}
