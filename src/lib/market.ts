/* Deterministic market simulator — seeded, reproducible sessions. */
import { ASSETS, type Candle, type MarketState, type Regime, type AssetMeta } from "./types";

export const CANDLE_TICKS = 6;
export const HISTORY = 240;

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

const pick = <T,>(rnd: () => number, a: T[]): T => a[Math.floor(rnd() * a.length)];

export function createMarket(seed: number): Record<string, MarketState> {
  const rnd = mulberry32(seed);
  const out: Record<string, MarketState> = {};
  for (const a of ASSETS) {
    const candles = genHistory(a, rnd);
    const price = candles[candles.length - 1].c;
    out[a.symbol] = {
      candles, price, refClose: price,
      regime: regimeOf(candles), stress: null,
      drift: (rnd() - 0.5) * a.vol * 0.12,
    };
  }
  return out;
}

function genHistory(a: AssetMeta, rnd: () => number): Candle[] {
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
    const v = Math.round(1000 + rnd() * 4000 + Math.abs(c - o) / (a.vol * p) * 800);
    candles.push({ o, h, l, c, v });
    p = c;
  }
  return candles;
}

export function regimeOf(candles: Candle[]): Regime {
  const last = candles.slice(-24);
  if (last.length < 24) return "range";
  const first = last.slice(0, 12).reduce((s, c) => s + c.c, 0) / 12;
  const second = last.slice(12).reduce((s, c) => s + c.c, 0) / 12;
  const move = (second - first) / first;
  const atrAvg = atrArr(last);
  if (Math.abs(move) > atrAvg * 1.6) return move > 0 ? "trend-up" : "trend-down";
  const body = last.reduce((s, c) => s + Math.abs(c.c - c.o), 0);
  const wick = last.reduce((s, c) => s + (c.h - c.l) - Math.abs(c.c - c.o), 0);
  return wick > body * 1.9 ? "chop" : "range";
}

export function atr(m: MarketState, period = 14): number { return atrArr(m.candles.slice(-period - 1)); }
function atrArr(cs: Candle[]): number {
  if (cs.length < 2) return cs.length ? cs[0].h - cs[0].l : 1;
  let s = 0;
  for (let i = 1; i < cs.length; i++) {
    s += Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c));
  }
  return s / (cs.length - 1);
}

/* one simulation tick per asset */
export function stepMarket(m: MarketState, a: AssetMeta, rnd: () => number): MarketState {
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
  if ((candles.length * CANDLE_TICKS) % CANDLE_TICKS === 0 && candles.length > 0 && rndTickNewCandle(rnd)) {
    full = [...candles.slice(-(HISTORY - 1)), { o: price, h: price, l: price, c: price, v: Math.round(rnd() * 200) }];
    closed = true;
  }
  return {
    ...m, candles: full, price, stress,
    regime: closed ? regimeOf(full) : m.regime,
  };
}
const rndTickNewCandle = (rnd: () => number): boolean => rnd() < 0.16;

const UP_HEADLINES = [
  "{s} beats quarterly estimates; raises full-year guidance",
  "{s} unveils products analysts call a category reset",
  "Institutional inflows accelerate into {s}",
  "{s} announces expanded buyback authorization",
  "Upgrade wave: two desks raise {s} targets",
];
const DOWN_HEADLINES = [
  "{s} warns of margin pressure next quarter",
  "Regulatory probe headlines hit {s}",
  "{s} insider selling spikes to 12-month high",
  "Downgrade: {s} cut on demand concerns",
  "{s} guidance trimmed; supply costs cited",
];

export function pickHeadline(symbol: string, impact: "up" | "down", rnd: () => number): string {
  const bank = impact === "up" ? UP_HEADLINES : DOWN_HEADLINES;
  return pick(rnd, bank).replace("{s}", symbol);
}
