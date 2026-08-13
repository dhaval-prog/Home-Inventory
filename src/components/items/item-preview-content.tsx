import Image from "next/image";
import { Star, AlertTriangle } from "lucide-react";
import { getIcon } from "@/lib/icon-map";
import { categoryIcon, categoryLabel } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { LocationPath } from "@/components/shared/location-path";
import type { Item } from "@/lib/supabase/types";
import type { LocationNode } from "@/lib/location";

export function ItemPreviewContent({ item, path }: { item: Item; path?: LocationNode[] }) {
  const Icon = getIcon(categoryIcon(item.category));

  return (
    <div className="space-y-2">
      {path && <LocationPath nodes={path} container={item.container} className="text-[11px]" iconClassName="size-3" />}
      {item.photo_url ? (
        <Image
          src={item.photo_url}
          alt={item.name}
          width={240}
          height={128}
          className="h-32 w-full rounded-md object-cover"
          unoptimized
        />
      ) : (
        <span className="flex h-20 w-full items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-7" />
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <p className="truncate font-semibold">{item.name}</p>
        {item.is_favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
        {item.is_important && <AlertTriangle className="size-3.5 shrink-0 fill-red-100 text-red-500" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Icon className="size-3.5" />
          {categoryLabel(item.category)}
        </span>
        <span>· Qty {item.quantity}</span>
        {item.container && <span>· {item.container}</span>}
      </div>

      {item.description && <p className="line-clamp-3 text-xs text-muted-foreground">{item.description}</p>}

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
