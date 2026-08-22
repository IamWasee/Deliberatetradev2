/* DeliberateTrade — domain model */

export type Side = "long" | "short";
export type OrderType = "market" | "limit" | "stop";
export type FrictionMode = "easy" | "realistic" | "brutal";
export type EmotionTag = "calm" | "focused" | "fomo" | "revenge" | "bored" | "overconfident" | "fearful";
export type Regime = "trend-up" | "trend-down" | "range" | "chop";
export type View = "dashboard" | "terminal" | "journal" | "practice" | "learn" | "readiness" | "plan" | "legal";

export interface Candle { o: number; h: number; l: number; c: number; v: number }

export interface AssetMeta { symbol: string; name: string; kind: "equity" | "crypto"; base: number; vol: number; decimals: number }
export const ASSETS: AssetMeta[] = [
  { symbol: "NVDA", name: "NVIDIA Corp", kind: "equity", base: 132, vol: 0.011, decimals: 2 },
  { symbol: "AAPL", name: "Apple Inc", kind: "equity", base: 227, vol: 0.007, decimals: 2 },
  { symbol: "TSLA", name: "Tesla Inc", kind: "equity", base: 248, vol: 0.016, decimals: 2 },
  { symbol: "MSFT", name: "Microsoft", kind: "equity", base: 415, vol: 0.006, decimals: 2 },
  { symbol: "AMD", name: "Adv. Micro Devices", kind: "equity", base: 164, vol: 0.014, decimals: 2 },
  { symbol: "META", name: "Meta Platforms", kind: "equity", base: 512, vol: 0.010, decimals: 2 },
  { symbol: "BTC", name: "Bitcoin", kind: "crypto", base: 67200, vol: 0.013, decimals: 0 },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", base: 3480, vol: 0.015, decimals: 1 },
];
export const assetMeta = (s: string): AssetMeta => ASSETS.find((a) => a.symbol === s) ?? ASSETS[0];

export interface MarketState {
  candles: Candle[]; price: number; refClose: number;
  regime: Regime; stress: { dir: 1 | -1; left: number } | null;
  drift: number;
}

export interface Plan {
  version: number; createdAt: number;
  startingCapital: number;
  riskPerTradePct: number; maxDailyLossPct: number; maxOpenRiskPct: number; maxPositions: number;
  forbidden: string[]; setups: string[]; note: string;
}

export const FORBIDDEN_ACTIONS: { id: string; label: string }[] = [
  { id: "no-stop", label: "Entering without a hard stop" },
  { id: "avg-down", label: "Averaging down losers" },
  { id: "news-chase", label: "Chasing news spikes" },
  { id: "revenge", label: "Re-entering instantly after a stop-out" },
  { id: "oversize", label: "Sizing above plan risk" },
];

export interface Checkin { emotion: EmotionTag; arousal: number; thesis: string; at: number }

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

export interface Journal {
  plan: string; whatHappened: string;
  emotionDuring: EmotionTag; emotionAfter: EmotionTag;
  followedRules: "yes" | "no"; rulesNote: string; lesson: string;
  setup: string; grade: "A" | "B" | "C" | "D";
  qualityScore: number; debrief: string; at: number;
}

export type ExitReason = "stop" | "target" | "manual" | "session";

export interface Trade {
  id: string; symbol: string; side: Side; qty: number;
  entry: number; exit: number; entryTick: number; exitTick: number;
  entryTs: number; exitTs: number;
  pnl: number; fees: number; r: number; riskAmount: number; riskPct: number;
  setup: string; exitReason: ExitReason;
  checkin: Checkin; override: boolean; violations: string[];
  friction: FrictionMode; regime: Regime; stressHits: number;
  journal: Journal | null;
}

export interface Position {
  id: string; symbol: string; side: Side; qty: number; avgEntry: number;
  stop: number | null; target: number | null;
  openedTick: number; openedTs: number;
  riskAmount: number; riskPct: number; setup: string;
  checkin: Checkin; override: boolean; fees: number;
  stressHits: number; stopMovedWorse: boolean; regime: Regime;
}

export interface Order {
  id: string; symbol: string; type: OrderType; side: Side; qty: number;
  trigger: number; stop: number | null; target: number | null;
  setup: string; checkin: Checkin; override: boolean; placedTick: number;
}

export interface Violation { id: string; rule: string; detail: string; at: number; ts: number }
export interface Review { id: string; tradeId: string; dueTick: number; interval: number; reps: number }
export interface Mission { id: string; code: string; title: string; why: string; target: number; progress: number; done: boolean; area: string }
export type LogKind = "fill" | "risk" | "event" | "system" | "coach";
export interface LogEntry { id: string; kind: LogKind; text: string; tick: number; ts: number }
export interface NewsItem { id: string; symbol: string; headline: string; impact: "up" | "down"; tick: number; ts: number }
export interface Toast { id: string; tone: "ok" | "warn" | "down" | "info"; text: string }
export interface PlanHist { version: number; at: number; reason: string }

export interface ActiveIndicator { uid: string; id: IndicatorId; params: Record<string, number> }
export type IndicatorId = "sma" | "ema" | "bb" | "vwap" | "volume" | "rsi" | "macd" | "atr";

export interface AppState {
  name: string;
  plan: Plan | null;
  planHistory: PlanHist[];
  friction: FrictionMode;
  stressMode: boolean;
  cash: number; equity: number; peakEquity: number;
  sessionStartEquity: number;
  session: number; sessionStartTick: number;
  positions: Position[]; orders: Order[]; trades: Trade[];
  reviews: Review[]; missions: Mission[]; practiceScore: number;
  violations: Violation[]; news: NewsItem[]; log: LogEntry[];
  toasts: Toast[]; journalDue: string[];
  lock: { reason: string; loss: number } | null;
  cooldownUntil: number; tiltReason: string | null;
  breaches: number; stressSeen: number; stressSurvived: number; lossStreak: number;
  tiltHandled: string[];
  tourDone: boolean; tourOpen: boolean;
  legalAcceptedAt: number; tradeDisclaimerShown: boolean;
  indicators: ActiveIndicator[];
  market: Record<string, MarketState>;
  seed: number; now: number; lastNewsTick: number;
  selected: string; hydrated: boolean;
}
