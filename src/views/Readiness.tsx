/* Readiness & graduation - evidence-backed, exportable. */
import { useMemo } from "react";
import { useApp } from "../lib/store";
import { computeReadiness, readinessReportMarkdown, STAGES, STAGE_NOTES, type ReadinessStage } from "../lib/readinessAdapter";
import { Bar, Gauge, Ic } from "../components/ui";

const STAGE_COLOR: Record<ReadinessStage, string> = {
  "Not Ready": "#e0564f",
  "Building Foundations": "#e0a33b",
  "Developing Consistency": "#6fb6e8",
  "Almost Ready": "#b48ef0",
  "Ready for Real Capital": "#2fb98c",
};

export default function Readiness() {
  const { state: s } = useApp();
  const r = useMemo(() => computeReadiness(s.trades, s.violations, s.plan), [s.trades, s.violations, s.plan]);
  const stageColor = STAGE_COLOR[r.stage];
  const frictionNote = s.trades.filter((t) => t.friction === "easy").length;

  const exportReport = () => {
    const md = readinessReportMarkdown(r, s.plan, s.name);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deliberatetrade-readiness-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        {/* header */}
        <div className="panel p-5 animate-fade-up">
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative">
              <Gauge value={r.score ?? 0} size={110} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-[30px] font-bold text-fog-100">{r.score ?? "-"}</span>
                <span className="lbl" style={{ fontSize: 8 }}>{r.eligible ? "READINESS" : "GATING"}</span>
              </div>
            </div>
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                <h2 className="font-display font-bold text-[21px] text-fog-100">Real-money readiness</h2>
                <span className="font-display font-bold text-[11px] px-2.5 py-1 rounded-full"
                  style={{ background: stageColor + "1f", border: "1px solid " + stageColor + "66", color: stageColor }}>
                  {r.stage.toUpperCase()}
                </span>
              </div>
              <p className="text-[12px] text-fog-400 leading-relaxed mb-3">{STAGE_NOTES[r.stage]}</p>
              {/* stage track */}
              <div className="flex gap-1">
                {STAGES.map((st, i) => (
                  <div key={st} className="flex-1">
                    <div className="h-[5px] rounded-full transition-all duration-700"
                      style={{ background: i <= r.stageIdx ? STAGE_COLOR[st] : "#16213a" }} />
                    <p className="text-[8.5px] mt-1 text-fog-600 truncate" style={{ color: i === r.stageIdx ? STAGE_COLOR[st] : undefined }}>{st}</p>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn" onClick={exportReport}>
              <Ic.download size={14} /> Export report
            </button>
          </div>
          {!r.eligible && (
            <div className="mt-4 rounded-lg p-3 animate-fade-in" style={{ background: "rgba(224,163,59,0.06)", border: "1px solid rgba(224,163,59,0.4)" }}>
              <p className="text-[12px] text-amber font-semibold mb-1">Score locked until the minimums are met</p>
              <p className="text-[11.5px] text-fog-400 leading-snug">{r.gateReasons.join(" ")}</p>
            </div>
          )}
        </div>

        {/* gates */}
        <div className="panel p-4 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <p className="lbl mb-3">Minimum gates - quantity is pass/fail, never the score</p>
          <div className="grid md:grid-cols-3 gap-3">
            {r.gates.map((g) => (
              <div key={g.id} className="panel-inset p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex" style={{ color: g.pass ? "#2fb98c" : "#e0a33b" }}>
                    {g.pass ? <Ic.check size={15} /> : <Ic.clock size={15} />}
                  </span>
                  <p className="text-[12px] font-semibold text-fog-200 leading-tight">{g.label}</p>
                </div>
                <Bar value={g.progress} h={5} color={g.pass ? "#2fb98c" : "#e0a33b"} />
                <p className="num text-[10.5px] text-fog-500 mt-1.5">{g.detail}{g.pass ? " - passed" : ""}</p>
              </div>
            ))}
          </div>
          {frictionNote > 0 && (
            <p className="text-[10.5px] text-fog-600 mt-3 leading-snug">
              {frictionNote} trade{frictionNote > 1 ? "s" : ""} executed on Easy friction count toward volume only - readiness weights realistic-market behavior.
            </p>
          )}
        </div>

        {/* components */}
        <div className="panel p-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <p className="lbl mb-3">Behavior components - rates, not counts</p>
          {r.components ? (
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-3">
              {r.components.map((c) => (
                <div key={c.key}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[11.5px] text-fog-300">{c.label}</span>
                    <span className="num text-[12px] font-semibold" style={{ color: c.value >= 0.7 ? "#2fb98c" : c.value >= 0.45 ? "#e0a33b" : "#e0564f" }}>
                      {Math.round(c.value * 100)}
                    </span>
                  </div>
                  <Bar value={c.value} h={5} color={c.value >= 0.7 ? "#2fb98c" : c.value >= 0.45 ? "#e0a33b" : "#e0564f"} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-fog-600">Components appear once the sample is eligible - the engine refuses to score an untrusted sample.</p>
          )}
        </div>

        {/* feedback */}
        <div className="panel p-4 animate-fade-up" style={{ animationDelay: "180ms" }}>
          <p className="lbl mb-2.5 flex items-center gap-2 text-teal"><Ic.brain size={13} /> Coach assessment</p>
          {r.feedback ? (
            <div className="space-y-2.5">
              <p className="text-[13px] text-fog-200 leading-relaxed font-medium">{r.feedback.headline}</p>
              <div className="flex flex-wrap gap-2 text-[10.5px] num">
                <span className="px-2 py-1 rounded" style={{ background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>trend: {r.feedback.trendDirection.replace("_", " ")}</span>
                {r.feedback.strongestArea && <span className="px-2 py-1 rounded" style={{ background: "rgba(47,185,140,0.08)", border: "1px solid rgba(47,185,140,0.35)", color: "#2fb98c" }}>strongest: {r.feedback.strongestArea}</span>}
                {r.feedback.weakestArea && <span className="px-2 py-1 rounded" style={{ background: "rgba(224,86,79,0.08)", border: "1px solid rgba(224,86,79,0.35)", color: "#e0564f" }}>weakest: {r.feedback.weakestArea}</span>}
              </div>
              {r.feedback.actionableNote && <p className="text-[12px] text-fog-400 leading-relaxed">{r.feedback.actionableNote}</p>}
            </div>
          ) : (
            <p className="text-[12px] text-fog-600">Assessment unlocks with eligibility.</p>
          )}
        </div>
      </div>
    </div>
  );
}
