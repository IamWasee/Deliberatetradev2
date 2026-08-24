/* Domain model — the single source of truth for every shape in the app. */

export type View = "dashboard" | "terminal" | "journal" | "practice" | "learn" | "readiness" | "plan" | "legal";
export type Side = "long" | "short";
export type OrderType = "market" | "limit" | "stop";
export type FrictionMode = "easy" | "realistic" | "brutal";
export type Regime = "trend-up" | "trend-down" | "range" | "chop";

export type EmotionTag = "calm" | "focused" | "fomo" | "revenge" | "bored" | "overconfident" | "fearful";

export const EMOTIONS: { id: EmotionTag; label: string; tone: "up" | "warn" | "down" }[] = [
  { id: "calm", label: "Calm", tone: "up" },
  { id: "focused", label: "Focused", tone: "up" },
  { id: "fomo", label: "FOMO", tone: "down" },
  { id: "revenge", label: "Revenge", tone: "down" },
  { id: "bored", label: "Bored", tone: "warn" },
  { id: "overconfident", label: "Overconfident", tone: "warn" },
  { id: "fearful", label: "Fearful", tone: "warn" },
];
export const emotionLabel = (t: EmotionTag): string => EMOTIONS.find((e) => e.id === t)?.label ?? t;

export interface Checkin { emotion: EmotionTag; arousal: number; thesis: string; at: number }

export interface Candle { o: number; h: number; l: number; c: number; v: number }
export interface MarketState {
  candles: Candle[]; price: number; refClose: number;
  regime: Regime; stress: { left: number; dir: 1 | -1 } | null; drift: number;
}

export interface AssetMeta { symbol: string; name: string; kind: "equity" | "crypto"; base: number; vol: number; decimals: number }
export const ASSETS: AssetMeta[] = [
  { symbol: "NVDA", name: "NVIDIA Corp", kind: "equity", base: 118, vol: 0.028, decimals: 2 },
  { symbol: "AAPL", name: "Apple Inc", kind: "equity", base: 226, vol: 0.016, decimals: 2 },
  { symbol: "TSLA", name: "Tesla Inc", kind: "equity", base: 248, vol: 0.038, decimals: 2 },
  { symbol: "SPY", name: "S&P 500 ETF", kind: "equity", base: 585, vol: 0.011, decimals: 2 },
  { symbol: "AMD", name: "Adv. Micro Devices", kind: "equity", base: 152, vol: 0.034, decimals: 2 },
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", base: 97000, vol: 0.03, decimals: 0 },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", base: 3450, vol: 0.036, decimals: 1 },
  { symbol: "SOL", name: "Solana", kind: "crypto", base: 212, vol: 0.05, decimals: 2 },
];
export const assetMeta = (s: string): AssetMeta => ASSETS.find((a) => a.symbol === s) ?? ASSETS[0];

export interface Position {
  id: string; symbol: string; side: Side; qty: number; avgEntry: number;
  stop: number | null; target: number | null;
  openedTick: number; openedTs: number;
  riskAmount: number; riskPct: number;
  setup: string; checkin: Checkin; override: boolean;
  fees: number; stressHits: number; stopMovedWorse: boolean;
  regime: Regime;
}

export interface Order {
  id: string; symbol: string; type: OrderType; side: Side; qty: number;
  trigger: number; stop: number | null; target: number | null;
  setup: string; checkin: Checkin; override: boolean; createdAt: number;
}

export interface Journal {
  plan: string; whatHappened: string;
  emotionDuring: EmotionTag; emotionAfter: EmotionTag;
  followedRules: "yes" | "no"; rulesNote: string;
  lesson: string; setup: string;
  grade: "A" | "B" | "C" | "D"; qualityScore: number;
  debrief: string; at: number;
}

export interface Trade {
  id: string; symbol: string; side: Side; qty: number; entry: number; exit: number;
  entryTick: number; exitTick: number; entryTs: number; exitTs: number;
  pnl: number; fees: number; r: number; riskAmount: number; riskPct: number;
  setup: string; exitReason: "stop" | "target" | "manual" | "session";
  checkin: Checkin; override: boolean; violations: string[];
  friction: FrictionMode; regime: Regime; stressHits: number;
  journal: Journal | null;
}

export interface Plan {
  version: number; createdAt: number; startingCapital: number;
  riskPerTradePct: number; maxDailyLossPct: number; maxOpenRiskPct: number;
  maxPositions: number; forbidden: string[]; setups: string[]; note: string;
}
export interface PlanVersion { version: number; at: number; reason: string }

export interface Violation { id: string; rule: string; detail: string; at: number; ts: number }
export interface Mission { id: string; code: string; title: string; why: string; target: number; progress: number; done: boolean; area: string }
export interface Review { id: string; tradeId: string; dueTick: number; interval: number; reps: number }

export type ToastTone = "ok" | "warn" | "down" | "info";
export interface Toast { id: string; tone: ToastTone; text: string }
export type LogKind = "fill" | "risk" | "event" | "system" | "coach";
export interface LogEntry { id: string; kind: LogKind; text: string; tick: number; ts: number }
export interface NewsItem { id: string; symbol: string; headline: string; impact: "up" | "down"; tick: number; ts: number }

export const FORBIDDEN_ACTIONS: { id: string; label: string }[] = [
  { id: "no-stop", label: "Trading without a hard stop" },
  { id: "revenge", label: "Re-entering <2 min after a loss" },
  { id: "oversize", label: "Sizing above plan risk" },
  { id: "news", label: "Trading the news spike" },
  { id: "chop", label: "Forcing trades in chop" },
];

/* Indicators — canonical shapes live here; engine lives in indicators.ts */
export type IndicatorId = "sma" | "ema" | "bb" | "vwap" | "volume" | "rsi" | "macd" | "atr";
export interface ActiveIndicator { uid: string; id: IndicatorId; params: Record<string, number> }
