/* =====================================================================
   Readiness Score — SERVER-SIDE. Estimates real-money / prop-firm
   readiness from PROVEN behavior over time.

   Core principle: quantity is a GATE, quality is the score. A user with
   500 sloppy trades scores LOWER than one with 60 disciplined trades.

   Minimum gates (all required for "Ready"):
     ≥50 closed trades · ≥15 active days · no serious violations in the
     last 14 days · recent (last 30) process average ≥ 65

   Components (private weights):
     Recent process avg 25 · Risk adherence 25 · Post-loss behavior 20
     Consistency 15 · Sample/time depth 10 · Setup+emotion 5
   ===================================================================== */
import { computeProcessScore } from "./processScore.js";
import { detectTiltSignals, postLossComponent } from "./tiltDetection.js";

const DAY = 86400000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const GATES = Object.freeze({
  minTrades: 50,
  minDays: 15,
  cleanWindowDays: 14,
  minRecentProcess: 65,
});

export const STAGES = Object.freeze([
  "Not Ready",
  "Building Foundations",
  "Developing Consistency",
  "Almost Ready",
  "Ready for Real Capital",
]);

const SERIOUS_RE = /(daily loss|circuit|tilt|oversize|risk rule|breaking my risk)/i;

function activeDays(trades) {
  return new Set(trades.map((t) => new Date(t.exit_ts).toDateString())).size;
}

/**
 * @param {{ trades: object[]; violations: object[]; plan: object|null }} data
 * @returns {{
 *   score: number; stage: string; stageIdx: number;
 *   gates: Array<{ id: string; label: string; pass: boolean; detail: string }>;
 *   components: Array<{ key: string; label: string; value: number }>;
 *   feedback: string[];
 * }}
 */
export function computeReadinessScore({ trades, violations, plan }, now = Date.now()) {
  const signals = detectTiltSignals(trades, violations);
  const days = activeDays(trades);
  const recent30 = trades.slice(-30);
  const recentProcess = recent30.length >= 10
    ? computeProcessScore({ trades: recent30, violations, plan }).score
    : 0;

  const seriousRecent = violations.filter(
    (v) => v.ts >= now - GATES.cleanWindowDays * DAY && SERIOUS_RE.test(v.rule));

  /* ------------------------------ gates ----------------------------- */
  const gates = [
    {
      id: "trades", label: `Minimum ${GATES.minTrades} closed trades`,
      pass: trades.length >= GATES.minTrades,
      detail: `${trades.length}/${GATES.minTrades} closed`,
    },
    {
      id: "days", label: `Minimum ${GATES.minDays} active trading days`,
      pass: days >= GATES.minDays,
      detail: `${days}/${GATES.minDays} days`,
    },
    {
      id: "clean", label: `No serious violations in the last ${GATES.cleanWindowDays} days`,
      pass: seriousRecent.length === 0,
      detail: seriousRecent.length ? `${seriousRecent.length} serious violation(s)` : "clean window",
    },
    {
      id: "process", label: `Recent process average ≥ ${GATES.minRecentProcess}`,
      pass: recent30.length >= 10 && recentProcess >= GATES.minRecentProcess,
      detail: recent30.length >= 10 ? `recent process ${recentProcess}` : "needs ≥10 recent trades",
    },
  ];

  /* --------------------------- components --------------------------- */
  const last75 = trades.slice(-75);
  const adherenceC = (() => {
    const cutoff = now - 30 * DAY;
    const recent = last75.filter((t) => t.exit_ts >= cutoff);
    const recentV = violations.filter((v) => v.ts >= cutoff);
    const n = Math.max(1, recent.length);
    return clamp01(1 - Math.min(1, recentV.length / Math.max(6, n * 0.5)) -
      (recent.filter((t) => t.override).length / n) * 0.4);
  })();

  const consistency = (() => {
    if (!days) return 0;
    const byDay = new Map();
    for (const t of trades) {
      const k = new Date(t.exit_ts).toDateString();
      const d = byDay.get(k) ?? { pnl: 0, bad: false };
      d.pnl += t.pnl;
      if ((t.violations || []).length > 0 || t.override) d.bad = true;
      byDay.set(k, d);
    }
    const limitPct = plan?.max_daily_loss_pct ?? 3;
    const capital = plan?.starting_capital ?? 25000;
    const limit = (limitPct / 100) * capital;
    let good = 0;
    byDay.forEach((d) => { if (!d.bad && d.pnl > -limit * 0.6) good++; });
    return good / byDay.size;
  })();

  const setupEmotion = (() => {
    if (!trades.length) return 0.7;
    const planSet = new Set(plan?.setups ?? []);
    const tagged = trades.filter((t) => planSet.has(t.setup)).length / trades.length;
    const risky = ["fomo", "revenge", "bored"];
    const reckless = trades.filter((t) => risky.includes(t.checkin_emotion) && (t.override || t.r < 0)).length / trades.length;
    return clamp01(tagged * 0.6 + (1 - clamp01(reckless * 3)) * 0.4);
  })();

  const c = {
    recentProcess: recent30.length >= 10 ? recentProcess / 100 : 0,
    adherence: adherenceC,
    postLoss: postLossComponent(trades, signals, now),
    consistency,
    // saturates at 100 trades / 30 days — more volume adds NOTHING after that
    sample: 0.5 * Math.min(1, trades.length / 100) + 0.5 * Math.min(1, days / 30),
    setupEmotion,
  };

  const W = { recentProcess: 25, adherence: 25, postLoss: 20, consistency: 15, sample: 10, setupEmotion: 5 };
  let raw = 0;
  for (const k of Object.keys(W)) raw += W[k] * clamp01(c[k]);

  /* gates CAP the score — volume can never buy readiness */
  const quantityPass = gates[0].pass && gates[1].pass;
  const qualityPass = gates[2].pass && gates[3].pass;
  let score = Math.round(raw);
  if (!quantityPass) score = Math.min(score, 25);
  else if (!qualityPass) score = Math.min(score, 45);

  let stageIdx = score < 30 ? 0 : score < 50 ? 1 : score < 70 ? 2 : score < 85 ? 3 : 4;
  if (!quantityPass) stageIdx = Math.min(stageIdx, 0);
  else if (!qualityPass) stageIdx = Math.min(stageIdx, 1);
  if (stageIdx === 4 && !gates.every((g) => g.pass)) stageIdx = 3;

  /* ----------------------------- feedback --------------------------- */
  const feedback = [];
  gates.filter((g) => !g.pass).forEach((g) => feedback.push(`Gate: ${g.label.toLowerCase()} — ${g.detail}.`));
  const gaps = [
    ["Post-loss behavior", c.postLoss, "After losses, keep size flat and wait. Revenge trading is the single biggest readiness killer."],
    ["Risk rule adherence", c.adherence, "Let the sizing calculator run every order — two straight weeks without a violation moves this fast."],
    ["Recent process", c.recentProcess, "Your most recent 30 trades set the tone. Slow down; take only A-grade setups."],
    ["Day-to-day consistency", c.consistency, "Stack clean days: zero violations and daily losses inside half your limit."],
    ["Setup & emotional discipline", c.setupEmotion, "Stick to your two best setups and report emotional state honestly."],
    ["Sample depth", c.sample, "Reach ~100 trades across ~30 days so the sample proves something."],
  ].sort((a, b) => a[1] - b[1]);
  for (const [name, val, tip] of gaps.slice(0, 2)) {
    if (val < 0.85) feedback.push(`${name} is the gap (${Math.round(val * 100)}/100). ${tip}`);
  }
  if (stageIdx === 4) feedback.push("Gates cleared and behavior is consistent — export the readiness report for a mentor or prop-firm review.");
  if (!feedback.length) feedback.push("Hold the standard. Readiness is rented daily, not owned.");

  return {
    score,
    stage: STAGES[stageIdx],
    stageIdx,
    gates,
    components: [
      { key: "recentProcess", label: "Recent process average", value: c.recentProcess },
      { key: "adherence", label: "Risk rule adherence", value: c.adherence },
      { key: "postLoss", label: "Post-loss behavior", value: c.postLoss },
      { key: "consistency", label: "Consistency (good days)", value: c.consistency },
      { key: "sample", label: "Sample & time depth", value: c.sample },
      { key: "setupEmotion", label: "Setup & emotional discipline", value: c.setupEmotion },
    ],
    feedback,
  };
}

/**
 * Route blueprint — opaque response, no weights or thresholds leak:
 *
 *   router.get("/api/scores/readiness", requireAuth, async (req, res) => {
 *     const { rows: trades } = await pool.query(PROCESS_SQL.trades, [req.user.id]);
 *     const { rows: violations } = await pool.query(PROCESS_SQL.violations, [req.user.id]);
 *     const { rows: [plan] } = await pool.query(PROCESS_SQL.plan, [req.user.id]);
 *     const r = computeReadinessScore({ trades, violations, plan });
 *     res.set("Cache-Control", "no-store, max-age=0");
 *     res.json({
 *       score: r.score, stage: r.stage, feedback: r.feedback,
 *       gates: r.gates.map(({ id, label, pass, detail }) => ({ id, label, pass, detail })),
 *       components: r.components.map(({ key, label, value }) => ({ key, label, value: Math.round(value * 100) })),
 *       updatedAt: Date.now(),
 *     });
 *   });
 */
export { PROCESS_SQL } from "./processScore.js";
