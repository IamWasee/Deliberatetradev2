/* Formula playground - math that feeds on your live history. */
import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";

export default function Learn() {
  const { state: s } = useApp();
  const stats = useMemo(() => {
    const n = s.trades.length;
    const wins = s.trades.filter((t) => t.pnl > 0).length;
    const winRate = n ? wins / n : 0;
    const avgWin = n ? s.trades.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0) / Math.max(1, wins) : 0;
    const losses = s.trades.filter((t) => t.pnl <= 0);
    const avgLoss = n ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) / Math.max(1, losses.length) : 0;
    const expectancy = n ? winRate * avgWin - (1 - winRate) * avgLoss : 0;
    return { n, winRate, avgWin, avgLoss, expectancy };
  }, [s.trades]);

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        <div className="panel p-4 animate-fade-up">
          <h2 className="font-display font-bold text-[17px] text-fog-100 mb-1">Formula playground</h2>
          <p className="text-[12px] text-fog-500 leading-relaxed max-w-2xl">
            Every calculator loads <strong className="text-fog-300">your live numbers</strong> by default. Change anything - the point is to feel how sizing, expectancy and ruin interact before real money teaches you.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-3.5">
          <PositionSizer equity={s.equity} planRisk={s.plan?.riskPerTradePct ?? 1} />
          <ExpectancyLab winRate={stats.winRate || 0.5} rr={stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 2} hasData={stats.n >= 5} n={stats.n} expectancy={stats.expectancy} />
          <RiskOfRuin winRate={stats.winRate || 0.5} rr={stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 2} />
          <KellyLab winRate={stats.winRate || 0.5} rr={stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 2} />
        </div>

        <div className="panel p-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <p className="lbl mb-2.5">Your live sample</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 num text-[12px]">
            {[
              ["Closed trades", String(stats.n)],
              ["Win rate", (stats.winRate * 100).toFixed(1) + "%"],
              ["Avg win", "$" + stats.avgWin.toFixed(0)],
              ["Avg loss", "$" + stats.avgLoss.toFixed(0)],
              ["Expectancy / trade", "$" + stats.expectancy.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k} className="panel-inset p-3">
                <p className="lbl mb-1" style={{ fontSize: 8.5 }}>{k}</p>
                <p className={"text-[16px] font-semibold " + (k.includes("Expectancy") ? (stats.expectancy >= 0 ? "text-up" : "text-down") : "text-fog-100")}>{v}</p>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-fog-600 mt-3 leading-snug">
            Under ~30 trades these numbers are noise, not edge. The playground is honest about that - so should you be.
          </p>
        </div>
      </div>
    </div>
  );
}

const L = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="lbl block mb-1.5">{label}</span>{children}</label>
);
const Num = ({ v, set, step = 1, min = 0 }: { v: number; set: (n: number) => void; step?: number; min?: number }) => (
  <input type="number" className="field num" value={Number.isFinite(v) ? Number(v.toFixed(4)) : min} step={step} min={min}
    onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(n); }} />
);
const Card = ({ title, sub, children }: { title: string; sub: string; children: ReactNode }) => (
  <div className="panel p-4 animate-fade-up">
    <p className="font-display font-bold text-[14.5px] text-fog-100">{title}</p>
    <p className="text-[11px] text-fog-500 mb-3.5">{sub}</p>
    {children}
  </div>
);

function PositionSizer({ equity, planRisk }: { equity: number; planRisk: number }) {
  const [risk, setRisk] = useState(planRisk);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(97);
  const risk$ = (risk / 100) * equity;
  const dist = Math.abs(entry - stop);
  const qty = dist > 0 ? Math.floor(risk$ / dist) : 0;
  return (
    <Card title="Position sizing" sub="size = planned risk / stop distance - never the other way around">
      <div className="grid grid-cols-3 gap-2.5 mb-3.5">
        <L label={"Risk % of $" + equity.toFixed(0)}><Num v={risk} set={setRisk} step={0.25} min={0.25} /></L>
        <L label="Entry"><Num v={entry} set={setEntry} step={0.5} /></L>
        <L label="Stop"><Num v={stop} set={setStop} step={0.5} /></L>
      </div>
      <div className="panel-inset p-3.5 flex items-center justify-between">
        <div>
          <p className="lbl mb-1" style={{ fontSize: 8.5 }}>Risk per trade</p>
          <p className="num text-[18px] font-semibold text-fog-100">${risk$.toFixed(0)} <span className="text-[11px] text-fog-500">({risk}%)</span></p>
        </div>
        <div className="text-right">
          <p className="lbl mb-1" style={{ fontSize: 8.5 }}>Position size</p>
          <p className="num text-[22px] font-semibold text-teal">{qty} <span className="text-[11px] text-fog-500">shares</span></p>
        </div>
      </div>
      {dist === 0 && <p className="text-[11px] text-down mt-2">Entry and stop can't be the same price - that's not a trade, it's a donation.</p>}
    </Card>
  );
}

function ExpectancyLab({ winRate, rr, hasData, n, expectancy }: { winRate: number; rr: number; hasData: boolean; n: number; expectancy: number }) {
  const [w, setW] = useState(Math.round(winRate * 100));
  const [r, setR] = useState(Number(rr.toFixed(2)));
  const exp = (w / 100) * r - (1 - w / 100);
  return (
    <Card title="Expectancy" sub="E = (win% x reward) - (loss% x 1R) - the only number that predicts survival">
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <L label="Win rate %"><Num v={w} set={setW} step={1} min={0} /></L>
        <L label="Reward : Risk"><Num v={r} set={setR} step={0.1} min={0.1} /></L>
      </div>
      <div className="panel-inset p-3.5 flex items-center justify-between">
        <div>
          <p className="lbl mb-1" style={{ fontSize: 8.5 }}>Expectancy per 1R</p>
          <p className={"num text-[22px] font-semibold " + (exp >= 0 ? "text-up" : "text-down")}>{(exp >= 0 ? "+" : "") + exp.toFixed(3)}R</p>
        </div>
        <p className="text-[10.5px] text-fog-500 leading-snug text-right max-w-[190px]">
          {exp >= 0.1 ? "A real edge - if the sample is big enough and execution holds." :
           exp >= 0 ? "Breakeven-ish. Fees and slippage eat this alive." :
           "Negative. No sizing trick fixes a negative expectation."}
        </p>
      </div>
      {hasData ? (
        <p className="text-[10.5px] text-fog-500 mt-2.5 num">Your history ({n} trades): win {(winRate * 100).toFixed(0)}% - R:R {rr.toFixed(2)} - ${expectancy.toFixed(2)}/trade</p>
      ) : (
        <p className="text-[10.5px] text-fog-600 mt-2.5">Close 5+ trades and your real numbers load here automatically.</p>
      )}
    </Card>
  );
}

function RiskOfRuin({ winRate, rr }: { winRate: number; rr: number }) {
  const [riskPct, setRiskPct] = useState(1);
  const [target, setTarget] = useState(25);
  const e = winRate * rr - (1 - winRate);
  const units = Math.max(1, target / Math.max(0.25, riskPct));
  let p = 0;
  if (e <= 0) p = 1;
  else {
    const base = (1 - e / (1 + rr)) / (1 + e / (1 + rr));
    p = Math.pow(Math.min(1, Math.max(0, base)), units);
  }
  const tone = p > 0.4 ? "#e0564f" : p > 0.15 ? "#e0a33b" : "#2fb98c";
  return (
    <Card title="Risk of ruin" sub="the probability your account hits the wall before the goal">
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <L label="Risk per trade %"><Num v={riskPct} set={setRiskPct} step={0.25} min={0.25} /></L>
        <L label="Goal (R multiples)"><Num v={target} set={setTarget} step={5} min={5} /></L>
      </div>
      <div className="panel-inset p-3.5 flex items-center justify-between">
        <div>
          <p className="lbl mb-1" style={{ fontSize: 8.5 }}>Ruin probability</p>
          <p className="num text-[22px] font-semibold" style={{ color: tone }}>{(p * 100).toFixed(1)}%</p>
        </div>
        <p className="text-[10.5px] text-fog-500 leading-snug text-right max-w-[200px]">
          at {riskPct}% risk/trade, {(winRate * 100).toFixed(0)}% wins, {rr.toFixed(1)}R payoff
        </p>
      </div>
      <p className="text-[10.5px] text-fog-600 mt-2.5">Halving risk per trade roughly squares your survival odds. Read that again.</p>
    </Card>
  );
}

function KellyLab({ winRate, rr }: { winRate: number; rr: number }) {
  const kelly = Math.max(0, (winRate * (1 + rr) - 1) / rr);
  const [frac, setFrac] = useState(25);
  const use = kelly * (frac / 100);
  return (
    <Card title="Kelly criterion" sub="the mathematically optimal bet - and why nobody sane uses full Kelly">
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <div className="panel-inset p-3">
          <p className="lbl mb-1" style={{ fontSize: 8.5 }}>Full Kelly</p>
          <p className="num text-[20px] font-semibold text-fog-100">{(kelly * 100).toFixed(1)}%</p>
        </div>
        <L label="Fraction used %"><Num v={frac} set={setFrac} step={5} min={5} /></L>
      </div>
      <div className="panel-inset p-3.5 flex items-center justify-between">
        <div>
          <p className="lbl mb-1" style={{ fontSize: 8.5 }}>Suggested risk</p>
          <p className="num text-[22px] font-semibold text-teal">{(use * 100).toFixed(2)}%</p>
        </div>
        <p className="text-[10.5px] text-fog-500 leading-snug text-right max-w-[210px]">
          Full Kelly assumes you know your exact edge. You don't. Quarter-Kelly keeps the growth and dumps most of the variance.
        </p>
      </div>
    </Card>
  );
}
