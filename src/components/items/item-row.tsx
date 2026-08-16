import Link from "next/link";
import Image from "next/image";
import { Star, AlertTriangle } from "lucide-react";
import { getIcon } from "@/lib/icon-map";
import { categoryIcon, categoryLabel } from "@/lib/constants";
import type { Item } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/badge";

export function ItemRow({ item }: { item: Item }) {
  const Icon = getIcon(categoryIcon(item.category));

  return (
    <Link
      href={`/items/${item.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50"
    >
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
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">{item.name}</p>
          {item.is_favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          {item.is_important && <AlertTriangle className="size-3.5 shrink-0 fill-red-100 text-red-500" />}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {categoryLabel(item.category)}
          {item.container ? ` · ${item.container}` : ""}
          {item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}
        </p>
      </div>
      {item.tags.length > 0 && (
        <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
          {item.tags[0]}
        </Badge>
      )}
    </Link>
  );
}
