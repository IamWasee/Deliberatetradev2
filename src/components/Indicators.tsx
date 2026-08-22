/* Indicators manager — add / remove / re-tune, persisted per user. */
import { useState } from "react";
import { useApp } from "../lib/store";
import type { ActiveIndicator, IndicatorId } from "../lib/types";
import { INDICATOR_DEFS, defOf, defaultParams, labelOf } from "../lib/indicators";
import { Ic, Modal } from "./ui";
import { uid8 } from "../lib/safe";

export default function IndicatorsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state: s, dispatch } = useApp();
  const [q, setQ] = useState("");
  const set = (indicators: ActiveIndicator[]) => dispatch({ type: "SET_INDICATORS", indicators });

  const add = (id: IndicatorId) => {
    const existing = s.indicators.filter((a) => a.id === id);
    set([...s.indicators, { uid: `${id}-${uid8()}`, id, params: defaultParams(id) }]);
    void existing;
  };
  const remove = (uid: string) => set(s.indicators.filter((a) => a.uid !== uid));
  const tune = (uid: string, key: string, val: number) =>
    set(s.indicators.map((a) => (a.uid === uid ? { ...a, params: { ...a.params, [key]: val } } : a)));

  const defs = INDICATOR_DEFS.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><span className="text-teal inline-flex"><Ic.flask size={15} /></span> Indicators</span>}>
      <p className="text-[11.5px] text-fog-500 leading-snug mb-3.5">
        Everything is computed live from the exact candles on screen — nothing is faked or lagged. Your layout is remembered per user.
      </p>

      {/* active list */}
      <div className="space-y-2 mb-5">
        {s.indicators.length === 0 && (
          <p className="text-[12px] text-fog-600 italic px-1">None active — add from the library below.</p>
        )}
        {s.indicators.map((a) => {
          const def = defOf(a.id);
          return (
            <div key={a.uid} className="panel-inset p-3">
              <div className="flex items-center gap-2.5">
                <span className={`lbl !text-[8.5px] px-1.5 py-0.5 rounded ${def.kind === "overlay" ? "text-teal" : def.kind === "pane" ? "text-amber" : "text-fog-400"}`}>
                  {def.kind === "overlay" ? "OVERLAY" : def.kind === "pane" ? "PANEL" : "VOLUME"}
                </span>
                <span className="font-display font-semibold text-[13px] text-fog-100">{labelOf(a)}</span>
                <button onClick={() => remove(a.uid)} className="ml-auto text-fog-500 hover:text-down transition-colors" title="Remove">
                  <Ic.x size={14} />
                </button>
              </div>
              {def.params.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2.5">
                  {def.params.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-[11px] text-fog-400">
                      {p.label}
                      <input type="number" className="field num !w-[70px] !py-1 !text-[12px]"
                        value={a.params[p.key] ?? p.def} min={p.min} max={p.max} step={p.step}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) tune(a.uid, p.key, Math.min(p.max, Math.max(p.min, v)));
                        }} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* library */}
      <input className="field mb-2.5" placeholder="Search indicators… (e.g. RSI)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        {defs.map((d) => (
          <button key={d.id} onClick={() => add(d.id)}
            className="text-left p-2.5 rounded-lg transition-all duration-150 hover:-translate-y-[1px] row-hover"
            style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-[12.5px] text-fog-100">{d.name}</span>
              <span className="text-teal ml-auto inline-flex rotate-180"><Ic.download size={13} /></span>
            </div>
            <p className="text-[10.5px] text-fog-500 leading-snug mt-0.5">{d.desc}</p>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-fog-600 mt-3.5 num">SMA · EMA · RSI(14) · MACD(12,26,9) · BB(20,2) · VWAP · ATR · Volume — same feed, same candles.</p>
    </Modal>
  );
}
