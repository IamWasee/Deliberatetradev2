/* Readiness — gated by volume, scored by behavior. Engine: server/scoring/readinessEngine.ts */
import { useMemo } from "react";
import { useApp } from "../lib/store";
import { computeReadiness, readinessReportMarkdown, STAGES, STAGE_NOTES } from "../lib/readinessAdapter";
import { Bar, Ic } from "../components/ui";

const TREND_META: Record<string, { label: string; color: string }> = {
  improving: { label: "▲ improving", color: "#2fb98c" },
  declining: { label: "▼ declining", color: "#e0564f" },
  stable: { label: "◆ stable", color: "#6fb6e8" },
  insufficient_data: { label: "… building data", color: "#93a3ba" },
};

export default function Readiness() {
  const { state: s } = useApp();
  const r = useMemo(() => computeReadiness(s.trades, s.violations, s.plan), [s.trades, s.violations, s.plan]);
  const trend = r.feedback ? TREND_META[r.feedback.trendDirection] : TREND_META.insufficient_data;

  const exportReport = () => {
    const md = readinessReportMarkdown(r, s.plan, s.name);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deliberatetrade-readiness-report.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">

        {/* header: score + stage track */}
        <div className="panel p-5 animate-fade-in">
          <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-[210px]">
              <p className="lbl mb-2">Real-money readiness</p>
              {r.score === null ? (
                <div>
                  <p className="font-display font-bold text-[42px] leading-none text-fog-500">—</p>
                  <p className="text-[11px] text-amber mt-2 leading-snug max-w-[220px]">
                    Score unlocks once the minimum gates pass. Until then, quantity is the only thing that matters.
                  </p>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <p className={`font-display font-bold text-[54px] leading-none ${r.score >= 70 ? "text-up" : r.score >= 45 ? "text-amber" : "text-fog-100"}`}>
                    {r.score}
                  </p>
                  <span className="num text-[13px] text-fog-500">/100</span>
                </div>
              )}
              <p className="mt-2 inline-flex items-center gap-2 text-[12.5px] font-display font-bold px-2.5 py-1 rounded-md"
                style={{
                  background: r.stageIdx >= 3 ? "rgba(47,185,140,0.12)" : r.stageIdx === 2 ? "rgba(111,182,232,0.12)" : "rgba(224,163,59,0.1)",
                  border: `1px solid ${r.stageIdx >= 3 ? "rgba(47,185,140,0.45)" : r.stageIdx === 2 ? "rgba(111,182,232,0.45)" : "rgba(224,163,59,0.4)"}`,
                  color: r.stageIdx >= 3 ? "#2fb98c" : r.stageIdx === 2 ? "#6fb6e8" : "#e0a33b",
                }}>
                {r.stage}
              </p>
              <p className="text-[11px] text-fog-500 mt-2 leading-snug max-w-[250px]">{STAGE_NOTES[r.stage]}</p>
            </div>

            {/* stage track */}
            <div className="flex-1 min-w-[260px]">
              <div className="hidden md:flex items-center gap-1 mb-2">
                {STAGES.map((st, i) => (
                  <div key={st} className="flex-1">
                    <div className="h-[6px] rounded-full transition-all duration-500"
                      style={{
                        background: i < r.stageIdx ? "#39c5a5" : i === r.stageIdx ? "#e0a33b" : "#16213a",
                        boxShadow: i === r.stageIdx ? "0 0 12px rgba(224,163,59,0.35)" : undefined,
                      }} />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {STAGES.map((st, i) => (
                  <div key={st} className="flex items-center gap-2.5 text-[12px] transition-all"
                    style={{ color: i === r.stageIdx ? "#eef3fa" : i < r.stageIdx ? "#39c5a5" : "#4d5f78" }}>
                    <span className={`inline-flex ${i === r.stageIdx ? "text-amber" : ""}`}>
                      {i < r.stageIdx ? <Ic.check size={13} /> : i === r.stageIdx ? <Ic.flag size={13} /> : <Ic.clock size={13} />}
                    </span>
                    <span className={i === r.stageIdx ? "font-semibold" : ""}>{st}</span>
                    {i === 4 && <span className="lbl !text-[8px] ml-1">prop-challenge grade</span>}
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-ghost shrink-0" onClick={exportReport}>
              <Ic.download size={14} /> Export report
            </button>
          </div>
          <p className="text-[10.5px] text-fog-600 mt-4 pt-3 border-t border-line-soft leading-snug">
            Trade count and day count are <strong className="text-fog-400">gates only</strong> — once passed, more volume adds nothing. The score is 100% behavior quality: adherence, post-loss discipline, consistency, sizing, setups, emotions. The weighting itself is deliberately private, so you can't optimize the number instead of the behavior.
          </p>
        </div>

        {/* gates */}
        <div className="panel p-4 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <p className="lbl mb-3">Minimum gates — pass/fail, never part of the score</p>
          <div className="grid md:grid-cols-3 gap-2.5">
            {r.gates.map((g) => (
              <div key={g.id} className="panel-inset p-3.5" style={{ borderColor: g.pass ? "rgba(47,185,140,0.4)" : undefined }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex ${g.pass ? "text-up" : "text-fog-500"}`}>
                    {g.pass ? <Ic.check size={15} /> : <Ic.lock size={14} />}
                  </span>
                  <p className="text-[12px] font-semibold text-fog-200 leading-tight">{g.label}</p>
                  <span className={`num text-[12px] font-bold ml-auto ${g.pass ? "text-up" : "text-amber"}`}>{g.detail}</span>
                </div>
                <Bar value={g.progress} color={g.pass ? "#2fb98c" : "#e0a33b"} h={4} />
              </div>
            ))}
          </div>
          {!r.eligible && (
            <div className="mt-3 rounded-lg px-3.5 py-2.5 text-[11.5px] leading-snug animate-fade-in"
              style={{ background: "rgba(224,163,59,0.07)", border: "1px solid rgba(224,163,59,0.35)", color: "#c3cfdf" }}>
              <strong className="text-amber">Engine verdict: </strong>{r.gateReasons.join(" ")}
            </div>
          )}
        </div>

        {/* behavior components */}
        <div className="panel p-4 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <div className="flex items-baseline justify-between mb-3">
            <p className="lbl">Behavior components — the actual score</p>
            <span className="num text-[10px] text-fog-600">rates, not counts</span>
          </div>
          {r.components === null ? (
            <p className="text-[12px] text-fog-600 leading-relaxed max-w-xl">
              Component breakdown appears once you're eligible. This is by design — the engine refuses to score a sample it can't trust yet.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-3.5">
              {r.components.map((c) => {
                const col = c.value >= 0.75 ? "#2fb98c" : c.value >= 0.5 ? "#e0a33b" : "#e0564f";
                return (
                  <div key={c.key}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="text-[12px] text-fog-300 font-medium">{c.label}</span>
                      <span className="num text-[13px] font-semibold" style={{ color: col }}>{Math.round(c.value * 100)}</span>
                    </div>
                    <Bar value={c.value} color={col} h={6} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* coach feedback */}
        <div className="panel p-4 animate-fade-in" style={{ animationDelay: "180ms" }}>
          <p className="lbl mb-3 flex items-center gap-2 text-teal"><Ic.brain size={13} /> Coach assessment</p>
          {r.feedback ? (
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[14px] text-fog-100 font-medium leading-snug flex-1 min-w-[240px]">{r.feedback.headline}</p>
                <span className="num text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "#0a1120", border: `1px solid ${trend.color}55`, color: trend.color }}>
                  {trend.label}
                </span>
              </div>
              {r.feedback.strongestArea && (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="panel-inset p-3">
                    <p className="lbl !text-[8.5px] mb-1 text-up">Strongest area</p>
                    <p className="text-[12.5px] text-fog-200 capitalize">{r.feedback.strongestArea}</p>
                  </div>
                  <div className="panel-inset p-3">
                    <p className="lbl !text-[8.5px] mb-1 text-down">Weakest area</p>
                    <p className="text-[12.5px] text-fog-200 capitalize">{r.feedback.weakestArea}</p>
                  </div>
                </div>
              )}
              {r.feedback.actionableNote && (
                <p className="text-[12.5px] text-fog-300 leading-relaxed pl-3" style={{ borderLeft: "2px solid #39c5a5" }}>
                  {r.feedback.actionableNote}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-fog-600">
              Not enough data yet — the coach stays quiet until the gates pass, then reads your trend across the full sample.
            </p>
          )}
        </div>

        <p className="text-[10px] text-fog-600 leading-relaxed pb-2 max-w-2xl">
          Scores are computed by the readiness engine on every render from your full ledger — never stored, never editable, never sent by the client. In hosted deployments the identical engine runs server-side and the client only displays the verdict. Educational simulation — not financial advice.
        </p>
      </div>
    </div>
  );
}
