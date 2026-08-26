/* =====================================================================
   Account layer — every call that touches identity goes through here.

   Passwords are passed straight to Supabase Auth over TLS and are never
   stored, logged, or hashed locally. Supabase hashes them with bcrypt
   server-side; nothing in this file can read one back.

   Authorisation is NOT decided here. `profile.role` is only what the
   database was willing to return under its own RLS policies, so it is
   safe to render UI from, but the database re-checks on every read and
   write. A tampered client sees admin buttons and gets empty results.
   ===================================================================== */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, hasSupabase } from "./supabase";
import { canonicalEmail, checkEmail } from "./auth";
import { setCachedRole } from "./admin";

export type Role = "user" | "admin";
export type Tier = "free" | "pro" | "elite";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  tier: Tier;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

export interface Result { ok: boolean; error: string }
const ok: Result = { ok: true, error: "" };
const fail = (error: string): Result => ({ ok: false, error });

/* Supabase's messages are written for developers. Map the ones users
   actually hit onto something a trader reading a signup form understands. */
function humanise(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered")) return "An account with that email already exists. Sign in instead.";
  if (m.includes("invalid login")) return "Email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Confirm your email first - check your inbox for the link.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a few minutes and try again.";
  if (m.includes("weak password")) return "That password is too weak.";
  /* Supabase reports a failed send as "Error sending confirmation email".
     In practice this is almost always the shared sender's hourly quota
     rather than a bad address, so say something the user can act on. */
  if (m.includes("sending") && m.includes("email")) {
    return "We couldn't send the confirmation email right now - our mail quota is temporarily used up. Try again in an hour, or contact support.";
  }
  return message;
}

/* ------------------------------ signup ------------------------------- */
export async function signUp(email: string, password: string, displayName: string): Promise<Result> {
  const check = checkEmail(email);
  if (!check.ok) return fail(check.reason);
  if (!hasSupabase()) return fail("Accounts are unavailable - the server is not configured.");

  const { error } = await supabase().auth.signUp({
    email: canonicalEmail(email),
    password,
    options: {
      data: { display_name: displayName.trim().slice(0, 60) },
      emailRedirectTo: window.location.origin,
    },
  });
  return error ? fail(humanise(error.message)) : ok;
}

/* ------------------------------ signin ------------------------------- */
export async function signIn(email: string, password: string): Promise<Result> {
  const check = checkEmail(email);
  if (!check.ok) return fail(check.reason);
  if (!hasSupabase()) return fail("Accounts are unavailable - the server is not configured.");

  const { error } = await supabase().auth.signInWithPassword({
    email: canonicalEmail(email),
    password,
  });
  return error ? fail(humanise(error.message)) : ok;
}

export async function signOut(): Promise<void> {
  setCachedRole(null);
  if (hasSupabase()) await supabase().auth.signOut();
}

/* --------------------------- verification ---------------------------- */
export async function resendVerification(email: string): Promise<Result> {
  if (!hasSupabase()) return fail("Accounts are unavailable - the server is not configured.");
  const { error } = await supabase().auth.resend({
    type: "signup",
    email: canonicalEmail(email),
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? fail(humanise(error.message)) : ok;
}

/* ------------------------------ reset -------------------------------- */
export async function requestPasswordReset(email: string): Promise<Result> {
  const check = checkEmail(email);
  if (!check.ok) return fail(check.reason);
  if (!hasSupabase()) return fail("Accounts are unavailable - the server is not configured.");

  const { error } = await supabase().auth.resetPasswordForEmail(canonicalEmail(email), {
    redirectTo: window.location.origin,
  });
  /* Reported as success either way: telling a stranger whether an address is
     registered would leak your user list one guess at a time. */
  return error && !/not found/i.test(error.message) ? fail(humanise(error.message)) : ok;
}

export async function updatePassword(password: string): Promise<Result> {
  if (!hasSupabase()) return fail("Accounts are unavailable - the server is not configured.");
  const { error } = await supabase().auth.updateUser({ password });
  return error ? fail(humanise(error.message)) : ok;
}

/* ----------------------------- profile ------------------------------- */
/* Always filtered by id, never left to RLS to narrow.

   An earlier version selected without a filter and trusted the policy to
   return exactly one row. That holds for a normal user, but an admin can
   read every profile - so the moment a second account existed, .single()
   received multiple rows, errored, and returned null. The signed-in admin
   silently lost their role and their admin UI.

   The lesson generalises: RLS decides what you MAY see, not what you asked
   for. Queries must still say which row they want. */
export interface ProfileFetch {
  profile: Profile | null;
  /** True when the round trip itself failed - offline, blocked, a blip.
      Distinct from "the query succeeded and there is no such row", because
      the two demand opposite responses: one means retain what we knew,
      the other means the profile is genuinely absent. */
  failed: boolean;
}

export async function fetchProfileResult(userId?: string): Promise<ProfileFetch> {
  if (!hasSupabase()) return { profile: null, failed: false };
  const db = supabase();

  let id = userId;
  if (!id) {
    const { data: auth } = await db.auth.getUser();
    id = auth.user?.id;
  }
  if (!id) return { profile: null, failed: false };

  try {
    const { data, error } = await db
      .from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) return { profile: null, failed: true };
    return { profile: (data as Profile) ?? null, failed: false };
  } catch {
    return { profile: null, failed: true };
  }
}

export async function fetchProfile(userId?: string): Promise<Profile | null> {
  return (await fetchProfileResult(userId)).profile;
}

/** Fire-and-forget activity stamp; failure is never worth blocking a login. */
export async function touchLastSeen(id: string): Promise<void> {
  if (!hasSupabase()) return;
  try {
    await supabase().from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
  } catch { /* non-critical */ }
}

/* ------------------------------ hook --------------------------------- */
export interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
}

export function useAuth(): AuthState & { refresh: () => void } {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, profile: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!hasSupabase()) { setState({ loading: false, session: null, profile: null }); return; }
    let live = true;

    const apply = async (session: Session | null) => {
      if (!live) return;
      if (!session) {
        setCachedRole(null);
        setState({ loading: false, session: null, profile: null });
        return;
      }
      const { profile, failed } = await fetchProfileResult(session.user.id);
      if (!live) return;

      /* A failed round trip must not revoke anything.

         onAuthStateChange fires on token refresh, on tab focus and on
         other routine events, so this path runs repeatedly through a long
         session. Treating a transient failure as "no profile" silently
         demoted an admin mid-session: the skip affordances vanished, the
         enforcement gates re-engaged, and the Admin tab disappeared, with
         nothing on screen to explain why. Privileges are dropped only on
         an actual answer - a real sign-out, or a query that succeeded and
         returned no row. */
      if (failed) {
        setState((prev) => ({ loading: false, session, profile: prev.profile }));
        return;
      }

      setCachedRole(profile?.role ?? null);
      setState({ loading: false, session, profile });
      if (profile) void touchLastSeen(profile.id);
    };

    void supabase().auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase().auth.onAuthStateChange((_e, session) => { void apply(session); });

    return () => { live = false; sub.subscription.unsubscribe(); };
  }, [nonce]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}
