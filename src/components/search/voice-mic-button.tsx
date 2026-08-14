"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export function VoiceMicButton({
  isListening,
  disabled,
  onClick,
  size = "default",
  className,
}: {
  isListening: boolean;
  disabled?: boolean;
  onClick: () => void;
  size?: "default" | "sm";
  className?: string;
}) {
  const dim = size === "sm" ? "size-8" : "size-10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isListening ? "Stop listening" : "Search or add by voice"}
      aria-pressed={isListening}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-40",
        dim,
        isListening ? "bg-rose-500 text-white" : "bg-[#0b0b14] text-white hover:bg-[#0b0b14]/85",
        className
      )}
    >
      {isListening && (
        <>
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-rose-500/50" />
          <span className="absolute -inset-1.5 -z-10 animate-ping rounded-full bg-rose-500/25 [animation-delay:150ms]" />
        </>
      )}
      <Mic className={size === "sm" ? "size-3.5" : "size-4.5"} />
    </button>
  );
}
