/* =====================================================================
   Supabase client — the single place credentials enter the app.

   Both values are PUBLIC by design: the anon key ships inside the browser
   bundle and carries no privileges of its own. Every table it can reach is
   guarded by Row Level Security, so a user can only ever read or write
   rows that policy explicitly grants them. The service_role key, which
   bypasses RLS, must never appear in this file or anywhere in src/.

   Passwords never pass through this module in storable form: signUp and
   signInWithPassword send them over TLS to Supabase Auth, which hashes
   them with bcrypt server-side. Nothing here can read a stored password,
   and neither can the project owner.
   ===================================================================== */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

const URL = env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? "";

/** True when both env vars are present — lets the app fall back to local
    mode instead of crashing on a misconfigured deploy. */
export const hasSupabase = (): boolean => URL.length > 0 && ANON_KEY.length > 0;

let client: SupabaseClient | null = null;

/** Lazily created so a missing config never throws at module load. */
export function supabase(): SupabaseClient {
  if (!hasSupabase()) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,   // handles the ?code= on email-confirm return
        flowType: "pkce",
      },
    });
  }
  return client;
}
