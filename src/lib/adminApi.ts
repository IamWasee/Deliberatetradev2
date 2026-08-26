/* =====================================================================
   Admin data access.

   Nothing here grants privilege. Every call below is an ordinary request
   made with the caller's own session; the database decides what comes
   back, using the RLS policies in supabase/schema.sql:

     · a non-admin calling listUsers() receives their own row and no more
     · a non-admin calling setTier() has the write rejected by the policy
     · a user cannot alter their own role or tier by any path

   So a tampered client can render admin UI, but it cannot obtain admin
   data. The check that matters happens in Postgres, not in this file.

   Phase 1 exposes account records only - email, tier, activity dates.
   Trading data still lives in each user's browser, and journal text is
   deliberately out of scope (see the privacy policy in views/Legal.tsx).
   ===================================================================== */
import { supabase, hasSupabase } from "./supabase";
import type { Profile, Tier } from "./account";

export interface AdminResult<T> { data: T | null; error: string }

/** Every account, newest first. Returns [] for non-admins by RLS, not by
    a client-side check - there is no branch here to bypass. */
export async function listUsers(): Promise<AdminResult<Profile[]>> {
  if (!hasSupabase()) return { data: null, error: "Server is not configured." };
  const { data, error } = await supabase()
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as Profile[], error: "" };
}

/** Upgrade or downgrade a subscription tier. Rejected by policy unless the
    caller really is an admin. */
export async function setTier(userId: string, tier: Tier): Promise<AdminResult<Profile>> {
  if (!hasSupabase()) return { data: null, error: "Server is not configured." };
  const { data, error } = await supabase()
    .from("profiles")
    .update({ tier })
    .eq("id", userId)
    .select()
    .single();
  if (error) {
    /* An empty result here is the policy refusing the write, not a bug. */
    return { data: null, error: error.message || "That change was refused." };
  }
  return { data: data as Profile, error: "" };
}

export interface AdminStats {
  total: number;
  byTier: Record<Tier, number>;
  newThisWeek: number;
  activeThisWeek: number;
}

export function summarise(users: Profile[]): AdminStats {
  const weekAgo = Date.now() - 7 * 864e5;
  const byTier: Record<Tier, number> = { free: 0, pro: 0, elite: 0 };
  let newThisWeek = 0;
  let activeThisWeek = 0;
  for (const u of users) {
    byTier[u.tier] = (byTier[u.tier] ?? 0) + 1;
    if (new Date(u.created_at).getTime() >= weekAgo) newThisWeek += 1;
    if (u.last_seen_at && new Date(u.last_seen_at).getTime() >= weekAgo) activeThisWeek += 1;
  }
  return { total: users.length, byTier, newThisWeek, activeThisWeek };
}

/* =====================================================================
   Phase 2 — performance metrics.

   Every read below is admin-gated by RLS, not by anything in this file.
   Note what is absent: there is no function to read `journals`. That table
   carries no admin policy at all, so staff cannot read what users wrote,
   and the privacy policy says exactly that. Do not add one without also
   changing views/Legal.tsx and telling users first.
   ===================================================================== */

export interface UserStats {
  user_id: string;
  equity: number;
  session_pnl: number;
  realized_pnl: number;
  open_risk: number;
  trade_count: number;
  win_rate: number;
  avg_r: number;
  process_score: number;
  violation_count: number;
  journal_count: number;
  journals_due: number;
  breaches: number;
  updated_at: string;
}

export interface TradeRow {
  id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
  r: number;
  risk_pct: number;
  setup: string | null;
  exit_reason: string | null;
  emotion_before: string | null;
  emotion_after: string | null;
  followed_rules: boolean | null;
  grade: string | null;
  journal_quality: number | null;
  override: boolean;
  violations: string[];
  closed_at: string;
}

export interface PositionRow {
  id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  avg_entry: number;
  stop: number | null;
  target: number | null;
  risk_amount: number;
  risk_pct: number;
  setup: string | null;
  opened_at: string;
}

export interface ViolationRow {
  id: string;
  rule: string;
  detail: string | null;
  created_at: string;
}

/** Stats for every user, keyed by id, for the admin list. */
export async function listStats(): Promise<AdminResult<Record<string, UserStats>>> {
  if (!hasSupabase()) return { data: null, error: "Server is not configured." };
  const { data, error } = await supabase().from("user_stats").select("*");
  if (error) return { data: null, error: error.message };
  const map: Record<string, UserStats> = {};
  for (const row of (data ?? []) as UserStats[]) map[row.user_id] = row;
  return { data: map, error: "" };
}

export interface UserDetail {
  stats: UserStats | null;
  trades: TradeRow[];
  positions: PositionRow[];
  violations: ViolationRow[];
}

/** Everything the console shows for one user. Metrics only, by design. */
export async function getUserDetail(userId: string): Promise<AdminResult<UserDetail>> {
  if (!hasSupabase()) return { data: null, error: "Server is not configured." };
  const db = supabase();
  const [stats, trades, positions, violations] = await Promise.all([
    db.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
    db.from("trades").select("*").eq("user_id", userId).order("closed_at", { ascending: false }).limit(100),
    db.from("positions").select("*").eq("user_id", userId),
    db.from("violations").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);

  const err = stats.error || trades.error || positions.error || violations.error;
  if (err) return { data: null, error: err.message };

  return {
    data: {
      stats: (stats.data as UserStats) ?? null,
      trades: (trades.data ?? []) as TradeRow[],
      positions: (positions.data ?? []) as PositionRow[],
      violations: (violations.data ?? []) as ViolationRow[],
    },
    error: "",
  };
}
