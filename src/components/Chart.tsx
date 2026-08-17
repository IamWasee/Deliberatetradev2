import React, { useEffect, useRef, useState } from "react";
import type { Candle } from "../lib/types";

interface Line { price: number; color: string; label: string; dash?: number[] }

export function CandleChart({ candles, lines = [], height = 300, live }: {
  candles: Candle[]; lines?: Line[]; height?: number; live?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; c: Candle } | null>(null);

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

      const data = candles.slice(-110);
      if (!data.length) return;
      const axisW = 58;
      const padT = 12, padB = 18;
      const chartW = W - axisW;
      let min = Math.min(...data.map((c) => c.l), ...lines.map((l) => l.price));
      let max = Math.max(...data.map((c) => c.h), ...lines.map((l) => l.price));
      const pad = (max - min) * 0.08 || 1;
      min -= pad; max += pad;
      const y = (p: number) => padT + (1 - (p - min) / (max - min)) * (H - padT - padB);
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

      // bracket lines
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

      // last price
      if (live !== undefined) {
        const yy = y(live);
        ctx.strokeStyle = "rgba(238,243,250,0.28)";
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(chartW, yy); ctx.stroke();
        ctx.setLineDash([]);
      }

      // crosshair
      if (hover) {
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
  }, [candles, lines, height, live, hover]);

  const onMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const data = candles.slice(-110);
    const bw = (rect.width - 58) / Math.max(1, data.length);
    const i = Math.min(data.length - 1, Math.max(0, Math.floor(x / bw)));
    setHover({ x: i * bw + bw / 2, y: e.clientY - rect.top, c: data[i] });
  };

  const hc = hover?.c;
  return (
    <div ref={wrapRef} className="relative w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <canvas ref={ref} className="block w-full" />
      {hc && (
        <div className="absolute top-2 left-2 num text-[10.5px] px-2 py-1 rounded-md pointer-events-none"
          style={{ background: "rgba(10,17,32,0.9)", border: "1px solid #1c2942", color: "#c3cfdf" }}>
          O {hc.o.toFixed(2)}&nbsp; H {hc.h.toFixed(2)}&nbsp; L {hc.l.toFixed(2)}&nbsp;
          <span style={{ color: hc.c >= hc.o ? "#2fb98c" : "#e0564f" }}>C {hc.c.toFixed(2)}</span>
        </div>
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
