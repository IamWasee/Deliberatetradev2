/* Environment-proof primitives: never let storage or cloning take the app down. */

export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded / storage disabled — non-fatal */
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** structuredClone where available; JSON round-trip elsewhere. State is plain JSON-safe data. */
export function deepClone<T>(value: T): T {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {
    /* fall through */
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/* -------- schema coercion helpers for rehydrated state -------- */
export const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

export const str = (v: unknown, d: string): string =>
  typeof v === "string" ? v : d;

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

export const bool = (v: unknown, d = false): boolean =>
  typeof v === "boolean" ? v : d;
