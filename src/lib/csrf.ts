/* =====================================================================
   CSRF protection — double-submit pattern for the client-only build.
   A 256-bit token lives in same-origin sessionStorage; the store's
   dispatch wrapper stamps every sensitive action; the reducer rejects
   missing/mismatched stamps in constant time before any mutation.
   Server equivalent lives in the header comment of server/scoring/routes.js.
   ===================================================================== */
const K_CSRF = "dt:csrf";
let issuedToken: string | null = null;

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function issueCsrfToken(): string {
  if (issuedToken) return issuedToken;
  try {
    const existing = sessionStorage.getItem(K_CSRF);
    if (existing && /^[a-f0-9]{64}$/.test(existing)) { issuedToken = existing; return existing; }
  } catch { /* in-memory fallback */ }
  const token = randomHex(32);
  try { sessionStorage.setItem(K_CSRF, token); } catch { /* in-memory only */ }
  issuedToken = token;
  return token;
}

/** Constant-time comparison — never `===` on secrets. */
export function isValidCsrfToken(candidate: unknown): boolean {
  const expected = issueCsrfToken();
  if (typeof candidate !== "string" || candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  return diff === 0;
}

export function clearCsrfToken(): void {
  try { sessionStorage.removeItem(K_CSRF); } catch { /* blocked */ }
  issuedToken = null;
}
