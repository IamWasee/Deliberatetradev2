/* =====================================================================
   Readiness adapter — the ONLY place the engine meets the app.
   Maps this app's trade ledger onto the engine's Trade contract, calls
   calculateReadinessScore (imported verbatim from server/scoring), and
   layers the stage track + gate progress the UI needs on top.
   The engine's weights and thresholds are never rendered as numbers —
   gates are shown as pass/fail with progress, exactly as the engine
   treats them: quantity is a gate, behavior is the score.
   ===================================================================== */
import type { Plan, Trade as AppTrade, Violation } from "./types";
import {
  calculateReadinessScore,
  type FeedbackReport,
  type Trade as EngineTrade,
} from "../../server/scoring/readinessEngine";

export type ReadinessStage =
  | "Not Ready" | "Building Foundations" | "Developing Consistency" | "Almost Ready" | "Ready for Real Capital";

export const STAGES: ReadinessStage[] = [
  "Not Ready", "Building Foundations", "Developing Consistency", "Almost Ready", "Ready for Real Capital",
];

export const STAGE_NOTES: Record<ReadinessStage, string> = {
  "Not Ready": "Gates not cleared — build the sample first: trades, days, journals.",
  "Building Foundations": "Quantity gates passed; behavior quality is the whole game now.",
  "Developing Consistency": "Discipline is showing up — stack clean weeks, not lucky days.",
  "Almost Ready": "Sustained evidence. One strong fortnight away from the green light.",
  "Ready for Real Capital": "Gates cleared, behavior consistent. Export the report and get it reviewed.",
};

export interface GateView { id: string; label: string; pass: boolean; detail: string; progress: number }
export interface ReadinessView {
  eligible: boolean;
  score: number | null;
  stage: ReadinessStage;
  stageIdx: number;
  gateReasons: string[];
  gates: GateView[];
  components: { key: string; label: string; value: number }[] | null;
  feedback: FeedbackReport | null;
}

/* Gate thresholds mirrored for display ONLY (the engine owns the truth). */
const DISPLAY_GATES = { minTrades: 30, minDays: 10, minJournaledPct: 0.8 };

const COMPONENT_LABELS: Record<string, string> = {
  riskAdherence: "Risk rule adherence",
  postLossBehavior: "Post-loss behavior",
  consistency: "Day-to-day consistency",
  positionSizingDiscipline: "Position sizing discipline",
  setupDiscipline: "Setup discipline",
  emotionalStability: "Emotional stability",
};

/** App ledger → engine contract. The engine never sees app internals. */
export function toEngineTrades(trades: AppTrade[], plan: Plan | null): EngineTrade[] {
  const sorted = [...trades].sort((a, b) => a.exitTs - b.exitTs);
  let equity = plan?.startingCapital ?? 25000;
  const maxRisk = plan?.riskPerTradePct ?? 1;
  const dailyLimit = plan?.maxDailyLossPct ?? 3;

  return sorted.map((t) => {
    const equityAtTrade = equity;
    equity += t.pnl;
    // "followed the stated setup" = no violations, no sizing override, and the
    // exit was either planned (stop/target/session) or the journal confirms it.
    const followed =
      t.violations.length === 0 && !t.override &&
      (t.exitReason !== "manual" || t.journal?.followedRules === "yes");
    return {
      id: t.id,
      userId: "local",
      timestampMs: t.exitTs,
      accountEquityAtTrade: Math.max(1, equityAtTrade),
      riskedAmount: t.riskAmount,
      maxRiskAllowedPct: maxRisk,
      dailyLossLimitPct: dailyLimit,
      pnl: t.pnl,
      setupTag: t.setup,
      followedStatedSetup: followed,
      // the app enforces check-in BEFORE every order — never backfilled
      preTradeCheckin: { emotion: t.checkin.emotion, arousalLevel: t.checkin.arousal, submittedBeforeEntry: true },
      journalQualityScore: t.journal ? (t.journal.qualityScore ?? 50) / 100 : null,
    };
  });
}

export function computeReadiness(trades: AppTrade[], violations: Violation[], plan: Plan | null): ReadinessView {
  void violations; // the engine is trade-data-only by design
  const engineTrades = toEngineTrades(trades, plan);
  const res = calculateReadinessScore(engineTrades);

  /* gate progress for display — same thresholds the engine enforces */
  const days = new Set(engineTrades.map((t) => new Date(t.timestampMs).toDateString())).size;
  const journaled = trades.filter((t) => t.journal).length;
  const journaledPct = trades.length ? journaled / trades.length : 0;
  const gates: GateView[] = [
    {
      id: "trades", label: `${DISPLAY_GATES.minTrades}+ closed trades`,
      pass: trades.length >= DISPLAY_GATES.minTrades,
      detail: `${trades.length}/${DISPLAY_GATES.minTrades}`,
      progress: Math.min(1, trades.length / DISPLAY_GATES.minTrades),
    },
    {
      id: "days", label: `${DISPLAY_GATES.minDays}+ distinct trading days`,
      pass: days >= DISPLAY_GATES.minDays,
      detail: `${days}/${DISPLAY_GATES.minDays}`,
      progress: Math.min(1, days / DISPLAY_GATES.minDays),
    },
    {
      id: "journaled", label: `${Math.round(DISPLAY_GATES.minJournaledPct * 100)}%+ of trades journaled`,
      pass: journaledPct >= DISPLAY_GATES.minJournaledPct,
      detail: `${Math.round(journaledPct * 100)}%`,
      progress: Math.min(1, journaledPct / DISPLAY_GATES.minJournaledPct),
    },
  ];

  let stageIdx: number;
  if (!res.eligible || res.score === null) stageIdx = 0;
  else stageIdx = res.score < 30 ? 0 : res.score < 50 ? 1 : res.score < 70 ? 2 : res.score < 85 ? 3 : 4;
  if (stageIdx === 4 && !gates.every((g) => g.pass)) stageIdx = 3;

  const components = res.components
    ? (Object.entries(res.components) as [string, number][]).map(([key, value]) => ({
        key, label: COMPONENT_LABELS[key] ?? key, value,
      }))
    : null;

  return {
    eligible: res.eligible,
    score: res.score,
    stage: STAGES[stageIdx],
    stageIdx,
    gateReasons: res.gateFailureReasons,
    gates,
    components,
    feedback: res.feedback,
  };
}

/** Plain-text report for mentors / prop-firm applications. */
export function readinessReportMarkdown(r: ReadinessView, plan: Plan | null, name: string): string {
  const L: string[] = [];
  L.push("# DeliberateTrade — Real-Money Readiness Report");
  L.push("");
  L.push(`Trader: ${name || "—"} · Plan v${plan?.version ?? "—"} · Generated ${new Date().toISOString().slice(0, 10)}`);
  L.push("");
  L.push(`**Readiness score: ${r.score === null ? "not yet eligible" : `${r.score}/100`} — Stage: ${r.stage}**`);
  L.push("");
  L.push("## Minimum gates");
  r.gates.forEach((g) => L.push(`- [${g.pass ? "x" : " "}] ${g.label} — ${g.detail}`));
  if (!r.eligible) { L.push(""); L.push(`Gate status: ${r.gateReasons.join(" ")}`); }
  L.push("");
  if (r.components) {
    L.push("## Behavior components (rate, 0–100)");
    r.components.forEach((c) => L.push(`- ${c.label}: ${Math.round(c.value * 100)}`));
    L.push("");
  }
  if (r.feedback) {
    L.push("## Coach assessment");
    L.push(`- ${r.feedback.headline}`);
    L.push(`- Trend: ${r.feedback.trendDirection}`);
    if (r.feedback.strongestArea) L.push(`- Strongest area: ${r.feedback.strongestArea}`);
    if (r.feedback.weakestArea) L.push(`- Weakest area: ${r.feedback.weakestArea}`);
    if (r.feedback.actionableNote) L.push(`- Next focus: ${r.feedback.actionableNote}`);
    L.push("");
  }
  L.push("---");
  L.push("_Educational simulation with virtual money only — not financial advice._");
  L.push("_Simulated results do not predict real-money results. Trading involves substantial risk of loss._");
  return L.join("\n");
}
