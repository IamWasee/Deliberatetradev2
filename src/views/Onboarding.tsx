import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { DEFAULT_SETUPS, FRICTIONS, FORBIDDEN, type FrictionMode, type Plan } from "../lib/types";
import { Ic, Segmented } from "../components/ui";

const STEPS = ["Capital", "Risk rules", "Discipline", "Sign"];

export default function Onboarding() {
  const { dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [capital, setCapital] = useState(25000);
  const [friction, setFriction] = useState<FrictionMode>("realistic");
  const [riskPct, setRiskPct] = useState(1);
  const [dailyLoss, setDailyLoss] = useState(3);
  const [openRisk, setOpenRisk] = useState(4);
  const [maxPos, setMaxPos] = useState(3);
  const [forbidden, setForbidden] = useState<string[]>(["no-stop", "moving-stops", "revenge-trading"]);
  const [setups, setSetups] = useState<string[]>(DEFAULT_SETUPS.slice(0, 3));
  const [newSetup, setNewSetup] = useState("");
  const [signature, setSignature] = useState("");

  const plannedRisk$ = useMemo(() => (capital * riskPct) / 100, [capital, riskPct]);
  const canNext = step === 0 ? capital >= 1000 : step === 3 ? signature.trim().length >= 2 : true;

  const toggleF = (id: string) =>
    setForbidden((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const finish = () => {
    const plan: Plan = {
      version: 1, createdAt: Date.now(), startingCapital: capital,
      riskPerTradePct: riskPct, maxDailyLossPct: dailyLoss, maxOpenRiskPct: openRisk,
      maxPositions: maxPos, forbidden, setups,
      note: `Signed by ${signature.trim()} — this plan is a contract with myself.`,
    };
    dispatch({ type: "SET_FRICTION", mode: friction });
    dispatch({ type: "CREATE_PLAN", plan, name: signature.trim() });
  };

  return (
    <div className="h-full overflow-y-auto bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative max-w-3xl mx-auto px-6 py-10">
        {/* opening — not a hero, a contract brief */}
        <div className="flex items-center gap-3 mb-2 animate-fade-up">
          <Ic.logo size={34} />
          <div>
            <p className="font-display font-bold text-[19px] text-fog-100 leading-none">DeliberateTrade</p>
            <p className="text-[11px] text-fog-500 mt-1 tracking-wide">Paper trading that hurts enough to teach you.</p>
          </div>
        </div>
        <h1 className="font-display font-bold text-fog-100 text-[clamp(26px,4vw,38px)] leading-[1.08] mt-7 animate-fade-up" style={{ animationDelay: "60ms" }}>
          You don't get a chart.<br />
          <span className="text-teal">You get a contract first.</span>
        </h1>
        <p className="text-fog-400 text-[14px] leading-relaxed max-w-xl mt-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
          Pilots file a flight plan before takeoff. Surgeons run a checklist before the first cut.
          Here, your <strong className="text-fog-200">written trading plan is locked and versioned</strong> before
          your first order — and every engine on this platform enforces it: circuit breakers, the Tilt Detector,
          mandatory journals, injected stress. P&amp;L is a byproduct. Process is the product.
        </p>

        {/* stepper */}
        <div className="flex items-center gap-1.5 mt-8 mb-5 animate-fade-up" style={{ animationDelay: "180ms" }}>
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-all duration-300 ${i === step ? "text-ink-950" : i < step ? "text-teal" : "text-fog-600"}`}
                style={{ background: i === step ? "#39c5a5" : "#111b30", border: `1px solid ${i === step ? "#39c5a5" : "#1c2942"}` }}>
                {i < step ? <Ic.check size={12} /> : <span className="num">{i + 1}</span>}
                <span className={i === step ? "" : "hidden sm:inline"}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-5 h-px" style={{ background: "#24344f" }} />}
            </div>
          ))}
        </div>

        <div className="panel p-6 md:p-7 animate-fade-up" style={{ animationDelay: "240ms" }}>
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <label className="lbl block mb-2">Starting capital (paper)</label>
                <div className="flex items-center gap-3">
                  <span className="num text-[30px] font-semibold text-fog-100">$</span>
                  <input type="number" className="field num text-[24px] max-w-[240px]" value={capital} min={1000} step={1000}
                    onChange={(e) => { const n = Number(e.target.value); setCapital(Number.isFinite(n) ? Math.max(0, n) : 0); }} />
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {[10000, 25000, 50000, 100000].map((v) => (
                    <button key={v} onClick={() => setCapital(v)}
                      className={`btn ${capital === v ? "btn-teal" : "btn-ghost"} !py-1.5 !px-3 !text-[12px]`}>${v.toLocaleString()}</button>
                  ))}
                </div>
                <p className="text-[12px] text-fog-500 mt-2.5">Pick the size you'd actually fund. A $100k fantasy account trains fantasy habits.</p>
              </div>
              <div>
                <label className="lbl block mb-2">Market friction</label>
                <Segmented size="md" value={friction} onChange={setFriction}
                  options={[{ id: "easy", label: "Easy" }, { id: "realistic", label: "Realistic" }, { id: "brutal", label: "Brutal" }]} />
                <p className="text-[12.5px] text-fog-400 mt-2.5 leading-relaxed">
                  <span className="text-amber font-semibold">{FRICTIONS[friction].tag}.</span> {FRICTIONS[friction].desc}
                </p>
                <ul className="mt-2 space-y-1">
                  {FRICTIONS[friction].features.map((f) => (
                    <li key={f} className="text-[12px] text-fog-500 flex items-center gap-2">
                      <span className="text-teal"><Ic.check size={12} /></span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              {[
                { label: "Max risk per trade", v: riskPct, set: setRiskPct, min: 0.25, max: 3, step: 0.25, hint: `Every order ticket will size from this. Currently $${plannedRisk$.toFixed(0)} per trade.`, fmt: (x: number) => `${x}%` },
                { label: "Max daily loss — hard circuit breaker", v: dailyLoss, set: setDailyLoss, min: 1, max: 10, step: 0.5, hint: `Hit −$${((capital * dailyLoss) / 100).toFixed(0)} in a session and trading locks until a mandatory review.`, fmt: (x: number) => `${x}%` },
                { label: "Max total open risk", v: openRisk, set: setOpenRisk, min: 1, max: 12, step: 0.5, hint: "Sum of planned risk across all positions. Beyond this, new entries are blocked.", fmt: (x: number) => `${x}%` },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="lbl">{r.label}</label>
                    <span className="num text-[17px] font-semibold text-teal">{r.fmt(r.v)}</span>
                  </div>
                  <input type="range" min={r.min} max={r.max} step={r.step} value={r.v}
                    onChange={(e) => r.set(Number(e.target.value))} className="w-full" />
                  <p className="text-[12px] text-fog-500 mt-1.5">{r.hint}</p>
                </div>
              ))}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="lbl">Max concurrent positions</label>
                  <span className="num text-[17px] font-semibold text-teal">{maxPos}</span>
                </div>
                <input type="range" min={1} max={6} step={1} value={maxPos} onChange={(e) => setMaxPos(Number(e.target.value))} className="w-full" />
                <p className="text-[12px] text-fog-500 mt-1.5">Focus beats diversification at this stage.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="lbl block mb-2.5">Forbidden actions — the platform enforces these</label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {FORBIDDEN.map((f) => {
                    const on = forbidden.includes(f.id);
                    return (
                      <button key={f.id} onClick={() => toggleF(f.id)}
                        className={`text-left p-3 rounded-lg transition-all duration-150 ${on ? "" : "opacity-55 hover:opacity-80"}`}
                        style={{ background: on ? "rgba(224,86,79,0.1)" : "#0a1120", border: `1px solid ${on ? "rgba(224,86,79,0.5)" : "#1c2942"}` }}>
                        <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: on ? "#e8837d" : "#c3cfdf" }}>
                          <span style={{ color: on ? "#e0564f" : "#4d5f78" }}><Ic.lock size={13} /></span>
                          {f.label}
                        </span>
                        <span className="block text-[11.5px] text-fog-500 mt-1 leading-snug">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="lbl block mb-2.5">My named setups — every trade gets tagged to one</label>
                <div className="flex flex-wrap gap-2">
                  {setups.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-teal"
                      style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.4)" }}>
                      {s}
                      <button onClick={() => setSetups(setups.filter((x) => x !== s))} className="text-teal/60 hover:text-down transition-colors"><Ic.x size={11} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-2.5">
                  <input className="field" placeholder="Add a setup name…" value={newSetup} onChange={(e) => setNewSetup(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newSetup.trim()) { setSetups([...setups, newSetup.trim()]); setNewSetup(""); } }} />
                  <button className="btn btn-ghost shrink-0" onClick={() => { if (newSetup.trim()) { setSetups([...setups, newSetup.trim()]); setNewSetup(""); } }}>
                    <Ic.plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="panel-inset p-4 text-[12.5px] leading-relaxed text-fog-300">
                <p className="lbl mb-2.5">Trading Plan v1 — summary</p>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 num text-[12.5px]">
                  <span className="text-fog-500">Capital</span><span>${capital.toLocaleString()}</span>
                  <span className="text-fog-500">Risk / trade</span><span>{riskPct}% (${plannedRisk$.toFixed(0)})</span>
                  <span className="text-fog-500">Daily loss lock</span><span>{dailyLoss}%</span>
                  <span className="text-fog-500">Max open risk</span><span>{openRisk}%</span>
                  <span className="text-fog-500">Max positions</span><span>{maxPos}</span>
                  <span className="text-fog-500">Friction</span><span>{FRICTIONS[friction].label}</span>
                  <span className="text-fog-500">Forbidden</span><span className="font-body">{forbidden.length} rules locked</span>
                  <span className="text-fog-500">Setups</span><span className="font-body">{setups.join(", ") || "—"}</span>
                </div>
              </div>
              <p className="text-[13px] text-fog-400 leading-relaxed">
                This plan is <strong className="text-fog-200">locked and versioned</strong>. Amending it later requires a written reason,
                and every amendment is archived — because rewriting rules mid-drawdown is exactly the habit this platform exists to break.
              </p>
              <div>
                <label className="lbl block mb-2">Sign your plan</label>
                <input className="field font-display text-[16px]" placeholder="Type your full name" value={signature}
                  onChange={(e) => setSignature(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-7 pt-5 border-t border-line">
            <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            {step < 3 ? (
              <button className="btn btn-teal" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Continue <span className="opacity-70">→</span>
              </button>
            ) : (
              <button className="btn btn-teal !px-6" disabled={!canNext} onClick={finish}>
                <Ic.lock size={14} /> Lock plan v1 & open the desk
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-fog-600 mt-5 leading-relaxed max-w-xl">
          Educational simulation only — no real funds, no real orders, no real brokerage.
          Simulated friction models approximate, never replicate, live markets.
        </p>
      </div>
    </div>
  );
}
