/* =====================================================================
   DeliberateTrade store - market loop, order engine, risk enforcement,
   tilt detection wiring, journals, missions. All state changes flow
   through one reducer with a CSRF checkpoint; scores are derived, never
   stored, and can't be dispatched.
   ===================================================================== */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  type Dispatch, type ReactNode,
} from "react";
import {
  ASSETS, assetMeta,
  type ActiveIndicator,
  type Checkin, type FrictionMode, type Journal, type LogEntry, type LogKind,
  type MarketState, type Mission, type NewsItem, type Order, type Plan,
  type PlanVersion, type Position, type Review, type Side, type Toast, type Trade,
  type Violation,
} from "./types";
import { createMarket, mulberry32, pickHeadline, stepMarket } from "./market";
import { buildDebrief, detectTiltSignals, generateMissions, TILT_META } from "./coaching";
import { deepClone, nid, num, str, arr, obj, bool, safeGet, safeRemove } from "./safe";
import { writeTable } from "./db";
import { journalGate, journalQualityScore } from "./journalQuality";
import { sanitizeText, rateLimited } from "./auth";
import { isValidCsrfToken, issueCsrfToken } from "./csrf";
import { defaultIndicators, defOf, INDICATOR_DEFS } from "./indicators";
import { isAdminSession } from "./admin";

const LS_KEY = "dt:store:v2";
export const TICK_MS = 850;

/* ------------------------------ state ------------------------------- */
export interface AppState {
  name: string;
  plan: Plan | null;
  planHistory: PlanVersion[];
  friction: FrictionMode;
  stressMode: boolean;
  cash: number; equity: number; peakEquity: number; sessionStartEquity: number;
  session: number; sessionStartTick: number;
  positions: Position[]; orders: Order[]; trades: Trade[];
  reviews: Review[]; missions: Mission[]; practiceScore: number;
  violations: Violation[]; news: NewsItem[]; log: LogEntry[]; toasts: Toast[];
  journalDue: string[];
  lock: { reason: string; loss: number } | null;
  cooldownUntil: number; tiltReason: string | null;
  breaches: number; stressSeen: number; stressSurvived: number; lossStreak: number;
  tiltHandled: string[];
  tourDone: boolean; tourOpen: boolean;
  legalAcceptedAt: number; tradeDisclaimerShown: boolean;
  indicators: ActiveIndicator[];
  market: Record<string, MarketState>;
  seed: number; now: number; lastNewsTick: number; selected: string;
  hydrated: boolean;
}

export type Action =
  | { type: "TICK" }
  | { type: "SELECT"; symbol: string }
  | { type: "CREATE_PLAN"; plan: Plan; name: string; friction: FrictionMode; legalAcceptedAt: number }
  | { type: "AMEND_PLAN"; plan: Plan; reason: string }
  | { type: "SET_FRICTION"; mode: FrictionMode }
  | { type: "TOGGLE_STRESS" }
  | { type: "PLACE_ORDER"; symbol: string; orderType: "market" | "limit" | "stop"; side: Side; qty: number; trigger: number | null; stop: number | null; target: number | null; setup: string; checkin: Checkin; override: boolean }
  | { type: "CANCEL_ORDER"; id: string }
  | { type: "CLOSE_POSITION"; id: string }
  | { type: "ADJUST_BRACKET"; id: string; stop: number | null; target: number | null }
  | { type: "SUBMIT_JOURNAL"; tradeId: string; journal: Omit<Journal, "debrief" | "at" | "qualityScore"> }
  | { type: "SKIP_JOURNAL"; tradeId: string }
  | { type: "ACK_LOCK" }
  | { type: "END_SESSION" }
  | { type: "RESOLVE_REVIEW"; id: string; again: boolean }
  | { type: "DISMISS_TOAST"; id: string }
  | { type: "RESET_ALL" }
  | { type: "OPEN_TOUR"; open: boolean }
  | { type: "TOUR_FINISHED" }
  | { type: "SET_INDICATORS"; indicators: ActiveIndicator[] }
  | { type: "ACK_TRADE_DISCLAIMER" };

/* --------------------------- fresh state ---------------------------- */
function freshState(): AppState {
  return {
    name: "", plan: null, planHistory: [], friction: "realistic", stressMode: false,
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
    out.push({ uid: str(o.uid, id + "-" + out.length), id, params });
  }
  return out.length ? out : defaultIndicators();
}

function loadState(): AppState {
  const base = freshState();
  try {
    const raw = safeGet(LS_KEY);
    if (!raw) return { ...base, hydrated: true };
    const saved = obj(JSON.parse(raw));
    if (!saved) return { ...base, hydrated: true };

    const market = createMarket(num(saved.seed, base.seed));
    const symbols = new Set(Object.keys(market));

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
        thesis: str(c.thesis, "-"),
        at: num(c.at, Date.now()),
      };
    };

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
        setup: str(o.setup, "-"), checkin: checkinOf(o.checkin), override: bool(o.override),
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
            plan: str(jr.plan, "-"), whatHappened: str(jr.whatHappened, "-"),
            emotionDuring: checkinOf({ emotion: jr.emotionDuring }).emotion,
            emotionAfter: checkinOf({ emotion: jr.emotionAfter }).emotion,
            followedRules: jr.followedRules === "no" ? "no" : "yes",
            rulesNote: str(jr.rulesNote, ""), lesson: str(jr.lesson, "-"),
            setup: str(jr.setup, "-"),
            grade: (["A", "B", "C", "D"].includes(str(jr.grade, "")) ? str(jr.grade, "B") : "B") as Journal["grade"],
            qualityScore: num(jr.qualityScore, 50),
            debrief: str(jr.debrief, ""), at: num(jr.at, Date.now()),
          }
        : null;
      trades.push({
        id: str(o.id, nid("tr")), symbol: o.symbol,
        side: o.side === "short" ? "short" : "long",
        qty: num(o.qty, 1), entry: num(o.entry, 0), exit: num(o.exit, 0),
        entryTick: num(o.entryTick, 0), exitTick: num(o.exitTick, 0),
        entryTs: num(o.entryTs, Date.now()), exitTs: num(o.exitTs, Date.now()),
        pnl: num(o.pnl, 0), fees: num(o.fees, 0), r: num(o.r, 0),
        riskAmount: Math.max(1, num(o.riskAmount, 1)), riskPct: num(o.riskPct, 0),
        setup: str(o.setup, "-"),
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
      equity: 0, peakEquity: num(saved.peakEquity, 0), sessionStartEquity: 0,
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
        .map((o) => ({ id: str(o.id, nid("lg")), kind: (["fill", "risk", "event", "system", "coach"].includes(str(o.kind, "")) ? str(o.kind, "system") : "system") as LogKind, text: str(o.text, ""), tick: num(o.tick, 0), ts: num(o.ts, Date.now()) })),
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
  } catch {
    return { ...base, hydrated: true };
  }
}

/* ----------------------------- helpers ------------------------------ */
export const mtm = (p: Position, px: number) =>
  (p.side === "long" ? px - p.avgEntry : p.avgEntry - px) * p.qty;

/* ------------------------- friction model ---------------------------
   Commission and slippage are the same shape wherever they are charged,
   so they live here rather than being re-derived at each call site.
   Keep these in step with the deductions in placeFill/closePosition. */
export function commissionFor(symbol: string, px: number, qty: number, friction: FrictionMode): number {
  if (friction !== "brutal") return 0;
  const meta = assetMeta(symbol);
  return meta.kind === "crypto" ? px * qty * 0.0006 : Math.max(1, qty * 0.005);
}

export function slipPerShare(symbol: string, px: number, friction: FrictionMode): number {
  return friction === "easy" ? 0 : px * assetMeta(symbol).vol * 0.15;
}

/* What a stop-out actually costs: the stop distance PLUS the friction the
   exit will incur.

   R is meant to answer "how many units of intended risk did this trade
   cost me", and a stop-out should therefore land near -1R. Measuring only
   the stop distance broke that badly for small positions, because two of
   the three costs do not scale with size: the commission has a $1 floor
   per side, and slippage is charged per share regardless of how tight the
   stop is. A 1-share trade with a 3c stop paid ~$2 in fees and ~$0.47 of
   slippage against $0.03 of nominal risk, and reported -50R.

   Folding the round trip in makes R mean the same thing at every size,
   and keeps avg R, the Process Score and the admin console honest. */
export function trueRiskAmount(
  symbol: string, entryPx: number, stop: number | null, qty: number, friction: FrictionMode,
): number {
  if (!stop || qty <= 0) return 0;
  const nominal = Math.abs(entryPx - stop) * qty;
  const roundTripFees =
    commissionFor(symbol, entryPx, qty, friction) + commissionFor(symbol, stop, qty, friction);
  const exitSlip = slipPerShare(symbol, stop, friction) * qty;
  return nominal + roundTripFees + exitSlip;
}

function toast(d: AppState, tone: Toast["tone"], text: string): void {
  d.toasts = [...d.toasts.slice(-3), { id: nid("t"), tone, text }];
}
function log(d: AppState, kind: LogKind, text: string): void {
  d.log = [{ id: nid("lg"), kind, text, tick: d.now, ts: Date.now() }, ...d.log].slice(0, 60);
}
function addViolation(d: AppState, rule: string, detail: string): void {
  d.violations = [...d.violations, { id: nid("v"), rule, detail, at: d.now, ts: Date.now() }];
}
function recomputeEquity(d: AppState): void {
  d.equity = d.cash + d.positions.reduce((a, p) => a + mtm(p, d.market[p.symbol].price), 0);
  d.peakEquity = Math.max(d.peakEquity, d.equity);
}

export function gateCheck(d: AppState): { ok: boolean; reason: string } {
  if (!d.plan) return { ok: false, reason: "No trading plan on file." };
  // Owner session: enforcement gates stand down so features can be tested
  // freely (the plan itself is still required).
  if (isAdminSession()) return { ok: true, reason: "" };
  if (d.lock) return { ok: false, reason: "Daily loss limit breached - session locked." };
  if (d.now < d.cooldownUntil) return { ok: false, reason: "Tilt cool-down active." };
  if (d.journalDue.length > 0) return { ok: false, reason: "File the pending post-trade journal before your next order." };
  return { ok: true, reason: "" };
}

/* --------------------------- tilt wiring ---------------------------- */
function runTiltCheck(d: AppState): void {
  const signals = detectTiltSignals(d.trades, d.violations);
  const fresh = signals.filter((s) => !d.tiltHandled.includes(s.key));
  if (fresh.length === 0) return;
  d.tiltHandled = [...d.tiltHandled, ...fresh.map((f) => f.key)].slice(-120);
  const sev = fresh.reduce((a, s) => a + s.severity, 0);
  for (const s of fresh) addViolation(d, "Tilt: " + TILT_META[s.type].label, s.detail);
  if (sev >= 2) {
    if (!isAdminSession()) {
      const ticks = Math.min(240, 60 + 25 * sev);
      d.cooldownUntil = Math.max(d.cooldownUntil, d.now + ticks);
    }
    d.tiltReason = fresh.map((f) => TILT_META[f.type].label).join(" / ");
    toast(d, "down", "Tilt Detector: " + fresh.length + " signal" + (fresh.length > 1 ? "s" : "") + (isAdminSession() ? " (owner: no pause applied)." : ". Trading paused - breathe first."));
  } else {
    d.tiltReason = TILT_META[fresh[0].type].label;
    toast(d, "warn", "Tilt Detector noted: " + TILT_META[fresh[0].type].label + ". Logged to your record.");
  }
}

/* ------------------------------ reducer ----------------------------- */
const CSRF_SENSITIVE = new Set<Action["type"]>([
  "PLACE_ORDER", "SUBMIT_JOURNAL", "CREATE_PLAN", "AMEND_PLAN",
  "CLOSE_POSITION", "END_SESSION", "ADJUST_BRACKET",
]);
function csrfValid(action: Action): boolean {
  if (!CSRF_SENSITIVE.has(action.type)) return true;
  return isValidCsrfToken((action as Action & { _csrf?: string })._csrf);
}

function reducer(state: AppState, action: Action): AppState {
  const d: AppState = deepClone(state);
  if (!csrfValid(action)) {
    toast(d, "warn", "Security check failed (CSRF). The action was blocked.");
    log(d, "system", "Blocked " + action.type + ": missing or invalid CSRF token.");
    return d;
  }

  switch (action.type) {
    case "TICK": return tick(d);

    case "SELECT": { d.selected = action.symbol; return d; }

    case "CREATE_PLAN": {
      d.plan = action.plan;
      d.name = sanitizeText(action.name, 60);
      d.friction = action.friction;
      d.legalAcceptedAt = action.legalAcceptedAt;
      d.cash = action.plan.startingCapital;
      d.equity = action.plan.startingCapital;
      d.peakEquity = action.plan.startingCapital;
      d.sessionStartEquity = action.plan.startingCapital;
      d.seed = (Date.now() % 100000) + 7;
      d.market = createMarket(d.seed);
      d.missions = generateMissions("adherence", action.plan.setups);
      d.tourOpen = true;
      log(d, "system", "Plan v1 locked. The desk is open.");
      toast(d, "ok", "Plan v1 locked - welcome to your desk.");
      return d;
    }

    case "AMEND_PLAN": {
      if (rateLimited("planWrite", 5, 60_000).limited) { toast(d, "warn", "Rate limit: too many plan changes."); return d; }
      const reason = sanitizeText(action.reason, 300);
      d.planHistory = [...d.planHistory, { version: d.plan!.version, at: Date.now(), reason }];
      d.plan = {
        ...action.plan,
        note: sanitizeText(action.plan.note),
        setups: action.plan.setups.map((s) => sanitizeText(s, 40)).filter((s) => s.length > 0),
      };
      log(d, "system", "Plan amended to v" + action.plan.version + ": " + reason);
      toast(d, "ok", "Plan v" + action.plan.version + " locked. History archived.");
      return d;
    }

    case "SET_FRICTION": { d.friction = action.mode; toast(d, "info", "Friction mode: " + action.mode + "."); return d; }
    case "TOGGLE_STRESS": { d.stressMode = !d.stressMode; toast(d, "info", d.stressMode ? "Stress mode armed - expect adverse moves." : "Stress mode off."); return d; }

    case "PLACE_ORDER": { placeOrder(d, action); return d; }
    case "CANCEL_ORDER": {
      d.orders = d.orders.filter((o) => o.id !== action.id);
      toast(d, "info", "Order cancelled.");
      return d;
    }

    case "CLOSE_POSITION": { closePosition(d, action.id, "manual"); return d; }

    case "ADJUST_BRACKET": {
      const p = d.positions.find((x) => x.id === action.id);
      if (!p) return d;
      if (action.stop != null && p.stop != null) {
        const worse = p.side === "long" ? action.stop < p.stop : action.stop > p.stop;
        if (worse) {
          p.stopMovedWorse = true;
          addViolation(d, "Stop widened", p.symbol + " stop moved against the position after entry.");
          toast(d, "warn", "Stop widened - logged as a violation.");
        }
      }
      p.stop = action.stop;
      p.target = action.target;
      toast(d, "info", p.symbol + " bracket updated.");
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
      if (qualityScore < 25) { toast(d, "warn", "Journal rejected by the quality engine - write a real reflection."); return d; }
      const debrief = buildDebrief(t, d.plan, d.trades);
      t.journal = { ...action.journal, ...fields, qualityScore, debrief, at: Date.now() };
      d.journalDue = d.journalDue.filter((id) => id !== action.tradeId);
      d.practiceScore += 2;
      if (t.r < 0) {
        d.reviews = [...d.reviews, { id: nid("rv"), tradeId: t.id, dueTick: d.now + 40, interval: 40, reps: 0 }];
        d.missions.forEach((m) => {
          if (m.code === "journal2" && !m.done && qualityScore >= 50 && fields.lesson.length >= 40) {
            m.progress++;
            if (m.progress >= m.target) { m.done = true; d.practiceScore += 25; toast(d, "ok", "Mission complete: " + m.title + " (+25 practice)"); }
          }
        });
      }
      log(d, "coach", "Journal filed for " + t.symbol + " (" + (t.r >= 0 ? "+" : "") + t.r.toFixed(2) + "R). Grade " + t.journal.grade + " - quality " + qualityScore + "/100.");
      toast(d, "ok", "Journal saved - quality " + qualityScore + "/100. Coach debrief attached.");
      return d;
    }

    case "SKIP_JOURNAL": {
      // Hard guard re-checked here: dispatching this action any other way
      // does nothing unless the signed-in account is the owner's.
      if (!isAdminSession()) return d;
      const t = d.trades.find((x) => x.id === action.tradeId);
      if (!t) return d;
      d.journalDue = d.journalDue.filter((id) => id !== action.tradeId);
      t.journal = {
        plan: "-", whatHappened: "-",
        emotionDuring: t.checkin.emotion, emotionAfter: t.checkin.emotion,
        followedRules: "yes", rulesNote: "", lesson: "Skipped.",
        setup: t.setup, grade: "D", qualityScore: 0, debrief: "", at: Date.now(),
      };
      log(d, "system", "Journal skipped (owner session).");
      toast(d, "info", "Journal skipped (owner session).");
      return d;
    }

    case "ACK_LOCK": { d.lock = null; toast(d, "info", "Review acknowledged. End the session to reset the daily limit."); return d; }

    case "END_SESSION": {
      for (const p of d.positions.slice()) closePosition(d, p.id, "session");
      d.orders = [];
      d.session += 1;
      d.sessionStartTick = d.now;
      d.sessionStartEquity = d.equity;
      d.lock = null; d.cooldownUntil = 0; d.tiltReason = null; d.lossStreak = 0;
      d.missions = generateMissions("adherence", d.plan?.setups ?? []);
      log(d, "system", "Session " + d.session + " opened. Daily limits reset. New missions generated.");
      toast(d, "ok", "Session " + d.session + " open - limits reset, fresh missions on the Practice board.");
      return d;
    }

    case "RESOLVE_REVIEW": {
      const r = d.reviews.find((x) => x.id === action.id);
      if (!r) return d;
      if (action.again) {
        r.interval = Math.max(20, Math.round(r.interval * 0.5));
        r.dueTick = d.now + r.interval;
        toast(d, "info", "Rescheduled sooner - it still has something to teach you.");
      } else {
        r.reps += 1;
        r.interval = r.interval * 2;
        r.dueTick = d.now + r.interval;
        d.practiceScore += 4;
        toast(d, "ok", "Pattern re-learned (+4 practice). Next review in " + r.interval + " ticks.");
      }
      return d;
    }

    case "DISMISS_TOAST": { d.toasts = d.toasts.filter((t) => t.id !== action.id); return d; }

    case "RESET_ALL": {
      safeRemove(LS_KEY);
      return { ...freshState(), hydrated: true };
    }

    case "OPEN_TOUR": { d.tourOpen = action.open; return d; }
    case "TOUR_FINISHED": { d.tourOpen = false; d.tourDone = true; return d; }
    case "SET_INDICATORS": { d.indicators = sanitizeIndicators(action.indicators); return d; }
    case "ACK_TRADE_DISCLAIMER": { d.tradeDisclaimerShown = true; return d; }
  }
}

/* --------------------------- order engine --------------------------- */
function placeOrder(d: AppState, a: Extract<Action, { type: "PLACE_ORDER" }>): void {
  const plan = d.plan;
  if (!plan) return;
  if (rateLimited("placeOrder", 6, 60_000).limited) { toast(d, "warn", "Rate limit: max 6 orders per minute. Slow is smooth."); return; }
  const gate = gateCheck(d);
  if (!gate.ok) { toast(d, "warn", gate.reason); return; }
  const m = d.market[a.symbol];
  if (!m) return;

  const openRisk = d.positions.reduce((s, p) => s + p.riskAmount, 0);
  const refPx = a.orderType === "market" ? m.price : (a.trigger ?? m.price);
  const riskAmount = trueRiskAmount(a.symbol, refPx, a.stop, a.qty, d.friction);

  const violations: string[] = [];
  if (a.override) { addViolation(d, "Risk rule broken", "Oversized order placed with explicit acknowledgment."); violations.push("oversize"); }
  if (plan.forbidden.includes("no-stop") && !a.stop) { addViolation(d, "Forbidden: no-stop", "Order placed without a hard stop."); violations.push("no-stop"); toast(d, "down", "Blocked: your plan forbids trades without a stop."); return; }
  if (d.positions.length >= plan.maxPositions) { toast(d, "warn", "Max positions (" + plan.maxPositions + ") reached."); return; }
  if (riskAmount > 0 && openRisk + riskAmount > (plan.maxOpenRiskPct / 100) * d.equity) { toast(d, "warn", "Max open risk exceeded - close something first."); return; }

  const checkin: Checkin = { ...a.checkin, thesis: sanitizeText(a.checkin.thesis, 400) };
  const setup = sanitizeText(a.setup, 40);

  if (a.orderType !== "market") {
    d.orders = [...d.orders, {
      id: nid("o"), symbol: a.symbol, type: a.orderType, side: a.side, qty: a.qty,
      trigger: refPx, stop: a.stop, target: a.target, setup, checkin, override: a.override, createdAt: Date.now(),
    }];
    log(d, "fill", a.orderType.toUpperCase() + " order parked: " + a.side + " " + a.qty + " " + a.symbol + " @ " + refPx.toFixed(2));
    toast(d, "info", a.orderType.toUpperCase() + " order resting @ " + refPx.toFixed(2) + ".");
    return;
  }

  fillEntry(d, a.symbol, a.side, a.qty, m.price, a.stop, a.target, setup, checkin, a.override, violations);
}

function fillEntry(
  d: AppState, symbol: string, side: Side, qty: number, px: number,
  stop: number | null, target: number | null, setup: string, checkin: Checkin,
  override: boolean, violations: string[],
): void {
  const meta = assetMeta(symbol);
  let fillPx = px;
  let fees = 0;
  if (d.friction !== "easy") {
    const slip = px * meta.vol * (d.friction === "brutal" ? 0.35 : 0.18);
    fillPx = side === "long" ? px + slip : px - slip;
  }
  if (d.friction === "brutal") fees = meta.kind === "crypto" ? fillPx * qty * 0.0006 : Math.max(1, qty * 0.005);

  const cost = fillPx * qty + fees;
  if (cost > d.cash) { toast(d, "warn", "Not enough cash for that fill."); return; }
  d.cash -= cost;

  const riskAmount = trueRiskAmount(symbol, fillPx, stop, qty, d.friction);
  d.positions = [...d.positions, {
    id: nid("p"), symbol, side, qty, avgEntry: fillPx, stop, target,
    openedTick: d.now, openedTs: Date.now(),
    riskAmount, riskPct: d.equity > 0 ? (riskAmount / d.equity) * 100 : 0,
    setup, checkin, override, fees, stressHits: 0, stopMovedWorse: false,
    regime: d.market[symbol].regime,
  }];
  recomputeEquity(d);
  log(d, "fill", "FILLED " + side.toUpperCase() + " " + qty + " " + symbol + " @ " + fillPx.toFixed(2) + (fees ? " (fees $" + fees.toFixed(2) + ")" : ""));
  toast(d, "ok", side.toUpperCase() + " " + qty + " " + symbol + " filled @ " + fillPx.toFixed(2) + ".");
}

function closePosition(d: AppState, id: string, reason: Trade["exitReason"]): void {
  const i = d.positions.findIndex((p) => p.id === id);
  if (i < 0) return;
  const pos = d.positions[i];
  const m = d.market[pos.symbol];
  let px = m.price;
  if (d.friction !== "easy") px = pos.side === "long" ? px - px * assetMeta(pos.symbol).vol * 0.15 : px + px * assetMeta(pos.symbol).vol * 0.15;
  const fees = commissionFor(pos.symbol, px, pos.qty, d.friction);

  const gross = mtm(pos, px);
  /* Both sides of the round trip. The entry commission left cash when the
     position opened, so equity already reflects it - but `pnl` is a pure
     reporting field, and omitting it understated every trade's true cost
     and flattered R by the same amount. */
  const net = gross - fees - pos.fees;
  const r = pos.riskAmount > 0 ? net / pos.riskAmount : 0;

  d.cash += px * pos.qty;
  d.positions = d.positions.filter((p) => p.id !== id);

  const trade: Trade = {
    id: nid("tr"), symbol: pos.symbol, side: pos.side, qty: pos.qty,
    entry: pos.avgEntry, exit: px, entryTick: pos.openedTick, exitTick: d.now,
    entryTs: pos.openedTs, exitTs: Date.now(),
    pnl: net, fees: fees + pos.fees, r, riskAmount: pos.riskAmount, riskPct: pos.riskPct,
    setup: pos.setup, exitReason: reason, checkin: pos.checkin, override: pos.override,
    violations: pos.stopMovedWorse ? ["stop-widened"] : [],
    friction: d.friction, regime: m.regime, stressHits: pos.stressHits,
    journal: null,
  };
  d.trades = [...d.trades, trade];
  d.journalDue = [...d.journalDue, trade.id];

  if (net < 0) d.lossStreak += 1; else d.lossStreak = 0;
  if (pos.stressHits > 0 && reason !== "stop") d.stressSurvived += 1;

  d.missions.forEach((mi) => {
    if (!mi.done && mi.code === "size3" && !pos.override && pos.riskPct > 0 && d.plan && Math.abs(pos.riskPct - d.plan.riskPerTradePct) < 0.35) {
      mi.progress++;
      if (mi.progress >= mi.target) { mi.done = true; d.practiceScore += 25; toast(d, "ok", "Mission complete: " + mi.title + " (+25 practice)"); }
    }
    if (!mi.done && mi.code === "setup3" && d.plan?.setups.includes(pos.setup)) {
      mi.progress++;
      if (mi.progress >= mi.target) { mi.done = true; d.practiceScore += 25; toast(d, "ok", "Mission complete: " + mi.title + " (+25 practice)"); }
    }
  });

  log(d, "fill", "Closed " + pos.symbol + " @ " + px.toFixed(2) + " - " + (net >= 0 ? "+" : "") + "$" + net.toFixed(0) + " (" + (r >= 0 ? "+" : "") + r.toFixed(2) + "R) - " + reason);
  toast(d, net >= 0 ? "ok" : "down", pos.symbol + " closed: " + (net >= 0 ? "+" : "") + "$" + net.toFixed(0) + " (" + (r >= 0 ? "+" : "") + r.toFixed(2) + "R). Journal required.");
  recomputeEquity(d);
  runTiltCheck(d);
}

/* ------------------------------- tick ------------------------------- */
function tick(d: AppState): AppState {
  d.now += 1;
  const rnd = mulberry32((d.seed ^ (d.now * 40503)) >>> 0);

  for (const a of ASSETS) {
    const m = d.market[a.symbol];
    const hadStress = !!m.stress;

    // stress injection against open positions
    if (d.stressMode && !m.stress && d.positions.some((p) => p.symbol === a.symbol) && rnd() < 0.006) {
      const pos = d.positions.find((p) => p.symbol === a.symbol)!;
      m.stress = { left: 6, dir: pos.side === "long" ? -1 : 1 };
      d.stressSeen += 1;
      pos.stressHits += 1;
      log(d, "event", "STRESS EVENT - adverse move injected into " + a.symbol + ".");
      toast(d, "warn", "STRESS EVENT - adverse move against your " + a.symbol + " position. Hold the stop.");
    }

    stepMarket(m, a, rnd);

    if (hadStress && !m.stress) {
      const pos = d.positions.find((p) => p.symbol === a.symbol);
      if (pos) toast(d, "ok", a.symbol + " stress passed - position intact.");
    }
  }

  // resting orders
  for (const o of d.orders.slice()) {
    const px = d.market[o.symbol].price;
    const hit = o.type === "limit"
      ? (o.side === "long" ? px <= o.trigger : px >= o.trigger)
      : (o.side === "long" ? px >= o.trigger : px <= o.trigger);
    if (hit) {
      d.orders = d.orders.filter((x) => x.id !== o.id);
      fillEntry(d, o.symbol, o.side, o.qty, px, o.stop, o.target, o.setup, o.checkin, o.override, []);
    }
  }

  // bracket fills
  for (const p of d.positions.slice()) {
    const px = d.market[p.symbol].price;
    const dir = p.side === "long" ? 1 : -1;
    if (p.stop != null && (px - p.stop) * dir <= 0) closePosition(d, p.id, "stop");
    else if (p.target != null && (p.target - px) * dir <= 0) closePosition(d, p.id, "target");
  }

  // occasional news
  if (d.now - d.lastNewsTick > 30 && rnd() < 0.03) {
    d.lastNewsTick = d.now;
    const a = ASSETS[Math.floor(rnd() * ASSETS.length)];
    const impact: "up" | "down" = rnd() < 0.5 ? "up" : "down";
    const m = d.market[a.symbol];
    const jump = m.price * a.vol * (impact === "up" ? 1.6 : -1.6);
    m.price = Math.max(a.base * 0.15, m.price + jump);
    const last = m.candles[m.candles.length - 1];
    last.c = m.price; last.h = Math.max(last.h, m.price); last.l = Math.min(last.l, m.price);
    d.news = [{ id: nid("n"), symbol: a.symbol, headline: pickHeadline(a.symbol, impact, rnd), impact, tick: d.now, ts: Date.now() }, ...d.news].slice(0, 14);
    log(d, "event", a.symbol + ": " + d.news[0].headline);
    toast(d, impact === "up" ? "ok" : "warn", a.symbol + ": " + (impact === "up" ? "bullish" : "bearish") + " headline moving the tape.");
  }

  recomputeEquity(d);

  /* daily-loss circuit breaker - owner sessions never lock */
  if (d.plan && !d.lock) {
    const loss = d.sessionStartEquity - d.equity;
    const limit = (d.plan.maxDailyLossPct / 100) * d.sessionStartEquity;
    if (loss >= limit && d.sessionStartEquity > 0) {
      d.breaches += 1;
      addViolation(d, "Daily loss limit", "Breached the " + d.plan.maxDailyLossPct + "% circuit breaker.");
      if (!isAdminSession()) {
        d.lock = { reason: "Daily loss limit hit: -$" + loss.toFixed(0) + " (limit -$" + limit.toFixed(0) + ").", loss };
        toast(d, "down", "CIRCUIT BREAKER - daily loss limit reached. Trading locked.");
      } else {
        toast(d, "warn", "Daily loss limit breached - recorded, but owner session stays unlocked.");
      }
    }
  }
  return d;
}

/* ------------------------------ context ----------------------------- */
interface Ctx { state: AppState; dispatch: Dispatch<Action> }
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, loadState);

  /* CSRF stamping: every sensitive action carries the session token. */
  const dispatch = useCallback((action: Action) => {
    if (CSRF_SENSITIVE.has(action.type)) {
      (action as Action & { _csrf?: string })._csrf = issueCsrfToken();
    }
    rawDispatch(action);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => rawDispatch({ type: "TICK" }), TICK_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      const { market: _m, toasts: _t, ...rest } = state;
      writeTable(LS_KEY, rest);
    } catch { /* storage full */ }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used within AppProvider");
  return c;
}

export function hardReset(): void {
  safeRemove(LS_KEY);
  window.location.reload();
}
