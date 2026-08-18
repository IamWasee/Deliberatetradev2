import React, { createContext, useContext, useEffect, useReducer } from "react";
import {
  type AppState, type Checkin, type FrictionMode, type Journal, type MarketState,
  type Order, type Plan, type Position, type Side, type Toast, type Trade,
  ASSETS, assetMeta,
} from "./types";
import { CANDLE_TICKS, createMarket, pickHeadline, regimeOf, mulberry32 } from "./market";
import { buildDebrief, detectTilt, generateMissions } from "./coaching";
import { safeGet, safeSet, safeRemove, deepClone, num, str, arr, obj, bool } from "./safe";

export const LS_KEY = "deliberatetrade:v2";
let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const rand = mulberry32((Date.now() % 100000) + 17);

/* ------------------------------------------------------------------ */
function freshState(): AppState {
  const seed = Math.floor(Math.random() * 1e9);
  return {
    hydrated: true, name: "", plan: null, planHistory: [],
    friction: "realistic", stressMode: false,
    cash: 0, equity: 0, peakEquity: 0, sessionStartEquity: 0,
    session: 1, sessionStartTick: 0,
    positions: [], orders: [], trades: [], reviews: [], missions: [], practiceScore: 0,
    violations: [], news: [], log: [], toasts: [], journalDue: [],
    lock: null, cooldownUntil: 0, tiltReason: null,
    breaches: 0, stressSeen: 0, stressSurvived: 0, lossStreak: 0,
    tourDone: false, tourOpen: false,
    market: createMarket(seed), seed, now: 0, lastNewsTick: 0,
    selected: "NVDA",
  };
}

function loadState(): AppState {
  const base = freshState();
  try {
    const raw = safeGet(LS_KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    const saved = obj(parsed);
    if (!saved) return base;
    return rehydrate(saved, base);
  } catch {
    return base;
  }
}

/** Coerce every persisted field into a known-good shape. Anything suspicious falls back to defaults. */
function rehydrate(saved: Record<string, unknown>, base: AppState): AppState {
  const market = createMarket(num(saved.seed, base.seed));
  const symbols = new Set(Object.keys(market));

  // ---- plan ----
  const planRaw = obj(saved.plan);
  let plan: Plan | null = null;
  if (planRaw) {
    const setups = arr(planRaw.setups).filter((x): x is string => typeof x === "string");
    const forbidden = arr(planRaw.forbidden).filter((x): x is string => typeof x === "string");
    plan = {
      version: Math.max(1, Math.round(num(planRaw.version, 1))),
      createdAt: num(planRaw.createdAt, Date.now()),
      startingCapital: Math.max(1000, num(planRaw.startingCapital, 25000)),
      riskPerTradePct: num(planRaw.riskPerTradePct, 1),
      maxDailyLossPct: num(planRaw.maxDailyLossPct, 3),
      maxOpenRiskPct: num(planRaw.maxOpenRiskPct, 4),
      maxPositions: Math.max(1, Math.round(num(planRaw.maxPositions, 3))),
      forbidden,
      setups: setups.length ? setups : ["Breakout"],
      note: str(planRaw.note, ""),
    };
  }

  const checkinOf = (v: unknown): Checkin => {
    const c = obj(v) ?? {};
    const emo = str(c.emotion, "calm");
    return {
      emotion: (["calm", "focused", "fomo", "revenge", "bored", "overconfident", "fearful"].includes(emo) ? emo : "calm") as Checkin["emotion"],
      arousal: Math.min(10, Math.max(1, num(c.arousal, 4))),
      thesis: str(c.thesis, "—"),
      at: num(c.at, Date.now()),
    };
  };

  // ---- positions (drop anything malformed) ----
  const positions: Position[] = [];
  for (const p of arr(saved.positions)) {
    const o = obj(p);
    if (!o || typeof o.symbol !== "string" || !symbols.has(o.symbol)) continue;
    positions.push({
      id: str(o.id, nid("p")), symbol: o.symbol,
      side: o.side === "short" ? "short" : "long",
      qty: Math.max(1, num(o.qty, 1)), avgEntry: num(o.avgEntry, market[o.symbol].price),
      stop: typeof o.stop === "number" && Number.isFinite(o.stop) ? o.stop : null,
      target: typeof o.target === "number" && Number.isFinite(o.target) ? o.target : null,
      openedTick: num(o.openedTick, 0), openedTs: num(o.openedTs, Date.now()),
      riskAmount: num(o.riskAmount, 0), riskPct: num(o.riskPct, 0),
      setup: str(o.setup, "—"), checkin: checkinOf(o.checkin), override: bool(o.override),
      fees: num(o.fees, 0), stressHits: num(o.stressHits, 0), stopMovedWorse: bool(o.stopMovedWorse),
      regime: (["trend-up", "trend-down", "range", "chop"].includes(str(o.regime, "")) ? str(o.regime, "range") : "range") as Position["regime"],
    });
  }

  // ---- trades (coerce generously; history is precious) ----
  const trades: Trade[] = [];
  for (const t of arr(saved.trades)) {
    const o = obj(t);
    if (!o || typeof o.symbol !== "string") continue;
    const jr = obj(o.journal);
    const jraw = jr;
    const journal: Journal | null = jraw
      ? {
          plan: str(jraw.plan, "—"), whatHappened: str(jraw.whatHappened, "—"),
          emotionDuring: checkinOf({ emotion: jraw.emotionDuring }).emotion,
          emotionAfter: checkinOf({ emotion: jraw.emotionAfter }).emotion,
          followedRules: jraw.followedRules === "no" ? "no" : "yes",
          rulesNote: str(jraw.rulesNote, ""), lesson: str(jraw.lesson, "—"),
          setup: str(jraw.setup, "—"),
          grade: (["A", "B", "C", "D"].includes(str(jraw.grade, "")) ? str(jraw.grade, "B") : "B") as Journal["grade"],
          debrief: str(jraw.debrief, ""), at: num(jraw.at, Date.now()),
        }
      : null;
    trades.push({
      id: str(o.id, nid("tr")), symbol: o.symbol,
      side: o.side === "short" ? "short" : "long",
      qty: num(o.qty, 1), entry: num(o.entry, 0), exit: num(o.exit, 0),
      entryTick: num(o.entryTick, 0), exitTick: num(o.exitTick, 0),
      entryTs: num(o.entryTs, Date.now()), exitTs: num(o.exitTs, Date.now()),
      pnl: num(o.pnl, 0), fees: num(o.fees, 0), r: num(o.r, 0),
      riskAmount: Math.max(1, num(o.riskAmount, 1)), setup: str(o.setup, "—"),
      exitReason: (["stop", "target", "manual", "session"].includes(str(o.exitReason, "")) ? str(o.exitReason, "manual") : "manual") as Trade["exitReason"],
      checkin: checkinOf(o.checkin), override: bool(o.override),
      violations: arr(o.violations).filter((x): x is string => typeof x === "string"),
      friction: (["easy", "realistic", "brutal"].includes(str(o.friction, "")) ? str(o.friction, "realistic") : "realistic") as Trade["friction"],
      regime: (["trend-up", "trend-down", "range", "chop"].includes(str(o.regime, "")) ? str(o.regime, "range") : "range") as Trade["regime"],
      stressHits: num(o.stressHits, 0), journal,
    });
  }
  const tradeIds = new Set(trades.map((t) => t.id));

  const s: AppState = {
    ...base,
    name: str(saved.name, ""),
    plan,
    planHistory: arr(saved.planHistory).map((h) => {
      const o = obj(h);
      return { version: num(o?.version, 1), at: num(o?.at, Date.now()), reason: str(o?.reason, "") };
    }),
    friction: (["easy", "realistic", "brutal"].includes(str(saved.friction, "")) ? str(saved.friction, "realistic") : "realistic") as AppState["friction"],
    stressMode: bool(saved.stressMode),
    cash: num(saved.cash, plan ? plan.startingCapital : 0),
    equity: 0, peakEquity: num(saved.peakEquity, 0),
    sessionStartEquity: 0,
    session: Math.max(1, Math.round(num(saved.session, 1))),
    sessionStartTick: 0,
    positions, orders: [], trades,
    reviews: arr(saved.reviews).map((r) => obj(r)).filter((o): o is Record<string, unknown> => !!o && typeof o.tradeId === "string" && tradeIds.has(o.tradeId as string))
      .map((o) => ({ id: str(o.id, nid("rv")), tradeId: str(o.tradeId, ""), dueTick: num(o.dueTick, 0), interval: Math.max(10, num(o.interval, 40)), reps: num(o.reps, 0) })),
    missions: arr(saved.missions).map((m) => obj(m)).filter((o): o is Record<string, unknown> => !!o && typeof o.code === "string")
      .map((o) => ({
        id: str(o.id, nid("m")), code: str(o.code, ""), title: str(o.title, "Mission"),
        why: str(o.why, ""), target: Math.max(1, num(o.target, 1)), progress: num(o.progress, 0),
        done: bool(o.done), area: str(o.area, "Discipline"),
      })),
    practiceScore: num(saved.practiceScore, 0),
    violations: arr(saved.violations).map((v) => obj(v)).filter((o): o is Record<string, unknown> => !!o)
      .map((o) => ({ id: str(o.id, nid("v")), rule: str(o.rule, "Rule"), detail: str(o.detail, ""), at: num(o.at, 0), ts: num(o.ts, Date.now()) })),
    news: arr(saved.news).map((n) => obj(n)).filter((o): o is Record<string, unknown> => !!o && typeof o.symbol === "string")
      .slice(0, 14)
      .map((o) => ({ id: str(o.id, nid("n")), symbol: str(o.symbol, ""), headline: str(o.headline, ""), impact: (o.impact === "up" ? "up" : "down") as "up" | "down", tick: num(o.tick, 0), ts: num(o.ts, Date.now()) })),
    log: arr(saved.log).map((l) => obj(l)).filter((o): o is Record<string, unknown> => !!o)
      .slice(0, 60)
      .map((o) => ({ id: str(o.id, nid("lg")), kind: (["fill", "risk", "event", "system", "coach"].includes(str(o.kind, "")) ? str(o.kind, "system") : "system") as "fill" | "risk" | "event" | "system" | "coach", text: str(o.text, ""), tick: num(o.tick, 0), ts: num(o.ts, Date.now()) })),
    toasts: [],
    journalDue: arr(saved.journalDue).filter((id): id is string => typeof id === "string" && tradeIds.has(id) && !trades.find((t) => t.id === id)?.journal),
    lock: (() => { const o = obj(saved.lock); return o && typeof o.reason === "string" ? { reason: o.reason, loss: num(o.loss, 0) } : null; })(),
    cooldownUntil: 0, tiltReason: null,
    breaches: Math.max(0, num(saved.breaches, 0)),
    stressSeen: Math.max(0, num(saved.stressSeen, 0)),
    stressSurvived: Math.max(0, num(saved.stressSurvived, 0)),
    lossStreak: Math.max(0, num(saved.lossStreak, 0)),
    market, seed: num(saved.seed, base.seed), now: 0, lastNewsTick: 0,
    selected: symbols.has(str(saved.selected, "")) ? (str(saved.selected, "NVDA")) : "NVDA",
    tourDone: bool(saved.tourDone), tourOpen: false,
    hydrated: true,
  };

  if (arr(saved.orders).length > 0)
    s.log = [{ id: nid("lg"), kind: "system", text: "Open orders were cancelled when the session reloaded.", tick: 0, ts: Date.now() }, ...s.log];

  // recompute equity against the regenerated tape
  s.equity = s.cash + s.positions.reduce((a, p) => a + mtm(p, market[p.symbol].price), 0);
  s.peakEquity = Math.max(s.peakEquity, s.equity);
  if (s.plan) s.sessionStartEquity = s.equity;
  if (!s.missions.length && s.plan) s.missions = generateMissions("adherence", s.plan.setups);
  return s;
}

const mtm = (p: Position, px: number) => (p.side === "long" ? px - p.avgEntry : p.avgEntry - px) * p.qty;

/* ------------------------------------------------------------------ */
export type Action =
  | { type: "TICK" }
  | { type: "SELECT"; symbol: string }
  | { type: "SET_FRICTION"; mode: FrictionMode }
  | { type: "SET_STRESS"; on: boolean }
  | { type: "CREATE_PLAN"; plan: Plan; name: string }
  | { type: "AMEND_PLAN"; plan: Plan; reason: string }
  | { type: "PLACE_ORDER"; symbol: string; orderType: "market" | "limit" | "stop"; side: Side; qty: number; trigger: number | null; stop: number | null; target: number | null; setup: string; checkin: Checkin; override: boolean }
  | { type: "CANCEL_ORDER"; id: string }
  | { type: "CLOSE_POSITION"; id: string }
  | { type: "ADJUST_BRACKET"; id: string; stop: number | null; target: number | null }
  | { type: "SUBMIT_JOURNAL"; tradeId: string; journal: Omit<Journal, "debrief" | "at"> }
  | { type: "ACK_LOCK" }
  | { type: "END_SESSION" }
  | { type: "RESOLVE_REVIEW"; id: string; again: boolean }
  | { type: "DISMISS_TOAST"; id: string }
  | { type: "RESET_ALL" }
  | { type: "OPEN_TOUR"; open: boolean }
  | { type: "TOUR_FINISHED" };

const toast = (d: AppState, kind: Toast["kind"], text: string) => {
  d.toasts.push({ id: nid("t"), kind, text });
  if (d.toasts.length > 4) d.toasts = d.toasts.slice(-4);
};
const log = (d: AppState, kind: "fill" | "risk" | "event" | "system" | "coach", text: string) => {
  d.log.unshift({ id: nid("lg"), kind, text, tick: d.now, ts: Date.now() });
  if (d.log.length > 60) d.log.length = 60;
};
const violation = (d: AppState, rule: string, detail: string) => {
  d.violations.unshift({ id: nid("v"), rule, detail, at: d.now, ts: Date.now() });
  toast(d, "warn", `Rule violation logged: ${rule}`);
  log(d, "risk", `VIOLATION — ${rule}: ${detail}`);
};

/* ---------------------------- fills ------------------------------- */
interface FillResult { ok: true; px: number; qty: number; fees: number; partial: boolean }
interface FillReject { ok: false; reason: string }

function makeFill(d: AppState, symbol: string, dir: 1 | -1, qty: number, refPx: number): FillResult | FillReject {
  const meta = assetMeta(symbol);
  const m = d.market[symbol];
  const stressActive = !!m.stress;
  const mode = d.friction;
  let px = refPx;
  let fees = 0;
  let partial = false;
  if (mode === "realistic") {
    const slip = refPx * meta.vol * (0.3 + 0.25 * rand());
    px = refPx + dir * slip;
  } else if (mode === "brutal") {
    if (stressActive && rand() < 0.22) return { ok: false, reason: "Order rejected — liquidity pulled during stress" };
    const slip = refPx * meta.vol * (0.55 + 0.5 * Math.sqrt(qty / 400)) * (0.7 + 0.6 * rand());
    px = refPx + dir * slip;
    const notional = refPx * qty;
    fees = meta.kind === "crypto" ? notional * 0.0006 : Math.max(1, qty * 0.005);
    if (rand() < 0.16) partial = true;
  }
  const filled = partial ? Math.max(1, Math.round(qty * (0.55 + 0.35 * rand()))) : qty;
  return { ok: true, px, qty: filled, fees, partial };
}

/* --------------------------- entry/exit --------------------------- */
function openRiskTotal(d: AppState): number {
  return d.positions.reduce((a, p) => a + p.riskAmount, 0);
}

function applyEntry(
  d: AppState, o: { symbol: string; side: Side; qty: number; stop: number | null; target: number | null; riskAmount: number; setup: string; checkin: Checkin; override: boolean },
  px: number, qty: number, fees: number
) {
  const existing = d.positions.find((p) => p.symbol === o.symbol);
  if (existing && existing.side === o.side) {
    const losing = mtm(existing, px) < 0;
    const totalQty = existing.qty + qty;
    existing.avgEntry = (existing.avgEntry * existing.qty + px * qty) / totalQty;
    existing.qty = totalQty;
    existing.fees += fees;
    existing.riskAmount = existing.stop ? Math.abs(existing.avgEntry - existing.stop) * totalQty : existing.riskAmount;
    if (losing && d.plan?.forbidden.includes("averaging-down"))
      violation(d, "Averaging down", `Added to losing ${o.symbol} position`);
    d.cash += o.side === "long" ? -(px * qty) - fees : px * qty - fees;
    log(d, "fill", `Added ${qty} ${o.symbol} @ ${px.toFixed(2)} (avg ${existing.avgEntry.toFixed(2)})`);
    return;
  }
  const pos: Position = {
    id: nid("p"), symbol: o.symbol, side: o.side, qty, avgEntry: px,
    stop: o.stop, target: o.target, openedTick: d.now, openedTs: Date.now(),
    riskAmount: o.riskAmount, riskPct: d.equity > 0 ? (o.riskAmount / d.equity) * 100 : 0,
    setup: o.setup, checkin: o.checkin, override: o.override, fees,
    stressHits: 0, stopMovedWorse: false, regime: d.market[o.symbol].regime,
  };
  d.positions.push(pos);
  d.cash += o.side === "long" ? -(px * qty) - fees : px * qty - fees;
  log(d, "fill", `Filled ${o.side.toUpperCase()} ${qty} ${o.symbol} @ ${px.toFixed(2)} · risk $${o.riskAmount.toFixed(0)} · ${o.setup}`);
  toast(d, "ok", `Filled ${o.side} ${qty} ${o.symbol} @ ${px.toFixed(2)}`);
}

function closePosition(d: AppState, posId: string, refPx: number, reason: Trade["exitReason"]) {
  const idx = d.positions.findIndex((p) => p.id === posId);
  if (idx < 0) return;
  const pos = d.positions[idx];
  const dir: 1 | -1 = pos.side === "long" ? -1 : 1; // closing: long sells, short buys
  const fill = makeFill(d, pos.symbol, dir, pos.qty, refPx);
  if (!fill.ok) {
    // brutal rejection on close: force fill at worse price instead — you always get out
    log(d, "event", `Exit order rejected on ${pos.symbol}; retried as aggressive marketable order.`);
    const px = refPx + dir * refPx * assetMeta(pos.symbol).vol * 1.4;
    finalizeClose(d, idx, px, pos.fees + Math.max(1, pos.qty * 0.005), reason);
    return;
  }
  finalizeClose(d, idx, fill.px, pos.fees + fill.fees, reason);
}

function finalizeClose(d: AppState, idx: number, px: number, fees: number, reason: Trade["exitReason"]) {
  const pos = d.positions[idx];
  const gross = (pos.side === "long" ? px - pos.avgEntry : pos.avgEntry - px) * pos.qty;
  const pnl = gross - fees;
  d.cash += pos.side === "long" ? px * pos.qty - fees : -(px * pos.qty) - fees;
  const trade: Trade = {
    id: nid("tr"), symbol: pos.symbol, side: pos.side, qty: pos.qty,
    entry: pos.avgEntry, exit: px, entryTick: pos.openedTick, exitTick: d.now,
    entryTs: pos.openedTs, exitTs: Date.now(), pnl, fees,
    r: pnl / Math.max(1, pos.riskAmount),
    riskAmount: pos.riskAmount, setup: pos.setup, exitReason: reason,
    checkin: pos.checkin, override: pos.override,
    violations: [], friction: d.friction, regime: pos.regime,
    stressHits: pos.stressHits, journal: null,
  };
  if (pos.override) trade.violations.push("Oversized vs plan (acknowledged)");
  if (pos.stopMovedWorse) trade.violations.push("Stop widened after entry");
  d.trades.push(trade);
  d.journalDue.push(trade.id);
  d.positions.splice(idx, 1);
  d.lossStreak = trade.r < 0 ? d.lossStreak + 1 : 0;

  const color = pnl >= 0 ? "+" : "−";
  toast(d, pnl >= 0 ? "ok" : "bad", `${reason === "stop" ? "Stopped out" : reason === "target" ? "Target hit" : "Closed"} ${trade.symbol}: ${color}$${Math.abs(pnl).toFixed(2)} (${trade.r >= 0 ? "+" : ""}${trade.r.toFixed(2)}R)`);
  log(d, "fill", `Closed ${trade.symbol} ${trade.side} @ ${px.toFixed(2)} · P&L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} · ${trade.r.toFixed(2)}R · ${reason}`);

  // ---- psychology layer ----
  d.journalDue.length && toast(d, "info", "Post-trade journal is now mandatory.");
  const tilt = detectTilt(d.trades, d.violations.filter((v) => d.now - v.at < 60).length);
  if (tilt) {
    d.cooldownUntil = d.now + 26;
    d.tiltReason = tilt;
    toast(d, "warn", "Tilt Detector tripped — trading paused for a cool-down.");
    log(d, "coach", `Tilt Detector: ${tilt}`);
  }
  // ---- missions ----
  bumpMissions(d, trade);
}

function bumpMissions(d: AppState, t: Trade) {
  const planned = (d.plan!.riskPerTradePct / 100) * d.plan!.startingCapital;
  const topSetup = d.plan!.setups[0] ?? "";
  d.missions.forEach((m) => {
    if (m.done) return;
    let hit = false;
    if (m.code === "risk3" && t.riskAmount <= planned * 1.25) hit = true;
    if (m.code === "calm5" && (t.checkin.emotion === "calm" || t.checkin.emotion === "focused")) hit = true;
    if (m.code === "bracket3" && t.exitReason !== "manual" && t.violations.length === 0 && t.riskAmount > 0) hit = true;
    if (m.code === "setup3" && t.setup === topSetup) hit = true;
    if (hit) { m.progress++; if (m.progress >= m.target) { m.done = true; d.practiceScore += 25; toast(d, "ok", `Mission complete: ${m.title} (+25 practice)`); } }
  });
}

/* ---------------------------- gating ------------------------------ */
export function gateCheck(d: AppState): { ok: boolean; reason: string } {
  if (!d.plan) return { ok: false, reason: "No trading plan on file." };
  if (d.lock) return { ok: false, reason: "Daily loss limit breached — session locked." };
  if (d.now < d.cooldownUntil) return { ok: false, reason: "Tilt cool-down active." };
  return { ok: true, reason: "" };
}

/* ----------------------------- reducer ---------------------------- */
function reducer(state: AppState, action: Action): AppState {
  const d: AppState = deepClone(state);
  switch (action.type) {
    case "TICK": return tick(d);
    case "SELECT": d.selected = action.symbol; return d;
    case "SET_FRICTION": {
      d.friction = action.mode;
      log(d, "system", `Friction mode → ${action.mode.toUpperCase()}. Easy trades are excluded from readiness scoring.`);
      return d;
    }
    case "SET_STRESS": {
      d.stressMode = action.on;
      toast(d, action.on ? "warn" : "info", action.on ? "Stress Mode armed — adverse events will be injected into live positions." : "Stress Mode disarmed.");
      log(d, "system", `Stress Mode ${action.on ? "armed" : "disarmed"}`);
      return d;
    }
    case "CREATE_PLAN": {
      d.plan = action.plan;
      d.name = action.name;
      d.cash = action.plan.startingCapital;
      d.equity = action.plan.startingCapital;
      d.peakEquity = action.plan.startingCapital;
      d.sessionStartEquity = action.plan.startingCapital;
      d.missions = generateMissions("adherence", action.plan.setups);
      log(d, "system", `Trading Plan v${action.plan.version} locked. Capital $${action.plan.startingCapital.toLocaleString()}.`);
      toast(d, "ok", "Plan locked. The market is open — trade the plan, not the mood.");
      return d;
    }
    case "AMEND_PLAN": {
      d.planHistory.push({ version: d.plan!.version, at: Date.now(), reason: action.reason });
      d.plan = action.plan;
      log(d, "system", `Plan amended to v${action.plan.version}: ${action.reason}`);
      toast(d, "info", `Plan v${action.plan.version} locked. Previous version archived.`);
      return d;
    }
    case "PLACE_ORDER": return placeOrder(d, action);
    case "CANCEL_ORDER": {
      const i = d.orders.findIndex((o) => o.id === action.id);
      if (i >= 0) { d.orders.splice(i, 1); log(d, "system", `Order cancelled on ${action.id.slice(0, 8)}`); }
      return d;
    }
    case "CLOSE_POSITION": {
      const pos = d.positions.find((p) => p.id === action.id);
      if (pos) closePosition(d, action.id, d.market[pos.symbol].price, "manual");
      recomputeEquity(d);
      return d;
    }
    case "ADJUST_BRACKET": {
      const pos = d.positions.find((p) => p.id === action.id);
      if (!pos) return d;
      const worse = pos.side === "long"
        ? (action.stop !== null && pos.stop !== null && action.stop < pos.stop)
        : (action.stop !== null && pos.stop !== null && action.stop > pos.stop);
      if (worse) {
        pos.stopMovedWorse = true;
        if (d.plan?.forbidden.includes("moving-stops")) violation(d, "Stop widened", `Moved ${pos.symbol} stop away from price`);
        else log(d, "risk", `Stop widened on ${pos.symbol} — risk increased after entry.`);
      }
      pos.stop = action.stop;
      pos.target = action.target;
      log(d, "system", `Bracket updated on ${pos.symbol}: stop ${action.stop?.toFixed(2) ?? "—"} / target ${action.target?.toFixed(2) ?? "—"}`);
      return d;
    }
    case "SUBMIT_JOURNAL": {
      const t = d.trades.find((x) => x.id === action.tradeId);
      if (!t) return d;
      const debrief = buildDebrief(t, d.plan, d.trades);
      t.journal = { ...action.journal, debrief, at: Date.now() };
      d.journalDue = d.journalDue.filter((id) => id !== action.tradeId);
      d.practiceScore += 2;
      if (t.r < 0) {
        d.reviews.push({ id: nid("rv"), tradeId: t.id, dueTick: d.now + 40, interval: 40, reps: 0 });
        d.missions.forEach((m) => {
          if (m.code === "journal2" && !m.done && action.journal.lesson.length >= 40) {
            m.progress++;
            if (m.progress >= m.target) { m.done = true; d.practiceScore += 25; toast(d, "ok", `Mission complete: ${m.title} (+25 practice)`); }
          }
        });
      }
      log(d, "coach", `Journal filed for ${t.symbol} (${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R). Grade ${action.journal.grade}.`);
      toast(d, "ok", "Journal saved. Coach debrief attached.");
      return d;
    }
    case "ACK_LOCK": return endSession(d, true);
    case "END_SESSION": return endSession(d, false);
    case "RESOLVE_REVIEW": {
      const r = d.reviews.find((x) => x.id === action.id);
      if (!r) return d;
      if (action.again) {
        r.interval = Math.max(25, Math.round(r.interval * 0.6));
        r.dueTick = d.now + r.interval;
        log(d, "coach", "Review rescheduled — this pattern needs more reps.");
      } else {
        r.reps++;
        r.interval = Math.round(r.interval * 2.2);
        r.dueTick = d.now + r.interval;
        d.practiceScore += 5;
        log(d, "coach", "Review complete — pattern re-filed for later.");
      }
      return d;
    }
    case "DISMISS_TOAST": d.toasts = d.toasts.filter((t) => t.id !== action.id); return d;
    case "RESET_ALL": {
      safeRemove(LS_KEY);
      return freshState();
    }
    case "OPEN_TOUR": { d.tourOpen = action.open; return d; }
    case "TOUR_FINISHED": { d.tourOpen = false; d.tourDone = true; return d; }
  }
}

function placeOrder(d: AppState, a: Extract<Action, { type: "PLACE_ORDER" }>): AppState {
  const gate = gateCheck(d);
  if (!gate.ok) { toast(d, "warn", gate.reason); return d; }
  const plan = d.plan!;
  const m = d.market[a.symbol];
  const px0 = a.orderType === "market" ? m.price : a.trigger ?? m.price;

  // ---- risk math ----
  const riskPerShare = a.stop ? Math.abs(px0 - a.stop) : 0;
  const plannedRisk$ = (plan.riskPerTradePct / 100) * d.equity;
  const riskAmount = a.stop ? riskPerShare * a.qty : Math.max(1, plannedRisk$);
  const existing = d.positions.find((p) => p.symbol === a.symbol);

  // ---- hard gates ----
  const sameDir = existing && existing.side === a.side;
  if (!sameDir && existing) { toast(d, "warn", "Close the open position on this symbol first."); return d; }
  if (!existing && d.positions.length >= plan.maxPositions) {
    toast(d, "warn", `Max open positions (${plan.maxPositions}) reached.`);
    log(d, "risk", "New position blocked: max open positions reached.");
    return d;
  }
  const projectedOpen = openRiskTotal(d) + (existing ? Math.max(0, riskAmount - existing.riskAmount) : riskAmount);
  if (!existing && projectedOpen > (plan.maxOpenRiskPct / 100) * d.equity) {
    toast(d, "warn", `Max open risk ${plan.maxOpenRiskPct}% would be exceeded — order blocked.`);
    log(d, "risk", `New position blocked: open risk would exceed ${plan.maxOpenRiskPct}% of equity.`);
    return d;
  }

  // ---- rule checks at entry ----
  let override = a.override;
  if (a.stop === null && plan.forbidden.includes("no-stop")) {
    toast(d, "bad", "Your plan forbids entries without a hard stop.");
    log(d, "risk", "Entry blocked: plan forbids no-stop trades.");
    return d;
  }
  if (riskAmount > plannedRisk$ * 2.05 && plan.forbidden.includes("oversize")) {
    toast(d, "bad", "Blocked: risk exceeds 2× planned risk — forbidden by your plan.");
    return d;
  }
  if (riskAmount > plannedRisk$ * 1.05 && !override) {
    toast(d, "warn", "Risk exceeds plan — acknowledge the override on the ticket to proceed.");
    return d;
  }
  if (override) violation(d, "Oversize", `Risked $${riskAmount.toFixed(0)} vs plan $${plannedRisk$.toFixed(0)}`);
  if (plan.forbidden.includes("news-chasing") && m.news && d.now - m.news.at < 9 && a.orderType === "market") {
    violation(d, "News chasing", `Marketable entry on ${a.symbol} mid news-shock`);
  }
  const lastT = d.trades[d.trades.length - 1];
  if (plan.forbidden.includes("revenge-trading") && lastT && lastT.r < 0 && d.now - lastT.exitTick < 14) {
    violation(d, "Revenge re-entry", `Re-entered ${d.now - lastT.exitTick} ticks after a loss`);
    d.cooldownUntil = d.now + 20;
    d.tiltReason = "Revenge re-entry detected immediately after a loss.";
  }

  const order: Order = {
    id: nid("o"), symbol: a.symbol, type: a.orderType, side: a.side, qty: a.qty,
    trigger: a.trigger ?? 0, createdAt: d.now, stop: a.stop, target: a.target,
    riskAmount, setup: a.setup, checkin: a.checkin, override,
  };

  if (a.orderType === "market") {
    const dir: 1 | -1 = a.side === "long" ? 1 : -1;
    const fill = makeFill(d, a.symbol, dir, a.qty, m.price);
    if (!fill.ok) { toast(d, "bad", fill.reason); log(d, "event", `${fill.reason} (${a.symbol})`); return d; }
    applyEntry(d, { symbol: a.symbol, side: a.side, qty: fill.qty, stop: a.stop, target: a.target, riskAmount: riskAmount * (fill.qty / a.qty), setup: a.setup, checkin: a.checkin, override }, fill.px, fill.qty, fill.fees);
    if (fill.partial) { toast(d, "warn", `Partial fill: ${fill.qty}/${a.qty}. Remainder cancelled (liquidity).`); log(d, "event", `Partial fill ${fill.qty}/${a.qty} on ${a.symbol}`); }
  } else {
    d.orders.push(order);
    log(d, "system", `${a.orderType.toUpperCase()} order parked: ${a.side} ${a.qty} ${a.symbol} @ ${a.trigger?.toFixed(2)}`);
    toast(d, "info", `${a.orderType} order working: ${a.side} ${a.qty} ${a.symbol} @ ${a.trigger?.toFixed(2)}`);
  }
  recomputeEquity(d);
  return d;
}

function endSession(d: AppState, fromLock: boolean): AppState {
  [...d.positions].forEach((p) => closePosition(d, p.id, d.market[p.symbol].price, "session"));
  d.orders = [];
  recomputeEquity(d);
  d.session++;
  d.sessionStartEquity = d.equity;
  d.sessionStartTick = d.now;
  d.lock = null;
  d.cooldownUntil = 0;
  d.tiltReason = null;
  const weakest = (["risk", "emotion", "journal", "adherence", "setup"] as const)[Math.floor(rand() * 5)];
  d.missions = generateMissions(weakest, d.plan?.setups ?? ["Breakout"]);
  log(d, "system", `Session ${d.session} opened. Equity $${d.equity.toFixed(2)}. New missions generated from your weakest areas.`);
  toast(d, "info", fromLock ? "Review acknowledged. New session started — fresh daily limits." : `Session ${d.session} started. Missions refreshed.`);
  return d;
}

function recomputeEquity(d: AppState) {
  d.equity = d.cash + d.positions.reduce((a, p) => a + mtm(p, d.market[p.symbol].price), 0);
  d.peakEquity = Math.max(d.peakEquity, d.equity);
}

/* ------------------------------ tick ------------------------------ */
function tick(d: AppState): AppState {
  d.now++;
  const symbols = ASSETS.map((a) => a.symbol);

  // --- stress injection ---
  if (d.stressMode && d.positions.length > 0 && rand() < 0.028) {
    const active = symbols.some((s) => d.market[s].stress);
    const sinceLast = Math.min(...d.positions.map((p) => d.market[p.symbol].lastStressEnd));
    if (!active && d.now - (Number.isFinite(sinceLast) ? sinceLast : -999) > 40) {
      const victim = d.positions[Math.floor(rand() * d.positions.length)];
      const m = d.market[victim.symbol];
      const dirn = victim.side === "long" ? -1 : 1;
      m.stress = { until: d.now + 9, per: dirn * m.price * 0.0033 };
      victim.stressHits++;
      d.stressSeen++;
      toast(d, "bad", `STRESS INJECTED — adverse move underway on ${victim.symbol}. Hold the process.`);
      log(d, "event", `Stress event on ${victim.symbol}: ~2.8% adverse injection over 9 ticks.`);
    }
  }

  // --- price step ---
  for (const sym of symbols) {
    const meta = assetMeta(sym);
    const m = d.market[sym];
    m.shock *= 0.78;
    if (rand() < 0.006) m.shock = (rand() - 0.5) * meta.vol * m.price * 9;
    let newsDrift = 0;
    if (m.news) {
      if (d.now - m.news.at < 10) newsDrift = m.news.drift * m.price;
      else m.news = null;
    }
    let px = m.price + m.price * m.drift + newsDrift + m.shock + gaussLocal() * meta.vol * m.price * m.volMult;
    if (m.stress) {
      px += m.stress.per;
      if (d.now >= m.stress.until) {
        m.stress = null;
        m.lastStressEnd = d.now;
        const holding = d.positions.filter((p) => p.symbol === sym);
        holding.forEach((p) => {
          if (!p.stopMovedWorse) {
            d.stressSurvived++;
            d.practiceScore += 10;
            d.missions.forEach((mi) => {
              if (mi.code === "survive1" && !mi.done) {
                mi.progress++;
                if (mi.progress >= mi.target) { mi.done = true; d.practiceScore += 25; toast(d, "ok", `Mission complete: ${mi.title} (+25 practice)`); }
              }
            });
            toast(d, "ok", `Stress survived on ${sym} — stop held, position intact. +10 practice.`);
            log(d, "coach", `You held ${sym} through an injected 2.8% adverse move without widening risk. This is the rep that transfers.`);
          } else {
            log(d, "coach", `Stress on ${sym} ended — but the stop had been widened. Survival doesn't count without discipline.`);
          }
        });
      }
    }
    px = Math.max(px, m.price * 0.9);
    m.price = px;
    const c = m.candles[m.candles.length - 1];
    c.h = Math.max(c.h, px); c.l = Math.min(c.l, px); c.c = px;
    c.v += 60 + rand() * 420;
    m.candleTicks++;
    if (m.candleTicks >= CANDLE_TICKS) {
      m.candleTicks = 0;
      m.candles.push({ t: c.t + 1, o: px, h: px, l: px, c: px, v: 0 });
      if (m.candles.length > 260) m.candles.shift();
      if (m.candles.length % 45 === 0) {
        const reg = regimeOf(Math.floor(rand() * 4) + (m.regime === "chop" ? 1 : 0));
        m.drift = reg.drift * (0.7 + rand() * 0.6);
        m.volMult = reg.volMult;
        m.regime = reg.r;
      }
    }
  }

  // --- random news ---
  if (d.now - d.lastNewsTick > 26 && rand() < 0.03) {
    const sym = symbols[Math.floor(rand() * symbols.length)];
    const up = rand() > 0.48;
    const m = d.market[sym];
    m.news = { headline: pickHeadline(sym, up), drift: (up ? 1 : -1) * (0.006 + rand() * 0.008) / 10, at: d.now, impact: up ? "up" : "down" };
    d.lastNewsTick = d.now;
    d.news.unshift({ id: nid("n"), symbol: sym, headline: m.news.headline, impact: up ? "up" : "down", tick: d.now, ts: Date.now() });
    if (d.news.length > 14) d.news.length = 14;
    toast(d, "info", `${sym}: ${m.news.headline}`);
    log(d, "event", `News on ${sym}: ${m.news.headline}`);
  }

  // --- pending orders ---
  for (const o of [...d.orders]) {
    const px = d.market[o.symbol].price;
    let triggered = false;
    if (o.type === "limit") triggered = o.side === "long" ? px <= o.trigger : px >= o.trigger;
    if (o.type === "stop") triggered = o.side === "long" ? px >= o.trigger : px <= o.trigger;
    if (!triggered) continue;
    const dir: 1 | -1 = o.side === "long" ? 1 : -1;
    const fill = makeFill(d, o.symbol, dir, o.qty, o.trigger);
    d.orders = d.orders.filter((x) => x.id !== o.id);
    if (!fill.ok) { log(d, "event", `${fill.reason} (${o.symbol} ${o.type} order)`); toast(d, "bad", fill.reason); continue; }
    applyEntry(d, { symbol: o.symbol, side: o.side, qty: fill.qty, stop: o.stop, target: o.target, riskAmount: o.riskAmount * (fill.qty / o.qty), setup: o.setup, checkin: o.checkin, override: o.override }, fill.px, fill.qty, fill.fees);
    if (fill.partial) log(d, "event", `Partial fill ${fill.qty}/${o.qty} on ${o.symbol}`);
  }

  // --- position brackets ---
  for (const p of [...d.positions]) {
    const px = d.market[p.symbol].price;
    if (p.stop !== null) {
      const hit = p.side === "long" ? px <= p.stop : px >= p.stop;
      if (hit) { closePosition(d, p.id, p.stop, "stop"); continue; }
    }
    if (p.target !== null) {
      const hit = p.side === "long" ? px >= p.target : px <= p.target;
      if (hit) closePosition(d, p.id, p.target, "target");
    }
  }

  recomputeEquity(d);

  // --- daily loss circuit breaker ---
  if (!d.lock && d.plan && d.sessionStartEquity > 0) {
    const loss = d.equity - d.sessionStartEquity;
    const limit = -(d.plan.maxDailyLossPct / 100) * d.sessionStartEquity;
    if (loss <= limit) {
      d.lock = { reason: `Daily loss limit of ${d.plan.maxDailyLossPct}% reached.`, loss };
      d.breaches++;
      toast(d, "bad", "CIRCUIT BREAKER — daily loss limit hit. Trading locked.");
      log(d, "risk", `Circuit breaker: daily loss limit ${d.plan.maxDailyLossPct}% breached (−$${Math.abs(loss).toFixed(2)}). Session locked for mandatory review.`);
    }
  }
  return d;
}

function gaussLocal(): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ----------------------------- context ---------------------------- */
const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    const iv = setInterval(() => dispatch({ type: "TICK" }), 850);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    try {
      const { market: _m, toasts: _t, ...rest } = state;
      safeSet(LS_KEY, JSON.stringify(rest));
    } catch { /* storage full — ignore */ }
  }, [state]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

/** Nuclear recovery: wipe persisted data and reload. Used by the crash screen. */
export function hardReset() {
  safeRemove(LS_KEY);
  window.location.reload();
}
