"use client";

import { useTransition } from "react";
import { Star, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavorite, toggleImportant } from "@/lib/actions/items";
import { cn } from "@/lib/utils";

export function ItemToggleButtons({
  itemId,
  isFavorite,
  isImportant,
}: {
  itemId: string;
  isFavorite: boolean;
  isImportant: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => toggleFavorite(itemId, !isFavorite))}
      >
        <Star className={cn("size-4", isFavorite && "fill-amber-400 text-amber-400")} />
        {isFavorite ? "Favorited" : "Favorite"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => toggleImportant(itemId, !isImportant))}
      >
        <AlertTriangle className={cn("size-4", isImportant && "fill-red-100 text-red-500")} />
        {isImportant ? "Important" : "Mark Important"}
      </Button>
    </div>
  );
}
