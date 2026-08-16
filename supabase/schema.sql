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
