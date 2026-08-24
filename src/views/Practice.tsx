/* Practice - missions generated from your weakest areas. */
import { useApp } from "../lib/store";
import { Bar, Ic } from "../components/ui";

export default function Practice() {
  const { state: s, dispatch } = useApp();
  const done = s.missions.filter((m) => m.done).length;
  const pending = s.missions.filter((m) => !m.done);

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[860px] mx-auto space-y-3.5">
        <div className="panel p-5 flex flex-wrap items-center gap-5 animate-fade-up">
          <div className="flex-1 min-w-[240px]">
            <h2 className="font-display font-bold text-[19px] text-fog-100 mb-1">Deliberate practice board</h2>
            <p className="text-[12px] text-fog-500 leading-snug max-w-[520px]">
              Missions regenerate each session from your weakest metric. The Practice Score only rises when you train the gap - not when you trade randomly.
            </p>
          </div>
          <div className="text-right">
            <p className="lbl mb-1">Practice score</p>
            <p className="num text-[30px] font-semibold text-teal leading-none">{s.practiceScore}</p>
            <p className="num text-[10px] text-fog-600 mt-1">{done}/{s.missions.length} missions complete</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {pending.map((m, i) => (
            <div key={m.id} className="panel p-4 animate-fade-up" style={{ animationDelay: (i * 60) + "ms" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="lbl px-1.5 py-0.5 rounded" style={{ fontSize: 8.5, border: "1px solid rgba(57,197,165,0.35)", color: "#39c5a5" }}>{m.area}</span>
                <span className="num text-[10px] text-fog-600 ml-auto">{m.progress}/{m.target}</span>
              </div>
              <p className="font-display font-semibold text-[14.5px] text-fog-100 mb-1">{m.title}</p>
              <p className="text-[11.5px] text-fog-500 leading-snug mb-3">{m.why}</p>
              <Bar value={m.progress / m.target} h={5} />
            </div>
          ))}
          {s.missions.filter((m) => m.done).map((m) => (
            <div key={m.id} className="panel p-4 opacity-70">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex text-up"><Ic.check size={14} /></span>
                <span className="lbl px-1.5 py-0.5 rounded" style={{ fontSize: 8.5, border: "1px solid #1c2942", color: "#6b7d96" }}>{m.area}</span>
                <span className="num text-[10px] text-up ml-auto">+25</span>
              </div>
              <p className="font-display font-semibold text-[14.5px] text-fog-300 line-through">{m.title}</p>
            </div>
          ))}
        </div>

        <div className="panel p-4 animate-fade-up" style={{ animationDelay: "200ms" }}>
          <p className="lbl mb-2.5">How deliberate practice works here</p>
          <div className="grid md:grid-cols-3 gap-3 text-[11.5px] text-fog-400 leading-relaxed">
            <p><strong className="text-fog-200">1 - Detect.</strong> The scoring engine finds your weakest slice (post-loss behavior, sizing variance, setup drift...) and targets it.</p>
            <p><strong className="text-fog-200">2 - Drill.</strong> A mission makes the fix countable: three plan-sized trades, two real journals, one clean session.</p>
            <p><strong className="text-fog-200">3 - Repeat.</strong> Losing trades enter spaced repetition on the Journal tab, so expensive patterns resurface until they stop costing you.</p>
          </div>
          <button className="btn btn-ghost mt-3" style={{ padding: "6px 12px", fontSize: 11.5 }} onClick={() => dispatch({ type: "END_SESSION" })}>
            <Ic.practice size={13} /> End session & regenerate missions
          </button>
        </div>
      </div>
    </div>
  );
}
