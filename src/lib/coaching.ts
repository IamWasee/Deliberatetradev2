import {
  type AppState, type EmotionTag, type Mission, type Plan, type Trade,
  emotionLabel,
} from "./types";

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/* ---------------- Process Score ---------------- */
export interface ProcessParts {
  adherence: number; journal: number; risk: number; emotion: number; setup: number;
}
export function computeProcess(trades: Trade[], violationCount: number, plan: Plan | null): { score: number; parts: ProcessParts } {
  if (trades.length === 0 || !plan)
    return { score: 0, parts: { adherence: 0, journal: 0, risk: 0, emotion: 0, setup: 0 } };

  const vPerTrade = Math.min(1.5, violationCount / Math.max(1, trades.length));
  const adherence = clamp(1 - vPerTrade * 1.4);

  const journaled = trades.filter((t) => t.journal);
  const completion = journaled.length / trades.length;
  // Real reflection quality (0..1) computed by the quality engine — self-assigned
  // grades alone can no longer inflate this. Garbage journals keep it near zero.
  const avgQuality = journaled.length
    ? journaled.reduce((s, t) => s + t.journal!.qualityScore, 0) / journaled.length / 100
    : 0;
  const journal = clamp(completion * 0.45 + avgQuality * 0.55);

  const planned = (plan.riskPerTradePct / 100) * plan.startingCapital;
  const devs = trades.map((t) => Math.abs(t.riskAmount - planned) / Math.max(1, planned));
  const risk = clamp(1 - devs.reduce((a, b) => a + b, 0) / devs.length * 1.3);

  const calmLike = (e: EmotionTag) => e === "calm" || e === "focused";
  const calmTrades = trades.filter((t) => calmLike(t.checkin.emotion));
  const calmRatio = calmTrades.length / trades.length;
  const calmR = calmTrades.length ? calmTrades.reduce((s, t) => s + t.r, 0) / calmTrades.length : 0;
  const hotTrades = trades.filter((t) => !calmLike(t.checkin.emotion));
  const hotR = hotTrades.length ? hotTrades.reduce((s, t) => s + t.r, 0) / hotTrades.length : 0;
  const separation = clamp((calmR - hotR + 0.5) / 1.2);
  const emotion = clamp(calmRatio * 0.55 + separation * 0.45);

  const setupTrades = trades.filter((t) => t.setup && t.setup !== "—");
  const setup = clamp((setupTrades.length / trades.length) * 0.6 + (setupTrades.length >= 5 ? 0.4 : setupTrades.length * 0.08));

  const score = Math.round(100 * (adherence * 0.28 + journal * 0.22 + risk * 0.2 + emotion * 0.16 + setup * 0.14));
  return { score, parts: { adherence, journal, risk, emotion, setup } };
}

export const PROCESS_LABELS: { key: keyof ProcessParts; label: string }[] = [
  { key: "adherence", label: "Rule adherence" },
  { key: "journal", label: "Journal quality" },
  { key: "risk", label: "Risk consistency" },
  { key: "emotion", label: "Emotional awareness" },
  { key: "setup", label: "Setup discipline" },
];

/* ---------------- Readiness ---------------- */
export interface ReadinessCheck { id: string; label: string; met: boolean; actual: string; required: string; weight: number; }
export function computeReadiness(s: AppState): { score: number; checks: ReadinessCheck[] } {
  const trades = s.trades;
  const realistic = trades.filter((t) => t.friction !== "easy");
  const last20 = trades.slice(-20);
  const avgR20 = last20.length ? last20.reduce((a, t) => a + t.r, 0) / last20.length : 0;
  const proc = computeProcess(trades, s.violations.length, s.plan).score;
  const journalRate = trades.length ? trades.filter((t) => t.journal).length / trades.length : 0;
  const regimes = new Set(trades.map((t) => t.regime));

  const checks: ReadinessCheck[] = [
    {
      id: "volume", label: "Trade volume under real friction",
      met: realistic.length >= 20, actual: `${realistic.length} trades`, required: "≥ 20 (Realistic or Brutal)", weight: 0.22,
    },
    {
      id: "edge", label: "Positive expectancy, rolling 20",
      met: last20.length >= 10 && avgR20 > 0, actual: `${avgR20 >= 0 ? "+" : ""}${avgR20.toFixed(2)}R`, required: "> 0R over ≥ 10 trades", weight: 0.24,
    },
    {
      id: "process", label: "Process Score",
      met: proc >= 80, actual: `${proc}`, required: "≥ 80", weight: 0.2,
    },
    {
      id: "journal", label: "Journal completion",
      met: journalRate >= 0.9, actual: `${Math.round(journalRate * 100)}%`, required: "≥ 90%", weight: 0.12,
    },
    {
      id: "stress", label: "Survived injected stress",
      met: s.stressSurvived >= 1, actual: `${s.stressSurvived} survived / ${s.stressSeen} injected`, required: "≥ 1 survived without panic", weight: 0.12,
    },
    {
      id: "breaker", label: "Daily loss limit integrity",
      met: s.breaches === 0, actual: s.breaches === 0 ? "Never breached" : `${s.breaches} breach(es)`, required: "0 breaches", weight: 0.1,
    },
  ];
  const regimeBonus = regimes.size >= 3 ? 0.06 : regimes.size * 0.02;
  const base = checks.reduce((a, c) => a + (c.met ? c.weight : 0), 0);
  const score = Math.round(clamp(base + (base > 0.5 ? regimeBonus : 0)) * 100);
  return { score, checks };
}

/* ---------------- Tilt detection ---------------- */
export function detectTilt(trades: Trade[], recentViolations: number): string | null {
  const t = trades.slice(-4);
  for (let i = 0; i < t.length - 1; i++) {
    if (t[i].r < 0 && t[i + 1].riskAmount > t[i].riskAmount * 1.3)
      return "Position size jumped after a loss — classic revenge sizing.";
  }
  for (let i = 0; i < t.length - 1; i++) {
    if (t[i].r < 0 && t[i + 1].entryTick - t[i].exitTick < 14)
      return "Immediate re-entry after a loss — the market owes you nothing.";
  }
  if (recentViolations >= 2) return "Two rule violations inside your last few trades.";
  return null;
}

/* ---------------- Debrief (rule-based coach) ---------------- */
export function buildDebrief(t: Trade, plan: Plan | null, all: Trade[]): string {
  const lines: string[] = [];
  const riskPct = plan ? ((t.riskAmount / plan.startingCapital) * 100).toFixed(1) : "?";
  const calmLike = t.checkin.emotion === "calm" || t.checkin.emotion === "focused";

  lines.push(
    `You planned to risk $${t.riskAmount.toFixed(0)} (${riskPct}% of capital) on “${t.setup}” in ${t.symbol}, entered ${t.side} at ${t.entry.toFixed(2)} and exited at ${t.exit.toFixed(2)}.`
  );

  if (t.r >= 1) lines.push(`Result: +${t.r.toFixed(2)}R — the setup paid. Credit the process, not the luck.`);
  else if (t.r >= 0.2) lines.push(`Result: +${t.r.toFixed(2)}R — a small winner, taken where your plan said to.`);
  else if (t.r > -0.25) lines.push(`Result: ${t.r.toFixed(2)}R — a scratch. Boring is the point.`);
  else if (t.r > -1.05) lines.push(`Result: ${t.r.toFixed(2)}R — your stop did its job. This loss was priced in before entry; it is the cost of doing business.`);
  else lines.push(`Result: ${t.r.toFixed(2)}R — the loss exceeded your planned 1R. Slippage or a stop move is the usual suspect; find which one.`);

  if (!calmLike) {
    const tag = t.checkin.emotion;
    const tagged = all.filter((x) => x.checkin.emotion === tag);
    const avg = tagged.length ? tagged.reduce((s, x) => s + x.r, 0) / tagged.length : t.r;
    lines.push(
      `You checked in as “${emotionLabel(tag)}”. Your trades from that state average ${avg >= 0 ? "+" : ""}${avg.toFixed(2)}R across ${tagged.length} trade${tagged.length === 1 ? "" : "s"} — the feeling is data, not a directive.`
    );
  }

  if (t.violations.length)
    lines.push(`Rule broken: ${t.violations.join(", ")}. Outcome aside, broken process wins sometimes and loses others — only intact process is repeatable.`);
  else if (t.journal?.followedRules === "yes" && t.r < 0)
    lines.push(`Rules followed, money lost. A correct loss. Deposit the lesson, not the pain.`);
  else if (t.journal?.followedRules === "yes")
    lines.push(`Rules followed, money made. This is the habit to compound.`);

  if (t.exitReason === "manual" && t.r < -0.3)
    lines.push(`You cut it by hand before the stop — early exits bleed expectancy unless the thesis is genuinely dead.`);
  if (t.stressHits > 0 && Math.abs(t.r) <= 1.1)
    lines.push(`Stress was injected mid-trade and you stayed inside the plan. That rep is worth more than the R.`);

  return lines.join(" ");
}

/* ---------------- Missions ---------------- */
export function generateMissions(weakest: keyof ProcessParts, setups: string[]): Mission[] {
  const all: Record<string, Omit<Mission, "id" | "progress" | "done">> = {
    risk3: { code: "risk3", title: "Three disciplined risks", why: "Size three trades within 125% of your planned risk — no heroes.", target: 3, area: "Risk consistency" },
    calm5: { code: "calm5", title: "Five cold entries", why: "Take five trades only when your check-in reads Calm or Focused.", target: 5, area: "Emotional awareness" },
    journal2: { code: "journal2", title: "Autopsy two losses", why: "Journal two losing trades with a concrete lesson (40+ characters).", target: 2, area: "Journal quality" },
    bracket3: { code: "bracket3", title: "Three clean brackets", why: "Complete three trades with stop + target set at entry and untouched.", target: 3, area: "Rule adherence" },
    survive1: { code: "survive1", title: "Hold through the storm", why: "Survive one injected stress event without widening your stop.", target: 1, area: "Emotional awareness" },
    setup3: { code: "setup3", title: `Repeat “${setups[0] ?? "Breakout"}”`, why: "Take three trades on your most-traded setup to build a real sample.", target: 3, area: "Setup discipline" },
  };
  const byArea: Record<keyof ProcessParts, string[]> = {
    risk: ["risk3", "bracket3"],
    emotion: ["calm5", "survive1"],
    journal: ["journal2", "calm5"],
    adherence: ["bracket3", "risk3"],
    setup: ["setup3", "journal2"],
  };
  const picked = [...byArea[weakest]];
  for (const k of Object.keys(all)) if (picked.length < 3 && !picked.includes(k)) picked.push(k);
  return picked.slice(0, 3).map((code, i) => ({ ...all[code], id: `${code}-${Date.now()}-${i}`, progress: 0, done: false }));
}

/* ---------------- Aggregates ---------------- */
export function emotionExpectancy(trades: Trade[]): { tag: EmotionTag; label: string; avgR: number; n: number }[] {
  const map = new Map<EmotionTag, Trade[]>();
  trades.forEach((t) => {
    map.set(t.checkin.emotion, [...(map.get(t.checkin.emotion) ?? []), t]);
  });
  return [...map.entries()]
    .map(([tag, ts]) => ({
      tag, label: emotionLabel(tag),
      avgR: ts.reduce((s, t) => s + t.r, 0) / ts.length,
      n: ts.length,
    }))
    .sort((a, b) => b.avgR - a.avgR);
}

export function setupStats(trades: Trade[]) {
  const map = new Map<string, Trade[]>();
  trades.forEach((t) => {
    const k = t.setup || "—";
    map.set(k, [...(map.get(k) ?? []), t]);
  });
  return [...map.entries()].map(([setup, ts]) => {
    const wins = ts.filter((t) => t.r > 0).length;
    return {
      setup, n: ts.length,
      winRate: wins / ts.length,
      avgR: ts.reduce((s, t) => s + t.r, 0) / ts.length,
      expectancy: ts.reduce((s, t) => s + t.pnl, 0),
      violations: ts.reduce((s, t) => s + t.violations.length, 0),
    };
  }).sort((a, b) => b.n - a.n);
}

export function rollingR(trades: Trade[], window = 10): number[] {
  const out: number[] = [];
  for (let i = 0; i < trades.length; i++) {
    const slice = trades.slice(Math.max(0, i - window + 1), i + 1);
    out.push(slice.reduce((s, t) => s + t.r, 0) / slice.length);
  }
  return out;
}

export function equityCurve(startEquity: number, trades: Trade[]): { x: number; y: number }[] {
  let eq = startEquity;
  const pts = [{ x: 0, y: eq }];
  trades.forEach((t, i) => {
    eq += t.pnl;
    pts.push({ x: i + 1, y: eq });
  });
  return pts;
}

/* ---------------- Report export ---------------- */
export function buildReport(s: AppState): string {
  const proc = computeProcess(s.trades, s.violations.length, s.plan);
  const ready = computeReadiness(s);
  const stats = setupStats(s.trades);
  const emo = emotionExpectancy(s.trades);
  const L: string[] = [];
  L.push(`# DeliberateTrade — Performance & Process Report`);
  L.push(`Trader: ${s.name || "Anonymous"} · Sessions: ${s.session} · Generated: ${new Date().toLocaleString()}`);
  L.push(``);
  L.push(`## Headline numbers`);
  L.push(`- Equity: $${s.equity.toFixed(2)} (peak $${s.peakEquity.toFixed(2)})`);
  L.push(`- Closed trades: ${s.trades.length} · Win rate: ${s.trades.length ? Math.round((s.trades.filter((t) => t.r > 0).length / s.trades.length) * 100) : 0}%`);
  L.push(`- Total realized P&L: $${s.trades.reduce((a, t) => a + t.pnl, 0).toFixed(2)}`);
  L.push(`- Average R: ${s.trades.length ? (s.trades.reduce((a, t) => a + t.r, 0) / s.trades.length).toFixed(2) : "—"}R`);
  L.push(``);
  L.push(`## Process (the part that transfers to real money)`);
  L.push(`- Process Score: ${proc.score}/100`);
  proc && Object.entries(proc.parts).forEach(([k, v]) => L.push(`  - ${k}: ${Math.round(v * 100)}/100`));
  L.push(`- Rule violations: ${s.violations.length} · Daily-limit breaches: ${s.breaches}`);
  L.push(`- Stress events survived: ${s.stressSurvived}/${s.stressSeen}`);
  L.push(`- Real-money readiness: ${ready.score}/100`);
  L.push(``);
  L.push(`## Setups`);
  stats.forEach((st) => L.push(`- ${st.setup}: ${st.n} trades, ${(st.winRate * 100).toFixed(0)}% win, ${st.avgR >= 0 ? "+" : ""}${st.avgR.toFixed(2)}R avg`));
  L.push(``);
  L.push(`## Emotional profile`);
  emo.forEach((e) => L.push(`- ${e.label}: ${e.n} trades, ${e.avgR >= 0 ? "+" : ""}${e.avgR.toFixed(2)}R avg`));
  L.push(``);
  L.push(`> Educational simulation only. No real funds were used. Past simulated performance does not guarantee future results.`);
  return L.join("\n");
}
