/* Debrief - process first, P&L second. */
import { useMemo } from "react";
import { useApp } from "../lib/store";
import {
  computeProcess, PROCESS_LABELS, PROCESS_WEIGHTS, detectTiltSignals,
  emotionExpectancy, setupStats, equityCurve,
} from "../lib/coaching";
import { EquityLine } from "../components/Chart";
import { Progressive } from "../components/Skeleton";
import { Bar, Empty, Flash, Gauge, Ic, fmtR, fmtSigned } from "../components/ui";

export default function Dashboard() {
  const { state: s } = useApp();
  const proc = useMemo(() => computeProcess(s.trades, s.violations, s.plan), [s.trades, s.violations, s.plan]);
  const signals = useMemo(() => detectTiltSignals(s.trades, s.violations), [s.trades, s.violations]);
  const emo = useMemo(() => emotionExpectancy(s.trades), [s.trades]);
  const setups = useMemo(() => setupStats(s.trades), [s.trades]);
  const curve = useMemo(() => equityCurve(s.plan?.startingCapital ?? s.equity, s.trades), [s.trades, s.plan, s.equity]);

  const wins = s.trades.filter((t) => t.pnl > 0).length;
  const winRate = s.trades.length ? wins / s.trades.length : 0;
  const avgR = s.trades.length ? s.trades.reduce((a, t) => a + t.r, 0) / s.trades.length : 0;
  const realized = s.trades.reduce((a, t) => a + t.pnl, 0);
  const journalRate = s.trades.length ? s.trades.filter((t) => t.journal).length / s.trades.length : 0;
  const dayPnl = s.equity - s.sessionStartEquity;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[1080px] mx-auto space-y-3.5">
        {/* header strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 animate-fade-up">
          {[
            { k: "Session P&L", v: <span className={"num text-[18px] font-semibold " + (dayPnl >= 0 ? "text-up" : "text-down")}>{fmtSigned(dayPnl, 0)}</span> },
            { k: "Realized", v: <span className={"num text-[18px] font-semibold " + (realized >= 0 ? "text-up" : "text-down")}>{fmtSigned(realized, 0)}</span> },
            { k: "Win rate", v: <span className="num text-[18px] font-semibold text-fog-100">{(winRate * 100).toFixed(0)}%</span> },
            { k: "Avg R", v: <span className={"num text-[18px] font-semibold " + (avgR >= 0 ? "text-up" : "text-down")}>{fmtR(avgR)}</span> },
            { k: "Equity", v: <Flash value={s.equity} format={(n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })} className="text-[18px] font-semibold text-fog-100" /> },
          ].map((c, i) => (
            <div key={i} className="panel p-3.5">
              <p className="lbl mb-1">{c.k}</p>
              {c.v}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-3.5">
          <div className="space-y-3.5 min-w-0">
            {/* process score card */}
            <div className="panel p-4 animate-fade-up" style={{ animationDelay: "40ms" }}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative">
                  <Gauge value={proc.score} size={74} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="num text-[20px] font-bold text-fog-100">{proc.score}</span>
                    <span className="lbl" style={{ fontSize: 7.5 }}>PROCESS</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <p className="font-display font-bold text-[15px] text-fog-100 mb-0.5">Process beats P&L here</p>
                  <p className="text-[11.5px] text-fog-500 leading-snug">
                    Weighted: adherence {PROCESS_WEIGHTS.adherence} - post-loss {PROCESS_WEIGHTS.postLoss} - sizing {PROCESS_WEIGHTS.sizing} - setup {PROCESS_WEIGHTS.setup} - emotion {PROCESS_WEIGHTS.emotion} - journal {PROCESS_WEIGHTS.journal}. Tilt signals decay over 7 days.
                  </p>
                </div>
                <div className="text-right">
                  <p className="lbl mb-1">Practice score</p>
                  <p className="num text-[22px] font-semibold text-teal">{s.practiceScore}</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-x-5 gap-y-2.5 mt-4">
                {PROCESS_LABELS.map((p) => (
                  <div key={p.key}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[10.5px] text-fog-400">{p.label}</span>
                      <span className="num text-[11px] text-fog-300">{Math.round(proc.parts[p.key] * 100)}</span>
                    </div>
                    <Bar value={proc.parts[p.key]} h={4}
                      color={proc.parts[p.key] >= 0.7 ? "#2fb98c" : proc.parts[p.key] >= 0.45 ? "#e0a33b" : "#e0564f"} />
                  </div>
                ))}
              </div>
            </div>

            {/* equity curve */}
            <div className="panel p-4 animate-fade-up" style={{ animationDelay: "80ms" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="lbl">Equity curve - realized</p>
                <span className="num text-[11px] text-fog-500">{s.trades.length} closed trades</span>
              </div>
              {s.trades.length === 0
                ? <Empty title="No curve yet" body="Close your first trade and the equity line starts drawing itself." />
                : <EquityLine data={curve} baseline={s.plan?.startingCapital ?? curve[0]} height={150} />}
            </div>

            {/* setups */}
            <Progressive height={240} delay={80}>
              <div className="panel p-4">
                <p className="lbl mb-3">Setup library - expectancy by named setup</p>
                {setups.length === 0
                  ? <Empty title="No tagged trades" body="Every order carries a setup tag. Expectancy per setup shows which of your plays actually pay." />
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full num text-[12px]">
                        <thead>
                          <tr className="text-left text-fog-500">
                            {["Setup", "N", "Win %", "Avg R", "Expectancy $", "Violations"].map((h) => (
                              <th key={h} className="lbl font-normal pb-2 pr-4" style={{ fontSize: 9 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {setups.map((st) => (
                            <tr key={st.setup} className="border-t" style={{ borderColor: "#16213a" }}>
                              <td className="py-2 pr-4 font-display font-semibold text-fog-100">{st.setup}</td>
                              <td className="py-2 pr-4 text-fog-300">{st.n}</td>
                              <td className="py-2 pr-4 text-fog-300">{(st.winRate * 100).toFixed(0)}%</td>
                              <td className={"py-2 pr-4 " + (st.avgR >= 0 ? "text-up" : "text-down")}>{fmtR(st.avgR)}</td>
                              <td className={"py-2 pr-4 " + (st.expectancy >= 0 ? "text-up" : "text-down")}>{fmtSigned(st.expectancy, 0)}</td>
                              <td className={"py-2 " + (st.violations > 0 ? "text-down" : "text-fog-500")}>{st.violations}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </Progressive>
          </div>

          {/* right rail */}
          <div className="space-y-3.5 min-w-0">
            <Progressive height={200} delay={140}>
              <div className="panel p-4">
                <p className="lbl mb-3">Emotional state x expectancy</p>
                {emo.length === 0
                  ? <p className="text-[11.5px] text-fog-600">Check-ins correlate with outcomes once trades close.</p>
                  : (
                    <div className="space-y-2.5">
                      {emo.map((e) => (
                        <div key={e.tag} className="flex items-center gap-2.5">
                          <span className="text-[11px] text-fog-300 w-20 shrink-0">{e.label}</span>
                          <div className="flex-1"><Bar value={Math.min(1, Math.abs(e.avgR) / 2)} h={5} color={e.avgR >= 0 ? "#2fb98c" : "#e0564f"} /></div>
                          <span className={"num text-[11px] w-14 text-right " + (e.avgR >= 0 ? "text-up" : "text-down")}>{fmtR(e.avgR)}</span>
                          <span className="num text-[9.5px] text-fog-600 w-8">n={e.n}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </Progressive>

            <div className="panel p-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
              <p className="lbl mb-2.5">Tilt detector - {signals.length} signal{signals.length === 1 ? "" : "s"} logged</p>
              {signals.length === 0
                ? <p className="text-[11.5px] text-fog-600 leading-snug">Six behavioral signatures watched: revenge sizing, rapid re-entry, setup abandonment, rule breaks after loss, overtrading bursts, direction flips.</p>
                : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {[...signals].reverse().slice(0, 8).map((sig) => (
                      <div key={sig.key} className="panel-inset p-2.5">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="inline-flex" style={{ color: sig.severity === 3 ? "#e0564f" : sig.severity === 2 ? "#e0a33b" : "#6fb6e8" }}><Ic.alert size={12} /></span>
                          <span className="text-[11px] font-semibold text-fog-200">sev {sig.severity}</span>
                          <span className="num text-[9px] text-fog-600 ml-auto">{new Date(sig.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                        </div>
                        <p className="text-[10.5px] text-fog-400 leading-snug">{sig.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="panel p-4 animate-fade-up" style={{ animationDelay: "160ms" }}>
              <p className="lbl mb-2.5">Violation feed</p>
              {s.violations.length === 0
                ? <p className="text-[11.5px] text-fog-600">Clean ledger. Keep it that way.</p>
                : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {[...s.violations].reverse().slice(0, 8).map((v) => (
                      <div key={v.id} className="flex items-start gap-2 text-[11px] leading-snug">
                        <span className="mt-[3px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#e0564f" }} />
                        <span className="text-fog-400"><strong className="text-fog-200">{v.rule}.</strong> {v.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t" style={{ borderColor: "#16213a" }}>
                <span className="lbl">Journal rate</span>
                <span className="num text-[13px] font-semibold" style={{ color: journalRate >= 0.8 ? "#2fb98c" : journalRate >= 0.5 ? "#e0a33b" : "#e0564f" }}>
                  {(journalRate * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
