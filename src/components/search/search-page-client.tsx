"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ItemList } from "@/components/items/item-list";
import { searchItems, type SearchResult } from "@/lib/actions/search";

function SearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const term = query.trim();
    const handle = setTimeout(() => {
      if (!term) {
        setResults([]);
        setSearched(false);
        return;
      }
      startTransition(async () => {
        const r = await searchItems(term);
        setResults(r);
        setSearched(true);
      });
      router.replace(`/search?q=${encodeURIComponent(term)}`, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search by item name, category, tag, room, or furniture.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What are you looking for?"
          className="h-12 pl-10 text-base"
        />
      </div>

      {!searched && !pending && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Try searching for &ldquo;passport&rdquo;, &ldquo;winter&rdquo;, or &ldquo;charger&rdquo;.
        </p>
      )}

      {searched && !pending && results.length === 0 && (
        <div className="py-12 text-center">
          <p className="font-medium">We couldn&apos;t find anything matching &ldquo;{query}&rdquo;.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try searching by item name, category, or tag.</p>
        </div>
      )}

      {results.length > 0 && <ItemList results={results} />}
    </div>
  );
}

export function SearchPageClient() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
