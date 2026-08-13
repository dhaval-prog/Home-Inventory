import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildLocationIndex, pathForStorageLocation } from "@/lib/location";
import { getIcon } from "@/lib/icon-map";
import { categoryIcon, categoryLabel } from "@/lib/constants";
import { LocationPath } from "@/components/shared/location-path";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ItemToggleButtons } from "@/components/items/item-toggle-buttons";
import { MoveItemDialog } from "@/components/items/move-item-dialog";
import { ItemDeleteButton } from "@/components/items/item-delete-button";

export default async function ItemDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
  if (!item) notFound();

  const index = await buildLocationIndex(supabase);
  const path = pathForStorageLocation(index, item.storage_location_id);
  if (!path) notFound();

  const home = path.find((n) => n.type === "home")!;
  const room = path.find((n) => n.type === "room")!;
  const furniture = path.find((n) => n.type === "furniture")!;
  const CategoryIcon = getIcon(categoryIcon(item.category));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
            {item.is_important && <Badge variant="destructive">Important</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">📍 Found here</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          render={
            <Link href={`/items/${item.id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          }
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <LocationPath nodes={path} container={item.container} className="text-sm" iconClassName="size-4" />
        </CardContent>
      </Card>

      {item.photo_url && (
        <Image
          src={item.photo_url}
          alt={item.name}
          width={640}
          height={360}
          className="h-56 w-full rounded-2xl border object-cover"
          unoptimized
        />
      )}

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          <Detail label="Category">
            <span className="flex items-center gap-1.5">
              <CategoryIcon className="size-4 text-primary" />
              {categoryLabel(item.category)}
            </span>
          </Detail>
          <Detail label="Quantity">{item.quantity}</Detail>
          <Detail label="Added">{new Date(item.created_at).toLocaleDateString()}</Detail>
          <Detail label="Last Updated">{new Date(item.updated_at).toLocaleDateString()}</Detail>
          {item.description && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="mt-1 text-sm">{item.description}</p>
            </div>
          )}
          {item.tags.length > 0 && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ItemToggleButtons itemId={item.id} isFavorite={item.is_favorite} isImportant={item.is_important} />

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <MoveItemDialog
          itemId={item.id}
          currentHomeId={home.id}
          currentRoomId={room.id}
          currentFurnitureId={furniture.id}
          currentStorageLocationId={item.storage_location_id}
        />
        <ItemDeleteButton itemId={item.id} name={item.name} />
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{children}</p>
    </div>
  );
}
