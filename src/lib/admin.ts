/* =====================================================================
   Owner affordances - the cosmetic side of being an admin.

   WHAT THIS IS FOR
   Synchronous call sites (the store reducer, modals) need to know whether
   the current user is an admin without awaiting a network round trip. This
   module caches the role that the SERVER returned on the last profile load
   and hands it back synchronously.

   WHAT THIS IS NOT FOR
   Authorisation. The cache lives in memory and mirrors into sessionStorage,
   so anyone with devtools can flip it. That is acceptable only because the
   things it gates are cosmetic: skipping your own pre-trade check-in,
   bypassing your own tilt cooldown, dismissing your own circuit breaker.
   Faking it lets someone waive their own training restrictions - which they
   could achieve just as easily by clearing site data.

   Every decision that protects OTHER users' data is enforced by Row Level
   Security in Postgres (see supabase/schema.sql). Nothing in this file is
   ever consulted for that, and forging it yields empty query results.
   ===================================================================== */
import { safeGet, safeSet, safeRemove } from "./safe";

const K_ROLE = "dt:role";

let cached: string | null = null;

/** Called by the account layer whenever a profile is loaded or cleared. */
export function setCachedRole(role: string | null): void {
  cached = role;
  if (role) safeSet(K_ROLE, role);
  else safeRemove(K_ROLE);
}

/** True when the signed-in user's server-issued role is admin. */
export function isAdminSession(): boolean {
  const role = cached ?? safeGet(K_ROLE);
  return role === "admin";
}
