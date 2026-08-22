/* Canvas chart: candles + indicator overlays + sub-panels.
   Navigation: drag to pan, wheel to zoom, double-click = live. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "../lib/types";
import type { OverlaySeries, PaneSeries } from "../lib/indicators";

export interface PriceLine { price: number; color: string; label?: string; dash?: number[] }

const MIN_VIS = 24, MAX_VIS = 170;

function drawSeries(ctx: CanvasRenderingContext2D, vals: (number | null)[], y: (v: number) => number, bw: number, color: string, width: number) {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v === null) { started = false; continue; }
    const x = i * bw + bw / 2;
    if (!started) { ctx.moveTo(x, y(v)); started = true; } else ctx.lineTo(x, y(v));
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function CandleChart({ candles, live, height = 320, lines = [], overlays = [], panes = [], showVolume = false }: {
  candles: Candle[]; live: number; height?: number;
  lines?: PriceLine[]; overlays?: OverlaySeries[]; panes?: PaneSeries[]; showVolume?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const paneRefs = useRef<Record<string, HTMLCanvasElement>>({});
  const [visible, setVisible] = useState(110);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<{ i: number; c: Candle } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; off: number; bw: number } | null>(null);
  const cppRef = useRef(0.2);

  const n = candles.length;
  const vis = Math.min(visible, n);
  const maxOff = Math.max(0, n - vis);
  const off = Math.min(offset, maxOff);
  const atLive = off === 0;
  useEffect(() => { cppRef.current = vis / Math.max(1, wrapRef.current?.clientWidth ?? 800); }, [vis]);
  useEffect(() => { if (offset > maxOff) setOffset(maxOff); }, [maxOff, offset]);

  const resetView = () => { setOffset(0); setVisible(110); };

  /* wheel = zoom / shift+wheel = pan (non-passive so we own the gesture) */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setOffset((o) => Math.max(0, Math.min(o + Math.round((e.deltaX || e.deltaY) * cppRef.current), Math.max(0, candles.length - 1))));
      } else {
        setVisible((v) => Math.max(MIN_VIS, Math.min(MAX_VIS, Math.round(v * (e.deltaY > 0 ? 1.18 : 0.85)))));
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [candles.length]);

  const data = useMemo(() => candles.slice(n - vis - off, n - off), [candles, n, vis, off]);

  /* pointer handlers */
  const onPointerDown = (e: React.PointerEvent) => {
    const bw = (wrapRef.current?.clientWidth ?? 800) / vis;
    drag.current = { x: e.clientX, off, bw };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const bw = (wrapRef.current?.clientWidth ?? 800) / vis;
    if (drag.current && dragging) {
      const dBars = Math.round((drag.current.x - e.clientX) / drag.current.bw);
      setOffset(Math.max(0, Math.min(drag.current.off + dBars, maxOff)));
      return;
    }
    const rect = wrapRef.current!.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left) / bw);
    if (i >= 0 && i < data.length) setHover({ i, c: data[i] });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  /* ------------------------------ draw ------------------------------ */
  useEffect(() => {
    const cv = ref.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const draw = () => {
      if (document.visibilityState === "hidden") return; // skip paint when hidden
      const W = wrap.clientWidth;
      const H = height;
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const axisW = 54;
      const chartW = W - axisW;
      const bw = chartW / vis;
      const lo = Math.min(...data.map((c) => c.l), ...lines.map((l) => l.price));
      const hi = Math.max(...data.map((c) => c.h), ...lines.map((l) => l.price));
      const pad = (hi - lo) * 0.08 || 1;
      const y = (v: number) => 12 + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - 12 - 18);

      // grid + axis
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textBaseline = "middle";
      for (let g = 0; g <= 4; g++) {
        const p = lo - pad + ((hi + pad) - (lo - pad)) * (g / 4);
        const yy = y(p);
        ctx.strokeStyle = "rgba(28,41,66,0.55)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#4d5f78";
        ctx.fillText(p >= 1000 ? p.toFixed(0) : p.toFixed(2), chartW + 6, yy);
      }

      // volume floor
      if (showVolume) {
        const vmax = Math.max(...data.map((c) => c.v), 1);
        const vh = (H - 30) * 0.16;
        data.forEach((c, i) => {
          const cx = i * bw + bw / 2;
          const hgt = Math.max(1, (c.v / vmax) * vh);
          ctx.fillStyle = c.c >= c.o ? "rgba(47,185,140,0.26)" : "rgba(224,86,79,0.26)";
          ctx.fillRect(cx - Math.max(1, bw * 0.29), H - 18 - hgt, Math.max(2, bw * 0.58), hgt);
        });
      }

      // bollinger-style fills
      for (const o of overlays) {
        if (!o.fill) continue;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < o.fill.upper.length; i++) {
          const u = o.fill.upper[i];
          if (u === null) continue;
          const x = i * bw + bw / 2;
          if (!started) { ctx.moveTo(x, y(u)); started = true; } else ctx.lineTo(x, y(u));
        }
        for (let i = o.fill.lower.length - 1; i >= 0; i--) {
          const l = o.fill.lower[i];
          if (l === null) continue;
          ctx.lineTo(i * bw + bw / 2, y(l));
        }
        ctx.closePath();
        ctx.fillStyle = o.fill.color + "14";
        ctx.fill();
      }

      // candles
      data.forEach((c, i) => {
        const cx = i * bw + bw / 2;
        const up = c.c >= c.o;
        const col = up ? "#2fb98c" : "#e0564f";
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx, y(c.h)); ctx.lineTo(cx, y(c.l)); ctx.stroke();
        const bodyW = Math.max(2.5, bw * 0.62);
        const yo = y(c.o), yc = y(c.c);
        ctx.fillRect(cx - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1.4, Math.abs(yc - yo)));
      });

      // indicator overlays
      for (const o of overlays) {
        if (o.fill) {
          drawSeries(ctx, o.fill.upper, y, bw, o.color + "aa", 1);
          drawSeries(ctx, o.fill.lower, y, bw, o.color + "aa", 1);
        }
        drawSeries(ctx, o.values, y, bw, o.color, o.width);
      }

      // bracket / price lines
      for (const l of lines) {
        const yy = y(l.price);
        ctx.strokeStyle = l.color;
        ctx.setLineDash(l.dash ?? [5, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.setLineDash([]);
        if (l.label) {
          ctx.fillStyle = l.color;
          ctx.fillRect(chartW - 2, yy - 7, 2, 14);
          ctx.fillText(l.label, 6, yy - 8);
        }
      }

      // live price (only while watching live)
      if (atLive) {
        const yy = y(live);
        const up = live >= data[data.length - 1]?.o;
        ctx.strokeStyle = up ? "#2fb98c" : "#e0564f";
        ctx.setLineDash([1, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = up ? "#2fb98c" : "#e0564f";
        ctx.fillRect(chartW, yy - 8, axisW, 16);
        ctx.fillStyle = "#08131f";
        ctx.fillText(live >= 1000 ? live.toFixed(0) : live.toFixed(2), chartW + 5, yy);
      }

      // crosshair
      if (hover && !dragging && hover.i < data.length) {
        const cx = hover.i * bw + bw / 2;
        ctx.strokeStyle = "rgba(147,163,186,0.35)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H - 18); ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    draw();
  }, [data, height, vis, lines, overlays, hover, dragging, live, atLive]);

  /* --------------------------- sub-panels --------------------------- */
  useEffect(() => {
    panes.forEach((p) => {
      const cv = paneRefs.current[p.uid];
      if (!cv) return;
      const W = wrapRef.current?.clientWidth ?? 600;
      const H = 74;
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      const axisW = 54, chartW = W - axisW, bw = chartW / vis;
      const win = (vals: (number | null)[]) => vals.slice(n - vis - off, n - off);

      if (p.kind === "rsi") {
        const yv = (v: number) => 8 + (1 - v / 100) * (H - 16);
        ctx.font = "9px 'IBM Plex Mono', monospace";
        [70, 30].forEach((lv) => {
          ctx.strokeStyle = lv === 70 ? "rgba(224,86,79,0.4)" : "rgba(47,185,140,0.4)";
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(0, yv(lv)); ctx.lineTo(chartW, yv(lv)); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#4d5f78";
          ctx.fillText(String(lv), chartW + 6, yv(lv));
        });
        drawSeries(ctx, win(p.a), yv, bw, "#b48ef0", 1.4);
      } else if (p.kind === "macd") {
        const all = [...win(p.a), ...win(p.b ?? []), ...win(p.c ?? [])].filter((v): v is number => v !== null);
        const ext = Math.max(...all.map(Math.abs), 0.0001);
        const yv = (v: number) => H / 2 - (v / ext) * (H / 2 - 8);
        ctx.strokeStyle = "rgba(28,41,66,0.8)";
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(chartW, H / 2); ctx.stroke();
        const hist = win(p.c ?? []);
        hist.forEach((v, i) => {
          if (v === null) return;
          ctx.fillStyle = v >= 0 ? "rgba(47,185,140,0.55)" : "rgba(224,86,79,0.55)";
          const yy = yv(v);
          ctx.fillRect(i * bw + bw * 0.2, Math.min(yy, H / 2), Math.max(1.5, bw * 0.6), Math.abs(yy - H / 2));
        });
        drawSeries(ctx, win(p.a), yv, bw, "#6fb6e8", 1.3);
        drawSeries(ctx, win(p.b ?? []), yv, bw, "#e0a33b", 1.1);
        ctx.font = "9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "#4d5f78";
        ctx.fillText(ext.toFixed(2), chartW + 6, 10);
        ctx.fillText((-ext).toFixed(2), chartW + 6, H - 8);
      } else {
        const vals = win(p.a).filter((v): v is number => v !== null);
        const lo = Math.min(...vals, 0.0001), hi = Math.max(...vals, 0.0002);
        const yv = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);
        drawSeries(ctx, win(p.a), yv, bw, "#e0a33b", 1.4);
        ctx.font = "9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "#4d5f78";
        ctx.fillText(hi.toFixed(2), chartW + 6, 10);
        ctx.fillText(lo.toFixed(2), chartW + 6, H - 8);
      }
    });
  }, [panes, data, vis, off, n]);

  const hc = hover?.c;
  const lastVal = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) { const v = vals[i]; if (v !== null) return v; }
    return null;
  };

  return (
    <div ref={wrapRef} className="relative w-full select-none"
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag}
      onPointerLeave={() => { endDrag(); setHover(null); }}
      onDoubleClick={resetView}>
      <div className="relative">
        <canvas ref={ref} className="block w-full" />
        {hc && !dragging && (
          <div className="absolute top-2 left-2 num text-[10.5px] px-2 py-1 rounded-md pointer-events-none"
            style={{ background: "rgba(10,17,32,0.9)", border: "1px solid #1c2942", color: "#c3cfdf" }}>
            O {hc.o.toFixed(2)}&nbsp; H {hc.h.toFixed(2)}&nbsp; L {hc.l.toFixed(2)}&nbsp;
            <span style={{ color: hc.c >= hc.o ? "#2fb98c" : "#e0564f" }}>C {hc.c.toFixed(2)}</span>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1" style={{ pointerEvents: "auto" }}>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setVisible((v) => Math.max(MIN_VIS, Math.round(v * 0.8)))}
            title="Zoom in" className="num font-bold rounded-md hover:text-fog-100 transition-all"
            style={{ width: 26, height: 26, background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#93a3ba", fontSize: 14, lineHeight: "24px" }}>−</button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setVisible((v) => Math.min(MAX_VIS, Math.round(v * 1.25)))}
            title="Zoom out" className="num font-bold rounded-md hover:text-fog-100 transition-all"
            style={{ width: 26, height: 26, background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#93a3ba", fontSize: 14, lineHeight: "24px" }}>+</button>
          <span className="num text-[9.5px] px-1.5" style={{ color: "#4d5f78" }}>{vis} bars</span>
        </div>
        {!atLive && (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setOffset(0)}
            className="absolute top-2 right-2 num text-[10.5px] font-bold px-2.5 py-1 rounded-full animate-pop transition-all"
            style={{ background: "rgba(57,197,165,0.16)", border: "1px solid rgba(57,197,165,0.55)", color: "#39c5a5", pointerEvents: "auto" }}>
            −{off} bars · back to live ▸
          </button>
        )}
      </div>

      {panes.map((p) => {
        const lv = lastVal(p.a);
        const lvColor = p.kind === "rsi"
          ? (lv !== null && lv >= 70 ? "#e0564f" : lv !== null && lv <= 30 ? "#2fb98c" : "#b48ef0")
          : p.kind === "macd" ? "#6fb6e8" : "#e0a33b";
        return (
          <div key={p.uid} className="relative" style={{ borderTop: "1px solid #16213a" }}>
            <canvas ref={(el) => { if (el) paneRefs.current[p.uid] = el; else delete paneRefs.current[p.uid]; }} className="block w-full" />
            <span className="absolute top-1.5 left-2 num text-[9.5px] pointer-events-none" style={{ color: "#6b7d96" }}>
              {p.label}{lv !== null && <strong style={{ color: lvColor }}> {p.kind === "atr" ? lv.toFixed(2) : lv.toFixed(1)}</strong>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- equity curve --------------------------- */
export function EquityLine({ points, baseline, height = 150 }: { points: number[]; baseline: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = ref.current, wrap = wrapRef.current;
    if (!cv || !wrap || points.length < 2) return;
    if (document.visibilityState === "hidden") return;
    const W = wrap.clientWidth, H = height;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const lo = Math.min(...points, baseline), hi = Math.max(...points, baseline);
    const pad = (hi - lo) * 0.1 || 1;
    const y = (v: number) => 8 + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - 16);
    const x = (i: number) => (i / (points.length - 1)) * W;

    ctx.strokeStyle = "rgba(147,163,186,0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, y(baseline)); ctx.lineTo(W, y(baseline)); ctx.stroke();
    ctx.setLineDash([]);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const up = points[points.length - 1] >= baseline;
    grad.addColorStop(0, up ? "rgba(47,185,140,0.22)" : "rgba(224,86,79,0.22)");
    grad.addColorStop(1, "rgba(10,17,32,0)");
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(x(i), y(p)); else ctx.lineTo(x(i), y(p)); });
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(x(i), y(p)); else ctx.lineTo(x(i), y(p)); });
    ctx.strokeStyle = up ? "#2fb98c" : "#e0564f";
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }, [points, baseline, height]);
  return <div ref={wrapRef} className="w-full"><canvas ref={ref} className="block w-full" /></div>;
}
