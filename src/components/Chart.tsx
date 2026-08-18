import React, { useEffect, useRef, useState } from "react";
import type { Candle } from "../lib/types";

interface Line { price: number; color: string; label: string; dash?: number[] }

const MIN_VIS = 24;
const MAX_VIS = 170;
const AXIS_W = 58;

export function CandleChart({ candles, lines = [], height = 300, live }: {
  candles: Candle[]; lines?: Line[]; height?: number; live?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; c: Candle } | null>(null);
  const [visible, setVisible] = useState(110);           // candles in view
  const [offset, setOffset] = useState(0);               // bars back from the live edge
  const [dragging, setDragging] = useState(false);

  const vis = Math.max(MIN_VIS, Math.min(visible, candles.length));
  const maxOffset = Math.max(0, candles.length - vis);
  const off = Math.min(offset, maxOffset);
  const atLive = off === 0;
  const data = candles.slice(candles.length - vis - off, candles.length - off);

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
      let min = Math.min(...data.map((c) => c.l), ...lines.map((l) => l.price));
      let max = Math.max(...data.map((c) => c.h), ...lines.map((l) => l.price));
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
  return (
    <div ref={wrapRef}
      className="relative w-full select-none"
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={() => { endDrag(); setHover(null); }}
      onDoubleClick={resetView}>
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
