/* My Plan — the locked, versioned trading contract. */
import { useState } from "react";
import { useApp } from "../lib/store";
import { FORBIDDEN_ACTIONS, type FrictionMode, type Plan } from "../lib/types";
import { Ic, Modal, Segmented } from "../components/ui";

export default function PlanView() {
  const { state: s, dispatch } = useApp();
  const plan = s.plan!;
  const [amendOpen, setAmendOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[860px] mx-auto space-y-3.5">
        <div className="panel p-5" style={{ borderLeft: "3px solid #39c5a5" }}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="font-display font-bold text-[20px] text-fog-100">Trading contract</h2>
            <span className="lbl !text-[9.5px] px-2 py-1 rounded-full text-teal" style={{ border: "1px solid rgba(57,197,165,0.4)" }}>
              PLAN v{plan.version} · LOCKED
            </span>
            <span className="num text-[10.5px] text-fog-500 ml-auto">signed {new Date(plan.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {[
              ["Capital", `$${plan.startingCapital.toLocaleString()}`],
              ["Risk / trade", `${plan.riskPerTradePct}%`],
              ["Daily loss limit", `${plan.maxDailyLossPct}%`],
              ["Max open risk", `${plan.maxOpenRiskPct}%`],
              ["Max positions", `${plan.maxPositions}`],
              ["Friction", s.friction],
            ].map(([k, v]) => (
              <div key={k} className="panel-inset p-3">
                <p className="lbl !text-[8.5px] mb-1">{k}</p>
                <p className="num text-[17px] font-semibold text-fog-100 uppercase">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-2.5 mt-2.5">
            <div className="panel-inset p-3">
              <p className="lbl !text-[8.5px] mb-1.5">Forbidden actions</p>
              {plan.forbidden.length === 0 ? <p className="text-[11.5px] text-amber">None declared — the engine trusts you. Bold.</p> : (
                <ul className="space-y-1">
                  {plan.forbidden.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[11.5px] text-fog-300">
                      <span className="text-down inline-flex"><Ic.x size={11} /></span>
                      {FORBIDDEN_ACTIONS.find((x) => x.id === f)?.label ?? f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel-inset p-3">
              <p className="lbl !text-[8.5px] mb-1.5">Declared setups</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.setups.map((st) => (
                  <span key={st} className="text-[11px] px-2 py-1 rounded-full font-semibold"
                    style={{ background: "rgba(57,197,165,0.12)", border: "1px solid rgba(57,197,165,0.4)", color: "#39c5a5" }}>{st}</span>
                ))}
              </div>
            </div>
          </div>
          {plan.note && (
            <div className="panel-inset p-3 mt-2.5">
              <p className="lbl !text-[8.5px] mb-1">Intentions</p>
              <p className="text-[12px] text-fog-300 italic leading-relaxed">“{plan.note}”</p>
            </div>
          )}
          <div className="flex items-center justify-between mt-4">
            <p className="text-[10.5px] text-fog-600 max-w-[420px] leading-snug">The plan can be amended — but every change is archived with a written reason. Impulse edits leave a paper trail.</p>
            <button className="btn btn-ghost" onClick={() => setAmendOpen(true)}><Ic.scroll size={13} /> Amend plan</button>
          </div>
        </div>

        <div className="panel p-4">
          <p className="lbl mb-3">Version history</p>
          {s.planHistory.length === 0 && <p className="text-[11.5px] text-fog-600">No amendments yet. v1 stands as signed.</p>}
          {s.planHistory.map((h) => (
            <div key={h.version} className="flex items-start gap-3 py-2.5 border-b border-line-soft last:border-0">
              <span className="num text-[11px] px-2 py-0.5 rounded shrink-0" style={{ background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>v{h.version}</span>
              <div>
                <p className="text-[12px] text-fog-300">{h.reason}</p>
                <p className="num text-[10px] text-fog-600 mt-0.5">{new Date(h.at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AmendModal open={amendOpen} onClose={() => setAmendOpen(false)} plan={plan}
        onSave={(p, reason) => { dispatch({ type: "AMEND_PLAN", plan: p, reason }); setAmendOpen(false); }} />
    </div>
  );
}

function AmendModal({ open, onClose, plan, onSave }: { open: boolean; onClose: () => void; plan: Plan; onSave: (p: Plan, reason: string) => void }) {
  const { state: s } = useApp();
  const [risk, setRisk] = useState(plan.riskPerTradePct);
  const [daily, setDaily] = useState(plan.maxDailyLossPct);
  const [openRisk, setOpenRisk] = useState(plan.maxOpenRiskPct);
  const [maxPos, setMaxPos] = useState(plan.maxPositions);
  const [friction, setFriction] = useState<FrictionMode>(s.friction);
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 12;

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><span className="text-teal inline-flex"><Ic.scroll size={15} /></span> Amend to Plan v{plan.version + 1}</span>}>
      <p className="text-[12px] text-fog-400 leading-relaxed mb-4">
        Loosening rules after losses is how plans die. Tightening after wins is how traders mature. Your reason is archived forever.
      </p>
      <div className="space-y-4 mb-4">
        {[
          { label: "Risk per trade %", v: risk, set: setRisk, min: 0.25, max: 3, step: 0.25 },
          { label: "Daily loss limit %", v: daily, set: setDaily, min: 1, max: 8, step: 0.5 },
          { label: "Max open risk %", v: openRisk, set: setOpenRisk, min: 1, max: 10, step: 0.5 },
        ].map((r) => (
          <div key={r.label}>
            <div className="flex justify-between items-baseline mb-1">
              <label className="lbl">{r.label}</label>
              <span className="num text-[14px] font-semibold text-teal">{r.v}%</span>
            </div>
            <input type="range" min={r.min} max={r.max} step={r.step} value={r.v} onChange={(e) => r.set(Number(e.target.value))} className="w-full" />
          </div>
        ))}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <label className="lbl">Max positions</label>
            <span className="num text-[14px] font-semibold text-teal">{maxPos}</span>
          </div>
          <input type="range" min={1} max={6} step={1} value={maxPos} onChange={(e) => setMaxPos(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="lbl block mb-1.5">Friction mode (tracked for readiness)</label>
          <Segmented options={[{ id: "easy", label: "Easy" }, { id: "realistic", label: "Realistic" }, { id: "brutal", label: "Brutal" }]} value={friction} onChange={setFriction} />
        </div>
        <div>
          <label className="lbl block mb-1.5">Written reason (min 12 chars) — archived</label>
          <textarea className="field min-h-[64px] resize-none" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Halving risk after two consecutive breach-adjacent weeks until my post-loss score recovers…" />
        </div>
      </div>
      <button className="btn btn-teal w-full !py-2.5" disabled={!ok}
        onClick={() => onSave({ ...plan, version: plan.version + 1, riskPerTradePct: risk, maxDailyLossPct: daily, maxOpenRiskPct: openRisk, maxPositions: maxPos }, reason.trim())}>
        Lock Plan v{plan.version + 1}
      </button>
    </Modal>
  );
}
