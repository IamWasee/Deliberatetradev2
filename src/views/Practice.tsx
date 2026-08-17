import { useApp } from "../lib/store";
import { PROCESS_LABELS, computeProcess, emotionExpectancy, setupStats } from "../lib/coaching";
import { Bar, Empty, Gauge, Ic, fmtR } from "../components/ui";

const AREA_DESC: Record<string, string> = {
  "Risk consistency": "Your sizing drifts from plan. Missions here rebuild the reflex: same risk, every trade, regardless of the last outcome.",
  "Emotional awareness": "Your entries carry hot emotional tags. Missions here train the pause between impulse and order.",
  "Journal quality": "Losses are evaporating unexamined. Missions here force autopsies while the memory is still warm.",
  "Rule adherence": "Violations are leaking expectancy. Missions here rebuild the bracket habit: define risk before reward.",
  "Setup discipline": "Trades are untagged or scattered. Missions here build a real sample size on one repeatable pattern.",
};

export default function Practice() {
  const { state: s } = useApp();
  const proc = computeProcess(s.trades, s.violations.length, s.plan);
  const entries = PROCESS_LABELS.map((p) => ({ ...p, v: proc.parts[p.key] })).sort((a, b) => a.v - b.v);
  const weakest = entries[0];
  const emo = emotionExpectancy(s.trades);
  const worstEmo = [...emo].sort((a, b) => a.avgR - b.avgR)[0];
  const setups = setupStats(s.trades);
  const best = [...setups].sort((a, b) => b.avgR - a.avgR)[0];
  const dueReviews = s.reviews.filter((r) => r.dueTick <= s.now).length;
  const doneCount = s.missions.filter((m) => m.done).length;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        {/* diagnosis */}
        <div className="panel p-5 grid md:grid-cols-[auto_1fr] gap-6 items-center">
          <Gauge value={s.practiceScore > 0 ? Math.min(100, s.practiceScore / 2) : 0} label="Deliberate practice" size={124} tone="#6fb6e8" />
          <div>
            <p className="lbl mb-1.5">Diagnosis · generated from your weakest metric</p>
            {s.trades.length === 0 ? (
              <p className="text-[13.5px] text-fog-300 leading-relaxed">
                No trades yet, so the system defaults to the foundation: <strong className="text-fog-100">rule adherence</strong>.
                Your first missions build the habit loop — plan, bracket, execute, journal — before the market gets a vote.
              </p>
            ) : (
              <p className="text-[13.5px] text-fog-300 leading-relaxed">
                Weakest area: <strong className="text-amber">{weakest?.label}</strong> ({Math.round((weakest?.v ?? 0) * 100)}/100).
                {" "}{AREA_DESC[weakest?.label ?? "Rule adherence"]}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 num text-[11.5px] text-fog-500">
              <span>Practice points <strong className="text-ice">{s.practiceScore}</strong></span>
              {worstEmo && worstEmo.avgR < 0 && <span>Worst state: <strong style={{ color: "#e8837d" }}>{worstEmo.label} {fmtR(worstEmo.avgR)}</strong></span>}
              {best && best.n >= 3 && <span>Best setup: <strong className="text-up">{best.setup} {fmtR(best.avgR)}</strong></span>}
              <span>Reviews due <strong className={dueReviews ? "text-amber" : "text-fog-300"}>{dueReviews}</strong></span>
            </div>
          </div>
        </div>

        {/* missions */}
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-[17px] text-fog-100">Active missions</h2>
              <p className="text-[12px] text-fog-500 mt-0.5">Regenerated every session from your weakest areas. +25 practice on completion.</p>
            </div>
            <span className="num text-[13px] text-fog-300">{doneCount}/{s.missions.length} done</span>
          </div>
          {s.missions.length === 0 && <Empty title="No plan on file" body="Missions generate when you lock your trading plan." />}
          <div className="grid md:grid-cols-3 gap-3">
            {s.missions.map((m, i) => (
              <div key={m.id} className="panel-inset p-4 lift animate-fade-up relative overflow-hidden" style={{ animationDelay: `${i * 70}ms` }}>
                {m.done && (
                  <div className="absolute top-3 right-3 text-up animate-pop"><Ic.check size={17} strokeWidth={2.2} /></div>
                )}
                <p className="lbl !text-[9px] mb-2" style={{ color: "#6fb6e8" }}>{m.area}</p>
                <p className="font-display font-semibold text-[14.5px] text-fog-100 leading-snug mb-1.5">{m.title}</p>
                <p className="text-[11.5px] text-fog-500 leading-snug mb-4">{m.why}</p>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1"><Bar value={m.progress / m.target} color={m.done ? "#2fb98c" : "#6fb6e8"} /></div>
                  <span className="num text-[11.5px] text-fog-400 shrink-0">{Math.min(m.progress, m.target)}/{m.target}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* how scoring works */}
        <div className="grid md:grid-cols-3 gap-3">
          {[
            { ic: <Ic.target size={17} />, t: "Practice ≠ trading", b: "Random trading builds random habits. Missions target the exact muscle your data says is weak — sizing, patience, autopsies." },
            { ic: <Ic.clock size={17} />, t: "Losses resurface", b: "Every losing trade becomes a review card on a spaced schedule: soon, then later, then much later — until the pattern no longer owns you." },
            { ic: <Ic.flame size={17} />, t: "Stress is a rep", b: "With Stress Mode armed, the platform injects adverse 2–3% moves into live positions. Holding your stop through one is worth +10 practice." },
          ].map((c, i) => (
            <div key={c.t} className="panel p-4 lift animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg text-teal mb-2.5" style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.3)" }}>{c.ic}</span>
              <p className="font-display font-semibold text-[14px] text-fog-100 mb-1">{c.t}</p>
              <p className="text-[12px] text-fog-500 leading-relaxed">{c.b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
