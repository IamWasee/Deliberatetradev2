/* =====================================================================
   Process Score — SERVER-SIDE, single source of truth.
   The API returns ONLY { score, components[] } — no weights, no
   thresholds. The frontend can neither send nor override this value.

   Weighting (private):
     Risk rule adherence 30 · Post-loss behavior 25 · Sizing 15
     Setup discipline 15 · Emotional awareness 10 · Journal quality 5
   ===================================================================== */
import { detectTiltSignals, postLossComponent } from "./tiltDetection.js";

// Private — never serialized to a response.
const W = Object.freeze({
  adherence: 30,
  postLoss: 25,
  sizing: 15,
  setup: 15,
  emotion: 10,
  journal: 5,
});

const DAY = 86400000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* ----------------------------- components --------------------------- */

function adherence(trades, violations, windowDays = 14, now = Date.now()) {
  const cutoff = now - windowDays * DAY;
  const recent = trades.filter((t) => t.exit_ts >= cutoff);
  const recentV = violations.filter((v) => v.ts >= cutoff);
  const n = Math.max(1, recent.length);
  const perTrade = recentV.length / Math.max(6, n * 0.5);
  const overrideRatio = recent.filter((t) => t.override).length / n;
  return clamp01(1 - Math.min(1, perTrade) - overrideRatio * 0.4);
}

function sizing(trades, plan) {
  const rs = trades.filter((t) => t.risk_amount > 0).map((t) => t.risk_pct);
  if (rs.length < 3) return 0.7;
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, x) => s + (x - mean) ** 2, 0) / rs.length);
  const cv = mean > 0 ? sd / mean : 1;
  const over = trades.filter((t) => t.override).length / Math.max(1, trades.length);
  const drift = plan && mean > plan.risk_per_trade_pct * 1.25 ? 0.2 : 0;
  return clamp01(1 - clamp01(cv / 0.6) * 0.8 - over * 0.5 - drift);
}

function setup(trades, plan) {
  if (!trades.length) return 0.7;
  const planSet = new Set(plan?.setups ?? []);
  const tagged = trades.filter((t) => planSet.has(t.setup)).length / trades.length;
  const j = trades.filter((t) => planSet.has(t.setup) && t.journal_grade);
  const quality = j.length ? j.filter((t) => ["A", "B"].includes(t.journal_grade)).length / j.length : 0.5;
  return clamp01(tagged * 0.7 + quality * 0.3);
}

function emotion(trades) {
  if (!trades.length) return 0.7;
  const risky = ["fomo", "revenge", "bored"];
  const reckless = trades.filter((t) => risky.includes(t.checkin_emotion) && (t.override || t.r < 0)).length;
  const awareness = trades.filter((t) => t.journal_grade).length / trades.length;
  return clamp01(awareness * 0.5 + (1 - clamp01((reckless / trades.length) * 3)) * 0.5);
}

function journal(trades) {
  if (!trades.length) return 0.5;
  const filed = trades.filter((t) => t.journal_quality !== null && t.journal_quality !== undefined);
  const rate = filed.length / trades.length;
  const quality = filed.length ? filed.reduce((s, t) => s + t.journal_quality, 0) / filed.length / 100 : 0;
  return clamp01(rate * 0.5 + quality * 0.5);
}

/* ------------------------------ scoring ----------------------------- */

/**
 * Compute the Process Score.
 * @param {{ trades: object[]; violations: object[]; plan: object|null }} data
 * @returns {{ score: number; components: Record<string, number> }}
 */
export function computeProcessScore({ trades, violations, plan }) {
  const signals = detectTiltSignals(trades, violations);
  const components = {
    adherence: adherence(trades, violations),
    postLoss: postLossComponent(trades, signals),
    sizing: sizing(trades, plan),
    setup: setup(trades, plan),
    emotion: emotion(trades),
    journal: journal(trades),
  };
  let score = 0;
  for (const k of Object.keys(W)) score += W[k] * components[k];
  return { score: Math.round(clamp01(score / 100) * 100), components };
}

/**
 * Express handler — note what is NOT returned: weights, thresholds,
 * and the raw component math stay on the server.
 *
 *   router.get("/api/scores/process", requireAuth, async (req, res) => {
 *     const { rows: trades } = await pool.query(TRADES_SQL, [req.user.id]);
 *     const { rows: violations } = await pool.query(VIOLATIONS_SQL, [req.user.id]);
 *     const { rows: [plan] } = await pool.query(PLAN_SQL, [req.user.id]);
 *     const { score, components } = computeProcessScore({ trades, violations, plan });
 *     res.set("Cache-Control", "no-store, max-age=0");
 *     res.json({ score, components: roundedComponentNames(components), updatedAt: Date.now() });
 *   });
 */
export const PROCESS_SQL = {
  trades: `
    SELECT t.id, t.side, t.pnl, t.r, t.risk_amount, t.risk_pct, t.setup, t.override,
           t.violations, t.entry_ts, t.exit_ts, t.checkin_emotion,
           j.grade AS journal_grade, j.quality_score AS journal_quality
    FROM trades t
    LEFT JOIN journals j ON j.trade_id = t.id
    WHERE t.user_id = $1
    ORDER BY t.exit_ts ASC`,
  violations: `
    SELECT id, rule, ts FROM violations WHERE user_id = $1 ORDER BY ts ASC`,
  plan: `
    SELECT risk_per_trade_pct, max_daily_loss_pct, max_open_risk_pct, setups
    FROM plans WHERE user_id = $1 AND active = TRUE LIMIT 1`,
};
