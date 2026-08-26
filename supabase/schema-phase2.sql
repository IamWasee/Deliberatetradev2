-- ============================================================================
-- DeliberateTrade — phase 2: trading data sync + admin metrics.
--
-- Run in Supabase → SQL Editor AFTER schema.sql. Idempotent; safe to re-run.
--
-- PRIVACY DESIGN — read this before changing any policy below.
--
-- Administrators may see performance metrics. They may NOT read what a user
-- wrote in a journal or an emotional check-in. That is a product commitment
-- stated in the privacy policy, so it is enforced structurally rather than by
-- remembering not to SELECT the wrong column:
--
--   · free-text lives ONLY in `journals`, whose policies admit the author
--     and nobody else - there is no admin policy on that table at all
--   · everything an admin needs (scores, grades, counts, tags) lives in
--     other tables that carry no free text
--
-- So an admin query cannot accidentally surface journal prose: the rows are
-- not visible to them at any privilege this app can obtain.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Plans — the user's trading contract
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  version             int         not null default 1,
  starting_capital    numeric     not null,
  risk_per_trade_pct  numeric     not null,
  max_daily_loss_pct  numeric     not null,
  max_open_risk_pct   numeric     not null,
  max_positions       int         not null,
  setups              text[]      not null default '{}',
  forbidden           text[]      not null default '{}',
  note                text,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Trades — closed positions. Admin-readable: metrics only, no prose.
--    `checkin_thesis` is deliberately NOT stored here; the thesis a trader
--    types before entry is treated as journal-grade text.
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  client_id       text        not null,
  symbol          text        not null,
  side            text        not null check (side in ('long','short')),
  qty             numeric     not null,
  entry           numeric     not null,
  exit            numeric     not null,
  pnl             numeric     not null,
  fees            numeric     not null default 0,
  r               numeric     not null,
  risk_amount     numeric     not null,
  risk_pct        numeric     not null,
  setup           text,
  exit_reason     text,
  emotion_before  text,
  arousal_before  int,
  emotion_during  text,
  emotion_after   text,
  followed_rules  boolean,
  grade           text,
  journal_quality numeric,
  override        boolean     not null default false,
  violations      text[]      not null default '{}',
  regime          text,
  stress_hits     int         not null default 0,
  opened_at       timestamptz,
  closed_at       timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists trades_user_closed_idx on public.trades (user_id, closed_at desc);

-- ---------------------------------------------------------------------------
-- 3. Open positions — mirrors the live desk so admins can see current risk
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  client_id   text        not null,
  symbol      text        not null,
  side        text        not null check (side in ('long','short')),
  qty         numeric     not null,
  avg_entry   numeric     not null,
  stop        numeric,
  target      numeric,
  risk_amount numeric     not null,
  risk_pct    numeric     not null,
  setup       text,
  opened_at   timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists positions_user_idx on public.positions (user_id);

-- ---------------------------------------------------------------------------
-- 4. Violations — rule breaks, for support and coaching
-- ---------------------------------------------------------------------------
create table if not exists public.violations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  client_id  text        not null,
  rule       text        not null,
  detail     text,
  at_tick    int,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists violations_user_idx on public.violations (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Rolled-up stats — what the admin list renders without scanning trades
-- ---------------------------------------------------------------------------
create table if not exists public.user_stats (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  equity         numeric not null default 0,
  session_pnl    numeric not null default 0,
  realized_pnl   numeric not null default 0,
  open_risk      numeric not null default 0,
  trade_count    int     not null default 0,
  win_rate       numeric not null default 0,
  avg_r          numeric not null default 0,
  process_score  int     not null default 0,
  violation_count int    not null default 0,
  journal_count  int     not null default 0,
  journals_due   int     not null default 0,
  breaches       int     not null default 0,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Journals — FREE TEXT. Author-only, permanently.
--    Note the absence of any admin policy: that omission is the mechanism.
-- ---------------------------------------------------------------------------
create table if not exists public.journals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  client_id       text        not null,
  trade_client_id text,
  plan_text       text,
  what_happened   text,
  rules_note      text,
  lesson          text,
  thesis          text,
  created_at      timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists journals_user_idx on public.journals (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.plans      enable row level security;
alter table public.trades     enable row level security;
alter table public.positions  enable row level security;
alter table public.violations enable row level security;
alter table public.user_stats enable row level security;
alter table public.journals   enable row level security;

/* Owner-full-access + admin-read, applied to the metric tables. */
do $$
declare t text;
begin
  foreach t in array array['plans','trades','positions','violations','user_stats'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format('drop policy if exists %I_admin_read on public.%I', t, t);

    /* The author may do anything with their own rows. */
    execute format($f$
      create policy %I_own on public.%I
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id)
    $f$, t, t);

    /* Admins may read, and only read. No admin INSERT/UPDATE/DELETE policy
       exists, so staff cannot fabricate or alter a user's trading record. */
    execute format($f$
      create policy %I_admin_read on public.%I
        for select using (public.is_admin())
    $f$, t, t);
  end loop;
end $$;

/* Journals: author only. Deliberately no admin policy - see header. */
drop policy if exists journals_own on public.journals;
create policy journals_own on public.journals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 8. Keep user_stats.updated_at honest
-- ---------------------------------------------------------------------------
drop trigger if exists user_stats_touch on public.user_stats;
create trigger user_stats_touch
  before update on public.user_stats
  for each row execute function public.touch_updated_at();
