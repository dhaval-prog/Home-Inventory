-- Home Inventory & "Where Is It?" — Database Schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS where possible.

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- profiles — one row per auth.users, created automatically on signup
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- homes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  home_type text not null default 'custom' check (home_type in ('1bhk', '2bhk', '3bhk', 'custom')),
  created_at timestamptz not null default now()
);
create index if not exists homes_user_id_idx on public.homes (user_id);

-- ─────────────────────────────────────────────────────────────
-- rooms
-- ─────────────────────────────────────────────────────────────
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  type text not null default 'other',
  icon text not null default 'DoorOpen',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rooms_home_id_idx on public.rooms (home_id);
create index if not exists rooms_user_id_idx on public.rooms (user_id);

-- ─────────────────────────────────────────────────────────────
-- furniture
-- ─────────────────────────────────────────────────────────────
create table if not exists public.furniture (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null,
  type text not null default 'other',
  icon text not null default 'Package',
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists furniture_room_id_idx on public.furniture (room_id);
create index if not exists furniture_user_id_idx on public.furniture (user_id);

-- Free-form 2D/3D placement within the room, in meters, room-local (origin at
-- room center). Null means "not yet dragged" — auto-arranged in a grid instead.
alter table public.furniture add column if not exists position_x double precision;
alter table public.furniture add column if not exists position_z double precision;
-- Rotation around the vertical axis, in degrees. Null/0 means "not yet rotated".
alter table public.furniture add column if not exists rotation_y double precision;

-- ─────────────────────────────────────────────────────────────
-- storage_locations — nested via parent_id so future arbitrary-depth
-- nesting (shelf → box → pouch …) works without a schema change.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  furniture_id uuid not null references public.furniture (id) on delete cascade,
  parent_id uuid references public.storage_locations (id) on delete cascade,
  name text not null,
  type text not null default 'shelf',
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists storage_locations_furniture_id_idx on public.storage_locations (furniture_id);
create index if not exists storage_locations_parent_id_idx on public.storage_locations (parent_id);
create index if not exists storage_locations_user_id_idx on public.storage_locations (user_id);

-- ─────────────────────────────────────────────────────────────
-- items
-- ─────────────────────────────────────────────────────────────
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations (id) on delete cascade,
  name text not null,
  category text not null default 'other',
  description text,
  quantity int not null default 1,
  container text,
  photo_url text,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  is_important boolean not null default false,
  -- Reserved for the future QR/barcode feature (section 22) — no UI yet.
  qr_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_storage_location_id_idx on public.items (storage_location_id);
create index if not exists items_user_id_idx on public.items (user_id);
create index if not exists items_name_idx on public.items using gin (to_tsvector('english', name));
create index if not exists items_tags_idx on public.items using gin (tags);

-- ─────────────────────────────────────────────────────────────
-- vault_transactions — ledger for the Vault savings feature. The balance is
-- always derived by summing this ledger (never cached), so it can't drift
-- from the transaction history — see getVaultSummary in src/lib/vault/ledger.ts.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.vault_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('add', 'deduct', 'recurring')),
  amount numeric not null check (amount > 0),
  category text,
  comment text,
  label text,
  source text not null default 'manual' check (source in ('manual', 'voice', 'machine')),
  created_at timestamptz not null default now()
);
create index if not exists vault_transactions_user_id_idx on public.vault_transactions (user_id);
create index if not exists vault_transactions_user_created_idx on public.vault_transactions (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- updated_at trigger for items
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row
  execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- vault voice assistant — extends vault_transactions with audit/linking
-- columns, and adds a per-user recurring-deposit plan actually executed by
-- a scheduled job (see src/app/api/vault/cron/recurring-run).
-- ─────────────────────────────────────────────────────────────
alter table public.vault_transactions add column if not exists voice_command text;
alter table public.vault_transactions add column if not exists normalized_intent text;
alter table public.vault_transactions add column if not exists related_item_id uuid references public.items (id) on delete set null;
create index if not exists vault_transactions_related_item_id_idx on public.vault_transactions (related_item_id);

-- widen the source check to allow cron-driven recurring deposits
alter table public.vault_transactions drop constraint if exists vault_transactions_source_check;
alter table public.vault_transactions add constraint vault_transactions_source_check
  check (source in ('manual', 'voice', 'machine', 'scheduled'));

create table if not exists public.vault_recurring_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  amount numeric not null check (amount > 0),
  schedule_mode text not null default 'salary' check (schedule_mode in ('salary', 'date')),
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  enabled boolean not null default true,
  next_run_date date not null default (current_date + interval '1 month')::date,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vault_recurring_plans_set_updated_at on public.vault_recurring_plans;
create trigger vault_recurring_plans_set_updated_at
  before update on public.vault_recurring_plans
  for each row
  execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- auto-create a profile row when a new auth user signs up
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security — every table is scoped to user_id = auth.uid()
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.rooms enable row level security;
alter table public.furniture enable row level security;
alter table public.storage_locations enable row level security;
alter table public.items enable row level security;
alter table public.vault_transactions enable row level security;
alter table public.vault_recurring_plans enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "homes_all_own" on public.homes;
create policy "homes_all_own" on public.homes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "rooms_all_own" on public.rooms;
create policy "rooms_all_own" on public.rooms for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "furniture_all_own" on public.furniture;
create policy "furniture_all_own" on public.furniture for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "storage_locations_all_own" on public.storage_locations;
create policy "storage_locations_all_own" on public.storage_locations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "items_all_own" on public.items;
create policy "items_all_own" on public.items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vault_transactions_all_own" on public.vault_transactions;
create policy "vault_transactions_all_own" on public.vault_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vault_recurring_plans_all_own" on public.vault_recurring_plans;
create policy "vault_recurring_plans_all_own" on public.vault_recurring_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for item / furniture photos
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

drop policy if exists "item_photos_read_all" on storage.objects;
create policy "item_photos_read_all" on storage.objects for select
  using (bucket_id = 'item-photos');

drop policy if exists "item_photos_insert_own" on storage.objects;
create policy "item_photos_insert_own" on storage.objects for insert
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "item_photos_update_own" on storage.objects;
create policy "item_photos_update_own" on storage.objects for update
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "item_photos_delete_own" on storage.objects;
create policy "item_photos_delete_own" on storage.objects for delete
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────
-- Households — multi-member households layered on top of the (unchanged)
-- per-user vault_transactions ledger. Deliberately separate from the
-- existing `homes` table (which is the single-owner 3D inventory concept);
-- a household is a group of people, not a physical house model.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  settings jsonb not null default '{}'
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'co_owner', 'member', 'viewer', 'limited_member', 'split_only')),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);
create index if not exists household_members_household_id_idx on public.household_members (household_id);
create index if not exists household_members_user_id_idx on public.household_members (user_id);

-- widen an existing install's role check to allow co_owner/split_only.
-- split_only is directly invitable (see household_invites' own role check
-- below, unlike co_owner which is promotion-only) — it's the one role that
-- gets SPLIT_ACCESS to Let's Split without HOME_ACCESS/SAVINGS_ACCESS to the
-- rest of the household (see has_home_access() below).
alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members add constraint household_members_role_check
  check (role in ('owner', 'co_owner', 'member', 'viewer', 'limited_member', 'split_only'));

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('member', 'viewer', 'limited_member', 'split_only')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

-- widen an existing install's invite-role check to allow split_only.
alter table public.household_invites drop constraint if exists household_invites_role_check;
alter table public.household_invites add constraint household_invites_role_check
  check (role in ('member', 'viewer', 'limited_member', 'split_only'));
create index if not exists household_invites_household_id_idx on public.household_invites (household_id);

-- Container for a pooled sum of money — every household gets exactly one
-- 'shared' vault (auto-created, see the trigger below); every household_goals
-- row owns exactly one 'goal' vault. Balance is never stored here — always
-- derived live by summing household_vault_transactions, mirroring how
-- vault_transactions/getVaultSummary already works for personal vaults.
create table if not exists public.household_vaults (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vault_type text not null check (vault_type in ('shared', 'goal')),
  name text not null,
  visibility text not null default 'home' check (visibility in ('private', 'selected', 'home')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists household_vaults_household_id_idx on public.household_vaults (household_id);

create table if not exists public.household_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vault_id uuid not null unique references public.household_vaults (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default '🎯',
  target_amount numeric not null check (target_amount > 0),
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_goals_household_id_idx on public.household_goals (household_id);

drop trigger if exists household_goals_set_updated_at on public.household_goals;
create trigger household_goals_set_updated_at
  before update on public.household_goals
  for each row
  execute function public.set_updated_at();

-- Ledger for household_vaults (both 'shared' and 'goal' vault types share
-- this one table). `source_personal_txn_id` links a contribution back to the
-- personal-vault deduction that funded it, when applicable — see the
-- contribute_to_household_vault() RPC below, which is the only place this
-- table should normally be written to.
create table if not exists public.household_vault_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vault_id uuid not null references public.household_vaults (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('add', 'deduct')),
  amount numeric not null check (amount > 0),
  source text not null default 'external' check (source in ('personal_vault', 'external')),
  source_personal_txn_id uuid references public.vault_transactions (id) on delete set null,
  comment text,
  visibility text not null default 'home' check (visibility in ('private', 'selected', 'home')),
  created_at timestamptz not null default now()
);
create index if not exists household_vault_txns_household_id_idx on public.household_vault_transactions (household_id);
create index if not exists household_vault_txns_vault_id_idx on public.household_vault_transactions (vault_id);
create index if not exists household_vault_txns_vault_created_idx on public.household_vault_transactions (vault_id, created_at desc);

create table if not exists public.household_activity (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  visibility text not null default 'home' check (visibility in ('private', 'selected', 'home')),
  created_at timestamptz not null default now()
);
create index if not exists household_activity_household_created_idx on public.household_activity (household_id, created_at desc);

-- Scopes an activity row to one specific goal (contribution/goal_created on
-- a goal vault) so its RLS can be gated by goal membership instead of
-- household-wide access — see the "Goal Membership" section below. Null for
-- shared-vault contributions, member_joined, and goal_deleted (once a goal
-- is gone, its "deleted" announcement is general household news, visible the
-- same way it always was) — "on delete set null" rather than cascade so a
-- goal's activity history outlives the goal row itself.
alter table public.household_activity add column if not exists goal_id uuid references public.household_goals (id) on delete set null;
create index if not exists household_activity_goal_id_idx on public.household_activity (goal_id);

-- ─────────────────────────────────────────────────────────────
-- Household RLS helpers — SECURITY DEFINER so a policy on household_members
-- itself can call is_household_member()/is_household_owner() without
-- recursively re-evaluating household_members' own RLS policy.
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.can_contribute_to_household(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'co_owner', 'member', 'limited_member')
  );
$$;

-- Owner and co-owner only — the one extra capability a promotion grants.
-- Deliberately NOT folded into is_household_owner: a co-owner can invite but
-- still can't update household_members (see household_members_update_owner),
-- so they can never promote anyone else, including themselves, to owner.
create or replace function public.can_invite_to_household(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'co_owner')
  );
$$;

-- SPLIT_ACCESS vs HOME_ACCESS/SAVINGS_ACCESS (see the permission-scope model
-- in the app spec): a split_only member is a real household_members row, but
-- gets none of the household's other visibility — household_vaults,
-- household_vault_transactions (shared vault), household_chat, the full
-- household_members roster, and household_invites all gate on this instead
-- of the plain is_household_member() they used before. household_activity is
-- the one exception: split_only members still see expense/settlement rows
-- there (see household_activity_select_split_activity below), just not
-- goal/contribution ones. household_goals is gated separately, by goal
-- membership (is_goal_member below), not by has_home_access at all — see the
-- "Goal Membership" section that follows.
create or replace function public.has_home_access(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid() and role != 'split_only'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Goal Membership — New Goal is its own collaboration space, independent
-- from Let's Split (split_groups/split_members) and from plain household
-- membership. Being a household member (even with full HOME_ACCESS) does
-- NOT by itself grant visibility into a goal — only an explicit
-- household_goal_members row does, added either automatically for the
-- goal's own creator (see create_household_goal below) or deliberately via
-- add_goal_member() ("Invite Members" inside New Goal). This mirrors how
-- split_members already works for Let's Split, so the two systems stay
-- structurally symmetric and equally isolated from each other.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.household_goal_members (
  goal_id uuid not null references public.household_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);
create index if not exists household_goal_members_user_id_idx on public.household_goal_members (user_id);
alter table public.household_goal_members enable row level security;

create or replace function public.is_goal_member(p_goal_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_goal_members
    where goal_id = p_goal_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_goal_member_check(p_goal_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from household_goal_members where goal_id = p_goal_id and user_id = p_user_id);
$$;

-- The goal's own creator, or the household owner — the same "owner or
-- creator" gate already used for editing/deleting the goal itself
-- (household_goals_update_owner_or_creator / _delete_owner_or_creator), now
-- reused for who may manage its member list.
create or replace function public.can_manage_goal(p_goal_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_goals g
    where g.id = p_goal_id and (g.created_by = auth.uid() or is_household_owner(g.household_id))
  );
$$;

drop policy if exists "household_goal_members_select" on public.household_goal_members;
create policy "household_goal_members_select" on public.household_goal_members for select
  using (is_goal_member(goal_id) or can_manage_goal(goal_id));
-- add_goal_member()/remove_goal_member() below are SECURITY INVOKER and the
-- real gate (can_manage_goal) — these policies are defense in depth, never a
-- looser rule than the functions enforce.
drop policy if exists "household_goal_members_insert_manager" on public.household_goal_members;
create policy "household_goal_members_insert_manager" on public.household_goal_members for insert
  with check (can_manage_goal(goal_id) and added_by = auth.uid());
drop policy if exists "household_goal_members_delete_manager_or_self" on public.household_goal_members;
create policy "household_goal_members_delete_manager_or_self" on public.household_goal_members for delete
  using (can_manage_goal(goal_id) or user_id = auth.uid());

-- On creating a household, automatically add the creator as 'owner' and
-- create the household's single shared vault — never left to client code to
-- do as two separate, possibly-partial steps.
create or replace function public.handle_new_household()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.household_vaults (household_id, vault_type, name, created_by)
  values (new.id, 'shared', 'Household Savings', new.owner_id);

  return new;
end;
$$;

drop trigger if exists on_household_created on public.households;
create trigger on_household_created
  after insert on public.households
  for each row
  execute function public.handle_new_household();

-- ─────────────────────────────────────────────────────────────
-- Atomic contribution — the one place money moves between a personal vault
-- and a household vault. SECURITY INVOKER: it runs as the calling user, so
-- every insert inside it still passes through the normal RLS policies below
-- (defense in depth) — it exists purely to make the two-table write atomic,
-- never to bypass permission checks.
-- ─────────────────────────────────────────────────────────────
create or replace function public.contribute_to_household_vault(
  p_vault_id uuid,
  p_amount numeric,
  p_source text,
  p_comment text default null
)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_household_id uuid;
  v_vault_name text;
  v_vault_type text;
  v_goal_id uuid;
  v_personal_txn_id uuid;
  v_personal_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_source not in ('personal_vault', 'external') then
    raise exception 'Invalid contribution source';
  end if;

  select household_id, name, vault_type into v_household_id, v_vault_name, v_vault_type from household_vaults where id = p_vault_id;
  if v_household_id is null then
    raise exception 'Vault not found';
  end if;

  -- A goal vault's own membership (household_goal_members) is the gate, not
  -- household-wide contribute permission — New Goal and Let's Split are
  -- separate collaboration spaces, and a household member with no goal
  -- membership must not be able to contribute to (or even see) this goal.
  if v_vault_type = 'goal' then
    select id into v_goal_id from household_goals where vault_id = p_vault_id;
    if not (is_goal_member(v_goal_id) or is_household_owner(v_household_id)) then
      raise exception 'You are not a member of this goal';
    end if;
  else
    if not can_contribute_to_household(v_household_id) then
      raise exception 'You do not have permission to contribute to this household';
    end if;
  end if;

  if p_source = 'personal_vault' then
    select coalesce(sum(case when type = 'add' then amount when type = 'deduct' then -amount else 0 end), 0)
      into v_personal_balance
      from vault_transactions
      where user_id = auth.uid();

    if v_personal_balance < p_amount then
      raise exception 'Insufficient personal vault balance';
    end if;

    insert into vault_transactions (user_id, type, amount, comment, source)
      values (auth.uid(), 'deduct', p_amount, coalesce(p_comment, 'Contribution to household vault'), 'manual')
      returning id into v_personal_txn_id;
  end if;

  insert into household_vault_transactions
    (household_id, vault_id, user_id, type, amount, source, source_personal_txn_id, comment)
    values (v_household_id, p_vault_id, auth.uid(), 'add', p_amount, p_source, v_personal_txn_id, p_comment);

  insert into household_activity (household_id, actor_user_id, kind, payload, goal_id)
    values (
      v_household_id, auth.uid(), 'contribution',
      jsonb_build_object('vault_id', p_vault_id, 'vault_name', v_vault_name, 'amount', p_amount, 'source', p_source),
      v_goal_id
    );

  return jsonb_build_object('ok', true, 'personal_txn_id', v_personal_txn_id);
end;
$$;

-- Creates a goal's dedicated vault and the goal row together, atomically —
-- avoids ever leaving an orphan vault with no goal wrapping it.
create or replace function public.create_household_goal(
  p_household_id uuid,
  p_name text,
  p_icon text,
  p_target_amount numeric,
  p_deadline date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_vault_id uuid;
  v_goal_id uuid;
begin
  if not can_contribute_to_household(p_household_id) then
    raise exception 'You do not have permission to create goals in this household';
  end if;
  if p_target_amount is null or p_target_amount <= 0 then
    raise exception 'Target amount must be greater than zero';
  end if;

  insert into household_vaults (household_id, vault_type, name, created_by)
    values (p_household_id, 'goal', p_name, auth.uid())
    returning id into v_vault_id;

  insert into household_goals (household_id, vault_id, created_by, name, icon, target_amount, deadline, notes)
    values (p_household_id, v_vault_id, auth.uid(), p_name, coalesce(p_icon, '🎯'), p_target_amount, p_deadline, p_notes)
    returning id into v_goal_id;

  -- The creator is always this goal's first member — everyone else needs an
  -- explicit invite (add_goal_member), never automatic household-wide access.
  insert into household_goal_members (goal_id, user_id, added_by) values (v_goal_id, auth.uid(), auth.uid());

  insert into household_activity (household_id, actor_user_id, kind, payload, goal_id)
    values (p_household_id, auth.uid(), 'goal_created', jsonb_build_object('goal_id', v_goal_id, 'name', p_name), v_goal_id);

  return jsonb_build_object('ok', true, 'goal_id', v_goal_id, 'vault_id', v_vault_id);
end;
$$;

-- Adds an existing household member to a specific goal's member list — New
-- Goal's own "Invite Members" action, deliberately not a token/invite flow:
-- the invitee is already part of the household, this just grants them
-- SPLIT_ACCESS-equivalent visibility into one goal, nothing else. Gated to
-- the goal's creator or the household owner (can_manage_goal), same as
-- editing/deleting the goal itself.
create or replace function public.add_goal_member(p_goal_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if not can_manage_goal(p_goal_id) then
    raise exception 'You do not have permission to manage this goal''s members';
  end if;
  select household_id into v_household_id from household_goals where id = p_goal_id;
  if p_user_id not in (select user_id from household_members where household_id = v_household_id) then
    raise exception 'That person is not a member of this household';
  end if;

  insert into household_goal_members (goal_id, user_id, added_by)
    values (p_goal_id, p_user_id, auth.uid())
    on conflict (goal_id, user_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_goal_member(p_goal_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_goal record;
begin
  select * into v_goal from household_goals where id = p_goal_id;
  if v_goal is null then
    raise exception 'Goal not found';
  end if;
  if not (can_manage_goal(p_goal_id) or p_user_id = auth.uid()) then
    raise exception 'You do not have permission to remove this member';
  end if;
  if p_user_id = v_goal.created_by then
    raise exception 'The goal creator can''t be removed from their own goal';
  end if;

  delete from household_goal_members where goal_id = p_goal_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Deletes a goal and everything that belongs only to it (its vault, cascading
-- to household_vault_transactions — see the FKs above), gated to the
-- household owner or whoever created the goal. SECURITY INVOKER: the explicit
-- check below is the real gate, but every delete still passes through the
-- household_goals_delete_owner_or_creator / household_vaults_delete_owner_or_creator
-- RLS policies too (defense in depth, never a bypass).
create or replace function public.delete_household_goal(p_goal_id uuid)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_goal record;
begin
  select * into v_goal from household_goals where id = p_goal_id;
  if v_goal is null then
    raise exception 'Goal not found';
  end if;
  if not (is_household_owner(v_goal.household_id) or v_goal.created_by = auth.uid()) then
    raise exception 'You do not have permission to delete this goal';
  end if;

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (v_goal.household_id, auth.uid(), 'goal_deleted', jsonb_build_object('name', v_goal.name));

  delete from household_vaults where id = v_goal.vault_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Redeeming an invite happens before the user is a household member, so this
-- runs SECURITY DEFINER to look up the invite (bypassing the membership-gated
-- household_invites RLS below) and insert the new membership row.
create or replace function public.redeem_household_invite(p_token text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite record;
begin
  select * into v_invite from household_invites
    where token = p_token and status = 'pending' and expires_at > now();

  if v_invite is null then
    raise exception 'This invite is invalid or has expired';
  end if;
  if exists (select 1 from household_members where household_id = v_invite.household_id and user_id = auth.uid()) then
    raise exception 'You are already a member of this household';
  end if;

  insert into household_members (household_id, user_id, role)
    values (v_invite.household_id, auth.uid(), v_invite.role);

  -- split_only is the one household-level role whose entire purpose is
  -- Let's Split access, so redeeming that invite adds the new member to the
  -- household's default split group directly here — plain household
  -- membership no longer auto-grants split group membership (see the
  -- removed sync trigger below the Let's Split section), so this is the one
  -- deliberate exception, scoped to exactly the role built for it.
  if v_invite.role = 'split_only' then
    insert into split_members (group_id, user_id)
      select id, auth.uid() from split_groups where household_id = v_invite.household_id and is_default
      on conflict do nothing;
  end if;

  update household_invites set status = 'accepted' where id = v_invite.id;

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (v_invite.household_id, auth.uid(), 'member_joined', '{}');

  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Household RLS
-- ─────────────────────────────────────────────────────────────
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_vaults enable row level security;
alter table public.household_goals enable row level security;
alter table public.household_vault_transactions enable row level security;
alter table public.household_activity enable row level security;

-- owner_id = auth.uid() is included directly (not just is_household_member)
-- because INSERT ... RETURNING re-checks the SELECT policy against the new
-- row, and the AFTER INSERT trigger's own household_members row isn't
-- guaranteed visible to that check yet — the owner must always be able to
-- see a household they just created.
drop policy if exists "households_select_member" on public.households;
create policy "households_select_member" on public.households for select
  using (is_household_member(id) or owner_id = auth.uid());
drop policy if exists "households_insert_self_owner" on public.households;
create policy "households_insert_self_owner" on public.households for insert
  with check (owner_id = auth.uid());
drop policy if exists "households_update_owner" on public.households;
create policy "households_update_owner" on public.households for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "households_delete_owner" on public.households;
create policy "households_delete_owner" on public.households for delete
  using (owner_id = auth.uid());

-- Full roster (with roles) is HOME_ACCESS-gated — a split_only member sees
-- only their own row here (household_members_select_self below), never the
-- rest of the household. That still lets getHouseholdContext() resolve
-- "what's MY role" for them without leaking anyone else's.
drop policy if exists "household_members_select_member" on public.household_members;
create policy "household_members_select_member" on public.household_members for select
  using (has_home_access(household_id));
drop policy if exists "household_members_select_self" on public.household_members;
create policy "household_members_select_self" on public.household_members for select
  using (user_id = auth.uid());
drop policy if exists "household_members_insert_self" on public.household_members;
create policy "household_members_insert_self" on public.household_members for insert
  with check (user_id = auth.uid());
-- Owner-only, deliberately not can_invite_to_household — this is the one
-- policy that gates promoteToCoOwner()/updateMemberRole(), so a co-owner can
-- never promote anyone (including themselves) to owner or co-owner.
drop policy if exists "household_members_update_owner" on public.household_members;
create policy "household_members_update_owner" on public.household_members for update
  using (is_household_owner(household_id)) with check (is_household_owner(household_id));
drop policy if exists "household_members_delete_owner_or_self" on public.household_members;
create policy "household_members_delete_owner_or_self" on public.household_members for delete
  using (is_household_owner(household_id) or user_id = auth.uid());

-- profiles_select_own (above) only ever exposes a user's own row, so every
-- other member of a shared household previously fell back to a generic
-- "Member" label in the UI — this additive policy (RLS OR's policies for the
-- same command together) lets co-members see each other's name/avatar without
-- widening access to unrelated users.
drop policy if exists "profiles_select_household_members" on public.profiles;
create policy "profiles_select_household_members" on public.profiles for select
  using (
    exists (
      select 1 from household_members hm_self
      join household_members hm_target on hm_target.household_id = hm_self.household_id
      where hm_self.user_id = auth.uid() and hm_target.user_id = profiles.id
    )
  );

drop policy if exists "household_invites_select_member" on public.household_invites;
create policy "household_invites_select_member" on public.household_invites for select
  using (has_home_access(household_id));
-- Owner or co-owner may generate an invite — see can_invite_to_household()
-- above. This is the real permission gate; generateInvite()/InviteMemberDialog
-- only ever hide the UI for everyone else.
drop policy if exists "household_invites_insert_owner" on public.household_invites;
drop policy if exists "household_invites_insert_inviter" on public.household_invites;
create policy "household_invites_insert_inviter" on public.household_invites for insert
  with check (can_invite_to_household(household_id) and created_by = auth.uid());
drop policy if exists "household_invites_update_owner" on public.household_invites;
drop policy if exists "household_invites_update_inviter" on public.household_invites;
create policy "household_invites_update_inviter" on public.household_invites for update
  using (can_invite_to_household(household_id)) with check (can_invite_to_household(household_id));

-- household_vaults holds both the household's one 'shared' vault (Household
-- Savings — HOME_ACCESS-gated, unrelated to this feature) and every goal's
-- own 'goal' vault (gated by that goal's own membership instead — New Goal
-- is its own space, isolated from plain household access same as Let's
-- Split's split_expenses/split_groups are).
drop policy if exists "household_vaults_select_member" on public.household_vaults;
drop policy if exists "household_vaults_select_shared" on public.household_vaults;
create policy "household_vaults_select_shared" on public.household_vaults for select
  using (vault_type = 'shared' and has_home_access(household_id));
drop policy if exists "household_vaults_select_goal" on public.household_vaults;
create policy "household_vaults_select_goal" on public.household_vaults for select
  using (
    vault_type = 'goal'
    and exists (
      select 1 from household_goals g
      where g.vault_id = household_vaults.id and (is_goal_member(g.id) or is_household_owner(household_vaults.household_id))
    )
  );
drop policy if exists "household_vaults_insert_goal" on public.household_vaults;
create policy "household_vaults_insert_goal" on public.household_vaults for insert
  with check (vault_type = 'goal' and can_contribute_to_household(household_id) and created_by = auth.uid());
drop policy if exists "household_vaults_update_owner" on public.household_vaults;
create policy "household_vaults_update_owner" on public.household_vaults for update
  using (is_household_owner(household_id)) with check (is_household_owner(household_id));
-- Deleting a goal's vault (see delete_household_goal() below) cascades to its
-- household_goals row and household_vault_transactions — gated the same way
-- as the goal itself: the household owner, or whoever created that goal.
drop policy if exists "household_vaults_delete_owner_or_creator" on public.household_vaults;
create policy "household_vaults_delete_owner_or_creator" on public.household_vaults for delete
  using (is_household_owner(household_id) or created_by = auth.uid());

-- Gated by goal membership, not has_home_access — a household member (even
-- with full HOME_ACCESS) sees a goal only if they're one of its explicit
-- household_goal_members, or the household owner (who can always manage
-- everything). This is what makes "New Goal ✅ / Let's Split ❌" (and the
-- reverse) actually possible per-person, not just per-role.
drop policy if exists "household_goals_select_member" on public.household_goals;
create policy "household_goals_select_member" on public.household_goals for select
  using (is_goal_member(id) or is_household_owner(household_id));
drop policy if exists "household_goals_insert_contributor" on public.household_goals;
create policy "household_goals_insert_contributor" on public.household_goals for insert
  with check (can_contribute_to_household(household_id) and created_by = auth.uid());
drop policy if exists "household_goals_update_owner_or_creator" on public.household_goals;
create policy "household_goals_update_owner_or_creator" on public.household_goals for update
  using (is_household_owner(household_id) or created_by = auth.uid())
  with check (is_household_owner(household_id) or created_by = auth.uid());
drop policy if exists "household_goals_delete_owner" on public.household_goals;
drop policy if exists "household_goals_delete_owner_or_creator" on public.household_goals;
create policy "household_goals_delete_owner_or_creator" on public.household_goals for delete
  using (is_household_owner(household_id) or created_by = auth.uid());

-- Same shared-vs-goal split as household_vaults above, joined through the
-- vault_id this transaction belongs to.
drop policy if exists "household_vault_txns_select_member" on public.household_vault_transactions;
drop policy if exists "household_vault_txns_select_shared" on public.household_vault_transactions;
create policy "household_vault_txns_select_shared" on public.household_vault_transactions for select
  using (
    has_home_access(household_id)
    and exists (select 1 from household_vaults v where v.id = household_vault_transactions.vault_id and v.vault_type = 'shared')
  );
drop policy if exists "household_vault_txns_select_goal" on public.household_vault_transactions;
create policy "household_vault_txns_select_goal" on public.household_vault_transactions for select
  using (
    exists (
      select 1 from household_goals g
      where g.vault_id = household_vault_transactions.vault_id
        and (is_goal_member(g.id) or is_household_owner(household_vault_transactions.household_id))
    )
  );
drop policy if exists "household_vault_txns_insert_contributor" on public.household_vault_transactions;
create policy "household_vault_txns_insert_contributor" on public.household_vault_transactions for insert
  with check (
    user_id = auth.uid()
    and (
      (
        can_contribute_to_household(household_id)
        and exists (select 1 from household_vaults v where v.id = household_vault_transactions.vault_id and v.vault_type = 'shared')
      )
      or exists (
        select 1 from household_goals g
        where g.vault_id = household_vault_transactions.vault_id and is_goal_member(g.id)
      )
    )
  );

-- goal_id is null for everything except goal-scoped rows (contribution to a
-- goal vault, goal_created) — those are gated by goal membership instead,
-- below, so a household member without that goal's membership never sees
-- them here even though they otherwise have has_home_access.
drop policy if exists "household_activity_select_member" on public.household_activity;
create policy "household_activity_select_member" on public.household_activity for select
  using (goal_id is null and has_home_access(household_id));
-- A split_only member doesn't get has_home_access, but still needs to see
-- expense/settlement activity for their own split group — this additive
-- policy (OR'd with the one above) opens exactly those kinds, never
-- goal/contribution/member-joined ones, to every household member.
drop policy if exists "household_activity_select_split_activity" on public.household_activity;
create policy "household_activity_select_split_activity" on public.household_activity for select
  using (kind in ('expense_added', 'expense_deleted', 'settlement_recorded') and is_household_member(household_id));
-- Goal-scoped rows (contribution to a goal vault, goal_created) are visible
-- only to that goal's own members (or the household owner) — never to every
-- HOME_ACCESS household member, per New Goal's isolation from the rest of
-- the household.
drop policy if exists "household_activity_select_goal" on public.household_activity;
create policy "household_activity_select_goal" on public.household_activity for select
  using (goal_id is not null and (is_goal_member(goal_id) or is_household_owner(household_id)));
drop policy if exists "household_activity_insert_member" on public.household_activity;
create policy "household_activity_insert_member" on public.household_activity for insert
  with check (is_household_member(household_id) and actor_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Home Chat — dedicated to household members, context-aware: a message
-- that's clearly a contribution or a balance question is auto-answered by
-- inserting a 'system' reply (reusing the same NLU pipeline as voice/text,
-- never a parallel one); a message that only *suggests* a goal (an amount
-- + a savings phrase) gets a `metadata.type = 'suggest_goal'` hint so the
-- UI can offer a one-click "Create Goal" button — nothing is auto-created
-- from an ambiguous suggestion, only from an unambiguous contribution.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.household_chat_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists household_chat_messages_household_created_idx
  on public.household_chat_messages (household_id, created_at desc);

alter table public.household_chat_messages enable row level security;

-- Home Chat surfaces goal suggestions/contribution talk, so it's
-- HOME_ACCESS-gated like the rest of the household dashboard — a split_only
-- member gets no Home Chat for now (spec's "Split group chat" is a separate,
-- not-yet-built, group-scoped surface).
drop policy if exists "household_chat_select_member" on public.household_chat_messages;
create policy "household_chat_select_member" on public.household_chat_messages for select
  using (has_home_access(household_id));
drop policy if exists "household_chat_insert_member" on public.household_chat_messages;
create policy "household_chat_insert_member" on public.household_chat_messages for insert
  with check (has_home_access(household_id) and user_id = auth.uid());

-- Sent/edited timestamps + per-member read receipts, so a message can show
-- "sent at" / "seen at", and the sender can edit or delete their own message
-- ONLY until another member has actually seen it — once seen, the option
-- disappears (enforced here in RLS, not just hidden in the UI).
alter table public.household_chat_messages add column if not exists edited_at timestamptz;

create table if not exists public.household_chat_message_reads (
  message_id uuid not null references public.household_chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists household_chat_message_reads_message_idx
  on public.household_chat_message_reads (message_id);

alter table public.household_chat_message_reads enable row level security;

drop policy if exists "household_chat_message_reads_select_member" on public.household_chat_message_reads;
create policy "household_chat_message_reads_select_member" on public.household_chat_message_reads for select
  using (exists (
    select 1 from household_chat_messages m
    where m.id = message_id and has_home_access(m.household_id)
  ));
drop policy if exists "household_chat_message_reads_insert_own" on public.household_chat_message_reads;
create policy "household_chat_message_reads_insert_own" on public.household_chat_message_reads for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from household_chat_messages m
      where m.id = message_id and has_home_access(m.household_id)
    )
  );

-- True once at least one OTHER household member has a read receipt for this message.
create or replace function public.chat_message_seen_by_others(p_message_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from household_chat_message_reads r
    join household_chat_messages m on m.id = r.message_id
    where r.message_id = p_message_id and r.user_id != m.user_id
  )
$$;

-- Marks every message in the household not authored by the caller as seen by
-- them (idempotent — already-seen messages keep their original seen_at).
create or replace function public.mark_household_chat_seen(p_household_id uuid)
returns void language plpgsql security invoker as $$
begin
  if not is_household_member(p_household_id) then
    raise exception 'not a household member';
  end if;

  insert into household_chat_message_reads (message_id, user_id, seen_at)
  select m.id, auth.uid(), now()
  from household_chat_messages m
  where m.household_id = p_household_id
    and m.user_id != auth.uid()
  on conflict (message_id, user_id) do nothing;
end;
$$;

drop policy if exists "household_chat_update_own_unseen" on public.household_chat_messages;
create policy "household_chat_update_own_unseen" on public.household_chat_messages for update
  using (user_id = auth.uid() and kind = 'user' and not chat_message_seen_by_others(id))
  with check (user_id = auth.uid());

drop policy if exists "household_chat_delete_own_unseen" on public.household_chat_messages;
create policy "household_chat_delete_own_unseen" on public.household_chat_messages for delete
  using (user_id = auth.uid() and kind = 'user' and not chat_message_seen_by_others(id));

-- ─────────────────────────────────────────────────────────────
-- Let's Split — shared-expense splitting, deliberately separate from
-- household_vaults/household_goals (savings). A household always gets one
-- default split_group (auto-created below, mirroring the shared vault),
-- membership synced 1:1 with household_members; additional named groups
-- (e.g. "Goa Trip") are a future UI layer on top of the same tables, with
-- explicit, smaller membership. Balances are NEVER stored — always derived
-- live from split_expense_participants + split_settlements, mirroring how
-- household_vault_transactions/getVaultSummary already works for savings.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.split_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists split_groups_household_id_idx on public.split_groups (household_id);
-- At most one default group per household — the trigger below relies on this.
create unique index if not exists split_groups_one_default_per_household
  on public.split_groups (household_id) where is_default;

create table if not exists public.split_members (
  group_id uuid not null references public.split_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists split_members_user_id_idx on public.split_members (user_id);

create table if not exists public.split_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  category text,
  paid_by uuid not null references auth.users (id) on delete cascade,
  expense_date date not null default current_date,
  comment text,
  receipt_url text,
  split_method text not null check (split_method in ('equal', 'exact', 'percentage', 'shares')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists split_expenses_group_id_idx on public.split_expenses (group_id);
create index if not exists split_expenses_household_id_idx on public.split_expenses (household_id);
create index if not exists split_expenses_group_date_idx on public.split_expenses (group_id, expense_date desc, created_at desc);

drop trigger if exists split_expenses_set_updated_at on public.split_expenses;
create trigger split_expenses_set_updated_at
  before update on public.split_expenses
  for each row
  execute function public.set_updated_at();

-- One row per participant per expense — owed_amount is that participant's
-- share of the total (always sums to split_expenses.amount, enforced in
-- record_split_expense/update_split_expense below, never trusted from the
-- client alone). The payer's own owed_amount is a real row too (their own
-- share of what they paid), so net position is always
-- (paid_by = user ? amount : 0) - owed_amount, summed per counterpart.
create table if not exists public.split_expense_participants (
  expense_id uuid not null references public.split_expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  share_type text not null check (share_type in ('equal', 'exact', 'percentage', 'shares')),
  share_value numeric,
  owed_amount numeric not null check (owed_amount >= 0),
  primary key (expense_id, user_id)
);
create index if not exists split_expense_participants_user_id_idx on public.split_expense_participants (user_id);

-- A settlement is just a fact ("X handed Y ₹amount") — never a payment
-- integration (see spec §9), so there's no pending/processing status here,
-- only a record of what already happened outside the app.
create table if not exists public.split_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'upi', 'other')),
  recorded_by uuid not null references auth.users (id) on delete cascade,
  comment text,
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (from_user != to_user)
);
create index if not exists split_settlements_group_id_idx on public.split_settlements (group_id);

alter table public.split_groups enable row level security;
alter table public.split_members enable row level security;
alter table public.split_expenses enable row level security;
alter table public.split_expense_participants enable row level security;
alter table public.split_settlements enable row level security;

create or replace function public.is_split_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from split_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_split_group_member_check(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from split_members where group_id = p_group_id and user_id = p_user_id);
$$;

drop policy if exists "split_groups_select_member" on public.split_groups;
create policy "split_groups_select_member" on public.split_groups for select
  using (is_split_group_member(id));
drop policy if exists "split_groups_insert_household_member" on public.split_groups;
create policy "split_groups_insert_household_member" on public.split_groups for insert
  with check (can_contribute_to_household(household_id) and created_by = auth.uid() and not is_default);

drop policy if exists "split_members_select_group_member" on public.split_members;
create policy "split_members_select_group_member" on public.split_members for select
  using (is_split_group_member(group_id));

drop policy if exists "split_expenses_select_group_member" on public.split_expenses;
create policy "split_expenses_select_group_member" on public.split_expenses for select
  using (is_split_group_member(group_id));
-- record_split_expense() runs SECURITY INVOKER, so its own INSERT needs this
-- policy to succeed — the function's checks above are the primary gate, this
-- is defense in depth, never a looser rule than the function enforces.
drop policy if exists "split_expenses_insert_group_member" on public.split_expenses;
create policy "split_expenses_insert_group_member" on public.split_expenses for insert
  with check (is_split_group_member(group_id) and created_by = auth.uid());
drop policy if exists "split_expenses_update_owner_or_creator" on public.split_expenses;
create policy "split_expenses_update_owner_or_creator" on public.split_expenses for update
  using (is_household_owner(household_id) or created_by = auth.uid())
  with check (is_household_owner(household_id) or created_by = auth.uid());
drop policy if exists "split_expenses_delete_owner_or_creator" on public.split_expenses;
create policy "split_expenses_delete_owner_or_creator" on public.split_expenses for delete
  using (is_household_owner(household_id) or created_by = auth.uid());

drop policy if exists "split_expense_participants_select_group_member" on public.split_expense_participants;
create policy "split_expense_participants_select_group_member" on public.split_expense_participants for select
  using (exists (select 1 from split_expenses e where e.id = expense_id and is_split_group_member(e.group_id)));
-- Mirrors split_expenses' own write gate (owner or the expense's creator) —
-- record_split_expense/update_split_expense are the only callers, both
-- SECURITY INVOKER, both already enforcing this same rule before writing here.
drop policy if exists "split_expense_participants_write_owner_or_creator" on public.split_expense_participants;
create policy "split_expense_participants_write_owner_or_creator" on public.split_expense_participants for all
  using (exists (select 1 from split_expenses e where e.id = expense_id and (is_household_owner(e.household_id) or e.created_by = auth.uid())))
  with check (exists (select 1 from split_expenses e where e.id = expense_id and (is_household_owner(e.household_id) or e.created_by = auth.uid())));

drop policy if exists "split_settlements_select_group_member" on public.split_settlements;
create policy "split_settlements_select_group_member" on public.split_settlements for select
  using (is_split_group_member(group_id));
-- record_split_settlement() runs SECURITY INVOKER — mirrors its own check
-- that the recorder must be one of the two parties, never a third party.
drop policy if exists "split_settlements_insert_participant" on public.split_settlements;
create policy "split_settlements_insert_participant" on public.split_settlements for insert
  with check (is_split_group_member(group_id) and recorded_by = auth.uid() and (auth.uid() = from_user or auth.uid() = to_user));

-- On creating a household, also create its one default split group and seed
-- its membership with the owner — mirrors the shared-vault half of
-- handle_new_household() exactly.
create or replace function public.handle_new_household()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_split_group_id uuid;
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.household_vaults (household_id, vault_type, name, created_by)
  values (new.id, 'shared', 'Household Savings', new.owner_id);

  insert into public.split_groups (household_id, name, is_default, created_by)
  values (new.id, 'Household Expenses', true, new.owner_id)
  returning id into v_split_group_id;

  insert into public.split_members (group_id, user_id) values (v_split_group_id, new.owner_id);

  return new;
end;
$$;

-- Let's Split membership is deliberately NOT auto-synced from
-- household_members (there used to be a trigger here that did exactly that
-- — removed). New Goal and Let's Split are two separate collaboration
-- spaces: joining the household must never, by itself, grant either one.
-- Split group membership now only ever comes from the group's own creator
-- (handle_new_household above) or an explicit add_split_group_member() call
-- ("Invite Members" inside Let's Split) — except redeem_household_invite()'s
-- one deliberate exception for the split_only role, which exists
-- specifically to grant Let's Split access.
drop trigger if exists household_members_sync_default_split_group on public.household_members;
drop function if exists public.sync_default_split_group_membership();

-- The split group's own creator, or the household owner — mirrors
-- can_manage_goal's "owner or creator" gate, now for who may manage a split
-- group's member list.
create or replace function public.can_manage_split_group(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from split_groups sg
    where sg.id = p_group_id and (sg.created_by = auth.uid() or is_household_owner(sg.household_id))
  );
$$;

drop policy if exists "split_members_insert_manager" on public.split_members;
create policy "split_members_insert_manager" on public.split_members for insert
  with check (can_manage_split_group(group_id));
drop policy if exists "split_members_delete_manager_or_self" on public.split_members;
create policy "split_members_delete_manager_or_self" on public.split_members for delete
  using (can_manage_split_group(group_id) or user_id = auth.uid());

-- Adds an existing household member to a specific split group — Let's
-- Split's own "Invite Members" action. Deliberately not a token/invite flow
-- (that already exists for bringing in a brand-new person via the
-- split_only household role/redeem_household_invite): this is for granting
-- an existing household member visibility into one split group, nothing
-- else about the household.
create or replace function public.add_split_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if not can_manage_split_group(p_group_id) then
    raise exception 'You do not have permission to manage this split group''s members';
  end if;
  select household_id into v_household_id from split_groups where id = p_group_id;
  if v_household_id is null or p_user_id not in (select user_id from household_members where household_id = v_household_id) then
    raise exception 'That person is not a member of this household';
  end if;

  insert into split_members (group_id, user_id) values (p_group_id, p_user_id) on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_split_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_group record;
begin
  select * into v_group from split_groups where id = p_group_id;
  if v_group is null then
    raise exception 'Split group not found';
  end if;
  if not (can_manage_split_group(p_group_id) or p_user_id = auth.uid()) then
    raise exception 'You do not have permission to remove this member';
  end if;
  if p_user_id = v_group.created_by then
    raise exception 'The group creator can''t be removed from their own split group';
  end if;

  delete from split_members where group_id = p_group_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Records an expense and its per-participant split atomically. The split
-- math (equal/exact/percentage/shares -> owed_amount per participant) is
-- computed by the caller (src/lib/actions/split.ts) for easier validation
-- and testing, but this function re-checks sum(owed_amount) = p_amount
-- server-side regardless — the client's arithmetic is never trusted alone.
--
-- p_paid_by is deliberately NOT a parameter: whoever calls Add Expense is
-- understood to be the payer, so paid_by is always auth.uid() here — a
-- manipulated client request has no field to override this through. Editing
-- who paid (e.g. correcting a mistake) is the separate, already
-- owner/creator-gated update_split_expense() flow below, which keeps its own
-- explicit p_paid_by.
drop function if exists public.record_split_expense(uuid, text, numeric, text, uuid, date, text, text, jsonb);
create or replace function public.record_split_expense(
  p_group_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_expense_date date,
  p_comment text,
  p_split_method text,
  p_participants jsonb -- [{user_id, share_type, share_value, owed_amount}, ...]
)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_household_id uuid;
  v_expense_id uuid;
  v_sum numeric;
  v_participant_count int;
  v_payer_name text;
begin
  if not is_split_group_member(p_group_id) then
    raise exception 'You are not a member of this split group';
  end if;
  select household_id into v_household_id from split_groups where id = p_group_id;
  if v_household_id is null then
    raise exception 'Split group not found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select count(*), coalesce(sum((p.value->>'owed_amount')::numeric), 0)
    into v_participant_count, v_sum
    from jsonb_array_elements(p_participants) p;
  if v_participant_count = 0 then
    raise exception 'An expense needs at least one participant';
  end if;
  if abs(v_sum - p_amount) > 0.01 then
    raise exception 'Participant shares (%) do not add up to the expense amount (%)', v_sum, p_amount;
  end if;
  -- Every participant must actually belong to this split group — no longer
  -- implied by household membership (see the removed household-wide sync
  -- trigger), so this can't be skipped: a manipulated participant list could
  -- otherwise fabricate debt for someone who was never added to Let's Split.
  if exists (
    select 1 from jsonb_array_elements(p_participants) p
    where not is_split_group_member_check(p_group_id, (p.value->>'user_id')::uuid)
  ) then
    raise exception 'Every participant must be a member of this split group';
  end if;

  insert into split_expenses (group_id, household_id, created_by, description, amount, category, paid_by, expense_date, comment, split_method)
    values (p_group_id, v_household_id, auth.uid(), p_description, p_amount, p_category, auth.uid(), coalesce(p_expense_date, current_date), p_comment, p_split_method)
    returning id into v_expense_id;

  insert into split_expense_participants (expense_id, user_id, share_type, share_value, owed_amount)
    select v_expense_id, (p.value->>'user_id')::uuid, (p.value->>'share_type')::text, (p.value->>'share_value')::numeric, (p.value->>'owed_amount')::numeric
    from jsonb_array_elements(p_participants) p;

  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into v_payer_name from profiles where id = auth.uid();

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (
      v_household_id, auth.uid(), 'expense_added',
      jsonb_build_object('expense_id', v_expense_id, 'description', p_description, 'amount', p_amount, 'payer_name', coalesce(v_payer_name, 'Someone'))
    );

  return jsonb_build_object('ok', true, 'expense_id', v_expense_id);
end;
$$;

-- Replaces an expense's fields and its full participant set atomically —
-- simpler and safer than a partial participant diff. Same owner-or-creator
-- gate as delete (see split_expenses_delete_owner_or_creator).
create or replace function public.update_split_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_paid_by uuid,
  p_expense_date date,
  p_comment text,
  p_split_method text,
  p_participants jsonb
)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_expense record;
  v_sum numeric;
  v_participant_count int;
begin
  select * into v_expense from split_expenses where id = p_expense_id;
  if v_expense is null then
    raise exception 'Expense not found';
  end if;
  if not (is_household_owner(v_expense.household_id) or v_expense.created_by = auth.uid()) then
    raise exception 'You do not have permission to edit this expense';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if not is_split_group_member_check(v_expense.group_id, p_paid_by) then
    raise exception 'The payer must be a member of this split group';
  end if;

  select count(*), coalesce(sum((p.value->>'owed_amount')::numeric), 0)
    into v_participant_count, v_sum
    from jsonb_array_elements(p_participants) p;
  if v_participant_count = 0 then
    raise exception 'An expense needs at least one participant';
  end if;
  if abs(v_sum - p_amount) > 0.01 then
    raise exception 'Participant shares (%) do not add up to the expense amount (%)', v_sum, p_amount;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_participants) p
    where not is_split_group_member_check(v_expense.group_id, (p.value->>'user_id')::uuid)
  ) then
    raise exception 'Every participant must be a member of this split group';
  end if;

  update split_expenses set
    description = p_description,
    amount = p_amount,
    category = p_category,
    paid_by = p_paid_by,
    expense_date = coalesce(p_expense_date, expense_date),
    comment = p_comment,
    split_method = p_split_method
  where id = p_expense_id;

  delete from split_expense_participants where expense_id = p_expense_id;
  insert into split_expense_participants (expense_id, user_id, share_type, share_value, owed_amount)
    select p_expense_id, (p.value->>'user_id')::uuid, (p.value->>'share_type')::text, (p.value->>'share_value')::numeric, (p.value->>'owed_amount')::numeric
    from jsonb_array_elements(p_participants) p;

  return jsonb_build_object('ok', true);
end;
$$;

-- Deletes an expense (cascades to its participants). Logs activity BEFORE
-- deleting so the expense's own name is still available to reference.
create or replace function public.delete_split_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_expense record;
begin
  select * into v_expense from split_expenses where id = p_expense_id;
  if v_expense is null then
    raise exception 'Expense not found';
  end if;
  if not (is_household_owner(v_expense.household_id) or v_expense.created_by = auth.uid()) then
    raise exception 'You do not have permission to delete this expense';
  end if;

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (v_expense.household_id, auth.uid(), 'expense_deleted', jsonb_build_object('description', v_expense.description, 'amount', v_expense.amount));

  delete from split_expenses where id = p_expense_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Records a settlement — the caller must be one of the two parties (you can
-- record that you paid someone, or that someone paid you), never an
-- uninvolved third party fabricating a payment between two other members.
create or replace function public.record_split_settlement(
  p_group_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount numeric,
  p_method text,
  p_comment text
)
returns jsonb
language plpgsql
security invoker set search_path = public
as $$
declare
  v_household_id uuid;
  v_settlement_id uuid;
  v_from_name text;
  v_to_name text;
begin
  if not is_split_group_member(p_group_id) then
    raise exception 'You are not a member of this split group';
  end if;
  if auth.uid() != p_from_user and auth.uid() != p_to_user then
    raise exception 'You can only record a settlement you are a part of';
  end if;
  if p_from_user = p_to_user then
    raise exception 'A settlement needs two different people';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if not (is_split_group_member_check(p_group_id, p_from_user) and is_split_group_member_check(p_group_id, p_to_user)) then
    raise exception 'Both people must be members of this split group';
  end if;

  select household_id into v_household_id from split_groups where id = p_group_id;

  insert into split_settlements (group_id, household_id, from_user, to_user, amount, method, recorded_by, comment)
    values (p_group_id, v_household_id, p_from_user, p_to_user, p_amount, p_method, auth.uid(), p_comment)
    returning id into v_settlement_id;

  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into v_from_name from profiles where id = p_from_user;
  select coalesce(nullif(name, ''), split_part(email, '@', 1)) into v_to_name from profiles where id = p_to_user;

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (
      v_household_id, auth.uid(), 'settlement_recorded',
      jsonb_build_object(
        'settlement_id', v_settlement_id, 'from_user', p_from_user, 'to_user', p_to_user,
        'from_name', coalesce(v_from_name, 'Someone'), 'to_name', coalesce(v_to_name, 'Someone'), 'amount', p_amount
      )
    );

  return jsonb_build_object('ok', true, 'settlement_id', v_settlement_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Split Chat — a dedicated chat scoped to a Let's Split group, deliberately
-- separate from Home Chat (household_chat_messages, HOME_CHAT_ACCESS). Its
-- own permission scope, SPLIT_CHAT_ACCESS, is is_split_group_member(group_id)
-- — completely independent of has_home_access()/is_household_member(): a
-- split_only member (SPLIT_ACCESS, no HOME_ACCESS) gets this chat for the
-- groups they belong to, and conversely a full household member only gets a
-- group's chat if they're actually a member of THAT group, not merely a
-- household member. Deliberately simpler than Home Chat: no read-receipt
-- tracking or seen-locked editing, just sender-owned edit/delete, per spec's
-- "keep it lightweight and focused."
-- ─────────────────────────────────────────────────────────────
create table if not exists public.split_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  -- Rendering hint only — e.g. { type: "suggest_expense", description, amount }
  -- — never used to auto-create an expense by itself; the user must still
  -- click "Review & Add" and submit the (editable) Add Expense form.
  metadata jsonb not null default '{}',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists split_chat_messages_group_created_idx
  on public.split_chat_messages (group_id, created_at desc);

alter table public.split_chat_messages enable row level security;

drop policy if exists "split_chat_select_group_member" on public.split_chat_messages;
create policy "split_chat_select_group_member" on public.split_chat_messages for select
  using (is_split_group_member(group_id));
drop policy if exists "split_chat_insert_group_member" on public.split_chat_messages;
create policy "split_chat_insert_group_member" on public.split_chat_messages for insert
  with check (is_split_group_member(group_id) and user_id = auth.uid());
drop policy if exists "split_chat_update_own" on public.split_chat_messages;
create policy "split_chat_update_own" on public.split_chat_messages for update
  using (user_id = auth.uid() and kind = 'user')
  with check (user_id = auth.uid());
drop policy if exists "split_chat_delete_own" on public.split_chat_messages;
create policy "split_chat_delete_own" on public.split_chat_messages for delete
  using (user_id = auth.uid() and kind = 'user');

-- ─────────────────────────────────────────────────────────────
-- Goal Chat — the New Goal mirror of Split Chat: scoped to one specific
-- goal via is_goal_member(goal_id), completely independent of Split Chat's
-- is_split_group_member(group_id) and of Home Chat's has_home_access(). A
-- household member only sees a goal's chat if they're one of that goal's
-- own household_goal_members — never merged with Split Chat or Home Chat,
-- per the CORE RULE that these are separate collaboration spaces.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.household_goal_chat_messages (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.household_goals (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  metadata jsonb not null default '{}',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists household_goal_chat_messages_goal_created_idx
  on public.household_goal_chat_messages (goal_id, created_at desc);

alter table public.household_goal_chat_messages enable row level security;

drop policy if exists "household_goal_chat_select_member" on public.household_goal_chat_messages;
create policy "household_goal_chat_select_member" on public.household_goal_chat_messages for select
  using (is_goal_member(goal_id));
drop policy if exists "household_goal_chat_insert_member" on public.household_goal_chat_messages;
create policy "household_goal_chat_insert_member" on public.household_goal_chat_messages for insert
  with check (is_goal_member(goal_id) and user_id = auth.uid());
drop policy if exists "household_goal_chat_update_own" on public.household_goal_chat_messages;
create policy "household_goal_chat_update_own" on public.household_goal_chat_messages for update
  using (user_id = auth.uid() and kind = 'user')
  with check (user_id = auth.uid());
drop policy if exists "household_goal_chat_delete_own" on public.household_goal_chat_messages;
create policy "household_goal_chat_delete_own" on public.household_goal_chat_messages for delete
  using (user_id = auth.uid() and kind = 'user');

-- Backfill: handle_new_household() only fires for households created AFTER
-- this migration — every household that already existed needs its default
-- split group (and membership) created once, here. Safe to re-run: skips
-- households that already have one.
do $$
declare
  v_household record;
  v_group_id uuid;
begin
  for v_household in select id, owner_id from households where not exists (
    select 1 from split_groups where household_id = households.id and is_default
  ) loop
    insert into split_groups (household_id, name, is_default, created_by)
      values (v_household.id, 'Household Expenses', true, v_household.owner_id)
      returning id into v_group_id;

    insert into split_members (group_id, user_id)
      select v_group_id, user_id from household_members where household_id = v_household.id
      on conflict do nothing;
  end loop;
end $$;

-- Backfill: household_goals predating this migration have no
-- household_goal_members rows yet — without this, goal membership access
-- (household_goals_select_member etc.) would make every existing goal
-- invisible to everyone, including its own creator. Grandfathers each
-- existing goal's creator in as its first member, exactly like
-- create_household_goal() does for goals created from now on. Safe to
-- re-run: on conflict do nothing.
insert into household_goal_members (goal_id, user_id, added_by)
  select id, created_by, created_by from household_goals
  on conflict (goal_id, user_id) do nothing;
