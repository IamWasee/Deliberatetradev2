import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppProvider, hardReset, useApp, gateCheck } from "./lib/store";
import { isSessionValid, touchSession, clearSession, loadAccount, maskEmail } from "./lib/auth";
import { computeProcess } from "./lib/coaching";
import { isAdminSession } from "./lib/admin";
import type { View } from "./lib/types";
import { Flash, Gauge, Ic, Modal, Toasts, Toggle, fmtSigned } from "./components/ui";
import { DisclaimerFooter } from "./components/LegalKit";
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}

/* If anything ever throws during render, show a recovery screen instead of a blank page. */
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
        <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl text-down mb-4"
          style={{ background: "rgba(224,86,79,0.1)", border: "1px solid rgba(224,86,79,0.4)" }}>
          <Ic.alert size={20} />
        </span>
        <h1 className="font-display font-bold text-[18px] text-fog-100 mb-2">The desk hit an unexpected error</h1>
        <p className="text-[12.5px] text-fog-400 leading-relaxed mb-4">
          Discipline applies to software too. Your saved session may be from an older version of the platform and no longer parses.
        </p>
        <p className="num text-[10.5px] text-fog-600 mb-5 break-words" style={{ background: "#0a1120", border: "1px solid #16213a", borderRadius: 8, padding: "8px 10px" }}>{msg}</p>
        <button className="btn btn-teal w-full" onClick={() => hardReset()}>Clear local data & restart</button>
        <p className="text-[10.5px] text-fog-600 mt-3">This wipes locally stored journals and history. Exports are unaffected.</p>
      </div>
    </div>
  );
}

const T: Record<View, string> = {
  terminal: "Terminal", dashboard: "Process Debrief", journal: "Trade Journal",
  practice: "Practice", learn: "Playground", readiness: "Readiness", plan: "My Plan", legal: "Legal",
};

const NAV: { id: View; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: Ic.candles },
  { id: "dashboard", label: "Debrief", icon: Ic.gauge },
  { id: "journal", label: "Journal", icon: Ic.journal },
  { id: "practice", label: "Practice", icon: Ic.practice },
  { id: "learn", label: "Playground", icon: Ic.flask },
  { id: "readiness", label: "Readiness", icon: Ic.target },
  { id: "plan", label: "My Plan", icon: Ic.scroll },
  { id: "legal", label: "Legal", icon: Ic.scale },
];

function Shell() {
  const { state: s, dispatch } = useApp();
  const [authed, setAuthed] = useState(() => isSessionValid());
  const [view, setView] = useState<View>("terminal");

  /* session watchdog: keep-alive on activity, auto-logout on idle expiry */
  useEffect(() => {
    if (!authed) return;
    touchSession();
    const activity = () => touchSession();
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "pointerdown", "scroll"];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    const iv = setInterval(() => {
      if (isSessionValid()) touchSession();
      else { clearSession(); setAuthed(false); }
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity));
      clearInterval(iv);
    };
  }, [authed]);

  useEffect(() => { document.title = T[view] + " - DeliberateTrade"; }, [view]);

  const acct = useMemo(() => loadAccount(), [authed]);

  if (!authed) {
    return (
      <>
        <Auth />
        <Toasts />
      </>
    );
  }

  if (!s.plan) return <Onboarding />;

  const proc = computeProcess(s.trades, s.violations, s.plan);
  const gate = gateCheck(s);
  const dayPnl = s.equity - s.sessionStartEquity;
  const owner = isAdminSession();

  return (
    <div className="h-full flex flex-col bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />

      {/* topbar */}
      <div className="relative shrink-0 border-b px-3 md:px-4 py-2.5 flex items-center gap-3 md:gap-5 flex-wrap"
        style={{ background: "rgba(7,12,22,0.82)", borderColor: "#16213a" }}>
        <div className="flex items-center gap-2">
          <span className="text-teal inline-flex"><Ic.logo size={26} /></span>
          <span className="font-display font-bold text-[15px] text-fog-100 hidden sm:inline">DeliberateTrade</span>
        </div>

        <div className="flex items-center gap-3 md:gap-4" data-tour="equity">
          <div className="flex flex-col leading-none">
            <span className="lbl hidden sm:block mb-1">Equity</span>
            <Flash value={s.equity} format={(n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              className="text-[15px] font-semibold text-fog-100" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="lbl hidden sm:block mb-1">Session</span>
            <span className={"num text-[15px] font-semibold " + (dayPnl >= 0 ? "text-up" : "text-down")}>
              {fmtSigned(dayPnl, 0)}
            </span>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2" style={{ width: 130 }} data-tour="riskmeter">
          <span className="lbl">Risk</span>
          <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "#16213a" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: Math.min(100, (s.positions.reduce((a, p) => a + p.riskAmount, 0) / Math.max(1, (s.plan.maxOpenRiskPct / 100) * s.equity)) * 100) + "%",
                background: s.positions.reduce((a, p) => a + p.riskAmount, 0) > (s.plan.maxOpenRiskPct / 100) * s.equity * 0.8 ? "#e0a33b" : "#39c5a5",
              }} />
          </div>
        </div>

        <div className="flex items-center gap-2" title={"Process score " + proc.score + "/100"} data-tour="process">
          <span className="lbl hidden xl:inline">Process</span>
          <div className="relative">
            <Gauge value={proc.score} size={34} />
            <span className="absolute inset-0 flex items-center justify-center num text-[10px] font-bold text-fog-100">{proc.score}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 flex-wrap" data-tour="controls">
          <Toggle on={s.stressMode} onChange={() => dispatch({ type: "TOGGLE_STRESS" })} label="Stress" />
          {owner && (
            <span className="lbl px-2 py-1 rounded-full" style={{ fontSize: 8.5, border: "1px solid rgba(111,182,232,0.4)", color: "#6fb6e8" }}>
              UNRESTRICTED
            </span>
          )}
          <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => dispatch({ type: "END_SESSION" })}>
            End session
          </button>
          <button className="text-[10.5px] text-fog-500 hover:text-fog-300 transition-colors num" title={acct?.email ?? ""}
            onClick={() => { clearSession(); setAuthed(false); }}>
            {acct ? maskEmail(acct.email) : "account"} - sign out
          </button>
        </div>
      </div>

      {/* nav rail */}
      <div className="relative flex-1 flex min-h-0">
        <nav className="shrink-0 border-r flex flex-col gap-1 p-2 w-[64px] md:w-[150px] overflow-y-auto"
          style={{ background: "rgba(7,12,22,0.6)", borderColor: "#16213a" }} data-tour="nav">
          {NAV.map((n) => {
            const active = view === n.id;
            const badge = n.id === "journal" ? s.journalDue.length : 0;
            return (
              <button key={n.id} onClick={() => setView(n.id)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 relative"
                style={active
                  ? { background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.35)", color: "#39c5a5" }
                  : { border: "1px solid transparent", color: "#6b7d96" }}>
                <span className="inline-flex shrink-0">{n.icon({ size: 16 })}</span>
                <span className="hidden md:inline text-[12px] font-semibold">{n.label}</span>
                {badge > 0 && (
                  <span className="absolute top-1 right-1 md:static md:ml-auto num text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "#e0a33b", color: "#08131f" }}>{badge}</span>
                )}
              </button>
            );
          })}
          <div className="mt-auto pt-3 hidden md:block">
            <p className="lbl px-2 mb-1" style={{ fontSize: 8 }}>Session {s.session}</p>
            <p className="text-[9.5px] text-fog-600 px-2 leading-snug num">tick {s.now} - {s.friction} friction</p>
          </div>
        </nav>

        {/* main */}
        <main className="flex-1 min-w-0 min-h-0 relative">
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
      <Toasts />
    </div>
  );
}

function LockReview() {
  const { state: s, dispatch } = useApp();
  if (!s.lock || isAdminSession()) return null;
  const dayPnl = s.equity - s.sessionStartEquity;
  return (
    <Modal open onClose={() => undefined}
      title={<span className="flex items-center gap-2"><span className="text-down inline-flex"><Ic.lock size={16} /></span> Daily loss limit breached</span>}>
      <div className="panel-inset p-4 mb-4 text-center">
        <p className="num text-[30px] font-semibold text-down">{fmtSigned(dayPnl)}</p>
        <p className="text-[11.5px] text-fog-500 mt-1">session result - limit {fmtSigned(-s.lock.loss, 0)}</p>
      </div>
      <p className="text-[12.5px] text-fog-300 leading-relaxed mb-3">
        This is the circuit breaker doing its job. In real trading, this is the moment accounts survive or die. The desk stays locked until you acknowledge the review and end the session.
      </p>
      <ul className="space-y-1.5 mb-4 text-[12px] text-fog-400">
        <li>- What did you feel right before the limit hit?</li>
        <li>- Which trade started the slide - and was it in your plan?</li>
        <li>- What will tomorrow's first rule be?</li>
      </ul>
      <div className="grid grid-cols-2 gap-2.5">
        <button className="btn btn-ghost" onClick={() => dispatch({ type: "ACK_LOCK" })}>Acknowledge</button>
        <button className="btn btn-teal" onClick={() => dispatch({ type: "END_SESSION" })}>End session & reset</button>
      </div>
    </Modal>
  );
}
