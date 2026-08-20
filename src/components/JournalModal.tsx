import { useEffect, useState } from "react";
import { useApp } from "../lib/store";
import { EMOTIONS, type EmotionTag } from "../lib/types";
import { journalGate, journalQualityScore } from "../lib/journalQuality";
import { Bar, Modal, fmtR, fmtSigned } from "./ui";

export default function JournalModal() {
  const { state: s, dispatch } = useApp();
  const tradeId = s.journalDue[0] ?? null;
  const trade = tradeId ? s.trades.find((t) => t.id === tradeId) : null;

  const [plan, setPlan] = useState("");
  const [what, setWhat] = useState("");
  const [during, setDuring] = useState<EmotionTag>("calm");
  const [after, setAfter] = useState<EmotionTag>("calm");
  const [followed, setFollowed] = useState<"yes" | "no" | null>(null);
  const [rulesNote, setRulesNote] = useState("");
  const [lesson, setLesson] = useState("");
  const [setup, setSetup] = useState("");
  const [grade, setGrade] = useState<"A" | "B" | "C" | "D" | null>(null);

  useEffect(() => {
    if (trade) {
      setPlan(trade.checkin.thesis);
      setSetup(trade.setup);
      setWhat(""); setRulesNote(""); setLesson(""); setFollowed(null); setGrade(null);
      setDuring(trade.checkin.emotion); setAfter("calm");
    }
  }, [tradeId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trade) return null;
  const fields = {
    plan: plan.trim(), whatHappened: what.trim(), rulesNote: rulesNote.trim(),
    lesson: lesson.trim(), followedRules: (followed ?? "yes") as "yes" | "no",
  };
  const gate = journalGate(fields);
  const quality = journalQualityScore(fields);
  const ok = followed !== null && grade !== null && gate.ok;
  const qColor = quality >= 70 ? "#2fb98c" : quality >= 40 ? "#e0a33b" : "#e0564f";

  return (
    <Modal open locked wide title={<span className="flex items-center gap-2">Mandatory post-trade journal <span className={`num text-[12px] ${trade.r >= 0 ? "text-up" : "text-down"}`}>{trade.symbol} {fmtR(trade.r)} · {fmtSigned(trade.pnl, 0)}</span></span>}>
      <p className="text-[12.5px] text-fog-400 leading-relaxed mb-5 -mt-1">
        No skip button — this is where the rep actually lands. Ten honest lines now save ten blown accounts later.
      </p>
      <div className="space-y-4">
        <div>
          <label className="lbl block mb-1.5">1 · What was the plan? (prefilled from your check-in)</label>
          <textarea className="field min-h-[56px] resize-none" value={plan} onChange={(e) => setPlan(e.target.value)} />
        </div>
        <div>
          <label className="lbl block mb-1.5">2 · What actually happened?</label>
          <textarea className="field min-h-[56px] resize-none" placeholder="Entry filled, price chopped, stop tagged on a wick, I exited at…" value={what} onChange={(e) => setWhat(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <EmoSelect label="3 · Emotional state during" value={during} onChange={setDuring} />
          <EmoSelect label="4 · Emotional state after" value={after} onChange={setAfter} />
        </div>
        <div>
          <label className="lbl block mb-1.5">5 · Did I follow my rules?</label>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((v) => (
              <button key={v} onClick={() => setFollowed(v)}
                className="btn flex-1 !py-2"
                style={followed === v
                  ? { background: v === "yes" ? "#2fb98c" : "#e0564f", color: "#08131f" }
                  : { background: "#0a1120", border: "1px solid #1c2942", color: "#93a3ba" }}>
                {v === "yes" ? "Yes, to the letter" : "No — I deviated"}
              </button>
            ))}
          </div>
          {followed === "no" && (
            <textarea className="field min-h-[48px] resize-none mt-2 animate-fade-in" placeholder="Which rule, and what did I tell myself in the moment? (min 10 chars)"
              value={rulesNote} onChange={(e) => setRulesNote(e.target.value)} />
          )}
        </div>
        <div>
          <label className="lbl block mb-1.5">6 · One concrete lesson (min 20 chars — vague doesn't count)</label>
          <textarea className="field min-h-[56px] resize-none" placeholder="Bad: 'be more patient'. Good: 'On NVDA, wait for the 5s candle to close above the level before entering…'" value={lesson} onChange={(e) => setLesson(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl block mb-1.5">Setup tag</label>
            <select className="field" value={setup} onChange={(e) => setSetup(e.target.value)}>
              {(s.plan?.setups ?? []).map((st) => <option key={st}>{st}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl block mb-1.5">Process grade — judge the decision, not the money</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["A", "B", "C", "D"] as const).map((g) => (
                <button key={g} onClick={() => setGrade(g)}
                  className="py-2 rounded-lg num font-bold text-[14px] transition-all"
                  style={{
                    background: grade === g ? `${g === "A" ? "#2fb98c" : g === "B" ? "#6fb6e8" : g === "C" ? "#e0a33b" : "#e0564f"}22` : "#0a1120",
                    border: `1px solid ${grade === g ? (g === "A" ? "#2fb98c" : g === "B" ? "#6fb6e8" : g === "C" ? "#e0a33b" : "#e0564f") : "#1c2942"}`,
                    color: grade === g ? (g === "A" ? "#2fb98c" : g === "B" ? "#6fb6e8" : g === "C" ? "#e0a33b" : "#e0564f") : "#6b7d96",
                  }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* live reflection-quality meter */}
        <div className="panel-inset p-3.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="lbl">Reflection quality</span>
            <span className="num text-[15px] font-semibold" style={{ color: qColor }}>{quality}/100</span>
          </div>
          <Bar value={quality / 100} color={qColor} h={6} />
          <p className="text-[10.5px] text-fog-500 mt-1.5 leading-snug">
            Scored on length, specificity and genuine reflection — not character count. Random text scores 10–30 and is rejected. This feeds your Process Score.
          </p>
        </div>

        {!gate.ok && (
          <div className="rounded-lg p-3 animate-fade-in" style={{ background: "rgba(224,86,79,0.08)", border: "1px solid rgba(224,86,79,0.45)" }}>
            <p className="text-[12px] text-down font-semibold flex items-center gap-2 mb-0.5">
              <span className="inline-flex"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4 2.8 20h18.4zM12 10v4.5M12 17.3v.2"/></svg></span>
              Journal blocked
            </p>
            <p className="text-[12px] text-fog-300 leading-snug">{gate.reason}</p>
          </div>
        )}

        <button className="btn btn-teal w-full !py-2.5 !text-[13.5px]" disabled={!ok}
          onClick={() => dispatch({
            type: "SUBMIT_JOURNAL", tradeId: trade.id,
            journal: { plan: plan.trim(), whatHappened: what.trim(), emotionDuring: during, emotionAfter: after, followedRules: followed!, rulesNote: rulesNote.trim(), lesson: lesson.trim(), setup, grade: grade! },
          })}>
          File journal & receive coach debrief
        </button>
      </div>
    </Modal>
  );
}

function EmoSelect({ label, value, onChange }: { label: string; value: EmotionTag; onChange: (e: EmotionTag) => void }) {
  return (
    <div>
      <label className="lbl block mb-1.5">{label}</label>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value as EmotionTag)}>
        {EMOTIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
      </select>
    </div>
  );
}
