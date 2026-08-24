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

/* ---------------------------------------------------------------------
   TEMPORARY DIAGNOSTIC (owner-requested) - prints, to the browser console:
     - the email the app thinks is logged in (from each source)
     - whether isAdminSession() returns true or false
   Remove `debugAdminAccess` and its call sites once confirmed working.
   --------------------------------------------------------------------- */
export function debugAdminAccess(label = "app"): AdminProbe {
  const p = probeAdminAccess();
  let rawAccount: string | null = null;
  let rawMarker: string | null = null;
  try {
    rawAccount = localStorage.getItem("dt:account");
    rawMarker = localStorage.getItem(K_ACTIVE);
  } catch { /* storage blocked */ }

  const mark = p.isAdmin ? "TRUE" : "FALSE";
  console.groupCollapsed(
    "%c[DeliberateTrade:" + label + "] isAdminSession() = " + mark + (p.isAdmin ? " (owner)" : ""),
    "color:" + (p.isAdmin ? "#2fb98c" : "#e0564f") + ";font-weight:bold",
  );
  console.log("expected owner email     :", OWNER_EMAIL);
  console.log("account email (dt:account)     :", p.accountEmail ?? "(none)");
  console.log("session email (cookie/fb)      :", p.sessionEmail ?? "(none)");
  console.log("active marker (dt:active_email):", p.activeEmail ?? "(none)");
  console.log("RESULT isAdminSession()        :", p.isAdmin);
  console.log("dt:account raw          =", rawAccount);
  console.log("dt:active_email raw     =", rawMarker);
  console.groupEnd();
  console.warn("[DeliberateTrade:" + label + "] signed-in email -> " +
    (p.sessionEmail ?? p.accountEmail ?? p.activeEmail ?? "(none)") + " | isAdminSession() = " + p.isAdmin);
  return p;
}

/** Decision-point tracer: logs which way each admin-gated check resolved. */
export function logGate(point: string): boolean {
  const isAdmin = isAdminSession();
  console.warn("[DeliberateTrade:gate] " + point + " -> isAdminSession() = " + isAdmin);
  return isAdmin;
}

/* Logs once the moment this module executes - if this line never shows in
   your console, the browser is running a stale cached bundle: hard-reload. */
try {
  debugAdminAccess("boot");
} catch {
  /* diagnostics must never block startup */
}
