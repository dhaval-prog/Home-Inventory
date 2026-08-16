"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { VoiceSearchPanel } from "@/components/search/voice-search-panel";
import { cn } from "@/lib/utils";

export function HeaderSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [touchingSurface, setTouchingSurface] = useState(false);
  const pathname = usePathname();

  // The Search page hosts this same search-and-voice functionality directly
  // below its own search bar, so the header bar would just be a duplicate there.
  const hidden = pathname === "/search";

  useEffect(() => {
    if (hidden) return;

    const surface = document.querySelector<HTMLElement>("[data-black-surface]");
    const header = document.querySelector<HTMLElement>("header");

    function check() {
      if (!surface || !header) {
        setTouchingSurface(false);
        return;
      }
      const barBottom = header.getBoundingClientRect().bottom;
      const surfaceTop = surface.getBoundingClientRect().top;
      setTouchingSurface(barBottom >= surfaceTop);
    }

    check();

    if (!surface || !header) return;

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const ro = new ResizeObserver(check);
    ro.observe(surface);

    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro.disconnect();
    };
  }, [pathname, hidden]);

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "hidden h-10 items-center gap-2 rounded-full border border-white/90 bg-white/70 px-3.5 text-left text-sm text-muted-foreground backdrop-blur-md hover:bg-white/85 md:flex",
          "transition-all duration-200 ease-out",
          touchingSurface && "pointer-events-none -translate-y-1.5 opacity-0",
          className
        )}
      >
        <Search className="size-4 shrink-0" />
        What are you looking for?
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className={cn(
          "ml-auto flex size-9 items-center justify-center rounded-full text-foreground/60 hover:bg-white/50 md:hidden",
          "transition-all duration-200 ease-out",
          touchingSurface && "pointer-events-none -translate-y-1.5 opacity-0"
        )}
      >
        <Search className="size-5" />
      </button>

      <VoiceSearchPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
