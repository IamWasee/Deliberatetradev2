/* Environment-proof primitives: storage, cloning, type coercion. */

export function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function safeSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* full or blocked */ }
}
export function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

/** structuredClone with a JSON fallback for older engines. */
export function deepClone<T>(v: T): T {
  try {
    if (typeof structuredClone === "function") return structuredClone(v);
  } catch { /* fall through */ }
  return JSON.parse(JSON.stringify(v)) as T;
}

/* coercion helpers for rehydrating persisted data */
export const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
export const str = (v: unknown, d: string): string => (typeof v === "string" ? v : d);
export const bool = (v: unknown): boolean => v === true;
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

let n = 0;
export const nid = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${(n++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const uid8 = (): string => Math.random().toString(36).slice(2, 10);
