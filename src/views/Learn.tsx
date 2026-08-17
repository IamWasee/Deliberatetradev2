import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";
import { Ic } from "../components/ui";

type Tab = "size" | "ev" | "ruin" | "kelly";

export default function Learn() {
  const { state: s } = useApp();
  const [tab, setTab] = useState<Tab>("size");

  const live = useMemo(() => {
    const ts = s.trades;
    const wins = ts.filter((t) => t.r > 0);
    const losses = ts.filter((t) => t.r <= 0);
    return {
      winRate: ts.length ? wins.length / ts.length : 0.45,
      avgWin: wins.length ? wins.reduce((a, t) => a + t.r, 0) / wins.length : 1.5,
      avgLoss: losses.length ? Math.abs(losses.reduce((a, t) => a + t.r, 0) / losses.length) : 1,
      n: ts.length,
      equity: s.equity || 25000,
      riskPct: s.plan?.riskPerTradePct ?? 1,
    };
  }, [s.trades, s.equity, s.plan]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "size", label: "Position sizing" },
    { id: "ev", label: "Expectancy" },
    { id: "ruin", label: "Risk of ruin" },
    { id: "kelly", label: "Kelly criterion" },
  ];

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        <div className="panel p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="mr-auto">
            <h2 className="font-display font-bold text-[17px] text-fog-100">Formula playground</h2>
            <p className="text-[12px] text-fog-500 mt-0.5 max-w-md leading-snug">Theory you can't feel is trivia. Drag the numbers — then load your own history and see what the math says about <em>you</em>.</p>
          </div>
          <div className="num text-[11.5px] text-fog-500 space-y-0.5 text-right">
            <p>your sample: <strong className="text-fog-200">{live.n} trades</strong></p>
            <p>win {(live.winRate * 100).toFixed(0)}% · win {live.avgWin.toFixed(2)}R · loss −{live.avgLoss.toFixed(2)}R</p>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="btn !py-1.5 !text-[12px]"
              style={tab === t.id ? { background: "#39c5a5", color: "#062019" } : { background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="panel p-5 animate-fade-in" key={tab}>
          {tab === "size" && <SizeLab live={live} />}
          {tab === "ev" && <EvLab live={live} />}
          {tab === "ruin" && <RuinLab live={live} />}
          {tab === "kelly" && <KellyLab live={live} />}
        </div>

        <div className="panel p-5">
          <p className="lbl mb-3 flex items-center gap-2"><Ic.zap size={13} className="text-amber" /> Theory → live execution bridge</p>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              { t: "The 2R exercise", b: "Open the terminal, find a setup where target distance is ≥ 2× stop distance, size it to plan risk, and execute. Your Practice tab scores it.", step: "Drill" },
              { t: "ATR stops, right now", b: "The ticket shows a 1.5×ATR stop suggestion for the live symbol. Use it on your next three trades and compare slippage vs tighter stops.", step: "Drill" },
              { t: "The expectancy audit", b: "Pull your rolling expectancy on the Dashboard. If it's negative over 20+ trades, stop adding setups — subtract them.", step: "Audit" },
            ].map((c) => (
              <div key={c.t} className="panel-inset p-4 lift">
                <p className="lbl !text-[9px] mb-1.5 text-teal">{c.step}</p>
                <p className="font-display font-semibold text-[13.5px] text-fog-100 mb-1">{c.t}</p>
                <p className="text-[11.5px] text-fog-500 leading-relaxed">{c.b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type Live = { winRate: number; avgWin: number; avgLoss: number; n: number; equity: number; riskPct: number };

const L = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <label className="lbl block mb-1.5">{label}</label>
    {children}
  </div>
);
const Num = ({ v, set, step = 1, min = 0 }: { v: number; set: (n: number) => void; step?: number; min?: number }) => (
  <input type="number" className="field num" value={Number(v.toFixed(4))} step={step} min={min}
    onChange={(e) => set(Number(e.target.value))} />
);
const Slider = ({ label, v, set, min, max, step, fmt }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1">
      <label className="lbl">{label}</label><span className="num text-[14px] text-teal font-medium">{fmt(v)}</span>
    </div>
    <input type="range" className="w-full" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
  </div>
);
const Out = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
  <div className="flex justify-between items-baseline py-1.5 border-b border-line-soft last:border-0">
    <span className="text-[12px] text-fog-500">{k}</span>
    <span className="num text-[15px] font-semibold" style={{ color: tone ?? "#eef3fa" }}>{v}</span>
  </div>
);
const LoadLive = ({ onClick, label = "Load my live numbers" }: { onClick: () => void; label?: string }) => (
  <button className="btn btn-ghost !py-1.5 !text-[11.5px] !text-ice" onClick={onClick} style={{ borderColor: "rgba(111,182,232,0.4)" }}>
    <Ic.pulse size={13} /> {label}
  </button>
);

function SizeLab({ live }: { live: Live }) {
  const [equity, setEquity] = useState(live.equity);
  const [risk, setRisk] = useState(live.riskPct);
  const [entry, setEntry] = useState(138.6);
  const [stop, setStop] = useState(135.2);
  const dist = Math.abs(entry - stop) || 0.0001;
  const risk$ = (equity * risk) / 100;
  const qty = Math.floor(risk$ / dist);
  const notional = qty * entry;
  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-6">
      <div className="space-y-4">
        <L label="Account equity ($)"><Num v={equity} set={setEquity} step={500} /></L>
        <Slider label="Risk per trade" v={risk} set={setRisk} min={0.25} max={3} step={0.25} fmt={(n) => `${n}%`} />
        <div className="grid grid-cols-2 gap-3">
          <L label="Entry price"><Num v={entry} set={setEntry} step={0.1} /></L>
          <L label="Stop price"><Num v={stop} set={setStop} step={0.1} /></L>
        </div>
        <LoadLive onClick={() => { setEquity(live.equity); setRisk(live.riskPct); }} />
      </div>
      <div className="panel-inset p-4 h-fit">
        <p className="lbl mb-2">Result</p>
        <Out k="Dollar risk" v={`$${risk$.toFixed(0)}`} />
        <Out k="Stop distance" v={`$${dist.toFixed(2)}`} />
        <Out k="Position size" v={`${qty} sh`} tone="#39c5a5" />
        <Out k="Notional" v={`$${notional.toLocaleString()}`} />
        <Out k="Leverage" v={`${(notional / Math.max(1, equity)).toFixed(2)}×`} tone={notional > equity * 2 ? "#e0564f" : undefined} />
        <p className="text-[11px] text-fog-600 leading-snug mt-3">The ticket does this automatically from your stop distance — the formula is the reason the ticket won't let you wing it.</p>
      </div>
    </div>
  );
}

function EvLab({ live }: { live: Live }) {
  const [winRate, setWinRate] = useState(live.winRate * 100);
  const [win, setWin] = useState(live.avgWin);
  const [loss, setLoss] = useState(live.avgLoss);
  const p = winRate / 100;
  const ev = p * win - (1 - p) * loss;
  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-6">
      <div className="space-y-4">
        <Slider label="Win rate" v={winRate} set={setWinRate} min={10} max={90} step={1} fmt={(n) => `${n}%`} />
        <Slider label="Average winner" v={win} set={setWin} min={0.2} max={5} step={0.1} fmt={(n) => `+${n.toFixed(1)}R`} />
        <Slider label="Average loser" v={loss} set={setLoss} min={0.2} max={3} step={0.1} fmt={(n) => `−${n.toFixed(1)}R`} />
        <LoadLive onClick={() => { setWinRate(Math.round(live.winRate * 100)); setWin(live.avgWin); setLoss(live.avgLoss); }} />
      </div>
      <div className="panel-inset p-4 h-fit">
        <p className="lbl mb-2">Result</p>
        <Out k="Expectancy / trade" v={`${ev >= 0 ? "+" : ""}${ev.toFixed(3)}R`} tone={ev >= 0 ? "#2fb98c" : "#e0564f"} />
        <Out k="Over 100 trades" v={`${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(0)}R`} tone={ev >= 0 ? "#2fb98c" : "#e0564f"} />
        <Out k="Break-even win rate" v={`${((loss / (loss + win)) * 100).toFixed(0)}%`} />
        <p className="text-[11px] text-fog-600 leading-snug mt-3">
          {ev >= 0 ? "Positive. Now the only question is variance — and whether you can execute it 100 times without drifting." : "Negative expectancy. No sizing or psychology fix rescues a negative edge — fix the setups first."}
        </p>
      </div>
    </div>
  );
}

function RuinLab({ live }: { live: Live }) {
  const [riskPct, setRiskPct] = useState(live.riskPct);
  const [winRate, setWinRate] = useState(live.winRate * 100);
  const [win, setWin] = useState(live.avgWin);
  const [loss, setLoss] = useState(live.avgLoss);
  const p = winRate / 100;
  const edge = p * win - (1 - p) * loss; // R per trade
  const N = 50 / Math.max(0.25, riskPct); // account in R units at 50% drawdown threshold
  const a = edge / Math.max(0.3, loss);
  const ror = a <= 0 ? 100 : Math.min(100, Math.pow((1 - a) / (1 + a), N) * 100);
  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-6">
      <div className="space-y-4">
        <Slider label="Risk per trade" v={riskPct} set={setRiskPct} min={0.25} max={5} step={0.25} fmt={(n) => `${n}%`} />
        <Slider label="Win rate" v={winRate} set={setWinRate} min={10} max={90} step={1} fmt={(n) => `${n}%`} />
        <div className="grid grid-cols-2 gap-3">
          <L label="Avg win (R)"><Num v={win} set={setWin} step={0.1} /></L>
          <L label="Avg loss (R)"><Num v={loss} set={setLoss} step={0.1} /></L>
        </div>
        <LoadLive onClick={() => { setRiskPct(live.riskPct); setWinRate(Math.round(live.winRate * 100)); setWin(live.avgWin); setLoss(live.avgLoss); }} />
      </div>
      <div className="panel-inset p-4 h-fit">
        <p className="lbl mb-2">Result · approx.</p>
        <Out k="Edge per trade" v={`${edge >= 0 ? "+" : ""}${edge.toFixed(2)}R`} tone={edge >= 0 ? "#2fb98c" : "#e0564f"} />
        <Out k="Risk of halving the account" v={`${ror < 0.1 ? "<0.1" : ror.toFixed(1)}%`} tone={ror > 30 ? "#e0564f" : ror > 10 ? "#e0a33b" : "#2fb98c"} />
        <p className="text-[11px] text-fog-600 leading-snug mt-3">Halving the account is the practical definition of ruin — it's the point most traders quit or blow the rest. Watch how violently sizing moves the number.</p>
      </div>
    </div>
  );
}

function KellyLab({ live }: { live: Live }) {
  const [winRate, setWinRate] = useState(live.winRate * 100);
  const [win, setWin] = useState(live.avgWin);
  const [loss, setLoss] = useState(live.avgLoss);
  const p = winRate / 100;
  const b = win / Math.max(0.01, loss);
  const kelly = Math.max(0, (p * b - (1 - p)) / b);
  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-6">
      <div className="space-y-4">
        <Slider label="Win rate" v={winRate} set={setWinRate} min={10} max={90} step={1} fmt={(n) => `${n}%`} />
        <div className="grid grid-cols-2 gap-3">
          <L label="Avg win (R)"><Num v={win} set={setWin} step={0.1} /></L>
          <L label="Avg loss (R)"><Num v={loss} set={setLoss} step={0.1} /></L>
        </div>
        <LoadLive onClick={() => { setWinRate(Math.round(live.winRate * 100)); setWin(live.avgWin); setLoss(live.avgLoss); }} />
      </div>
      <div className="panel-inset p-4 h-fit">
        <p className="lbl mb-2">Result</p>
        <Out k="Win/loss ratio" v={`${b.toFixed(2)} : 1`} />
        <Out k="Full Kelly" v={`${(kelly * 100).toFixed(1)}%`} />
        <Out k="Half Kelly (sane)" v={`${(kelly * 50).toFixed(1)}%`} tone="#39c5a5" />
        <p className="text-[11px] text-fog-600 leading-snug mt-3">
          Full Kelly assumes your estimates are perfect — yours come from {live.n} trades. Half Kelly keeps ~75% of the growth at ~50% of the volatility. Professionals quote Kelly; almost none bet it.
        </p>
      </div>
    </div>
  );
}
