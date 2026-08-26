/* =====================================================================
   Admin console - account records, tiers, activity.

   This screen renders whatever the database returns. It performs no
   authorisation of its own: a non-admin who forces their way here sees
   their own row and nothing else, because the RLS policies decide what
   listUsers() yields. The UI is a convenience, not the control.

   Phase 1 scope: account data only. Equity, trades and Process Scores
   still live in each user's browser and cannot be shown until the data
   sync ships. Journal text is intentionally never exposed.
   ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from "react";
import { listUsers, setTier, summarise, listStats, type UserStats } from "../lib/adminApi";
import AdminUser from "./AdminUser";
import type { Profile, Tier } from "../lib/account";
import { Empty, Ic } from "../components/ui";

const TIERS: Tier[] = ["free", "pro", "elite"];

const TIER_STYLE: Record<Tier, { fg: string; bg: string; bd: string }> = {
  free:  { fg: "#93a3ba", bg: "rgba(147,163,186,0.10)", bd: "rgba(147,163,186,0.35)" },
  pro:   { fg: "#39c5a5", bg: "rgba(57,197,165,0.10)",  bd: "rgba(57,197,165,0.40)" },
  elite: { fg: "#e0a33b", bg: "rgba(224,163,59,0.10)",  bd: "rgba(224,163,59,0.40)" },
};

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never";

const relative = (iso: string | null): string => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  return Math.floor(days / 30) + "mo ago";
};

export default function Admin() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, UserStats>>({});
  const [open, setOpen] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [u, st] = await Promise.all([listUsers(), listStats()]);
    setUsers(u.data ?? []);
    setStats(st.data ?? {});
    setError(u.error || st.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const agg = useMemo(() => summarise(users), [users]);
  const totalTrades = useMemo(
    () => Object.values(stats).reduce((a, s2) => a + s2.trade_count, 0), [stats]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q));
  }, [users, query]);

  const change = async (u: Profile, tier: Tier) => {
    if (tier === u.tier) return;
    setSaving(u.id);
    const { data, error } = await setTier(u.id, tier);
    if (data) setUsers((prev) => prev.map((p) => (p.id === u.id ? data : p)));
    else setError(error || "That change was refused.");
    setSaving(null);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">

        <div className="flex flex-wrap items-center gap-3 mb-6 animate-fade-up">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-teal"
            style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.35)" }}>
            <Ic.shield size={20} />
          </span>
          <div className="flex-1 min-w-[200px]">
            <h1 className="font-display font-bold text-[24px] md:text-[28px] text-fog-100 leading-tight">Admin console</h1>
            <p className="text-[12px] text-fog-500 mt-0.5">Accounts and subscription tiers.</p>
          </div>
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-6 animate-fade-up">
          {[
            { k: "Accounts", v: agg.total },
            { k: "New this week", v: agg.newThisWeek },
            { k: "Active this week", v: agg.activeThisWeek },
            { k: "Paying", v: agg.byTier.pro + agg.byTier.elite },
            { k: "Trades logged", v: totalTrades },
          ].map((c) => (
            <div key={c.k} className="panel p-3.5">
              <p className="lbl mb-1">{c.k}</p>
              <p className="num text-[20px] font-semibold text-fog-100">{c.v}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="panel p-3.5 mb-4 flex items-start gap-2.5"
            style={{ background: "rgba(224,86,79,0.08)", borderColor: "rgba(224,86,79,0.4)" }}>
            <span className="text-down inline-flex mt-0.5"><Ic.alert size={15} /></span>
            <p className="text-[12px] text-fog-300">{error}</p>
          </div>
        )}

        <input className="field mb-4" placeholder="Search email or name"
          value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="panel overflow-hidden">
          {loading ? (
            <p className="text-[12px] text-fog-500 p-5 text-center">Loading accounts…</p>
          ) : shown.length === 0 ? (
            <Empty title={users.length === 0 ? "No accounts yet" : "No matches"}
              body={users.length === 0
                ? "Accounts appear here once people sign up and confirm their email."
                : "No account matches that search."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1c2942" }}>
                    {["Account", "Tier", "Equity", "Trades", "Win", "Process", "Last seen", "Change tier"].map((h) => (
                      <th key={h} className="lbl px-3.5 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => {
                    const ts = TIER_STYLE[u.tier];
                    const st = stats[u.id];
                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid #141f33" }}>
                        <td className="px-3.5 py-3">
                          <button className="text-[12.5px] text-fog-100 num hover:text-teal transition-colors text-left"
                            onClick={() => setOpen(u)}>{u.email}</button>
                          <p className="text-[11px] text-fog-500">
                            {u.display_name || "no name"}
                            {u.role === "admin" && <span className="text-teal"> · admin</span>}
                          </p>
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="lbl px-2 py-1 rounded-full whitespace-nowrap"
                            style={{ fontSize: 9, color: ts.fg, background: ts.bg, border: "1px solid " + ts.bd }}>
                            {u.tier}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-[11.5px] text-fog-100 num whitespace-nowrap">
                          {st ? "$" + st.equity.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "-"}
                        </td>
                        <td className="px-3.5 py-3 text-[11.5px] text-fog-400 num">{st?.trade_count ?? "-"}</td>
                        <td className="px-3.5 py-3 text-[11.5px] text-fog-400 num">{st ? (st.win_rate * 100).toFixed(0) + "%" : "-"}</td>
                        <td className="px-3.5 py-3 text-[11.5px] num"
                          style={{ color: !st ? "#6b7d96" : st.process_score >= 70 ? "#2fb98c" : st.process_score >= 45 ? "#e0a33b" : "#e0564f" }}>
                          {st?.process_score ?? "-"}
                        </td>
                        <td className="px-3.5 py-3 text-[11.5px] text-fog-400 num whitespace-nowrap" title={fmtDate(u.created_at)}>{relative(u.last_seen_at)}</td>
                        <td className="px-3.5 py-3">
                          <div className="flex gap-1.5">
                            {TIERS.map((t) => (
                              <button key={t}
                                disabled={saving === u.id || t === u.tier}
                                onClick={() => void change(u, t)}
                                className="btn btn-ghost"
                                style={{ padding: "3px 9px", fontSize: 10.5, opacity: t === u.tier ? 0.35 : 1 }}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-fog-500 mt-4 leading-relaxed">
          Click an email for that user's trades, open risk and violations. Journal and
          emotional check-in text is never exposed to administrators - those rows grant staff
          no read access at the database level, not merely in this screen.
        </p>
      </div>

      {open && <AdminUser user={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
