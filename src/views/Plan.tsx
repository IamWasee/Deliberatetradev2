import { useState } from "react";
import { useApp } from "../lib/store";
import { FORBIDDEN, type Plan } from "../lib/types";
import { Ic, Modal } from "../components/ui";

export default function PlanView() {
  const { state: s, dispatch } = useApp();
  const plan = s.plan!;
  const [amendOpen, setAmendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [riskPct, setRiskPct] = useState(plan.riskPerTradePct);
  const [dailyLoss, setDailyLoss] = useState(plan.maxDailyLossPct);
  const [openRisk, setOpenRisk] = useState(plan.maxOpenRiskPct);
  const [maxPos, setMaxPos] = useState(plan.maxPositions);

  const amend = () => {
    const next: Plan = { ...plan, version: plan.version + 1, riskPerTradePct: riskPct, maxDailyLossPct: dailyLoss, maxOpenRiskPct: openRisk, maxPositions: maxPos };
    dispatch({ type: "AMEND_PLAN", plan: next, reason: reason.trim() });
    setAmendOpen(false);
    setReason("");
  };

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[860px] mx-auto space-y-3.5">
        <div className="panel p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-2 w-10 h-10 rounded-xl text-teal" style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.3)" }}>
              <span className="mx-auto"><Ic.scroll size={18} /></span>
            </span>
            <div className="mr-auto">
              <h2 className="font-display font-bold text-[18px] text-fog-100">Trading Plan · <span className="text-teal">v{plan.version}</span></h2>
              <p className="text-[11.5px] text-fog-500 num">locked {new Date(plan.createdAt).toLocaleDateString()} · signed by {s.name}</p>
            </div>
            <button className="btn btn-ghost" onClick={() => setAmendOpen(true)}><Ic.plus size={14} /> Amend plan</button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { k: "Risk / trade", v: `${plan.riskPerTradePct}%`, sub: `$${((plan.riskPerTradePct / 100) * s.equity).toFixed(0)} today` },
              { k: "Daily loss lock", v: `${plan.maxDailyLossPct}%`, sub: `$${((plan.maxDailyLossPct / 100) * s.sessionStartEquity).toFixed(0)}` },
              { k: "Max open risk", v: `${plan.maxOpenRiskPct}%`, sub: `$${((plan.maxOpenRiskPct / 100) * s.equity).toFixed(0)}` },
              { k: "Max positions", v: `${plan.maxPositions}`, sub: `${s.positions.length} open now` },
            ].map((c) => (
              <div key={c.k} className="panel-inset p-3.5">
                <p className="lbl">{c.k}</p>
                <p className="num text-[22px] font-semibold text-fog-100 leading-tight mt-1">{c.v}</p>
                <p className="num text-[10.5px] text-fog-500 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="lbl mb-2.5">Forbidden actions · enforced by the engine</p>
              <div className="space-y-1.5">
                {FORBIDDEN.map((f) => {
                  const on = plan.forbidden.includes(f.id);
                  return (
                    <div key={f.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] ${on ? "" : "opacity-40"}`}
                      style={{ background: "#0a1120", border: `1px solid ${on ? "rgba(224,86,79,0.35)" : "#16213a"}` }}>
                      <span style={{ color: on ? "#e0564f" : "#4d5f78" }}>{on ? <Ic.lock size={13} /> : <Ic.x size={13} />}</span>
                      <span className={on ? "text-fog-200" : "text-fog-500"}>{f.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="lbl mb-2.5">Named setups</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {plan.setups.map((st) => (
                  <span key={st} className="text-[12px] font-semibold px-3 py-1.5 rounded-full text-teal" style={{ background: "rgba(57,197,165,0.08)", border: "1px solid rgba(57,197,165,0.35)" }}>{st}</span>
                ))}
              </div>
              <p className="lbl mb-2.5">Signed statement</p>
              <p className="text-[12.5px] text-fog-400 italic leading-relaxed panel-inset p-3.5">“{plan.note}”</p>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <p className="lbl mb-3">Amendment history</p>
          {s.planHistory.length === 0 && (
            <p className="text-[12.5px] text-fog-500">No amendments yet — the contract stands as signed. That's usually a good sign.</p>
          )}
          <div className="space-y-2">
            {[...s.planHistory].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "#0a1120", border: "1px solid #16213a" }}>
                <span className="num text-[12px] font-bold text-amber shrink-0 mt-0.5">v{h.version}</span>
                <div>
                  <p className="text-[12.5px] text-fog-300 leading-snug">{h.reason}</p>
                  <p className="num text-[10.5px] text-fog-600 mt-1">{new Date(h.at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-fog-600 mt-4 leading-relaxed flex gap-2">
            <Ic.alert size={13} className="text-amber shrink-0 mt-0.5" />
            Amendments require a written reason and are archived forever. Rules rewritten during a drawdown are the most expensive words in trading.
          </p>
        </div>
      </div>

      <Modal open={amendOpen} onClose={() => setAmendOpen(false)} title={`Amend plan · v${plan.version} → v${plan.version + 1}`}>
        <div className="space-y-4">
          {[
            { label: "Risk per trade %", v: riskPct, set: setRiskPct, min: 0.25, max: 3, step: 0.25 },
            { label: "Daily loss lock %", v: dailyLoss, set: setDailyLoss, min: 1, max: 10, step: 0.5 },
            { label: "Max open risk %", v: openRisk, set: setOpenRisk, min: 1, max: 12, step: 0.5 },
            { label: "Max positions", v: maxPos, set: setMaxPos, min: 1, max: 6, step: 1 },
          ].map((r) => (
            <div key={r.label}>
              <div className="flex justify-between items-baseline mb-1">
                <label className="lbl">{r.label}</label>
                <span className="num text-[15px] text-teal font-medium">{r.v}{r.label.includes("%") ? "%" : ""}</span>
              </div>
              <input type="range" className="w-full" min={r.min} max={r.max} step={r.step} value={r.v} onChange={(e) => r.set(Number(e.target.value))} />
            </div>
          ))}
          <div>
            <label className="lbl block mb-1.5">Written reason (required, archived)</label>
            <textarea className="field min-h-[64px] resize-none" placeholder="e.g. After 40 trades my expectancy supports 1.25% risk; journal evidence attached in session review…"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button className="btn btn-amber w-full" disabled={reason.trim().length < 15} onClick={amend}>
            <Ic.lock size={14} /> Lock amendment as v{plan.version + 1}
          </button>
        </div>
      </Modal>
    </div>
  );
}
