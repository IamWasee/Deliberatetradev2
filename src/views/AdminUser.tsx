/* Per-user detail — metrics only. There is no code path here that reads
   `journals`: that table grants admins nothing, which is what the privacy
   policy promises. Emotion TAGS and quality SCORES appear; the prose the
   user wrote does not. */
import { useEffect, useState } from "react";
import { getUserDetail, type UserDetail } from "../lib/adminApi";
import type { Profile } from "../lib/account";
import { Empty, Ic, Modal, fmtR, fmtSigned } from "../components/ui";

const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const when = (iso: string) => new Date(iso).toLocaleString("en-US",
  { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AdminUser({ user, onClose }: { user: Profile; onClose: () => void }) {
  const [d, setD] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void getUserDetail(user.id).then(({ data, error }) => {
      if (!live) return;
      setD(data); setError(error); setLoading(false);
    });
    return () => { live = false; };
  }, [user.id]);

  const s = d?.stats;

  return (
    <Modal open onClose={onClose}
      title={<span className="flex items-center gap-2">
        <span className="text-teal inline-flex"><Ic.gauge size={16} /></span>
        <span className="num">{user.email}</span>
      </span>}>
      {loading ? (
        <p className="text-[12px] text-fog-500 py-6 text-center">Loading…</p>
      ) : error ? (
        <p className="text-[12px] text-down py-6 text-center">{error}</p>
      ) : !s ? (
        <Empty title="No trading data yet"
          body="This user hasn't completed a session, or hasn't synced since the update." />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { k: "Equity", v: money(s.equity), tone: "" },
              { k: "Session P&L", v: fmtSigned(s.session_pnl, 0), tone: s.session_pnl >= 0 ? "text-up" : "text-down" },
              { k: "Realized", v: fmtSigned(s.realized_pnl, 0), tone: s.realized_pnl >= 0 ? "text-up" : "text-down" },
              { k: "Process", v: String(s.process_score), tone: "" },
              { k: "Win rate", v: (s.win_rate * 100).toFixed(0) + "%", tone: "" },
              { k: "Avg R", v: fmtR(s.avg_r), tone: s.avg_r >= 0 ? "text-up" : "text-down" },
            ].map((c) => (
              <div key={c.k} className="panel-inset p-2.5">
                <p className="lbl mb-1">{c.k}</p>
                <p className={"num text-[15px] font-semibold " + (c.tone || "text-fog-100")}>{c.v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2.5 text-center">
            {[
              ["Trades", s.trade_count], ["Violations", s.violation_count],
              ["Journals", s.journal_count], ["Breaches", s.breaches],
            ].map(([k, v]) => (
              <div key={k as string}>
                <p className="num text-[15px] font-semibold text-fog-100">{v as number}</p>
                <p className="lbl">{k as string}</p>
              </div>
            ))}
          </div>

          {d!.positions.length > 0 && (
            <div>
              <p className="lbl mb-2">Open positions - ${d!.positions.reduce((a, p) => a + p.risk_amount, 0).toFixed(0)} at risk</p>
              <div className="space-y-1.5">
                {d!.positions.map((p) => (
                  <div key={p.id} className="panel-inset p-2.5 flex items-center justify-between gap-3">
                    <span className="num text-[12px] text-fog-100">
                      {p.symbol} <span className={p.side === "long" ? "text-up" : "text-down"}>{p.side}</span> ×{p.qty}
                    </span>
                    <span className="num text-[11px] text-fog-400">
                      @{p.avg_entry} · stop {p.stop ?? "none"} · {p.risk_pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="lbl mb-2">Recent trades</p>
            {d!.trades.length === 0 ? (
              <p className="text-[11.5px] text-fog-500">No closed trades yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1c2942" }}>
                      {["Symbol", "P&L", "R", "Setup", "Felt", "Rules", "Grade", "Closed"].map((h) => (
                        <th key={h} className="lbl py-1.5 pr-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d!.trades.slice(0, 25).map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #141f33" }}>
                        <td className="py-1.5 pr-3 num text-[11.5px] text-fog-100 whitespace-nowrap">
                          {t.symbol} <span className={t.side === "long" ? "text-up" : "text-down"}>{t.side}</span>
                          {t.override && <span className="text-down" title="Sized above plan"> !</span>}
                        </td>
                        <td className={"py-1.5 pr-3 num text-[11.5px] " + (t.pnl >= 0 ? "text-up" : "text-down")}>{fmtSigned(t.pnl, 0)}</td>
                        <td className={"py-1.5 pr-3 num text-[11.5px] " + (t.r >= 0 ? "text-up" : "text-down")}>{fmtR(t.r)}</td>
                        <td className="py-1.5 pr-3 text-[11px] text-fog-400 whitespace-nowrap">{t.setup ?? "-"}</td>
                        <td className="py-1.5 pr-3 text-[11px] text-fog-400 whitespace-nowrap">{t.emotion_before ?? "-"}</td>
                        <td className="py-1.5 pr-3 text-[11px] whitespace-nowrap"
                          style={{ color: t.followed_rules === false ? "#e0564f" : "#6b7d96" }}>
                          {t.followed_rules === null ? "-" : t.followed_rules ? "yes" : "no"}
                        </td>
                        <td className="py-1.5 pr-3 text-[11px] text-fog-400">{t.grade ?? "-"}</td>
                        <td className="py-1.5 pr-3 text-[11px] text-fog-500 num whitespace-nowrap">{when(t.closed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {d!.violations.length > 0 && (
            <div>
              <p className="lbl mb-2">Recent violations</p>
              <div className="space-y-1.5">
                {d!.violations.slice(0, 8).map((v) => (
                  <div key={v.id} className="panel-inset p-2.5">
                    <p className="text-[11.5px] text-down">{v.rule}</p>
                    {v.detail && <p className="text-[11px] text-fog-500 mt-0.5">{v.detail}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10.5px] text-fog-500 leading-relaxed pt-1" style={{ borderTop: "1px solid #1c2942" }}>
            Journal and check-in text is not shown, and is not readable by administrators at any
            privilege this console holds. Emotion tags and quality scores above are derived metrics.
            Last synced {when(s.updated_at)}.
          </p>
        </div>
      )}
    </Modal>
  );
}
