/* =====================================================================
   Technical indicator engine.
   Every value is computed live from the same OHLCV Candle[] the chart
   renders — nothing is hardcoded. Warm-up periods are null so the chart
   simply skips those points.
   ===================================================================== */
import type { ActiveIndicator, Candle, IndicatorId } from "./types";
export type { ActiveIndicator };

export interface OverlaySeries {
  uid: string;
  label: string;
  color: string;
  width: number;
  values: (number | null)[];          // aligned 1:1 with candles
  fill?: { upper: (number | null)[]; lower: (number | null)[]; color: string };
}

export interface PaneSeries {
  uid: string;
  label: string;
  kind: "rsi" | "macd" | "atr";
  a: (number | null)[];
  b?: (number | null)[];
  c?: (number | null)[];
}

export interface IndicatorResult {
  overlays: OverlaySeries[];
  panes: PaneSeries[];
  showVolume: boolean;
}

/* ------------------------------- math ------------------------------- */
const closesOf = (c: Candle[]) => c.map((x) => x.c);

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(0, d)) / period;
    avgL = (avgL * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export interface MacdResult { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] }
export function macd(closes: number[], fast: number, slow: number, signalP: number): MacdResult {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    ef[i] !== null && es[i] !== null ? (ef[i] as number) - (es[i] as number) : null);
  // signal = EMA of the macd line (over its defined region)
  const defined: number[] = [];
  const startIdx = line.findIndex((v) => v !== null);
  for (let i = startIdx; i < line.length; i++) defined.push(line[i] as number);
  const sigDef = ema(defined, signalP);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < sigDef.length; i++) if (sigDef[i] !== null) signal[startIdx + i] = sigDef[i];
  const hist: (number | null)[] = closes.map((_, i) =>
    line[i] !== null && signal[i] !== null ? (line[i] as number) - (signal[i] as number) : null);
  return { macd: line, signal, hist };
}

export interface BBResult { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] }
export function bollinger(closes: number[], period: number, mult: number): BBResult {
  const middle = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1);
    const m = middle[i] as number;
    const variance = win.reduce((s, v) => s + (v - m) * (v - m), 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { upper, middle, lower };
}

export function vwap(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tp = (c.h + c.l + c.c) / 3;
    cumPV += tp * c.v; cumV += c.v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

export function atrSeries(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const tr: number[] = [candles[0].h - candles[0].l];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/* ----------------------------- registry ----------------------------- */
export interface ParamDef { key: string; label: string; def: number; min: number; max: number; step: number }
export interface IndicatorDef {
  id: IndicatorId;
  name: string;
  kind: "overlay" | "pane" | "volume";
  desc: string;
  params: ParamDef[];
}

export const INDICATOR_DEFS: IndicatorDef[] = [
  { id: "sma", name: "SMA", kind: "overlay", desc: "Simple moving average of closes.", params: [{ key: "period", label: "Period", def: 20, min: 2, max: 200, step: 1 }] },
  { id: "ema", name: "EMA", kind: "overlay", desc: "Exponential moving average — reacts faster.", params: [{ key: "period", label: "Period", def: 9, min: 2, max: 200, step: 1 }] },
  { id: "bb", name: "Bollinger Bands", kind: "overlay", desc: "Volatility bands around a 20-SMA.", params: [{ key: "period", label: "Period", def: 20, min: 5, max: 100, step: 1 }, { key: "std", label: "Std Dev", def: 2, min: 0.5, max: 4, step: 0.5 }] },
  { id: "vwap", name: "VWAP", kind: "overlay", desc: "Volume-weighted average price (session).", params: [] },
  { id: "volume", name: "Volume", kind: "volume", desc: "Volume bars along the chart floor.", params: [] },
  { id: "rsi", name: "RSI", kind: "pane", desc: "Momentum oscillator, 70/30 levels.", params: [{ key: "period", label: "Period", def: 14, min: 2, max: 50, step: 1 }] },
  { id: "macd", name: "MACD", kind: "pane", desc: "Trend momentum with signal + histogram.", params: [{ key: "fast", label: "Fast", def: 12, min: 2, max: 50, step: 1 }, { key: "slow", label: "Slow", def: 26, min: 3, max: 100, step: 1 }, { key: "signal", label: "Signal", def: 9, min: 2, max: 50, step: 1 }] },
  { id: "atr", name: "ATR", kind: "pane", desc: "Average true range — volatility.", params: [{ key: "period", label: "Period", def: 14, min: 2, max: 50, step: 1 }] },
];

export const defOf = (id: IndicatorId): IndicatorDef => INDICATOR_DEFS.find((d) => d.id === id) ?? INDICATOR_DEFS[0];

export function defaultParams(id: IndicatorId): Record<string, number> {
  const out: Record<string, number> = {};
  defOf(id).params.forEach((p) => { out[p.key] = p.def; });
  return out;
}

const PALETTE = ["#6fb6e8", "#39c5a5", "#e0a33b", "#b48ef0", "#f07fae", "#8fd3f0", "#e8c170"];

export function defaultIndicators(): ActiveIndicator[] {
  return [
    { uid: "ema-9", id: "ema", params: { period: 9 } },
    { uid: "sma-20", id: "sma", params: { period: 20 } },
    { uid: "volume-1", id: "volume", params: {} },
  ];
}

export const labelOf = (a: ActiveIndicator): string => {
  const d = defOf(a.id);
  const p = a.params;
  if (a.id === "sma" || a.id === "ema") return `${d.name} ${p.period ?? ""}`;
  if (a.id === "bb") return `BB ${p.period ?? 20},${p.std ?? 2}`;
  if (a.id === "rsi") return `RSI ${p.period ?? 14}`;
  if (a.id === "macd") return `MACD ${p.fast ?? 12},${p.slow ?? 26},${p.signal ?? 9}`;
  if (a.id === "atr") return `ATR ${p.period ?? 14}`;
  return d.name;
};

/** Compute every active indicator against the live candle array. */
const labelFor = labelOf;
export function computeIndicators(candles: Candle[], active: ActiveIndicator[]): IndicatorResult {
  const closes = closesOf(candles);
  const overlays: OverlaySeries[] = [];
  const panes: PaneSeries[] = [];
  let showVolume = false;
  let colorIdx = 0;

  for (const a of active) {
    const p = a.params;
    switch (a.id) {
      case "sma":
        overlays.push({ uid: a.uid, label: labelFor(a), color: PALETTE[colorIdx++ % PALETTE.length], width: 1.4, values: sma(closes, p.period ?? 20) });
        break;
      case "ema":
        overlays.push({ uid: a.uid, label: labelFor(a), color: PALETTE[colorIdx++ % PALETTE.length], width: 1.4, values: ema(closes, p.period ?? 9) });
        break;
      case "bb": {
        const bb = bollinger(closes, p.period ?? 20, p.std ?? 2);
        const col = PALETTE[colorIdx++ % PALETTE.length];
        overlays.push({ uid: a.uid, label: labelFor(a), color: col, width: 1.1, values: bb.middle, fill: { upper: bb.upper, lower: bb.lower, color: col } });
        break;
      }
      case "vwap":
        overlays.push({ uid: a.uid, label: "VWAP", color: "#e0a33b", width: 1.6, values: vwap(candles) });
        break;
      case "volume":
        showVolume = true;
        break;
      case "rsi":
        panes.push({ uid: a.uid, label: labelFor(a), kind: "rsi", a: rsi(closes, p.period ?? 14) });
        break;
      case "macd": {
        const m = macd(closes, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
        panes.push({ uid: a.uid, label: labelFor(a), kind: "macd", a: m.macd, b: m.signal, c: m.hist });
        break;
      }
      case "atr":
        panes.push({ uid: a.uid, label: labelFor(a), kind: "atr", a: atrSeries(candles, p.period ?? 14) });
        break;
    }
  }
  return { overlays, panes, showVolume };
}
