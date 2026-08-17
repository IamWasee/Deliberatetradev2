export type AssetKind = "stock" | "crypto";
export type FrictionMode = "easy" | "realistic" | "brutal";
export type Side = "long" | "short";
export type OrderType = "market" | "limit" | "stop";
export type EmotionTag =
  | "calm" | "focused" | "fomo" | "revenge" | "bored" | "overconfident" | "fearful";
export type RegimeType = "trend-up" | "trend-down" | "range" | "chop";
export type View = "dashboard" | "terminal" | "journal" | "practice" | "learn" | "readiness" | "plan";

export interface AssetMeta {
  symbol: string;
  name: string;
  kind: AssetKind;
  base: number;
  vol: number; // per-tick volatility as fraction of price
  decimals: number;
}

export const ASSETS: AssetMeta[] = [
  { symbol: "AAPL", name: "Apple Corp.", kind: "stock", base: 232.4, vol: 0.0016, decimals: 2 },
  { symbol: "NVDA", name: "NVIDIA Corp.", kind: "stock", base: 138.6, vol: 0.0027, decimals: 2 },
  { symbol: "TSLA", name: "Tesla Inc.", kind: "stock", base: 341.8, vol: 0.0031, decimals: 2 },
  { symbol: "MSFT", name: "Microsoft", kind: "stock", base: 428.1, vol: 0.0014, decimals: 2 },
  { symbol: "SPY", name: "S&P 500 ETF", kind: "stock", base: 597.3, vol: 0.0009, decimals: 2 },
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", base: 97450, vol: 0.0021, decimals: 0 },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", base: 3418, vol: 0.0027, decimals: 2 },
  { symbol: "SOL", name: "Solana", kind: "crypto", base: 196.4, vol: 0.0036, decimals: 2 },
];

export const assetMeta = (s: string): AssetMeta =>
  ASSETS.find((a) => a.symbol === s) ?? ASSETS[0];

export const EMOTIONS: { id: EmotionTag; label: string; tone: "up" | "warn" | "down" }[] = [
  { id: "calm", label: "Calm", tone: "up" },
  { id: "focused", label: "Focused", tone: "up" },
  { id: "fomo", label: "FOMO", tone: "down" },
  { id: "revenge", label: "Revenge", tone: "down" },
  { id: "bored", label: "Boredom", tone: "warn" },
  { id: "overconfident", label: "Overconfident", tone: "warn" },
  { id: "fearful", label: "Fearful", tone: "down" },
];

export const emotionLabel = (e: EmotionTag) => EMOTIONS.find((x) => x.id === e)?.label ?? e;

export const FORBIDDEN: { id: string; label: string; desc: string }[] = [
  { id: "no-stop", label: "Entries without a hard stop", desc: "Every position must carry a stop from the moment it fills." },
  { id: "moving-stops", label: "Moving my stop away from price", desc: "Widening a stop after entry is forbidden — the risk was priced at entry." },
  { id: "averaging-down", label: "Averaging down losers", desc: "Adding to a losing position is forbidden." },
  { id: "revenge-trading", label: "Re-entering immediately after a loss", desc: "No new orders within seconds of a stopped-out trade." },
  { id: "oversize", label: "Risking more than 2× planned risk", desc: "Even with acknowledgment, size beyond double plan is blocked." },
  { id: "news-chasing", label: "Chasing news spikes", desc: "No market entries while a news shock is mid-move on that symbol." },
];

export const DEFAULT_SETUPS = [
  "Breakout", "Pullback to MA", "Range fade", "Trend continuation", "News momentum", "Reversal",
];

export const FRICTIONS: Record<FrictionMode, { label: string; tag: string; desc: string; features: string[] }> = {
  easy: {
    label: "Easy", tag: "Training wheels",
    desc: "Instant fills at mid-price. For learning mechanics only.",
    features: ["Instant mid-price fills", "No slippage or fees", "Readiness score ignores Easy trades"],
  },
  realistic: {
    label: "Realistic", tag: "Recommended",
    desc: "Volatility-based slippage, real spreads, occasional partial fills.",
    features: ["Spread + volatility slippage", "Partial fills possible", "Counts toward readiness"],
  },
  brutal: {
    label: "Brutal", tag: "Prop-firm mode",
    desc: "Commissions, crypto taker fees, rejections under stress, gap risk.",
    features: ["Commissions & taker fees", "Orders can be rejected mid-stress", "Wider slippage on size"],
  },
};

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; }

export interface MarketState {
  symbol: string;
  price: number;
  refClose: number; // session reference for day change
  drift: number;    // per-tick drift fraction
  volMult: number;
  regime: RegimeType;
  candles: Candle[];
  candleTicks: number; // ticks elapsed in current candle
  shock: number;
  news: { headline: string; drift: number; at: number; impact: "up" | "down" } | null;
  stress: { until: number; per: number } | null;
  stressLogged: boolean;
  lastStressEnd: number;
}

export interface Checkin {
  emotion: EmotionTag;
  arousal: number; // 1..10
  thesis: string;
  at: number;
}

export interface Plan {
  version: number;
  createdAt: number;
  startingCapital: number;
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenRiskPct: number;
  maxPositions: number;
  forbidden: string[];
  setups: string[];
  note: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  avgEntry: number;
  stop: number | null;
  target: number | null;
  openedTick: number;
  openedTs: number;
  riskAmount: number; // planned $ risk
  riskPct: number;
  setup: string;
  checkin: Checkin;
  override: boolean;
  fees: number;
  stressHits: number;
  stopMovedWorse: boolean;
  regime: RegimeType;
}

export interface Order {
  id: string;
  symbol: string;
  type: OrderType;
  side: Side;       // position side being opened
  qty: number;
  trigger: number;  // limit or stop price
  createdAt: number;
  stop: number | null;
  target: number | null;
  riskAmount: number;
  setup: string;
  checkin: Checkin;
  override: boolean;
}

export interface Journal {
  plan: string;
  whatHappened: string;
  emotionDuring: EmotionTag;
  emotionAfter: EmotionTag;
  followedRules: "yes" | "no";
  rulesNote: string;
  lesson: string;
  setup: string;
  grade: "A" | "B" | "C" | "D";
  debrief: string;
  at: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entry: number;
  exit: number;
  entryTick: number;
  exitTick: number;
  entryTs: number;
  exitTs: number;
  pnl: number;
  fees: number;
  r: number;
  riskAmount: number;
  setup: string;
  exitReason: "stop" | "target" | "manual" | "session";
  checkin: Checkin;
  override: boolean;
  violations: string[];
  friction: FrictionMode;
  regime: RegimeType;
  stressHits: number;
  journal: Journal | null;
}

export interface ReviewCard {
  id: string;
  tradeId: string;
  dueTick: number;
  interval: number;
  reps: number;
}

export interface Mission {
  id: string;
  code: string;
  title: string;
  why: string;
  target: number;
  progress: number;
  done: boolean;
  area: string;
}

export interface ViolationEvent { id: string; rule: string; detail: string; at: number; ts: number; }
export interface NewsItem { id: string; symbol: string; headline: string; impact: "up" | "down"; tick: number; ts: number; }
export interface LogItem { id: string; kind: "fill" | "risk" | "event" | "system" | "coach"; text: string; tick: number; ts: number; }
export interface Toast { id: string; kind: "ok" | "warn" | "bad" | "info"; text: string; }

export interface PlanAmendment { version: number; at: number; reason: string; }

export interface AppState {
  hydrated: boolean;
  name: string;
  plan: Plan | null;
  planHistory: PlanAmendment[];
  friction: FrictionMode;
  stressMode: boolean;

  cash: number;
  equity: number;
  peakEquity: number;
  sessionStartEquity: number;
  session: number;
  sessionStartTick: number;

  positions: Position[];
  orders: Order[];
  trades: Trade[];
  reviews: ReviewCard[];
  missions: Mission[];
  practiceScore: number;

  violations: ViolationEvent[];
  news: NewsItem[];
  log: LogItem[];
  toasts: Toast[];
  journalDue: string[]; // trade ids awaiting mandatory journal

  lock: { reason: string; loss: number } | null;
  cooldownUntil: number;
  tiltReason: string | null;

  breaches: number;
  stressSeen: number;
  stressSurvived: number;
  lossStreak: number;

  market: Record<string, MarketState>;
  seed: number;
  now: number;
  lastNewsTick: number;
  selected: string;
}
