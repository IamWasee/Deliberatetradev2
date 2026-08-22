/* =====================================================================
   Auth & security — client layer.
   PBKDF2 hashing · password policy · two-bucket lockout + backoff ·
   rate limiting · cookie session (Secure + SameSite=Strict) ·
   verification & reset codes · sanitization · full data wipe.
   ===================================================================== */
import { safeGet, safeSet, safeRemove } from "./safe";
import { clearCsrfToken } from "./csrf";

const K_ACCOUNT = "dt:account";
const K_LOCK = "dt:lock";
const K_LOCK_DEVICE = "dt:lock_device";
const K_RATE = "dt:rate";
const K_RESET = "dt:reset";
const K_SESSION = "dt_session";          // cookie
const K_SESSION_FB = "dt:session_fb";    // sessionStorage fallback

export interface StoredAccount {
  email: string; name: string;
  salt: string; hash: string;
  verified: boolean; createdAt: number;
  pendingCode?: string; pendingCodeExpiresAt?: number;
}
export interface Session { email: string; token: string; createdAt: number; expiresAt: number; lastActive: number }

/* ---------------------------- password ------------------------------ */
export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: "len", label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { id: "letter", label: "Contains a letter", test: (pw) => /[a-zA-Z]/.test(pw) },
  { id: "number", label: "Contains a number", test: (pw) => /\d/.test(pw) },
  { id: "common", label: "No common patterns", test: (pw) => !/password|12345678|qwerty|letmein|admin123|iloveyou/i.test(pw) && !/(.)\1{3,}/.test(pw) },
];
const BONUS = (pw: string) => /[^a-zA-Z0-9]/.test(pw) || /[A-Z]/.test(pw);

export function validatePassword(pw: string): { ok: boolean; failed: string[] } {
  const failed = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
  return { ok: failed.length === 0, failed };
}
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  const passed = PASSWORD_RULES.filter((r) => r.test(pw)).length;
  if (passed < 3) return 1;
  if (passed === 4 && BONUS(pw) && pw.length >= 12) return 3;
  return 2;
}

/* ---------------------------- hashing ------------------------------- */
function bytesToHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function generateSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return bytesToHex(a.buffer);
}
export async function hashPassword(pw: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 150_000, hash: "SHA-256" }, key, 256);
  return bytesToHex(bits);
}
export async function createAccountRecord(email: string, name: string, pw: string): Promise<StoredAccount> {
  const salt = generateSalt();
  const hash = await hashPassword(pw, salt);
  return { email: email.toLowerCase().trim(), name: name.trim(), salt, hash, verified: false, createdAt: Date.now() };
}

/* ---------------------------- account ------------------------------- */
export function loadAccount(): StoredAccount | null {
  try {
    const raw = safeGet(K_ACCOUNT);
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredAccount;
    if (!o || typeof o.hash !== "string" || typeof o.salt !== "string") return null;
    return o;
  } catch { return null; }
}
export function saveAccount(a: StoredAccount): void { safeSet(K_ACCOUNT, JSON.stringify(a)); }

export function clearAccount(): void {
  safeRemove(K_ACCOUNT);
  clearSession();
  safeRemove(K_LOCK);
  safeRemove(K_LOCK_DEVICE);
  safeRemove(K_RATE);
  safeRemove(K_RESET);
}

/** PERMANENT deletion — account + every dt:* key (trades, journals, all of it). */
export function wipeEverything(): void {
  clearAccount();
  clearCsrfToken();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("dt:")) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch { /* unavailable */ }
  window.location.reload();
}

/* --------------------------- rate limiting -------------------------- */
export function rateLimited(action: string, max: number, windowMs: number): { limited: boolean; retryInMs: number } {
  const now = Date.now();
  let map: Record<string, number[]> = {};
  try { map = JSON.parse(safeGet(K_RATE) ?? "{}") as Record<string, number[]>; } catch { map = {}; }
  const hits = (map[action] ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return { limited: true, retryInMs: windowMs - (now - hits[0]) };
  hits.push(now);
  map[action] = hits;
  safeSet(K_RATE, JSON.stringify(map));
  return { limited: false, retryInMs: 0 };
}

/* --------------------------- lockout -------------------------------- */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 5 * 60 * 1000;
export const DEVICE_MAX_ATTEMPTS = 10;
export const DEVICE_LOCK_MS = 15 * 60 * 1000;
const DELAY_STEPS_MS = [0, 2000, 4000, 8000, 15000];

export interface LockState { locked: boolean; scope: "account" | "device" | null; attempts: number; retryInMs: number }
interface Bucket { attempts: number; lockUntil: number }

function loadBucket(key: string): Bucket {
  try {
    const o = JSON.parse(safeGet(key) ?? "{}") as Partial<Bucket>;
    return { attempts: o.attempts ?? 0, lockUntil: o.lockUntil ?? 0 };
  } catch { return { attempts: 0, lockUntil: 0 }; }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export function backoffDelay(failuresSoFar: number): number {
  if (failuresSoFar <= 0) return 0;
  return DELAY_STEPS_MS[Math.min(failuresSoFar, DELAY_STEPS_MS.length - 1)];
}

export function lockInfo(): LockState {
  const now = Date.now();
  const account = loadBucket(K_LOCK);
  const device = loadBucket(K_LOCK_DEVICE);
  const acctLocked = account.lockUntil > now;
  const devLocked = device.lockUntil > now;
  if (devLocked && device.lockUntil >= account.lockUntil)
    return { locked: true, scope: "device", attempts: account.attempts, retryInMs: device.lockUntil - now };
  if (acctLocked)
    return { locked: true, scope: "account", attempts: account.attempts, retryInMs: account.lockUntil - now };
  return { locked: false, scope: null, attempts: account.attempts, retryInMs: 0 };
}

export function recordLoginFail(): LockState {
  const now = Date.now();
  const account = loadBucket(K_LOCK);
  const device = loadBucket(K_LOCK_DEVICE);
  const acct: Bucket = { attempts: (account.lockUntil > now ? 0 : account.attempts) + 1, lockUntil: account.lockUntil };
  if (acct.attempts >= LOGIN_MAX_ATTEMPTS) { acct.lockUntil = now + LOGIN_LOCK_MS; acct.attempts = 0; }
  const dev: Bucket = { attempts: (device.lockUntil > now ? 0 : device.attempts) + 1, lockUntil: device.lockUntil };
  if (dev.attempts >= DEVICE_MAX_ATTEMPTS) { dev.lockUntil = now + DEVICE_LOCK_MS; dev.attempts = 0; }
  safeSet(K_LOCK, JSON.stringify(acct));
  safeSet(K_LOCK_DEVICE, JSON.stringify(dev));
  return lockInfo();
}

export function resetLockout(): void {
  safeRemove(K_LOCK);
  safeRemove(K_LOCK_DEVICE);
}

/* ---------------------------- session ------------------------------- */
/*
  Cookie config. HttpOnly can ONLY be set by a server's Set-Cookie header —
  the server blueprint is:
    Set-Cookie: dt_session=<token>; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict
*/
const SESSION_MS = 60 * 60 * 1000;
const IDLE_MS = 15 * 60 * 1000;

export const SESSION_COOKIE_CONFIG = {
  name: K_SESSION, path: "/", maxAgeSec: SESSION_MS / 1000,
  sameSite: "Strict" as const,
  secure: typeof window !== "undefined" && window.isSecureContext,
  httpOnly: false,
};

function generateToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function encodeSession(s: Session): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}
function decodeSession(raw: string): Session | null {
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(raw)))) as Session;
    return s && typeof s.token === "string" ? s : null;
  } catch { return null; }
}
function cookiesAvailable(): boolean {
  try { document.cookie = "dt_probe=1; Path=/"; const ok = document.cookie.includes("dt_probe"); document.cookie = "dt_probe=; Max-Age=0; Path=/"; return ok; }
  catch { return false; }
}
function cookieAttrs(maxAgeSec: number): string {
  return [
    "Path=/", `Max-Age=${Math.max(0, Math.round(maxAgeSec))}`, "SameSite=Strict",
    ...(SESSION_COOKIE_CONFIG.secure ? ["Secure"] : []),
  ].join("; ");
}
function writeSessionCookie(s: Session): boolean {
  if (!cookiesAvailable()) return false;
  const remainingMs = Math.min(s.expiresAt - Date.now(), SESSION_MS);
  if (remainingMs <= 0) return false;
  try {
    document.cookie = `${K_SESSION}=${encodeSession(s)}; ${cookieAttrs(remainingMs / 1000)}`;
    return document.cookie.includes(K_SESSION);
  } catch { return false; }
}

export function createSession(email: string): Session {
  const now = Date.now();
  const s: Session = { email, token: generateToken(), createdAt: now, expiresAt: now + SESSION_MS, lastActive: now };
  if (!writeSessionCookie(s)) {
    try { sessionStorage.setItem(K_SESSION_FB, JSON.stringify(s)); } catch { /* none */ }
  }
  resetLockout();
  return s;
}

function readRawCookie(): string | null {
  try {
    const m = document.cookie.split("; ").find((c) => c.startsWith(K_SESSION + "="));
    return m ? m.slice(K_SESSION.length + 1) : null;
  } catch { return null; }
}

export function loadSession(): Session | null {
  const raw = readRawCookie();
  if (raw) return decodeSession(raw);
  try {
    const fb = sessionStorage.getItem(K_SESSION_FB);
    return fb ? (JSON.parse(fb) as Session) : null;
  } catch { return null; }
}

export function touchSession(): void {
  const s = loadSession();
  if (!s) return;
  s.lastActive = Date.now();
  if (!writeSessionCookie(s)) {
    try { sessionStorage.setItem(K_SESSION_FB, JSON.stringify(s)); } catch { /* none */ }
  }
}

export function isSessionValid(): boolean {
  const s = loadSession();
  if (!s) return false;
  const now = Date.now();
  if (now > s.expiresAt) return false;
  if (now - s.lastActive > IDLE_MS) return false;
  const acct = loadAccount();
  if (!acct || !acct.verified || acct.email !== s.email) return false;
  return true;
}

export function clearSession(): void {
  try { document.cookie = `${K_SESSION}=; Path=/; Max-Age=0; SameSite=Strict${window.isSecureContext ? "; Secure" : ""}`; } catch { /* blocked */ }
  try { sessionStorage.removeItem(K_SESSION_FB); } catch { /* blocked */ }
}

/* ------------------------- verification codes ----------------------- */
export const VERIFICATION_MS = 10 * 60 * 1000;

export function generateCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

export function issueVerification(a: StoredAccount): StoredAccount {
  a.pendingCode = generateCode();
  a.pendingCodeExpiresAt = Date.now() + VERIFICATION_MS;
  return a;
}
export function codeExpired(a: StoredAccount): boolean {
  return !a.pendingCode || !a.pendingCodeExpiresAt || Date.now() > a.pendingCodeExpiresAt;
}
export function codeExpiresAt(a: StoredAccount): number { return a.pendingCodeExpiresAt ?? 0; }

/* ----------------------- forgot-password tokens --------------------- */
export interface ResetRequest { token: string; code: string; email: string; expiresAt: number }
const RESET_MS = 15 * 60 * 1000;

export function createReset(email: string): ResetRequest {
  const r: ResetRequest = { token: generateToken(), code: generateCode(), email, expiresAt: Date.now() + RESET_MS };
  safeSet(K_RESET, JSON.stringify(r));
  return r;
}
export function loadReset(): ResetRequest | null {
  try {
    const raw = safeGet(K_RESET);
    if (!raw) return null;
    return JSON.parse(raw) as ResetRequest;
  } catch { return null; }
}
export function clearReset(): void { safeRemove(K_RESET); }

/* --------------------------- sanitization --------------------------- */
/** XSS defense layer 2 — strips payloads BEFORE values reach storage. */
export function sanitizeText(input: string, maxLen = 2000): string {
  return input
    .replace(/<\s*(script|iframe|object|embed|link|style|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\/?[a-z][a-z0-9]*\b[^>]*\/?>/gi, " ")
    .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim()
    .slice(0, maxLen);
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "••••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const dName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0]}•••@${dName[0] ?? "•"}•••${tld}`;
}
