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
