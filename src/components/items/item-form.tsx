"use client";

import { useActionState, useState } from "react";
import { Pencil, Star, AlertTriangle, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationPicker } from "@/components/items/location-picker";
import { ITEM_CATEGORIES, SUGGESTED_TAGS, categoryLabel } from "@/lib/constants";
import type { Item } from "@/lib/supabase/types";
import type { ItemFormState } from "@/lib/actions/items";
import { cn } from "@/lib/utils";

type ItemAction = (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;

export function ItemForm({
  action,
  item,
  initialLocation,
  initialName,
  locationLabel,
  submitLabel,
  allowLocationChange = true,
}: {
  action: ItemAction;
  item?: Item;
  initialLocation?: { roomId?: string; furnitureId?: string; storageLocationId?: string; homeId?: string };
  initialName?: string;
  locationLabel?: string;
  submitLabel: string;
  allowLocationChange?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, {});
  const [showPicker, setShowPicker] = useState(!initialLocation?.storageLocationId);
  const [location, setLocation] = useState(
    initialLocation?.storageLocationId && initialLocation.roomId && initialLocation.furnitureId
      ? {
          roomId: initialLocation.roomId,
          furnitureId: initialLocation.furnitureId,
          storageLocationId: initialLocation.storageLocationId,
        }
      : null
  );
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(item?.photo_url ?? null);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) setTags([...tags, trimmed]);
    setTagInput("");
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="roomId" value={location?.roomId ?? initialLocation?.roomId ?? ""} />
      <input type="hidden" name="furnitureId" value={location?.furnitureId ?? initialLocation?.furnitureId ?? ""} />
      <input type="hidden" name="storageLocationId" value={location?.storageLocationId ?? ""} />
      <input type="hidden" name="tags" value={tags.join(", ")} />

      <div className="space-y-1.5">
        <Label>Storage Location</Label>
        {!showPicker && locationLabel ? (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span>{locationLabel}</span>
            {allowLocationChange && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPicker(true)}>
                <Pencil className="size-3.5" />
                Change
              </Button>
            )}
          </div>
        ) : (
          <LocationPicker
            initialHomeId={initialLocation?.homeId}
            initialRoomId={initialLocation?.roomId}
            initialFurnitureId={initialLocation?.furnitureId}
            initialStorageLocationId={initialLocation?.storageLocationId}
            onChange={setLocation}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Item Name</Label>
        <Input id="name" name="name" defaultValue={item?.name ?? initialName} placeholder="Passport" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select name="category" defaultValue={item?.category ?? "other"}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v) => categoryLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ITEM_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" name="quantity" type="number" min={1} defaultValue={item?.quantity ?? 1} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={item?.description ?? ""}
          placeholder="Blue passport inside a black folder."
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="container">Container (optional)</Label>
        <Input id="container" name="container" defaultValue={item?.container ?? ""} placeholder="Blue Folder" />
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => setTags(tags.filter((x) => x !== t))}>
              {t} ×
            </Badge>
          ))}
        </div>
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="travel, important, documents"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              + {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photo">Photo</Label>
        <label
          htmlFor="photo"
          className={cn(
            "flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40",
            photoPreview && "border-solid p-0"
          )}
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="" className="h-32 w-full rounded-xl object-cover" />
          ) : (
            <>
              <ImagePlus className="size-6" />
              Upload a photo
            </>
          )}
        </label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPhotoPreview(URL.createObjectURL(file));
          }}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch name="isFavorite" defaultChecked={item?.is_favorite} />
          <Star className="size-4 text-amber-500" />
          Favorite
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch name="isImportant" defaultChecked={item?.is_important} />
          <AlertTriangle className="size-4 text-red-500" />
          Important
        </label>
      </div>

      {state.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
