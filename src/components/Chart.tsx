/* Canvas charts: equity curve + mini bar charts for the debrief. */
import { useEffect, useMemo, useRef } from "react";

export function EquityLine({ data, height = 132, baseline }: { data: number[]; height?: number; baseline?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = ref.current;
    if (!wrap || !canvas) return;
    const draw = () => {
      if (document.visibilityState === "hidden") return;
      const W = wrap.clientWidth, H = height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      if (data.length < 2) return;
      const base = baseline ?? data[0];
      const min = Math.min(...data, base), max = Math.max(...data, base);
      const r = max - min || 1;
      const x = (i: number) => (i / (data.length - 1)) * (W - 8) + 4;
      const y = (v: number) => H - 10 - ((v - min) / r) * (H - 20);

      // baseline
      ctx.strokeStyle = "#24344f";
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(4, y(base)); ctx.lineTo(W - 4, y(base)); ctx.stroke();
      ctx.setLineDash([]);

      // area
      const up = data[data.length - 1] >= base;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, up ? "rgba(47,185,140,0.22)" : "rgba(224,86,79,0.22)");
      grad.addColorStop(1, "rgba(10,17,32,0)");
      ctx.beginPath();
      ctx.moveTo(x(0), y(data[0]));
      data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.lineTo(x(data.length - 1), H - 6);
      ctx.lineTo(x(0), H - 6);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // line
      ctx.beginPath();
      ctx.moveTo(x(0), y(data[0]));
      data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.strokeStyle = up ? "#2fb98c" : "#e0564f";
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.stroke();

      // last dot
      const lx = x(data.length - 1), ly = y(data[data.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = up ? "#2fb98c" : "#e0564f"; ctx.fill();
    };
    draw();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : null;
    if (ro && wrap) ro.observe(wrap);
    return () => { ro?.disconnect(); };
  }, [data, height, baseline]);

  return <div ref={wrapRef} className="w-full"><canvas ref={ref} className="block w-full" /></div>;
}

export function MiniBars({ items, height = 120 }: { items: { label: string; value: number }[]; height?: number }) {
  const maxAbs = useMemo(() => Math.max(...items.map((i) => Math.abs(i.value)), 0.001), [items]);
  return (
    <div className="flex items-end gap-2 w-full" style={{ height }}>
      {items.map((it) => {
        const h = Math.max(3, (Math.abs(it.value) / maxAbs) * (height - 26));
        const up = it.value >= 0;
        return (
          <div key={it.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className={"num text-[9.5px] " + (up ? "text-up" : "text-down")}>{(it.value >= 0 ? "+" : "") + it.value.toFixed(2)}</span>
            <div className="w-full rounded-t-[3px] transition-all duration-700"
              style={{ height: h, background: up ? "rgba(47,185,140,0.7)" : "rgba(224,86,79,0.7)" }} />
            <span className="text-[9px] text-fog-500 truncate w-full text-center">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}
