import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, X, Lock, Flame, Wallet, LogOut, Check, BookOpen, Scale,
  Activity, ChevronRight,
} from "lucide-react";
import { AppProvider, useApp, gateCheck, TICK_MS, isOwner } from "./lib/store";
import {
  ASSETS, assetMeta, atr, emotionLabel, processScore, equityCurve,
  EMOTIONS, type Checkin, type EmotionTag, type Side, type Trade,
} from "./lib/engine";
import CandleChart from "./components/CandleChart";
import { Modal, Toasts, Spark, Gauge, Flash, fmtSigned, fmtR, fmtPx } from "./components/ui";

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { err: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.err) return <CrashScreen msg={this.state.err} />;
    return this.props.children;
  }
}
function CrashScreen({ msg }: { msg: string }) {
  return (
    <div className="h-full bg-ambient flex items-center justify-center p-6">
      <div className="panel max-w-md w-full p-7 text-center animate-pop">
        <h1 className="font-display font-bold text-[18px] text-fog-100 mb-2">The desk hit an unexpected error</h1>
        <p className="text-[12.5px] text-fog-400 mb-4">Discipline applies to software too. Clear local data to restart fresh.</p>
        <p className="num text-[10.5px] text-fog-600 mb-5 break-words bg-ink-900 border border-ink-700 rounded-lg p-2">{msg}</p>
        <button className="btn btn-teal w-full" onClick={() => { try { localStorage.clear(); } catch { /* blocked */ } window.location.reload(); }}>
          Clear local data & restart
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const { state: s } = useApp();
  return (
    <div className="h-full flex flex-col bg-ambient relative overflow-hidden">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <Toasts />
      {s.email ? <Desk /> : <AccountGate />}
    </div>
  );
}

/* --------------------------- account gate --------------------------- */
function AccountGate() {
  const { dispatch } = useApp();
  const [email, setEmail] = useState("abdullahwasee86@gmail.com");
  const [err, setErr] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = () => {
    if (!valid) { setErr("Enter a valid email address."); return; }
    dispatch({ type: "SIGN_IN", email: email.trim().toLowerCase() });
  };
  return (
    <div className="relative flex-1 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-7">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-teal" style={{ background: "rgba(57,197,165,0.12)", border: "1px solid rgba(57,197,165,0.4)" }}>
            <Activity size={22} />
          </span>
          <div>
            <h1 className="font-display font-bold text-[24px] text-fog-100 leading-tight">Deliberate<span className="text-teal">Trade</span></h1>
            <p className="text-[11.5px] text-fog-500">Paper trading that hurts enough to teach you.</p>
          </div>
        </div>

        <div className="panel p-6">
          <p className="lbl mb-1.5">Who's trading?</p>
          <h2 className="font-display font-semibold text-[16px] text-fog-100 mb-4">Sign in to your training desk</h2>
          <label className="lbl block mb-1.5">Email</label>
          <input
            className="field mb-2"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            autoFocus
          />
          {err && <p className="text-[11.5px] text-down mb-2 animate-fade-in">{err}</p>}
          <button className="btn btn-teal w-full !py-2.5 !text-[13.5px] mt-1" onClick={submit} disabled={!valid}>
            Enter the desk <ChevronRight size={15} />
          </button>
          <p className="text-[10.5px] text-fog-600 leading-snug mt-4">
            Educational simulation with virtual money only — not financial advice. Simulated results don't predict real-money results.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------ the desk ---------------------------- */
function Desk() {
  const { state: s, dispatch } = useApp();
  const owner = isOwner(s.email);
  return (
    <>
      <TopBar owner={owner} />
      <Ticker />
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[218px_1fr_288px] gap-3 min-h-0 p-3 overflow-y-auto">
        <Watchlist />
        <ChartPanel />
        <TicketColumn />
      </div>
      <DisclaimerFooter />
      <JournalModal />
      {!owner && <LockReview />}
    </>
  );
}

/* ------------------------------ top bar ----------------------------- */
function TopBar({ owner }: { owner: boolean }) {
  const { state: s, dispatch } = useApp();
  const dayPnl = s.equity - s.sessionStartEquity;
  const proc = useMemo(() => processScore(s.trades, s.violations, s.plan), [s.trades, s.violations, s.plan]);
  const openRisk = s.positions.reduce((a, p) => a + p.riskAmount, 0);
  const riskFrac = s.equity > 0 ? openRisk / ((s.plan.riskPerTradePct / 100) * s.equity * s.plan.startingCapital / s.equity || 1) : 0;
  const riskPctOfEquity = s.equity > 0 ? (openRisk / s.equity) * 100 : 0;
  void riskFrac;
  return (
    <div className="shrink-0 flex items-center gap-3 md:gap-5 px-3 md:px-4 h-[54px] border-b border-ink-700 relative z-20" style={{ background: "rgba(10,17,32,0.85)" }}>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-teal" style={{ background: "rgba(57,197,165,0.12)", border: "1px solid rgba(57,197,165,0.35)" }}>
          <Activity size={17} />
        </span>
        <span className="font-display font-bold text-[16px] text-fog-100 hidden sm:block">Deliberate<span className="text-teal">Trade</span></span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="lbl hidden sm:inline">Equity</span>
        <Flash value={s.equity} format={(n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          className="text-[17px] font-semibold text-fog-100" />
        <span className={`num text-[12.5px] font-medium ml-1 ${dayPnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(dayPnl, 0)}</span>
      </div>

      <div className="hidden md:flex items-center gap-2 w-[130px]">
        <span className="lbl">Risk</span>
        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "#16213a" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, riskPctOfEquity * 20)}%`, background: riskPctOfEquity > 4 ? "#e0564f" : riskPctOfEquity > 2 ? "#e0a33b" : "#39c5a5" }} />
        </div>
        <span className="num text-[10.5px] text-fog-400">{riskPctOfEquity.toFixed(1)}%</span>
      </div>

      <div className="flex items-center gap-2" title={`Process score ${proc}/100`}>
        <span className="lbl hidden lg:inline">Process</span>
        <Gauge value={proc} size={38} />
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {owner && (
          <span className="lbl !text-[9px] px-2 py-1 rounded-full hidden sm:inline-flex items-center gap-1.5" style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.35)", color: "#39c5a5" }}>
            <Scale size={11} /> unrestricted
          </span>
        )}
        <button
          className="btn !py-1.5 !px-3 !text-[11.5px]"
          style={s.stressMode ? { background: "rgba(224,163,59,0.15)", borderColor: "#e0a33b", color: "#e0a33b" } : undefined}
          onClick={() => dispatch({ type: "TOGGLE_STRESS" })}
          title="Inject random adverse moves into open positions">
          <Flame size={13} /> Stress {s.stressMode ? "on" : "off"}
        </button>
        <span className="num text-[10.5px] text-fog-500 hidden lg:block max-w-[180px] truncate">{s.email}</span>
        <button className="text-fog-500 hover:text-down transition-colors" title="Sign out" onClick={() => dispatch({ type: "SIGN_OUT" })}>
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ ticker ------------------------------ */
function Ticker() {
  const { state: s, dispatch } = useApp();
  const row = (key: string) => (
    <div key={key} className="flex items-center shrink-0">
      {ASSETS.map((a) => {
        const m = s.market[a.symbol];
        const ch = ((m.price - m.refClose) / m.refClose) * 100;
        return (
          <button key={a.symbol + key} onClick={() => dispatch({ type: "SELECT", symbol: a.symbol })}
            className="flex items-center gap-2 px-4 h-[30px] border-r border-ink-700 hover:bg-ink-800 transition-colors">
            <span className="font-display font-semibold text-[11px] text-fog-200">{a.symbol}</span>
            <span className="num text-[11px] text-fog-400">{fmtPx(m.price, m.price >= 1000 ? 0 : 2)}</span>
            <span className={`num text-[10.5px] ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(2)}%</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="shrink-0 overflow-hidden border-b border-ink-700 hidden md:block" style={{ background: "rgba(7,12,22,0.6)" }}>
      <div className="ticker-track flex w-max">{row("a")}{row("b")}</div>
    </div>
  );
}

/* ----------------------------- watchlist ---------------------------- */
function Watchlist() {
  const { state: s, dispatch } = useApp();
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="panel p-2.5 flex-1 min-h-[240px] overflow-y-auto">
        <p className="lbl px-1.5 pb-2">Watchlist</p>
        {ASSETS.map((a) => {
          const m = s.market[a.symbol];
          const ch = ((m.price - m.refClose) / m.refClose) * 100;
          const sel = a.symbol === s.selected;
          return (
            <button key={a.symbol} onClick={() => dispatch({ type: "SELECT", symbol: a.symbol })}
              className="w-full flex items-center gap-2 px-1.5 py-[7px] rounded-lg row-hover text-left transition-all"
              style={sel ? { background: "rgba(57,197,165,0.09)", border: "1px solid rgba(57,197,165,0.3)" } : { border: "1px solid transparent" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-semibold text-[12.5px] text-fog-100">{a.symbol}</span>
                  {m.stress && <span className="text-amber animate-pulse"><Flame size={11} /></span>}
                  {s.positions.some((p) => p.symbol === a.symbol) && <span className="w-1.5 h-1.5 rounded-full bg-teal shrink-0" />}
                </div>
                <span className="text-[10px] text-fog-500">{a.kind === "crypto" ? "CRYPTO" : "US EQUITY"}</span>
              </div>
              <Spark data={m.candles.slice(-26).map((c) => c.c)} w={44} h={18} />
              <div className="text-right w-[64px] shrink-0">
                <Flash value={m.price} format={(n) => fmtPx(n, n >= 1000 ? 0 : 2)} className="text-[12px] text-fog-100 font-medium" />
                <div className={`num text-[10.5px] ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "+" : ""}{ch.toFixed(2)}%</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------- chart panel --------------------------- */
function ChartPanel() {
  const { state: s } = useApp();
  const m = s.market[s.selected];
  const meta = assetMeta(s.selected);
  const pos = s.positions.find((p) => p.symbol === s.selected);
  const changePct = ((m.price - m.refClose) / m.refClose) * 100;
  const a14 = atr(m);
  const stressed = !!m.stress;
  return (
    <div className="flex flex-col gap-3 min-h-0">
      {s.lock && (
        <div className="panel px-4 py-2.5 flex items-center gap-3 animate-shake" style={{ borderColor: "rgba(224,86,79,0.55)", background: "rgba(224,86,79,0.08)" }}>
          <span className="text-down"><Lock size={16} /></span>
          <p className="text-[13px] text-fog-200"><strong className="text-down">Circuit breaker engaged.</strong> {s.lock.reason}</p>
        </div>
      )}
      {stressed && (
        <div className="panel px-4 py-2.5 flex items-center gap-3" style={{ borderColor: "rgba(224,163,59,0.55)", background: "rgba(224,163,59,0.08)" }}>
          <span className="text-amber animate-pulse"><Flame size={16} /></span>
          <p className="text-[13px] text-fog-200"><strong className="text-amber">STRESS EVENT — {s.selected}.</strong> Adverse injection running. Don't touch the stop.</p>
        </div>
      )}
      <div className="panel p-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-[19px] text-fog-100">{s.selected}</h2>
              <span className="lbl !text-[9.5px] px-1.5 py-0.5 rounded" style={{ background: "#111b30", border: "1px solid #1c2942" }}>{meta.name}</span>
            </div>
            <p className="text-[11px] text-fog-500 num">ATR(14) {a14.toFixed(2)} · drag to pan · wheel to zoom · dbl-click = live</p>
          </div>
          <div className="flex items-baseline gap-2.5 ml-auto">
            <Flash value={m.price} format={(n) => fmtPx(n, n >= 1000 ? 0 : 2)} className="text-[26px] font-semibold text-fog-100" />
            <span className={`num text-[13px] font-medium ${changePct >= 0 ? "text-up" : "text-down"}`}>{changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%</span>
          </div>
          <span className="lbl !text-[9.5px] px-2 py-1 rounded-full"
            style={{
              background: m.regime === "trend-up" ? "rgba(47,185,140,0.12)" : m.regime === "trend-down" ? "rgba(224,86,79,0.12)" : m.regime === "chop" ? "rgba(224,163,59,0.12)" : "#111b30",
              color: m.regime === "trend-up" ? "#2fb98c" : m.regime === "trend-down" ? "#e0564f" : m.regime === "chop" ? "#e0a33b" : "#93a3ba",
              border: "1px solid #1c2942",
            }}>
            {m.regime.replace("-", " ").toUpperCase()}
          </span>
        </div>
        <CandleChart candles={m.candles} live={m.price} height={308} decimals={meta.decimals + 1}
          lines={[
            ...(pos ? [{ price: pos.avgEntry, color: "#eef3fa", label: "ENTRY", dash: [2, 3] }] : []),
            ...(pos?.stop != null ? [{ price: pos.stop, color: "#e0564f", label: "STOP" }] : []),
            ...(pos?.target != null ? [{ price: pos.target, color: "#2fb98c", label: "TARGET" }] : []),
          ]} />
      </div>
      <DeskTables />
    </div>
  );
}

/* ---------------------------- ticket column ------------------------- */
function TicketColumn() {
  const { state: s } = useApp();
  const pos = s.positions.find((p) => p.symbol === s.selected);
  return <div className="min-h-0">{pos ? <ManagePanel key={pos.id} id={pos.id} /> : <EntryTicket />}</div>;
}

function EntryTicket() {
  const { state: s, dispatch } = useApp();
  const m = s.market[s.selected];
  const meta = assetMeta(s.selected);
  const a14 = atr(m);
  const gate = gateCheck(s);
  const owner = isOwner(s.email);
  const plannedRisk$ = (s.plan.riskPerTradePct / 100) * s.equity;

  const [side, setSide] = useState<Side>("long");
  const [qty, setQty] = useState(0);
  const [stop, setStop] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [setup, setSetup] = useState(s.plan.setups[0] ?? "Breakout");
  const [override, setOverride] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  useEffect(() => {
    const px = s.market[s.selected].price;
    const a = atr(s.market[s.selected]);
    const dir = side === "long" ? 1 : -1;
    const st = Number((px - dir * 1.5 * a).toFixed(meta.decimals + 1));
    setStop(st);
    setTarget(Number((px + dir * 2.5 * a).toFixed(meta.decimals + 1)));
    setOverride(false);
    const rps = Math.abs(px - st);
    setQty(Math.max(1, Math.floor(plannedRisk$ / Math.max(0.0001, rps))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.selected, side]);

  const riskPerShare = stop ? Math.abs(m.price - stop) : 0;
  const suggested = riskPerShare > 0 ? Math.max(1, Math.floor(plannedRisk$ / riskPerShare)) : 0;
  const risk$ = riskPerShare * qty;
  const overPlan = risk$ > plannedRisk$ * 1.05;
  const rr = stop && target && riskPerShare > 0 ? Math.abs(target - m.price) / riskPerShare : 0;
  const valid = qty > 0 && !!stop && gate.ok;

  const submit = (checkin: Checkin) => {
    dispatch({ type: "PLACE_ORDER", symbol: s.selected, side, qty, stop, target, setup, checkin, override });
    setCheckinOpen(false);
  };
  const skipCheckin = () => {
    submit({ emotion: "calm", arousal: 5, thesis: "—", at: Date.now() });
  };

  return (
    <div className="panel p-4 flex flex-col gap-3.5 sticky top-0">
      <div className="flex items-center justify-between">
        <p className="lbl">Order ticket</p>
        <span className="num text-[10px] text-fog-500">risk plan ${plannedRisk$.toFixed(0)}</span>
      </div>

      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
        {(["long", "short"] as Side[]).map((sd) => (
          <button key={sd} onClick={() => setSide(sd)}
            className="py-2 rounded-md font-display font-bold text-[13px] uppercase tracking-wide transition-all"
            style={side === sd ? { background: sd === "long" ? "#2fb98c" : "#e0564f", color: "#08131f" } : { color: "#6b7d96" }}>
            {sd}
          </button>
        ))}
      </div>

      <div>
        <label className="lbl block mb-1.5">Quantity</label>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => setQty(Math.max(1, qty - (qty > 10 ? 5 : 1)))}>−</button>
          <input type="number" className="field num text-center" value={qty || ""} min={1}
            onChange={(e) => { const v = Number(e.target.value); setQty(Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0); }} />
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => setQty(qty + (qty >= 10 ? 5 : 1))}>+</button>
        </div>
        <button className="text-[11px] text-teal hover:underline mt-1.5 font-medium" onClick={() => setQty(suggested)}>
          Size to plan risk → {suggested} sh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="lbl block mb-1.5">Stop (hard)</label>
          <input type="number" step="any" className="field num" value={stop ?? ""} placeholder="required"
            onChange={(e) => setStop(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl block mb-1.5">Target (R)</label>
          <input type="number" step="any" className="field num" value={target ?? ""} placeholder="optional"
            onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className="lbl block mb-1.5">Setup tag</label>
        <select className="field" value={setup} onChange={(e) => setSetup(e.target.value)}>
          {s.plan.setups.map((st) => <option key={st}>{st}</option>)}
        </select>
      </div>

      <div className="panel-inset p-3 space-y-1.5 num text-[12px]">
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Risk / share</span><span className="text-fog-100">{stop ? fmtPx(riskPerShare) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Planned risk</span>
          <span style={{ color: overPlan ? "#e0564f" : "#2fb98c" }}>${risk$.toFixed(0)} · {s.equity > 0 ? ((risk$ / s.equity) * 100).toFixed(2) : "0"}%</span></div>
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Reward : Risk</span><span className="text-fog-100">{rr ? `${rr.toFixed(2)} : 1` : "—"}</span></div>
      </div>

      {overPlan && (
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer animate-fade-in"
          style={{ background: "rgba(224,86,79,0.08)", border: "1px solid rgba(224,86,79,0.4)" }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 accent-[#e0564f]" />
          <span className="text-[11.5px] text-fog-300 leading-snug">
            <strong className="text-down">I am breaking my risk rule.</strong> This size exceeds my planned {s.plan.riskPerTradePct}% and will be logged.
          </span>
        </label>
      )}

      <button className={`btn w-full !py-2.5 !text-[13.5px] ${side === "long" ? "btn-teal" : "btn-down"}`}
        disabled={!valid || (overPlan && !override)}
        onClick={() => setCheckinOpen(true)}>
        <Brain size={15} /> Check in & place order
      </button>
      {!gate.ok && <p className="text-[11px] text-down text-center -mt-1">{gate.reason}</p>}

      <EmotionCheckin open={checkinOpen} onClose={() => setCheckinOpen(false)} onSubmit={submit}
        onSkip={owner ? skipCheckin : undefined} symbol={s.selected} side={side} risk$={risk$} />
    </div>
  );
}

function EmotionCheckin({ open, onClose, onSubmit, onSkip, symbol, side, risk$ }: {
  open: boolean; onClose: () => void; onSubmit: (c: Checkin) => void; onSkip?: () => void;
  symbol: string; side: Side; risk$: number;
}) {
  const [emotion, setEmotion] = useState<EmotionTag | null>(null);
  const [arousal, setArousal] = useState(4);
  const [thesis, setThesis] = useState("");
  useEffect(() => { if (open) { setEmotion(null); setArousal(4); setThesis(""); } }, [open]);
  const ok = !!emotion && thesis.trim().length >= 12;
  const toneFor = (t: "up" | "warn" | "down") => (t === "up" ? "#2fb98c" : t === "warn" ? "#e0a33b" : "#e0564f");
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><span className="text-teal"><Brain size={16} /></span> Pre-trade emotional check-in</span>}>
      {onSkip && (
        <button onClick={onSkip} aria-label="Skip" title="Skip"
          className="absolute top-3 right-3 inline-flex items-center justify-center w-7 h-7 rounded-lg text-fog-500 transition-all hover:text-fog-100 z-20"
          style={{ background: "#111b30", border: "1px solid #2a3c5e" }}>
          <X size={14} />
        </button>
      )}
      <p className="text-[12.5px] text-fog-400 leading-relaxed mb-4">
        Mandatory before every order. Name the state honestly.
        <span className="num text-fog-300"> {side.toUpperCase()} {symbol} · risking ${risk$.toFixed(0)}.</span>
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-5">
        {EMOTIONS.map((e) => (
          <button key={e.id} onClick={() => setEmotion(e.id)}
            className="py-2 px-1 rounded-lg text-[10.5px] font-semibold transition-all duration-150 leading-tight"
            style={{
              background: emotion === e.id ? `${toneFor(e.tone)}22` : "#0a1120",
              border: `1px solid ${emotion === e.id ? toneFor(e.tone) : "#1c2942"}`,
              color: emotion === e.id ? toneFor(e.tone) : "#93a3ba",
              transform: emotion === e.id ? "translateY(-1px)" : undefined,
            }}>{e.label}</button>
        ))}
      </div>
      <div className="mb-5">
        <div className="flex justify-between items-baseline mb-1.5">
          <label className="lbl">Arousal level</label>
          <span className="num text-[13px] text-teal">{arousal}/10</span>
        </div>
        <input type="range" min={1} max={10} value={arousal} onChange={(e) => setArousal(Number(e.target.value))} className="w-full" />
        <div className="flex justify-between text-[10px] text-fog-600 mt-1"><span>ice cold</span><span>heart racing</span></div>
      </div>
      <div className="mb-5">
        <label className="lbl block mb-1.5">Why this trade — one honest sentence (min 12 chars)</label>
        <textarea className="field min-h-[64px] resize-none" placeholder="e.g. Pullback to the 20MA inside an uptrend, stop under the swing low…"
          value={thesis} onChange={(e) => setThesis(e.target.value)} />
      </div>
      <button className="btn btn-teal w-full !py-2.5" disabled={!ok}
        onClick={() => onSubmit({ emotion: emotion!, arousal, thesis: thesis.trim(), at: Date.now() })}>
        Checked in — submit order
      </button>
      {emotion && (emotion === "fomo" || emotion === "revenge" || emotion === "bored") && (
        <p className="text-[11.5px] text-amber mt-3 leading-snug flex gap-1.5">
          Self-reported {emotion === "bored" ? "boredom" : emotion}. The best trade from this state is usually no trade.
        </p>
      )}
    </Modal>
  );
}

function ManagePanel({ id }: { id: string }) {
  const { state: s, dispatch } = useApp();
  const pos = s.positions.find((p) => p.id === id)!;
  const meta = assetMeta(pos.symbol);
  const px = s.market[pos.symbol].price;
  const dir = pos.side === "long" ? 1 : -1;
  const upnl = (px - pos.avgEntry) * pos.qty * dir;
  const rNow = upnl / Math.max(1, pos.riskAmount);
  const [stop, setStop] = useState(pos.stop);
  const [target, setTarget] = useState(pos.target);
  const [confirmClose, setConfirmClose] = useState(false);
  const save = () => dispatch({ type: "ADJUST_BRACKET", id, stop, target });
  return (
    <div className="panel p-4 flex flex-col gap-3.5 sticky top-0">
      <div className="flex items-center justify-between">
        <p className="lbl">Open position</p>
        <span className="font-display font-bold text-[12.5px] px-2 py-0.5 rounded"
          style={{ background: pos.side === "long" ? "rgba(47,185,140,0.15)" : "rgba(224,86,79,0.15)", color: pos.side === "long" ? "#2fb98c" : "#e0564f" }}>
          {pos.side.toUpperCase()} {pos.symbol}
        </span>
      </div>
      <div className="panel-inset p-3 space-y-1.5 num text-[12.5px]">
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Qty / avg entry</span><span className="text-fog-100">{pos.qty} @ {fmtPx(pos.avgEntry, meta.decimals)}</span></div>
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Mark</span><span className="text-fog-100">{fmtPx(px, meta.decimals)}</span></div>
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Unrealized</span><span style={{ color: upnl >= 0 ? "#2fb98c" : "#e0564f" }}>{fmtSigned(upnl)}</span></div>
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Open R</span><span style={{ color: rNow >= 0 ? "#2fb98c" : "#e0564f" }}>{fmtR(rNow)}</span></div>
        <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>Planned risk</span><span className="text-fog-100">${pos.riskAmount.toFixed(0)} ({pos.riskPct.toFixed(2)}%)</span></div>
        <div className="pt-1 border-t border-ink-700 text-[11px] text-fog-500" style={{ fontFamily: "var(--font-body)" }}>
          Checked in as <strong className="text-fog-300">{emotionLabel(pos.checkin.emotion)}</strong> · “{pos.checkin.thesis.slice(0, 60)}{pos.checkin.thesis.length > 60 ? "…" : ""}”
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="lbl block mb-1.5">Stop</label>
          <input type="number" step="any" className="field num" value={stop ?? ""} placeholder="—"
            onChange={(e) => setStop(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl block mb-1.5">Target</label>
          <input type="number" step="any" className="field num" value={target ?? ""} placeholder="—"
            onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      </div>
      <button className="btn btn-ghost w-full" onClick={save}>Update bracket</button>
      {!confirmClose ? (
        <button className="btn btn-down w-full !py-2.5" onClick={() => setConfirmClose(true)}>
          Close at market · {fmtSigned(upnl)}
        </button>
      ) : (
        <div className="animate-fade-in space-y-2">
          <p className="text-[11.5px] text-amber text-center">Manual exit — the journal will ask <em>why the thesis died early</em>.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-down" onClick={() => dispatch({ type: "CLOSE_POSITION", id })}>Confirm</button>
            <button className="btn btn-ghost" onClick={() => setConfirmClose(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- desk tables -------------------------- */
function DeskTables() {
  const { state: s } = useApp();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="panel p-3">
        <p className="lbl mb-2">Positions · open risk ${s.positions.reduce((a, p) => a + p.riskAmount, 0).toFixed(0)}</p>
        {s.positions.length === 0 && <p className="text-[11.5px] text-fog-600">Flat. A flat position is a position too.</p>}
        {s.positions.map((p) => {
          const px = s.market[p.symbol].price;
          const dir = p.side === "long" ? 1 : -1;
          const u = (px - p.avgEntry) * p.qty * dir;
          return (
            <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-ink-700 last:border-0 num text-[11.5px]">
              <span className="font-display font-bold text-fog-100 text-[12px] w-12">{p.symbol}</span>
              <span style={{ color: p.side === "long" ? "#2fb98c" : "#e0564f" }} className="w-11">{p.side.toUpperCase()}</span>
              <span className="text-fog-400">{p.qty}@{fmtPx(p.avgEntry, p.avgEntry >= 1000 ? 0 : 2)}</span>
              <span className={`ml-auto font-medium ${u >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(u, 0)} · {fmtR(u / Math.max(1, p.riskAmount))}</span>
            </div>
          );
        })}
      </div>
      <div className="panel p-3">
        <p className="lbl mb-2">Recent closed</p>
        {s.trades.length === 0 && <p className="text-[11.5px] text-fog-600">Nothing closed yet.</p>}
        {s.trades.slice(-5).reverse().map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-ink-700 last:border-0 num text-[11.5px]">
            <span className="font-display font-bold text-fog-100 text-[12px] w-12">{t.symbol}</span>
            <span className="text-fog-500 text-[10px] uppercase">{t.exitReason}</span>
            <span className={`ml-auto font-medium ${t.pnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(t.pnl, 0)}</span>
            <span className={`w-14 text-right ${t.r >= 0 ? "text-up" : "text-down"}`}>{fmtR(t.r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- journal modal ------------------------- */
function JournalModal() {
  const { state: s, dispatch } = useApp();
  const tradeId = s.journalDue[0] ?? null;
  const trade = useMemo(() => s.trades.find((t) => t.id === tradeId) ?? null, [s.trades, tradeId]);
  const owner = isOwner(s.email);

  const [plan, setPlan] = useState("");
  const [what, setWhat] = useState("");
  const [during, setDuring] = useState<EmotionTag>("calm");
  const [after, setAfter] = useState<EmotionTag>("calm");
  const [followed, setFollowed] = useState<"yes" | "no" | null>(null);
  const [rulesNote, setRulesNote] = useState("");
  const [lesson, setLesson] = useState("");
  const [grade, setGrade] = useState<"A" | "B" | "C" | "D" | null>(null);

  useEffect(() => {
    setPlan(""); setWhat(""); setDuring("calm"); setAfter("calm");
    setFollowed(null); setRulesNote(""); setLesson(""); setGrade(null);
  }, [tradeId]);

  if (!trade) return null;
  const fields = { plan: plan.trim(), whatHappened: what.trim(), rulesNote: rulesNote.trim(), lesson: lesson.trim(), followedRules: (followed ?? "yes") as "yes" | "no" };
  const ok = followed !== null && grade !== null && plan.trim().length >= 12 && what.trim().length >= 12 && lesson.trim().length >= 20;

  return (
    <Modal open onClose={() => undefined} wide
      title={<span className="flex items-center gap-2"><span className="text-amber"><BookOpen size={16} /></span> Mandatory post-trade journal</span>}>
      {owner && (
        <button onClick={() => dispatch({ type: "SKIP_JOURNAL", tradeId: trade.id })} aria-label="Skip" title="Skip"
          className="absolute top-3 right-3 inline-flex items-center justify-center w-7 h-7 rounded-lg text-fog-500 transition-all hover:text-fog-100 z-20"
          style={{ background: "#111b30", border: "1px solid #2a3c5e" }}>
          <X size={14} />
        </button>
      )}
      <div className="panel-inset p-3 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 num text-[12px]">
        <span className="font-display font-bold text-[14px] text-fog-100">{trade.symbol}</span>
        <span style={{ color: trade.side === "long" ? "#2fb98c" : "#e0564f" }}>{trade.side.toUpperCase()} {trade.qty}</span>
        <span className="text-fog-400">{trade.entry.toFixed(2)} → {trade.exit.toFixed(2)}</span>
        <span className={trade.pnl >= 0 ? "text-up" : "text-down"}>{fmtSigned(trade.pnl)}</span>
        <span className={trade.r >= 0 ? "text-up" : "text-down"}>{fmtR(trade.r)}</span>
        <span className="text-fog-500 uppercase text-[10px]">exit: {trade.exitReason}</span>
      </div>
      <p className="text-[12px] text-fog-400 leading-relaxed mb-4">
        This is where trades become lessons. Nonsense is detected and rejected — write what actually happened.
      </p>
      <div className="space-y-4">
        <div>
          <label className="lbl block mb-1.5">What was the plan? (min 12 chars)</label>
          <textarea className="field min-h-[56px] resize-none" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Setup, entry trigger, stop rationale, target…" />
        </div>
        <div>
          <label className="lbl block mb-1.5">What actually happened? (min 12 chars)</label>
          <textarea className="field min-h-[56px] resize-none" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="How the trade unfolded vs. the plan…" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="lbl block mb-1.5">Emotion during</label>
            <select className="field" value={during} onChange={(e) => setDuring(e.target.value as EmotionTag)}>
              {EMOTIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl block mb-1.5">Emotion after</label>
            <select className="field" value={after} onChange={(e) => setAfter(e.target.value as EmotionTag)}>
              {EMOTIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="lbl block mb-1.5">Did I follow my rules?</label>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
            {(["yes", "no"] as const).map((v) => (
              <button key={v} onClick={() => setFollowed(v)}
                className="py-1.5 rounded-md text-[12px] font-semibold capitalize transition-all"
                style={followed === v ? { background: v === "yes" ? "#2fb98c" : "#e0564f", color: "#08131f" } : { color: "#6b7d96" }}>{v}</button>
            ))}
          </div>
          {followed === "no" && (
            <input className="field mt-2" placeholder="Which rule, and why did it break?" value={rulesNote} onChange={(e) => setRulesNote(e.target.value)} />
          )}
        </div>
        <div>
          <label className="lbl block mb-1.5">One concrete lesson (min 20 chars)</label>
          <textarea className="field min-h-[56px] resize-none" value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="What will you do differently next time?" />
        </div>
        <div>
          <label className="lbl block mb-1.5">Process grade</label>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
            {(["A", "B", "C", "D"] as const).map((g) => (
              <button key={g} onClick={() => setGrade(g)}
                className="py-1.5 rounded-md font-display font-bold text-[13px] transition-all"
                style={grade === g ? { background: "#39c5a5", color: "#062019" } : { color: "#6b7d96" }}>{g}</button>
            ))}
          </div>
        </div>
      </div>
      <button className="btn btn-teal w-full !py-2.5 !text-[13.5px] mt-5" disabled={!ok}
        onClick={() => dispatch({
          type: "SUBMIT_JOURNAL", tradeId: trade.id,
          journal: { plan: plan.trim(), whatHappened: what.trim(), emotionDuring: during, emotionAfter: after, followedRules: followed!, rulesNote: rulesNote.trim(), lesson: lesson.trim(), setup: trade.setup, grade: grade! },
        })}>
        File journal & receive coach debrief
      </button>
      {trade.journal && <p className="text-[11px] text-fog-500 mt-2">{trade.journal.debrief}</p>}
    </Modal>
  );
}

/* ----------------------------- lock review -------------------------- */
function LockReview() {
  const { state: s, dispatch } = useApp();
  if (!s.lock) return null;
  const dayPnl = s.equity - s.sessionStartEquity;
  return (
    <Modal open onClose={() => undefined}
      title={<span className="flex items-center gap-2"><span className="text-down"><Lock size={16} /></span> Daily loss limit breached</span>}>
      <div className="panel-inset p-4 mb-4 text-center">
        <p className="num text-[30px] font-semibold text-down">{fmtSigned(dayPnl)}</p>
        <p className="text-[11.5px] text-fog-500 mt-1">session result</p>
      </div>
      <p className="text-[12.5px] text-fog-300 leading-relaxed mb-4">
        This is the circuit breaker doing its job. In real trading, this is the moment accounts survive or die. Acknowledge the review to continue — the desk unlocks.
      </p>
      <button className="btn btn-teal w-full !py-2.5" onClick={() => dispatch({ type: "ACK_LOCK" })}>
        <Check size={15} /> I've reviewed my session — unlock the desk
      </button>
    </Modal>
  );
}

/* ------------------------------ footer ------------------------------ */
function DisclaimerFooter() {
  return (
    <div className="shrink-0 border-t border-ink-700 px-4 py-2" style={{ background: "rgba(7,12,22,0.72)" }}>
      <p className="text-[9.5px] leading-snug text-fog-600 num max-w-[980px]">
        Educational simulation with virtual money only — not financial advice. Simulated results do not predict real-money results. Trading involves substantial risk of loss; most retail traders lose money.
      </p>
    </div>
  );
}
