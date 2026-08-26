/* =====================================================================
   Sync driver — the single place that decides WHEN to mirror the desk.

   Kept apart from sync.ts so the push logic stays testable and free of
   React, and so there is exactly one subscriber rather than a scattering
   of components each firing their own writes.
   ===================================================================== */
import { useEffect, useRef } from "react";
import { useApp } from "./store";
import { computeProcess } from "./coaching";
import { queueSync } from "./sync";

export function useSync(userId: string | null): void {
  const { state: s } = useApp();
  /* Trades and journals only ever grow, so their counts are a cheap and
     reliable "something durable happened" signal. */
  const prev = useRef({ trades: -1, journals: -1, session: -1 });

  useEffect(() => {
    if (!userId || !s.hydrated || !s.plan) return;

    const journals = s.trades.filter((t) => t.journal).length;
    const wins = s.trades.filter((t) => t.pnl > 0).length;
    const extra = {
      winRate: s.trades.length ? wins / s.trades.length : 0,
      avgR: s.trades.length ? s.trades.reduce((a, t) => a + t.r, 0) / s.trades.length : 0,
      processScore: computeProcess(s.trades, s.violations, s.plan).score,
    };

    const p = prev.current;
    const durable =
      s.trades.length !== p.trades ||
      journals !== p.journals ||
      s.session !== p.session;

    prev.current = { trades: s.trades.length, journals, session: s.session };

    /* First run after hydration also forces, so a returning user's history
       reaches the server even if they never place a trade this session. */
    queueSync(userId, s, extra, durable || p.trades === -1);
  }, [userId, s]);
}
