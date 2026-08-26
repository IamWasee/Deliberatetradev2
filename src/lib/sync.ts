/* =====================================================================
   Trading-data sync — pushes the local desk state to Postgres.

   DESIGN
   The simulator ticks every 850ms. Syncing on every tick would mean ~4,000
   writes an hour per user for data nobody reads that often, so this module
   is deliberately event-driven and debounced: it pushes when something
   durable actually happened (a trade closed, a journal was filed, the
   session ended), and at most once every SYNC_MIN_MS otherwise.

   Local storage stays the source of truth for the live desk. This is a
   mirror for cross-device continuity and the admin console, not the
   authority the UI reads from - so a failed sync degrades to "the admin
   view is a little stale", never to a broken trading session.

   PRIVACY
   Journal prose and pre-trade theses go to `journals`, which no admin
   policy can read. Everything pushed to `trades` is metric-only: scores,
   grades, tags and numbers. Keep it that way - if free text is ever added
   to a metric table it becomes readable by staff, and the privacy policy
   in views/Legal.tsx says it is not.
   ===================================================================== */
import { supabase, hasSupabase } from "./supabase";
import type { AppState } from "./store";
import type { Trade, Violation } from "./types";

const SYNC_MIN_MS = 20_000;

let lastSync = 0;
let inFlight = false;
let pendingUserId: string | null = null;

const iso = (ms: number): string => new Date(ms).toISOString();

/* ---------------------------- shaping -------------------------------- */

function tradeRow(userId: string, t: Trade) {
  return {
    user_id: userId,
    client_id: t.id,
    symbol: t.symbol,
    side: t.side,
    qty: t.qty,
    entry: t.entry,
    exit: t.exit,
    pnl: t.pnl,
    fees: t.fees,
    r: t.r,
    risk_amount: t.riskAmount,
    risk_pct: t.riskPct,
    setup: t.setup,
    exit_reason: t.exitReason,
    /* Tags and scores only. The thesis text itself goes to `journals`. */
    emotion_before: t.checkin?.emotion ?? null,
    arousal_before: t.checkin?.arousal ?? null,
    emotion_during: t.journal?.emotionDuring ?? null,
    emotion_after: t.journal?.emotionAfter ?? null,
    followed_rules: t.journal ? t.journal.followedRules === "yes" : null,
    grade: t.journal?.grade ?? null,
    journal_quality: t.journal?.qualityScore ?? null,
    override: t.override,
    violations: t.violations ?? [],
    regime: t.regime,
    stress_hits: t.stressHits,
    opened_at: iso(t.entryTs),
    closed_at: iso(t.exitTs),
  };
}

/** Free text, bound for the author-only table. */
function journalRow(userId: string, t: Trade) {
  const j = t.journal;
  if (!j) return null;
  return {
    user_id: userId,
    client_id: t.id + ":journal",
    trade_client_id: t.id,
    plan_text: j.plan || null,
    what_happened: j.whatHappened || null,
    rules_note: j.rulesNote || null,
    lesson: j.lesson || null,
    thesis: t.checkin?.thesis || null,
    created_at: iso(j.at),
  };
}

function violationRow(userId: string, v: Violation) {
  return {
    user_id: userId,
    client_id: v.id,
    rule: v.rule,
    detail: v.detail,
    at_tick: v.at,
    created_at: iso(v.ts),
  };
}

export interface StatsInput { winRate: number; avgR: number; processScore: number }

function statsRow(userId: string, s: AppState, extra: StatsInput) {
  const realized = s.trades.reduce((a, t) => a + t.pnl, 0);
  return {
    user_id: userId,
    equity: s.equity,
    session_pnl: s.equity - s.sessionStartEquity,
    realized_pnl: realized,
    open_risk: s.positions.reduce((a, p) => a + p.riskAmount, 0),
    trade_count: s.trades.length,
    win_rate: extra.winRate,
    avg_r: extra.avgR,
    process_score: Math.round(extra.processScore),
    violation_count: s.violations.length,
    journal_count: s.trades.filter((t) => t.journal).length,
    journals_due: s.journalDue.length,
    breaches: s.breaches,
    updated_at: new Date().toISOString(),
  };
}

/* ----------------------------- push ---------------------------------- */

/** Mirror the current desk to Postgres. Never throws: a sync failure must
    not interrupt a trading session. Returns true when everything landed. */
export async function pushState(userId: string, s: AppState, extra: StatsInput): Promise<boolean> {
  if (!hasSupabase() || !s.plan) return false;
  const db = supabase();

  try {
    await db.from("plans").upsert({
      user_id: userId,
      version: s.plan.version,
      starting_capital: s.plan.startingCapital,
      risk_per_trade_pct: s.plan.riskPerTradePct,
      max_daily_loss_pct: s.plan.maxDailyLossPct,
      max_open_risk_pct: s.plan.maxOpenRiskPct,
      max_positions: s.plan.maxPositions,
      setups: s.plan.setups,
      forbidden: s.plan.forbidden,
      note: s.plan.note,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (s.trades.length) {
      await db.from("trades").upsert(
        s.trades.map((t) => tradeRow(userId, t)), { onConflict: "user_id,client_id" });

      const journals = s.trades
        .map((t) => journalRow(userId, t))
        .filter((j): j is NonNullable<typeof j> => j !== null);
      if (journals.length) {
        await db.from("journals").upsert(journals, { onConflict: "user_id,client_id" });
      }
    }

    if (s.violations.length) {
      await db.from("violations").upsert(
        s.violations.map((v) => violationRow(userId, v)), { onConflict: "user_id,client_id" });
    }

    /* Open positions are a live mirror: replace rather than accumulate, or
       closed trades would linger as phantom open risk in the admin view. */
    await db.from("positions").delete().eq("user_id", userId);
    if (s.positions.length) {
      await db.from("positions").insert(s.positions.map((p) => ({
        user_id: userId,
        client_id: p.id,
        symbol: p.symbol,
        side: p.side,
        qty: p.qty,
        avg_entry: p.avgEntry,
        stop: p.stop,
        target: p.target,
        risk_amount: p.riskAmount,
        risk_pct: p.riskPct,
        setup: p.setup,
        opened_at: iso(p.openedTs),
      })));
    }

    await db.from("user_stats").upsert(statsRow(userId, s, extra), { onConflict: "user_id" });

    lastSync = Date.now();
    return true;
  } catch {
    /* Offline, blocked, or policy-refused. The desk keeps working from
       localStorage; the next successful push reconciles everything. */
    return false;
  }
}

/** Debounced entry point. `force` bypasses the interval for events worth
    persisting immediately - a closed trade, a filed journal, session end. */
export function queueSync(userId: string, s: AppState, extra: StatsInput, force = false): void {
  pendingUserId = userId;
  if (inFlight) return;
  if (!force && Date.now() - lastSync < SYNC_MIN_MS) return;
  inFlight = true;
  void pushState(userId, s, extra).finally(() => {
    inFlight = false;
    pendingUserId = null;
  });
}

export const syncPending = (): boolean => inFlight || pendingUserId !== null;
