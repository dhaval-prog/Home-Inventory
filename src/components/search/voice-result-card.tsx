import Link from "next/link";
import Image from "next/image";
import { Star, AlertTriangle } from "lucide-react";
import { getIcon } from "@/lib/icon-map";
import { categoryIcon, categoryLabel } from "@/lib/constants";
import { LocationPath } from "@/components/shared/location-path";
import { Button } from "@/components/ui/button";
import type { LocationNode } from "@/lib/location";
import type { Item } from "@/lib/supabase/types";

export function VoiceResultCard({ item, path, onNavigate }: { item: Item; path: LocationNode[]; onNavigate: () => void }) {
  const Icon = getIcon(categoryIcon(item.category));
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        {item.photo_url ? (
          <Image
            src={item.photo_url}
            alt={item.name}
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-lg object-cover"
            unoptimized
          />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold">{item.name}</p>
            {item.is_favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            {item.is_important && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                <AlertTriangle className="size-3 fill-red-100" />
                Important
              </span>
            )}
            <span className="text-xs text-muted-foreground">· {categoryLabel(item.category)}</span>
          </div>
          <LocationPath nodes={path} container={item.container} className="mt-1.5" />
        </div>
      </div>
      <Button
        render={<Link href={`/items/${item.id}`} onClick={onNavigate} />}
        variant="outline"
        size="sm"
        className="mt-3 w-full"
      >
        View Location
      </Button>
    </div>
  );
}
