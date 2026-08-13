// Hand-written Database types matching supabase/schema.sql.
// If you change the schema, keep this in sync (or generate with
// `supabase gen types typescript` once the Supabase CLI is linked).
//
// NOTE: these are `type` aliases rather than `interface`s on purpose —
// interfaces aren't structurally assignable to Record<string, unknown>,
// which breaks the Database["public"]["Tables"] extends GenericSchema
// check that @supabase/supabase-js relies on to type `.from(...)` calls.

export type HomeType = "1bhk" | "2bhk" | "3bhk" | "custom";

export type Profile = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
};

export type Home = {
  id: string;
  user_id: string;
  name: string;
  home_type: HomeType;
  created_at: string;
};

export type Room = {
  id: string;
  user_id: string;
  home_id: string;
  name: string;
  type: string;
  icon: string;
  sort_order: number;
  created_at: string;
};

export type Furniture = {
  id: string;
  user_id: string;
  room_id: string;
  name: string;
  type: string;
  icon: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type StorageLocation = {
  id: string;
  user_id: string;
  furniture_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type Item = {
  id: string;
  user_id: string;
  storage_location_id: string;
  name: string;
  category: string;
  description: string | null;
  quantity: number;
  container: string | null;
  photo_url: string | null;
  tags: string[];
  is_favorite: boolean;
  is_important: boolean;
  qr_code: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      homes: {
        Row: Home;
        Insert: Partial<Home> & { name: string };
        Update: Partial<Home>;
        Relationships: [];
      };
      rooms: {
        Row: Room;
        Insert: Partial<Room> & { name: string; home_id: string };
        Update: Partial<Room>;
        Relationships: [];
      };
      furniture: {
        Row: Furniture;
        Insert: Partial<Furniture> & { name: string; room_id: string };
        Update: Partial<Furniture>;
        Relationships: [];
      };
      storage_locations: {
        Row: StorageLocation;
        Insert: Partial<StorageLocation> & { name: string; furniture_id: string };
        Update: Partial<StorageLocation>;
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: Partial<Item> & { name: string; storage_location_id: string };
        Update: Partial<Item>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
