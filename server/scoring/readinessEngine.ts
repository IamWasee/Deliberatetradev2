/**
 * DeliberateTrade — Readiness Score Engine
 * -----------------------------------------
 * Server-side only. Never send weights, thresholds, or raw formula
 * to the client — only the final score + human-readable feedback.
 * This is deliberate: if users can see the weights, they optimize
 * for the score instead of the behavior it's meant to measure.
 *
 * Core rule enforced by this code:
 *   - Trade COUNT and DAY COUNT are gates only (pass/fail).
 *   - Once gated, the score is 100% behavior-quality driven.
 *   - Adding more trades after the gate does NOT increase the score.
 *     Only better rate-based behavior does.
 *
 * NOTE: the client demo build imports this very file (single source of
 * truth) via src/lib/readinessAdapter.ts. In a hosted deployment this
 * module lives behind the score API and the client never sees it.
 */

// ---------- Types ----------

export interface Trade {
  id: string;
  userId: string;
  timestampMs: number;
  accountEquityAtTrade: number;      // paper account equity at time of trade
  riskedAmount: number;               // $ actually risked on this trade
  maxRiskAllowedPct: number;          // e.g. 1.0 = 1% of equity, user's own stated rule
  dailyLossLimitPct: number;          // e.g. 3.0 = 3% max daily loss, user's own stated rule
  pnl: number;                        // realized P/L for this trade
  setupTag: string;                   // e.g. "breakout", "pullback" — user-declared setup
  followedStatedSetup: boolean;       // did entry/exit match their pre-trade plan?
  preTradeCheckin: {
    emotion: string;
    arousalLevel: number;             // 1-10 self-reported
    submittedBeforeEntry: boolean;    // false = backfilled after the fact -> ignored for scoring
  } | null;
  journalQualityScore: number | null; // 0-1, from NLP classifier + audit, null if not yet scored
}

export interface DailyAggregate {
  dateKey: string;       // YYYY-MM-DD
  trades: Trade[];
  startEquity: number;
  dailyPnlPct: number;   // computed
  breachedDailyLossLimit: boolean;
}

export interface ReadinessResult {
  eligible: boolean;
  gateFailureReasons: string[];
  score: number | null;          // 0-100, null if not eligible
  components: {
    riskAdherence: number;
    postLossBehavior: number;
    consistency: number;
    positionSizingDiscipline: number;
    setupDiscipline: number;
    emotionalStability: number;
  } | null;
  feedback: FeedbackReport | null;
}

export interface FeedbackReport {
  headline: string;
  trendDirection: "improving" | "declining" | "stable" | "insufficient_data";
  strongestArea: string;
  weakestArea: string;
  actionableNote: string;
}

// ---------- Config (server-only, never exposed to client) ----------

const GATES = {
  MIN_TOTAL_TRADES: 30,
  MIN_TRADING_DAYS: 10,
  MIN_JOURNALED_TRADE_PCT: 0.8,   // 80% of trades need a scored journal to be eligible at all
};

// Weights sum to 1.0. Order reflects the priority the user specified.
const WEIGHTS = {
  riskAdherence: 0.30,
  postLossBehavior: 0.25,
  consistency: 0.15,
  positionSizingDiscipline: 0.12,
  setupDiscipline: 0.10,
  emotionalStability: 0.08,
};

// A rolling window caps how much any single recent trade can move the score,
// which is what makes "spam more trades" not work as a gaming strategy.
const CONSISTENCY_WINDOW_DAYS = 14;
const MIN_TRADES_PER_DAY_TO_COUNT = 1;

// ---------- Entry point ----------

export function calculateReadinessScore(trades: Trade[]): ReadinessResult {
  const gate = checkGates(trades);
  if (!gate.eligible) {
    return {
      eligible: false,
      gateFailureReasons: gate.reasons,
      score: null,
      components: null,
      feedback: null,
    };
  }

  const dailyAggregates = buildDailyAggregates(trades);

  const riskAdherence = scoreRiskAdherence(trades);
  const postLossBehavior = scorePostLossBehavior(trades, dailyAggregates);
  const consistency = scoreConsistency(dailyAggregates);
  const positionSizingDiscipline = scorePositionSizingDiscipline(trades);
  const setupDiscipline = scoreSetupDiscipline(trades);
  const emotionalStability = scoreEmotionalStability(trades);

  const components = {
    riskAdherence,
    postLossBehavior,
    consistency,
    positionSizingDiscipline,
    setupDiscipline,
    emotionalStability,
  };

  const rawScore =
    components.riskAdherence * WEIGHTS.riskAdherence +
    components.postLossBehavior * WEIGHTS.postLossBehavior +
    components.consistency * WEIGHTS.consistency +
    components.positionSizingDiscipline * WEIGHTS.positionSizingDiscipline +
    components.setupDiscipline * WEIGHTS.setupDiscipline +
    components.emotionalStability * WEIGHTS.emotionalStability;

  const score = Math.round(clamp(rawScore, 0, 1) * 100);

  const feedback = buildFeedback(trades, components, score);

  return {
    eligible: true,
    gateFailureReasons: [],
    score,
    components,
    feedback,
  };
}

// ---------- Gate check (quantity as pass/fail only) ----------

function checkGates(trades: Trade[]): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (trades.length < GATES.MIN_TOTAL_TRADES) {
    reasons.push(
      `Needs at least ${GATES.MIN_TOTAL_TRADES} trades (has ${trades.length}).`
    );
  }

  const uniqueDays = new Set(trades.map((t) => dateKey(t.timestampMs)));
  if (uniqueDays.size < GATES.MIN_TRADING_DAYS) {
    reasons.push(
      `Needs at least ${GATES.MIN_TRADING_DAYS} distinct trading days (has ${uniqueDays.size}).`
    );
  }

  const journaledCount = trades.filter(
    (t) => t.journalQualityScore !== null
  ).length;
  const journaledPct = trades.length > 0 ? journaledCount / trades.length : 0;
  if (journaledPct < GATES.MIN_JOURNALED_TRADE_PCT) {
    reasons.push(
      `Needs at least ${Math.round(
        GATES.MIN_JOURNALED_TRADE_PCT * 100
      )}% of trades journaled (has ${Math.round(journaledPct * 100)}%).`
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

// ---------- Component scorers ----------
// Every scorer below returns a 0-1 RATE, never a raw count.
// This is what prevents trade volume from inflating the score.

/** Did they respect their own stated per-trade risk cap and daily loss limit? */
function scoreRiskAdherence(trades: Trade[]): number {
  if (trades.length === 0) return 0;

  const perTradeCompliant = trades.filter((t) => {
    const riskPct = (t.riskedAmount / t.accountEquityAtTrade) * 100;
    return riskPct <= t.maxRiskAllowedPct;
  }).length;

  const dailyAggregates = buildDailyAggregates(trades);
  const daysWithoutBreach = dailyAggregates.filter(
    (d) => !d.breachedDailyLossLimit
  ).length;

  const perTradeRate = perTradeCompliant / trades.length;
  const dailyRate =
    dailyAggregates.length > 0
      ? daysWithoutBreach / dailyAggregates.length
      : 1;

  // Daily loss limit breaches are weighted harder than a single oversized
  // trade — blowing the daily limit is the closer real-world analog to
  // account-blowing behavior.
  return clamp(perTradeRate * 0.4 + dailyRate * 0.6, 0, 1);
}

/**
 * The single most predictive behavioral signal: what do they do in the
 * trades immediately following a loss? Oversizing, abandoning their setup,
 * or re-entering within minutes are classic revenge-trading signatures.
 */
function scorePostLossBehavior(
  trades: Trade[],
  dailyAggregates: DailyAggregate[]
): number {
  const sorted = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);
  const postLossTrades: { trade: Trade; priorLoss: Trade }[] = [];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].pnl < 0) {
      postLossTrades.push({ trade: sorted[i], priorLoss: sorted[i - 1] });
    }
  }

  if (postLossTrades.length === 0) return 1; // no data -> neutral-positive, not penalized

  let cleanReactions = 0;
  for (const { trade, priorLoss } of postLossTrades) {
    const sizeIncreasedAfterLoss =
      trade.riskedAmount > priorLoss.riskedAmount * 1.25; // >25% size bump = flag
    const abandonedSetup = !trade.followedStatedSetup;
    const reEnteredFast =
      trade.timestampMs - priorLoss.timestampMs < 5 * 60 * 1000; // <5 min

    const isCleanReaction =
      !sizeIncreasedAfterLoss && !abandonedSetup && !reEnteredFast;

    if (isCleanReaction) cleanReactions++;
  }

  const cleanRate = cleanReactions / postLossTrades.length;

  // Also fold in: how many days breached the daily loss limit specifically
  // on a day that started with a loss — a stronger tilt indicator.
  const tiltDays = dailyAggregates.filter(
    (d) => (d.trades[0]?.pnl ?? 0) < 0 && d.breachedDailyLossLimit
  ).length;
  const lossStartDays = dailyAggregates.filter(
    (d) => (d.trades[0]?.pnl ?? 0) < 0
  ).length;
  const tiltDayRate =
    lossStartDays > 0 ? 1 - tiltDays / lossStartDays : 1;

  return clamp(cleanRate * 0.7 + tiltDayRate * 0.3, 0, 1);
}

/**
 * Consistency of good behavior across a rolling window, not lifetime average.
 * A user who was disciplined for 60 days and then fell apart for the last 14
 * should score lower than their lifetime average would suggest — recent
 * consistency matters more for "readiness right now."
 */
function scoreConsistency(dailyAggregates: DailyAggregate[]): number {
  const cutoff = Date.now() - CONSISTENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentDays = dailyAggregates.filter(
    (d) => new Date(d.dateKey).getTime() >= cutoff
  );

  const qualifyingDays = recentDays.filter(
    (d) => d.trades.length >= MIN_TRADES_PER_DAY_TO_COUNT
  );

  if (qualifyingDays.length === 0) return 0;

  const compliantDays = qualifyingDays.filter(
    (d) => !d.breachedDailyLossLimit
  ).length;

  // Reward spread of good days across the window, not just a raw ratio —
  // a user who traded 3 days perfectly looks different from one who traded
  // 12 of 14 days well. Both matter, so blend ratio with day coverage.
  const complianceRatio = compliantDays / qualifyingDays.length;
  const coverageRatio = Math.min(
    qualifyingDays.length / CONSISTENCY_WINDOW_DAYS,
    1
  );

  return clamp(complianceRatio * 0.8 + coverageRatio * 0.2, 0, 1);
}

/** Variance in position sizing relative to their own stated rule, not just breach rate. */
function scorePositionSizingDiscipline(trades: Trade[]): number {
  if (trades.length === 0) return 0;

  const riskPcts = trades.map(
    (t) => (t.riskedAmount / t.accountEquityAtTrade) * 100 / t.maxRiskAllowedPct
  ); // 1.0 = exactly at their own limit, <1 = under, >1 = over

  const mean = average(riskPcts);
  const variance =
    riskPcts.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    riskPcts.length;
  const stdDev = Math.sqrt(variance);

  // Low variance around a sane mean (not consistently maxed out) = disciplined.
  const meanScore = mean <= 1 ? 1 : clamp(1 - (mean - 1), 0, 1);
  const varianceScore = clamp(1 - stdDev, 0, 1);

  return clamp(meanScore * 0.5 + varianceScore * 0.5, 0, 1);
}

/** Did they trade the setup they declared, or drift into impulsive entries? */
function scoreSetupDiscipline(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const followed = trades.filter((t) => t.followedStatedSetup).length;
  return followed / trades.length;
}

/**
 * Emotional stability score. Deliberately weighted lowest of the six because
 * self-reported arousal is the easiest input to game — a user can just
 * always report "calm, 2/10." We discount check-ins that look suspicious
 * (identical values every time) rather than trusting them at face value.
 */
function scoreEmotionalStability(trades: Trade[]): number {
  const validCheckins = trades
    .map((t) => t.preTradeCheckin)
    .filter(
      (c): c is NonNullable<Trade["preTradeCheckin"]> =>
        c !== null && c.submittedBeforeEntry
    );

  if (validCheckins.length === 0) return 0.5; // insufficient data -> neutral

  const arousalValues = validCheckins.map((c) => c.arousalLevel);
  const uniqueValues = new Set(arousalValues);

  // Suspiciously low variance across many check-ins suggests the field is
  // being auto-filled/gamed rather than genuinely reported. Penalize it.
  const suspicionPenalty =
    validCheckins.length >= 15 && uniqueValues.size <= 2 ? 0.3 : 0;

  const highArousalTrades = validCheckins.filter(
    (c) => c.arousalLevel >= 8
  ).length;
  const highArousalRate = highArousalTrades / validCheckins.length;

  const baseScore = clamp(1 - highArousalRate, 0, 1);
  return clamp(baseScore - suspicionPenalty, 0, 1);
}

// ---------- Feedback generation ----------

function buildFeedback(
  trades: Trade[],
  components: ReadinessResult["components"],
  currentScore: number
): FeedbackReport {
  if (!components) {
    return {
      headline: "Not enough data yet.",
      trendDirection: "insufficient_data",
      strongestArea: "",
      weakestArea: "",
      actionableNote: "",
    };
  }

  // Compare current window vs. the prior equal-length window to show trend,
  // instead of just an absolute number the user can't act on.
  const sorted = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);
  const midpoint = Math.floor(sorted.length / 2);
  const earlierHalf = sorted.slice(0, midpoint);
  const laterHalf = sorted.slice(midpoint);

  let trendDirection: FeedbackReport["trendDirection"] = "insufficient_data";
  if (earlierHalf.length >= GATES.MIN_TOTAL_TRADES / 2 && laterHalf.length >= GATES.MIN_TOTAL_TRADES / 2) {
    const earlierResult = calculateReadinessScore(earlierHalf);
    if (earlierResult.eligible && earlierResult.score !== null) {
      const diff = currentScore - earlierResult.score;
      trendDirection = diff > 3 ? "improving" : diff < -3 ? "declining" : "stable";
    }
  }

  const entries = Object.entries(components) as [string, number][];
  const sortedByScore = [...entries].sort((a, b) => b[1] - a[1]);
  const strongestArea = labelFor(sortedByScore[0][0]);
  const weakestArea = labelFor(sortedByScore[sortedByScore.length - 1][0]);

  const headline =
    trendDirection === "improving"
      ? `Your trading discipline is trending up — driven mainly by ${strongestArea}.`
      : trendDirection === "declining"
      ? `Your discipline has slipped recently — mainly in ${weakestArea}.`
      : `Your discipline is holding steady. Strongest: ${strongestArea}, weakest: ${weakestArea}.`;

  const actionableNote = actionableNoteFor(sortedByScore[sortedByScore.length - 1][0]);

  return { headline, trendDirection, strongestArea, weakestArea, actionableNote };
}

function labelFor(key: string): string {
  const labels: Record<string, string> = {
    riskAdherence: "risk rule adherence",
    postLossBehavior: "post-loss behavior",
    consistency: "day-to-day consistency",
    positionSizingDiscipline: "position sizing discipline",
    setupDiscipline: "setup discipline",
    emotionalStability: "emotional stability",
  };
  return labels[key] ?? key;
}

function actionableNoteFor(key: string): string {
  const notes: Record<string, string> = {
    riskAdherence:
      "Focus on staying under your own stated max-risk-per-trade and daily loss limit — this carries the most weight in your score.",
    postLossBehavior:
      "Watch your sizing and setup adherence in the trades right after a loss — that's where discipline tends to break down first.",
    consistency:
      "Aim for steady compliance across more trading days rather than a few perfect ones — recent consistency matters more than lifetime average.",
    positionSizingDiscipline:
      "Try to keep your position size closer to a consistent fraction of your risk limit, rather than varying it trade to trade.",
    setupDiscipline:
      "Stick to the setup you declare before entry — drifting from your stated plan is being tracked and scored.",
    emotionalStability:
      "Make sure your pre-trade check-ins reflect how you actually feel — genuinely high-arousal trades are the ones most worth pausing on.",
  };
  return notes[key] ?? "";
}

// ---------- Helpers ----------

function buildDailyAggregates(trades: Trade[]): DailyAggregate[] {
  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = dateKey(t.timestampMs);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t);
  }

  const aggregates: DailyAggregate[] = [];
  for (const [key, dayTrades] of byDay.entries()) {
    const sorted = [...dayTrades].sort((a, b) => a.timestampMs - b.timestampMs);
    const startEquity = sorted[0].accountEquityAtTrade;
    const totalPnl = sorted.reduce((sum, t) => sum + t.pnl, 0);
    const dailyPnlPct = startEquity > 0 ? (totalPnl / startEquity) * 100 : 0;
    const dailyLossLimitPct = sorted[0].dailyLossLimitPct;

    aggregates.push({
      dateKey: key,
      trades: sorted,
      startEquity,
      dailyPnlPct,
      breachedDailyLossLimit: dailyPnlPct <= -Math.abs(dailyLossLimitPct),
    });
  }

  return aggregates.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function dateKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
