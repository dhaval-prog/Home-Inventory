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

/**
 * A member's role within one household — separate from any global app role,
 * and separate from the caller's role in any OTHER household (see
 * household_members: one row per household/user pair). Enforced by RLS
 * (is_household_member/is_household_owner/can_invite_to_household/
 * can_contribute_to_household/has_home_access in supabase/schema.sql), never
 * trusted from the client alone. `co_owner` is granted only by the owner
 * promoting an existing member (updateMemberRole) — it's never a directly
 * invitable role, see HouseholdInviteRole below. `split_only` is the one role
 * that gets SPLIT_ACCESS (Let's Split) without HOME_ACCESS/SAVINGS_ACCESS to
 * the rest of the household — see has_home_access() and
 * src/components/household/split/split-only-workspace.tsx.
 */
export type HouseholdRole = "owner" | "co_owner" | "member" | "viewer" | "limited_member" | "split_only";

/** Roles a household invite can grant directly — co_owner is promotion-only, never invited into directly. */
export type HouseholdInviteRole = "member" | "viewer" | "limited_member" | "split_only";

/** private = owner only, selected = specific members, home = every member. */
export type HouseholdVisibility = "private" | "selected" | "home";

export type Household = {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  created_at: string;
  settings: Record<string, unknown>;
};

export type HouseholdMember = {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
};

export type HouseholdInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type HouseholdInvite = {
  id: string;
  household_id: string;
  token: string;
  created_by: string;
  role: HouseholdInviteRole;
  status: HouseholdInviteStatus;
  expires_at: string;
  created_at: string;
};

export type HouseholdVaultType = "shared" | "goal";

/**
 * A container for pooled money — the balance is never stored here, always
 * derived live by summing household_vault_transactions for this vault_id
 * (mirrors how vault_transactions/getVaultSummary already works for the
 * unchanged personal vault).
 */
export type HouseholdVault = {
  id: string;
  household_id: string;
  vault_type: HouseholdVaultType;
  name: string;
  visibility: HouseholdVisibility;
  created_by: string;
  created_at: string;
};

export type HouseholdGoalStatus = "active" | "completed" | "archived";

export type HouseholdGoal = {
  id: string;
  household_id: string;
  vault_id: string;
  created_by: string;
  name: string;
  icon: string;
  target_amount: number;
  deadline: string | null;
  status: HouseholdGoalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HouseholdVaultTransactionSource = "personal_vault" | "external";

export type HouseholdVaultTransaction = {
  id: string;
  household_id: string;
  vault_id: string;
  user_id: string;
  type: "add" | "deduct";
  amount: number;
  source: HouseholdVaultTransactionSource;
  /** The personal-vault deduction row that funded this contribution, when source is "personal_vault". */
  source_personal_txn_id: string | null;
  comment: string | null;
  visibility: HouseholdVisibility;
  created_at: string;
};

export type HouseholdActivity = {
  id: string;
  household_id: string;
  actor_user_id: string;
  /** "contribution" | "goal_created" | "goal_completed" | "member_joined" — kept as a plain string since new kinds are additive and don't need a schema migration. */
  kind: string;
  payload: Record<string, unknown>;
  visibility: HouseholdVisibility;
  created_at: string;
  /** Scopes this row to one goal (contribution to a goal vault, goal_created) — gated by that goal's own membership in RLS, not household-wide access. Null for shared-vault/member activity. */
  goal_id: string | null;
};

/**
 * New Goal's own membership — independent of Let's Split (split_members) and
 * of plain household membership. Being a household member does NOT by
 * itself grant goal visibility; only an explicit row here does (see
 * is_goal_member()/household_goals_select_member in supabase/schema.sql).
 */
export type HouseholdGoalMember = {
  goal_id: string;
  user_id: string;
  added_by: string;
  joined_at: string;
};

export type HouseholdChatMessageKind = "user" | "system";

export type HouseholdChatMessage = {
  id: string;
  household_id: string;
  user_id: string;
  message: string;
  kind: HouseholdChatMessageKind;
  /** Rendering hint only — e.g. { type: "suggest_goal", name, target_amount } — never used to auto-mutate anything by itself. */
  metadata: Record<string, unknown>;
  created_at: string;
  /** Set when the sender edits the message; null if never edited. */
  edited_at: string | null;
};

/** A read receipt: user_id has seen message_id as of seen_at. */
export type HouseholdChatMessageRead = {
  message_id: string;
  user_id: string;
  seen_at: string;
};

/**
 * Let's Split — shared-expense splitting, deliberately separate from
 * household_vaults/household_goals (savings). A household always has one
 * default SplitGroup ("Household Expenses"), membership auto-synced to
 * household_members; the tables also support additional named groups (a
 * future UI layer), which is why every row still carries a group_id.
 */
export type SplitGroup = {
  id: string;
  household_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
};

export type SplitMember = {
  group_id: string;
  user_id: string;
  joined_at: string;
};

export type SplitShareType = "equal" | "exact" | "percentage" | "shares";

export type SplitExpense = {
  id: string;
  group_id: string;
  household_id: string;
  created_by: string;
  description: string;
  amount: number;
  category: string | null;
  paid_by: string;
  expense_date: string;
  comment: string | null;
  receipt_url: string | null;
  split_method: SplitShareType;
  created_at: string;
  updated_at: string;
};

/**
 * One participant's share of one expense. owed_amount always sums to the
 * expense's amount across all participants (enforced server-side in
 * record_split_expense/update_split_expense) — a participant's net position
 * is (paid_by === user_id ? amount : 0) - owed_amount.
 */
export type SplitExpenseParticipant = {
  expense_id: string;
  user_id: string;
  share_type: SplitShareType;
  share_value: number | null;
  owed_amount: number;
};

export type SplitSettlementMethod = "cash" | "bank_transfer" | "upi" | "other";

/** A record of money that changed hands outside the app — never a payment integration. */
export type SplitSettlement = {
  id: string;
  group_id: string;
  household_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  method: SplitSettlementMethod;
  recorded_by: string;
  comment: string | null;
  settled_at: string;
  created_at: string;
};

export type SplitChatMessageKind = "user" | "system";

/**
 * Split Chat — scoped to one split group, not a household. SPLIT_CHAT_ACCESS
 * (is_split_group_member(group_id) in supabase/schema.sql) is independent of
 * HOME_CHAT_ACCESS (household_chat_messages/has_home_access): a split_only
 * member gets this without Home Chat, and a household member only gets a
 * given group's chat if they actually belong to that group.
 */
export type SplitChatMessage = {
  id: string;
  group_id: string;
  household_id: string;
  user_id: string;
  message: string;
  kind: SplitChatMessageKind;
  /** Rendering hint only — e.g. { type: "suggest_expense", description, amount } — never used to auto-create an expense by itself. */
  metadata: Record<string, unknown>;
  edited_at: string | null;
  created_at: string;
};

export type HouseholdGoalChatMessageKind = "user" | "system";

/**
 * Goal Chat — the New Goal mirror of Split Chat: scoped to one goal via
 * is_goal_member(goal_id), independent of both Split Chat's
 * is_split_group_member(group_id) and Home Chat's has_home_access(). Never
 * merged with either — see the CORE RULE in supabase/schema.sql's "Goal
 * Chat" section.
 */
export type HouseholdGoalChatMessage = {
  id: string;
  goal_id: string;
  household_id: string;
  user_id: string;
  message: string;
  kind: HouseholdGoalChatMessageKind;
  metadata: Record<string, unknown>;
  edited_at: string | null;
  created_at: string;
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
      households: {
        Row: Household;
        Insert: Partial<Household> & { code: string; name: string; owner_id: string };
        Update: Partial<Household>;
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMember;
        Insert: Partial<HouseholdMember> & { household_id: string; user_id: string; role: HouseholdRole };
        Update: Partial<HouseholdMember>;
        Relationships: [];
      };
      household_invites: {
        Row: HouseholdInvite;
        Insert: Partial<HouseholdInvite> & {
          household_id: string;
          token: string;
          created_by: string;
          role: HouseholdInviteRole;
        };
        Update: Partial<HouseholdInvite>;
        Relationships: [];
      };
      household_vaults: {
        Row: HouseholdVault;
        Insert: Partial<HouseholdVault> & {
          household_id: string;
          vault_type: HouseholdVaultType;
          name: string;
          created_by: string;
        };
        Update: Partial<HouseholdVault>;
        Relationships: [];
      };
      household_goals: {
        Row: HouseholdGoal;
        Insert: Partial<HouseholdGoal> & {
          household_id: string;
          vault_id: string;
          created_by: string;
          name: string;
          target_amount: number;
        };
        Update: Partial<HouseholdGoal>;
        Relationships: [];
      };
      household_vault_transactions: {
        Row: HouseholdVaultTransaction;
        Insert: Partial<HouseholdVaultTransaction> & {
          household_id: string;
          vault_id: string;
          user_id: string;
          type: "add" | "deduct";
          amount: number;
        };
        Update: Partial<HouseholdVaultTransaction>;
        Relationships: [];
      };
      household_activity: {
        Row: HouseholdActivity;
        Insert: Partial<HouseholdActivity> & { household_id: string; actor_user_id: string; kind: string };
        Update: Partial<HouseholdActivity>;
        Relationships: [];
      };
      household_chat_messages: {
        Row: HouseholdChatMessage;
        Insert: Partial<HouseholdChatMessage> & { household_id: string; user_id: string; message: string };
        Update: Partial<HouseholdChatMessage>;
        Relationships: [];
      };
      household_chat_message_reads: {
        Row: HouseholdChatMessageRead;
        Insert: Partial<HouseholdChatMessageRead> & { message_id: string; user_id: string };
        Update: Partial<HouseholdChatMessageRead>;
        Relationships: [];
      };
      split_groups: {
        Row: SplitGroup;
        Insert: Partial<SplitGroup> & { household_id: string; name: string; created_by: string };
        Update: Partial<SplitGroup>;
        Relationships: [];
      };
      split_members: {
        Row: SplitMember;
        Insert: Partial<SplitMember> & { group_id: string; user_id: string };
        Update: Partial<SplitMember>;
        Relationships: [];
      };
      split_expenses: {
        Row: SplitExpense;
        Insert: Partial<SplitExpense> & {
          group_id: string;
          household_id: string;
          created_by: string;
          description: string;
          amount: number;
          paid_by: string;
          split_method: SplitShareType;
        };
        Update: Partial<SplitExpense>;
        Relationships: [];
      };
      split_expense_participants: {
        Row: SplitExpenseParticipant;
        Insert: Partial<SplitExpenseParticipant> & {
          expense_id: string;
          user_id: string;
          share_type: SplitShareType;
          owed_amount: number;
        };
        Update: Partial<SplitExpenseParticipant>;
        Relationships: [];
      };
      split_settlements: {
        Row: SplitSettlement;
        Insert: Partial<SplitSettlement> & {
          group_id: string;
          household_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          method: SplitSettlementMethod;
          recorded_by: string;
        };
        Update: Partial<SplitSettlement>;
        Relationships: [];
      };
      split_chat_messages: {
        Row: SplitChatMessage;
        Insert: Partial<SplitChatMessage> & { group_id: string; household_id: string; user_id: string; message: string };
        Update: Partial<SplitChatMessage>;
        Relationships: [];
      };
      household_goal_members: {
        Row: HouseholdGoalMember;
        Insert: Partial<HouseholdGoalMember> & { goal_id: string; user_id: string; added_by: string };
        Update: Partial<HouseholdGoalMember>;
        Relationships: [];
      };
      household_goal_chat_messages: {
        Row: HouseholdGoalChatMessage;
        Insert: Partial<HouseholdGoalChatMessage> & { goal_id: string; household_id: string; user_id: string; message: string };
        Update: Partial<HouseholdGoalChatMessage>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      contribute_to_household_vault: {
        Args: { p_vault_id: string; p_amount: number; p_source: HouseholdVaultTransactionSource; p_comment?: string | null };
        Returns: { ok: boolean; personal_txn_id: string | null };
      };
      create_household_goal: {
        Args: {
          p_household_id: string;
          p_name: string;
          p_icon: string | null;
          p_target_amount: number;
          p_deadline?: string | null;
          p_notes?: string | null;
        };
        Returns: { ok: boolean; goal_id: string; vault_id: string };
      };
      delete_household_goal: {
        Args: { p_goal_id: string };
        Returns: { ok: boolean };
      };
      redeem_household_invite: {
        Args: { p_token: string };
        Returns: { ok: boolean; household_id: string };
      };
      mark_household_chat_seen: {
        Args: { p_household_id: string };
        Returns: void;
      };
      record_split_expense: {
        Args: {
          p_group_id: string;
          p_description: string;
          p_amount: number;
          p_category: string | null;
          p_expense_date: string | null;
          p_comment: string | null;
          p_split_method: SplitShareType;
          p_participants: { user_id: string; share_type: SplitShareType; share_value: number | null; owed_amount: number }[];
        };
        Returns: { ok: boolean; expense_id: string };
      };
      update_split_expense: {
        Args: {
          p_expense_id: string;
          p_description: string;
          p_amount: number;
          p_category: string | null;
          p_paid_by: string;
          p_expense_date: string | null;
          p_comment: string | null;
          p_split_method: SplitShareType;
          p_participants: { user_id: string; share_type: SplitShareType; share_value: number | null; owed_amount: number }[];
        };
        Returns: { ok: boolean };
      };
      delete_split_expense: {
        Args: { p_expense_id: string };
        Returns: { ok: boolean };
      };
      add_goal_member: {
        Args: { p_goal_id: string; p_user_id: string };
        Returns: { ok: boolean };
      };
      remove_goal_member: {
        Args: { p_goal_id: string; p_user_id: string };
        Returns: { ok: boolean };
      };
      add_split_group_member: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: { ok: boolean };
      };
      remove_split_group_member: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: { ok: boolean };
      };
      record_split_settlement: {
        Args: {
          p_group_id: string;
          p_from_user: string;
          p_to_user: string;
          p_amount: number;
          p_method: SplitSettlementMethod;
          p_comment: string | null;
        };
        Returns: { ok: boolean; settlement_id: string };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
