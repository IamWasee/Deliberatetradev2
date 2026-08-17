import { useMemo, useState, type ReactNode } from "react";
import { AppProvider, useApp } from "./lib/store";
import { ASSETS, FRICTIONS, type View } from "./lib/types";
import { computeProcess } from "./lib/coaching";
import { Flash, Ic, Modal, Toasts, fmtSigned } from "./components/ui";
import Onboarding from "./views/Onboarding";
import Terminal from "./views/Terminal";
import Dashboard from "./views/Dashboard";
import Journal from "./views/Journal";
import Practice from "./views/Practice";
import Learn from "./views/Learn";
import Readiness from "./views/Readiness";
import PlanView from "./views/Plan";
import JournalModal from "./components/JournalModal";

const NAV: { id: View; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: (p) => <Ic.candles {...p} /> },
  { id: "dashboard", label: "Debrief", icon: (p) => <Ic.dash {...p} /> },
  { id: "journal", label: "Journal", icon: (p) => <Ic.book {...p} /> },
  { id: "practice", label: "Practice", icon: (p) => <Ic.target {...p} /> },
  { id: "learn", label: "Playground", icon: (p) => <Ic.zap {...p} /> },
  { id: "readiness", label: "Readiness", icon: (p) => <Ic.grad {...p} /> },
  { id: "plan", label: "My Plan", icon: (p) => <Ic.scroll {...p} /> },
];

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { state: s } = useApp();
  const [view, setView] = useState<View>("terminal");
  if (!s.plan) return <><Onboarding /><ToastLayer /></>;
  return (
    <div className="h-full bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative h-full flex">
        <Rail view={view} setView={setView} />
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <TopBar />
          <TickerTape />
          {/* mobile nav */}
          <nav className="md:hidden shrink-0 flex gap-1 px-2 py-1.5 overflow-x-auto border-b border-line" style={{ background: "rgba(10,17,32,0.92)" }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setView(n.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap shrink-0"
                style={view === n.id ? { background: "rgba(57,197,165,0.14)", color: "#39c5a5" } : { color: "#6b7d96" }}>
                {n.icon({ size: 14 })}{n.label}
              </button>
            ))}
          </nav>
          <main className="flex-1 min-h-0 overflow-hidden">
            {view === "terminal" && <Terminal />}
            {view === "dashboard" && <Dashboard />}
            {view === "journal" && <Journal />}
            {view === "practice" && <Practice />}
            {view === "learn" && <Learn />}
            {view === "readiness" && <Readiness />}
            {view === "plan" && <PlanView />}
          </main>
        </div>
      </div>
      <LockReview />
      <JournalModal />
      <ToastLayer />
    </div>
  );
}

function ToastLayer() {
  const { state: s, dispatch } = useApp();
  return <Toasts toasts={s.toasts} dismiss={(id) => dispatch({ type: "DISMISS_TOAST", id })} />;
}

function Rail({ view, setView }: { view: View; setView: (v: View) => void }) {
  const { state: s } = useApp();
  const pending = s.trades.filter((t) => !t.journal).length;
  const dueReviews = s.reviews.filter((r) => r.dueTick <= s.now).length;
  return (
    <aside className="hidden md:flex flex-col items-stretch shrink-0 py-3 px-2 gap-1 w-[64px] xl:w-[176px] border-r border-line" style={{ background: "rgba(10,17,32,0.65)" }}>
      <div className="flex items-center gap-2.5 px-1.5 pb-3 mb-1 border-b border-line-soft">
        <Ic.logo size={30} />
        <div className="hidden xl:block leading-none">
          <p className="font-display font-bold text-[13.5px] text-fog-100">Deliberate<span className="text-teal">Trade</span></p>
          <p className="text-[8.5px] tracking-[0.14em] uppercase text-fog-600 mt-1">discipline engine</p>
        </div>
      </div>
      {NAV.map((n) => {
        const active = view === n.id;
        const badge = n.id === "journal" ? pending + dueReviews : 0;
        return (
          <button key={n.id} onClick={() => setView(n.id)}
            className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 group"
            style={active ? { background: "rgba(57,197,165,0.12)" } : undefined}>
            <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-200 ${active ? "h-5 bg-teal" : "h-0"}`} style={{ background: "#39c5a5" }} />
            <span className="shrink-0" style={{ color: active ? "#39c5a5" : "#6b7d96" }}>{n.icon({ size: 17 })}</span>
            <span className={`hidden xl:block text-[12.5px] font-semibold transition-colors ${active ? "text-fog-100" : "text-fog-500 group-hover:text-fog-300"}`}>{n.label}</span>
            {badge > 0 && (
              <span className="ml-auto hidden xl:flex num text-[10px] font-bold px-1.5 py-0.5 rounded-full text-amber" style={{ background: "rgba(224,163,59,0.14)", border: "1px solid rgba(224,163,59,0.4)" }}>{badge}</span>
            )}
            {badge > 0 && <span className="xl:hidden absolute top-1 right-1 w-2 h-2 rounded-full bg-amber" />}
          </button>
        );
      })}
      <div className="mt-auto px-1.5 hidden xl:block">
        <p className="text-[9px] text-fog-600 leading-relaxed border-t border-line-soft pt-3">
          Educational simulation only. No real funds, no real orders. Process over P&amp;L.
        </p>
      </div>
    </aside>
  );
}

function TopBar() {
  const { state: s, dispatch } = useApp();
  const proc = useMemo(() => computeProcess(s.trades, s.violations.length, s.plan), [s.trades, s.violations, s.plan]);
  const dayPnl = s.equity - s.sessionStartEquity;
  const openRisk = s.positions.reduce((a, p) => a + p.riskAmount, 0);
  const riskLimit = ((s.plan?.maxOpenRiskPct ?? 0) / 100) * s.equity;
  const secs = (s.now - s.sessionStartTick) * 0.85;
  const mm = Math.floor(secs / 60);
  const ss = Math.floor(secs % 60);

  return (
    <header className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 md:px-4 min-h-[58px] py-2 border-b border-line" style={{ background: "rgba(10,17,32,0.72)" }}>
      <div className="flex items-center gap-2 md:hidden"><Ic.logo size={26} /></div>
      <div className="flex items-baseline gap-2">
        <span className="lbl hidden sm:inline">Equity</span>
        <Flash value={s.equity} format={(n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          className="text-[17px] font-semibold text-fog-100" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="lbl hidden lg:inline">Session</span>
        <span className={`num text-[13.5px] font-medium ${dayPnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(dayPnl, 0)}</span>
      </div>
      <div className="hidden md:flex items-center gap-2 w-[128px]">
        <span className="lbl">Risk</span>
        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "#16213a" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (openRisk / Math.max(1, riskLimit)) * 100)}%`, background: openRisk / Math.max(1, riskLimit) > 0.85 ? "#e0564f" : "#39c5a5" }} />
        </div>
      </div>
      <div className="flex items-center gap-2" title={`Process score ${proc.score}/100`}>
        <span className="lbl hidden lg:inline">Process</span>
        <div className="relative w-[34px] h-[34px]">
          <svg width="34" height="34" className="-rotate-90">
            <circle cx="17" cy="17" r="14" fill="none" stroke="#1a2740" strokeWidth="4" />
            <circle cx="17" cy="17" r="14" fill="none" stroke={proc.score >= 80 ? "#2fb98c" : proc.score >= 55 ? "#e0a33b" : "#e0564f"} strokeWidth="4"
              strokeDasharray={`${(proc.score / 100) * 88} 88`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center num text-[10px] font-bold text-fog-200">{proc.score}</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2.5 md:gap-3.5 flex-wrap">
        <div className="hidden sm:flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${s.stressMode ? "bg-amber" : "bg-teal"} animate-pulse-dot`} />
          <span className="lbl">sim live</span>
          <span className="num text-[11px] text-fog-500">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</span>
        </div>
        <button onClick={() => dispatch({ type: "SET_STRESS", on: !s.stressMode })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-all"
          title="Stress Mode — injects adverse events into live positions"
          style={s.stressMode ? { background: "rgba(224,86,79,0.14)", color: "#e0564f", border: "1px solid rgba(224,86,79,0.5)" } : { background: "#111b30", color: "#6b7d96", border: "1px solid #1c2942" }}>
          <Ic.flame size={13} /> {s.stressMode ? "STRESS ARMED" : "Stress"}
        </button>
        <select className="field !w-auto !py-1.5 !text-[11.5px] !font-semibold" value={s.friction}
          onChange={(e) => dispatch({ type: "SET_FRICTION", mode: e.target.value as typeof s.friction })}>
          {(Object.keys(FRICTIONS) as (keyof typeof FRICTIONS)[]).map((f) => (
            <option key={f} value={f}>{FRICTIONS[f].label} friction</option>
          ))}
        </select>
        <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={() => dispatch({ type: "END_SESSION" })} title="Close everything, review, start fresh with new missions">
          End session {s.session}
        </button>
      </div>
    </header>
  );
}

function TickerTape() {
  const { state: s, dispatch } = useApp();
  const items = ASSETS.map((a) => {
    const m = s.market[a.symbol];
    const ch = ((m.price - m.refClose) / m.refClose) * 100;
    return { sym: a.symbol, px: m.price, ch };
  });
  const row = (key: string) => (
    <div key={key} className="flex items-center shrink-0">
      {items.map((it) => (
        <button key={`${key}-${it.sym}`} onClick={() => dispatch({ type: "SELECT", symbol: it.sym })}
          className="flex items-center gap-2 px-4 py-1 border-r border-line-soft hover:bg-ink-800 transition-colors">
          <span className="font-display font-semibold text-[11px] text-fog-300">{it.sym}</span>
          <Flash value={it.px} format={(n) => (n >= 1000 ? n.toFixed(0) : n.toFixed(2))} className="num text-[11px] text-fog-100" />
          <span className={`num text-[10.5px] ${it.ch >= 0 ? "text-up" : "text-down"}`}>{it.ch >= 0 ? "▲" : "▼"}{Math.abs(it.ch).toFixed(2)}%</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="shrink-0 overflow-hidden border-b border-line hidden md:block" style={{ background: "rgba(7,12,22,0.6)" }}>
      <div className="ticker-track flex w-max">{row("a")}{row("b")}</div>
    </div>
  );
}

function LockReview() {
  const { state: s, dispatch } = useApp();
  if (!s.lock) return null;
  const sessionTrades = s.trades.filter((t) => t.exitTick >= s.sessionStartTick);
  const viol = s.violations.filter((v) => v.at >= s.sessionStartTick);
  const worstEmo = (() => {
    const map = new Map<string, number>();
    sessionTrades.forEach((t) => map.set(t.checkin.emotion, (map.get(t.checkin.emotion) ?? 0) + (t.r < 0 ? 1 : 0)));
    let worst = "—", n = 0;
    map.forEach((v, k) => { if (v > n) { n = v; worst = k; } });
    return worst;
  })();

  return (
    <Modal open locked wide title={<span className="flex items-center gap-2 text-down"><Ic.lock size={16} /> Mandatory session review</span>}>
      <p className="text-[13px] text-fog-300 leading-relaxed mb-4">
        The daily loss limit exists so a bad day stays a bad day. Trading is locked until you review this session — honestly.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        {[
          { k: "Session loss", v: fmtSigned(s.lock.loss, 0), tone: "#e0564f" },
          { k: "Trades taken", v: `${sessionTrades.length}`, tone: "#eef3fa" },
          { k: "Violations", v: `${viol.length}`, tone: viol.length ? "#e0564f" : "#2fb98c" },
          { k: "Most-losing state", v: worstEmo, tone: "#e0a33b" },
        ].map((c) => (
          <div key={c.k} className="panel-inset p-3">
            <p className="lbl">{c.k}</p>
            <p className="num text-[17px] font-semibold mt-1 capitalize" style={{ color: c.tone }}>{c.v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-4 mb-5" style={{ background: "rgba(224,163,59,0.07)", border: "1px solid rgba(224,163,59,0.35)" }}>
        <p className="text-[12.5px] text-fog-300 leading-relaxed">
          <strong className="text-amber">The only question that matters:</strong> which loss was the cost of doing business, and which one was you?
          The journal knows the difference. If more than half were you, tomorrow's mission list just got very specific.
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex items-center gap-2 text-fog-500 text-[11.5px]">
          <span className="w-6 h-6 rounded-full flex items-center justify-center animate-breathe text-teal" style={{ border: "1px solid rgba(57,197,165,0.4)" }}><Ic.brain size={12} /></span>
          Three slow breaths. Then file any pending journals.
        </div>
        <button className="btn btn-teal !px-6" onClick={() => dispatch({ type: "ACK_LOCK" })}>
          Review complete — open session {s.session + 1}
        </button>
      </div>
    </Modal>
  );
}
