/* =====================================================================
   Owner access - developer privileges for the product owner's account.
   Nothing in the UI labels this account; the affordances (skip buttons,
   unpaused enforcement) simply appear for this session only.

   Detection is deliberately redundant: the signed-in email is resolved
   from three independent sources (live session, stored account record,
   and an active-email marker written at login), so no single storage
   quirk can silently turn the owner into a normal user.

   Note: any client-side check is readable in the bundle by design - the
   authoritative enforcement for production data lives server-side, where
   the same email check gates the privileged endpoints.
   ===================================================================== */
import { loadAccount, loadSession } from "./auth";
import { safeGet, safeSet, safeRemove } from "./safe";

const OWNER_EMAIL = "abdullahwasee86@gmail.com";
const K_ACTIVE = "dt:active_email";

const norm = (v: unknown): string =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

/** Case-insensitive owner check. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return norm(email) === OWNER_EMAIL;
}

/** Written at every successful login, cleared on erase - a third, simple
    source of truth that survives cookie/sessionStorage oddities. */
export function setActiveEmail(email: string | null): void {
  if (email) safeSet(K_ACTIVE, norm(email));
  else safeRemove(K_ACTIVE);
}

export interface AdminProbe {
  accountEmail: string | null;
  sessionEmail: string | null;
  activeEmail: string | null;
  isAdmin: boolean;
}

/** Resolve the signed-in email from every source available. */
export function probeAdminAccess(): AdminProbe {
  const accountEmail = norm(loadAccount()?.email) || null;
  const sessionEmail = norm(loadSession()?.email) || null;
  const activeEmail = norm(safeGet(K_ACTIVE)) || null;
  const isAdmin =
    isAdminEmail(sessionEmail) || isAdminEmail(accountEmail) || isAdminEmail(activeEmail);
  return { accountEmail, sessionEmail, activeEmail, isAdmin };
}

/** True when the currently signed-in user is the owner. */
export function isAdminSession(): boolean {
  return probeAdminAccess().isAdmin;
}
