/* Journal - filed entries, debriefs, and the spaced-repetition queue. */
import { useState } from "react";
import { useApp } from "../lib/store";
import { emotionLabel, type Trade } from "../lib/types";
import { searchTrades } from "../lib/db";
import { Empty, Ic, fmtR, fmtSigned } from "../components/ui";

const GRADE_TONE: Record<string, string> = { A: "#2fb98c", B: "#6fb6e8", C: "#e0a33b", D: "#e0564f" };

export default function Journal() {
  const { state: s, dispatch } = useApp();
  const [filter, setFilter] = useState<"all" | "pending" | "losses" | "violations">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const searched = searchTrades([...s.trades].reverse(), { symbol: query.trim(), limit: 200 });
  const trades = searched.filter((t) =>
    filter === "all" ? true :
    filter === "pending" ? !t.journal :
    filter === "losses" ? t.r < 0 :
    t.violations.length > 0
  );
  const dueReviews = s.reviews.filter((r) => r.dueTick <= s.now);
  const pendingCount = s.trades.filter((t) => !t.journal).length;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[980px] mx-auto space-y-3.5">
        {dueReviews.length > 0 && (
          <div className="panel p-4" style={{ borderColor: "rgba(224,163,59,0.45)" }}>
            <p className="lbl mb-1 flex items-center gap-2 text-amber"><Ic.clock size={13} /> Spaced repetition - losing patterns due for review</p>
            <p className="text-[12px] text-fog-500 mb-3">The setups that cost you come back around on a schedule. Re-read, re-feel, re-file.</p>
            <div className="space-y-2.5">
              {dueReviews.map((r) => {
                const t = s.trades.find((x) => x.id === r.tradeId);
                if (!t) return null;
                return (
                  <ReviewCard key={r.id} t={t} reps={r.reps}
                    onDone={() => dispatch({ type: "RESOLVE_REVIEW", id: r.id, again: false })}
                    onAgain={() => dispatch({ type: "RESOLVE_REVIEW", id: r.id, again: true })} />
                );
              })}
            </div>
          </div>
        )}

        <div className="panel p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="font-display font-bold text-[17px] text-fog-100 mr-auto">Trade journal</h2>
            <input className="field num uppercase" style={{ width: 120, padding: "4px 10px", fontSize: 11.5 }} placeholder="SYMBOL..." maxLength={6}
              pattern="[a-zA-Z]*" value={query} onChange={(e) => setQuery(e.target.value.replace(/[^a-zA-Z]/g, ""))} />
            {([["all", "All"], ["pending", "Pending (" + pendingCount + ")"], ["losses", "Losses"], ["violations", "Violations"]] as const).map(([id, lb]) => (
              <button key={id} onClick={() => setFilter(id)}
                className="btn"
                style={{ padding: "4px 12px", fontSize: 11.5, ...(filter === id ? { background: "#39c5a5", color: "#062019", borderColor: "#39c5a5" } : { background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }) }}>
                {lb}
              </button>
            ))}
          </div>

          {trades.length === 0 && (
            <Empty title={filter === "all" ? "No closed trades yet" : "Nothing here"}
              body={filter === "all" ? "Closed trades land here with a mandatory journal and a coach debrief." : "No trades match this filter. That can be a good sign."} />
          )}

          <div className="space-y-2.5">
            {trades.map((t) => (
              <TradeRow key={t.id} t={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ t, reps, onDone, onAgain }: { t: Trade; reps: number; onDone: () => void; onAgain: () => void }) {
  return (
    <div className="panel-inset p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5 num text-[12px]">
        <span className="font-display font-bold text-[13.5px] text-fog-100">{t.symbol}</span>
        <span style={{ color: t.side === "long" ? "#2fb98c" : "#e0564f" }}>{t.side.toUpperCase()}</span>
        <span className="text-down font-medium">{fmtR(t.r)}</span>
        <span className="text-fog-500">setup: {t.setup}</span>
        <span className="text-fog-600 text-[10px] uppercase">review #{reps + 1}</span>
      </div>
      <p className="text-[12px] text-fog-400 leading-snug mb-1.5">
        Checked in as <strong className="text-fog-300">{emotionLabel(t.checkin.emotion)}</strong>: "{t.checkin.thesis}"
      </p>
      {t.journal && <p className="text-[12px] text-fog-300 italic leading-snug mb-2.5">"{t.journal.lesson}"</p>}
      <div className="flex gap-2">
        <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 11.5 }} onClick={onAgain}>Still stings - reschedule sooner</button>
        <button className="btn btn-teal" style={{ padding: "6px 12px", fontSize: 11.5 }} onClick={onDone}><Ic.check size={13} /> Pattern re-learned</button>
      </div>
    </div>
  );
}

function TradeRow({ t, open, onToggle }: { t: Trade; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg overflow-hidden transition-all" style={{ background: "#0a1120", border: "1px solid " + (open ? "#2a3c5e" : "#16213a") }}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left row-hover">
        <span className="font-display font-bold text-[13.5px] text-fog-100 w-14">{t.symbol}</span>
        <span className="text-[11px] uppercase w-12" style={{ color: t.side === "long" ? "#2fb98c" : "#e0564f" }}>{t.side}</span>
        <span className="num text-[11.5px] text-fog-400 hidden sm:inline">{t.setup}</span>
        <span className="num text-[11.5px] text-fog-500 hidden md:inline">{new Date(t.exitTs).toLocaleDateString([], { month: "short", day: "numeric" })} - {t.friction}</span>
        {t.violations.length > 0 && (
          <span className="lbl px-1.5 py-0.5 rounded text-down" style={{ fontSize: 8.5, border: "1px solid rgba(224,86,79,0.4)" }}>{t.violations.length} VIOL.</span>
        )}
        {t.journal ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="num text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#111b30", color: "#93a3ba", border: "1px solid #1c2942" }}>Q {t.journal.qualityScore}</span>
            <span className="font-display font-bold text-[13px] w-5 text-center" style={{ color: GRADE_TONE[t.journal.grade] }}>{t.journal.grade}</span>
          </span>
        ) : (
          <span className="ml-auto lbl text-amber" style={{ fontSize: 9, border: "1px solid rgba(224,163,59,0.4)", padding: "2px 6px", borderRadius: 6 }}>JOURNAL DUE</span>
        )}
        <span className={"num font-semibold text-[13px] text-right " + (t.pnl >= 0 ? "text-up" : "text-down")} style={{ width: 96 }}>{fmtSigned(t.pnl, 0)} - {fmtR(t.r)}</span>
      </button>
      {open && t.journal && (
        <div className="px-4 pb-4 pt-1 border-t animate-fade-in space-y-3" style={{ borderColor: "#16213a" }}>
          <div className="grid md:grid-cols-2 gap-3 text-[12px] leading-relaxed">
            <div><p className="lbl mb-1">The plan</p><p className="text-fog-300">{t.journal.plan}</p></div>
            <div><p className="lbl mb-1">What happened</p><p className="text-fog-300">{t.journal.whatHappened}</p></div>
            <div>
              <p className="lbl mb-1">Emotions</p>
              <p className="text-fog-300">during: <strong>{emotionLabel(t.journal.emotionDuring)}</strong> - after: <strong>{emotionLabel(t.journal.emotionAfter)}</strong></p>
              <p className="text-fog-400 mt-1">Rules followed: <strong style={{ color: t.journal.followedRules === "yes" ? "#2fb98c" : "#e0564f" }}>{t.journal.followedRules.toUpperCase()}</strong>{t.journal.rulesNote && " - " + t.journal.rulesNote}</p>
            </div>
            <div><p className="lbl mb-1">Lesson</p><p className="text-fog-300">{t.journal.lesson}</p></div>
          </div>
          <div className="panel-inset p-3.5">
            <p className="lbl mb-1.5 flex items-center gap-2 text-teal"><Ic.brain size={13} /> Coach debrief</p>
            <p className="text-[12.5px] text-fog-200 leading-relaxed">{t.journal.debrief || "(skipped - no debrief generated)"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
