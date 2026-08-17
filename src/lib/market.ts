import { ASSETS, type Candle, type MarketState, type RegimeType } from "./types";

// Deterministic RNG so a saved session reproduces the same tape on reload.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const REGIMES: { r: RegimeType; drift: number; volMult: number }[] = [
  { r: "trend-up", drift: 0.00042, volMult: 1.0 },
  { r: "trend-down", drift: -0.00042, volMult: 1.05 },
  { r: "range", drift: 0, volMult: 0.75 },
  { r: "chop", drift: 0, volMult: 1.9 },
];

export function regimeOf(i: number): { r: RegimeType; drift: number; volMult: number } {
  return REGIMES[i % REGIMES.length];
}

export const CANDLE_TICKS = 6;
export const HISTORY = 170;

export function createMarket(seed: number): Record<string, MarketState> {
  const out: Record<string, MarketState> = {};
  ASSETS.forEach((a, ai) => {
    const rand = mulberry32(seed + ai * 7919);
    const candles: Candle[] = [];
    let price = a.base * (0.94 + rand() * 0.1);
    let regimeIdx = Math.floor(rand() * REGIMES.length);
    let reg = regimeOf(regimeIdx);
    for (let i = 0; i < HISTORY; i++) {
      if (i % 42 === 0 && i > 0) {
        regimeIdx = (regimeIdx + 1 + Math.floor(rand() * 2)) % REGIMES.length;
        reg = regimeOf(regimeIdx);
      }
      const o = price;
      let h = o, l = o, c = o;
      for (let k = 0; k < CANDLE_TICKS; k++) {
        c = c + c * reg.drift + gauss(rand) * a.vol * c * reg.volMult;
        h = Math.max(h, c); l = Math.min(l, c);
      }
      price = c;
      candles.push({ t: i, o, h, l, c, v: 400 + rand() * 2400 });
    }
    out[a.symbol] = {
      symbol: a.symbol,
      price,
      refClose: candles[Math.max(0, candles.length - 30)].c,
      drift: reg.drift,
      volMult: reg.volMult,
      regime: reg.r,
      candles,
      candleTicks: 0,
      shock: 0,
      news: null,
      stress: null,
      stressLogged: false,
      lastStressEnd: -999,
    };
  });
  return out;
}

export function atr(m: MarketState, period = 14): number {
  const cs = m.candles.slice(-period - 1);
  if (cs.length < 2) return m.price * 0.01;
  let sum = 0;
  for (let i = 1; i < cs.length; i++) {
    const tr = Math.max(
      cs[i].h - cs[i].l,
      Math.abs(cs[i].h - cs[i - 1].c),
      Math.abs(cs[i].l - cs[i - 1].c)
    );
    sum += tr;
  }
  return sum / (cs.length - 1);
}

export const HEADLINES_UP = [
  "{sym} beats quarterly estimates, raises full-year guidance",
  "Institutional filings show heavy accumulation in {sym}",
  "{sym} announces major buyback authorization",
  "Analysts upgrade {sym} citing accelerating demand",
  "{sym} unveils product roadmap ahead of schedule",
];
export const HEADLINES_DOWN = [
  "{sym} misses estimates; guidance cut for next quarter",
  "Regulatory probe announced into {sym} practices",
  "Key executive departure rattles {sym} holders",
  "Short-seller report targets {sym} accounting",
  "{sym} faces supply chain disruption, delivery delays seen",
];

export function pickHeadline(sym: string, up: boolean, rand: () => number = Math.random): string {
  const pool = up ? HEADLINES_UP : HEADLINES_DOWN;
  return pool[Math.floor(rand() * pool.length)].replace("{sym}", sym);
}
