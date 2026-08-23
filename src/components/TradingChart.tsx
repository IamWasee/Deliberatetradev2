/* =====================================================================
   TradingChart — main trading chart on TradingView lightweight-charts v5.
   · mounted via useRef + useEffect, chart.remove() on unmount
   · autoSize (ResizeObserver) + explicit resize after fullscreen settle
   · built-in autoScale on the price axis (tight when zoomed, wide when out)
   · draggable Stop (red) / Target (green) price lines via createPriceLine
     with a live price label and onPriceChange on release
   · fullscreen via framer-motion layout animation — SAME element, never
     remounted, so zoom/pan/lines survive the transition
   · indicators from lib/indicators render as lightweight-charts series:
     overlays on the price pane, RSI/MACD/ATR/volume in their own panes
   ===================================================================== */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type IPriceLine, type IPaneApi,
  type UTCTimestamp, type Time, type MouseEventParams, type CandlestickData,
} from "lightweight-charts";
import { motion } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Candle } from "../lib/types";
import type { IndicatorResult } from "../lib/indicators";

const CANDLE_SECONDS = 5; // one simulated candle ≈ 5s on the time axis
const HIT_TOLERANCE = 7;  // px slack for grabbing a line

export interface TradingChartProps {
  symbol: string;
  candles: Candle[];
  live: number;
  decimals?: number;
  height?: number;
  indicators: IndicatorResult;
  entry?: number;
  stop?: number;
  target?: number;
  /** fired when a drag finishes — parent persists the new stop/target */
  onPriceChange?: (kind: "stop" | "target", price: number) => void;
}

interface HoverInfo { o: number; h: number; l: number; c: number; pct: number }

/* palette — matches the app's calm-terminal ink theme */
const C = {
  bg: "#0a1120", grid: "#141f36", text: "#6b7d96", border: "#1c2942",
  up: "#2fb98c", down: "#e0564f", entry: "#eef3fa",
  target: "#2fb98c", stop: "#e0564f",
};

export default function TradingChart({
  symbol, candles, live, decimals = 2, height = 288, indicators,
  entry, stop, target, onPriceChange,
}: TradingChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indSeriesRef = useRef<{ s: ISeriesApi<"Line"> | ISeriesApi<"Histogram">; pane?: boolean }[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const dragRef = useRef<null | { kind: "stop" | "target"; preview: IPriceLine | null }>(null);
  const atLiveRef = useRef(true);

  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragLabel, setDragLabel] = useState<null | { y: number; price: number; kind: "stop" | "target" }>(null);
  const [atLive, setAtLive] = useState(true);

  /* latest props visible to imperative handlers without re-binding */
  const propsRef = useRef({ stop, target, decimals, live, candles });
  propsRef.current = { stop, target, decimals, live, candles };

  /* stable time anchor per symbol so candle times never jitter mid-candle */
  const anchor = useMemo(() => Math.floor(Date.now() / 1000) + 300, [symbol]);
  const timeFor = useCallback((i: number, n: number): Time =>
    (anchor - (n - i) * CANDLE_SECONDS) as UTCTimestamp, [anchor]);

  /* structure signature — series/panes rebuild only when this changes */
  const signature = useMemo(() =>
    [symbol, candles.length > 0 ? "d" : "e",
      indicators.overlays.map((o) => o.uid).join(","),
      indicators.panes.map((p) => p.uid).join(","),
      indicators.showVolume ? "v" : ""].join("|"),
    [symbol, candles.length > 0, indicators.overlays, indicators.panes, indicators.showVolume]);

  /* ------------------------- chart lifecycle ------------------------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3a4c6e", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#24344f" },
        horzLine: { color: "#3a4c6e", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#24344f" },
      },
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.08, bottom: 0.14 } },
      timeScale: {
        borderColor: C.border, rightOffset: 6, barSpacing: 7,
        timeVisible: true, secondsVisible: true, fixLeftEdge: false, fixRightEdge: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: C.up, downColor: C.down,
      borderUpColor: C.up, borderDownColor: C.down,
      wickUpColor: "rgba(47,185,140,0.7)", wickDownColor: "rgba(224,86,79,0.7)",
      priceLineColor: "#3a4c6e", priceLineStyle: LineStyle.Dotted,
    });
    candleRef.current = candle;

    /* OHLC legend follows the crosshair */
    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.seriesData) { setHover(null); return; }
      const d = param.seriesData.get(candle) as CandlestickData<Time> | undefined;
      if (!d) { setHover(null); return; }
      setHover({ o: d.open, h: d.high, l: d.low, c: d.close, pct: ((d.close - d.open) / d.open) * 100 });
    };
    chart.subscribeCrosshairMove(onMove);

    /* "back to live" detection */
    const ts = chart.timeScale();
    const onRange = () => {
      const r = ts.getVisibleLogicalRange();
      const len = propsRef.current.candles.length;
      const at = !!r && r.to >= len - 2;
      if (atLiveRef.current !== at) { atLiveRef.current = at; setAtLive(at); }
    };
    ts.subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      ts.unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      indSeriesRef.current = [];
      linesRef.current = [];
    };
  }, []);

  /* ----------------- indicator series (re)construction ---------------- */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    /* tear down previous indicator series + extra panes */
    indSeriesRef.current.forEach(({ s }) => {
      try { (chart as unknown as { removeSeries(x: unknown): void }).removeSeries(s); } catch { /* gone */ }
    });
    indSeriesRef.current = [];
    /* empty panes are dropped by the library once their last series is gone */

    let paneIdx = 0;
    const mkPane = () => ++paneIdx;
    const paneHeight = (pi: number, h: number) => {
      const pane = chart.panes()[pi] as IPaneApi<Time> | undefined;
      try { pane?.setHeight(h); } catch { /* pane not ready */ }
    };

    if (indicators.showVolume) {
      const pi = mkPane();
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        lastValueVisible: false, priceLineVisible: false,
      }, pi);
      paneHeight(pi, 64);
      indSeriesRef.current.push({ s: vol });
    }
    for (const p of indicators.panes) {
      const pi = mkPane();
      if (p.kind === "macd") {
        const hist = chart.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "price", precision: 3, minMove: 0.001 } }, pi);
        const macdL = chart.addSeries(LineSeries, { color: "#6fb6e8", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, pi);
        const sigL = chart.addSeries(LineSeries, { color: "#e0a33b", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, pi);
        paneHeight(pi, 84);
        indSeriesRef.current.push({ s: hist }, { s: macdL }, { s: sigL });
      } else {
        const line = chart.addSeries(LineSeries, {
          color: p.kind === "rsi" ? "#b48ef0" : "#e0a33b",
          lineWidth: 1, lastValueVisible: true, priceLineVisible: false,
          priceFormat: { type: "price", precision: p.kind === "atr" ? decimals : 1, minMove: p.kind === "atr" ? 0.01 : 0.1 },
        }, pi);
        if (p.kind === "rsi") {
          line.createPriceLine({ price: 70, color: "rgba(224,86,79,0.55)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
          line.createPriceLine({ price: 30, color: "rgba(47,185,140,0.55)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
        }
        paneHeight(pi, 76);
        indSeriesRef.current.push({ s: line });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /* ------------------------------ data feed --------------------------- */
  useEffect(() => {
    const chart = chartRef.current, candle = candleRef.current;
    if (!chart || !candle) return;

    const n = candles.length;
    const bars = candles.map((c, i) => ({
      time: timeFor(i, n), open: c.o, high: c.h, low: c.l, close: c.c,
    }));
    candle.setData(bars);

    /* indicator data — same candles, same times, never a different feed */
    let slot = 0;
    const lineData = (vals: (number | null)[]) =>
      vals.map((v, i) => ({ time: timeFor(i, n), value: v ?? Number.NaN }))
        .filter((d) => Number.isFinite(d.value));

    if (indicators.showVolume && indSeriesRef.current[slot]) {
      const vol = indSeriesRef.current[slot].s as ISeriesApi<"Histogram">;
      vol.setData(candles.map((c, i) => ({
        time: timeFor(i, n), value: c.v,
        color: c.c >= c.o ? "rgba(47,185,140,0.35)" : "rgba(224,86,79,0.35)",
      })));
      slot++;
    }
    for (const p of indicators.panes) {
      if (p.kind === "macd") {
        const [hist, macdL, sigL] = indSeriesRef.current.slice(slot, slot + 3);
        (hist?.s as ISeriesApi<"Histogram"> | undefined)?.setData(
          (p.c ?? []).map((v, i) => ({
            time: timeFor(i, n), value: v ?? Number.NaN,
            color: v == null ? "transparent" : v >= 0 ? "rgba(47,185,140,0.75)" : "rgba(224,86,79,0.75)",
          })).filter((d) => Number.isFinite(d.value)));
        (macdL?.s as ISeriesApi<"Line"> | undefined)?.setData(lineData(p.a));
        (sigL?.s as ISeriesApi<"Line"> | undefined)?.setData(lineData(p.b ?? []));
        slot += 3;
      } else {
        const line = indSeriesRef.current[slot]?.s as ISeriesApi<"Line"> | undefined;
        line?.setData(lineData(p.a));
        slot++;
      }
    }

    /* overlays live on the candle pane */
    for (const o of indicators.overlays) {
      let s = overlayByUid.current.get(o.uid);
      if (!s) {
        s = chart.addSeries(LineSeries, {
          color: o.color, lineWidth: o.width > 1.3 ? 2 : 1,
          lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        });
        overlayByUid.current.set(o.uid, s);
      }
      s.setData(lineData(o.values));
      if (o.fill) {
        let up = overlayByUid.current.get(`${o.uid}:u`);
        let lo = overlayByUid.current.get(`${o.uid}:l`);
        if (!up) {
          up = chart.addSeries(LineSeries, { color: o.color + "88", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
          overlayByUid.current.set(`${o.uid}:u`, up);
        }
        if (!lo) {
          lo = chart.addSeries(LineSeries, { color: o.color + "88", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
          overlayByUid.current.set(`${o.uid}:l`, lo);
        }
        up.setData(lineData(o.fill.upper));
        lo.setData(lineData(o.fill.lower));
      }
    }
    /* drop overlay series no longer active */
    const active = new Set(indicators.overlays.flatMap((o) => [o.uid, `${o.uid}:u`, `${o.uid}:l`]));
    overlayByUid.current.forEach((s, uid) => {
      if (!active.has(uid)) {
        try { (chart as unknown as { removeSeries(x: unknown): void }).removeSeries(s); } catch { /* gone */ }
        overlayByUid.current.delete(uid);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, indicators, timeFor, signature]);

  /* uid → overlay series bookkeeping (the chart has no public lookup) */
  const overlayByUid = useRef(new Map<string, ISeriesApi<"Line">>());
  useEffect(() => () => { overlayByUid.current.clear(); }, []);

  /* --------------------- entry / stop / target lines ------------------- */
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    linesRef.current.forEach((l) => { try { candle.removePriceLine(l); } catch { /* gone */ } });
    linesRef.current = [];
    const dragging = dragRef.current?.kind;
    const mk = (price: number, color: string, title: string, style: LineStyle, width: 1 | 2) =>
      candle.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title });
    if (entry != null) linesRef.current.push(mk(entry, C.entry, "ENTRY", LineStyle.Dashed, 1));
    if (stop != null && dragging !== "stop") linesRef.current.push(mk(stop, C.stop, "STOP", LineStyle.Solid, 2));
    if (target != null && dragging !== "target") linesRef.current.push(mk(target, C.target, "TARGET", LineStyle.Solid, 2));
  }, [entry, stop, target, dragLabel]);

  /* --------------------------- drag mechanics -------------------------- */
  const hitTest = useCallback((y: number): "stop" | "target" | null => {
    const candle = candleRef.current;
    const { stop: st, target: tp } = propsRef.current;
    if (!candle) return null;
    for (const [kind, price] of [["stop", st], ["target", tp]] as const) {
      if (price == null) continue;
      const ly = candle.priceToCoordinate(price);
      if (ly != null && Math.abs(y - ly) <= HIT_TOLERANCE) return kind;
    }
    return null;
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-chart-ui]")) return;
      const candle = candleRef.current;
      if (!candle || dragRef.current) return;
      const rect = el.getBoundingClientRect();
      const kind = hitTest(e.clientY - rect.top);
      if (!kind) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      chartRef.current?.applyOptions({ handleScroll: false, handleScale: false });
      dragRef.current = { kind, preview: null };
      el.style.cursor = "ns-resize";
    };

    const move = (e: PointerEvent) => {
      const candle = candleRef.current;
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (!candle) return;

      if (!dragRef.current) {
        el.style.cursor = hitTest(y) ? "ns-resize" : "crosshair";
        return;
      }
      const price = candle.coordinateToPrice(y);
      if (price == null || !Number.isFinite(price)) return;
      const { kind } = dragRef.current;
      /* live preview line + floating label */
      if (dragRef.current.preview) candle.removePriceLine(dragRef.current.preview);
      dragRef.current.preview = candle.createPriceLine({
        price, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true,
        color: kind === "stop" ? C.stop : C.target,
        title: kind === "stop" ? "STOP" : "TARGET",
      });
      setDragLabel({ y, price, kind });
    };

    const up = (e: PointerEvent) => {
      const candle = candleRef.current;
      const drag = dragRef.current;
      if (!candle || !drag) return;
      const rect = el.getBoundingClientRect();
      const price = candle.coordinateToPrice(e.clientY - rect.top);
      if (drag.preview) { try { candle.removePriceLine(drag.preview); } catch { /* gone */ } }
      dragRef.current = null;
      setDragLabel(null);
      el.style.cursor = "crosshair";
      chartRef.current?.applyOptions({ handleScroll: true, handleScale: true });
      if (price != null && Number.isFinite(price) && onPriceChange) {
        onPriceChange(drag.kind, Number(price.toFixed(propsRef.current.decimals + 1)));
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [hitTest, onPriceChange]);

  /* ------------------------- fullscreen handling ----------------------- */
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  /* fit once per symbol */
  useEffect(() => {
    const t = setTimeout(() => chartRef.current?.timeScale().fitContent(), 60);
    return () => clearTimeout(t);
  }, [symbol]);

  const fmt = (v: number) => v.toFixed(decimals);

  return (
    <motion.div
      layout
      initial={false}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      onAnimationComplete={() => {
        /* the container has settled — hand the real pixel size to the chart */
        const el = wrapRef.current, chart = chartRef.current;
        if (el && chart) {
          chart.resize(el.clientWidth, el.clientHeight);
          chart.timeScale().scrollToRealTime();
        }
      }}
      className={expanded
        ? "fixed inset-0 z-[80] p-3 md:p-6"
        : "relative w-full"}
      style={expanded ? undefined : { height }}
    >
      <div className={`relative h-full w-full ${expanded ? "" : ""}`}
        style={expanded ? { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" } : undefined}>
        {expanded && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(5,9,17,0.96)" }} />
        )}
        <div ref={wrapRef} className="absolute inset-0" style={{ cursor: "crosshair" }} />

        {/* OHLC legend */}
        <div className="absolute top-2 left-2 num text-[10.5px] px-2 py-1 rounded-md pointer-events-none flex items-center gap-2"
          style={{ background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#c3cfdf" }}>
          <span className="font-bold" style={{ color: "#eef3fa" }}>{symbol}</span>
          {hover ? (
            <>
              <span>O {fmt(hover.o)}</span><span>H {fmt(hover.h)}</span><span>L {fmt(hover.l)}</span>
              <span style={{ color: hover.pct >= 0 ? C.up : C.down }}>C {fmt(hover.c)}</span>
            </>
          ) : (
            <span style={{ color: "#6b7d96" }}>live · {fmt(live)}</span>
          )}
        </div>

        {/* expand / collapse */}
        <button
          data-chart-ui
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse (Esc)" : "Expand chart"}
          className="absolute top-2 right-2 inline-flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all hover:-translate-y-[1px]"
          style={{ background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#93a3ba" }}>
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>

        {/* back to live */}
        {!atLive && (
          <button
            data-chart-ui
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            className="absolute top-10 right-2 num text-[10px] font-bold px-2 py-1 rounded-full animate-pop"
            style={{ background: "rgba(57,197,165,0.16)", border: "1px solid rgba(57,197,165,0.55)", color: "#39c5a5" }}>
            back to live ▸
          </button>
        )}

        {/* drag price label */}
        {dragLabel && (
          <div
            className="absolute num text-[11px] font-bold px-2 py-0.5 rounded pointer-events-none"
            style={{
              left: 8, top: Math.max(4, dragLabel.y - 12),
              background: dragLabel.kind === "stop" ? "rgba(224,86,79,0.92)" : "rgba(47,185,140,0.92)",
              color: "#08131f",
            }}>
            {dragLabel.kind === "stop" ? "STOP" : "TARGET"} {fmt(dragLabel.price)}
          </div>
        )}

        {expanded && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 num text-[9.5px] px-2 py-0.5 rounded-full pointer-events-none"
            style={{ background: "rgba(10,17,32,0.85)", border: "1px solid #1c2942", color: "#4d5f78" }}>
            drag the red/green lines to adjust · Esc to collapse
          </div>
        )}
      </div>
    </motion.div>
  );
}
