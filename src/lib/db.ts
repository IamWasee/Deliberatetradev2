/* =====================================================================
   Data-access boundary (SQL-injection-safe by construction).
   This build has no SQL engine — persistence is structured JSON through
   parameterized accessors. Free-text query paths (the journal search)
   are compared as DATA, never interpolated. When a database ships,
   swap the filter for bound parameters:

     SELECT * FROM trades WHERE user_id = $1
       AND ($2::text IS NULL OR symbol = $2) AND r >= $3
       ORDER BY exit_ts DESC LIMIT $4;
   ===================================================================== */
import { safeGet, safeSet } from "./safe";
import type { Trade } from "./types";

export function readTable<T>(key: string, fallback: T): T {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
export function writeTable(key: string, value: unknown): void {
  safeSet(key, JSON.stringify(value));
}

export interface TradeSearchParams { symbol?: string; minR?: number; limit?: number }

/** Parameterized trade search — the exact shape of a prepared statement. */
export function searchTrades(trades: Trade[], params: TradeSearchParams): Trade[] {
  let out = trades;
  if (typeof params.symbol === "string" && params.symbol.length > 0) {
    const symbol = params.symbol.toUpperCase();
    out = out.filter((t) => t.symbol === symbol); // compared, never concatenated
  }
  if (typeof params.minR === "number" && Number.isFinite(params.minR)) {
    out = out.filter((t) => t.r >= (params.minR as number));
  }
  const limit = Math.min(Math.max(1, Math.floor(params.limit ?? 50)), 200);
  return out.slice(0, limit);
}
