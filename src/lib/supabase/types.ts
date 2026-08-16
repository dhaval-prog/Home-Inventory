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
  position_x: number | null;
  position_z: number | null;
  rotation_y: number | null;
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

export type VaultTransactionType = "add" | "deduct" | "recurring";
export type VaultTransactionSource = "manual" | "voice" | "machine" | "scheduled";

export type VaultTransaction = {
  id: string;
  user_id: string;
  type: VaultTransactionType;
  amount: number;
  category: string | null;
  comment: string | null;
  label: string | null;
  source: VaultTransactionSource;
  /** Raw transcript that produced this row, if voice-sourced — audit-only, never shown to the user unprompted. */
  voice_command: string | null;
  /** The classified assistant intent (e.g. "deduct_money") that produced this row, if voice-sourced. */
  normalized_intent: string | null;
  /** Best-effort link to a matching home-inventory item (e.g. a purchase deduction linked to the item it bought). */
  related_item_id: string | null;
  created_at: string;
};

export type VaultRecurringScheduleMode = "salary" | "date";

export type VaultRecurringPlan = {
  id: string;
  user_id: string;
  amount: number;
  schedule_mode: VaultRecurringScheduleMode;
  day_of_month: number;
  enabled: boolean;
  next_run_date: string;
  last_run_at: string | null;
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
      vault_transactions: {
        Row: VaultTransaction;
        Insert: Partial<VaultTransaction> & { type: VaultTransactionType; amount: number };
        Update: Partial<VaultTransaction>;
        Relationships: [];
      };
      vault_recurring_plans: {
        Row: VaultRecurringPlan;
        Insert: Partial<VaultRecurringPlan> & { amount: number };
        Update: Partial<VaultRecurringPlan>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
