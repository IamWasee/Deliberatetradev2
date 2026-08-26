/* =====================================================================
   TradingChart - main trading chart on TradingView lightweight-charts v5.
   - mounted via useRef + useEffect, chart.remove() on unmount
   - autoSize + explicit resize after the fullscreen transition settles
   - built-in autoScale on the price axis
   - draggable STOP (red) / TARGET (green) lines via createPriceLine,
     with a live price label and onPriceChange on release
   - fullscreen via framer-motion layout animation on the SAME element
     (no remount - zoom, pan and lines survive)
   - indicators render as native series: overlays on the price pane,
     RSI/MACD/ATR/volume in their own panes
   ===================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartContextMenu, { type ChartMenuAction, type MenuAnchor } from "./ChartContextMenu";
import { paint, scalesOf, isTwoPoint, type Drawing, type DrawingKind, type Point } from "../lib/chartDrawings";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type IPriceLine,
  type UTCTimestamp, type Time, type MouseEventParams, type CandlestickData,
} from "lightweight-charts";
import { motion } from "framer-motion";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { Candle } from "../lib/types";
import type { IndicatorResult } from "../lib/indicators";

const CANDLE_SECONDS = 5;
const HIT_TOLERANCE = 7;

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
  onPriceChange?: (kind: "stop" | "target", price: number) => void;
  /** Opens the existing indicators manager; menu item hides when absent. */
  onOpenIndicators?: () => void;
  /** Optional hook for a fired price alert; the chart also shows its own
      banner, so leaving this unset still gives the user feedback. */
  onPriceAlert?: (price: number) => void;
}

interface HoverInfo { o: number; h: number; l: number; c: number; pct: number }

const C = {
  bg: "#0a1120", grid: "#141f36", text: "#6b7d96", border: "#1c2942",
  up: "#2fb98c", down: "#e0564f", entry: "#eef3fa",
  target: "#2fb98c", stop: "#e0564f",
};

export default function TradingChart({
  symbol, candles, live, decimals = 2, height = 288, indicators,
  entry, stop, target, onPriceChange, onOpenIndicators, onPriceAlert,
}: TradingChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indSeriesRef = useRef<ISeriesApi<"Line" | "Histogram">[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const dragRef = useRef<null | { kind: "stop" | "target"; preview: IPriceLine | null }>(null);
  const atLiveRef = useRef(true);

  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragLabel, setDragLabel] = useState<null | { y: number; price: number; kind: "stop" | "target" }>(null);
  const [atLive, setAtLive] = useState(true);

  /* ---- context menu + drawings (additive; nothing above is affected) --- */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [magnet, setMagnet] = useState(false);
  const [tool, setTool] = useState<ChartMenuAction | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [details, setDetails] = useState<null | { x: number; y: number; c: Candle; t: string }>(null);
  const pendingRef = useRef<Point | null>(null);
  const ghostRef = useRef<null | { from: Point; to: Point; kind: DrawingKind }>(null);
  const alertsRef = useRef<{ price: number; above: boolean }[]>([]);
  const menuPtRef = useRef<Point | null>(null);
  const [firedAlert, setFiredAlert] = useState<number | null>(null);

  /* Drawings are cleared per symbol: a trend line drawn on NVDA is
     meaningless once the pane is showing BTC. */
  useEffect(() => {
    setDrawings([]); setTool(null); setDetails(null);
    pendingRef.current = null; ghostRef.current = null; alertsRef.current = [];
  }, [symbol]);

  const propsRef = useRef({ stop, target, decimals, candles });
  propsRef.current = { stop, target, decimals, candles };

  /* stable time anchor per symbol */
  const anchor = useMemo(() => Math.floor(Date.now() / 1000) + 300, [symbol]);
  const timeFor = useCallback((i: number, n: number): Time =>
    (anchor - (n - i) * CANDLE_SECONDS) as UTCTimestamp, [anchor]);

  const signature = useMemo(() =>
    [symbol,
      indicators.overlays.map((o) => o.uid).join(","),
      indicators.panes.map((p) => p.uid).join(","),
      indicators.showVolume ? "v" : ""].join("|"),
    [symbol, indicators.overlays, indicators.panes, indicators.showVolume]);

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
        timeVisible: true, secondsVisible: true,
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

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.seriesData) { setHover(null); return; }
      const d = param.seriesData.get(candle) as CandlestickData<Time> | undefined;
      if (!d) { setHover(null); return; }
      setHover({ o: d.open, h: d.high, l: d.low, c: d.close, pct: ((d.close - d.open) / d.open) * 100 });
    };
    chart.subscribeCrosshairMove(onMove);

    const onRange = () => {
      const r = chart.timeScale().getVisibleLogicalRange();
      const len = propsRef.current.candles.length;
      const at = !!r && r.to >= len - 2;
      if (atLiveRef.current !== at) { atLiveRef.current = at; setAtLive(at); }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
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

    /* remove previous indicator series; their panes are removed too when empty */
    indSeriesRef.current.forEach((s) => { try { (chart as unknown as { removeSeries(x: unknown): void }).removeSeries(s); } catch { /* gone */ } });
    indSeriesRef.current = [];

    const panes = chart.panes();
    panes.slice(1).forEach((p) => { try { (p as unknown as { remove(): void }).remove(); } catch { /* gone */ } });

    let paneIdx = 0;
    const addPaneSeries = <T extends "Line" | "Histogram">(type: T extends "Line" ? typeof LineSeries : typeof HistogramSeries, opts: Record<string, unknown>): ISeriesApi<T> => {
      paneIdx = Math.max(paneIdx, chart.panes().length - 1) + 1 > chart.panes().length - 1 ? chart.panes().length : paneIdx;
      return chart.addSeries(type, opts as never, paneIdx) as ISeriesApi<T>;
    };

    if (indicators.showVolume) {
      paneIdx += 1;
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        lastValueVisible: false, priceLineVisible: false,
      } as never, paneIdx) as ISeriesApi<"Histogram">;
      indSeriesRef.current.push(vol);
      chart.panes()[paneIdx]?.setHeight(56);
    }
    for (const p of indicators.panes) {
      paneIdx += 1;
      if (p.kind === "macd") {
        const hist = chart.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "price", precision: 3, minMove: 0.001 } } as never, paneIdx) as ISeriesApi<"Histogram">;
        const macdL = chart.addSeries(LineSeries, { color: "#6fb6e8", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false } as never, paneIdx) as ISeriesApi<"Line">;
        const sigL = chart.addSeries(LineSeries, { color: "#e0a33b", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false } as never, paneIdx) as ISeriesApi<"Line">;
        chart.panes()[paneIdx]?.setHeight(78);
        indSeriesRef.current.push(hist, macdL, sigL);
      } else {
        const line = chart.addSeries(LineSeries, {
          color: p.kind === "rsi" ? "#b48ef0" : "#e0a33b",
          lineWidth: 1, lastValueVisible: true, priceLineVisible: false,
          priceFormat: { type: "price", precision: p.kind === "atr" ? decimals : 1, minMove: p.kind === "atr" ? 0.01 : 0.1 },
        } as never, paneIdx) as ISeriesApi<"Line">;
        if (p.kind === "rsi") {
          line.createPriceLine({ price: 70, color: "rgba(224,86,79,0.55)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
          line.createPriceLine({ price: 30, color: "rgba(47,185,140,0.55)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
        }
        chart.panes()[paneIdx]?.setHeight(68);
        indSeriesRef.current.push(line);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /* ------------------------------ data feed --------------------------- */
  useEffect(() => {
    const chart = chartRef.current, candle = candleRef.current;
    if (!chart || !candle) return;

    const n = candles.length;
    candle.setData(candles.map((c, i) => ({
      time: timeFor(i, n), open: c.o, high: c.h, low: c.l, close: c.c,
    })));

    const lineData = (vals: (number | null)[]) =>
      vals.map((v, i) => ({ time: timeFor(i, n), value: v ?? Number.NaN }))
        .filter((d) => Number.isFinite(d.value));

    let slot = 0;
    if (indicators.showVolume && indSeriesRef.current[slot]) {
      (indSeriesRef.current[slot] as ISeriesApi<"Histogram">).setData(candles.map((c, i) => ({
        time: timeFor(i, n), value: c.v,
        color: c.c >= c.o ? "rgba(47,185,140,0.35)" : "rgba(224,86,79,0.35)",
      })));
      slot++;
    }
    for (const p of indicators.panes) {
      if (p.kind === "macd") {
        const [hist, macdL, sigL] = indSeriesRef.current.slice(slot, slot + 3);
        (hist as ISeriesApi<"Histogram"> | undefined)?.setData(
          (p.c ?? []).map((v, i) => ({
            time: timeFor(i, n), value: v ?? Number.NaN,
            color: v == null ? "transparent" : v >= 0 ? "rgba(47,185,140,0.75)" : "rgba(224,86,79,0.75)",
          })).filter((d) => Number.isFinite(d.value)));
        (macdL as ISeriesApi<"Line"> | undefined)?.setData(lineData(p.a));
        (sigL as ISeriesApi<"Line"> | undefined)?.setData(lineData(p.b ?? []));
        slot += 3;
      } else {
        (indSeriesRef.current[slot] as ISeriesApi<"Line"> | undefined)?.setData(lineData(p.a));
        slot++;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, indicators, timeFor, signature]);

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
      /* Left button only - a right-click must open the menu, not begin a
         stop/target drag underneath it. */
      if (e.button !== 0) return;
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

  /* --------------------- drawings + context menu ----------------------- */

  /** Repaint the overlay from current chart scales. Cheap, and the only
      way drawings stay glued to candles through pan/zoom/resize. */
  const repaint = useCallback(() => {
    const cv = overlayRef.current, chart = chartRef.current, series = candleRef.current;
    if (!cv || !chart || !series) return;
    paint(cv, drawings, scalesOf(chart, series), {
      decimals: propsRef.current.decimals,
      ghost: ghostRef.current,
    });
  }, [drawings]);

  useEffect(() => { repaint(); }, [repaint, live, expanded]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const onRange = () => repaint();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    window.addEventListener("resize", onRange);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      window.removeEventListener("resize", onRange);
    };
  }, [repaint]);

  /** Pixel position -> chart space, using the chart's own scales. */
  const pointAt = useCallback((clientX: number, clientY: number): Point | null => {
    const el = wrapRef.current, chart = chartRef.current, series = candleRef.current;
    if (!el || !chart || !series) return null;
    const rect = el.getBoundingClientRect();
    const t = chart.timeScale().coordinateToTime(clientX - rect.left);
    const price = series.coordinateToPrice(clientY - rect.top);
    if (t == null || price == null || !Number.isFinite(price)) return null;
    return { time: t as number, price };
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDetails(null);
    menuPtRef.current = pointAt(e.clientX, e.clientY);
    setMenu({ x: e.clientX, y: e.clientY });
  }, [pointAt]);

  /* While a two-point tool is armed, follow the cursor so the user sees
     the line they are about to commit. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !tool) return;

    const move = (e: MouseEvent) => {
      if (!pendingRef.current || !isTwoPoint(tool as DrawingKind)) return;
      const p = pointAt(e.clientX, e.clientY);
      if (!p) return;
      ghostRef.current = { from: pendingRef.current, to: p, kind: tool as DrawingKind };
      repaint();
    };

    const click = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-chart-ui]")) return;
      const p = pointAt(e.clientX, e.clientY);
      if (!p) return;
      const kind = tool as DrawingKind;

      if (isTwoPoint(kind)) {
        if (!pendingRef.current) { pendingRef.current = p; return; }
        /* Read the start point into a local BEFORE clearing the ref.
           React runs the updater below asynchronously, so reading
           pendingRef.current inside it would see the null assigned on the
           next line and store a drawing with no start point. */
        const from = pendingRef.current;
        pendingRef.current = null; ghostRef.current = null;
        setDrawings((prev) => [...prev, { id: "d" + Date.now(), kind, a: from, b: p }]);
        setTool(null);
      } else {
        setDrawings((prev) => [...prev, { id: "d" + Date.now(), kind, a: p }]);
        setTool(null);
      }
    };

    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* Cancel the armed tool first; only then let Escape reach the
         fullscreen handler. */
      e.stopPropagation();
      pendingRef.current = null; ghostRef.current = null;
      setTool(null); repaint();
    };

    el.addEventListener("mousemove", move);
    el.addEventListener("click", click);
    window.addEventListener("keydown", key, true);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("click", click);
      window.removeEventListener("keydown", key, true);
    };
  }, [tool, pointAt, repaint]);

  /* Price alerts set from the menu, checked against the live price. */
  useEffect(() => {
    if (!alertsRef.current.length) return;
    const remaining: typeof alertsRef.current = [];
    const fired: number[] = [];
    for (const a of alertsRef.current) {
      if (a.above ? live >= a.price : live <= a.price) fired.push(a.price);
      else remaining.push(a);
    }
    if (!fired.length) return;
    alertsRef.current = remaining;
    /* Drop only the lines that fired; other drawings are untouched. */
    setDrawings((prev) => prev.filter((d) =>
      !(d.kind === "horizontal" && fired.some((f) => Math.abs(f - d.a.price) < 1e-9))));
    setFiredAlert(fired[0]);
    onPriceAlert?.(fired[0]);
  }, [live, onPriceAlert]);

  useEffect(() => {
    if (firedAlert == null) return;
    const t = setTimeout(() => setFiredAlert(null), 4200);
    return () => clearTimeout(t);
  }, [firedAlert]);

  const runAction = useCallback((a: ChartMenuAction) => {
    const chart = chartRef.current;
    const pt = menuPtRef.current;
    setMenu(null);
    if (!chart) return;

    switch (a) {
      case "crosshair": {
        const next = !magnet;
        setMagnet(next);
        chart.applyOptions({ crosshair: { mode: next ? CrosshairMode.Magnet : CrosshairMode.Normal } });
        break;
      }
      case "zoomIn":
      case "zoomOut": {
        const ts = chart.timeScale();
        const cur = ts.options().barSpacing ?? 7;
        /* Same clamps the chart itself enforces, so this can't wedge the
           view at an unusable scale. */
        ts.applyOptions({ barSpacing: Math.min(60, Math.max(1.5, a === "zoomIn" ? cur * 1.35 : cur / 1.35)) });
        break;
      }
      case "reset":
        chart.timeScale().applyOptions({ barSpacing: 7 });
        chart.timeScale().fitContent();
        chart.timeScale().scrollToRealTime();
        break;

      case "measure":
      case "trendLine":
        pendingRef.current = null; ghostRef.current = null;
        setTool(a);
        break;
      case "horizontalLine":
        if (pt) setDrawings((prev) => [...prev, { id: "d" + Date.now(), kind: "horizontal", a: pt }]);
        break;
      case "verticalLine":
        if (pt) setDrawings((prev) => [...prev, { id: "d" + Date.now(), kind: "vertical", a: pt }]);
        break;

      case "priceAlert":
        if (pt) {
          alertsRef.current = [...alertsRef.current, { price: pt.price, above: pt.price > live }];
          setDrawings((prev) => [...prev, { id: "d" + Date.now(), kind: "horizontal", a: pt }]);
        }
        break;
      case "indicators":
        onOpenIndicators?.();
        break;
      case "candleDetails": {
        const el = wrapRef.current;
        const list = propsRef.current.candles;
        if (!el || !pt || !list.length) break;
        const rect = el.getBoundingClientRect();
        const x = chart.timeScale().timeToCoordinate(pt.time as never);
        /* Map the clicked bar back to the source candle by its offset from
           the newest bar, which is how the series was built. */
        const idx = Math.max(0, Math.min(list.length - 1,
          list.length - 1 - Math.round(((chart.timeScale().width() - (x ?? 0)) / (chart.timeScale().options().barSpacing ?? 7)))));
        setDetails({
          x: Math.min(rect.width - 150, Math.max(6, (x ?? 0))),
          y: 8,
          c: list[idx],
          t: new Date(pt.time * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        });
        break;
      }

      case "clearDrawings":
        setDrawings([]); alertsRef.current = [];
        pendingRef.current = null; ghostRef.current = null; setTool(null);
        break;
    }
  }, [magnet, live, onOpenIndicators]);

  /* ------------------------- fullscreen handling ----------------------- */
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

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
        const el = wrapRef.current, chart = chartRef.current;
        if (el && chart) {
          chart.resize(el.clientWidth, el.clientHeight);
          chart.timeScale().scrollToRealTime();
        }
      }}
      className={expanded ? "fixed inset-0 z-[70] p-3 md:p-6" : "relative w-full"}
      style={expanded ? undefined : { height }}>
      <div className="relative h-full w-full"
        style={expanded ? { background: C.bg, border: "1px solid " + C.border, borderRadius: 14, overflow: "hidden" } : undefined}>
        {expanded && <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(5,9,17,0.96)" }} />}
        <div ref={wrapRef} className="absolute inset-0"
          style={{ cursor: tool ? "crosshair" : "crosshair" }}
          onContextMenu={onContextMenu} />

        {/* drawing overlay - purely visual, never intercepts pointer events
            so panning, zooming and the stop/target drag are untouched */}
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none z-[5]"
          style={{ width: "100%", height: "100%" }} />

        {/* armed-tool hint */}
        {tool && (
          <div className="absolute bottom-2 left-2 z-20 num text-[9.5px] px-2 py-1 rounded-full pointer-events-none animate-fade-in"
            style={{ background: "rgba(57,197,165,0.14)", border: "1px solid rgba(57,197,165,0.5)", color: "#39c5a5" }}>
            {tool === "measure" ? "measure" : "trend line"} - click {pendingRef.current ? "end" : "start"} point - Esc to cancel
          </div>
        )}

        {/* OHLC legend */}
        <div className="absolute top-2 left-2 z-10 num text-[10.5px] px-2 py-1 rounded-md pointer-events-none flex items-center gap-2"
          style={{ background: "rgba(10,17,32,0.88)", border: "1px solid #1c2942", color: "#c3cfdf" }}>
          <span className="font-bold" style={{ color: "#eef3fa" }}>{symbol}</span>
          {hover ? (
            <>
              <span>O {fmt(hover.o)}</span><span>H {fmt(hover.h)}</span><span>L {fmt(hover.l)}</span>
              <span style={{ color: hover.pct >= 0 ? C.up : C.down }}>C {fmt(hover.c)}</span>
            </>
          ) : (
            <span style={{ color: "#6b7d96" }}>live - {fmt(live)}</span>
          )}
        </div>

        {/* expand / collapse */}
        <button
          data-chart-ui
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse (Esc)" : "Expand chart"}
          aria-label={expanded ? "Collapse chart" : "Expand chart to fullscreen"}
          className="absolute top-2 right-2 z-20 inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg pointer-events-auto transition-all hover:-translate-y-[1px]"
          style={{ background: "rgba(17,27,48,0.95)", border: "1px solid #2a3c5e", color: "#dde6f2", boxShadow: "0 4px 14px -6px rgba(0,0,0,0.7)" }}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        {/* back to live */}
        {!atLive && (
          <button
            data-chart-ui
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            className="absolute top-12 right-2 z-20 num text-[10px] font-bold px-2 py-1 rounded-full animate-pop pointer-events-auto"
            style={{ background: "rgba(57,197,165,0.16)", border: "1px solid rgba(57,197,165,0.55)", color: "#39c5a5" }}>
            back to live
          </button>
        )}

        {/* drag price label */}
        {dragLabel && (
          <div className="absolute z-30 num text-[11px] font-bold px-2 py-0.5 rounded pointer-events-none"
            style={{
              left: 8, top: Math.max(4, dragLabel.y - 12),
              background: dragLabel.kind === "stop" ? "rgba(224,86,79,0.92)" : "rgba(47,185,140,0.92)",
              color: "#08131f",
            }}>
            {dragLabel.kind === "stop" ? "STOP" : "TARGET"} {fmt(dragLabel.price)}
          </div>
        )}

        {firedAlert != null && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 num text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none animate-pop"
            style={{ background: "rgba(224,163,59,0.16)", border: "1px solid rgba(224,163,59,0.6)", color: "#e0a33b" }}>
            alert - {symbol} reached {fmt(firedAlert)}
          </div>
        )}

        {details && (
          <div data-chart-ui
            className="absolute z-30 rounded-lg px-2.5 py-2 num text-[10.5px] animate-pop"
            style={{
              left: details.x, top: details.y, minWidth: 138,
              background: "rgba(13,21,38,0.9)",
              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
              border: "1px solid #2a3c5e",
              boxShadow: "0 14px 34px -12px rgba(0,0,0,0.8)",
            }}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="font-bold" style={{ color: "#eef3fa" }}>{symbol}</span>
              <button onClick={() => setDetails(null)} style={{ color: "#4d5f78" }} aria-label="Close">
                <X size={11} />
              </button>
            </div>
            {([["O", details.c.o], ["H", details.c.h], ["L", details.c.l], ["C", details.c.c]] as const).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4" style={{ color: "#c3cfdf" }}>
                <span style={{ color: "#6b7d96" }}>{k}</span><span>{fmt(v)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 mt-1 pt-1" style={{ borderTop: "1px solid #1c2942" }}>
              <span style={{ color: "#6b7d96" }}>Chg</span>
              <span style={{ color: details.c.c >= details.c.o ? C.up : C.down }}>
                {details.c.o !== 0 ? ((details.c.c - details.c.o) / details.c.o * 100).toFixed(2) : "0.00"}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-4" style={{ color: "#c3cfdf" }}>
              <span style={{ color: "#6b7d96" }}>Vol</span><span>{Math.round(details.c.v).toLocaleString("en-US")}</span>
            </div>
            <p className="mt-1" style={{ color: "#4d5f78", fontSize: 9 }}>{details.t}</p>
          </div>
        )}

        {expanded && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 num text-[9.5px] px-2 py-0.5 rounded-full pointer-events-none"
            style={{ background: "rgba(10,17,32,0.85)", border: "1px solid #1c2942", color: "#4d5f78" }}>
            drag the red/green lines to adjust - Esc to collapse
          </div>
        )}
      </div>

      <ChartContextMenu
        anchor={menu}
        crosshairMagnet={magnet}
        activeTool={tool}
        hasDrawings={drawings.length > 0}
        onAction={runAction}
        onClose={() => setMenu(null)}
      />
    </motion.div>
  );
}
