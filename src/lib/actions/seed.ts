"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Populates a realistic demo home (section 43) so a brand new account
 * doesn't start on a completely blank dashboard.
 */
export async function seedDemoData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: home, error: homeError } = await supabase
    .from("homes")
    .insert({ user_id: user.id, name: "My Apartment", home_type: "2bhk" })
    .select()
    .single();
  if (homeError || !home) throw new Error(homeError?.message ?? "Failed to create demo home");

  const roomDefs = [
    { name: "Hall", type: "hall", icon: "Sofa" },
    { name: "Kitchen", type: "kitchen", icon: "ChefHat" },
    { name: "Bedroom 1", type: "bedroom", icon: "Bed" },
    { name: "Bedroom 2", type: "bedroom", icon: "Bed" },
  ];
  const { data: rooms } = await supabase
    .from("rooms")
    .insert(roomDefs.map((r, i) => ({ user_id: user.id, home_id: home.id, sort_order: i, ...r })))
    .select();
  if (!rooms) throw new Error("Failed to create rooms");
  const roomByName = Object.fromEntries(rooms.map((r) => [r.name, r]));

  const furnitureDefs: { room: string; name: string; type: string; icon: string }[] = [
    { room: "Hall", name: "Sofa", type: "sofa", icon: "Sofa" },
    { room: "Hall", name: "TV Unit", type: "tv_unit", icon: "Tv" },
    { room: "Hall", name: "Storage Cabinet", type: "cabinet", icon: "Archive" },
    { room: "Kitchen", name: "Refrigerator", type: "refrigerator", icon: "Refrigerator" },
    { room: "Kitchen", name: "Kitchen Cabinet", type: "kitchen_cabinet", icon: "Archive" },
    { room: "Kitchen", name: "Pantry", type: "pantry", icon: "Warehouse" },
    { room: "Bedroom 1", name: "Bed", type: "bed", icon: "Bed" },
    { room: "Bedroom 1", name: "Wardrobe", type: "wardrobe", icon: "Shirt" },
    { room: "Bedroom 1", name: "Bedside Table", type: "bedside_table", icon: "Lamp" },
    { room: "Bedroom 2", name: "Bed", type: "bed", icon: "Bed" },
    { room: "Bedroom 2", name: "Wardrobe", type: "wardrobe", icon: "Shirt" },
    { room: "Bedroom 2", name: "Study Table", type: "study_table", icon: "Table2" },
  ];
  const { data: furniture } = await supabase
    .from("furniture")
    .insert(
      furnitureDefs.map((f, i) => ({
        user_id: user.id,
        room_id: roomByName[f.room].id,
        name: f.name,
        type: f.type,
        icon: f.icon,
        sort_order: i,
      }))
    )
    .select();
  if (!furniture) throw new Error("Failed to create furniture");
  const furnitureKey = (room: string, name: string) => `${room}::${name}`;
  const furnitureByKey = Object.fromEntries(
    furniture.map((f) => {
      const def = furnitureDefs.find((d) => d.name === f.name && roomByName[d.room].id === f.room_id)!;
      return [furnitureKey(def.room, def.name), f];
    })
  );

  const storageDefs: { room: string; furniture: string; name: string }[] = [
    { room: "Bedroom 1", furniture: "Wardrobe", name: "Top Shelf" },
    { room: "Bedroom 1", furniture: "Wardrobe", name: "Middle Shelf" },
    { room: "Bedroom 1", furniture: "Wardrobe", name: "Section B" },
    { room: "Bedroom 1", furniture: "Bedside Table", name: "Drawer 1" },
    { room: "Bedroom 2", furniture: "Wardrobe", name: "Top Shelf" },
    { room: "Bedroom 2", furniture: "Wardrobe", name: "Bottom Shelf" },
    { room: "Bedroom 2", furniture: "Study Table", name: "Drawer 2" },
    { room: "Hall", furniture: "TV Unit", name: "Drawer 2" },
    { room: "Hall", furniture: "Storage Cabinet", name: "Cabinet 1" },
    { room: "Kitchen", furniture: "Kitchen Cabinet", name: "Cabinet 3" },
    { room: "Kitchen", furniture: "Kitchen Cabinet", name: "Drawer 2" },
    { room: "Kitchen", furniture: "Pantry", name: "Shelf 2" },
  ];
  const { data: storageLocations } = await supabase
    .from("storage_locations")
    .insert(
      storageDefs.map((s, i) => ({
        user_id: user.id,
        furniture_id: furnitureByKey[furnitureKey(s.room, s.furniture)].id,
        name: s.name,
        type: "shelf",
        sort_order: i,
      }))
    )
    .select();
  if (!storageLocations) throw new Error("Failed to create storage locations");
  const storageKey = (room: string, furn: string, name: string) => `${room}::${furn}::${name}`;
  const storageByKey = Object.fromEntries(
    storageLocations.map((s) => {
      const def = storageDefs.find(
        (d) => d.name === s.name && furnitureByKey[furnitureKey(d.room, d.furniture)].id === s.furniture_id
      )!;
      return [storageKey(def.room, def.furniture, def.name), s];
    })
  );

  const itemDefs = [
    {
      loc: storageKey("Bedroom 1", "Wardrobe", "Top Shelf"),
      name: "Passport",
      category: "documents",
      container: "Blue Folder",
      description: "Primary passport",
      tags: ["Travel", "Important"],
      important: true,
    },
    {
      loc: storageKey("Bedroom 1", "Wardrobe", "Top Shelf"),
      name: "Property Documents",
      category: "documents",
      container: "File Box",
      description: "Property papers and certificates",
      tags: ["Important"],
      important: true,
    },
    {
      loc: storageKey("Bedroom 1", "Wardrobe", "Section B"),
      name: "Winter Jacket",
      category: "clothes",
      tags: ["Winter"],
    },
    {
      loc: storageKey("Bedroom 1", "Bedside Table", "Drawer 1"),
      name: "Spare Keys",
      category: "personal",
      tags: ["Emergency"],
      important: true,
    },
    {
      loc: storageKey("Bedroom 2", "Study Table", "Drawer 2"),
      name: "Laptop Charger",
      category: "electronics",
      tags: ["Daily Use", "Work"],
    },
    {
      loc: storageKey("Hall", "TV Unit", "Drawer 2"),
      name: "Camera",
      category: "electronics",
      description: "Sony mirrorless camera",
      tags: ["Rarely Used"],
      favorite: true,
    },
    {
      loc: storageKey("Hall", "Storage Cabinet", "Cabinet 1"),
      name: "Old Photos",
      category: "personal",
      container: "Blue Box 01",
      tags: ["Personal"],
    },
    {
      loc: storageKey("Kitchen", "Kitchen Cabinet", "Drawer 2"),
      name: "Warranty Cards",
      category: "documents",
      tags: ["Important"],
    },
    {
      loc: storageKey("Kitchen", "Pantry", "Shelf 2"),
      name: "Baking Tools",
      category: "kitchen",
      tags: ["Daily Use"],
    },
    {
      loc: storageKey("Bedroom 2", "Wardrobe", "Bottom Shelf"),
      name: "Screwdriver Set",
      category: "tools",
      tags: ["Rarely Used"],
    },
    {
      loc: storageKey("Kitchen", "Kitchen Cabinet", "Cabinet 3"),
      name: "Important Receipts",
      category: "documents",
      tags: ["Important"],
    },
    {
      loc: storageKey("Bedroom 2", "Wardrobe", "Top Shelf"),
      name: "Winter Clothes",
      category: "clothes",
      tags: ["Winter"],
    },
  ];

  await supabase.from("items").insert(
    itemDefs.map((it) => ({
      user_id: user.id,
      storage_location_id: storageByKey[it.loc].id,
      name: it.name,
      category: it.category,
      description: it.description ?? null,
      container: it.container ?? null,
      tags: it.tags ?? [],
      is_favorite: it.favorite ?? false,
      is_important: it.important ?? false,
      quantity: 1,
    }))
  );

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
