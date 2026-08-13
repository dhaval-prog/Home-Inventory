"use client";

import { Component, type ReactNode } from "react";
import { Box } from "lucide-react";

interface Props {
  children: ReactNode;
  className?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates 3D rendering failures (WebGL unsupported, a blocked/slow asset,
 * a driver quirk) to just this widget so they can never take down the whole
 * page the way an uncaught error in a Canvas subtree otherwise would.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D scene failed to render:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={this.props.className}>
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-6 text-center">
            <Box className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">3D view isn&apos;t available right now</p>
            <p className="text-xs text-muted-foreground">Your browser or connection may not support it.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
