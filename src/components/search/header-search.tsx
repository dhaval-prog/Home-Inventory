"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchSuggestions } from "@/lib/actions/search";

export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const results = await searchSuggestions(query);
        setSuggestions(results);
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function go(term: string) {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <div className={"relative " + (className ?? "")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) go(query.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="What are you looking for?"
          className="h-10 rounded-full border-white/90 bg-white/70 pl-9.5 backdrop-blur-md"
        />
      </form>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              key={s}
              onMouseDown={() => go(s)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <Search className="size-3.5 text-muted-foreground" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
