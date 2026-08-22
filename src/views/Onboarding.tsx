/* Onboarding — forces a written, signed, versioned trading plan before
   the first order can exist. */
import { useState } from "react";
import { useApp } from "../lib/store";
import { FORBIDDEN_ACTIONS, type FrictionMode, type Plan } from "../lib/types";
import { Ic, Segmented } from "../components/ui";
import { ConsentCheck, DisclaimerFooter, LEGAL } from "../components/LegalKit";

const SETUP_PRESETS = ["Breakout", "Pullback", "Range fade", "Trend continuation", "Reversal", "News fade"];

export default function Onboarding() {
  const { dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [capital, setCapital] = useState(25000);
  const [friction, setFriction] = useState<FrictionMode>("realistic");
  const [riskPerTrade, setRiskPerTrade] = useState(1);
  const [maxDailyLoss, setMaxDailyLoss] = useState(3);
  const [maxOpenRisk, setMaxOpenRisk] = useState(4);
  const [maxPositions, setMaxPositions] = useState(3);
  const [forbidden, setForbidden] = useState<string[]>(["no-stop", "revenge"]);
  const [setups, setSetups] = useState<string[]>(["Breakout", "Pullback"]);
  const [customSetup, setCustomSetup] = useState("");
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);

  const steps = ["Identity & capital", "Risk rules", "Forbidden actions & setups", "Sign the contract"];

  const toggleForbidden = (id: string) =>
    setForbidden((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const toggleSetup = (s: string) =>
    setSetups((f) => (f.includes(s) ? f.filter((x) => x !== s) : f.length >= 5 ? f : [...f, s]));

  const canNext =
    step === 0 ? name.trim().length >= 2 && capital >= 1000 :
    step === 1 ? riskPerTrade > 0 && maxDailyLoss > 0 && maxOpenRisk > 0 :
    step === 2 ? setups.length >= 1 :
    signature.trim().length >= 3 && consent;

  const finish = () => {
    const plan: Plan = {
      version: 1, createdAt: Date.now(), startingCapital: capital,
      riskPerTradePct: riskPerTrade, maxDailyLossPct: maxDailyLoss,
      maxOpenRiskPct: maxOpenRisk, maxPositions,
      forbidden, setups, note: note.trim(),
    };
    dispatch({ type: "CREATE_PLAN", name: name.trim(), plan, legalAcceptedAt: Date.now() });
  };

  return (
    <div className="h-full overflow-y-auto bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2.5 mb-1 animate-fade-in">
          <span className="text-teal"><Ic.logo size={28} /></span>
          <h1 className="font-display font-bold text-[22px] text-fog-100">Deliberate<span className="text-teal">Trade</span></h1>
        </div>
        <p className="text-[12.5px] text-fog-400 mb-8">No trades happen until this contract exists. That's the first lesson.</p>

        {/* progress */}
        <div className="flex items-center gap-2 mb-7">
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div className="h-[3px] rounded-full transition-all duration-500"
                style={{ background: i < step ? "#39c5a5" : i === step ? "#e0a33b" : "#1c2942" }} />
              <p className={`text-[9.5px] mt-1.5 lbl ${i === step ? "!text-amber" : ""}`}>{s}</p>
            </div>
          ))}
        </div>

        <div className="panel p-6 md:p-7 animate-pop" key={step}>
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-bold text-[18px] text-fog-100 mb-1">Who's at the desk?</h2>
                <p className="text-[12px] text-fog-500 mb-3">Your name appears on your readiness report.</p>
                <input className="field max-w-[320px]" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="lbl block mb-1.5">Starting virtual capital</label>
                <div className="flex items-center gap-3">
                  <input type="number" className="field num text-[24px] max-w-[240px]" value={capital} min={1000} step={1000}
                    onChange={(e) => { const n = Number(e.target.value); setCapital(Number.isFinite(n) ? Math.max(0, n) : 0); }} />
                  <div className="flex gap-1.5">
                    {[10000, 25000, 50000, 100000].map((c) => (
                      <button key={c} onClick={() => setCapital(c)}
                        className="num text-[11px] px-2.5 py-1.5 rounded-md transition-all"
                        style={{ background: capital === c ? "rgba(57,197,165,0.15)" : "#0a1120", border: `1px solid ${capital === c ? "#39c5a5" : "#1c2942"}`, color: capital === c ? "#39c5a5" : "#6b7d96" }}>
                        ${c / 1000}k
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-fog-600 mt-1.5">Pick what a real account would look like. Comfort inflates ego; accuracy trains it.</p>
              </div>
              <div>
                <label className="lbl block mb-2">Market friction mode</label>
                <Segmented
                  options={[{ id: "easy", label: "Easy" }, { id: "realistic", label: "Realistic" }, { id: "brutal", label: "Brutal" }]}
                  value={friction} onChange={setFriction} />
                <p className="text-[11px] text-fog-600 mt-2 leading-snug">
                  {friction === "easy" && "Instant mid-price fills. For pure beginners — and excluded from readiness scoring."}
                  {friction === "realistic" && "Volatility-based slippage, realistic spreads, occasional partial fills. Recommended."}
                  {friction === "brutal" && "Commissions, funding, gap risk, dry liquidity, random rejects under stress. Prop-firm mode."}
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-display font-bold text-[18px] text-fog-100 mb-1">Your risk constitution</h2>
              <p className="text-[12px] text-fog-500 -mt-2 mb-2">These numbers become hard engine limits — not suggestions.</p>
              {[
                { label: "Max risk per trade", v: riskPerTrade, set: setRiskPerTrade, min: 0.25, max: 3, step: 0.25, suffix: "% of equity", hint: "Pros live at 0.5–1%. Above 2% is gambling with extra steps." },
                { label: "Daily loss limit (circuit breaker)", v: maxDailyLoss, set: setMaxDailyLoss, min: 1, max: 8, step: 0.5, suffix: "% of equity", hint: "Hit this and the desk locks until a mandatory review. 2–3% is standard." },
                { label: "Max total open risk", v: maxOpenRisk, set: setMaxOpenRisk, min: 1, max: 10, step: 0.5, suffix: "% of equity", hint: "The sum of risk across all open positions. Correlation makes this matter." },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="lbl">{r.label}</label>
                    <span className="num text-[16px] font-semibold text-teal">{r.v}{r.suffix.split(" ")[0]}</span>
                  </div>
                  <input type="range" min={r.min} max={r.max} step={r.step} value={r.v}
                    onChange={(e) => r.set(Number(e.target.value))} className="w-full" />
                  <p className="text-[10.5px] text-fog-600 mt-1">{r.hint}</p>
                </div>
              ))}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="lbl">Max concurrent positions</label>
                  <span className="num text-[16px] font-semibold text-teal">{maxPositions}</span>
                </div>
                <input type="range" min={1} max={6} step={1} value={maxPositions}
                  onChange={(e) => setMaxPositions(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-bold text-[18px] text-fog-100 mb-1">Forbidden actions</h2>
                <p className="text-[12px] text-fog-500 mb-3">Checked items are blocked or flagged by the engine. Choose honestly — unchecked vices will find you.</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {FORBIDDEN_ACTIONS.map((f) => (
                    <button key={f.id} onClick={() => toggleForbidden(f.id)}
                      className="flex items-center gap-2.5 p-3 rounded-lg text-left transition-all duration-150"
                      style={{
                        background: forbidden.includes(f.id) ? "rgba(224,86,79,0.08)" : "#0a1120",
                        border: `1px solid ${forbidden.includes(f.id) ? "rgba(224,86,79,0.5)" : "#1c2942"}`,
                      }}>
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${forbidden.includes(f.id) ? "text-down" : "text-fog-600"}`}
                        style={{ border: `1px solid ${forbidden.includes(f.id) ? "#e0564f" : "#3a4c6e"}` }}>
                        {forbidden.includes(f.id) && <Ic.x size={10} />}
                      </span>
                      <span className="text-[12px] text-fog-200 leading-snug">{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="font-display font-bold text-[18px] text-fog-100 mb-1">Your setups (1–5)</h2>
                <p className="text-[12px] text-fog-500 mb-3">Every order asks for a tag. Expectancy is tracked per setup — this is how you find your actual edge.</p>
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {[...SETUP_PRESETS, ...setups.filter((s) => !SETUP_PRESETS.includes(s))].map((s) => (
                    <button key={s} onClick={() => toggleSetup(s)}
                      className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-150"
                      style={{
                        background: setups.includes(s) ? "rgba(57,197,165,0.15)" : "#0a1120",
                        border: `1px solid ${setups.includes(s) ? "#39c5a5" : "#1c2942"}`,
                        color: setups.includes(s) ? "#39c5a5" : "#93a3ba",
                      }}>{s}</button>
                  ))}
                </div>
                <div className="flex gap-2 max-w-[340px]">
                  <input className="field" placeholder="Add custom setup…" value={customSetup}
                    onChange={(e) => setCustomSetup(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && customSetup.trim()) { toggleSetup(customSetup.trim()); setCustomSetup(""); } }} />
                  <button className="btn btn-ghost" onClick={() => { if (customSetup.trim()) { toggleSetup(customSetup.trim()); setCustomSetup(""); } }}>Add</button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="font-display font-bold text-[18px] text-fog-100 mb-1">Sign the contract</h2>
              <div className="panel-inset p-4 space-y-1.5 num text-[12px]">
                {[
                  ["Capital", `$${capital.toLocaleString()} · ${friction} friction`],
                  ["Risk / trade", `${riskPerTrade}%`], ["Daily loss limit", `${maxDailyLoss}% (locks the desk)`],
                  ["Max open risk", `${maxOpenRisk}%`], ["Max positions", `${maxPositions}`],
                  ["Forbidden", forbidden.length ? forbidden.map((f) => FORBIDDEN_ACTIONS.find((x) => x.id === f)?.label ?? f).join(" · ") : "none (brave)"],
                  ["Setups", setups.join(", ")],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-fog-500" style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>{k}</span>
                    <span className="text-fog-200 text-right">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="lbl block mb-1.5">Trading intentions (optional)</label>
                <textarea className="field min-h-[64px] resize-none" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Why are you here? What does discipline look like for you?" />
              </div>
              <ConsentCheck checked={consent} onChange={setConsent} />
              <div>
                <label className="lbl block mb-1.5">Type your name to sign Plan v1</label>
                <input className="field font-display !text-[16px] max-w-[320px]" placeholder="Your signature" value={signature}
                  onChange={(e) => setSignature(e.target.value)} />
                <p className="text-[10.5px] text-fog-600 mt-1.5">Amending the plan later is allowed — but every version is archived with a mandatory written reason. The contract remembers.</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-7">
            <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
            {step < 3 ? (
              <button className="btn btn-teal !px-6" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue →</button>
            ) : (
              <button className="btn btn-teal !px-6" disabled={!canNext} onClick={finish}>
                <Ic.check size={15} /> Lock plan v1 &amp; open the desk
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-fog-600 mt-5 leading-relaxed max-w-xl">
          {LEGAL.footer}
        </p>
        <div className="mt-3 mb-8">
          <DisclaimerFooter />
        </div>
      </div>
    </div>
  );
}
