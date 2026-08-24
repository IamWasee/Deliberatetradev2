/* Legal surfaces: signup consent, persistent footer, first-trade warning. */
import { useState } from "react";
import { useApp } from "../lib/store";
import { Ic, Modal } from "./ui";

export const LEGAL = {
  consent: "I understand this is simulated trading with virtual money only and not real financial advice.",
  footer: "Educational simulation with virtual money only - not financial advice. Simulated results do not predict real-money results. Trading involves substantial risk of loss; most retail traders lose money.",
};

export function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 p-3 rounded-lg cursor-pointer transition-all duration-150"
      style={{ background: checked ? "rgba(57,197,165,0.06)" : "rgba(224,163,59,0.06)", border: "1px solid " + (checked ? "rgba(57,197,165,0.5)" : "rgba(224,163,59,0.45)") }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#39c5a5]" />
      <span className="text-[12px] leading-snug text-fog-200">
        <strong className={checked ? "text-teal" : "text-amber"}>Required acknowledgment. </strong>
        {LEGAL.consent}
      </span>
    </label>
  );
}

export function DisclaimerFooter({ onLegal }: { onLegal?: () => void }) {
  return (
    <div className="shrink-0 border-t px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      style={{ background: "rgba(7,12,22,0.72)", borderColor: "#16213a" }}>
      <p className="text-[9.5px] leading-snug text-fog-600 num max-w-[980px]">{LEGAL.footer}</p>
      {onLegal && (
        <button onClick={onLegal} className="ml-auto text-[9.5px] font-semibold text-fog-500 hover:text-teal transition-colors num shrink-0">
          Legal / Terms / Privacy
        </button>
      )}
    </div>
  );
}

export function TradeDisclaimerModal({ open, onAccept, onCancel }: {
  open: boolean; onAccept: () => void; onCancel: () => void;
}) {
  const [ack, setAck] = useState(false);
  if (!open) return null;
  return (
    <Modal open onClose={onCancel}
      title={<span className="flex items-center gap-2"><span className="text-amber inline-flex"><Ic.shield size={16} /></span> Simulation warning - read before your first order</span>}>
      <ul className="space-y-2.5 mb-4">
        {[
          ["Simulation only", "Every order here fills against a synthetic tape with virtual money. No real trades are executed and no real funds exist anywhere on this platform."],
          ["Not financial advice", "Nothing you see - prices, indicators, scores, debriefs - is a recommendation to buy or sell anything in real markets."],
          ["Results don't transfer", "Simulated profits do not predict real-money results. Live markets add slippage, fear, and fill risk this trainer can only approximate."],
          ["Real trading is dangerous", "Trading involves substantial risk of loss. Most retail traders lose money - often quickly."],
          ["You are responsible", "Any real-money decision you make later is yours alone. This platform accepts no liability for it."],
        ].map(([h, b]) => (
          <li key={h} className="flex gap-2.5 text-[12px] leading-snug text-fog-300">
            <span className="mt-[3px] text-amber shrink-0 inline-flex"><Ic.alert size={13} /></span>
            <span><strong className="text-fog-100">{h}.</strong> {b}</span>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2.5 p-3 rounded-lg cursor-pointer mb-4"
        style={{ background: "rgba(224,163,59,0.06)", border: "1px solid rgba(224,163,59,0.45)" }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[#e0a33b]" />
        <span className="text-[12px] text-fog-200 leading-snug">I understand - this is a simulation with virtual money only, and nothing here is financial advice.</span>
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel order</button>
        <button className="btn btn-teal" disabled={!ack} onClick={onAccept}>I understand - continue</button>
      </div>
    </Modal>
  );
}

export function FirstTradeGate({ attempt, clear, proceed }: { attempt: boolean; clear: () => void; proceed: () => void }) {
  const { state: s, dispatch } = useApp();
  const show = attempt && !s.tradeDisclaimerShown;
  return (
    <TradeDisclaimerModal
      open={show}
      onCancel={() => clear()}
      onAccept={() => { dispatch({ type: "ACK_TRADE_DISCLAIMER" }); clear(); proceed(); }}
    />
  );
}
