import { useState } from "react";
import { useApp } from "../lib/store";
import { emotionLabel, type Trade } from "../lib/types";
import { Empty, Ic, fmtR, fmtSigned } from "../components/ui";

const GRADE_TONE: Record<string, string> = { A: "#2fb98c", B: "#6fb6e8", C: "#e0a33b", D: "#e0564f" };

export default function Journal() {
  const { state: s, dispatch } = useApp();
  const [filter, setFilter] = useState<"all" | "pending" | "losses" | "violations">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const trades = [...s.trades].reverse().filter((t) =>
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
        {/* spaced repetition queue */}
        {dueReviews.length > 0 && (
          <div className="panel p-4" style={{ borderColor: "rgba(224,163,59,0.45)" }}>
            <p className="lbl mb-1 flex items-center gap-2 text-amber"><Ic.clock size={13} /> Spaced repetition — losing patterns due for review</p>
            <p className="text-[12px] text-fog-500 mb-3">The setups that cost you come back around on a schedule. Re-read, re-feel, re-file.</p>
            <div className="space-y-2.5">
              {dueReviews.map((rv) => {
                const t = s.trades.find((x) => x.id === rv.tradeId);
                if (!t) return null;
                return (
                  <ReviewCard key={rv.id} t={t} reps={rv.reps}
                    onAgain={() => dispatch({ type: "RESOLVE_REVIEW", id: rv.id, again: true })}
                    onDone={() => dispatch({ type: "RESOLVE_REVIEW", id: rv.id, again: false })} />
                );
              })}
            </div>
          </div>
        )}

        <div className="panel p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="font-display font-bold text-[17px] text-fog-100 mr-auto">Trade journal</h2>
            {([["all", "All"], ["pending", `Pending (${pendingCount})`], ["losses", "Losses"], ["violations", "Violations"]] as const).map(([id, lb]) => (
              <button key={id} onClick={() => setFilter(id)}
                className="btn !py-1 !px-3 !text-[11.5px]"
                style={filter === id ? { background: "#39c5a5", color: "#062019" } : { background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>
                {lb}
              </button>
            ))}
          </div>

          {trades.length === 0 && (
            <Empty title={filter === "all" ? "No closed trades yet" : "Nothing here"} body={filter === "all" ? "Closed trades land here with a mandatory journal and a coach debrief." : "No trades match this filter. That can be a good sign."} />
          )}

          <div className="space-y-2">
            {trades.map((t) => (
              <TradeRow key={t.id} t={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ t, reps, onAgain, onDone }: { t: Trade; reps: number; onAgain: () => void; onDone: () => void }) {
  return (
    <div className="panel-inset p-3.5 animate-fade-up">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
        <span className="font-display font-bold text-fog-100">{t.side.toUpperCase()} {t.symbol}</span>
        <span className="lbl !text-[9px]">{t.setup}</span>
        <span className="num text-down text-[12.5px] font-medium">{fmtR(t.r)} · {fmtSigned(t.pnl, 0)}</span>
        <span className="lbl !text-[9px] ml-auto">rep {reps + 1}</span>
      </div>
      <p className="text-[12px] text-fog-400 leading-snug mb-1.5">
        Entry {t.entry.toFixed(2)} → exit {t.exit.toFixed(2)} ({t.exitReason}). Checked in as <strong className="text-fog-300">{emotionLabel(t.checkin.emotion)}</strong>.
      </p>
      {t.journal && <p className="text-[12px] text-fog-300 italic leading-snug mb-2.5">“{t.journal.lesson}”</p>}
      <div className="flex gap-2">
        <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={onAgain}>Still stings — reschedule sooner</button>
        <button className="btn btn-teal !py-1.5 !text-[11.5px]" onClick={onDone}><Ic.check size={13} /> Pattern re-learned</button>
      </div>
    </div>
  );
}

function TradeRow({ t, open, onToggle }: { t: Trade; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg overflow-hidden transition-all" style={{ background: "#0a1120", border: `1px solid ${open ? "#2a3c5e" : "#16213a"}` }}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left row-hover">
        <span className="font-display font-bold text-[13px] text-fog-100 w-[86px]">{t.side.toUpperCase()} {t.symbol}</span>
        <span className="lbl !text-[9px] hidden sm:inline">{t.setup}</span>
        <span className="lbl !text-[9px] hidden md:inline opacity-70">{t.regime}</span>
        {t.stressHits > 0 && <span className="text-amber" title="Stress was injected during this trade"><Ic.flame size={13} /></span>}
        {t.violations.length > 0 && <span className="text-down" title={t.violations.join(", ")}><Ic.alert size={13} /></span>}
        <span className={`num text-[12.5px] font-medium ml-auto ${t.pnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(t.pnl, 0)}</span>
        <span className={`num text-[12px] w-[64px] text-right ${t.r >= 0 ? "text-up" : "text-down"}`}>{fmtR(t.r)}</span>
        {t.journal ? (
          <span className="num text-[12px] font-bold w-6 text-center" style={{ color: GRADE_TONE[t.journal.grade] }}>{t.journal.grade}</span>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-amber w-[58px] text-center" style={{ background: "rgba(224,163,59,0.12)", border: "1px solid rgba(224,163,59,0.4)" }}>pending</span>
        )}
        <span className="text-fog-500 transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 animate-fade-in grid md:grid-cols-2 gap-3">
          <div className="space-y-2 text-[12px]">
            <p className="lbl !text-[9.5px]">Execution</p>
            <div className="num text-fog-400 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
              <span>Qty {t.qty}</span><span>Entry {t.entry.toFixed(2)}</span>
              <span>Exit {t.exit.toFixed(2)} ({t.exitReason})</span><span>Fees ${t.fees.toFixed(2)}</span>
              <span>Risk ${t.riskAmount.toFixed(0)}</span><span>Friction {t.friction}</span>
              <span>Regime {t.regime}</span><span>{new Date(t.exitTs).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="lbl !text-[9.5px] pt-1">Pre-trade check-in</p>
            <p className="text-fog-300"><strong>{emotionLabel(t.checkin.emotion)}</strong> · arousal {t.checkin.arousal}/10</p>
            <p className="text-fog-500 italic leading-snug">“{t.checkin.thesis}”</p>
            {t.violations.length > 0 && (
              <>
                <p className="lbl !text-[9.5px] pt-1 text-down">Violations</p>
                {t.violations.map((v) => <p key={v} className="text-[11.5px]" style={{ color: "#e8837d" }}>• {v}</p>)}
              </>
            )}
          </div>
          <div className="space-y-2 text-[12px]">
            {t.journal ? (
              <>
                <p className="lbl !text-[9.5px]">Journal · grade <span style={{ color: GRADE_TONE[t.journal.grade] }}>{t.journal.grade}</span> · rules followed: {t.journal.followedRules}</p>
                <JField k="Plan" v={t.journal.plan} />
                <JField k="What happened" v={t.journal.whatHappened} />
                <JField k="During / after" v={`${emotionLabel(t.journal.emotionDuring)} → ${emotionLabel(t.journal.emotionAfter)}`} />
                {t.journal.followedRules === "no" && <JField k="Why not" v={t.journal.rulesNote} />}
                <JField k="Lesson" v={t.journal.lesson} />
                <div className="rounded-lg p-3 mt-2" style={{ background: "rgba(57,197,165,0.06)", border: "1px solid rgba(57,197,165,0.28)" }}>
                  <p className="lbl !text-[9.5px] text-teal mb-1.5 flex items-center gap-1.5"><Ic.brain size={12} /> Coach debrief</p>
                  <p className="text-[12px] text-fog-300 leading-relaxed">{t.journal.debrief}</p>
                </div>
              </>
            ) : (
              <p className="text-fog-500 text-[12px] leading-relaxed flex gap-2"><Ic.alert size={14} className="text-amber shrink-0 mt-0.5" /> Journal pending — it opens automatically when a trade closes. Un-journaled trades drag your Process Score and block graduation.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const JField = ({ k, v }: { k: string; v: string }) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.14em] text-fog-600 font-semibold mb-0.5">{k}</p>
    <p className="text-fog-300 leading-snug">{v}</p>
  </div>
);
