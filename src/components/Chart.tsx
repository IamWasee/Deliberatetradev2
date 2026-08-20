import React, { useEffect, useRef, useState } from "react";
import type { Candle } from "../lib/types";
import type { OverlaySeries, PaneSeries } from "../lib/indicators";

interface Line { price: number; color: string; label: string; dash?: number[] }

const MIN_VIS = 24;
const MAX_VIS = 170;
const AXIS_W = 58;
const PANE_H = 86;

/* Draw a null-aware polyline (indicator values are null during warm-up). */
function drawSeries(ctx: CanvasRenderingContext2D, values: (number | null)[], y: (v: number) => number, bw: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) { pen = false; continue; }
    const x = i * bw + bw / 2;
    if (!pen) { ctx.moveTo(x, y(v)); pen = true; }
    else ctx.lineTo(x, y(v));
  }
  ctx.stroke();
}

export function CandleChart({ candles, lines = [], height = 300, live, overlays = [], panes = [], showVolume = false }: {
  candles: Candle[]; lines?: Line[]; height?: number; live?: number;
  overlays?: OverlaySeries[]; panes?: PaneSeries[]; showVolume?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<Record<string, HTMLCanvasElement>>({});
  const [hover, setHover] = useState<{ x: number; y: number; c: Candle } | null>(null);
  const [visible, setVisible] = useState(110);           // candles in view
  const [offset, setOffset] = useState(0);               // bars back from the live edge
  const [dragging, setDragging] = useState(false);

  const vis = Math.max(MIN_VIS, Math.min(visible, candles.length));
  const maxOffset = Math.max(0, candles.length - vis);
  const off = Math.min(offset, maxOffset);
  const atLive = off === 0;
  const wStart = Math.max(0, candles.length - vis - off);
  const wEnd = candles.length - off;
  const data = candles.slice(wStart, wEnd);

  const maxOffRef = useRef(maxOffset); maxOffRef.current = maxOffset;
  const cppRef = useRef(0.25); // candles per pixel, kept fresh by draw()
  const dragRef = useRef<{ x: number } | null>(null);

  const clampOff = (o: number) => Math.max(0, Math.min(o, maxOffRef.current));

  /* wheel = zoom (vertical) · pan (shift or horizontal) — non-passive so we own the gesture */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setOffset((o) => Math.max(0, Math.min(o + (e.deltaX || e.deltaY) * cppRef.current, maxOffRef.current)));
      } else {
        const dir = e.deltaY > 0 ? 1 : -1; // scroll down → zoom out
        setVisible((v) => Math.max(MIN_VIS, Math.min(MAX_VIS, Math.round(v * (1 + dir * 0.15)))));
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const cv = ref.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const draw = () => {
      const W = wrap.clientWidth;
      const H = height;
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      if (!data.length) return;
      const chartW = W - AXIS_W;
      cppRef.current = data.length / Math.max(1, chartW);

      // window-sliced overlays so they line up 1:1 with `data`
      const ovl = overlays.map((o) => ({ ...o, vals: o.values.slice(wStart, wEnd), up: o.fill?.upper.slice(wStart, wEnd) ?? null, lo: o.fill?.lower.slice(wStart, wEnd) ?? null }));

      let min = Math.min(...data.map((c) => c.l), ...lines.map((l) => l.price));
      let max = Math.max(...data.map((c) => c.h), ...lines.map((l) => l.price));
      for (const o of ovl) {
        for (const v of o.vals) if (v !== null) { if (v < min) min = v; if (v > max) max = v; }
        if (o.up) for (const v of o.up) if (v !== null) { if (v < min) min = v; if (v > max) max = v; }
        if (o.lo) for (const v of o.lo) if (v !== null) { if (v < min) min = v; if (v > max) max = v; }
      }
      const pad = (max - min) * 0.08 || 1;
      min -= pad; max += pad;
      const y = (p: number) => 12 + (1 - (p - min) / (max - min)) * (H - 12 - 18);
      const bw = chartW / data.length;

      // grid + axis labels
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 5; i++) {
        const p = min + ((max - min) * i) / 5;
        const yy = y(p);
        ctx.strokeStyle = "rgba(147,163,186,0.09)";
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.fillStyle = "#6b7d96";
        ctx.fillText(p >= 1000 ? p.toFixed(0) : p.toFixed(2), chartW + 6, yy);
      }

      // volume histogram along the floor (behind candles)
      if (showVolume) {
        const vmax = Math.max(...data.map((c) => c.v), 1);
        const vh = (H - 12 - 18) * 0.16;
        const base = H - 18;
        data.forEach((c, i) => {
          const cx = i * bw + bw / 2;
          const hgt = Math.max(1, (c.v / vmax) * vh);
          ctx.fillStyle = c.c >= c.o ? "rgba(47,185,140,0.28)" : "rgba(224,86,79,0.28)";
          ctx.fillRect(cx - Math.max(1, bw * 0.29), base - hgt, Math.max(2, bw * 0.58), hgt);
        });
      }

      // Bollinger-style fills (behind candles)
      for (const o of ovl) {
        if (!o.up || !o.lo) continue;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < o.up.length; i++) {
          const u = o.up[i], l = o.lo[i];
          if (u === null || l === null) continue;
          const x = i * bw + bw / 2;
          if (!started) { ctx.moveTo(x, y(u)); started = true; } else ctx.lineTo(x, y(u));
        }
        for (let i = o.lo.length - 1; i >= 0; i--) {
          const u = o.up[i], l = o.lo[i];
          if (u === null || l === null) continue;
          ctx.lineTo(i * bw + bw / 2, y(l));
        }
        ctx.closePath();
        ctx.fillStyle = o.fill!.color + "14";
        ctx.fill();
      }

      // candles
      data.forEach((c, i) => {
        const cx = i * bw + bw / 2;
        const up = c.c >= c.o;
        const col = up ? "#2fb98c" : "#e0564f";
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, y(c.h)); ctx.lineTo(cx, y(c.l)); ctx.stroke();
        const bodyW = Math.max(2, bw * 0.58);
        const yo = y(c.o), yc = y(c.c);
        ctx.fillRect(cx - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1.4, Math.abs(yc - yo)));
      });

      // indicator overlays (MAs, VWAP, BB edges)
      for (const o of ovl) {
        if (o.up && o.lo) {
          drawSeries(ctx, o.up, y, bw, o.color + "aa", 1);
          drawSeries(ctx, o.lo, y, bw, o.color + "aa", 1);
        }
        drawSeries(ctx, o.vals, y, bw, o.color, o.width);
      }

      // bracket lines (price space — always valid)
      lines.forEach((l) => {
        if (l.price < min || l.price > max) return;
        const yy = y(l.price);
        ctx.strokeStyle = l.color;
        ctx.setLineDash(l.dash ?? [5, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = l.color;
        const txt = `${l.label} ${l.price >= 1000 ? l.price.toFixed(0) : l.price.toFixed(2)}`;
        const tw = ctx.measureText(txt).width;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(chartW - tw - 12, yy - 8, tw + 10, 15);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#08131f";
        ctx.fillText(txt, chartW - tw - 7, yy);
      });

      // live price line only while watching the live edge
      if (atLive && live !== undefined && live >= min && live <= max) {
        const yy = y(live);
        ctx.strokeStyle = "rgba(238,243,250,0.28)";
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.setLineDash([]);
      }

      // crosshair
      if (hover && !dragRef.current) {
        ctx.strokeStyle = "rgba(147,163,186,0.3)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(hover.x, 0); ctx.lineTo(hover.x, H); ctx.stroke();
        ctx.setLineDash([]);
      }

      /* ------------------------- sub-panels ------------------------- */
      panes.forEach((p) => {
        const pc = paneRefs.current[p.uid];
        if (!pc) return;
        const dpr = window.devicePixelRatio || 1;
        pc.width = W * dpr; pc.height = PANE_H * dpr;
        pc.style.width = `${W}px`; pc.style.height = `${PANE_H}px`;
        const g = pc.getContext("2d");
        if (!g) return;
        g.scale(dpr, dpr);
        g.clearRect(0, 0, W, PANE_H);
        g.font = "10px 'IBM Plex Mono', monospace";
        g.textBaseline = "middle";
        const a = p.a.slice(wStart, wEnd);
        const b = p.b ? p.b.slice(wStart, wEnd) : null;
        const c = p.c ? p.c.slice(wStart, wEnd) : null;

        if (p.kind === "rsi") {
          const py = (v: number) => 8 + (1 - v / 100) * (PANE_H - 16);
          g.fillStyle = "rgba(111,182,232,0.06)";
          g.fillRect(0, py(70), chartW, py(30) - py(70));
          [70, 30].forEach((lv) => {
            g.strokeStyle = "rgba(147,163,186,0.28)";
            g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(0, py(lv)); g.lineTo(chartW, py(lv)); g.stroke();
            g.setLineDash([]);
            g.fillStyle = "#6b7d96";
            g.fillText(String(lv), chartW + 6, py(lv));
          });
          drawSeries(g, a, py, bw, "#6fb6e8", 1.4);
        } else if (p.kind === "macd") {
          const all: number[] = [0];
          a.forEach((v) => { if (v !== null) all.push(v); });
          if (b) b.forEach((v) => { if (v !== null) all.push(v as number); });
          if (c) c.forEach((v) => { if (v !== null) all.push(v as number); });
          let pmin = Math.min(...all), pmax = Math.max(...all);
          const ppad = (pmax - pmin) * 0.1 || 1;
          pmin -= ppad; pmax += ppad;
          const py = (v: number) => 8 + (1 - (v - pmin) / (pmax - pmin)) * (PANE_H - 16);
          g.strokeStyle = "rgba(147,163,186,0.28)";
          g.setLineDash([3, 3]);
          g.beginPath(); g.moveTo(0, py(0)); g.lineTo(chartW, py(0)); g.stroke();
          g.setLineDash([]);
          if (c) c.forEach((v, i) => {
            if (v === null) return;
            const cx = i * bw + bw / 2;
            g.fillStyle = v >= 0 ? "rgba(47,185,140,0.5)" : "rgba(224,86,79,0.5)";
            g.fillRect(cx - Math.max(1, bw * 0.29), Math.min(py(0), py(v)), Math.max(2, bw * 0.58), Math.abs(py(v) - py(0)));
          });
          drawSeries(g, a, py, bw, "#6fb6e8", 1.3);
          if (b) drawSeries(g, b, py, bw, "#e0a33b", 1.1);
        } else {
          const all: number[] = [];
          a.forEach((v) => { if (v !== null) all.push(v); });
          let pmin = Math.min(...all), pmax = Math.max(...all);
          const ppad = (pmax - pmin) * 0.12 || 0.1;
          pmin -= ppad; pmax += ppad;
          const py = (v: number) => 8 + (1 - (v - pmin) / (pmax - pmin)) * (PANE_H - 16);
          drawSeries(g, a, py, bw, "#e0a33b", 1.3);
        }

        if (hover && !dragRef.current) {
          g.strokeStyle = "rgba(147,163,186,0.3)";
          g.setLineDash([3, 3]);
          g.beginPath(); g.moveTo(hover.x, 0); g.lineTo(hover.x, PANE_H); g.stroke();
          g.setLineDash([]);
        }
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  /* ------------------------- drag / hover -------------------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX };
    setDragging(true);
    setHover(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      dragRef.current.x = e.clientX;
      if (dx !== 0) setOffset((o) => clampOff(o + dx * cppRef.current));
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bw = (rect.width - AXIS_W) / Math.max(1, data.length);
    const i = Math.min(data.length - 1, Math.max(0, Math.floor(x / bw)));
    setHover({ x: i * bw + bw / 2, y: e.clientY - rect.top, c: data[i] });
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };
  const resetView = () => { setOffset(0); setVisible(110); };

  const hc = hover?.c;
  const lastVal = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) { const v = vals[i]; if (v !== null) return v; }
    return null;
  };
  return (
    <div ref={wrapRef}
      className="relative w-full select-none"
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={() => { endDrag(); setHover(null); }}
      onDoubleClick={resetView}>

      {/* main price pane + its controls */}
      <div className="relative">
        <canvas ref={ref} className="block w-full" />

        {hc && !dragging && (
          <div className="absolute top-2 left-2 num text-[10.5px] px-2 py-1 rounded-md pointer-events-none"
            style={{ background: "rgba(10,17,32,0.9)", border: "1px solid #1c2942", color: "#c3cfdf" }}>
            O {hc.o.toFixed(2)}&nbsp; H {hc.h.toFixed(2)}&nbsp; L {hc.l.toFixed(2)}&nbsp;
            <span style={{ color: hc.c >= hc.o ? "#2fb98c" : "#e0564f" }}>C {hc.c.toFixed(2)}</span>
          </div>
        )}

        {/* zoom cluster */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1" style={{ pointerEvents: "auto" }}>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setVisible((v) => Math.max(MIN_VIS, Math.round(v * 0.8)))}
            title="Zoom in (fewer candles)"
            className="num font-bold rounded-md transition-all hover:text-fog-100"
            style={{ width: 26, height: 26, background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#93a3ba", fontSize: 14, lineHeight: "24px" }}>−</button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setVisible((v) => Math.min(MAX_VIS, Math.round(v * 1.25)))}
            title="Zoom out (more candles)"
            className="num font-bold rounded-md transition-all hover:text-fog-100"
            style={{ width: 26, height: 26, background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#93a3ba", fontSize: 14, lineHeight: "24px" }}>+</button>
          <span className="num text-[9.5px] px-1.5" style={{ color: "#4d5f78" }}>{vis} bars</span>
        </div>

        {/* back-to-live pill when panned into history */}
        {!atLive && (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setOffset(0)}
            className="absolute top-2 right-2 flex items-center gap-1.5 num text-[10.5px] font-bold px-2.5 py-1 rounded-full transition-all animate-pop"
            style={{ background: "rgba(57,197,165,0.16)", border: "1px solid rgba(57,197,165,0.55)", color: "#39c5a5", pointerEvents: "auto" }}>
            −{off} bars · back to live ▸
          </button>
        )}
      </div>

      {/* indicator sub-panels */}
      {panes.map((p) => {
        const lv = lastVal(p.a);
        const lvColor = p.kind === "rsi"
          ? (lv !== null && lv >= 70 ? "#e0564f" : lv !== null && lv <= 30 ? "#2fb98c" : "#6fb6e8")
          : "#93a3ba";
        return (
          <div key={p.uid} className="relative" style={{ borderTop: "1px solid #16213a" }}>
            <canvas
              ref={(el) => { if (el) paneRefs.current[p.uid] = el; else delete paneRefs.current[p.uid]; }}
              className="block w-full" />
            <span className="absolute top-1.5 left-2 num text-[9.5px] pointer-events-none" style={{ color: "#6b7d96" }}>
              {p.label}{lv !== null && <strong style={{ color: lvColor }}> {p.kind === "atr" ? lv.toFixed(2) : lv.toFixed(1)}</strong>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EquityLine({ points, height = 150, baseline }: {
  points: { x: number; y: number }[]; height?: number; baseline: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = ref.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const draw = () => {
      const W = wrap.clientWidth, H = height;
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      if (points.length < 2) {
        ctx.fillStyle = "#4d5f78";
        ctx.font = "11px 'IBM Plex Mono', monospace";
        ctx.fillText("Equity curve appears after your first closed trade.", 12, H / 2);
        return;
      }
      const ys = points.map((p) => p.y);
      let min = Math.min(...ys, baseline), max = Math.max(...ys, baseline);
      const pad = (max - min) * 0.12 || 10;
      min -= pad; max += pad;
      const X = (i: number) => (i / (points.length - 1)) * (W - 8) + 4;
      const Y = (v: number) => 6 + (1 - (v - min) / (max - min)) * (H - 22);
      // baseline
      ctx.strokeStyle = "rgba(224,163,59,0.4)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, Y(baseline)); ctx.lineTo(W, Y(baseline)); ctx.stroke();
      ctx.setLineDash([]);
      // area
      const last = points[points.length - 1].y;
      const col = last >= baseline ? "#2fb98c" : "#e0564f";
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, last >= baseline ? "rgba(47,185,140,0.22)" : "rgba(224,86,79,0.22)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(i), Y(p.y)) : ctx.lineTo(X(i), Y(p.y))));
      ctx.lineTo(X(points.length - 1), H); ctx.lineTo(X(0), H); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      // line
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(X(i), Y(p.y)) : ctx.lineTo(X(i), Y(p.y))));
      ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.stroke();
      // last dot
      ctx.beginPath();
      ctx.arc(X(points.length - 1), Y(last), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      // labels
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "#6b7d96";
      ctx.fillText(`$${max.toFixed(0)}`, 6, 10);
      ctx.fillText(`$${min.toFixed(0)}`, 6, H - 8);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [points, height, baseline]);
  return <div ref={wrapRef} className="w-full"><canvas ref={ref} className="block w-full" /></div>;
}
