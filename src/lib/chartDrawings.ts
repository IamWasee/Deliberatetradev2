/* =====================================================================
   Chart drawing overlay.

   Drawings are stored in CHART space - (time, price) - never in pixels.
   Pixel coordinates are derived at paint time from the chart's own scales,
   which is what keeps a trend line pinned to the candles it was drawn
   against while the user pans, zooms, or resizes. Storing pixels would
   look correct until the first scroll and then silently lie.

   The overlay is a plain canvas above the chart. It does not touch the
   chart's series or options, so nothing here can disturb the existing
   stop/target price lines or the drag behaviour.
   ===================================================================== */
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export type DrawingKind = "trend" | "horizontal" | "vertical" | "measure";

export interface Point { time: number; price: number }
export interface Drawing { id: string; kind: DrawingKind; a: Point; b?: Point }

const COLORS: Record<DrawingKind, string> = {
  trend: "#6fb6e8",
  horizontal: "#e0a33b",
  vertical: "#8b7fd4",
  measure: "#39c5a5",
};

export interface Scales {
  x: (t: number) => number | null;
  y: (p: number) => number | null;
}

/** Chart-space -> pixel converters taken from the live chart. */
export function scalesOf(chart: IChartApi, series: ISeriesApi<"Candlestick">): Scales {
  const ts = chart.timeScale();
  return {
    x: (t) => ts.timeToCoordinate(t as Time),
    y: (p) => series.priceToCoordinate(p),
  };
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function label(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  c.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const w = c.measureText(text).width + 10;
  const h = 16;
  c.fillStyle = "rgba(10,17,32,0.92)";
  c.strokeStyle = color;
  c.lineWidth = 1;
  roundRect(c, x, y - h / 2, w, h, 4);
  c.fill();
  c.stroke();
  c.fillStyle = color;
  c.textBaseline = "middle";
  c.fillText(text, x + 5, y);
}

export interface PaintOpts {
  decimals: number;
  /** Point currently under the cursor while a two-point tool is armed. */
  ghost?: { from: Point; to: Point; kind: DrawingKind } | null;
}

export function paint(
  canvas: HTMLCanvasElement,
  drawings: Drawing[],
  s: Scales,
  opts: PaintOpts,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const c = canvas.getContext("2d");
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const all = opts.ghost
    ? [...drawings, { id: "__ghost", kind: opts.ghost.kind, a: opts.ghost.from, b: opts.ghost.to }]
    : drawings;

  for (const d of all) {
    const color = COLORS[d.kind];
    const ghost = d.id === "__ghost";
    c.save();
    c.strokeStyle = color;
    c.lineWidth = 1.4;
    c.globalAlpha = ghost ? 0.65 : 1;
    if (ghost) c.setLineDash([4, 3]);

    if (d.kind === "horizontal") {
      const y = s.y(d.a.price);
      if (y == null) { c.restore(); continue; }
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      c.setLineDash([]);
      label(c, 6, y - 11, d.a.price.toFixed(opts.decimals), color);
    } else if (d.kind === "vertical") {
      const x = s.x(d.a.time);
      if (x == null) { c.restore(); continue; }
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    } else if (d.b) {
      const x1 = s.x(d.a.time), y1 = s.y(d.a.price);
      const x2 = s.x(d.b.time), y2 = s.y(d.b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { c.restore(); continue; }
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();

      if (d.kind === "measure") {
        /* Shade the move so the magnitude reads at a glance. */
        c.globalAlpha = ghost ? 0.10 : 0.14;
        c.fillStyle = d.b.price >= d.a.price ? "#2fb98c" : "#e0564f";
        c.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        c.globalAlpha = ghost ? 0.65 : 1;

        const diff = d.b.price - d.a.price;
        const pct = d.a.price !== 0 ? (diff / d.a.price) * 100 : 0;
        const sign = diff >= 0 ? "+" : "";
        c.setLineDash([]);
        label(c, Math.max(4, x2 + 8), y2,
          `${sign}${diff.toFixed(opts.decimals)}  ${sign}${pct.toFixed(2)}%`,
          diff >= 0 ? "#2fb98c" : "#e0564f");
      } else {
        /* Endpoint handles, so a trend line reads as an object rather
           than an accident of the grid. */
        c.setLineDash([]);
        for (const [px, py] of [[x1, y1], [x2, y2]] as const) {
          c.beginPath(); c.arc(px, py, 2.6, 0, Math.PI * 2);
          c.fillStyle = color; c.fill();
        }
      }
    }
    c.restore();
  }
}

export const isTwoPoint = (k: DrawingKind): boolean => k === "trend" || k === "measure";
