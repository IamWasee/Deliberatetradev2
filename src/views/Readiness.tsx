import { useApp } from "../lib/store";
import { buildReport, computeReadiness } from "../lib/coaching";
import { Bar, Gauge, Ic } from "../components/ui";

export default function Readiness() {
  const { state: s, dispatch } = useApp();
  const r = computeReadiness(s);
  const regimes = [...new Set(s.trades.map((t) => t.regime))];
  const graduated = r.score >= 85 && r.checks.every((c) => c.met);

  const exportReport = () => {
    const blob = new Blob([buildReport(s)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deliberatetrade-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bands = [
    { max: 40, label: "Foundations", desc: "You're building the frame: plan, bracket, journal. The market hasn't tested you yet — and you haven't tested the market with real friction." },
    { max: 70, label: "Developing", desc: "Process is forming but the evidence is thin. Keep trading Realistic friction, keep journaling, and let the sample grow before you think about money." },
    { max: 85, label: "Nearly there", desc: "Real structure, real sample. Close the remaining checklist items with evidence — this is the phase where most people rush and undo everything." },
    { max: 101, label: "Ready to be evaluated", desc: "The checklist is met with evidence. Export the report, show a mentor or a prop-firm evaluation. Real money changes the feeling — not the rules." },
  ];
  const band = bands.find((b) => r.score < b.max) ?? bands[3];

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        <div className="panel p-5 grid md:grid-cols-[auto_1fr] gap-6 items-center">
          <Gauge value={r.score} label="Real-money readiness" size={140} />
          <div>
            <p className="lbl mb-1.5">Current band · {band.label}</p>
            <p className="text-[13.5px] text-fog-300 leading-relaxed max-w-xl">{band.desc}</p>
            <div className="w-full mt-4 max-w-xl">
              <Bar value={r.score / 100} color={r.score >= 85 ? "#2fb98c" : r.score >= 55 ? "#e0a33b" : "#e0564f"} h={6} />
              <div className="flex justify-between num text-[9.5px] text-fog-600 mt-1"><span>0</span><span>40</span><span>70</span><span>85</span><span>100</span></div>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <p className="lbl mb-4">Graduation checklist — every item shows live evidence, not vibes</p>
          <div className="space-y-2">
            {r.checks.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3.5 p-3 rounded-lg animate-fade-up" style={{ background: "#0a1120", border: `1px solid ${c.met ? "rgba(47,185,140,0.35)" : "#16213a"}`, animationDelay: `${i * 50}ms` }}>
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${c.met ? "text-ink-950" : "text-fog-600"}`}
                  style={{ background: c.met ? "#2fb98c" : "#111b30", border: c.met ? "none" : "1px solid #1c2942" }}>
                  {c.met ? <Ic.check size={14} strokeWidth={2.4} /> : <span className="num text-[11px]">{i + 1}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-fog-200">{c.label}</p>
                  <p className="num text-[11px] text-fog-500">required: {c.required}</p>
                </div>
                <span className={`num text-[12.5px] font-medium shrink-0 ${c.met ? "text-up" : "text-fog-400"}`}>{c.actual}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="panel p-5">
            <p className="lbl mb-3">Regime exposure</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {["trend-up", "trend-down", "range", "chop"].map((rg) => {
                const has = regimes.includes(rg as never);
                return (
                  <span key={rg} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: has ? "rgba(57,197,165,0.1)" : "#0a1120",
                      border: `1px solid ${has ? "rgba(57,197,165,0.4)" : "#16213a"}`,
                      color: has ? "#39c5a5" : "#4d5f78",
                    }}>
                    {has ? "✓ " : ""}{rg.replace("-", " ")}
                  </span>
                );
              })}
            </div>
            <p className="text-[12px] text-fog-500 leading-relaxed">
              A strategy proven only in trending tape is an untested strategy. Closed trades are auto-tagged with the live regime; surviving three or more adds to your readiness score.
            </p>
          </div>
          <div className="panel p-5">
            <p className="lbl mb-3">Hand-off</p>
            <p className="text-[12px] text-fog-500 leading-relaxed mb-4">
              Export a markdown performance &amp; process report — equity numbers plus the process evidence (violations, stress survival, emotional profile) that mentors and prop-firm evaluators actually care about.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-teal" onClick={exportReport}><Ic.export size={14} /> Export report</button>
              <button className="btn btn-ghost" onClick={() => dispatch({ type: "RESET_ALL" })}>Reset account · history wiped</button>
            </div>
            <p className="text-[10.5px] text-fog-600 mt-3 leading-snug">Reset starts a fresh ledger with new missions. Your journals are cleared — keep exports of anything you want to remember.</p>
          </div>
        </div>

        {graduated && (
          <div className="panel p-5 text-center animate-pop" style={{ borderColor: "rgba(47,185,140,0.55)", background: "rgba(47,185,140,0.07)" }}>
            <p className="font-display font-bold text-[19px] text-up mb-1.5">Checklist complete. You've earned the doubt.</p>
            <p className="text-[13px] text-fog-300 max-w-lg mx-auto leading-relaxed">
              Every item above is backed by evidence in your ledger. Real money will add fear and greed the simulator can't — but the rules that got you here travel with you. Fund small. Keep journaling.
            </p>
          </div>
        )}

        <p className="text-[10.5px] text-fog-600 leading-relaxed">
          Readiness is an educational assessment of simulated performance. It is not financial advice, a solicitation, or a guarantee of real-market results.
        </p>
      </div>
    </div>
  );
}
