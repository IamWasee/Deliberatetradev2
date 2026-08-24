/* =====================================================================
   DeliberateTrade store — market loop, order engine, risk enforcement,
   journals. All state flows through one reducer. Owner sessions
   (abdullahwasee86@gmail.com) stand the enforcement gates down.
   ===================================================================== */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  type Dispatch, type ReactNode,
} from "react";
import {
  ASSETS, assetMeta, buildDebrief, createMarket, emotionLabel, isAdminEmail,
  journalGate, journalQualityScore, mulberry32, stepMarket,
  type Checkin, type EmotionTag, type Journal, type MarketState, type Plan,
  type Position, type Side, type Toast, type Trade, type Violation,
} from "./engine";

const LS_KEY = "dt:store:v3";
const LS_EMAIL = "dt:active_email";
export const TICK_MS = 850;

/* ------------------------------ state ------------------------------- */
export interface AppState {
  email: string | null;
  plan: Plan;
  cash: number; equity: number; sessionStartEquity: number;
  market: Record<string, MarketState>;
  positions: Position[]; trades: Trade[]; violations: Violation[];
  selected: string; now: number; seed: number;
  toasts: Toast[]; journalDue: string[];
  lock: { reason: string; loss: number } | null;
  stressMode: boolean; stressSeen: number; stressSurvived: number;
  lossesThisSession: number;
  hydrated: boolean;
}

export type Action =
  | { type: "TICK" }
  | { type: "SIGN_IN"; email: string }
  | { type: "SIGN_OUT" }
  | { type: "SELECT"; symbol: string }
  | { type: "PLACE_ORDER"; symbol: string; side: Side; qty: number; stop: number | null; target: number | null; setup: string; checkin: Checkin; override: boolean }
  | { type: "CLOSE_POSITION"; id: string }
  | { type: "ADJUST_BRACKET"; id: string; stop: number | null; target: number | null }
  | { type: "SUBMIT_JOURNAL"; tradeId: string; journal: Omit<Journal, "debrief" | "at" | "qualityScore"> }
  | { type: "SKIP_JOURNAL"; tradeId: string }
  | { type: "ACK_LOCK" }
  | { type: "TOGGLE_STRESS" }
  | { type: "DISMISS_TOAST"; id: string };

/* ------------------------------ helpers ----------------------------- */
let n = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${(n++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function deepClone<T>(v: T): T {
  try { if (typeof structuredClone === "function") return structuredClone(v); } catch { /* fall through */ }
  return JSON.parse(JSON.stringify(v)) as T;
}
function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* full */ } }
function safeRemove(k: string): void { try { localStorage.removeItem(k); } catch { /* blocked */ } }

export function toast(d: AppState, tone: Toast["tone"], text: string): void {
  d.toasts = [...d.toasts.slice(-3), { id: nid("t"), tone, text }];
}
export function addViolation(d: AppState, rule: string, detail: string): void {
  d.violations = [...d.violations, { id: nid("v"), rule, detail, ts: Date.now() }];
}

export const mtm = (p: Position, px: number) =>
  (p.side === "long" ? px - p.avgEntry : p.avgEntry - px) * p.qty;

export const isOwner = (email: string | null | undefined) => isAdminEmail(email);
export const sessionIsOwner = () => isAdminEmail(safeGet(LS_EMAIL));

function recomputeEquity(d: AppState): void {
  d.equity = d.cash + d.positions.reduce((a, p) => a + mtm(p, d.market[p.symbol].price), 0);
}

export function gateCheck(d: AppState): { ok: boolean; reason: string } {
  // Owner session: gates stand down so features stay testable at any drawdown.
  if (isOwner(d.email)) return { ok: true, reason: "" };
  if (d.lock) return { ok: false, reason: "Daily loss limit breached — session locked." };
  if (d.journalDue.length > 0) return { ok: false, reason: "File the pending post-trade journal before your next order." };
  return { ok: true, reason: "" };
}

/* --------------------------- fresh state ---------------------------- */
const DEFAULT_PLAN: Plan = {
  version: 1, startingCapital: 25000, riskPerTradePct: 1, maxDailyLossPct: 3,
  setups: ["Breakout", "Pullback", "Reversal", "Range fade"],
};

function freshState(): AppState {
  return {
    email: null, plan: DEFAULT_PLAN,
    cash: DEFAULT_PLAN.startingCapital, equity: DEFAULT_PLAN.startingCapital,
    sessionStartEquity: DEFAULT_PLAN.startingCapital,
    market: createMarket(1),
    positions: [], trades: [], violations: [],
    selected: "NVDA", now: 0, seed: 1,
    toasts: [], journalDue: [], lock: null,
    stressMode: false, stressSeen: 0, stressSurvived: 0, lossesThisSession: 0,
    hydrated: false,
  };
}

function loadState(): AppState {
  const base = freshState();
  try {
    const raw = safeGet(LS_KEY);
    const savedEmail = safeGet(LS_EMAIL);
    if (!raw) {
      base.email = savedEmail;
      base.hydrated = true;
      return base;
    }
    const saved = JSON.parse(raw) as Partial<AppState>;
    base.email = savedEmail ?? null;
    base.cash = typeof saved.cash === "number" ? saved.cash : base.cash;
    base.plan = saved.plan ?? base.plan;
    base.positions = Array.isArray(saved.positions) ? saved.positions as Position[] : [];
    base.trades = Array.isArray(saved.trades) ? saved.trades as Trade[] : [];
    base.violations = Array.isArray(saved.violations) ? saved.violations as Violation[] : [];
    base.journalDue = Array.isArray(saved.journalDue)
      ? (saved.journalDue as string[]).filter((id) => !(base.trades.find((t) => t.id === id)?.journal))
      : [];
    base.stressMode = saved.stressMode === true;
    base.selected = typeof saved.selected === "string" && base.market[saved.selected] ? saved.selected : "NVDA";
    recomputeEquity(base);
    base.sessionStartEquity = base.equity;
    base.hydrated = true;
    return base;
  } catch {
    base.hydrated = true;
    return base;
  }
}

/* --------------------------- order engine --------------------------- */
function placeOrder(d: AppState, a: Extract<Action, { type: "PLACE_ORDER" }>): void {
  const m = d.market[a.symbol];
  const meta = assetMeta(a.symbol);
  const px = m.price;
  const gate = gateCheck(d);
  if (!gate.ok) { toast(d, "warn", gate.reason); return; }
  if (d.positions.some((p) => p.symbol === a.symbol)) { toast(d, "warn", `Already holding ${a.symbol}. One position per symbol.`); return; }

  const violations: string[] = [];
  if (a.override) {
    addViolation(d, "Risk rule broken", `Oversized ${a.symbol} order placed with explicit acknowledgment.`);
    violations.push("oversize");
  }
  if (!a.stop) {
    addViolation(d, "No stop-loss", `${a.symbol} ${a.side} opened without a hard stop.`);
    violations.push("no-stop");
  }

  const dir = a.side === "long" ? 1 : -1;
  const riskPerShare = a.stop ? Math.abs(px - a.stop) : px * 0.01;
  const riskAmount = riskPerShare * a.qty;
  const cost = px * a.qty;
  if (cost > d.cash) { toast(d, "warn", "Not enough cash for that size."); return; }

  d.cash -= cost;
  d.positions.push({
    id: nid("p"), symbol: a.symbol, side: a.side, qty: a.qty, avgEntry: px,
    stop: a.stop, target: a.target, openedTick: d.now, openedTs: Date.now(),
    riskAmount, riskPct: d.equity > 0 ? (riskAmount / d.equity) * 100 : 0,
    setup: a.setup, checkin: a.checkin, override: a.override,
  });
  void dir; void meta; void violations;
  recomputeEquity(d);
  toast(d, "ok", `${a.side.toUpperCase()} ${a.qty} ${a.symbol} filled @ ${px.toFixed(2)}.`);
}

function closePosition(d: AppState, id: string, reason: Trade["exitReason"]): void {
  const i = d.positions.findIndex((p) => p.id === id);
  if (i < 0) return;
  const pos = d.positions[i];
  const px = d.market[pos.symbol].price;
  const gross = mtm(pos, px);
  const pnl = gross;
  const r = pos.riskAmount > 0 ? pnl / pos.riskAmount : 0;

  d.cash += px * pos.qty;
  d.positions.splice(i, 1);

  const trade: Trade = {
    id: nid("tr"), symbol: pos.symbol, side: pos.side, qty: pos.qty,
    entry: pos.avgEntry, exit: px, entryTs: pos.openedTs, exitTs: Date.now(),
    pnl, r, riskAmount: pos.riskAmount, riskPct: pos.riskPct, setup: pos.setup,
    exitReason: reason, checkin: pos.checkin, override: pos.override, violations: [],
    journal: null,
  };
  d.trades.push(trade);
  d.journalDue = [...d.journalDue, trade.id];

  if (pnl < 0) {
    d.lossesThisSession += 1;
    // Tilt-ish guard: rapid re-entry sizing is logged by scoring; keep it light here.
  }
  recomputeEquity(d);
  toast(d, pnl >= 0 ? "ok" : "down", `${pos.symbol} closed ${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(0)} (${r >= 0 ? "+" : ""}${r.toFixed(2)}R). Journal required.`);
}

/* ------------------------------ reducer ----------------------------- */
function reducer(state: AppState, action: Action): AppState {
  const d: AppState = deepClone(state);
  switch (action.type) {
    case "TICK": return tick(d);

    case "SIGN_IN": {
      d.email = action.email.trim().toLowerCase();
      safeSet(LS_EMAIL, d.email);
      toast(d, "ok", `Signed in as ${d.email}.`);
      return d;
    }
    case "SIGN_OUT": {
      safeRemove(LS_EMAIL);
      d.email = null;
      return d;
    }

    case "SELECT": { d.selected = action.symbol; return d; }

    case "PLACE_ORDER": { placeOrder(d, action); return d; }

    case "CLOSE_POSITION": { closePosition(d, action.id, "manual"); return d; }

    case "ADJUST_BRACKET": {
      const p = d.positions.find((x) => x.id === action.id);
      if (!p) return d;
      p.stop = action.stop; p.target = action.target;
      toast(d, "info", `${p.symbol} bracket updated.`);
      return d;
    }

    case "SUBMIT_JOURNAL": {
      const t = d.trades.find((x) => x.id === action.tradeId);
      if (!t) return d;
      const fields = {
        plan: action.journal.plan, whatHappened: action.journal.whatHappened,
        rulesNote: action.journal.rulesNote, lesson: action.journal.lesson,
        followedRules: action.journal.followedRules,
      };
      const gate = journalGate(fields);
      if (!gate.ok) { toast(d, "warn", gate.reason); return d; }
      const qualityScore = journalQualityScore(fields);
      if (qualityScore < 25) { toast(d, "warn", "Journal rejected by the quality engine — write a real reflection."); return d; }
      t.journal = { ...action.journal, qualityScore, debrief: buildDebrief(t, d.plan), at: Date.now() };
      d.journalDue = d.journalDue.filter((id) => id !== action.tradeId);
      toast(d, "ok", `Journal saved · quality ${qualityScore}/100. Coach debrief attached.`);
      return d;
    }

    case "SKIP_JOURNAL": {
      // Hard guard: only the owner's session may skip.
      if (!isOwner(d.email)) return d;
      const t = d.trades.find((x) => x.id === action.tradeId);
      if (!t) return d;
      d.journalDue = d.journalDue.filter((id) => id !== action.tradeId);
      t.journal = {
        plan: "—", whatHappened: "—", emotionDuring: t.checkin.emotion, emotionAfter: t.checkin.emotion,
        followedRules: "yes", rulesNote: "", lesson: "Skipped.", setup: t.setup,
        grade: "D", qualityScore: 0, debrief: "", at: Date.now(),
      };
      toast(d, "info", "Journal skipped (owner session).");
      return d;
    }

    case "ACK_LOCK": { d.lock = null; toast(d, "info", "Review acknowledged. The desk is unlocked."); return d; }

    case "TOGGLE_STRESS": { d.stressMode = !d.stressMode; toast(d, "info", d.stressMode ? "Stress mode armed — expect adverse moves." : "Stress mode off."); return d; }

    case "DISMISS_TOAST": { d.toasts = d.toasts.filter((t) => t.id !== action.id); return d; }
  }
}

/* ------------------------------- tick ------------------------------- */
function tick(d: AppState): AppState {
  d.now += 1;
  const rnd = mulberry32((d.seed ^ (d.now * 40503)) >>> 0);

  for (const a of ASSETS) {
    const m = d.market[a.symbol];
    // Stress injection against open positions.
    if (d.stressMode && !m.stress && d.positions.some((p) => p.symbol === a.symbol) && rnd() < 0.006) {
      const pos = d.positions.find((p) => p.symbol === a.symbol)!;
      const dir: 1 | -1 = pos.side === "long" ? -1 : 1; // adverse
      m.stress = { left: 6, dir };
      d.stressSeen += 1;
      toast(d, "warn", `STRESS EVENT — adverse move injected into ${a.symbol}. Hold your stop.`);
    }
    stepMarket(m, a, rnd);
  }

  // bracket fills
  for (const p of d.positions.slice()) {
    const px = d.market[p.symbol].price;
    const dir = p.side === "long" ? 1 : -1;
    if (p.stop != null && (px - p.stop) * dir <= 0) closePosition(d, p.id, "stop");
    else if (p.target != null && (p.target - px) * dir <= 0) closePosition(d, p.id, "target");
  }

  recomputeEquity(d);

  /* daily-loss circuit breaker — owner sessions never lock */
  if (!d.lock && !isOwner(d.email)) {
    const loss = d.sessionStartEquity - d.equity;
    const limit = (d.plan.maxDailyLossPct / 100) * d.sessionStartEquity;
    if (loss >= limit && d.sessionStartEquity > 0) {
      d.lock = { reason: `Daily loss limit hit: −$${loss.toFixed(0)} (limit −$${limit.toFixed(0)}).`, loss };
      addViolation(d, "Daily loss limit", `Breached the ${d.plan.maxDailyLossPct}% circuit breaker.`);
      toast(d, "down", "CIRCUIT BREAKER — daily loss limit reached. Trading locked.");
    }
  }
  return d;
}

/* ------------------------------ context ----------------------------- */
interface Ctx { state: AppState; dispatch: Dispatch<Action> }
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    const iv = setInterval(() => dispatch({ type: "TICK" }), TICK_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      const { market: _m, toasts: _t, ...rest } = state;
      safeSet(LS_KEY, JSON.stringify(rest));
    } catch { /* storage full */ }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used within AppProvider");
  return c;
}

export { emotionLabel };
