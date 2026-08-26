/* Right-click menu for the trading chart.

   Presentational only: it renders items and reports clicks. Every action
   lives in TradingChart, wired to the chart API that is already there.

   Positioning is measured rather than guessed - the menu is rendered
   invisibly for one frame, measured, then flipped against whichever edge
   it would overflow. Guessing from a fixed width breaks the moment an
   item's label changes length. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Crosshair, ZoomIn, ZoomOut, RotateCcw, Ruler, TrendingUp,
  Minus, Bell, Activity, Info, Trash2,
} from "lucide-react";

export type ChartMenuAction =
  | "crosshair" | "zoomIn" | "zoomOut" | "reset"
  | "measure" | "trendLine" | "horizontalLine" | "verticalLine"
  | "priceAlert" | "indicators" | "candleDetails"
  | "clearDrawings";

export interface MenuAnchor { x: number; y: number }

interface Item {
  id: ChartMenuAction;
  label: string;
  icon: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}
interface Group { heading: string; items: Item[] }

const ICON = 13;

/* 6px of breathing room so the menu never kisses the viewport edge. */
const EDGE = 6;

export default function ChartContextMenu({
  anchor, crosshairMagnet, activeTool, hasDrawings, onAction, onClose,
}: {
  anchor: MenuAnchor | null;
  crosshairMagnet: boolean;
  activeTool: ChartMenuAction | null;
  hasDrawings: boolean;
  onAction: (a: ChartMenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const groups: Group[] = [
    {
      heading: "Chart",
      items: [
        { id: "crosshair", label: "Crosshair", icon: <Crosshair size={ICON} />, hint: crosshairMagnet ? "magnet" : "free" },
        { id: "zoomIn", label: "Zoom In", icon: <ZoomIn size={ICON} /> },
        { id: "zoomOut", label: "Zoom Out", icon: <ZoomOut size={ICON} /> },
        { id: "reset", label: "Reset", icon: <RotateCcw size={ICON} /> },
      ],
    },
    {
      heading: "Tools",
      items: [
        { id: "measure", label: "Measure", icon: <Ruler size={ICON} /> },
        { id: "trendLine", label: "Trend Line", icon: <TrendingUp size={ICON} /> },
        { id: "horizontalLine", label: "Horizontal Line", icon: <Minus size={ICON} /> },
        { id: "verticalLine", label: "Vertical Line", icon: <Minus size={ICON} style={{ transform: "rotate(90deg)" }} /> },
      ],
    },
    {
      heading: "Analysis",
      items: [
        { id: "priceAlert", label: "Price Alert", icon: <Bell size={ICON} /> },
        { id: "indicators", label: "Indicators", icon: <Activity size={ICON} /> },
        { id: "candleDetails", label: "Candle Details", icon: <Info size={ICON} /> },
      ],
    },
    {
      heading: "Drawings",
      items: [
        { id: "clearDrawings", label: "Clear Drawings", icon: <Trash2 size={ICON} />, disabled: !hasDrawings },
      ],
    },
  ];

  /* Measure then place, before the browser paints, so the menu never
     appears at one position and jumps to another. */
  useLayoutEffect(() => {
    if (!anchor) { setPos(null); return; }
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    /* Flip to the other side of the cursor when it would overflow; only
       clamp if flipping still doesn't fit (menu taller than viewport). */
    let left = anchor.x + width + EDGE > vw ? anchor.x - width : anchor.x;
    let top = anchor.y + height + EDGE > vh ? anchor.y - height : anchor.y;
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - width - EDGE));
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - height - EDGE));
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    /* Capture phase so Escape closes the menu before the chart's own
       Escape handler collapses fullscreen. */
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("contextmenu", onDown, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("contextmenu", onDown, true);
      window.removeEventListener("blur", onClose);
    };
  }, [anchor, onClose]);

  return (
    <AnimatePresence>
      {anchor && (
        <motion.div
          ref={ref}
          data-chart-ui
          role="menu"
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.09 } }}
          transition={{ type: "spring", stiffness: 620, damping: 34, mass: 0.6 }}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-[90] py-1.5 rounded-xl select-none"
          style={{
            left: pos?.left ?? anchor.x,
            top: pos?.top ?? anchor.y,
            /* Hidden until measured, so the first paint is already correct. */
            visibility: pos ? "visible" : "hidden",
            minWidth: 178,
            transformOrigin: "top left",
            background: "rgba(13,21,38,0.82)",
            backdropFilter: "blur(18px) saturate(140%)",
            WebkitBackdropFilter: "blur(18px) saturate(140%)",
            border: "1px solid #2a3c5e",
            boxShadow: "0 18px 44px -14px rgba(0,0,0,0.86), 0 0 0 1px rgba(255,255,255,0.03) inset",
          }}>
          {groups.map((g, gi) => (
            <div key={g.heading}>
              {gi > 0 && <div className="my-1 mx-2" style={{ height: 1, background: "#1c2942" }} />}
              <p className="lbl px-3 pt-1 pb-1" style={{ fontSize: 8.5, letterSpacing: "0.16em" }}>{g.heading}</p>
              {g.items.map((it) => {
                const active = activeTool === it.id;
                return (
                  <button
                    key={it.id}
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => { onAction(it.id); }}
                    className="w-full flex items-center gap-2.5 px-3 py-[5px] text-left transition-colors duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ color: active ? "#39c5a5" : "#c3cfdf", background: active ? "rgba(57,197,165,0.09)" : "transparent" }}
                    onMouseEnter={(e) => { if (!it.disabled && !active) e.currentTarget.style.background = "rgba(111,182,232,0.08)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                    <span className="inline-flex shrink-0" style={{ color: active ? "#39c5a5" : "#6b7d96" }}>{it.icon}</span>
                    <span className="text-[12px] font-medium flex-1">{it.label}</span>
                    {it.hint && <span className="num text-[9px]" style={{ color: "#4d5f78" }}>{it.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
