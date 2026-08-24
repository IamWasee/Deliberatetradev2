/* =====================================================================
   DeliberateTrade engine — deterministic market simulator, domain types,
   owner detection and score math. Pure logic, no UI.
   ===================================================================== */

/* ------------------------------ types ------------------------------- */
export interface Candle { o: number; h: number; l: number; c: number; v: number }
export type Regime = "trend-up" | "trend-down" | "range" | "chop";

export interface AssetMeta {
  symbol: string; name: string; base: number; vol: number;
  kind: "equity" | "crypto"; decimals: number;
}

export interface MarketState {
  candles: Candle[]; price: number; refClose: number;
  regime: Regime; drift: number; stress: { left: number; dir: 1 | -1 } | null;
}

export type Side = "long" | "short";
export type EmotionTag = "calm" | "focused" | "fomo" | "revenge" | "bored" | "overconfident" | "fearful";

export interface Checkin { emotion: EmotionTag; arousal: number; thesis: string; at: number }

export interface Position {
  id: string; symbol: string; side: Side; qty: number; avgEntry: number;
  stop: number | null; target: number | null;
  openedTick: number; openedTs: number;
  riskAmount: number; riskPct: number; setup: string; checkin: Checkin;
  override: boolean;
}

export interface Journal {
  plan: string; whatHappened: string;
  emotionDuring: EmotionTag; emotionAfter: EmotionTag;
  followedRules: "yes" | "no"; rulesNote: string; lesson: string;
  setup: string; grade: "A" | "B" | "C" | "D"; qualityScore: number;
  debrief: string; at: number;
}

export interface Trade {
  id: string; symbol: string; side: Side; qty: number; entry: number; exit: number;
  entryTs: number; exitTs: number; pnl: number; r: number; riskAmount: number; riskPct: number;
  setup: string; exitReason: "stop" | "target" | "manual";
  checkin: Checkin; override: boolean; violations: string[];
  journal: Journal | null;
}

export interface Plan {
  version: number; startingCapital: number;
  riskPerTradePct: number; maxDailyLossPct: number;
  setups: string[];
}

export interface Violation { id: string; rule: string; detail: string; ts: number }
export interface Toast { id: string; tone: "ok" | "warn" | "down" | "info"; text: string }

/* ------------------------------ assets ------------------------------ */
export const ASSETS: AssetMeta[] = [
  { symbol: "NVDA", name: "NVIDIA Corp", base: 132, vol: 0.016, kind: "equity", decimals: 2 },
  { symbol: "AAPL", name: "Apple Inc", base: 228, vol: 0.010, kind: "equity", decimals: 2 },
  { symbol: "TSLA", name: "Tesla Inc", base: 262, vol: 0.022, kind: "equity", decimals: 2 },
  { symbol: "MSFT", name: "Microsoft", base: 425, vol: 0.009, kind: "equity", decimals: 2 },
  { symbol: "AMD", name: "Adv. Micro Devices", base: 142, vol: 0.020, kind: "equity", decimals: 2 },
  { symbol: "META", name: "Meta Platforms", base: 585, vol: 0.014, kind: "equity", decimals: 2 },
  { symbol: "BTC", name: "Bitcoin", base: 97200, vol: 0.018, kind: "crypto", decimals: 0 },
  { symbol: "ETH", name: "Ethereum", base: 3350, vol: 0.021, kind: "crypto", decimals: 1 },
];

export const assetMeta = (s: string): AssetMeta =>
  ASSETS.find((a) => a.symbol === s) ?? ASSETS[0];

export const EMOTIONS: { id: EmotionTag; label: string; tone: "up" | "warn" | "down" }[] = [
  { id: "calm", label: "Calm", tone: "up" },
  { id: "focused", label: "Focused", tone: "up" },
  { id: "fomo", label: "FOMO", tone: "down" },
  { id: "revenge", label: "Revenge", tone: "down" },
  { id: "bored", label: "Bored", tone: "warn" },
  { id: "overconfident", label: "Overconf.", tone: "warn" },
  { id: "fearful", label: "Fearful", tone: "down" },
];

export const emotionLabel = (t: EmotionTag): string =>
  EMOTIONS.find((e) => e.id === t)?.label ?? t;

/* --------------------------- market sim ------------------------------ */
export const HISTORY = 220;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (rnd: () => number): number => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export function createMarket(seed: number): Record<string, MarketState> {
  const rnd = mulberry32(seed);
  const out: Record<string, MarketState> = {};
  for (const a of ASSETS) {
    const candles: Candle[] = [];
    let p = a.base * (1 + (rnd() - 0.5) * 0.04);
    let drift = (rnd() - 0.5) * a.vol * 0.12;
    for (let i = 0; i < HISTORY; i++) {
      if (i % 40 === 0) drift = (rnd() - 0.5) * a.vol * 0.16;
      const o = p;
      const shock = gauss(rnd) * a.vol * p * 0.35;
      const c = Math.max(a.base * 0.2, o + drift * p + shock);
      const h = Math.max(o, c) + Math.abs(gauss(rnd)) * a.vol * p * 0.12;
      const l = Math.max(a.base * 0.15, Math.min(o, c) - Math.abs(gauss(rnd)) * a.vol * p * 0.12);
      const v = Math.round(1000 + rnd() * 4000 + (Math.abs(c - o) / (a.vol * p)) * 800);
      candles.push({ o, h, l, c, v });
      p = c;
    }
    const price = candles[candles.length - 1].c;
    out[a.symbol] = { candles, price, refClose: price, regime: regimeOf(candles), drift, stress: null };
  }
  return out;
}

export function regimeOf(candles: Candle[]): Regime {
  const last = candles.slice(-24);
  if (last.length < 24) return "range";
  const first = last.slice(0, 12).reduce((s, c) => s + c.c, 0) / 12;
  const second = last.slice(12).reduce((s, c) => s + c.c, 0) / 12;
  const move = (second - first) / first;
  const a = atrArr(last);
  if (Math.abs(move) > a * 1.6) return move > 0 ? "trend-up" : "trend-down";
  const body = last.reduce((s, c) => s + Math.abs(c.c - c.o), 0);
  const wick = last.reduce((s, c) => s + (c.h - c.l) - Math.abs(c.c - c.o), 0);
  return wick > body * 1.9 ? "chop" : "range";
}

function atrArr(cs: Candle[]): number {
  if (cs.length < 2) return cs.length ? cs[0].h - cs[0].l : 1;
  let s = 0;
  for (let i = 1; i < cs.length; i++) {
    s += Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c));
  }
  return s / (cs.length - 1);
}

export function atr(m: MarketState, period = 14): number {
  return atrArr(m.candles.slice(-period - 1));
}

/* advance one asset one tick; returns updated state (mutating copy) */
export function stepMarket(m: MarketState, a: AssetMeta, rnd: () => number): void {
  let stress = m.stress;
  let dir = m.drift;
  let volMul = 1;
  if (stress) {
    dir = stress.dir * a.vol * 0.55;
    volMul = 2.4;
    stress = stress.left <= 1 ? null : { ...stress, left: stress.left - 1 };
  } else if (rnd() < 0.004) {
    m.drift = (rnd() - 0.5) * a.vol * 0.16;
    dir = m.drift;
  }
  const shock = gauss(rnd) * a.vol * m.price * 0.32 * volMul;
  const price = Math.max(a.base * 0.15, m.price + dir * m.price + shock);

  const candles = m.candles.slice();
  const last = { ...candles[candles.length - 1] };
  last.c = price;
  last.h = Math.max(last.h, price);
  last.l = Math.min(last.l, price);
  last.v += Math.round(rnd() * 90);
  candles[candles.length - 1] = last;
  let full = candles;
  let closed = false;
  if (rnd() < 0.16) {
    full = [...candles.slice(-(HISTORY - 1)), { o: price, h: price, l: price, c: price, v: Math.round(rnd() * 200) }];
    closed = true;
  }
  m.candles = full;
  m.price = price;
  m.stress = stress;
  if (closed) m.regime = regimeOf(full);
}

/* ----------------------------- owner --------------------------------- */
/* Owner detection: the signed-in email is compared case-insensitively
   against the product owner's address. Detection is redundant across the
   stored account, the live session and an active-email marker so no single
   storage quirk can hide it. See lib/store for where it gates behavior. */
export const OWNER_EMAIL = "abdullahwasee86@gmail.com";

const norm = (v: unknown): string =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

export function isAdminEmail(email: string | null | undefined): boolean {
  return norm(email) === OWNER_EMAIL;
}

/* ----------------------------- scoring ------------------------------- */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Process Score 0–100: adherence 30, post-loss 25, sizing 15, setup 15,
    emotion 10, journal 5. Computed from the trade log — never stored. */
export function processScore(trades: Trade[], violations: Violation[], plan: Plan | null): number {
  const n = Math.max(1, trades.length);
  const violationRate = Math.min(1, violations.length / Math.max(6, n * 0.5));
  const overrideRate = trades.filter((t) => t.override).length / n;
  const adherence = clamp01(1 - violationRate - overrideRate * 0.4);

  const losses = trades.filter((t) => t.pnl < 0);
  let postLoss = 0.8;
  if (losses.length) {
    let bad = 0;
    for (let i = 0; i < trades.length; i++) {
      if (trades[i].pnl >= 0) continue;
      for (let k = i + 1; k < Math.min(i + 4, trades.length); k++) {
        const next = trades[k];
        if (trades[i].riskAmount > 0 && next.riskAmount >= trades[i].riskAmount * 1.5) bad++;
        if (next.entryTs - trades[i].exitTs < 5 * 60 * 1000) bad++;
        if (next.violations.length > 0 || next.override) bad++;
      }
    }
    postLoss = clamp01(1 - Math.min(1, bad / Math.max(1, losses.length)) * 0.9);
  }

  const rs = trades.filter((t) => t.riskAmount > 0).map((t) => t.riskPct);
  let sizing = 0.7;
  if (rs.length >= 3) {
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / rs.length);
    const cv = mean > 0 ? sd / mean : 1;
    sizing = clamp01(1 - clamp01(cv / 0.6) * 0.8);
  }

  const planSet = new Set(plan?.setups ?? []);
  const setup = trades.length
    ? clamp01(trades.filter((t) => planSet.has(t.setup)).length / n * 0.7 +
        (trades.filter((t) => t.journal && (t.journal.grade === "A" || t.journal.grade === "B")).length / n) * 0.3)
    : 0.7;

  const risky: EmotionTag[] = ["fomo", "revenge", "bored"];
  const reckless = trades.filter((t) => risky.includes(t.checkin.emotion) && (t.override || t.r < 0)).length / n;
  const journaled = trades.filter((t) => t.journal !== null).length / n;
  const emotion = clamp01(journaled * 0.5 + (1 - clamp01(reckless * 3)) * 0.5);

  const filed = trades.filter((t) => t.journal !== null);
  const quality = filed.length ? filed.reduce((s, t) => s + (t.journal!.qualityScore ?? 50), 0) / filed.length / 100 : 0;
  const journal = clamp01(journaled * 0.5 + quality * 0.5);

  return Math.round(
    (adherence * 30 + postLoss * 25 + sizing * 15 + setup * 15 + emotion * 10 + journal * 5),
  );
}

export function equityCurve(start: number, trades: Trade[]): number[] {
  const out = [start];
  let e = start;
  for (const t of trades) { e += t.pnl; out.push(e); }
  return out;
}

/* ------------------------- coach debrief ----------------------------- */
export function buildDebrief(t: Trade, plan: Plan | null): string {
  const bits: string[] = [];
  if (t.r >= 1.8) bits.push(`A clean ${t.r.toFixed(2)}R winner — the target did the work because the stop defined the risk first.`);
  else if (t.r >= 0.8) bits.push(`Solid result at ${t.r.toFixed(2)}R. Execution mattered more than outcome here.`);
  else if (t.r >= -0.2) bits.push(`A scratch at ${t.r.toFixed(2)}R. Cheap lessons are the best kind.`);
  else bits.push(`${t.r.toFixed(2)}R is a full-sized lesson. The stop did its job — the question is whether the entry deserved the risk.`);
  if (plan && !plan.setups.includes(t.setup)) bits.push(`“${t.setup}” is not one of your declared setups — that's drift, and drift is how plans die.`);
  const risky: EmotionTag[] = ["fomo", "revenge", "bored"];
  if (risky.includes(t.checkin.emotion)) bits.push(`You checked in as ${emotionLabel(t.checkin.emotion).toLowerCase()} — the data says that state underperforms for you.`);
  if (t.override) bits.push(`This trade broke your sizing rule by your own acknowledgment. One override is a decision; a pattern is a leak.`);
  bits.push(t.pnl >= 0
    ? "Grade the process, not the profit: would you take this exact trade 100 times?"
    : "Losing correctly is still correct. Fix the setup selection, never the stop.");
  return bits.join(" ");
}

/* --------------------------- journal quality -------------------------- */
const PLACEHOLDERS = ["n/a", "na", "none", "idk", "lol", "test", "todo", "asdf", "qwerty"];
function fieldIsGarbage(t: string): boolean {
  const s = t.trim().toLowerCase();
  if (!s || PLACEHOLDERS.includes(s)) return true;
  if (/(.)\1{5,}/.test(s)) return true;
  const words = s.split(/[^a-z']+/).filter((w) => w.length >= 3);
  if (!words.length) return s.replace(/[^a-z0-9]/gi, "").length > 8;
  const junk = words.filter((w) => /^[^aeiou\s]{6,}$/.test(w) || (w.length >= 6 && !(w.match(/[aeiou]/g) ?? []).length)).length;
  return junk / words.length > 0.5;
}

export interface GateResult { ok: boolean; reason: string }
export function journalGate(f: { plan: string; whatHappened: string; rulesNote: string; lesson: string; followedRules: "yes" | "no" }): GateResult {
  const fields: [string, string][] = [
    ["the plan", f.plan], ["what happened", f.whatHappened], ["the lesson", f.lesson],
    ...(f.followedRules === "no" ? [["the rules note", f.rulesNote] as [string, string]] : []),
  ];
  for (const [label, text] of fields) {
    if (!text || !text.trim()) return { ok: false, reason: `Required field empty: ${label}.` };
    if (fieldIsGarbage(text))
      return { ok: false, reason: `“${label}” reads like random characters. Write a real reflection (at least 2–3 proper sentences) before you can continue.` };
  }
  const chars = (f.plan + f.whatHappened + f.lesson).replace(/\s/g, "").length;
  const words = (f.plan + " " + f.whatHappened + " " + f.lesson).toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3).length;
  if (chars < 40 || words < 10)
    return { ok: false, reason: "This journal is too low effort. Please write a real reflection (at least 2–3 proper sentences) before you can continue." };
  return { ok: true, reason: "" };
}

export function journalQualityScore(f: { plan: string; whatHappened: string; rulesNote: string; lesson: string }): number {
  const all = [f.plan, f.whatHappened, f.rulesNote, f.lesson].join(" ");
  const words = all.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3);
  if (words.length < 8) return 10;
  const junk = words.filter((w) => /^[^aeiou\s]{6,}$/.test(w)).length;
  const realRatio = 1 - junk / words.length;
  const effort = Math.min(1, words.length / 90) * 30;
  const sentences = [f.plan, f.whatHappened, f.rulesNote, f.lesson].filter((t) => /\b\w+\b\s+\b\w+\b\s+\b\w+\b/.test(t)).length;
  const structure = (sentences / 4) * 20;
  const mentions = [
    /\b(stop|entry|target|size|risk|atr|setup|breakout|pullback|support|resistance|long|short|position)\b/,
    /\b(felt|emotion|fomo|fear|calm|angry|anxious|greed|impatient|disciplined|tilted|revenge)\b/,
    /\b(rule|plan|broke|followed|violated|adhered|checklist|process)\b/,
    /\b(learn|lesson|next time|will|i should|improve|avoid|mistake)\b/,
  ].filter((re) => re.test(all)).length;
  const specificity = (mentions / 4) * 25;
  const reflection = [/\b(i|i'm|my)\b/, /\b(because|so|therefore|led to|caused|resulted)\b/, /\b(if|when|next time)\b/].filter((re) => re.test(all)).length;
  const depth = (reflection / 3) * 15;
  const unique = new Set(words).size;
  const diversity = Math.min(1, unique / Math.max(1, words.length * 0.55)) * 10;
  return Math.max(0, Math.min(100, Math.round((effort + structure + specificity + depth + diversity) * realRatio)));
}
