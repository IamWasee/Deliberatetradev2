/* =====================================================================
   DeliberateTrade store — market loop, order engine, risk enforcement,
   tilt detection wiring, journals, missions. All state changes flow
   through one reducer with a CSRF checkpoint; scores are derived, never
   stored, and can't be dispatched.
   ===================================================================== */
import React, { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import {
  type AppState, type Checkin, type FrictionMode, type Journal, type MarketState,
  type Order, type Plan, type Position, type Side, type Toast, type Trade,
  type ActiveIndicator, ASSETS, assetMeta,
} from "./types";
import { CANDLE_TICKS, createMarket, pickHeadline, mulberry32 } from "./market";
import { buildDebrief, detectTiltSignals, generateMissions, TILT_META } from "./coaching";
import { safeGet, safeRemove, deepClone, num, str, arr, obj, bool, nid } from "./safe";
import { writeTable } from "./db";
import { journalGate, journalQualityScore } from "./journalQuality";
import { sanitizeText, rateLimited } from "./auth";
import { isValidCsrfToken, issueCsrfToken } from "./csrf";
import { defaultIndicators, defOf, INDICATOR_DEFS } from "./indicators";

const LS_KEY = "dt:store:v2";
const TICK_MS = 850;

/* --------------------------- fresh state ---------------------------- */
function freshState(): AppState {
  return {
    name: "", plan: null, planHistory: [], friction: "realistic", stressMode: true,
    cash: 0, equity: 0, peakEquity: 0, sessionStartEquity: 0,
    session: 1, sessionStartTick: 0,
    positions: [], orders: [], trades: [], reviews: [], missions: [], practiceScore: 0,
    violations: [], news: [], log: [], toasts: [], journalDue: [],
    lock: null, cooldownUntil: 0, tiltReason: null,
    breaches: 0, stressSeen: 0, stressSurvived: 0, lossStreak: 0,
    tiltHandled: [], tourDone: false, tourOpen: false,
    legalAcceptedAt: 0, tradeDisclaimerShown: false,
    indicators: defaultIndicators(),
    market: createMarket(1), seed: 1, now: 0, lastNewsTick: 0,
    selected: "NVDA", hydrated: false,
  };
}

/* --------------------------- rehydrate ------------------------------ */
function loadState(): AppState {
  const base = freshState();
  try {
    const raw = safeGet(LS_KEY);
    if (!raw) return base;
    const saved = obj(JSON.parse(raw));
    if (!saved) return base;
    return rehydrate(saved, base);
  } catch {
    return base;
  }
}

function rehydrate(saved: Record<string, unknown>, base: AppState): AppState {
  const market = createMarket(num(saved.seed, base.seed));
  const symbols = new Set(Object.keys(market));

  const planRaw = obj(saved.plan);
  let plan: Plan | null = null;
  if (planRaw) {
    const setups = arr(planRaw.setups).filter((x): x is string => typeof x === "string");
    plan = {
      version: Math.max(1, Math.round(num(planRaw.version, 1))),
      createdAt: num(planRaw.createdAt, Date.now()),
      startingCapital: Math.max(1000, num(planRaw.startingCapital, 25000)),
      riskPerTradePct: num(planRaw.riskPerTradePct, 1),
      maxDailyLossPct: num(planRaw.maxDailyLossPct, 3),
      maxOpenRiskPct: num(planRaw.maxOpenRiskPct, 4),
      maxPositions: Math.max(1, Math.round(num(planRaw.maxPositions, 3))),
      forbidden: arr(planRaw.forbidden).filter((x): x is string => typeof x === "string"),
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
      thesis: str(c.thesis, "—"), at: num(c.at, Date.now()),
    };
  };

  const positions: Position[] = [];
  for (const p of arr(saved.positions)) {
    const o = obj(p);
    if (!o || typeof o.symbol !== "string" || !symbols.has(o.symbol)) continue;
    positions.push({
      id: str(o.id, nid("p")), symbol: o.symbol, side: o.side === "short" ? "short" : "long",
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

  const trades: Trade[] = [];
  for (const t of arr(saved.trades)) {
    const o = obj(t);
    if (!o || typeof o.symbol !== "string") continue;
    const jr = obj(o.journal);
    const journal: Journal | null = jr
      ? {
          plan: str(jr.plan, "—"), whatHappened: str(jr.whatHappened, "—"),
          emotionDuring: checkinOf({ emotion: jr.emotionDuring }).emotion,
          emotionAfter: checkinOf({ emotion: jr.emotionAfter }).emotion,
          followedRules: jr.followedRules === "no" ? "no" : "yes",
          rulesNote: str(jr.rulesNote, ""), lesson: str(jr.lesson, "—"), setup: str(jr.setup, "—"),
          grade: (["A", "B", "C", "D"].includes(str(jr.grade, "")) ? str(jr.grade, "B") : "B") as Journal["grade"],
          qualityScore: num(jr.qualityScore, 50), debrief: str(jr.debrief, ""), at: num(jr.at, Date.now()),
        }
      : null;
    trades.push({
      id: str(o.id, nid("tr")), symbol: o.symbol, side: o.side === "short" ? "short" : "long",
      qty: num(o.qty, 1), entry: num(o.entry, 0), exit: num(o.exit, 0),
      entryTick: num(o.entryTick, 0), exitTick: num(o.exitTick, 0),
      entryTs: num(o.entryTs, Date.now()), exitTs: num(o.exitTs, Date.now()),
      pnl: num(o.pnl, 0), fees: num(o.fees, 0), r: num(o.r, 0),
      riskAmount: Math.max(1, num(o.riskAmount, 1)), riskPct: num(o.riskPct, 1),
      setup: str(o.setup, "—"),
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
    name: str(saved.name, ""), plan,
    planHistory: arr(saved.planHistory).map((h) => {
      const o = obj(h);
      return { version: num(o?.version, 1), at: num(o?.at, Date.now()), reason: str(o?.reason, "") };
    }),
    friction: (["easy", "realistic", "brutal"].includes(str(saved.friction, "")) ? str(saved.friction, "realistic") : "realistic") as FrictionMode,
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
    news: arr(saved.news).map((n) => obj(n)).filter((o): o is Record<string, unknown> => !!o && typeof o.symbol === "string").slice(0, 14)
      .map((o) => ({ id: str(o.id, nid("n")), symbol: str(o.symbol, ""), headline: str(o.headline, ""), impact: (o.impact === "up" ? "up" : "down") as "up" | "down", tick: num(o.tick, 0), ts: num(o.ts, Date.now()) })),
    log: arr(saved.log).map((l) => obj(l)).filter((o): o is Record<string, unknown> => !!o).slice(0, 60)
      .map((o) => ({ id: str(o.id, nid("lg")), kind: (["fill", "risk", "event", "system", "coach"].includes(str(o.kind, "")) ? str(o.kind, "system") : "system") as AppState["log"][number]["kind"], text: str(o.text, ""), tick: num(o.tick, 0), ts: num(o.ts, Date.now()) })),
    toasts: [],
    journalDue: arr(saved.journalDue).filter((id): id is string => typeof id === "string" && tradeIds.has(id) && !trades.find((t) => t.id === id)?.journal),
    lock: (() => { const o = obj(saved.lock); return o && typeof o.reason === "string" ? { reason: o.reason, loss: num(o.loss, 0) } : null; })(),
    cooldownUntil: 0, tiltReason: null,
    breaches: Math.max(0, num(saved.breaches, 0)),
    stressSeen: Math.max(0, num(saved.stressSeen, 0)),
    stressSurvived: Math.max(0, num(saved.stressSurvived, 0)),
    lossStreak: Math.max(0, num(saved.lossStreak, 0)),
    tiltHandled: arr(saved.tiltHandled).filter((x): x is string => typeof x === "string").slice(-120),
    tourDone: bool(saved.tourDone), tourOpen: false,
    legalAcceptedAt: num(saved.legalAcceptedAt, 0), tradeDisclaimerShown: bool(saved.tradeDisclaimerShown),
    indicators: sanitizeIndicators(saved.indicators),
    market, seed: num(saved.seed, base.seed), now: 0, lastNewsTick: 0,
    selected: symbols.has(str(saved.selected, "")) ? str(saved.selected, "NVDA") : "NVDA",
    hydrated: true,
  };

  if (arr(saved.orders).length > 0)
    s.log = [{ id: nid("lg"), kind: "system", text: "Open orders were cancelled when the session reloaded.", tick: 0, ts: Date.now() }, ...s.log];

  s.equity = s.cash + s.positions.reduce((a, p) => a + mtm(p, market[p.symbol].price), 0);
  s.peakEquity = Math.max(s.peakEquity, s.equity);
  if (s.plan) s.sessionStartEquity = s.equity;
  if (!s.missions.length && s.plan) s.missions = generateMissions("adherence", s.plan.setups);
  return s;
}

function sanitizeIndicators(v: unknown): ActiveIndicator[] {
  const validIds = new Set(INDICATOR_DEFS.map((d) => d.id));
  const out: ActiveIndicator[] = [];
  for (const it of arr(v)) {
    const o = obj(it);
    if (!o || typeof o.id !== "string" || !validIds.has(o.id as ActiveIndicator["id"])) continue;
    const id = o.id as ActiveIndicator["id"];
    const params: Record<string, number> = {};
    const po = obj(o.params) ?? {};
    defOf(id).params.forEach((pd) => {
      const raw = po[pd.key];
      const n = typeof raw === "number" && Number.isFinite(raw) ? raw : pd.def;
      params[pd.key] = Math.min(pd.max, Math.max(pd.min, n));
    });
    out.push({ uid: str(o.uid, `${id}-${out.length}`), id, params });
  }
  return out.length ? out : defaultIndicators();
}

/* ----------------------------- helpers ------------------------------ */
const mtm = (p: Position, px: number) => (p.side === "long" ? px - p.avgEntry : p.avgEntry - px) * p.qty;

function log(d: AppState, kind: AppState["log"][number]["kind"], text: string) {
  d.log = [{ id: nid("lg"), kind, text, tick: d.now, ts: Date.now() }, ...d.log].slice(0, 60);
}
function toast(d: AppState, tone: Toast["tone"], text: string) {
  d.toasts = [...d.toasts, { id: nid("t"), tone, text }].slice(-4);
}
function addViolation(d: AppState, rule: string, detail: string) {
  d.violations.push({ id: nid("v"), rule, detail, at: d.now, ts: Date.now() });
  log(d, "risk", `${rule}: ${detail}`);
}
function recomputeEquity(d: AppState) {
  d.equity = d.cash + d.positions.reduce((a, p) => a + mtm(p, d.market[p.symbol].price), 0);
  d.peakEquity = Math.max(d.peakEquity, d.equity);
}

export function gateCheck(d: AppState): { ok: boolean; reason: string } {
  if (!d.plan) return { ok: false, reason: "No trading plan on file." };
  if (d.lock) return { ok: false, reason: "Daily loss limit breached — session locked." };
  if (d.now < d.cooldownUntil) return { ok: false, reason: "Tilt cool-down active." };
  if (d.journalDue.length > 0) return { ok: false, reason: "File the pending post-trade journal before your next order." };
  return { ok: true, reason: "" };
}

/* --------------------------- tilt wiring ---------------------------- */
function runTiltCheck(d: AppState) {
  const signals = detectTiltSignals(d.trades, d.violations);
  const fresh = signals.filter((s) => !d.tiltHandled.includes(s.key));
  if (fresh.length === 0) return;
  d.tiltHandled = [...d.tiltHandled, ...fresh.map((f) => f.key)].slice(-120);
  const sev = fresh.reduce((a, s) => a + s.severity, 0);
  for (const s of fresh) {
    addViolation(d, `Tilt: ${TILT_META[s.type].label}`, s.detail);
  }
  if (sev >= 2) {
    const ticks = Math.min(240, 60 + 25 * sev);
    d.cooldownUntil = Math.max(d.cooldownUntil, d.now + ticks);
    d.tiltReason = fresh.map((f) => TILT_META[f.type].label).join(" · ");
    toast(d, "down", `Tilt Detector: ${fresh.length} signal${fresh.length > 1 ? "s" : ""}. Trading paused — breathe first.`);
  } else {
    d.tiltReason = TILT_META[fresh[0].type].label;
    toast(d, "warn", `Tilt Detector noted: ${TILT_META[fresh[0].type].label}. Logged to your record.`);
  }
}

/* ------------------------------ actions ----------------------------- */
export type Action =
  | { type: "TICK" }
  | { type: "SELECT"; symbol: string }
  | { type: "SET_FRICTION"; mode: FrictionMode }
  | { type: "STRESS_TOGGLE" }
  | { type: "CREATE_PLAN"; name: string; plan: Plan; legalAcceptedAt: number }
  | { type: "AMEND_PLAN"; plan: Plan; reason: string }
  | { type: "PLACE_ORDER"; symbol: string; orderType: "market" | "limit" | "stop"; side: Side; qty: number; trigger: number | null; stop: number | null; target: number | null; setup: string; checkin: Checkin; override: boolean }
  | { type: "CANCEL_ORDER"; id: string }
  | { type: "CLOSE_POSITION"; id: string }
  | { type: "ADJUST_BRACKET"; id: string; stop: number | null; target: number | null }
  | { type: "SUBMIT_JOURNAL"; tradeId: string; journal: Omit<Journal, "debrief" | "at" | "qualityScore"> }
  | { type: "ACK_LOCK" }
  | { type: "END_SESSION" }
  | { type: "RESOLVE_REVIEW"; id: string; again: boolean }
  | { type: "DISMISS_TOAST"; id: string }
  | { type: "RESET_ALL" }
  | { type: "OPEN_TOUR"; open: boolean }
  | { type: "TOUR_FINISHED" }
  | { type: "SET_INDICATORS"; indicators: ActiveIndicator[] }
  | { type: "ACK_TRADE_DISCLAIMER" };

/* Actions that mutate money, rules or data must carry a valid CSRF stamp. */
const CSRF_SENSITIVE: ReadonlySet<Action["type"]> = new Set([
  "PLACE_ORDER", "SUBMIT_JOURNAL", "CREATE_PLAN", "AMEND_PLAN",
  "CLOSE_POSITION", "END_SESSION", "ADJUST_BRACKET",
]);

function reducer(state: AppState, action: Action): AppState {
  const d: AppState = deepClone(state);
  // CSRF checkpoint — before ANY mutation.
  if (CSRF_SENSITIVE.has(action.type)) {
    const stamp = (action as Action & { _csrf?: string })._csrf;
    if (!isValidCsrfToken(stamp)) {
      toast(d, "warn", "Security check failed (CSRF). The action was blocked.");
      log(d, "system", `Blocked ${action.type}: missing or invalid CSRF token.`);
      return d;
    }
  }
  switch (action.type) {
    case "TICK": return tick(d);
    case "SELECT": { d.selected = d.market[action.symbol] ? action.symbol : d.selected; return d; }
    case "SET_FRICTION": {
      d.friction = action.mode;
      log(d, "system", `Friction mode → ${action.mode.toUpperCase()}. Easy trades are excluded from readiness scoring.`);
      toast(d, "info", `Friction: ${action.mode}. ${action.mode === "easy" ? "Instant fills — pure learning mode." : action.mode === "realistic" ? "Slippage + partial fills." : "Commissions, gaps, rejects. Prop-firm mode."}`);
      return d;
    }
    case "STRESS_TOGGLE": {
      d.stressMode = !d.stressMode;
      toast(d, "info", d.stressMode ? "Stress Mode armed — adverse events will find your positions." : "Stress Mode off.");
      return d;
    }
    case "CREATE_PLAN": {
      if (rateLimited("planWrite", 5, 60_000).limited) { toast(d, "warn", "Rate limit: too many plan changes."); return d; }
      d.plan = { ...action.plan, note: sanitizeText(action.plan.note), setups: action.plan.setups.map((s) => sanitizeText(s, 40)).filter(Boolean) };
      d.name = sanitizeText(action.name, 60);
      d.legalAcceptedAt = action.legalAcceptedAt;
      d.cash = action.plan.startingCapital;
      d.equity = action.plan.startingCapital;
      d.peakEquity = action.plan.startingCapital;
      d.sessionStartEquity = action.plan.startingCapital;
      d.missions = generateMissions("adherence", d.plan.setups);
      if (!d.tourDone) d.tourOpen = true;
      log(d, "system", `Trading Plan v${d.plan.version} locked. Capital $${d.plan.startingCapital.toLocaleString()}.`);
      toast(d, "ok", "Plan locked. The market is open — trade the plan, not the mood.");
      return d;
    }
    case "AMEND_PLAN": {
      if (!d.plan) return d;
      if (rateLimited("planWrite", 5, 60_000).limited) { toast(d, "warn", "Rate limit: too many plan changes."); return d; }
      const reason = sanitizeText(action.reason, 300);
      d.planHistory.push({ version: d.plan.version, at: Date.now(), reason });
      d.plan = { ...action.plan, note: sanitizeText(action.plan.note), setups: action.plan.setups.map((s) => sanitizeText(s, 40)).filter(Boolean) };
      log(d, "system", `Plan amended to v${d.plan.version}: ${reason}`);
      toast(d, "info", `Plan v${d.plan.version} locked. Previous version archived.`);
      return d;
    }
    case "PLACE_ORDER": return placeOrder(d, action);
    case "CANCEL_ORDER": {
      const i = d.orders.findIndex((o) => o.id === action.id);
      if (i >= 0) { d.orders.splice(i, 1); log(d, "system", "Order cancelled."); }
      return d;
    }
    case "CLOSE_POSITION": {
      const pos = d.positions.find((p) => p.id === action.id);
      if (pos) closePosition(d, pos, d.market[pos.symbol].price, "manual");
      return d;
    }
    case "ADJUST_BRACKET": {
      const pos = d.positions.find((p) => p.id === action.id);
      if (!pos) return d;
      const worse = pos.side === "long"
        ? action.stop !== null && pos.stop !== null && action.stop < pos.stop
        : action.stop !== null && pos.stop !== null && action.stop > pos.stop;
      if (worse) {
        pos.stopMovedWorse = true;
        addViolation(d, "Stop widened", `Moved the stop against the position on ${pos.symbol} — the original idea is now undefined.`);
      }
      pos.stop = action.stop; pos.target = action.target;
      log(d, "system", `Bracket updated on ${pos.symbol}.`);
      return d;
    }
    case "SUBMIT_JOURNAL": {
      if (rateLimited("submitJournal", 10, 60_000).limited) { toast(d, "warn", "Rate limit: too many journal submissions. Slow down."); return d; }
      const t = d.trades.find((x) => x.id === action.tradeId);
      if (!t) return d;
      const fields = {
        plan: sanitizeText(action.journal.plan), whatHappened: sanitizeText(action.journal.whatHappened),
        rulesNote: sanitizeText(action.journal.rulesNote), lesson: sanitizeText(action.journal.lesson),
        followedRules: action.journal.followedRules,
      };
      const gate = journalGate(fields);
      if (!gate.ok) { toast(d, "warn", gate.reason); return d; }
      const qualityScore = journalQualityScore(fields);
      if (qualityScore < 25) { toast(d, "warn", "Journal rejected by the quality engine — write a real reflection."); return d; }
      const debrief = buildDebrief(t, d.plan, d.trades);
      t.journal = { ...action.journal, ...fields, qualityScore, debrief, at: Date.now() };
      d.journalDue = d.journalDue.filter((id) => id !== action.tradeId);
      d.practiceScore += 2;
      if (t.r < 0) {
        d.reviews.push({ id: nid("rv"), tradeId: t.id, dueTick: d.now + 40, interval: 40, reps: 0 });
        d.missions.forEach((m) => {
          if (m.code === "journal2" && !m.done && qualityScore >= 50 && fields.lesson.length >= 40) {
            m.progress++;
            if (m.progress >= m.target) { m.done = true; d.practiceScore += 25; toast(d, "ok", `Mission complete: ${m.title} (+25 practice)`); }
          }
        });
      }
      log(d, "coach", `Journal filed for ${t.symbol} (${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R). Grade ${t.journal.grade} · quality ${qualityScore}/100.`);
      toast(d, "ok", `Journal saved · quality ${qualityScore}/100. Coach debrief attached.`);
      return d;
    }
    case "ACK_LOCK": { d.lock = null; toast(d, "info", "Review acknowledged. End the session to reset the daily limit."); return d; }
    case "END_SESSION": {
      for (const p of [...d.positions]) closePosition(d, p, d.market[p.symbol].price, "session");
      const clean = !d.violations.some((v) => v.at >= d.sessionStartTick);
      if (clean) {
        d.missions.forEach((m) => {
          if (m.code === "pause1" && !m.done) {
            m.progress++;
            if (m.progress >= m.target) { m.done = true; d.practiceScore += 25; toast(d, "ok", "Mission complete: clean session (+25 practice)"); }
          }
        });
      }
      d.session += 1;
      d.sessionStartTick = d.now;
      d.sessionStartEquity = d.equity;
      d.lock = null; d.cooldownUntil = 0; d.tiltReason = null; d.lossStreak = 0;
      d.missions = generateMissions("adherence", d.plan?.setups ?? []);
      log(d, "system", `Session ${d.session} opened. Daily limits reset. New missions generated.`);
      toast(d, "ok", `Session ${d.session} open — limits reset, fresh missions on the Practice board.`);
      return d;
    }
    case "RESOLVE_REVIEW": {
      const r = d.reviews.find((x) => x.id === action.id);
      if (!r) return d;
      d.reviews = d.reviews.filter((x) => x.id !== action.id);
      if (action.again) d.reviews.push({ ...r, dueTick: d.now + Math.max(10, Math.round(r.interval / 2)) });
      else {
        r.reps += 1; r.interval = Math.round(r.interval * 2);
        if (r.reps < 4) d.reviews.push({ ...r, dueTick: d.now + r.interval });
        else { d.practiceScore += 15; toast(d, "ok", "Pattern retired — it survived 4 reviews (+15 practice)."); }
      }
      return d;
    }
    case "DISMISS_TOAST": { d.toasts = d.toasts.filter((t) => t.id !== action.id); return d; }
    case "RESET_ALL": { safeRemove(LS_KEY); return freshState(); }
    case "OPEN_TOUR": { d.tourOpen = action.open; return d; }
    case "TOUR_FINISHED": { d.tourOpen = false; d.tourDone = true; return d; }
    case "SET_INDICATORS": { d.indicators = sanitizeIndicators(action.indicators); return d; }
    case "ACK_TRADE_DISCLAIMER": { d.tradeDisclaimerShown = true; return d; }
  }
}

/* --------------------------- order engine --------------------------- */
function placeOrder(d: AppState, a: Extract<Action, { type: "PLACE_ORDER" }>): AppState {
  if (rateLimited("placeOrder", 6, 60_000).limited) { toast(d, "warn", "Rate limit: max 6 orders per minute. Slow is smooth."); return d; }
  const gate = gateCheck(d);
  if (!gate.ok) { toast(d, "warn", gate.reason); return d; }
  const plan = d.plan!;
  const meta = assetMeta(a.symbol);
  const m = d.market[a.symbol];
  if (!m) return d;

  const setup = sanitizeText(a.setup, 40) || "—";
  const checkin: Checkin = { ...a.checkin, thesis: sanitizeText(a.checkin.thesis, 400) };

  /* rule enforcement — server mirrors this exactly (server/scoring) */
  if (plan.forbidden.includes("no-stop") && !a.stop) {
    toast(d, "down", "Blocked by your plan: entering without a hard stop is forbidden.");
    addViolation(d, "Forbidden action", "Attempted entry without a stop.");
    return d;
  }
  const last = d.trades[d.trades.length - 1];
  if (plan.forbidden.includes("revenge") && last && last.pnl < 0 && Date.now() - last.exitTs < 90_000) {
    addViolation(d, "Forbidden action", "Re-entered under 90s after a stop-out.");
  }

  const refPx = a.orderType === "market" ? m.price : a.trigger ?? m.price;
  const riskPerShare = a.stop ? Math.abs(refPx - a.stop) : 0;
  const plannedRisk$ = (plan.riskPerTradePct / 100) * d.equity;
  const risk$ = riskPerShare * a.qty;
  const openRisk = d.positions.reduce((s, p) => s + p.riskAmount, 0);

  if (risk$ > plannedRisk$ * 1.05 && !a.override) {
    toast(d, "down", "Order rejected by the risk engine: size exceeds plan risk. Use the sizing button or acknowledge the break.");
    return d;
  }
  if (a.override) addViolation(d, "Sizing above plan risk", `${a.symbol} risk $${risk$.toFixed(0)} vs plan $${plannedRisk$.toFixed(0)} — acknowledged override.`);
  if (openRisk + risk$ > (plan.maxOpenRiskPct / 100) * d.equity) {
    toast(d, "down", "Max open risk reached — no new positions until something closes.");
    return d;
  }
  if (d.positions.length >= plan.maxPositions && !d.positions.some((p) => p.symbol === a.symbol)) {
    toast(d, "down", `Position limit (${plan.maxPositions}) reached.`);
    return d;
  }

  /* missions: exact sizing + declared setups */
  d.missions.forEach((mi) => {
    if (mi.done) return;
    if (mi.code === "size3" && !a.override && risk$ > 0 && Math.abs(risk$ - plannedRisk$) <= plannedRisk$ * 0.15) {
      mi.progress++;
      if (mi.progress >= mi.target) { mi.done = true; d.practiceScore += 25; toast(d, "ok", `Mission complete: ${mi.title} (+25 practice)`); }
    }
    if (mi.code === "setup3" && plan.setups.includes(setup)) {
      mi.progress++;
      if (mi.progress >= mi.target) { mi.done = true; d.practiceScore += 25; toast(d, "ok", `Mission complete: ${mi.title} (+25 practice)`); }
    }
  });

  if (a.orderType === "market") {
    const fill = simulateFill(d, a.symbol, a.side, a.qty, m.price);
    if (fill.rejected) { toast(d, "down", `Order rejected by the ${a.symbol} book (liquidity dry-up). Try again.`); return d; }
    applyEntry(d, { symbol: a.symbol, side: a.side, qty: fill.qty, stop: a.stop, target: a.target, riskAmount: risk$ * (fill.qty / a.qty), setup, checkin, override: a.override }, fill.px, fill.qty, fill.fees);
    if (fill.partial) toast(d, "warn", `Partial fill ${fill.qty}/${a.qty} — remainder cancelled (liquidity).`);
  } else {
    const order: Order = { id: nid("o"), symbol: a.symbol, type: a.orderType, side: a.side, qty: a.qty, trigger: refPx, stop: a.stop, target: a.target, setup, checkin, override: a.override, placedTick: d.now };
    d.orders.push(order);
    log(d, "system", `${a.orderType.toUpperCase()} parked: ${a.side} ${a.qty} ${a.symbol} @ ${refPx.toFixed(2)}`);
    toast(d, "info", `${a.orderType} order working: ${a.side} ${a.qty} ${a.symbol} @ ${refPx.toFixed(2)}`);
  }
  recomputeEquity(d);
  return d;
}

function simulateFill(d: AppState, symbol: string, side: Side, qty: number, px: number): { px: number; qty: number; fees: number; partial: boolean; rejected: boolean } {
  const meta = assetMeta(symbol);
  const rnd = mulberry32((d.seed ^ (d.now * 2654435761)) >>> 0);
  const f = d.friction;
  if (f === "easy") return { px, qty, fees: 0, partial: false, rejected: false };
  const stress = d.market[symbol].stress;
  const adverse = side === "long" ? 1 : -1;
  let slip = meta.vol * px * (f === "brutal" ? 0.22 : 0.12) * (1 + qty / 500) * (stress ? 1.8 : 1);
  slip *= 0.5 + rnd();
  const fillPx = Math.max(0.01, px + adverse * slip);
  let fees = 0;
  if (f === "brutal") fees = meta.kind === "crypto" ? fillPx * qty * 0.0006 : Math.max(1, qty * 0.005);
  let rejected = false;
  if (f === "brutal" && stress && rnd() < 0.06) rejected = true;
  let fillQty = qty;
  let partial = false;
  if (!rejected && qty >= 50 && rnd() < (f === "brutal" ? 0.14 : 0.07)) {
    fillQty = Math.max(1, Math.round(qty * 0.7));
    partial = true;
  }
  return { px: fillPx, qty: fillQty, fees, partial, rejected };
}

function applyEntry(
  d: AppState,
  spec: { symbol: string; side: Side; qty: number; stop: number | null; target: number | null; riskAmount: number; setup: string; checkin: Checkin; override: boolean },
  px: number, qty: number, fees: number,
) {
  const m = d.market[spec.symbol];
  const existing = d.positions.find((p) => p.symbol === spec.symbol);
  if (existing) {
    if (d.plan?.forbidden.includes("avg-down")) addViolation(d, "Forbidden action", `Averaged into ${spec.symbol} — plan forbids it.`);
    const totalQty = existing.qty + qty;
    existing.avgEntry = (existing.avgEntry * existing.qty + px * qty) / totalQty;
    existing.qty = totalQty;
    existing.riskAmount += spec.riskAmount;
    existing.riskPct = d.equity > 0 ? (existing.riskAmount / d.equity) * 100 : 0;
    existing.fees += fees;
  } else {
    d.positions.push({
      id: nid("p"), symbol: spec.symbol, side: spec.side, qty, avgEntry: px,
      stop: spec.stop, target: spec.target, openedTick: d.now, openedTs: Date.now(),
      riskAmount: Math.max(1, spec.riskAmount),
      riskPct: d.equity > 0 ? (Math.max(1, spec.riskAmount) / d.equity) * 100 : 0,
      setup: spec.setup, checkin: spec.checkin, override: spec.override,
      fees, stressHits: 0, stopMovedWorse: false, regime: m.regime,
    });
  }
  d.cash += spec.side === "long" ? -px * qty : px * qty;
  d.cash -= fees;
  log(d, "fill", `Filled ${spec.side} ${qty} ${spec.symbol} @ ${px.toFixed(2)}${fees > 0 ? ` · fees $${fees.toFixed(2)}` : ""}`);
  toast(d, "ok", `${spec.side === "long" ? "Bought" : "Sold"} ${qty} ${spec.symbol} @ ${px.toFixed(2)}`);
}

function closePosition(d: AppState, pos: Position, px: number, reason: Trade["exitReason"]) {
  const dir = pos.side === "long" ? 1 : -1;
  const exitFees = d.friction === "brutal"
    ? (assetMeta(pos.symbol).kind === "crypto" ? px * pos.qty * 0.0006 : Math.max(1, pos.qty * 0.005))
    : 0;
  const gross = (px - pos.avgEntry) * pos.qty * dir;
  const net = gross - exitFees;
  const r = net / Math.max(1, pos.riskAmount);
  const trade: Trade = {
    id: nid("tr"), symbol: pos.symbol, side: pos.side, qty: pos.qty,
    entry: pos.avgEntry, exit: px, entryTick: pos.openedTick, exitTick: d.now,
    entryTs: pos.openedTs, exitTs: Date.now(),
    pnl: net, fees: pos.fees + exitFees, r, riskAmount: pos.riskAmount, riskPct: pos.riskPct,
    setup: pos.setup, exitReason: reason, checkin: pos.checkin, override: pos.override,
    violations: d.violations.filter((v) => v.at >= pos.openedTick).map((v) => v.rule),
    friction: d.friction, regime: pos.regime, stressHits: pos.stressHits, journal: null,
  };
  d.trades.push(trade);
  d.positions = d.positions.filter((p) => p.id !== pos.id);
  d.cash += pos.side === "long" ? px * pos.qty : -px * pos.qty;
  d.cash -= exitFees;
  d.journalDue.push(trade.id);
  if (net < 0) d.lossStreak += 1; else d.lossStreak = 0;
  if (pos.stressHits > 0 && reason !== "stop" && net >= 0) {
    d.stressSurvived += 1; d.practiceScore += 10;
    toast(d, "ok", `Stress survived on ${pos.symbol} — stop held (+10 practice).`);
  }
  log(d, "fill", `Closed ${pos.symbol} @ ${px.toFixed(2)} · ${net >= 0 ? "+" : ""}$${net.toFixed(0)} (${r >= 0 ? "+" : ""}${r.toFixed(2)}R) · ${reason}`);
  toast(d, net >= 0 ? "ok" : "down", `${pos.symbol} closed: ${net >= 0 ? "+" : ""}$${net.toFixed(0)} (${r >= 0 ? "+" : ""}${r.toFixed(2)}R). Journal required.`);
  recomputeEquity(d);
  runTiltCheck(d);
}

/* ------------------------------- tick ------------------------------- */
function tick(prev: AppState): AppState {
  const d = prev;
  d.now += 1;
  const rnd = mulberry32((d.seed ^ (d.now * 40503)) >>> 0);

  for (const a of ASSETS) {
    const m = d.market[a.symbol];
    let stress = m.stress;
    let dir = m.drift;
    let volMul = 1;
    if (stress) {
      dir = stress.dir * a.vol * 0.55; volMul = 2.4;
      stress = stress.left <= 1 ? null : { ...stress, left: stress.left - 1 };
      if (!stress && m.stress) {
        log(d, "event", `Stress event on ${a.symbol} exhausted.`);
      }
    } else if (rnd() < 0.004) {
      m.drift = (rnd() - 0.5) * a.vol * 0.16; dir = m.drift;
    }
    const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
    const price = Math.max(a.base * 0.15, m.price + dir * m.price + g * a.vol * m.price * 0.32 * volMul);
    const candles = m.candles.slice();
    const lastC = { ...candles[candles.length - 1] };
    lastC.c = price; lastC.h = Math.max(lastC.h, price); lastC.l = Math.min(lastC.l, price);
    lastC.v += Math.round(rnd() * 90);
    candles[candles.length - 1] = lastC;
    if (d.now % CANDLE_TICKS === 0) {
      candles.push({ o: price, h: price, l: price, c: price, v: Math.round(rnd() * 200) });
      if (candles.length > 240) candles.shift();
    }
    d.market[a.symbol] = { ...m, candles, price, stress, regime: d.now % CANDLE_TICKS === 0 ? regimeLocal(candles) : m.regime };
  }

  /* stress injection into live positions */
  if (d.stressMode && d.positions.length > 0 && !d.lock && rnd() < 0.006) {
    const victim = d.positions[Math.floor(rnd() * d.positions.length)];
    const mm = d.market[victim.symbol];
    if (!mm.stress) {
      const dir = (victim.side === "long" ? -1 : 1) as 1 | -1;
      d.market[victim.symbol] = { ...mm, stress: { dir, left: 8 } };
      d.stressSeen += 1;
      d.positions.filter((p) => p.symbol === victim.symbol).forEach((p) => { p.stressHits += 1; });
      log(d, "event", `STRESS EVENT: ${victim.symbol} moving against you. Hold the process.`);
      toast(d, "warn", `Stress injection on ${victim.symbol} — adverse move incoming. Don't touch the stop.`);
    }
  }

  /* news wire */
  if (d.now - d.lastNewsTick > 40 && rnd() < 0.05) {
    d.lastNewsTick = d.now;
    const a = ASSETS[Math.floor(rnd() * ASSETS.length)];
    const impact: "up" | "down" = rnd() < 0.5 ? "up" : "down";
    d.news = [{ id: nid("n"), symbol: a.symbol, headline: pickHeadline(a.symbol, impact, rnd), impact, tick: d.now, ts: Date.now() }, ...d.news].slice(0, 14);
    const mm = d.market[a.symbol];
    const kick = (impact === "up" ? 1 : -1) * a.vol * mm.price * (1.5 + rnd() * 2);
    d.market[a.symbol] = { ...mm, price: Math.max(a.base * 0.15, mm.price + kick), drift: mm.drift + (impact === "up" ? 1 : -1) * a.vol * 0.05 };
    log(d, "event", `News: ${a.symbol} ${impact === "up" ? "bullish" : "bearish"} headline hit the tape.`);
    toast(d, "info", `${a.symbol}: ${d.news[0].headline}`);
  }

  /* resting orders */
  for (const o of [...d.orders]) {
    const px = d.market[o.symbol].price;
    const hit = o.type === "limit"
      ? (o.side === "long" ? px <= o.trigger : px >= o.trigger)
      : (o.side === "long" ? px <= o.trigger : px >= o.trigger);
    if (!hit) continue;
    d.orders = d.orders.filter((x) => x.id !== o.id);
    const fill = simulateFill(d, o.symbol, o.side, o.qty, px);
    if (fill.rejected) { log(d, "event", `Triggered ${o.symbol} order rejected (liquidity).`); continue; }
    const riskPerShare = o.stop ? Math.abs(o.trigger - o.stop) : 0;
    applyEntry(d, { symbol: o.symbol, side: o.side, qty: fill.qty, stop: o.stop, target: o.target, riskAmount: riskPerShare * fill.qty, setup: o.setup, checkin: o.checkin, override: o.override }, fill.px, fill.qty, fill.fees);
  }

  /* brackets: stops & targets */
  for (const pos of [...d.positions]) {
    const m = d.market[pos.symbol];
    if (pos.side === "long") {
      if (pos.stop !== null && m.price <= pos.stop) closePosition(d, pos, pos.stop, "stop");
      else if (pos.target !== null && m.price >= pos.target) closePosition(d, pos, pos.target, "target");
    } else {
      if (pos.stop !== null && m.price >= pos.stop) closePosition(d, pos, pos.stop, "stop");
      else if (pos.target !== null && m.price <= pos.target) closePosition(d, pos, pos.target, "target");
    }
  }

  recomputeEquity(d);

  /* daily-loss circuit breaker */
  if (d.plan && !d.lock) {
    const loss = d.sessionStartEquity - d.equity;
    const limit = (d.plan.maxDailyLossPct / 100) * d.sessionStartEquity;
    if (loss >= limit && d.sessionStartEquity > 0) {
      d.lock = { reason: `Daily loss limit hit: −$${loss.toFixed(0)} (limit −$${limit.toFixed(0)}).`, loss };
      d.breaches += 1;
      addViolation(d, "Daily loss limit", `Breached the ${d.plan.maxDailyLossPct}% circuit breaker.`);
      toast(d, "down", "CIRCUIT BREAKER — daily loss limit reached. Trading locked.");
    }
  }
  return d;
}

function regimeLocal(candles: { o: number; h: number; l: number; c: number }[]): MarketState["regime"] {
  const last = candles.slice(-24);
  if (last.length < 24) return "range";
  const first = last.slice(0, 12).reduce((s, c) => s + c.c, 0) / 12;
  const second = last.slice(12).reduce((s, c) => s + c.c, 0) / 12;
  const move = (second - first) / first;
  if (Math.abs(move) > 0.004) return move > 0 ? "trend-up" : "trend-down";
  const body = last.reduce((s, c) => s + Math.abs(c.c - c.o), 0);
  const wick = last.reduce((s, c) => s + (c.h - c.l) - Math.abs(c.c - c.o), 0);
  return wick > body * 1.9 ? "chop" : "range";
}

/* ----------------------------- context ------------------------------ */
const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    const iv = setInterval(() => dispatch({ type: "TICK" }), TICK_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    try {
      const { market: _m, toasts: _t, ...rest } = state;
      writeTable(LS_KEY, rest);
    } catch { /* storage full */ }
  }, [state]);

  /* CSRF: every sensitive action is stamped before it reaches the reducer. */
  const guardedDispatch = useCallback((action: Action) => {
    if (CSRF_SENSITIVE.has(action.type)) {
      (action as Action & { _csrf?: string })._csrf = issueCsrfToken();
    }
    dispatch(action);
  }, []);

  return <Ctx.Provider value={{ state, dispatch: guardedDispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function hardReset() {
  safeRemove(LS_KEY);
  window.location.reload();
}
