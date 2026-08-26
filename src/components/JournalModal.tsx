/* Mandatory post-trade journal - locked until a real reflection passes
   the quality gate. Cannot be gamed. Owner sessions may skip via X. */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { EMOTIONS, type EmotionTag } from "../lib/types";
import { journalGate, journalQualityScore } from "../lib/journalQuality";
import { isAdminSession } from "../lib/admin";
import { Bar, Ic, Modal, fmtR, fmtSigned } from "./ui";

export default function JournalModal() {
  const { state: s, dispatch } = useApp();
  const tradeId = s.journalDue[0] ?? null;
  const trade = useMemo(() => s.trades.find((t) => t.id === tradeId) ?? null, [s.trades, tradeId]);

  const [plan, setPlan] = useState("");
  const [what, setWhat] = useState("");
  const [during, setDuring] = useState<EmotionTag>("calm");
  const [after, setAfter] = useState<EmotionTag>("calm");
  const [followed, setFollowed] = useState<"yes" | "no" | null>(null);
  const [rulesNote, setRulesNote] = useState("");
  const [lesson, setLesson] = useState("");
  const [grade, setGrade] = useState<"A" | "B" | "C" | "D" | null>(null);

  useEffect(() => {
    setPlan(""); setWhat(""); setDuring("calm"); setAfter("calm");
    setFollowed(null); setRulesNote(""); setLesson(""); setGrade(null);
  }, [tradeId]);

  if (!trade) return null;
  const fields = {
    plan: plan.trim(), whatHappened: what.trim(), rulesNote: rulesNote.trim(),
    lesson: lesson.trim(), followedRules: (followed ?? "yes") as "yes" | "no",
  };
  const gate = journalGate(fields);
  const quality = journalQualityScore(fields);
  const ok = followed !== null && grade !== null && gate.ok;
  const qColor = quality >= 70 ? "#2fb98c" : quality >= 40 ? "#e0a33b" : "#e0564f";

  const toneFor = (t: "up" | "warn" | "down") => (t === "up" ? "#2fb98c" : t === "warn" ? "#e0a33b" : "#e0564f");
  const EmoPick = ({ value, set, label }: { value: EmotionTag; set: (e: EmotionTag) => void; label: string }) => (
    <div>
      <label className="lbl block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1">
        {EMOTIONS.map((e) => (
          <button key={e.id} onClick={() => set(e.id)}
            className="px-2 py-1 rounded-md text-[10.5px] font-semibold transition-all"
            style={{
              background: value === e.id ? toneFor(e.tone) + "22" : "#0a1120",
              border: "1px solid " + (value === e.id ? toneFor(e.tone) : "#1c2942"),
              color: value === e.id ? toneFor(e.tone) : "#6b7d96",
            }}>{e.label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <Modal open onClose={() => undefined} wide
      title={<span className="flex items-center gap-2"><span className="text-amber inline-flex"><Ic.journal size={16} /></span> Mandatory post-trade journal</span>}>
      {isAdminSession() && (
        <button
          onClick={() => dispatch({ type: "SKIP_JOURNAL", tradeId: trade.id })}
          aria-label="Skip"
          title="Skip"
          className="absolute top-3 right-12 inline-flex items-center justify-center w-7 h-7 rounded-lg text-fog-500 transition-all hover:text-fog-100"
          style={{ background: "#111b30", border: "1px solid #2a3c5e" }}>
          <Ic.x size={14} />
        </button>
      )}

      <div className="panel-inset p-3 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 num text-[12px]">
        <span className="font-display font-bold text-[14px] text-fog-100">{trade.symbol}</span>
        <span style={{ color: trade.side === "long" ? "#2fb98c" : "#e0564f" }}>{trade.side.toUpperCase()} {trade.qty}</span>
        <span className="text-fog-400">{trade.entry.toFixed(2)} to {trade.exit.toFixed(2)}</span>
        <span className={trade.pnl >= 0 ? "text-up" : "text-down"}>{fmtSigned(trade.pnl)}</span>
        <span className={trade.r >= 0 ? "text-up" : "text-down"}>{fmtR(trade.r)}</span>
        <span className="text-fog-500 uppercase text-[10px]">exit: {trade.exitReason}</span>
      </div>

      <p className="text-[12px] text-fog-400 leading-relaxed mb-4">
        This is where trades become lessons. Nonsense is detected and rejected - write what actually happened.
        {trade.r < 0 && <span className="text-amber"> Losing trades get scheduled for spaced-repetition review.</span>}
      </p>

      <div className="space-y-4">
        <div>
          <label className="lbl block mb-1.5">What was the plan before entry?</label>
          <textarea className="field min-h-[60px] resize-none" value={plan} onChange={(e) => setPlan(e.target.value)}
            placeholder="Setup, entry trigger, stop logic, target, expected R..." />
        </div>
        <div>
          <label className="lbl block mb-1.5">What actually happened?</label>
          <textarea className="field min-h-[60px] resize-none" value={what} onChange={(e) => setWhat(e.target.value)}
            placeholder="How price behaved, where you exited, and why..." />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <EmoPick value={during} set={setDuring} label="Emotion during" />
          <EmoPick value={after} set={setAfter} label="Emotion after" />
        </div>
        <div>
          <label className="lbl block mb-1.5">Did you follow your rules?</label>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((v) => (
              <button key={v} onClick={() => setFollowed(v)}
                className="btn flex-1"
                style={followed === v ? { background: v === "yes" ? "#2fb98c" : "#e0564f", borderColor: v === "yes" ? "#2fb98c" : "#e0564f", color: v === "yes" ? "#062019" : "#fff5f4" } : undefined}>
                {v === "yes" ? "Yes, fully" : "No, I broke something"}
              </button>
            ))}
          </div>
          {followed === "no" && (
            <textarea className="field min-h-[52px] resize-none mt-2" value={rulesNote} onChange={(e) => setRulesNote(e.target.value)}
              placeholder="Which rule, and what talked you into breaking it?" />
          )}
        </div>
        <div>
          <label className="lbl block mb-1.5">One concrete lesson (min 20 chars)</label>
          <textarea className="field min-h-[60px] resize-none" value={lesson} onChange={(e) => setLesson(e.target.value)}
            placeholder="Next time I will..." />
        </div>
        <div>
          <label className="lbl block mb-1.5">Process grade - how was the execution, regardless of P&L?</label>
          <div className="grid grid-cols-4 gap-2">
            {(["A", "B", "C", "D"] as const).map((g) => (
              <button key={g} onClick={() => setGrade(g)}
                className="py-2 rounded-lg font-display font-bold text-[15px] transition-all"
                style={{
                  background: grade === g ? (g === "A" ? "#2fb98c" : g === "B" ? "#6fb6e8" : g === "C" ? "#e0a33b" : "#e0564f") : "#0a1120",
                  border: "1px solid " + (grade === g ? "transparent" : "#1c2942"),
                  color: grade === g ? "#08131f" : "#93a3ba",
                }}>{g}</button>
            ))}
          </div>
        </div>

        <div className="panel-inset p-3.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="lbl">Reflection quality</span>
            <span className="num text-[15px] font-semibold" style={{ color: qColor }}>{quality}/100</span>
          </div>
          <Bar value={quality / 100} color={qColor} h={6} />
          <p className="text-[10.5px] text-fog-500 mt-1.5 leading-snug">
            Scored on length, specificity and genuine reflection - not character count. Random text scores 10-30 and is rejected. This feeds your Process Score.
          </p>
        </div>

        {!gate.ok && (
          <div className="rounded-lg p-3 animate-fade-in" style={{ background: "rgba(224,86,79,0.08)", border: "1px solid rgba(224,86,79,0.45)" }}>
            <p className="text-[12px] text-down font-semibold flex items-center gap-2 mb-0.5">
              <span className="inline-flex"><Ic.alert size={14} /></span> Journal blocked
            </p>
            <p className="text-[12px] text-fog-300 leading-snug">{gate.reason}</p>
          </div>
        )}

        <button className="btn btn-teal w-full" style={{ padding: "10px 14px", fontSize: 13.5 }} disabled={!ok}
          onClick={() => dispatch({
            type: "SUBMIT_JOURNAL", tradeId: trade.id,
            journal: { plan: plan.trim(), whatHappened: what.trim(), emotionDuring: during, emotionAfter: after, followedRules: followed!, rulesNote: rulesNote.trim(), lesson: lesson.trim(), setup: trade.setup, grade: grade! },
          })}>
          File journal & receive coach debrief
        </button>
      </div>
    </Modal>
  );
}
