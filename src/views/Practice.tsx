/* Deliberate practice — missions generated from the weakest metric. */
import { useApp } from "../lib/store";
import { computeProcess, detectTiltSignals, PROCESS_LABELS } from "../lib/coaching";
import { Bar, Ic } from "../components/ui";

export default function Practice() {
  const { state: s } = useApp();
  const signals = detectTiltSignals(s.trades, s.violations);
  const proc = computeProcess(s.trades, s.violations, s.plan, signals);

  const weakest = PROCESS_LABELS
    .map((p) => ({ ...p, v: proc.parts[p.key] }))
    .sort((a, b) => a.v - b.v)[0];

  const doneCount = s.missions.filter((m) => m.done).length;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[860px] mx-auto space-y-3.5">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="panel p-4 md:col-span-2">
            <p className="lbl mb-1.5">Deliberate practice score</p>
            <div className="flex items-end gap-3">
              <span className="num text-[34px] font-semibold text-teal leading-none">{s.practiceScore}</span>
              <span className="text-[11.5px] text-fog-500 leading-snug pb-1">
                rises only when you train weak spots —<br />not when you trade randomly
              </span>
            </div>
            <div className="mt-3">
              <Bar value={Math.min(1, s.practiceScore / 300)} color="#39c5a5" h={6} />
            </div>
          </div>
          <div className="panel p-4">
            <p className="lbl mb-1.5">Weakest area right now</p>
            {weakest ? (
              <>
                <p className="font-display font-bold text-[16px]" style={{ color: weakest.v < 0.55 ? "#e0564f" : weakest.v < 0.8 ? "#e0a33b" : "#2fb98c" }}>
                  {weakest.label}
                </p>
                <p className="num text-[12px] text-fog-500 mt-0.5">{Math.round(weakest.v * 100)}/100 · missions target this</p>
              </>
            ) : <p className="text-[12px] text-fog-500">Trade to reveal it.</p>}
            {signals.length > 0 && (
              <p className="text-[11px] text-amber mt-2.5 leading-snug">{signals.length} tilt signal{signals.length > 1 ? "s" : ""} on record — post-loss behavior is being watched hardest.</p>
            )}
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-[17px] text-fog-100">Session missions</h2>
            <span className="num text-[11.5px] text-fog-500">{doneCount}/{s.missions.length} complete · refresh next session</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {s.missions.map((m) => (
              <div key={m.id} className="panel-inset p-4 transition-all duration-200 hover:-translate-y-[1px]"
                style={{ borderColor: m.done ? "rgba(47,185,140,0.5)" : undefined }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className={`font-display font-semibold text-[13.5px] ${m.done ? "text-up" : "text-fog-100"}`}>{m.title}</p>
                  <span className="lbl !text-[8.5px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>{m.area}</span>
                </div>
                <p className="text-[11.5px] text-fog-500 leading-snug mb-3">{m.why}</p>
                <div className="flex items-center gap-2.5">
                  <Bar value={m.progress / m.target} color={m.done ? "#2fb98c" : "#6fb6e8"} h={5} />
                  <span className={`num text-[11.5px] shrink-0 ${m.done ? "text-up" : "text-fog-400"}`}>{Math.min(m.progress, m.target)}/{m.target}</span>
                  {m.done && <span className="text-up inline-flex shrink-0"><Ic.check size={14} /></span>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-fog-600 mt-3.5 leading-snug">
            Missions regenerate every session from your weakest metrics. Completed missions pay practice points; repeated patterns pay in drawdowns.
          </p>
        </div>
      </div>
    </div>
  );
}
