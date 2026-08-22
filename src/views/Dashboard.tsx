/* Debrief — process first, P&L second. */
import { useApp } from "../lib/store";
import { PROCESS_LABELS, computeProcess, detectTiltSignals, emotionExpectancy, equityCurve, rollingR, setupStats } from "../lib/coaching";
import { EquityLine } from "../components/Chart";
import { Bar, Empty, Flash, Gauge, Ic, fmtR, fmtSigned } from "../components/ui";
import { Progressive } from "../components/Skeleton";

export default function Dashboard() {
  const { state: s } = useApp();
  const signals = detectTiltSignals(s.trades, s.violations);
  const proc = computeProcess(s.trades, s.violations, s.plan, signals);
  const emo = emotionExpectancy(s.trades);
  const setups = setupStats(s.trades);
  const roll = rollingR(s.trades);
  const curve = equityCurve(s.sessionStartEquity, s.trades);
  const dayPnl = s.equity - s.sessionStartEquity;
  const dayPct = s.sessionStartEquity > 0 ? (dayPnl / s.sessionStartEquity) * 100 : 0;
  const openRisk = s.positions.reduce((a, p) => a + p.riskAmount, 0);
  const dd = s.peakEquity > 0 ? ((s.equity - s.peakEquity) / s.peakEquity) * 100 : 0;
  const totalPnl = s.trades.reduce((a, t) => a + t.pnl, 0);
  const avgR = s.trades.length ? s.trades.reduce((a, t) => a + t.r, 0) / s.trades.length : 0;
  const maxEmo = Math.max(0.25, ...emo.map((e) => Math.abs(e.avgR)));
  const tiltTotal = signals.length;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="max-w-[1180px] mx-auto space-y-3.5">
        {/* headline strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="panel p-3.5 col-span-2">
            <p className="lbl">Equity</p>
            <Flash value={s.equity} format={(n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              className="text-[26px] font-semibold text-fog-100 leading-tight" />
            <p className={`num text-[12px] mt-0.5 ${totalPnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(totalPnl)} realized all-time</p>
          </div>
          <Stat label="Session P&L" v={fmtSigned(dayPnl)} sub={`${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%`} tone={dayPnl >= 0 ? "up" : "down"} />
          <Stat label="Open risk" v={`$${openRisk.toFixed(0)}`} sub={`limit $${((s.plan?.maxOpenRiskPct ?? 0) / 100 * s.equity).toFixed(0)}`} bar={openRisk / Math.max(1, (s.plan?.maxOpenRiskPct || 1) / 100 * s.equity)} />
          <Stat label="Drawdown" v={`${dd.toFixed(2)}%`} sub={`peak $${s.peakEquity.toFixed(0)}`} tone={dd < -3 ? "down" : undefined} />
          <Stat label="Avg R / trade" v={s.trades.length ? fmtR(avgR) : "—"} sub={`${s.trades.length} closed · ${tiltTotal} tilt flags`} tone={avgR >= 0 ? "up" : s.trades.length ? "down" : undefined} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-3.5">
          <div className="space-y-3.5">
            <div className="panel p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="lbl">Equity curve · realized</p>
                <span className="num text-[11px] text-fog-500">dashed = session start</span>
              </div>
              <EquityLine points={curve} baseline={s.sessionStartEquity} height={168} />
            </div>
            <div className="panel p-4">
              <p className="lbl mb-3">Rolling expectancy · last 10 trades</p>
              {roll.length === 0 ? <Empty title="No sample yet" body="Your rolling expectancy appears after ten closed trades." /> : (
                <div className="flex items-end gap-[3px] h-[74px]">
                  {roll.slice(-40).map((r, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end items-stretch group relative">
                      <div className="rounded-sm transition-all duration-300"
                        style={{ height: `${Math.min(100, Math.max(6, Math.abs(r) * 46))}%`, background: r >= 0 ? "rgba(47,185,140,0.75)" : "rgba(224,86,79,0.75)" }} />
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 num text-[9.5px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
                        style={{ background: "#0a1120", border: "1px solid #1c2942", color: r >= 0 ? "#2fb98c" : "#e0564f" }}>{fmtR(r)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="h-px mt-2 mb-1.5" style={{ background: "#24344f" }} />
              <div className="flex justify-between text-[10px] text-fog-600 num"><span>older</span><span>positive expectancy lives above the line</span><span>latest</span></div>
            </div>

            <Progressive height={240} delay={80}>
              <div className="panel p-4">
                <p className="lbl mb-3">Setup library — expectancy by named setup</p>
                {setups.length === 0 ? <Empty title="No tagged trades" body="Every order ticket asks for a setup tag. Statistics accumulate per setup." /> : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="lbl !text-[9.5px]">
                        <th className="text-left pb-2 font-semibold">Setup</th>
                        <th className="text-right pb-2 font-semibold">N</th>
                        <th className="text-right pb-2 font-semibold">Win</th>
                        <th className="text-right pb-2 font-semibold">Avg R</th>
                        <th className="text-right pb-2 font-semibold">P&L</th>
                        <th className="text-right pb-2 font-semibold">Viol.</th>
                      </tr>
                    </thead>
                    <tbody className="num">
                      {setups.map((st) => (
                        <tr key={st.setup} className="border-t border-line-soft row-hover">
                          <td className="py-2 font-body font-semibold text-fog-200">{st.setup}</td>
                          <td className="py-2 text-right text-fog-400">{st.n}</td>
                          <td className="py-2 text-right text-fog-300">{(st.winRate * 100).toFixed(0)}%</td>
                          <td className={`py-2 text-right font-medium ${st.avgR >= 0 ? "text-up" : "text-down"}`}>{fmtR(st.avgR)}</td>
                          <td className={`py-2 text-right ${st.expectancy >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(st.expectancy, 0)}</td>
                          <td className="py-2 text-right" style={{ color: st.violations ? "#e0564f" : "#4d5f78" }}>{st.violations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Progressive>
          </div>

          {/* right rail */}
          <div className="space-y-3.5">
            <div className="panel p-4 flex flex-col items-center">
              <Gauge value={proc.score} label="Process score" size={132} />
              <p className="text-[11.5px] text-fog-500 text-center mt-2 leading-snug max-w-[270px]">
                Adherence 30 · <strong className="text-fog-300">post-loss 25</strong> · sizing 15 · setups 15 · emotion 10 · journal 5.
                Post-loss discipline is weighted hardest — it's what blows accounts.
              </p>
              <div className="w-full mt-4 space-y-2.5">
                {PROCESS_LABELS.map((p) => (
                  <div key={p.key}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-fog-400">{p.label}</span>
                      <span className="num text-fog-300">{Math.round(proc.parts[p.key] * 100)}</span>
                    </div>
                    <Bar value={proc.parts[p.key]} color={proc.parts[p.key] >= 0.8 ? "#2fb98c" : proc.parts[p.key] >= 0.55 ? "#e0a33b" : "#e0564f"} />
                  </div>
                ))}
              </div>
            </div>

            <Progressive height={200} delay={140}>
              <div className="panel p-4">
                <p className="lbl mb-3">Emotional state × expectancy</p>
                {emo.length === 0 ? <Empty title="No check-ins yet" body="Pre-trade check-ins build your emotional P&L profile." /> : (
                  <div className="space-y-2.5">
                    {emo.map((e) => (
                      <div key={e.tag}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-fog-300 font-medium">{e.label} <span className="text-fog-600 num">×{e.n}</span></span>
                          <span className={`num font-medium ${e.avgR >= 0 ? "text-up" : "text-down"}`}>{fmtR(e.avgR)}</span>
                        </div>
                        <div className="relative h-[7px] rounded-full" style={{ background: "#16213a" }}>
                          <div className="absolute top-0 bottom-0 w-px left-1/2" style={{ background: "#3a4c6e" }} />
                          <div className="absolute top-[1px] bottom-[1px] rounded-full"
                            style={{
                              left: e.avgR >= 0 ? "50%" : `${50 - (Math.abs(e.avgR) / maxEmo) * 48}%`,
                              width: `${(Math.abs(e.avgR) / maxEmo) * 48}%`,
                              background: e.avgR >= 0 ? "#2fb98c" : "#e0564f",
                              transition: "all 0.6s cubic-bezier(0.22,1,0.36,1)",
                            }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Progressive>

            <div className="panel p-4">
              <p className="lbl mb-2.5">Violation &amp; tilt feed</p>
              {s.violations.length === 0 && (
                <p className="text-[12px] text-up flex items-center gap-2"><Ic.check size={14} /> Clean sheet — zero rule violations.</p>
              )}
              {s.violations.slice(0, 6).map((v) => (
                <div key={v.id} className="py-2 border-b border-line-soft last:border-0">
                  <p className="text-[12px] font-semibold" style={{ color: v.rule.startsWith("Tilt") ? "#e0a33b" : "#e8837d" }}>{v.rule}</p>
                  <p className="text-[11px] text-fog-500 leading-snug">{v.detail} · <span className="num">{new Date(v.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></p>
                </div>
              ))}
            </div>

            <div className="panel p-4">
              <p className="lbl mb-2.5">Event log</p>
              <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                {s.log.slice(0, 14).map((l) => (
                  <p key={l.id} className="text-[11px] leading-snug flex gap-2">
                    <span className="num text-fog-600 shrink-0 w-[34px]">{new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    <span style={{ color: l.kind === "risk" ? "#e8837d" : l.kind === "coach" ? "#39c5a5" : l.kind === "event" ? "#e0a33b" : "#93a3ba" }}>{l.text}</span>
                  </p>
                ))}
                {s.log.length === 0 && <p className="text-[11.5px] text-fog-600">The tape is waiting.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, sub, tone, bar }: { label: string; v: string; sub: string; tone?: "up" | "down"; bar?: number }) {
  return (
    <div className="panel p-3.5 flex flex-col justify-between gap-1.5">
      <p className="lbl">{label}</p>
      <div>
        <p className={`num text-[19px] font-semibold leading-tight ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-fog-100"}`}>{v}</p>
        <p className="text-[10.5px] text-fog-500 num mt-0.5">{sub}</p>
      </div>
      {bar !== undefined && <Bar value={bar} color={bar > 0.85 ? "#e0564f" : "#39c5a5"} h={4} />}
    </div>
  );
}
