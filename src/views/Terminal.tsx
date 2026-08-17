import { useEffect, useState, type ReactNode } from "react";
import { useApp, gateCheck } from "../lib/store";
import { ASSETS, EMOTIONS, assetMeta, type Checkin, type EmotionTag, type OrderType, type Side } from "../lib/types";
import { atr } from "../lib/market";
import { CandleChart } from "../components/Chart";
import { Flash, Ic, Modal, Spark, Toggle, fmtPx, fmtR, fmtSigned } from "../components/ui";

export default function Terminal() {
  const { state: s, dispatch } = useApp();
  const meta = assetMeta(s.selected);
  const m = s.market[s.selected];
  const pos = s.positions.find((p) => p.symbol === s.selected);
  const gate = gateCheck(s);
  const changePct = ((m.price - m.refClose) / m.refClose) * 100;
  const a14 = atr(m);
  const stressed = !!m.stress;

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      {s.lock && (
        <div className="panel px-4 py-2.5 flex items-center gap-3 animate-shake" style={{ borderColor: "rgba(224,86,79,0.55)", background: "rgba(224,86,79,0.08)" }}>
          <span className="text-down"><Ic.lock size={16} /></span>
          <p className="text-[13px] text-fog-200"><strong className="text-down">Circuit breaker engaged.</strong> {s.lock.reason} Complete the mandatory session review to continue.</p>
        </div>
      )}
      {stressed && (
        <div className="panel px-4 py-2.5 flex items-center gap-3" style={{ borderColor: "rgba(224,163,59,0.55)", background: "rgba(224,163,59,0.08)" }}>
          <span className="text-amber animate-pulse"><Ic.flame size={16} /></span>
          <p className="text-[13px] text-fog-200">
            <strong className="text-amber">STRESS EVENT — {s.selected}.</strong> Adverse injection running. Your only job: don't touch the stop.
          </p>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[218px_1fr_288px] gap-3 min-h-0 overflow-y-auto lg:overflow-visible">
        {/* watchlist + news */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="panel p-2.5 flex-1 min-h-[240px] overflow-y-auto">
            <p className="lbl px-1.5 pb-2">Watchlist</p>
            {ASSETS.map((a) => {
              const mm = s.market[a.symbol];
              const ch = ((mm.price - mm.refClose) / mm.refClose) * 100;
              const sel = a.symbol === s.selected;
              return (
                <button key={a.symbol} onClick={() => dispatch({ type: "SELECT", symbol: a.symbol })}
                  className={`w-full flex items-center gap-2 px-1.5 py-[7px] rounded-lg row-hover text-left transition-all ${sel ? "" : ""}`}
                  style={sel ? { background: "rgba(57,197,165,0.09)", border: "1px solid rgba(57,197,165,0.3)" } : { border: "1px solid transparent" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-semibold text-[12.5px] text-fog-100">{a.symbol}</span>
                      {mm.stress && <span className="text-amber animate-pulse"><Ic.flame size={11} /></span>}
                      {s.positions.some((p) => p.symbol === a.symbol) && <span className="w-1.5 h-1.5 rounded-full bg-teal shrink-0" />}
                    </div>
                    <span className="text-[10px] text-fog-500">{a.kind === "crypto" ? "CRYPTO" : "US EQUITY"}</span>
                  </div>
                  <Spark data={mm.candles.slice(-26).map((c) => c.c)} w={44} h={18} />
                  <div className="text-right w-[64px] shrink-0">
                    <Flash value={mm.price} format={(n) => fmtPx(n, n >= 1000 ? 0 : 2)} className="text-[12px] text-fog-100 font-medium" />
                    <div className={`num text-[10.5px] ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "+" : ""}{ch.toFixed(2)}%</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="panel p-2.5 h-[210px] overflow-y-auto shrink-0">
            <p className="lbl px-1.5 pb-2">News wire · tagged</p>
            {s.news.length === 0 && <p className="text-[11.5px] text-fog-600 px-1.5">Wire is quiet. Headlines land here and move the tape.</p>}
            {s.news.map((n) => (
              <button key={n.id} onClick={() => dispatch({ type: "SELECT", symbol: n.symbol })}
                className="w-full text-left px-1.5 py-2 rounded-md row-hover border-b border-line-soft last:border-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-display font-semibold text-[11px]" style={{ color: n.impact === "up" ? "#2fb98c" : "#e0564f" }}>{n.symbol}</span>
                  <span className="lbl !text-[9px]">{n.impact === "up" ? "BULLISH" : "BEARISH"}</span>
                </div>
                <p className="text-[11.5px] text-fog-300 leading-snug">{n.headline}</p>
              </button>
            ))}
          </div>
        </div>

        {/* chart column */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="panel p-3.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-bold text-[19px] text-fog-100">{s.selected}</h2>
                  <span className="lbl !text-[9.5px] px-1.5 py-0.5 rounded" style={{ background: "#111b30", border: "1px solid #1c2942" }}>{meta.name}</span>
                </div>
                <p className="text-[11px] text-fog-500 num">ATR(14) {a14.toFixed(2)} · candle ≈5s</p>
              </div>
              <div className="flex items-baseline gap-2.5 ml-auto">
                <Flash value={m.price} format={(n) => fmtPx(n, n >= 1000 ? 0 : 2)} className="text-[26px] font-semibold text-fog-100" />
                <span className={`num text-[13px] font-medium ${changePct >= 0 ? "text-up" : "text-down"}`}>{changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%</span>
              </div>
              <span className="lbl !text-[9.5px] px-2 py-1 rounded-full"
                style={{
                  background: m.regime === "trend-up" ? "rgba(47,185,140,0.12)" : m.regime === "trend-down" ? "rgba(224,86,79,0.12)" : m.regime === "chop" ? "rgba(224,163,59,0.12)" : "#111b30",
                  color: m.regime === "trend-up" ? "#2fb98c" : m.regime === "trend-down" ? "#e0564f" : m.regime === "chop" ? "#e0a33b" : "#93a3ba",
                  border: "1px solid #1c2942",
                }}>
                REGIME: {m.regime.replace("-", " ").toUpperCase()}
              </span>
            </div>
            <CandleChart candles={m.candles} live={m.price} height={308} lines={[
              ...(pos ? [{ price: pos.avgEntry, color: "#eef3fa", label: "ENTRY", dash: [2, 3] }] : []),
              ...(pos?.stop != null ? [{ price: pos.stop, color: "#e0564f", label: "STOP" }] : []),
              ...(pos?.target != null ? [{ price: pos.target, color: "#2fb98c", label: "TARGET" }] : []),
            ]} />
          </div>
          <DeskTables />
        </div>

        {/* ticket */}
        <div className="min-h-0">
          {pos ? <ManagePanel key={pos.id} posId={pos.id} /> : <EntryTicket gateOk={gate.ok} gateReason={gate.reason} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- entry ticket --------------------------- */
function EntryTicket({ gateOk, gateReason }: { gateOk: boolean; gateReason: string }) {
  const { state: s, dispatch } = useApp();
  const meta = assetMeta(s.selected);
  const m = s.market[s.selected];
  const a14 = atr(m);
  const plan = s.plan!;
  const plannedRisk$ = (plan.riskPerTradePct / 100) * s.equity;

  const [side, setSide] = useState<Side>("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [qty, setQty] = useState(0);
  const [stop, setStop] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<number | null>(null);
  const [setup, setSetup] = useState(plan.setups[0] ?? "Breakout");
  const [override, setOverride] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const cooldownLeft = Math.max(0, s.cooldownUntil - s.now);

  // re-derive bracket defaults on symbol change
  useEffect(() => {
    const px = s.market[s.selected].price;
    const dir = side === "long" ? 1 : -1;
    const st = px - dir * 1.5 * a14;
    setStop(Number(st.toFixed(meta.decimals + 1)));
    setTarget(Number((px + dir * 2.5 * a14).toFixed(meta.decimals + 1)));
    setTrigger(null);
    setOverride(false);
    const rps = Math.abs(px - st);
    setQty(Math.max(1, Math.floor(plannedRisk$ / Math.max(0.0001, rps))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.selected]);

  useEffect(() => {
    const px = m.price;
    const dir = side === "long" ? 1 : -1;
    const st = px - dir * 1.5 * a14;
    setStop(Number(st.toFixed(meta.decimals + 1)));
    setTarget(Number((px + dir * 2.5 * a14).toFixed(meta.decimals + 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  const refPx = orderType === "market" ? m.price : trigger ?? m.price;
  const riskPerShare = stop ? Math.abs(refPx - stop) : 0;
  const suggested = riskPerShare > 0 ? Math.max(1, Math.floor(plannedRisk$ / riskPerShare)) : 0;
  const risk$ = riskPerShare * qty;
  const overPlan = risk$ > plannedRisk$ * 1.05;
  const rr = stop && target && riskPerShare > 0 ? Math.abs(target - refPx) / riskPerShare : 0;
  const noStopForbidden = plan.forbidden.includes("no-stop");
  const estFee = s.friction === "brutal" ? (meta.kind === "crypto" ? refPx * qty * 0.0006 : Math.max(1, qty * 0.005)) : 0;
  const valid = qty > 0 && (!noStopForbidden ? true : !!stop) && (orderType === "market" ? true : !!trigger) && gateOk;

  const submit = (checkin: Checkin) => {
    dispatch({
      type: "PLACE_ORDER", symbol: s.selected, orderType, side, qty,
      trigger, stop, target, setup, checkin, override,
    });
    setCheckinOpen(false);
  };

  return (
    <div className="panel p-4 flex flex-col gap-3.5 sticky top-0">
      <div className="flex items-center justify-between">
        <p className="lbl">Order ticket</p>
        <span className="num text-[10px] text-fog-500">risk plan ${plannedRisk$.toFixed(0)}</span>
      </div>

      {cooldownLeft > 0 && (
        <div className="panel-inset p-3 text-center" style={{ borderColor: "rgba(224,163,59,0.45)" }}>
          <p className="text-amber text-[12.5px] font-semibold flex items-center justify-center gap-2"><Ic.pause size={14} /> Tilt cool-down</p>
          <p className="text-[11.5px] text-fog-400 mt-1">{s.tiltReason}</p>
          <p className="num text-[20px] text-amber mt-1.5">{cooldownLeft}</p>
          <p className="text-[10px] text-fog-600 uppercase tracking-widest">ticks until re-entry allowed</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
        {(["long", "short"] as Side[]).map((sd) => (
          <button key={sd} onClick={() => setSide(sd)}
            className="py-2 rounded-md font-display font-bold text-[13px] uppercase tracking-wide transition-all"
            style={side === sd ? { background: sd === "long" ? "#2fb98c" : "#e0564f", color: "#08131f" } : { color: "#6b7d96" }}>
            {sd}
          </button>
        ))}
      </div>

      <div>
        <label className="lbl block mb-1.5">Order type</label>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
          {(["market", "limit", "stop"] as OrderType[]).map((t) => (
            <button key={t} onClick={() => setOrderType(t)}
              className="py-1.5 rounded-md text-[12px] font-semibold capitalize transition-all"
              style={orderType === t ? { background: "#24344f", color: "#eef3fa" } : { color: "#6b7d96" }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {orderType !== "market" && (
        <Field label={`${orderType} price`}>
          <input type="number" step="any" className="field num" value={trigger ?? ""} placeholder={m.price.toFixed(2)}
            onChange={(e) => setTrigger(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
      )}

      <Field label="Quantity">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => setQty(Math.max(1, qty - (qty > 10 ? 5 : 1)))}>−</button>
          <input type="number" className="field num text-center" value={qty || ""} min={1}
            onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value))))} />
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => setQty(qty + (qty >= 10 ? 5 : 1))}>+</button>
        </div>
        <button className="text-[11px] text-teal hover:underline mt-1.5 font-medium" onClick={() => setQty(suggested)}>
          Size to plan risk → {suggested} sh
        </button>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Stop (hard)">
          <input type="number" step="any" className="field num" value={stop ?? ""} placeholder="required"
            onChange={(e) => setStop(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <Field label="Target (R)">
          <input type="number" step="any" className="field num" value={target ?? ""} placeholder="optional"
            onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Setup tag">
        <select className="field" value={setup} onChange={(e) => setSetup(e.target.value)}>
          {plan.setups.map((st) => <option key={st}>{st}</option>)}
        </select>
      </Field>

      <div className="panel-inset p-3 space-y-1.5 num text-[12px]">
        <Row k="Risk / share" v={stop ? fmtPx(riskPerShare) : "—"} />
        <Row k="Planned risk" v={`$${risk$.toFixed(0)} · ${s.equity > 0 ? ((risk$ / s.equity) * 100).toFixed(2) : "0"}%`}
          tone={overPlan ? "#e0564f" : "#2fb98c"} />
        <Row k="Reward : Risk" v={rr ? `${rr.toFixed(2)} : 1` : "—"} />
        {estFee > 0 && <Row k="Est. commission" v={`$${estFee.toFixed(2)}`} tone="#e0a33b" />}
        <Row k="1.5×ATR stop would be" v={fmtPx(m.price - (side === "long" ? 1 : -1) * 1.5 * a14)} muted />
      </div>

      {overPlan && (
        <label className="flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer animate-fade-in"
          style={{ background: "rgba(224,86,79,0.08)", border: "1px solid rgba(224,86,79,0.4)" }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 accent-[#e0564f]" />
          <span className="text-[11.5px] text-fog-300 leading-snug">
            <strong className="text-down">I am breaking my risk rule.</strong> This size exceeds my planned {plan.riskPerTradePct}% and will be logged as a violation.
          </span>
        </label>
      )}

      <button className={`btn w-full !py-2.5 !text-[13.5px] ${side === "long" ? "btn-teal" : "btn-down"}`}
        disabled={!valid || cooldownLeft > 0 || (overPlan && !override)}
        onClick={() => setCheckinOpen(true)}>
        <Ic.brain size={15} /> Check in & place order
      </button>
      {!gateOk && <p className="text-[11px] text-down text-center -mt-1">{gateReason}</p>}

      <EmotionCheckin open={checkinOpen} onClose={() => setCheckinOpen(false)} onSubmit={submit} symbol={s.selected} side={side} risk$={risk$} />
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <label className="lbl block mb-1.5">{label}</label>
    {children}
  </div>
);
const Row = ({ k, v, tone, muted }: { k: string; v: string; tone?: string; muted?: boolean }) => (
  <div className="flex justify-between gap-2">
    <span className={muted ? "text-fog-600" : "text-fog-500"} style={{ fontFamily: "var(--font-body)", fontSize: 11.5 }}>{k}</span>
    <span style={{ color: tone ?? "#dde6f2" }}>{v}</span>
  </div>
);

/* ---------------------- emotional check-in ------------------------ */
function EmotionCheckin({ open, onClose, onSubmit, symbol, side, risk$ }: {
  open: boolean; onClose: () => void; onSubmit: (c: Checkin) => void; symbol: string; side: Side; risk$: number;
}) {
  const [emotion, setEmotion] = useState<EmotionTag | null>(null);
  const [arousal, setArousal] = useState(4);
  const [thesis, setThesis] = useState("");
  useEffect(() => { if (open) { setEmotion(null); setArousal(4); setThesis(""); } }, [open]);
  const ok = !!emotion && thesis.trim().length >= 12;
  const toneFor = (t: "up" | "warn" | "down") => (t === "up" ? "#2fb98c" : t === "warn" ? "#e0a33b" : "#e0564f");

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Ic.brain size={16} className="text-teal" /> Pre-trade emotional check-in</span>}>
      <p className="text-[12.5px] text-fog-400 leading-relaxed mb-4">
        Mandatory before every order. Name the state honestly — the platform correlates this with your expectancy over time.
        <span className="num text-fog-300"> {side.toUpperCase()} {symbol} · risking ${risk$.toFixed(0)}.</span>
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-5">
        {EMOTIONS.map((e) => (
          <button key={e.id} onClick={() => setEmotion(e.id)}
            className="py-2 px-1 rounded-lg text-[10.5px] font-semibold transition-all duration-150 leading-tight"
            style={{
              background: emotion === e.id ? `${toneFor(e.tone)}22` : "#0a1120",
              border: `1px solid ${emotion === e.id ? toneFor(e.tone) : "#1c2942"}`,
              color: emotion === e.id ? toneFor(e.tone) : "#93a3ba",
              transform: emotion === e.id ? "translateY(-1px)" : undefined,
            }}>
            {e.label}
          </button>
        ))}
      </div>
      <div className="mb-5">
        <div className="flex justify-between items-baseline mb-1.5">
          <label className="lbl">Arousal level</label>
          <span className="num text-[13px] text-teal">{arousal}/10</span>
        </div>
        <input type="range" min={1} max={10} value={arousal} onChange={(e) => setArousal(Number(e.target.value))} className="w-full" />
        <div className="flex justify-between text-[10px] text-fog-600 mt-1"><span>ice cold</span><span>heart racing</span></div>
      </div>
      <div className="mb-5">
        <label className="lbl block mb-1.5">Why this trade — one honest sentence (min 12 chars)</label>
        <textarea className="field min-h-[64px] resize-none" placeholder="e.g. Pullback to the 20MA inside an uptrend, stop under the swing low…"
          value={thesis} onChange={(e) => setThesis(e.target.value)} />
      </div>
      <button className="btn btn-teal w-full !py-2.5" disabled={!ok}
        onClick={() => onSubmit({ emotion: emotion!, arousal, thesis: thesis.trim(), at: Date.now() })}>
        Checked in — submit order
      </button>
      {emotion && (emotion === "fomo" || emotion === "revenge" || emotion === "bored") && (
        <p className="text-[11.5px] text-amber mt-3 leading-snug flex gap-1.5"><Ic.alert size={13} className="shrink-0 mt-0.5" />
          Self-reported {emotion === "bored" ? "boredom" : emotion}. The best trade from this state is usually no trade. Proceed only if the setup is genuinely A-grade.</p>
      )}
    </Modal>
  );
}

/* ------------------------ manage position ------------------------- */
function ManagePanel({ posId }: { posId: string }) {
  const { state: s, dispatch } = useApp();
  const pos = s.positions.find((p) => p.id === posId)!;
  const meta = assetMeta(pos.symbol);
  const px = s.market[pos.symbol].price;
  const dir = pos.side === "long" ? 1 : -1;
  const upnl = (px - pos.avgEntry) * pos.qty * dir;
  const rNow = upnl / Math.max(1, pos.riskAmount);
  const [stop, setStop] = useState(pos.stop);
  const [target, setTarget] = useState(pos.target);
  const [confirmClose, setConfirmClose] = useState(false);

  const save = () => dispatch({ type: "ADJUST_BRACKET", id: posId, stop, target });
  const worse = pos.side === "long" ? (stop !== null && pos.stop !== null && stop < pos.stop) : (stop !== null && pos.stop !== null && stop > pos.stop);

  return (
    <div className="panel p-4 flex flex-col gap-3.5 sticky top-0">
      <div className="flex items-center justify-between">
        <p className="lbl">Open position</p>
        <span className="font-display font-bold text-[12.5px] px-2 py-0.5 rounded"
          style={{ background: pos.side === "long" ? "rgba(47,185,140,0.15)" : "rgba(224,86,79,0.15)", color: pos.side === "long" ? "#2fb98c" : "#e0564f" }}>
          {pos.side.toUpperCase()} {pos.symbol}
        </span>
      </div>
      <div className="panel-inset p-3 space-y-1.5 num text-[12.5px]">
        <Row k="Qty / avg entry" v={`${pos.qty} @ ${fmtPx(pos.avgEntry, meta.decimals)}`} />
        <Row k="Mark" v={fmtPx(px, meta.decimals)} />
        <Row k="Unrealized" v={fmtSigned(upnl)} tone={upnl >= 0 ? "#2fb98c" : "#e0564f"} />
        <Row k="Open R" v={fmtR(rNow)} tone={rNow >= 0 ? "#2fb98c" : "#e0564f"} />
        <Row k="Planned risk" v={`$${pos.riskAmount.toFixed(0)} (${pos.riskPct.toFixed(2)}%)`} />
        <Row k="Setup · regime" v={`${pos.setup} · ${pos.regime}`} muted />
        <div className="pt-1 border-t border-line-soft text-[11px] text-fog-500" style={{ fontFamily: "var(--font-body)" }}>
          Checked in as <strong className="text-fog-300">{EMOTIONS.find((e) => e.id === pos.checkin.emotion)?.label}</strong> · “{pos.checkin.thesis.slice(0, 72)}{pos.checkin.thesis.length > 72 ? "…" : ""}”
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Stop">
          <input type="number" step="any" className="field num" value={stop ?? ""} placeholder="—"
            onChange={(e) => setStop(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
        <Field label="Target">
          <input type="number" step="any" className="field num" value={target ?? ""} placeholder="—"
            onChange={(e) => setTarget(e.target.value === "" ? null : Number(e.target.value))} />
        </Field>
      </div>
      {worse && (
        <p className="text-[11px] text-down flex items-center gap-1.5 -mt-1"><Ic.alert size={12} /> Saving this widens your stop — logged as a violation.</p>
      )}
      <button className="btn btn-ghost w-full" onClick={save}>Update bracket</button>

      {!confirmClose ? (
        <button className="btn btn-down w-full !py-2.5" onClick={() => setConfirmClose(true)}>
          Close at market · {fmtSigned(upnl)}
        </button>
      ) : (
        <div className="animate-fade-in space-y-2">
          <p className="text-[11.5px] text-amber text-center">Manual exit — the journal will ask <em>why the thesis died early</em>.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-down" onClick={() => dispatch({ type: "CLOSE_POSITION", id: posId })}>Confirm</button>
            <button className="btn btn-ghost" onClick={() => setConfirmClose(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- desk tables --------------------------- */
function DeskTables() {
  const { state: s, dispatch } = useApp();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="panel p-3">
        <p className="lbl mb-2">Positions · open risk ${s.positions.reduce((a, p) => a + p.riskAmount, 0).toFixed(0)}</p>
        {s.positions.length === 0 && <p className="text-[11.5px] text-fog-600">Flat. A flat position is a position too.</p>}
        {s.positions.map((p) => {
          const px = s.market[p.symbol].price;
          const dir = p.side === "long" ? 1 : -1;
          const u = (px - p.avgEntry) * p.qty * dir;
          return (
            <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-line-soft last:border-0 num text-[11.5px]">
              <span className="font-display font-bold text-fog-100 text-[12px] w-12">{p.symbol}</span>
              <span style={{ color: p.side === "long" ? "#2fb98c" : "#e0564f" }} className="w-11">{p.side.toUpperCase()}</span>
              <span className="text-fog-400">{p.qty}@{fmtPx(p.avgEntry, p.avgEntry >= 1000 ? 0 : 2)}</span>
              <span className={`ml-auto font-medium ${u >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(u, 0)} · {fmtR(u / Math.max(1, p.riskAmount))}</span>
            </div>
          );
        })}
      </div>
      <div className="panel p-3">
        <p className="lbl mb-2">Working orders</p>
        {s.orders.length === 0 && <p className="text-[11.5px] text-fog-600">No resting orders.</p>}
        {s.orders.map((o) => (
          <div key={o.id} className="flex items-center gap-2 py-1.5 border-b border-line-soft last:border-0 num text-[11.5px]">
            <span className="uppercase text-fog-500 text-[10px] w-11">{o.type}</span>
            <span className="font-display font-bold text-fog-100 text-[12px] w-12">{o.symbol}</span>
            <span className="text-fog-400">{o.side} {o.qty} @ {fmtPx(o.trigger, o.trigger >= 1000 ? 0 : 2)}</span>
            <button className="ml-auto text-fog-500 hover:text-down transition-colors" onClick={() => dispatch({ type: "CANCEL_ORDER", id: o.id })}><Ic.x size={13} /></button>
          </div>
        ))}
      </div>
      <div className="panel p-3">
        <p className="lbl mb-2">Recent closed</p>
        {s.trades.length === 0 && <p className="text-[11.5px] text-fog-600">Nothing closed yet.</p>}
        {s.trades.slice(-5).reverse().map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-line-soft last:border-0 num text-[11.5px]">
            <span className="font-display font-bold text-fog-100 text-[12px] w-12">{t.symbol}</span>
            <span className="text-fog-500 text-[10px] uppercase w-13">{t.exitReason}</span>
            <span className={`ml-auto font-medium ${t.pnl >= 0 ? "text-up" : "text-down"}`}>{fmtSigned(t.pnl, 0)}</span>
            <span className={`w-14 text-right ${t.r >= 0 ? "text-up" : "text-down"}`}>{fmtR(t.r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
