import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppProvider, hardReset, useApp } from "./lib/store";
import { isSessionValid, touchSession, clearSession } from "./lib/auth";
import type { View } from "./lib/types";
import { computeProcess, detectTiltSignals } from "./lib/coaching";
import { Flash, Ic, Modal, Toasts, fmtSigned } from "./components/ui";
import { DisclaimerFooter } from "./components/LegalKit";
import Tour from "./components/Tour";
import Auth from "./components/Auth";
import JournalModal from "./components/JournalModal";
import Onboarding from "./views/Onboarding";
import Terminal from "./views/Terminal";
import Dashboard from "./views/Dashboard";
import Journal from "./views/Journal";
import Practice from "./views/Practice";
import Learn from "./views/Learn";
import Readiness from "./views/Readiness";
import PlanView from "./views/Plan";
import Legal from "./views/Legal";

const T: Record<View, string> = {
  terminal: "Terminal", dashboard: "Process Debrief", journal: "Trade Journal",
  practice: "Deliberate Practice", learn: "Formula Playground",
  readiness: "Readiness", plan: "My Plan", legal: "Legal & Terms",
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Gate />
      </AppProvider>
    </ErrorBoundary>
  );
}

/* Auth gate — the app is unreachable without a valid verified session. */
function Gate() {
  const { state: s } = useApp();
  const [authed, setAuthed] = useState<boolean>(() => isSessionValid());

  useEffect(() => {
    touchSession();
    const activity = () => touchSession();
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "pointerdown", "scroll"];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    const iv = setInterval(() => {
      if (isSessionValid()) touchSession();
      else { clearSession(); setAuthed(false); }
    }, 15_000);
    return () => { events.forEach((e) => window.removeEventListener(e, activity)); clearInterval(iv); };
  }, []);

  const ready = authed && s.hydrated;
  if (!ready) return <Auth />;
  return <Shell />;
}

/* If anything throws during render: a recovery screen, never a blank page. */
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
    <div className="h-full bg-ambient relative flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="panel relative max-w-md w-full p-7 text-center animate-pop">
        <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl text-down mb-4" style={{ background: "rgba(224,86,79,0.1)", border: "1px solid rgba(224,86,79,0.4)" }}>
          <Ic.alert size={20} />
        </span>
        <h1 className="font-display font-bold text-[18px] text-fog-100 mb-2">The desk hit an unexpected error</h1>
        <p className="text-[12.5px] text-fog-400 leading-relaxed mb-4">
          Discipline applies to software too. Your saved session may be from an older version of the platform and no longer parses.
        </p>
        <p className="num text-[10.5px] text-fog-600 mb-5 break-words" style={{ background: "#0a1120", border: "1px solid #16213a", borderRadius: 8, padding: "8px 10px" }}>{msg}</p>
        <button className="btn btn-teal w-full" onClick={() => hardReset()}>Clear local data &amp; restart</button>
        <p className="text-[10.5px] text-fog-600 mt-3">This wipes locally stored journals and history. Exports are unaffected.</p>
      </div>
    </div>
  );
}

function Shell() {
  const { state: s } = useApp();
  const [view, setView] = useState<View>("terminal");

  useEffect(() => { document.title = `${T[view]} · DeliberateTrade`; }, [view]);

  if (!s.plan) return <Onboarding />;

  return (
    <div className="h-full flex flex-col bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <TopBar view={view} />
      <Ticker />
      <div className="flex-1 flex min-h-0 relative">
        <Rail view={view} setView={setView} />
        <main className="flex-1 min-w-0 min-h-0">
          {view === "terminal" && <Terminal />}
          {view === "dashboard" && <Dashboard />}
          {view === "journal" && <Journal />}
          {view === "practice" && <Practice />}
          {view === "learn" && <Learn />}
          {view === "readiness" && <Readiness />}
          {view === "plan" && <PlanView />}
          {view === "legal" && <Legal />}
        </main>
      </div>
      <DisclaimerFooter onLegal={() => setView("legal")} />
      <JournalModal />
      <LockReview />
      <Tour />
      <Toasts />
    </div>
  );
}

const NAV: { id: View; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: Ic.candles },
  { id: "dashboard", label: "Debrief", icon: Ic.gauge },
  { id: "journal", label: "Journal", icon: Ic.journal },
  { id: "practice", label: "Practice", icon: Ic.target },
  { id: "learn", label: "Playground", icon: Ic.flask },
  { id: "readiness", label: "Readiness", icon: Ic.flag },
  { id: "plan", label: "My Plan", icon: Ic.scroll },
  { id: "legal", label: "Legal", icon: Ic.scale },
];

function Rail({ view, setView }: { view: View; setView: (v: View) => void }) {
  const { state: s } = useApp();
  const pending = s.journalDue.length;
  return (
    <nav data-tour="nav" className="w-[58px] md:w-[152px] shrink-0 border-r border-line flex flex-col py-2.5 relative z-10" style={{ background: "rgba(7,12,22,0.6)" }}>
      <div className="flex items-center gap-2 px-3 pb-3 mb-1 border-b border-line-soft">
        <span className="text-teal shrink-0"><Ic.logo size={26} /></span>
        <span className="hidden md:block font-display font-bold text-[13.5px] text-fog-100 leading-tight">Deliberate<span className="text-teal">Trade</span></span>
      </div>
      {NAV.map((n) => {
        const active = view === n.id;
        return (
          <button key={n.id} onClick={() => setView(n.id)}
            className="relative flex items-center gap-2.5 mx-2 px-2.5 py-2.5 rounded-lg transition-all duration-150 group"
            style={{
              background: active ? "rgba(57,197,165,0.1)" : "transparent",
              color: active ? "#39c5a5" : "#6b7d96",
              border: `1px solid ${active ? "rgba(57,197,165,0.3)" : "transparent"}`,
            }}>
            {active && <span className="absolute left-[-9px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-teal" />}
            <span className="shrink-0">{n.icon({ size: 17 })}</span>
            <span className="hidden md:block text-[12px] font-semibold">{n.label}</span>
            {n.id === "journal" && pending > 0 && (
              <span className="absolute right-1.5 top-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center num text-[9px] font-bold animate-pulse"
                style={{ background: "#e0a33b", color: "#1a1205" }}>{pending}</span>
            )}
          </button>
        );
      })}
      <div className="mt-auto px-3 pb-1 hidden md:block">
        <p className="num text-[9px] text-fog-600 leading-relaxed">SESSION {useApp().state.session} · {useApp().state.trades.length} trades logged</p>
      </div>
    </nav>
  );
}

function TopBar({ view }: { view: View }) {
  const { state: s, dispatch } = useApp();
  const signals = useMemo(() => detectTiltSignals(s.trades, s.violations), [s.trades, s.violations]);
  const proc = computeProcess(s.trades, s.violations, s.plan, signals);
  const openRisk = s.positions.reduce((a, p) => a + p.riskAmount, 0);
  const riskCap = ((s.plan?.maxOpenRiskPct ?? 1) / 100) * s.equity;
  const riskFrac = riskCap > 0 ? openRisk / riskCap : 0;
  const dayPnl = s.equity - s.sessionStartEquity;

  return (
    <header className="shrink-0 h-[52px] border-b border-line flex items-center gap-3 md:gap-5 px-3 md:px-4 relative z-10" style={{ background: "rgba(7,12,22,0.72)" }}>
      <div className="flex items-center gap-2 md:hidden"><Ic.logo size={26} /></div>
      <div className="flex items-baseline gap-2" data-tour="equity">
        <span className="lbl hidden sm:inline">Equity</span>
        <Flash value={s.equity} format={(n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          className="text-[17px] font-semibold text-fog-100" />
        <span className={`num text-[12.5px] font-medium ml-1 ${dayPnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(dayPnl, 0)}</span>
      </div>
      <div className="hidden md:flex items-center gap-2 w-[128px]" data-tour="riskmeter" title="Open risk vs your plan's limit">
        <span className="lbl">Risk</span>
        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "#16213a" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, riskFrac * 100)}%`, background: riskFrac > 0.85 ? "#e0564f" : riskFrac > 0.6 ? "#e0a33b" : "#39c5a5" }} />
        </div>
      </div>
      <div className="flex items-center gap-2" title={`Process score ${proc.score}/100`} data-tour="process">
        <span className="lbl hidden lg:inline">Process</span>
        <span className="num text-[14px] font-semibold" style={{ color: proc.score >= 75 ? "#2fb98c" : proc.score >= 50 ? "#e0a33b" : "#e0564f" }}>{proc.score}</span>
        <span className="hidden lg:inline text-[10px] text-fog-600 num">/100</span>
      </div>
      <div className="ml-auto flex items-center gap-2.5 md:gap-3.5 flex-wrap" data-tour="controls">
        <button onClick={() => dispatch({ type: "OPEN_TOUR", open: true })} title="Replay the guided tour"
          className="flex items-center justify-center w-[30px] h-[30px] rounded-lg font-display font-bold text-[14px] transition-all hover:border-teal"
          style={{ background: "#111b30", border: "1px solid #1c2942", color: "#6fb6e8" }}>?</button>
        <div className="hidden sm:flex items-center gap-1.5">
          <button onClick={() => dispatch({ type: "STRESS_TOGGLE" })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide transition-all duration-150 ${s.stressMode ? "text-amber" : "text-fog-600"}`}
            style={{ background: s.stressMode ? "rgba(224,163,59,0.1)" : "#111b30", border: `1px solid ${s.stressMode ? "rgba(224,163,59,0.45)" : "#1c2942"}` }}>
            <Ic.flame size={12} /> Stress
          </button>
        </div>
        <select className="field !w-auto !py-1.5 !text-[11px] num" value={s.friction}
          onChange={(e) => dispatch({ type: "SET_FRICTION", mode: e.target.value as "easy" | "realistic" | "brutal" })}
          title="Market friction mode">
          <option value="easy">EASY</option>
          <option value="realistic">REALISTIC</option>
          <option value="brutal">BRUTAL</option>
        </select>
        <button onClick={() => dispatch({ type: "END_SESSION" })}
          className="btn btn-ghost !py-1.5 !px-3 !text-[11px]" title="Close everything, reset daily limits, new missions">
          End session · {s.session}
        </button>
        <span className="hidden lg:flex items-center gap-1.5 text-[10px] text-fog-500 num">
          <span className="w-2 h-2 rounded-full bg-teal animate-pulse-dot" /> LIVE SIM
        </span>
      </div>
    </header>
  );
}

function Ticker() {
  const { state: s, dispatch } = useApp();
  const row = (key: string) => (
    <div key={key} className="flex shrink-0">
      {Object.entries(s.market).map(([sym, m]) => {
        const ch = ((m.price - m.refClose) / m.refClose) * 100;
        return (
          <button key={key + sym} onClick={() => dispatch({ type: "SELECT", symbol: sym })}
            className="flex items-center gap-1.5 px-4 h-[30px] num text-[10.5px] whitespace-nowrap row-hover"
            style={{ color: "#93a3ba" }}>
            <span className="font-display font-semibold text-fog-300">{sym}</span>
            <span className="text-fog-200">{m.price >= 1000 ? m.price.toFixed(0) : m.price.toFixed(2)}</span>
            <span style={{ color: ch >= 0 ? "#2fb98c" : "#e0564f" }}>{ch >= 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(2)}%</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div data-tour="ticker" className="shrink-0 overflow-hidden border-b border-line hidden md:block" style={{ background: "rgba(7,12,22,0.6)" }}>
      <div className="ticker-track flex w-max">{row("a")}{row("b")}</div>
    </div>
  );
}

function LockReview() {
  const { state: s, dispatch } = useApp();
  if (!s.lock) return null;
  const dayPnl = s.equity - s.sessionStartEquity;
  return (
    <Modal open onClose={() => undefined}
      title={<span className="flex items-center gap-2"><span className="text-down inline-flex"><Ic.lock size={16} /></span> Daily loss limit breached</span>}>
      <div className="panel-inset p-4 mb-4 text-center">
        <p className="num text-[30px] font-semibold text-down">{fmtSigned(dayPnl)}</p>
        <p className="text-[11.5px] text-fog-500 mt-1">session result · limit {fmtSigned(-s.lock.loss, 0).replace("−", "−")}</p>
      </div>
      <p className="text-[12.5px] text-fog-300 leading-relaxed mb-3">
        This is the circuit breaker doing its job. In real trading, this is the moment accounts survive or die. The desk stays locked until you complete the review and end the session.
      </p>
      <ul className="space-y-2 mb-5">
        {[
          "Which rule kept this from being worse — and which one failed?",
          "Was any losing trade revenge for an earlier one?",
          "What will tomorrow's first decision be, exactly?",
        ].map((q) => (
          <li key={q} className="flex gap-2.5 text-[12px] text-fog-400 leading-snug">
            <span className="text-amber mt-[2px] inline-flex shrink-0"><Ic.alert size={12} /></span>{q}
          </li>
        ))}
      </ul>
      <button className="btn btn-teal w-full !py-2.5" onClick={() => { dispatch({ type: "ACK_LOCK" }); dispatch({ type: "END_SESSION" }); }}>
        Review complete — close all &amp; start fresh session
      </button>
      <p className="text-[10.5px] text-fog-600 mt-3 text-center">Every breach is recorded. Readiness scoring counts them.</p>
    </Modal>
  );
}
