import { useApp } from "../lib/store";
import type { ActiveIndicator, IndicatorId } from "../lib/types";
import { INDICATOR_DEFS, defOf, defaultParams, labelOf } from "../lib/indicators";
import { Ic, Modal } from "./ui";

/* Indicator manager: add / remove / tune. Every change dispatches
   immediately so the chart updates live. Persisted via the store. */
export default function IndicatorsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state: s, dispatch } = useApp();
  const active = s.indicators;

  const commit = (next: ActiveIndicator[]) => dispatch({ type: "SET_INDICATORS", indicators: next });
  const add = (id: IndicatorId) =>
    commit([...active, { uid: `${id}-${Date.now().toString(36)}`, id, params: defaultParams(id) }]);
  const remove = (uid: string) => commit(active.filter((a) => a.uid !== uid));
  const setParam = (uid: string, key: string, val: number) =>
    commit(active.map((a) => {
      if (a.uid !== uid) return a;
      const pd = defOf(a.id).params.find((p) => p.key === key);
      const clamped = pd ? Math.min(pd.max, Math.max(pd.min, val)) : val;
      return { ...a, params: { ...a.params, [key]: clamped } };
    }));

  return (
    <Modal open={open} onClose={onClose} wide title={<span className="flex items-center gap-2"><Ic.pulse size={16} className="text-teal" /> Indicators</span>}>
      <p className="text-[12px] text-fog-500 mb-4 -mt-1 leading-snug">
        Computed live from the same candles on the chart. Overlays draw on price; RSI / MACD / ATR open as panels below. Your setup is saved.
      </p>

      <p className="lbl mb-2">Add indicator</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {INDICATOR_DEFS.map((d) => (
          <button key={d.id} onClick={() => add(d.id)}
            className="text-left p-2.5 rounded-lg transition-all duration-150 hover:-translate-y-[1px] group"
            style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
            <span className="flex items-center justify-between">
              <span className="font-display font-semibold text-[12.5px] text-fog-200 group-hover:text-teal transition-colors">{d.name}</span>
              <span className="text-teal"><Ic.plus size={13} /></span>
            </span>
            <span className="block text-[10px] text-fog-600 mt-0.5 leading-snug">{d.kind === "pane" ? "panel" : d.kind === "volume" ? "floor" : "overlay"} · {d.desc}</span>
          </button>
        ))}
      </div>

      <p className="lbl mb-2">Active · {active.length}</p>
      {active.length === 0 && <p className="text-[12px] text-fog-600">Nothing active — add one above.</p>}
      <div className="space-y-2">
        {active.map((a) => {
          const d = defOf(a.id);
          return (
            <div key={a.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg animate-fade-in"
              style={{ background: "#0a1120", border: "1px solid #16213a" }}>
              <span className="font-display font-semibold text-[13px] text-fog-100 w-[130px]">{labelOf(a)}</span>
              <span className="lbl !text-[9px]">{d.kind === "pane" ? "panel" : d.kind === "volume" ? "floor" : "overlay"}</span>
              <div className="flex items-center gap-3 ml-auto">
                {d.params.map((pd) => (
                  <div key={pd.key} className="flex items-center gap-1.5">
                    <span className="text-[10.5px] text-fog-500">{pd.label}</span>
                    <button onClick={() => setParam(a.uid, pd.key, (a.params[pd.key] ?? pd.def) - pd.step)}
                      className="num font-bold rounded-md hover:text-fog-100 transition-colors"
                      style={{ width: 22, height: 22, background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>−</button>
                    <span className="num text-[12.5px] text-teal w-8 text-center">{a.params[pd.key] ?? pd.def}</span>
                    <button onClick={() => setParam(a.uid, pd.key, (a.params[pd.key] ?? pd.def) + pd.step)}
                      className="num font-bold rounded-md hover:text-fog-100 transition-colors"
                      style={{ width: 22, height: 22, background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>+</button>
                  </div>
                ))}
                <button onClick={() => remove(a.uid)} title="Remove"
                  className="text-fog-600 hover:text-down transition-colors ml-1"><Ic.x size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn btn-teal w-full mt-5" onClick={onClose}>Done</button>
    </Modal>
  );
}
