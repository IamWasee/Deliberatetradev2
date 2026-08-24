/* Custom canvas candlestick chart: drag-pan, wheel-zoom, crosshair,
   auto-scaling price axis, and entry/stop/target lines. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "../lib/engine";

export interface ChartLine { price: number; color: string; label: string; dash?: number[] }

const MIN_VIS = 24, MAX_VIS = 170;

export default function CandleChart({
  candles, live, height = 300, lines = [], decimals = 2,
}: {
  candles: Candle[]; live: number; height?: number; lines?: ChartLine[]; decimals?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(90);
  const [offset, setOffset] = useState(0); // bars back from the live edge
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; offset: number; moved: boolean } | null>(null);

  const data = useMemo(() => {
    const end = Math.max(MIN_VIS, candles.length - offset);
    const start = Math.max(0, end - visible);
    return candles.slice(start, end);
  }, [candles, visible, offset]);

  const atLive = offset === 0;

  useEffect(() => {
    const canvas = ref.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !data.length) return;
    if (document.visibilityState === "hidden") return;

    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const axisW = 62, padT = 12, padB = 18;
    const chartW = W - axisW;
    const lo = Math.min(...data.map((c) => c.l), ...lines.map((l) => l.price));
    const hi = Math.max(...data.map((c) => c.h), ...lines.map((l) => l.price));
    const range = hi - lo || 1;
    const span = range * 1.08;
    const y = (p: number) => padT + (1 - (p - (lo - range * 0.04)) / span) * (H - padT - padB);

    // grid + axis
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.strokeStyle = "#141f36"; ctx.lineWidth = 1;
    ctx.fillStyle = "#6b7d96";
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const p = lo + (range * i) / steps;
      const yy = y(p);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
      ctx.fillText(p >= 1000 ? p.toFixed(0) : p.toFixed(decimals), chartW + 6, yy + 3);
    }

    const bw = chartW / data.length;
    const bodyW = Math.max(1.5, bw * 0.58);

    // candles
    data.forEach((c, i) => {
      const cx = i * bw + bw / 2;
      const up = c.c >= c.o;
      const col = up ? "#2fb98c" : "#e0564f";
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, y(c.h)); ctx.lineTo(cx, y(c.l)); ctx.stroke();
      const yo = y(c.o), yc = y(c.c);
      ctx.fillRect(cx - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1.4, Math.abs(yc - yo)));
    });

    // bracket / price lines
    for (const l of lines) {
      const yy = y(l.price);
      if (yy < padT - 4 || yy > H - padB + 4) continue;
      ctx.strokeStyle = l.color; ctx.lineWidth = 1.3;
      ctx.setLineDash(l.dash ?? []);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = l.color;
      ctx.fillText(l.label, 6, yy - 4);
    }

    // live price line (only when at the live edge)
    if (atLive) {
      const yy = y(live);
      ctx.strokeStyle = "#39c5a5"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#39c5a5";
      ctx.fillRect(chartW, yy - 8, axisW, 16);
      ctx.fillStyle = "#062019";
      ctx.fillText(live >= 1000 ? live.toFixed(0) : live.toFixed(decimals), chartW + 5, yy + 3);
    }

    // crosshair
    if (hover && hover.i >= 0 && hover.i < data.length) {
      const cx = hover.i * bw + bw / 2;
      ctx.strokeStyle = "#3a4c6e"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, H - padB); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hover.y); ctx.lineTo(chartW, hover.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, height, lines, live, decimals, atLive, hover]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, offset, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const axisW = 62;
    const chartW = rect.width - axisW;
    const bw = chartW / Math.max(1, data.length);
    const i = Math.floor((e.clientX - rect.left) / bw);

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const bars = Math.round(dx / bw);
      if (bars !== 0) dragRef.current.moved = true;
      setOffset(Math.max(0, Math.min(candles.length - MIN_VIS, dragRef.current.offset + bars)));
      return;
    }
    setHover({ i: Math.max(0, Math.min(data.length - 1, i)), x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const endDrag = () => { dragRef.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.18 : 0.85;
    setVisible((v) => Math.max(MIN_VIS, Math.min(MAX_VIS, Math.round(v * factor))));
  };

  const hc = hover && data[hover.i] ? data[hover.i] : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ cursor: dragRef.current ? "grabbing" : "crosshair", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => { endDrag(); setHover(null); }}
      onWheel={onWheel}
      onDoubleClick={() => { setOffset(0); setVisible(90); }}
    >
      <canvas ref={ref} className="block w-full" />

      {hc && !dragRef.current && (
        <div className="absolute top-2 left-2 num text-[10.5px] px-2 py-1 rounded-md pointer-events-none"
          style={{ background: "rgba(10,17,32,0.9)", border: "1px solid #1c2942", color: "#c3cfdf" }}>
          O {hc.o.toFixed(2)}&nbsp; H {hc.h.toFixed(2)}&nbsp; L {hc.l.toFixed(2)}&nbsp;
          <span style={{ color: hc.c >= hc.o ? "#2fb98c" : "#e0564f" }}>C {hc.c.toFixed(2)}</span>
        </div>
      )}

      {!atLive && (
        <button
          onClick={() => setOffset(0)}
          className="absolute top-2 right-2 num text-[10.5px] font-bold px-2.5 py-1 rounded-full animate-pop"
          style={{ background: "rgba(57,197,165,0.16)", border: "1px solid rgba(57,197,165,0.55)", color: "#39c5a5" }}>
          −{offset} bars · back to live ▸
        </button>
      )}
    </div>
  );
}
