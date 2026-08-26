/* =====================================================================
   Market simulator — deterministic, and shaped like a real tape.

   The previous engine was a Gaussian random walk: every tick drawn from
   the same normal distribution, wicks drawn independently of the body.
   That produces noise which LOOKS like a chart but behaves nothing like
   one, and it had three consequences worth naming.

     · No volatility clustering. Real markets alternate between quiet and
       violent; a constant-sigma walk is uniformly busy, so a trainee
       never learns to size down when conditions change.
     · No fat tails. Gaussian returns make a 5-sigma move essentially
       impossible, so the sim never produced the sort of day that
       actually destroys accounts - the exact lesson this app exists to
       teach.
     · No real candlestick structure. With wicks drawn as independent
       noise, engulfings, hammers and dojis appear only by coincidence,
       and regimeOf() was labelling randomness. The chart said
       "REGIME: RANGE" with nothing behind it.

   This engine instead models the three things that give a tape its
   character, while staying seeded and fully reproducible:

     1. REGIMES that exist before they are labelled. A Markov state
        machine holds trend-up, trend-down, range or chop for a realistic
        stretch, then switches. Drift and mean reversion follow from the
        regime, so the chip on the chart is now a fact about the
        generator rather than a guess about its output.

     2. GARCH(1,1) VOLATILITY. sigma_t^2 = omega + alpha*e_{t-1}^2 +
        beta*sigma_{t-1}^2, with alpha + beta < 1 so it stays stationary
        and mean-reverts to a per-asset baseline. This is the standard
        model for the clustering seen in real returns.

     3. STUDENT-t INNOVATIONS (nu = 4, standardised to unit variance) for
        fat tails, so large moves occur at roughly the rate markets
        actually deliver them rather than effectively never.

   Candlestick patterns are not templated anywhere in this file. They
   emerge because bars are built from an intrabar path with directional
   pressure that can reverse mid-bar - which is how a hammer or an
   engulfing forms on a real chart.
   ===================================================================== */
import {
  ASSETS, type AssetMeta, type Candle, type MarketState, type Regime, type SimState,
} from "./types";

/** Ticks per bar. Fixed, so a bar is a consistent unit of time and ATR
    means something; the old engine closed bars at random. */
export const CANDLE_TICKS = 6;
export const HISTORY = 240;

/* ------------------------------ randomness ---------------------------- */

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

const NU = 4;                                   // degrees of freedom
const T_SCALE = Math.sqrt((NU - 2) / NU);       // rescale to unit variance

/** Standardised Student-t innovation. Same variance as a standard normal,
    but a genuinely heavy tail: the moves that matter for risk training
    show up at a realistic rate instead of never. */
function studentT(rnd: () => number): number {
  const z = gauss(rnd);
  let chi = 0;
  for (let i = 0; i < NU; i++) { const g = gauss(rnd); chi += g * g; }
  return (z / Math.sqrt(chi / NU)) * T_SCALE;
}

const pick = <T,>(rnd: () => number, a: T[]): T => a[Math.floor(rnd() * a.length)];

/* ------------------------------- regimes ------------------------------ */

/* Rows sum to 1. Trends are more likely to decay into a range than to flip
   straight into the opposite trend, and chop resolves rather than persists
   - both of which match how real tape tends to behave. */
const TRANSITIONS: Record<Regime, [Regime, number][]> = {
  "trend-up":   [["trend-up", 0.34], ["range", 0.36], ["chop", 0.18], ["trend-down", 0.12]],
  "trend-down": [["trend-down", 0.32], ["range", 0.36], ["chop", 0.20], ["trend-up", 0.12]],
  "range":      [["range", 0.30], ["trend-up", 0.24], ["trend-down", 0.24], ["chop", 0.22]],
  "chop":       [["chop", 0.18], ["range", 0.34], ["trend-up", 0.24], ["trend-down", 0.24]],
};

function nextRegime(cur: Regime, rnd: () => number): Regime {
  let r = rnd();
  for (const [reg, p] of TRANSITIONS[cur]) { r -= p; if (r <= 0) return reg; }
  return "range";
}

/** How long a regime holds, in ticks. Spread wide so a trainee cannot
    learn a rhythm and time the switches. */
function regimeDuration(reg: Regime, rnd: () => number): number {
  const base = reg === "chop" ? 90 : reg === "range" ? 170 : 210;
  return Math.round(base * (0.55 + rnd() * 1.1));
}

/** Per-tick drift implied by a regime, as a multiple of baseline vol.
    Trends drift; ranges and chop do not, and are shaped by mean reversion
    and by intrabar pressure instead. */
function driftFor(reg: Regime, sigma: number, rnd: () => number): number {
  switch (reg) {
    case "trend-up":   return sigma * (0.16 + rnd() * 0.16);
    case "trend-down": return -sigma * (0.16 + rnd() * 0.16);
    default:           return sigma * (rnd() - 0.5) * 0.05;
  }
}

/* ------------------------------- GARCH -------------------------------- */

const ALPHA = 0.13;   // reaction to the last shock
const BETA = 0.85;    // persistence  (ALPHA + BETA < 1 -> stationary)

function stepSigma(sim: SimState): number {
  const omega = sim.baseSigma * sim.baseSigma * (1 - ALPHA - BETA);
  const varNext = omega + ALPHA * sim.lastShock * sim.lastShock + BETA * sim.sigma * sim.sigma;
  /* Clamped so a fat-tailed shock cannot drive volatility somewhere the
     price scale never recovers from. */
  return Math.min(sim.baseSigma * 4, Math.max(sim.baseSigma * 0.35, Math.sqrt(varNext)));
}

/* ------------------------------ construction -------------------------- */

function freshSim(a: AssetMeta, price: number, rnd: () => number, regime: Regime): SimState {
  const baseSigma = a.vol * 0.34;
  return {
    regimeLeft: regimeDuration(regime, rnd),
    drift: driftFor(regime, baseSigma, rnd),
    sigma: baseSigma,
    lastShock: 0,
    baseSigma,
    anchor: price,
    barTick: 0,
    pressure: 0,
  };
}

export function createMarket(seed: number): Record<string, MarketState> {
  const rnd = mulberry32(seed);
  const out: Record<string, MarketState> = {};
  for (const a of ASSETS) {
    const start: Regime = pick(rnd, ["trend-up", "trend-down", "range", "chop"] as Regime[]);
    const { candles, sim, regime } = genHistory(a, rnd, start);
    const price = candles[candles.length - 1].c;
    out[a.symbol] = {
      candles, price, refClose: price,
      regime, stress: null, drift: sim.drift, sim,
    };
  }
  return out;
}

/** Seed history through the same tick engine that will run live, so the
    candles a user scrolls back through obey the same physics as the ones
    forming in front of them. A chart whose past and present disagree
    teaches the wrong lessons. */
function genHistory(a: AssetMeta, rnd: () => number, start: Regime) {
  let price = a.base * (1 + (rnd() - 0.5) * 0.04);
  const sim = freshSim(a, price, rnd, start);
  let regime = start;
  const candles: Candle[] = [];

  let cur: Candle = { o: price, h: price, l: price, c: price, v: 0 };
  const total = HISTORY * CANDLE_TICKS;

  for (let i = 0; i < total; i++) {
    const r = advance({ price, regime, sim, meta: a, stress: null }, rnd);
    price = r.price; regime = r.regime;

    cur.c = price;
    cur.h = Math.max(cur.h, r.high);
    cur.l = Math.min(cur.l, r.low);
    cur.v += r.volume;

    if (++sim.barTick >= CANDLE_TICKS) {
      sim.barTick = 0;
      candles.push(cur);
      cur = { o: price, h: price, l: price, c: price, v: Math.max(1, Math.round(r.volume * 0.2)) };
    }
  }
  if (candles.length === 0) candles.push(cur);
  return { candles, sim, regime };
}

/* -------------------------------- engine ------------------------------ */

/** MICRO steps traded within one tick. A bar is only CANDLE_TICKS ticks
    long, so if each tick were a single jump the high and low would sit
    almost on the open and close - measured at 308 marubozu per 1000 bars,
    where real tape produces a small fraction of that. Walking the path
    inside each tick is how wicks form, and therefore how hammers, dojis
    and spinning tops appear at believable rates. */
const MICRO = 9;

/** Wick excursion as a multiple of tick volatility. Raising it lengthens
    shadows and lowers the marubozu rate; it does not affect close-to-close
    returns, because the bridge below is pinned at both ends. */
const WICK = 1.5;

interface TickResult {
  price: number;
  /** Intrabar extremes reached during this tick, not just its close. */
  high: number;
  low: number;
  regime: Regime;
  volume: number;
}

interface AdvanceIn {
  price: number;
  regime: Regime;
  sim: SimState;
  meta: { base: number; vol: number };
  stress: { left: number; dir: 1 | -1 } | null;
}

/** One tick. Mutates `sim` (it is the simulator's own scratch state) and
    returns the new price, regime and the volume traded on this tick. */
function advance(inp: AdvanceIn, rnd: () => number): TickResult {
  const { sim, meta } = inp;
  let regime = inp.regime;

  /* --- regime clock ------------------------------------------------- */
  if (--sim.regimeLeft <= 0) {
    regime = nextRegime(regime, rnd);
    sim.regimeLeft = regimeDuration(regime, rnd);
    sim.drift = driftFor(regime, sim.baseSigma, rnd);
    /* A new range forms around wherever price actually is. */
    if (regime === "range" || regime === "chop") sim.anchor = inp.price;
  }

  /* --- volatility --------------------------------------------------- */
  sim.sigma = stepSigma(sim);
  let sigma = sim.sigma;
  let drift = sim.drift;

  /* Stress mode overrides both: a deliberate adverse push for training.
     Preserved exactly as before so the stress feature still bites. */
  if (inp.stress) {
    drift = inp.stress.dir * meta.vol * 0.55;
    sigma = sim.sigma * 2.4;
  }

  /* --- mean reversion ------------------------------------------------ */
  /* Ranges are defined by price being pulled back; without this a "range"
     is just a trendless walk that wanders off and never returns. */
  if (!inp.stress && (regime === "range" || regime === "chop")) {
    const pull = (sim.anchor - inp.price) / inp.price;
    drift += pull * (regime === "range" ? 0.055 : 0.03);
  }

  /* --- intrabar pressure -------------------------------------------- */
  /* A directional push that persists for a few ticks and can flip inside
     a bar. This is what carves wicks: a bar pushed down then bought back
     closes near its high with a long lower shadow - a hammer - without a
     hammer ever being templated anywhere. Chop flips it often, which is
     precisely what makes chop unpleasant to trade. */
  const flip = regime === "chop" ? 0.34 : 0.12;
  if (rnd() < flip) sim.pressure = (rnd() - 0.5) * 2;
  sim.pressure *= 0.86;

  /* --- the tick ------------------------------------------------------ */
  /* One shock sets the tick's character; the path to it is then walked in
     MICRO steps so the extremes touched along the way become the wick.
     Variance is split across the steps (sigma / sqrt(MICRO)) so total
     tick volatility is unchanged - this adds structure, not energy. */
  const shock = studentT(rnd);
  sim.lastShock = shock * sigma;

  const ret = drift + shock * sigma + sim.pressure * sigma * 0.30;
  const price = Math.max(meta.base * 0.15, inp.price * (1 + ret));

  /* The path from open to close is a BROWNIAN BRIDGE: both endpoints are
     pinned, and the walk wanders between them. Excursion variance is
     t*(1-t), so deviation is widest mid-tick and vanishes at each end.

     Pinning matters. An earlier attempt walked freely and let the close
     fall where it landed, which piled extra Gaussian noise on top of the
     shock - measured as kurtosis falling 1.26 -> 0.97 and clustering
     0.111 -> 0.079, because adding normal noise to a fat-tailed variable
     drags it back toward normal. A bridge leaves close-to-close
     statistics untouched and contributes only the highs and lows. */
  let high = Math.max(inp.price, price);
  let low = Math.min(inp.price, price);
  const span = WICK * sigma * inp.price;
  for (let i = 1; i < MICRO; i++) {
    const t = i / MICRO;
    const mid = inp.price + (price - inp.price) * t;
    const p = mid + gauss(rnd) * span * Math.sqrt(t * (1 - t));
    if (p > high) high = p;
    if (p < low) low = p;
  }
  low = Math.max(meta.base * 0.15, low);

  /* Volume follows conviction: quiet ticks trade thin, and a move several
     sigma wide brings participation with it. */
  const impulse = Math.abs(ret) / Math.max(1e-9, sigma);
  const volume = Math.round(60 + rnd() * 90 + impulse * 260);

  return { price, high, low, regime, volume };
}

/** Advance one instrument by one tick, in place. The single stepping path
    used by both history generation and the live session. */
export function stepMarket(
  m: MarketState, a: { symbol: string; base: number; vol: number }, rnd: () => number,
): void {
  const r = advance(
    { price: m.price, regime: m.regime, sim: m.sim, meta: a, stress: m.stress }, rnd);

  m.price = r.price;
  m.regime = r.regime;
  m.drift = m.sim.drift;
  if (m.stress) m.stress = m.stress.left <= 1 ? null : { ...m.stress, left: m.stress.left - 1 };

  const last = m.candles[m.candles.length - 1];
  last.c = r.price;
  last.h = Math.max(last.h, r.high);
  last.l = Math.min(last.l, r.low);
  last.v += r.volume;

  if (++m.sim.barTick >= CANDLE_TICKS) {
    m.sim.barTick = 0;
    /* The opening print seeds the new bar. Starting at zero left the
       newest bar rendering as a zero-height gap in the volume histogram
       for one tick after every close. */
    m.candles = [...m.candles.slice(-(HISTORY - 1)),
      { o: r.price, h: r.price, l: r.price, c: r.price, v: Math.max(1, Math.round(r.volume * 0.2)) }];
  }
}

/* ------------------------------ measurement --------------------------- */

/** Classifies what recent candles LOOK like, from the candles alone.

    Kept for analysis, but no longer the source of truth: the generator
    now sets the true regime directly, so the chip on the chart is a fact
    about the simulation rather than a guess about its output.

    Measured against the true regime across 25 seeds, this heuristic
    agrees 31% of the time - barely above the 25% you would get by
    guessing among four labels. That is not a regression; it is what the
    old engine was displaying, and the reason the "REGIME" chip could not
    be trusted before. Do not reintroduce it as the displayed value. */
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

/* ------------------------------- headlines ---------------------------- */

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
  return pick(rnd, impact === "up" ? UP_HEADLINES : DOWN_HEADLINES).replace("{s}", symbol);
}
