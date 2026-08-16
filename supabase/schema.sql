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
  role text not null check (role in ('owner', 'member', 'viewer', 'limited_member')),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);
create index if not exists household_members_household_id_idx on public.household_members (household_id);
create index if not exists household_members_user_id_idx on public.household_members (user_id);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('member', 'viewer', 'limited_member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
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
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'member', 'limited_member')
  );
$$;

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
  v_personal_txn_id uuid;
  v_personal_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_source not in ('personal_vault', 'external') then
    raise exception 'Invalid contribution source';
  end if;

  select household_id, name into v_household_id, v_vault_name from household_vaults where id = p_vault_id;
  if v_household_id is null then
    raise exception 'Vault not found';
  end if;
  if not can_contribute_to_household(v_household_id) then
    raise exception 'You do not have permission to contribute to this household';
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

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (
      v_household_id, auth.uid(), 'contribution',
      jsonb_build_object('vault_id', p_vault_id, 'vault_name', v_vault_name, 'amount', p_amount, 'source', p_source)
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

  insert into household_activity (household_id, actor_user_id, kind, payload)
    values (p_household_id, auth.uid(), 'goal_created', jsonb_build_object('goal_id', v_goal_id, 'name', p_name));

  return jsonb_build_object('ok', true, 'goal_id', v_goal_id, 'vault_id', v_vault_id);
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

drop policy if exists "household_members_select_member" on public.household_members;
create policy "household_members_select_member" on public.household_members for select
  using (is_household_member(household_id));
drop policy if exists "household_members_insert_self" on public.household_members;
create policy "household_members_insert_self" on public.household_members for insert
  with check (user_id = auth.uid());
drop policy if exists "household_members_update_owner" on public.household_members;
create policy "household_members_update_owner" on public.household_members for update
  using (is_household_owner(household_id)) with check (is_household_owner(household_id));
drop policy if exists "household_members_delete_owner_or_self" on public.household_members;
create policy "household_members_delete_owner_or_self" on public.household_members for delete
  using (is_household_owner(household_id) or user_id = auth.uid());

drop policy if exists "household_invites_select_member" on public.household_invites;
create policy "household_invites_select_member" on public.household_invites for select
  using (is_household_member(household_id));
drop policy if exists "household_invites_insert_owner" on public.household_invites;
create policy "household_invites_insert_owner" on public.household_invites for insert
  with check (is_household_owner(household_id) and created_by = auth.uid());
drop policy if exists "household_invites_update_owner" on public.household_invites;
create policy "household_invites_update_owner" on public.household_invites for update
  using (is_household_owner(household_id)) with check (is_household_owner(household_id));

drop policy if exists "household_vaults_select_member" on public.household_vaults;
create policy "household_vaults_select_member" on public.household_vaults for select
  using (is_household_member(household_id));
drop policy if exists "household_vaults_insert_goal" on public.household_vaults;
create policy "household_vaults_insert_goal" on public.household_vaults for insert
  with check (vault_type = 'goal' and can_contribute_to_household(household_id) and created_by = auth.uid());
drop policy if exists "household_vaults_update_owner" on public.household_vaults;
create policy "household_vaults_update_owner" on public.household_vaults for update
  using (is_household_owner(household_id)) with check (is_household_owner(household_id));

drop policy if exists "household_goals_select_member" on public.household_goals;
create policy "household_goals_select_member" on public.household_goals for select
  using (is_household_member(household_id));
drop policy if exists "household_goals_insert_contributor" on public.household_goals;
create policy "household_goals_insert_contributor" on public.household_goals for insert
  with check (can_contribute_to_household(household_id) and created_by = auth.uid());
drop policy if exists "household_goals_update_owner_or_creator" on public.household_goals;
create policy "household_goals_update_owner_or_creator" on public.household_goals for update
  using (is_household_owner(household_id) or created_by = auth.uid())
  with check (is_household_owner(household_id) or created_by = auth.uid());
drop policy if exists "household_goals_delete_owner" on public.household_goals;
create policy "household_goals_delete_owner" on public.household_goals for delete
  using (is_household_owner(household_id));

drop policy if exists "household_vault_txns_select_member" on public.household_vault_transactions;
create policy "household_vault_txns_select_member" on public.household_vault_transactions for select
  using (is_household_member(household_id));
drop policy if exists "household_vault_txns_insert_contributor" on public.household_vault_transactions;
create policy "household_vault_txns_insert_contributor" on public.household_vault_transactions for insert
  with check (can_contribute_to_household(household_id) and user_id = auth.uid());

drop policy if exists "household_activity_select_member" on public.household_activity;
create policy "household_activity_select_member" on public.household_activity for select
  using (is_household_member(household_id));
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

drop policy if exists "household_chat_select_member" on public.household_chat_messages;
create policy "household_chat_select_member" on public.household_chat_messages for select
  using (is_household_member(household_id));
drop policy if exists "household_chat_insert_member" on public.household_chat_messages;
create policy "household_chat_insert_member" on public.household_chat_messages for insert
  with check (is_household_member(household_id) and user_id = auth.uid());

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
    where m.id = message_id and is_household_member(m.household_id)
  ));
drop policy if exists "household_chat_message_reads_insert_own" on public.household_chat_message_reads;
create policy "household_chat_message_reads_insert_own" on public.household_chat_message_reads for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from household_chat_messages m
      where m.id = message_id and is_household_member(m.household_id)
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
