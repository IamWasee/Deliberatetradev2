/* Readiness & graduation — quantity is a gate, behavior is the score. */
import { useApp } from "../lib/store";
import { READINESS_GATES, STAGES, computeReadiness } from "../lib/coaching";
import { Bar, Gauge, Ic } from "../components/ui";

const STAGE_TONE = ["#e0564f", "#e0a33b", "#6fb6e8", "#b48ef0", "#2fb98c"];

export default function Readiness() {
  const { state: s, dispatch } = useApp();
  const r = computeReadiness(s.trades, s.violations, s.plan);
  const tone = STAGE_TONE[r.stageIdx];

  const exportReport = () => {
    const lines = [
      "# DeliberateTrade — Readiness Report",
      `Trader: ${s.name || "Anonymous"} · Generated ${new Date().toISOString()}`,
      "",
      `## Readiness Score: ${r.score}/100 — ${r.stage}`,
      "",
      "## Gates",
      ...r.gates.map((g) => `- [${g.pass ? "x" : " "}] ${g.label} — ${g.detail}`),
      "",
      "## Components",
      ...r.components.map((c) => `- ${c.label}: ${Math.round(c.value * 100)}/100`),
      "",
      "## Coach feedback",
      ...r.feedback.map((f) => `- ${f}`),
      "",
      `## Record`,
      `- Closed trades: ${s.trades.length} · breaches: ${s.breaches} · stress survived: ${s.stressSurvived}/${s.stressSeen}`,
      `- Friction mode: ${s.friction} (easy trades are excluded from scoring)`,
      "",
      "_Educational simulation with virtual money only — not financial advice._",
    ].join("\n");
    const blob = new Blob([lines], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deliberatetrade-readiness.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        {/* stage hero */}
        <div className="panel p-5 md:p-6" style={{ borderLeft: `3px solid ${tone}` }}>
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <Gauge value={r.score} label="Readiness" size={132} />
            <div className="flex-1">
              <p className="lbl mb-1">Current stage</p>
              <h2 className="font-display font-bold text-[22px] leading-tight mb-2" style={{ color: tone }}>{r.stage}</h2>
              <div className="flex gap-1 mb-3">
                {STAGES.map((st, i) => (
                  <div key={st} className="h-[5px] flex-1 rounded-full transition-all duration-500"
                    title={st}
                    style={{ background: i <= r.stageIdx ? STAGE_TONE[i] : "#16213a" }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STAGES.map((st, i) => (
                  <span key={st} className="text-[9px] num px-1.5 py-0.5 rounded-full"
                    style={{
                      background: i === r.stageIdx ? `${STAGE_TONE[i]}22` : "#0a1120",
                      border: `1px solid ${i === r.stageIdx ? STAGE_TONE[i] : "#1c2942"}`,
                      color: i === r.stageIdx ? STAGE_TONE[i] : "#4d5f78",
                    }}>{st}</span>
                ))}
              </div>
            </div>
            <button className="btn btn-teal !py-2 shrink-0" onClick={exportReport}>
              <Ic.download size={14} /> Export report
            </button>
          </div>
          <p className="text-[11.5px] text-fog-500 mt-4 leading-relaxed max-w-3xl">
            Quantity is only a <strong className="text-fog-300">gate</strong> — once {READINESS_GATES.minTrades} trades and {READINESS_GATES.minDays} days are in, more volume adds nothing.
            Only better behavior moves this number. A trader with 60 disciplined trades outranks one with 500 sloppy ones.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-3.5">
          <div className="space-y-3.5">
            {/* gates */}
            <div className="panel p-4">
              <p className="lbl mb-3">Minimum gates — fail one and the score is capped</p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {r.gates.map((g) => (
                  <div key={g.id} className="flex items-start gap-2.5 p-3 rounded-lg"
                    style={{ background: g.pass ? "rgba(47,185,140,0.06)" : "rgba(224,86,79,0.05)", border: `1px solid ${g.pass ? "rgba(47,185,140,0.35)" : "rgba(224,86,79,0.35)"}` }}>
                    <span className={`mt-[1px] inline-flex shrink-0 ${g.pass ? "text-up" : "text-down"}`}>
                      {g.pass ? <Ic.check size={15} /> : <Ic.x size={15} />}
                    </span>
                    <div>
                      <p className="text-[12px] font-semibold text-fog-200 leading-snug">{g.label}</p>
                      <p className={`num text-[10.5px] mt-0.5 ${g.pass ? "text-up" : "text-down"}`}>{g.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* components */}
            <div className="panel p-4">
              <p className="lbl mb-3">What drives the score</p>
              <div className="space-y-3">
                {r.components.map((c) => (
                  <div key={c.key}>
                    <div className="flex justify-between text-[11.5px] mb-1">
                      <span className="text-fog-300 font-medium">{c.label}</span>
                      <span className="num" style={{ color: c.value >= 0.8 ? "#2fb98c" : c.value >= 0.55 ? "#e0a33b" : "#e0564f" }}>{Math.round(c.value * 100)}</span>
                    </div>
                    <Bar value={c.value} color={c.value >= 0.8 ? "#2fb98c" : c.value >= 0.55 ? "#e0a33b" : "#e0564f"} h={6} />
                  </div>
                ))}
              </div>
            </div>

            {/* feedback */}
            <div className="panel p-4">
              <p className="lbl mb-3">Why you're at this stage — and what moves it</p>
              <div className="space-y-2.5">
                {r.feedback.map((f, i) => (
                  <p key={i} className="flex gap-2.5 text-[12.5px] text-fog-200 leading-relaxed">
                    <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tone }} />
                    {f}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* graduation checklist */}
          <div className="space-y-3.5">
            <div className="panel p-4">
              <p className="lbl mb-3">Graduation checklist</p>
              {[
                { ok: s.trades.length >= READINESS_GATES.minTrades, t: `${READINESS_GATES.minTrades}+ closed trades under realistic friction` },
                { ok: s.trades.filter((t) => t.friction !== "easy").length >= 30, t: "30+ trades outside Easy mode" },
                { ok: r.gates.find((g) => g.id === "days")?.pass ?? false, t: `${READINESS_GATES.minDays}+ active trading days` },
                { ok: r.gates.find((g) => g.id === "clean")?.pass ?? false, t: `Clean ${READINESS_GATES.cleanWindowDays}-day violation window` },
                { ok: s.stressSurvived >= 3, t: "Survived 3+ stress injections with stop intact" },
                { ok: s.trades.filter((t) => t.journal && t.journal.qualityScore >= 60).length >= 15, t: "15+ journals at quality 60+" },
                { ok: r.score >= 85, t: "Readiness ≥ 85 with all gates green" },
              ].map((c, i) => (
                <div key={i} className="flex items-center gap-2.5 py-2 border-b border-line-soft last:border-0">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${c.ok ? "text-up" : "text-fog-600"}`}
                    style={{ border: `1px solid ${c.ok ? "#2fb98c" : "#2a3c5e"}`, background: c.ok ? "rgba(47,185,140,0.1)" : "transparent" }}>
                    {c.ok && <Ic.check size={11} />}
                  </span>
                  <p className={`text-[11.5px] leading-snug ${c.ok ? "text-fog-200" : "text-fog-500"}`}>{c.t}</p>
                </div>
              ))}
            </div>
            <div className="panel p-4">
              <p className="lbl mb-2">Evidence pack</p>
              <p className="text-[11.5px] text-fog-500 leading-relaxed mb-3">
                The export bundles your scores, gates, record and coach feedback — for a mentor, a coach, or a prop-firm application.
              </p>
              <button className="btn btn-ghost w-full" onClick={exportReport}><Ic.download size={13} /> Download .md report</button>
              <p className="text-[10px] text-fog-600 mt-2.5 num">Simulation record only — never a certification.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
