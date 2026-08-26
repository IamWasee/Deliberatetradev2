-- ============================================================================
-- DeliberateTrade — phase 1 schema: profiles, roles, tiers.
--
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- It is idempotent: re-running it is safe.
--
-- SECURITY MODEL
--   Every rule here is enforced by Postgres, not by the browser. The anon key
--   that ships in the bundle carries no privileges of its own — a user who
--   edits their own JavaScript still cannot read another user's row, promote
--   themselves to admin, or upgrade their own tier. Those are the three
--   attacks this file is written to stop.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enumerations
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_tier as enum ('free', 'pro', 'elite');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Profiles — one row per auth user
--
--    Passwords are NOT here and never will be. Supabase Auth stores them in
--    auth.users as bcrypt hashes, which this schema cannot read. There is no
--    key that reverses them; not for a user, not for an admin, not for you.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text        not null,
  display_name text,
  role         user_role   not null default 'user',
  tier         user_tier   not null default 'free',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_tier_idx on public.profiles (tier);

-- ---------------------------------------------------------------------------
-- 2b. The owner address, in one place. Change it here and re-run this file.
-- ---------------------------------------------------------------------------
create or replace function public.owner_email()
returns text language sql immutable as $$ select 'abdullahwasee86@gmail.com' $$;

-- ---------------------------------------------------------------------------
-- 3. Auto-create a profile whenever someone signs up
--    SECURITY DEFINER so it can insert despite RLS; search_path is pinned to
--    stop a hijacked search_path from redirecting the insert.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    /* Decided here rather than by a one-off UPDATE at the end of this file:
       that UPDATE only touches rows that already exist, so an owner who
       signs up AFTER the schema is applied would be created as a plain
       user and never promoted. Assigning at insert time covers both
       orders. */
    case when lower(new.email) = lower(public.owner_email())
         then 'admin'::user_role else 'user'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Admin test helper
--    SECURITY DEFINER so the policies below can consult profiles without
--    recursively triggering profile RLS (which would deadlock the check).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

-- A user reads exactly one row: their own.
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- An admin reads every row. This is what powers the admin dashboard.
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

-- A user may edit their own row, but NOT their role or tier.
-- Without the WITH CHECK clause any user could self-promote to admin or
-- hand themselves a paid tier with a single client-side update call.
create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and tier = (select p.tier from public.profiles p where p.id = auth.uid())
  );

-- Admins may change role and tier — this is the upgrade/downgrade path.
create policy profiles_update_admin on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- No INSERT policy: rows are created only by the signup trigger above.
-- No DELETE policy: profiles die with their auth.users row via ON DELETE CASCADE.

-- ---------------------------------------------------------------------------
-- 6. Keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Backfill any users that predate this schema
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, created_at)
select u.id, u.email, u.created_at
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------------------------------------------------------------------------
-- 8. Promote the owner if they signed up BEFORE this file was last applied.
--    The trigger above handles the other order, so between them the grant
--    lands regardless of whether signup or schema came first.
-- ---------------------------------------------------------------------------
update public.profiles
set role = 'admin'
where lower(email) = lower(public.owner_email())
  and role <> 'admin';
