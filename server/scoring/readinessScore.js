/* =====================================================================
   Readiness Score API adapter.
   The math lives in readinessEngine.ts (single source of truth).
   This module maps SQL rows → engine Trade contract, runs the engine,
   and layers the stage track + display gates on top. The engine's
   weights/thresholds are never serialized — only score, stage, gates,
   components (rounded rates) and the feedback report.
   ===================================================================== */
import { calculateReadinessScore } from "./readinessEngine.ts";

const DAY = 86400000;

const STAGES = [
  "Not Ready", "Building Foundations", "Developing Consistency",
  "Almost Ready", "Ready for Real Capital",
];

/** Mirror of the engine gates, for pass/fail display only. */
const DISPLAY_GATES = { MIN_TOTAL_TRADES: 30, MIN_TRADING_DAYS: 10, MIN_JOURNALED_PCT: 0.8 };

/**
 * @param {{ trades: object[]; violations: object[]; plan: object|null }} data
 *   trades: rows from PROCESS_SQL.trades (snake_case, journal joined)
 */
export function computeReadinessScore({ trades, violations, plan }) {
  void violations; // engine is trade-data-only by design

  // --- map SQL rows → engine contract ---
  const maxRisk = plan?.risk_per_trade_pct ?? 1;
  const dailyLimit = plan?.max_daily_loss_pct ?? 3;
  let equity = plan?.starting_capital ?? 25000;

  const engineTrades = [...trades]
    .sort((a, b) => new Date(a.exit_ts) - new Date(b.exit_ts))
    .map((t) => {
      const equityAtTrade = equity;
      equity += Number(t.pnl);
      const followed =
        (Array.isArray(t.violations) ? t.violations.length === 0 : true) &&
        !t.override &&
        (t.exit_reason !== "manual" || t.journal_followed === "yes");
      return {
        id: t.id,
        userId: t.user_id,
        timestampMs: new Date(t.exit_ts).getTime(),
        accountEquityAtTrade: Math.max(1, equityAtTrade),
        riskedAmount: Number(t.risk_amount),
        maxRiskAllowedPct: maxRisk,
        dailyLossLimitPct: dailyLimit,
        pnl: Number(t.pnl),
        setupTag: t.setup,
        followedStatedSetup: followed,
        preTradeCheckin: t.checkin_emotion
          ? { emotion: t.checkin_emotion, arousalLevel: Number(t.checkin_arousal ?? 4), submittedBeforeEntry: true }
          : null,
        journalQualityScore:
          t.journal_quality !== null && t.journal_quality !== undefined
            ? Number(t.journal_quality) / 100
            : null,
      };
    });

  // --- run the engine (weights stay inside) ---
  const res = calculateReadinessScore(engineTrades);

  // --- stage track on top of the raw score ---
  let stageIdx;
  if (!res.eligible || res.score === null) stageIdx = 0;
  else stageIdx = res.score < 30 ? 0 : res.score < 50 ? 1 : res.score < 70 ? 2 : res.score < 85 ? 3 : 4;

  const gates = [
    { id: "trades", label: `${DISPLAY_GATES.MIN_TOTAL_TRADES}+ closed trades`, pass: engineTrades.length >= DISPLAY_GATES.MIN_TOTAL_TRADES, detail: `${engineTrades.length}/${DISPLAY_GATES.MIN_TOTAL_TRADES}` },
    { id: "days", label: `${DISPLAY_GATES.MIN_TRADING_DAYS}+ distinct trading days`, pass: new Set(engineTrades.map((t) => new Date(t.timestampMs).toDateString())).size >= DISPLAY_GATES.MIN_TRADING_DAYS, detail: `${new Set(engineTrades.map((t) => new Date(t.timestampMs).toDateString())).size}/${DISPLAY_GATES.MIN_TRADING_DAYS}` },
    { id: "journaled", label: `${DISPLAY_GATES.MIN_JOURNALED_PCT * 100}%+ of trades journaled`, pass: engineTrades.length ? engineTrades.filter((t) => t.journalQualityScore !== null).length / engineTrades.length >= DISPLAY_GATES.MIN_JOURNALED_PCT : false, detail: `${Math.round((engineTrades.length ? engineTrades.filter((t) => t.journalQualityScore !== null).length / engineTrades.length : 0) * 100)}%` },
  ];
  if (stageIdx === 4 && !gates.every((g) => g.pass)) stageIdx = 3;

  return {
    eligible: res.eligible,
    score: res.score,
    stage: STAGES[stageIdx],
    gates,
    gateReasons: res.gateFailureReasons,
    components: res.components
      ? Object.entries(res.components).map(([key, value]) => ({ key, label: key, value: Math.round(value * 100) }))
      : null,
    feedback: res.feedback,
  };
}

export const READINESS_SQL = {
  trades: `
    SELECT t.id, t.user_id, t.side, t.pnl, t.r, t.risk_amount, t.risk_pct, t.setup,
           t.override, t.violations, t.exit_reason, t.entry_ts, t.exit_ts,
           t.checkin_emotion, t.checkin_arousal,
           j.grade AS journal_grade, j.quality_score AS journal_quality,
           j.followed_rules AS journal_followed
    FROM trades t
    LEFT JOIN journals j ON j.trade_id = t.id
    WHERE t.user_id = $1
    ORDER BY t.exit_ts ASC`,
};
