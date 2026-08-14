"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { VoiceSearchPanel } from "@/components/search/voice-search-panel";

export function HeaderSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The Search page hosts this same search-and-voice functionality directly
  // below its own search bar, so the header bar would just be a duplicate there.
  if (pathname === "/search") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "hidden h-10 items-center gap-2 rounded-full border border-white/90 bg-white/70 px-3.5 text-left text-sm text-muted-foreground backdrop-blur-md hover:bg-white/85 md:flex " +
          (className ?? "")
        }
      >
        <Search className="size-4 shrink-0" />
        What are you looking for?
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="ml-auto flex size-9 items-center justify-center rounded-full text-foreground/60 hover:bg-white/50 md:hidden"
      >
        <Search className="size-5" />
      </button>

      <VoiceSearchPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
