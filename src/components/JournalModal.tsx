/* Mandatory post-trade journal — locked until a real reflection passes
   the quality gate. Cannot be skipped, cannot be gamed. */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { EMOTIONS, type EmotionTag } from "../lib/types";
import { journalGate, journalQualityScore } from "../lib/journalQuality";
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
              background: value === e.id ? `${toneFor(e.tone)}22` : "#0a1120",
              border: `1px solid ${value === e.id ? toneFor(e.tone) : "#1c2942"}`,
              color: value === e.id ? toneFor(e.tone) : "#6b7d96",
            }}>{e.label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <Modal open onClose={() => undefined} wide
      title={<span className="flex items-center gap-2"><span className="text-amber inline-flex"><Ic.journal size={16} /></span> Mandatory post-trade journal</span>}>
      {/* trade summary */}
      <div className="panel-inset p-3 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 num text-[12px]">
        <span className="font-display font-bold text-[14px] text-fog-100">{trade.symbol}</span>
        <span style={{ color: trade.side === "long" ? "#2fb98c" : "#e0564f" }}>{trade.side.toUpperCase()} {trade.qty}</span>
        <span className="text-fog-400">{trade.entry.toFixed(2)} → {trade.exit.toFixed(2)}</span>
        <span className={trade.pnl >= 0 ? "text-up" : "text-down"}>{fmtSigned(trade.pnl)}</span>
        <span className={trade.r >= 0 ? "text-up" : "text-down"}>{fmtR(trade.r)}</span>
        <span className="text-fog-500 uppercase text-[10px]">exit: {trade.exitReason}</span>
      </div>

      <p className="text-[12px] text-fog-400 leading-relaxed mb-4">
        This is where trades become lessons. Nonsense is detected and rejected — write what actually happened.
        {trade.r < 0 && <span className="text-amber"> Losing trades get scheduled for spaced-repetition review.</span>}
      </p>

      <div className="space-y-4">
        <div>
          <label className="lbl block mb-1.5">1 · What was the plan? (entry, stop, target, why)</label>
          <textarea className="field min-h-[64px] resize-none" value={plan} onChange={(e) => setPlan(e.target.value)}
            placeholder="e.g. Pullback to the 20MA in an uptrend; stop under the swing low, target 2.5R…" />
        </div>
        <div>
          <label className="lbl block mb-1.5">2 · What actually happened?</label>
          <textarea className="field min-h-[64px] resize-none" value={what} onChange={(e) => setWhat(e.target.value)}
            placeholder="e.g. Entry filled, price chopped for ten minutes, then took out the stop on a news wick…" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <EmoPick value={during} set={setDuring} label="3 · Emotional state during" />
          <EmoPick value={after} set={setAfter} label="4 · Emotional state after" />
        </div>
        <div>
          <label className="lbl block mb-1.5">5 · Did I follow my rules?</label>
          <div className="flex gap-2 mb-2">
            {(["yes", "no"] as const).map((v) => (
              <button key={v} onClick={() => setFollowed(v)}
                className="px-4 py-1.5 rounded-md text-[12px] font-bold uppercase transition-all"
                style={{
                  background: followed === v ? (v === "yes" ? "rgba(47,185,140,0.15)" : "rgba(224,86,79,0.15)") : "#0a1120",
                  border: `1px solid ${followed === v ? (v === "yes" ? "#2fb98c" : "#e0564f") : "#1c2942"}`,
                  color: followed === v ? (v === "yes" ? "#2fb98c" : "#e0564f") : "#6b7d96",
                }}>{v}</button>
            ))}
          </div>
          {followed === "no" && (
            <textarea className="field min-h-[52px] resize-none animate-fade-in" value={rulesNote} onChange={(e) => setRulesNote(e.target.value)}
              placeholder="Which rule broke, and what was the story you told yourself?" />
          )}
        </div>
        <div>
          <label className="lbl block mb-1.5">6 · One concrete lesson (min 20 real characters)</label>
          <textarea className="field min-h-[52px] resize-none" value={lesson} onChange={(e) => setLesson(e.target.value)}
            placeholder="e.g. I sized 2× plan because the last trade won — next time size from the plan, not the mood." />
        </div>
        <div>
          <label className="lbl block mb-1.5">7 · Process grade (A = flawless execution, regardless of money)</label>
          <div className="flex gap-2">
            {(["A", "B", "C", "D"] as const).map((g) => (
              <button key={g} onClick={() => setGrade(g)}
                className="w-11 h-11 rounded-lg font-display font-bold text-[16px] transition-all"
                style={{
                  background: grade === g ? "rgba(111,182,232,0.16)" : "#0a1120",
                  border: `1px solid ${grade === g ? "#6fb6e8" : "#1c2942"}`,
                  color: grade === g ? "#6fb6e8" : "#6b7d96",
                }}>{g}</button>
            ))}
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
            Scored on length, specificity and genuine reflection — not character count. Random text scores 10–30 and is rejected. Feeds the (deliberately small) journal slice of your Process Score.
          </p>
        </div>

        {!gate.ok && (
          <div className="rounded-lg p-3 animate-fade-in" style={{ background: "rgba(224,86,79,0.08)", border: "1px solid rgba(224,86,79,0.45)" }}>
            <p className="text-[12px] text-down font-semibold flex items-center gap-2 mb-0.5">
              <span className="inline-flex"><Ic.alert size={13} /></span> Journal blocked
            </p>
            <p className="text-[12px] text-fog-300 leading-snug">{gate.reason}</p>
          </div>
        )}

        <button className="btn btn-teal w-full !py-2.5 !text-[13.5px]" disabled={!ok}
          onClick={() => dispatch({
            type: "SUBMIT_JOURNAL", tradeId: trade.id,
            journal: { plan: fields.plan, whatHappened: fields.whatHappened, emotionDuring: during, emotionAfter: after, followedRules: followed!, rulesNote: fields.rulesNote, lesson: fields.lesson, setup: trade.setup, grade: grade! },
          })}>
          File journal &amp; receive coach debrief
        </button>
        <p className="text-[10.5px] text-fog-600 text-center -mt-1">The journal closes only when a real reflection is filed. New orders wait until then.</p>
      </div>
    </Modal>
  );
}
