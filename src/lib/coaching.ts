/* =====================================================================
   Scoring engine (client mirror of server/scoring/*).
   The backend is authoritative; this module reproduces the identical
   rules so the standalone build stays fully functional. Scores are
   ALWAYS derived from the trade log — never stored, never sendable.

   Process Score weights (total 100):
     Risk rule adherence 30 · Post-loss behavior 25 · Sizing 15
     Setup discipline 15 · Emotional awareness 10 · Journal quality 5

   Readiness Score: quantity is a GATE, quality is the score.
   ===================================================================== */
import { EMOTIONS, emotionLabel, type EmotionTag, type Plan, type Trade, type Violation } from "./types";
import { nid } from "./safe";
import type { Mission } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* =====================================================================
   1 · TILT / REVENGE DETECTION — trade data only, six signals.
   ===================================================================== */
export type TiltType =
  | "size-up-after-loss"
  | "rapid-reentry"
  | "setup-abandon"
  | "rule-break-after-loss"
  | "overtrading-burst"
  | "revenge-flip";

export interface TiltSignal {
  key: string; type: TiltType; severity: 1 | 2 | 3;
  at: number;             // ts of the offending trade/act
  detail: string;
}

export const TILT_META: Record<TiltType, { label: string }> = {
  "size-up-after-loss": { label: "Size increase after loss" },
  "rapid-reentry": { label: "Rapid re-entry after loss" },
  "setup-abandon": { label: "Abandoned setups after red streak" },
  "rule-break-after-loss": { label: "Broke risk rules after loss" },
  "overtrading-burst": { label: "Overtrading burst" },
  "revenge-flip": { label: "Revenge direction flip" },
};

const RAPID_MS = 5 * 60 * 1000;
const RULE_WINDOW_MS = 10 * 60 * 1000;
const BURST_WINDOW_MS = 30 * 60 * 1000;

/** Normal setups = the trader's two most-used tags (their "usual book"). */
function normalSetups(trades: Trade[]): Set<string> {
  const counts = new Map<string, number>();
  for (const t of trades) counts.set(t.setup, (counts.get(t.setup) ?? 0) + 1);
  return new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s));
}

export function detectTiltSignals(trades: Trade[], violations: Violation[]): TiltSignal[] {
  const out: TiltSignal[] = [];
  const byExit = [...trades].sort((a, b) => a.exitTs - b.exitTs);
  const idx = new Map(byExit.map((t, i) => [t.id, i]));
  const usual = normalSetups(byExit);

  // personal baseline: trades opened per 30-min window over history
  let baseline = 1;
  if (byExit.length >= 8) {
    const span = Math.max(BURST_WINDOW_MS, byExit[byExit.length - 1].entryTs - byExit[0].entryTs);
    baseline = byExit.length / (span / BURST_WINDOW_MS);
  }

  const isLoss = (t: Trade) => t.pnl < 0 || t.r < 0;

  for (const t of byExit) {
    if (!isLoss(t)) continue;
    const i = idx.get(t.id)!;
    const next = byExit.slice(i + 1, i + 4); // next ≤3 trades

    /* (1) size up ≥50% within the next 3 trades */
    for (const n of next) {
      if (t.riskAmount > 0 && n.riskAmount >= t.riskAmount * 1.5) {
        out.push({
          key: `size:${t.id}:${n.id}`, type: "size-up-after-loss", severity: 2, at: n.entryTs,
          detail: `Risk rose $${t.riskAmount.toFixed(0)} → $${n.riskAmount.toFixed(0)} (+${Math.round((n.riskAmount / t.riskAmount - 1) * 100)}%) within 3 trades of a loss.`,
        });
        break;
      }
    }

    /* (2) rapid re-entry: new trade opened ≤5 min after the losing close */
    const re = byExit.slice(i + 1).find((n) => n.entryTs - t.exitTs >= 0 && n.entryTs - t.exitTs <= RAPID_MS);
    if (re) {
      const mins = (re.entryTs - t.exitTs) / 60000;
      out.push({
        key: `rapid:${t.id}:${re.id}`, type: "rapid-reentry", severity: mins < 2 ? 2 : 1, at: re.entryTs,
        detail: `Re-entered ${mins.toFixed(1)} min after a losing close.`,
      });
    }

    /* (6) revenge flip: immediate opposite side, bigger, within 5 min */
    const imm = byExit[i + 1];
    if (imm && imm.side !== t.side && imm.entryTs - t.exitTs <= RAPID_MS &&
        t.riskAmount > 0 && imm.riskAmount >= t.riskAmount * 1.25) {
      out.push({
        key: `flip:${t.id}:${imm.id}`, type: "revenge-flip", severity: 3, at: imm.entryTs,
        detail: `Flipped ${t.side} → ${imm.side} with ${Math.round((imm.riskAmount / t.riskAmount) * 100)}% of the losing trade's risk, ${((imm.entryTs - t.exitTs) / 60000).toFixed(1)} min after the loss.`,
      });
    }

    /* (3) setup abandon after a red streak of ≥2 */
    let streak = 0;
    for (let k = i; k >= 0 && isLoss(byExit[k]); k--) streak++;
    if (streak >= 2 && usual.size > 0) {
      const after = byExit[i + 1];
      if (after && !usual.has(after.setup)) {
        out.push({
          key: `abandon:${t.id}:${after.id}`, type: "setup-abandon", severity: 2, at: after.entryTs,
          detail: `After ${streak} straight losses, left the usual setups (${[...usual].join(", ")}) for “${after.setup}”.`,
        });
      }
    }

    /* (4) rule break within 10 min (or next 3 trades) after the loss */
    const near = violations.filter((v) => v.ts > t.exitTs && v.ts <= t.exitTs + RULE_WINDOW_MS);
    if (near.length > 0) {
      out.push({
        key: `break:${t.id}:${near[0].id}`, type: "rule-break-after-loss", severity: 3, at: near[0].ts,
        detail: `${near[0].rule} — ${(Math.round((near[0].ts - t.exitTs) / 600) / 100).toFixed(1)} min after a losing close.`,
      });
    } else {
      const breaker = next.find((n) => n.violations.length > 0 || n.override);
      if (breaker) {
        out.push({
          key: `break:${t.id}:${breaker.id}`, type: "rule-break-after-loss", severity: 3, at: breaker.entryTs,
          detail: `Risk rule broken on the very next trade after a loss.`,
        });
      }
    }

    /* (5) overtrading burst: ≥2.5× personal rate in the next 30 min */
    const burst = byExit.filter((n) => n.entryTs > t.exitTs && n.entryTs <= t.exitTs + BURST_WINDOW_MS).length;
    if (burst >= 4 && burst >= baseline * 2.5) {
      out.push({
        key: `burst:${t.id}`, type: "overtrading-burst", severity: 2, at: t.exitTs + 60000,
        detail: `${burst} trades in 30 min after a loss vs a personal norm of ${baseline.toFixed(1)}/window.`,
      });
    }
  }
  return out;
}

/** Recency-weighted post-loss discipline, 0..1. Old mistakes fade (7-day half-life). */
export function postLossComponent(trades: Trade[], signals: TiltSignal[]): number {
  const losses = trades.filter((t) => t.pnl < 0 || t.r < 0);
  if (losses.length === 0) return 0.8; // untested yet — neutral, never perfect
  const now = Date.now();
  let score = 1;
  for (const s of signals) {
    const ageDays = Math.max(0, now - s.at) / DAY;
    const decay = Math.pow(0.5, ageDays / 7);
    const pen = (s.severity === 3 ? 0.24 : s.severity === 2 ? 0.16 : 0.08) * decay;
    score -= pen;
  }
  return clamp01(score);
}

/* =====================================================================
   2 · PROCESS SCORE — new weighting, hard-to-game first.
   ===================================================================== */
export type ProcessKey = "adherence" | "postLoss" | "sizing" | "setup" | "emotion" | "journal";

export const PROCESS_WEIGHTS: Record<ProcessKey, number> = {
  adherence: 30, postLoss: 25, sizing: 15, setup: 15, emotion: 10, journal: 5,
};

export const PROCESS_LABELS: { key: ProcessKey; label: string }[] = [
  { key: "adherence", label: "Risk rule adherence" },
  { key: "postLoss", label: "Post-loss behavior" },
  { key: "sizing", label: "Position sizing" },
  { key: "setup", label: "Setup discipline" },
  { key: "emotion", label: "Emotional awareness" },
  { key: "journal", label: "Journal quality" },
];

function adherenceComponent(trades: Trade[], violations: Violation[], windowDays = 14): number {
  const cutoff = Date.now() - windowDays * DAY;
  const recent = trades.filter((t) => t.exitTs >= cutoff);
  const recentV = violations.filter((v) => v.ts >= cutoff);
  const n = Math.max(1, recent.length);
  const perTrade = recentV.length / Math.max(6, n * 0.5);
  const overrideRatio = recent.filter((t) => t.override).length / n;
  return clamp01(1 - Math.min(1, perTrade) - overrideRatio * 0.4);
}

function sizingComponent(trades: Trade[], plan: Plan | null): number {
  const rs = trades.filter((t) => t.riskAmount > 0).map((t) => t.riskPct);
  if (rs.length < 3) return 0.7;
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / rs.length);
  const cv = mean > 0 ? sd / mean : 1;
  const over = trades.filter((t) => t.override).length / Math.max(1, trades.length);
  return clamp01(1 - clamp01(cv / 0.6) * 0.8 - over * 0.5 - (plan && mean > plan.riskPerTradePct * 1.25 ? 0.2 : 0));
}

function setupComponent(trades: Trade[], plan: Plan | null): number {
  if (trades.length === 0) return 0.7;
  const planSet = new Set(plan?.setups ?? []);
  const tagged = trades.filter((t) => planSet.has(t.setup)).length / trades.length;
  const journaledPlan = trades.filter((t) => planSet.has(t.setup) && t.journal);
  const quality = journaledPlan.length
    ? journaledPlan.filter((t) => t.journal!.grade === "A" || t.journal!.grade === "B").length / journaledPlan.length
    : 0.5;
  return clamp01(tagged * 0.7 + quality * 0.3);
}

function emotionComponent(trades: Trade[]): number {
  if (trades.length === 0) return 0.7;
  const risky: EmotionTag[] = ["fomo", "revenge", "bored"];
  const reckless = trades.filter((t) => risky.includes(t.checkin.emotion) && (t.override || t.r < 0)).length;
  const recklessRatio = reckless / trades.length;
  const awareness = trades.filter((t) => t.journal !== null).length / trades.length;
  return clamp01(awareness * 0.5 + (1 - clamp01(recklessRatio * 3)) * 0.5);
}

function journalComponent(trades: Trade[]): number {
  if (trades.length === 0) return 0.5;
  const filed = trades.filter((t) => t.journal !== null);
  const rate = filed.length / trades.length;
  const quality = filed.length ? filed.reduce((s, t) => s + (t.journal!.qualityScore ?? 50), 0) / filed.length / 100 : 0;
  return clamp01(rate * 0.5 + quality * 0.5);
}

export interface ProcessResult { score: number; parts: Record<ProcessKey, number> }

export function computeProcess(
  trades: Trade[], violations: Violation[], plan: Plan | null,
  signals: TiltSignal[] = detectTiltSignals(trades, violations),
): ProcessResult {
  const parts: Record<ProcessKey, number> = {
    adherence: adherenceComponent(trades, violations),
    postLoss: postLossComponent(trades, signals),
    sizing: sizingComponent(trades, plan),
    setup: setupComponent(trades, plan),
    emotion: emotionComponent(trades),
    journal: journalComponent(trades),
  };
  let score = 0;
  (Object.keys(PROCESS_WEIGHTS) as ProcessKey[]).forEach((k) => { score += PROCESS_WEIGHTS[k] * parts[k]; });
  return { score: Math.round(clamp01(score / 100) * 100), parts };
}

/* =====================================================================
   3 · READINESS SCORE
   Now computed by the standalone engine in server/scoring/readinessEngine.ts
   (imported verbatim by src/lib/readinessAdapter.ts). Gates: 30 trades,
   10 days, 80% journaled — then the score is pure behavior quality.
   ===================================================================== */

/* =====================================================================
   Supporting analytics (unchanged contracts used across views).
   ===================================================================== */
export function emotionExpectancy(trades: Trade[]) {
  const map = new Map<EmotionTag, number[]>();
  for (const t of trades) {
    const k = t.checkin.emotion;
    map.set(k, [...(map.get(k) ?? []), t.r]);
  }
  return [...map.entries()].map(([tag, rs]) => ({
    tag, label: emotionLabel(tag), n: rs.length,
    avgR: rs.reduce((a, b) => a + b, 0) / rs.length,
  })).sort((a, b) => b.avgR - a.avgR);
}

export function rollingR(trades: Trade[], win = 10): number[] {
  const out: number[] = [];
  for (let i = win - 1; i < trades.length; i++) {
    const slice = trades.slice(i - win + 1, i + 1);
    out.push(slice.reduce((s, t) => s + t.r, 0) / win);
  }
  return out;
}

export function setupStats(trades: Trade[]) {
  const map = new Map<string, Trade[]>();
  for (const t of trades) map.set(t.setup, [...(map.get(t.setup) ?? []), t]);
  return [...map.entries()].map(([setup, ts]) => {
    const wins = ts.filter((t) => t.pnl > 0).length;
    return {
      setup, n: ts.length, winRate: wins / ts.length,
      avgR: ts.reduce((s, t) => s + t.r, 0) / ts.length,
      expectancy: ts.reduce((s, t) => s + t.pnl, 0),
      violations: ts.reduce((s, t) => s + t.violations.length, 0),
    };
  }).sort((a, b) => b.n - a.n);
}

export function equityCurve(start: number, trades: Trade[]): number[] {
  const out = [start];
  let e = start;
  for (const t of trades) { e += t.pnl; out.push(e); }
  return out;
}

/* ------------------------- coach debrief ---------------------------- */
export function buildDebrief(t: Trade, plan: Plan | null, all: Trade[]): string {
  const bits: string[] = [];
  const r = t.r;
  if (r >= 1.8) bits.push(`A clean ${r.toFixed(2)}R winner — the target did the work because the stop defined the risk first.`);
  else if (r >= 0.8) bits.push(`Solid result at ${r.toFixed(2)}R. Execution mattered more than outcome here.`);
  else if (r >= -0.2) bits.push(`A scratch at ${r.toFixed(2)}R. Cheap lessons are the best kind.`);
  else bits.push(`${r.toFixed(2)}R is a full-sized lesson. The stop did its job — the question is whether the entry deserved the risk.`);

  if (plan && !plan.setups.includes(t.setup)) bits.push(`“${t.setup}” is not one of your declared setups — that's drift, and drift is how plans die.`);
  const risky: EmotionTag[] = ["fomo", "revenge", "bored"];
  if (risky.includes(t.checkin.emotion)) bits.push(`You checked in as ${emotionLabel(t.checkin.emotion).toLowerCase()} — the data says that state underperforms for you. Believe the data.`);
  if (t.override) bits.push(`This trade broke your sizing rule by your own acknowledgment. One override is a decision; a pattern is a leak.`);
  if (t.stressHits > 0 && t.exitReason !== "stop") bits.push(`You survived ${t.stressHits} stress injection${t.stressHits > 1 ? "s" : ""} without touching the stop. That's the exact muscle real markets test.`);

  const prevLosses = all.filter((x) => x.exitTs < t.entryTs && x.pnl < 0).slice(-1);
  if (prevLosses.length && t.riskAmount > prevLosses[0].riskAmount * 1.4)
    bits.push(`Risk was ${Math.round((t.riskAmount / prevLosses[0].riskAmount) * 100)}% of the previous (losing) trade's — watch for revenge sizing; it's the most expensive habit in this business.`);

  bits.push(t.pnl >= 0
    ? "Grade the process, not the profit: would you take this exact trade 100 times?"
    : "Losing correctly is still correct. Fix the setup selection, never the stop.");
  return bits.join(" ");
}

/* --------------------------- missions ------------------------------- */
export function generateMissions(weakArea: string, setups: string[]): Mission[] {
  const mk = (code: string, title: string, why: string, target: number, area: string): Mission =>
    ({ id: nid("m"), code, title, why, target, progress: 0, done: false, area });
  return [
    mk("journal2", "File 2 high-quality journals", "Reflection converts losses into lessons — without it they're just expenses.", 2, "Journal quality"),
    mk("size3", "3 trades sized exactly to plan risk", "Sizing consistency is the hardest habit to fake and the first to pay.", 3, "Risk discipline"),
    mk("setup3", `3 trades on your declared setups${setups.length ? ` (${setups.slice(0, 2).join(", ")})` : ""}`, "Edge lives in repetition of a known setup, not in novelty.", 3, "Setup discipline"),
    mk("pause1", "Finish a session with zero violations", "A clean session beats a lucky one — every time.", 1, "Process"),
  ];
}
