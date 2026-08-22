/* =====================================================================
   Data-access boundary — the SQL-injection-safe layer.
   This client build persists JSON locally; every accessor takes a
   compile-time-constant key and parameterized values are compared as
   data, never interpolated into a query string. When a backend exists,
   the same functions become thin wrappers over prepared statements:

     SELECT id, symbol, setup, pnl, r FROM trades
     WHERE user_id = $1 AND ($2::text IS NULL OR symbol = $2) AND r >= $4
     ORDER BY exit_ts DESC LIMIT $5;
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

export function removeTable(key: string): void {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

export interface TradeSearchParams { symbol?: string; minR?: number; limit?: number }

/** Parameterized trade search — the client mirror of a prepared statement. */
export function searchTrades(trades: Trade[], params: TradeSearchParams): Trade[] {
  let out = trades;
  if (typeof params.symbol === "string" && params.symbol.length > 0) {
    const symbol = params.symbol.toUpperCase();
    out = out.filter((t) => t.symbol === symbol);
  }
  if (typeof params.minR === "number" && Number.isFinite(params.minR)) {
    const minR = params.minR;
    out = out.filter((t) => t.r >= minR);
  }
  const limit = Math.min(Math.max(1, Math.floor(params.limit ?? 50)), 200);
  return out.slice(0, limit);
}
