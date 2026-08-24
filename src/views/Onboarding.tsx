/* Onboarding - forces a written, signed trading plan before the desk opens. */
import { useState } from "react";
import { useApp } from "../lib/store";
import { FORBIDDEN_ACTIONS, type FrictionMode, type Plan } from "../lib/types";
import { ConsentCheck, DisclaimerFooter, LEGAL } from "../components/LegalKit";
import { Ic, Segmented } from "../components/ui";

const DEFAULT_SETUPS = ["Breakout", "Pullback", "Reversal", "Range fade", "Trend continuation"];

export default function Onboarding() {
  const { dispatch } = useApp();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [capital, setCapital] = useState(25000);
  const [friction, setFriction] = useState<FrictionMode>("realistic");

  const [risk, setRisk] = useState(1);
  const [dailyLoss, setDailyLoss] = useState(3);
  const [openRisk, setOpenRisk] = useState(4);
  const [maxPos, setMaxPos] = useState(3);
  const [forbidden, setForbidden] = useState<string[]>(["no-stop"]);
  const [setups, setSetups] = useState<string[]>(["Breakout", "Pullback"]);
  const [note, setNote] = useState("");

  const [legalOk, setLegalOk] = useState(false);
  const [signature, setSignature] = useState("");

  const toggle = (id: string, list: string[], set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const finish = () => {
    const plan: Plan = {
      version: 1, createdAt: Date.now(), startingCapital: capital,
      riskPerTradePct: risk, maxDailyLossPct: dailyLoss, maxOpenRiskPct: openRisk,
      maxPositions: maxPos, forbidden, setups, note: note.trim(),
    };
    dispatch({ type: "CREATE_PLAN", plan, name: name.trim(), friction, legalAcceptedAt: Date.now() });
  };

  const steps = ["Identity", "Risk rules", "Sign"];

  return (
    <div className="h-full overflow-y-auto bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative max-w-[640px] mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2 animate-fade-up">
          <span className="text-teal inline-flex"><Ic.logo size={30} /></span>
          <div>
            <h1 className="font-display font-bold text-[22px] text-fog-100 leading-tight">Build your trading contract</h1>
            <p className="text-[12px] text-fog-500">No plan, no desk. This takes two minutes and saves accounts.</p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-6 mt-4">
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div className="h-[3px] rounded-full transition-all duration-500"
                style={{ background: i <= step ? "#39c5a5" : "#1c2942" }} />
              <p className={"lbl mt-1.5 " + (i === step ? "text-teal" : "")}>{i + 1} - {s}</p>
            </div>
          ))}
        </div>

        <div className="panel p-6 animate-fade-up" key={step}>
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label className="lbl block mb-1.5">What should the desk call you?</label>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Trader name or callsign" maxLength={40} />
              </div>
              <div>
                <label className="lbl block mb-1.5">Starting virtual capital</label>
                <div className="flex items-center gap-3">
                  <input type="number" className="field num" style={{ fontSize: 22, maxWidth: 240 }} value={capital} min={1000} step={1000}
                    onChange={(e) => { const n = Number(e.target.value); setCapital(Number.isFinite(n) ? Math.max(0, n) : 0); }} />
                  <div className="flex gap-1.5 flex-wrap">
                    {[10000, 25000, 50000, 100000].map((c) => (
                      <button key={c} onClick={() => setCapital(c)} className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 11.5 }}>
                        ${c / 1000}k
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-fog-600 mt-1.5">Use the size you'd actually fund. A $100k fantasy account trains fantasy habits.</p>
              </div>
              <div>
                <label className="lbl block mb-1.5">Market friction mode (tracked for readiness)</label>
                <Segmented options={[{ id: "easy", label: "Easy" }, { id: "realistic", label: "Realistic" }, { id: "brutal", label: "Brutal" }]} value={friction} onChange={setFriction} />
                <p className="text-[11px] text-fog-600 mt-1.5">
                  {friction === "easy" ? "Instant mid-price fills. For pure beginners learning mechanics." :
                   friction === "realistic" ? "Volatility-based slippage, realistic spreads. The honest default." :
                   "Slippage, commissions, funding rates and rejected orders. Prop-firm evaluation conditions."}
                </p>
              </div>
              <button className="btn btn-teal w-full" style={{ padding: "11px 14px" }} disabled={name.trim().length < 2 || capital < 1000} onClick={() => setStep(1)}>
                Continue - define risk rules
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              {[
                { label: "Max risk per trade", v: risk, set: setRisk, min: 0.25, max: 3, step: 0.25, fmt: (x: number) => x + "%" },
                { label: "Daily loss limit (circuit breaker)", v: dailyLoss, set: setDailyLoss, min: 1, max: 8, step: 0.5, fmt: (x: number) => x + "%" },
                { label: "Max total open risk", v: openRisk, set: setOpenRisk, min: 1, max: 10, step: 0.5, fmt: (x: number) => x + "%" },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="lbl">{r.label}</label>
                    <span className="num text-[15px] font-semibold text-teal">{r.fmt(r.v)}</span>
                  </div>
                  <input type="range" min={r.min} max={r.max} step={r.step} value={r.v} onChange={(e) => r.set(Number(e.target.value))} className="w-full" />
                </div>
              ))}
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <label className="lbl">Max simultaneous positions</label>
                  <span className="num text-[15px] font-semibold text-teal">{maxPos}</span>
                </div>
                <input type="range" min={1} max={6} step={1} value={maxPos} onChange={(e) => setMaxPos(Number(e.target.value))} className="w-full" />
              </div>

              <div>
                <label className="lbl block mb-2">Forbidden actions (the engine will enforce these)</label>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {FORBIDDEN_ACTIONS.map((f) => (
                    <button key={f.id} onClick={() => toggle(f.id, forbidden, setForbidden)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12px] transition-all"
                      style={{
                        background: forbidden.includes(f.id) ? "rgba(224,86,79,0.08)" : "#0a1120",
                        border: "1px solid " + (forbidden.includes(f.id) ? "rgba(224,86,79,0.5)" : "#1c2942"),
                        color: forbidden.includes(f.id) ? "#e0564f" : "#93a3ba",
                      }}>
                      <span className="inline-flex shrink-0">{forbidden.includes(f.id) ? <Ic.x size={13} /> : <Ic.check size={13} />}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="lbl block mb-2">Declared setups (your edge lives in repetition)</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_SETUPS.map((st) => (
                    <button key={st} onClick={() => toggle(st, setups, setSetups)}
                      className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                      style={{
                        background: setups.includes(st) ? "rgba(57,197,165,0.12)" : "#0a1120",
                        border: "1px solid " + (setups.includes(st) ? "rgba(57,197,165,0.5)" : "#1c2942"),
                        color: setups.includes(st) ? "#39c5a5" : "#93a3ba",
                      }}>{st}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="lbl block mb-1.5">Intentions (optional - your why)</label>
                <textarea className="field min-h-[64px] resize-none" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="What are you training for? Prop evaluation? First funded account? Survival?" />
              </div>

              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-teal flex-1" disabled={setups.length === 0} onClick={() => setStep(2)}>Continue - sign the contract</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="panel-inset p-4">
                <p className="lbl mb-2.5">Contract summary - Plan v1</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 num text-[12.5px]">
                  <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)" }}>Capital</span><span className="text-fog-100">${capital.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)" }}>Friction</span><span className="text-fog-100 uppercase">{friction}</span></div>
                  <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)" }}>Risk / trade</span><span className="text-fog-100">{risk}%</span></div>
                  <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)" }}>Daily loss limit</span><span className="text-fog-100">{dailyLoss}%</span></div>
                  <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)" }}>Max open risk</span><span className="text-fog-100">{openRisk}%</span></div>
                  <div className="flex justify-between"><span className="text-fog-500" style={{ fontFamily: "var(--font-body)" }}>Max positions</span><span className="text-fog-100">{maxPos}</span></div>
                </div>
                <p className="text-[11px] text-fog-500 mt-2.5">
                  Forbidden: {forbidden.length ? forbidden.map((f) => FORBIDDEN_ACTIONS.find((x) => x.id === f)?.label).join(" / ") : "none"} - Setups: {setups.join(", ")}
                </p>
              </div>

              <ConsentCheck checked={legalOk} onChange={setLegalOk} />

              <div>
                <label className="lbl block mb-1.5">Sign with your name - this locks Plan v1</label>
                <input className="field" style={{ fontFamily: "var(--font-display)", fontSize: 16 }} value={signature} onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your full name" />
              </div>

              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-teal flex-1" style={{ padding: "11px 14px" }}
                  disabled={!legalOk || signature.trim().length < 3}
                  onClick={finish}>
                  <Ic.scroll size={15} /> Lock Plan v1 & open the desk
                </button>
              </div>
              <p className="text-[10.5px] text-fog-600 leading-snug">{LEGAL.footer}</p>
            </div>
          )}
        </div>

        <div className="mt-8">
          <DisclaimerFooter />
        </div>
      </div>
    </div>
  );
}
