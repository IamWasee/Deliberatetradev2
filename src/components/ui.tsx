import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";

/* ------------------------------- modal ------------------------------ */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(5,9,17,0.82)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`panel relative w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto animate-pop`} style={{ background: "#0e1729" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line sticky top-0 z-10" style={{ background: "#0e1729", borderColor: "#16213a" }}>
          <h3 className="font-display font-semibold text-[15px] text-fog-100">{title}</h3>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- toasts ----------------------------- */
function ToastItem({ id, tone, text }: { id: string; tone: string; text: string }) {
  const { dispatch } = useApp();
  useEffect(() => {
    const ms = tone === "down" ? 5200 : 3800;
    const t = setTimeout(() => dispatch({ type: "DISMISS_TOAST", id }), ms);
    return () => clearTimeout(t);
  }, [id, tone, dispatch]);
  const color = tone === "ok" ? "#2fb98c" : tone === "warn" ? "#e0a33b" : tone === "down" ? "#e0564f" : "#6fb6e8";
  return (
    <button onClick={() => dispatch({ type: "DISMISS_TOAST", id })}
      className="relative overflow-hidden max-w-[420px] text-left px-3.5 py-2.5 rounded-lg animate-pop"
      style={{ background: "#0e1729", border: `1px solid ${color}55`, boxShadow: "0 12px 30px -12px rgba(0,0,0,0.7)" }}>
      <span className="block text-[12px] leading-snug text-fog-200">{text}</span>
      <span className="absolute bottom-0 left-0 h-[2px]" style={{ background: color, animation: "toastbar linear forwards", animationDuration: "3.8s" }} />
    </button>
  );
}
export function Toasts() {
  const { state } = useApp();
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[95] flex flex-col gap-2 items-center pointer-events-auto">
      {state.toasts.slice(-3).map((t) => <ToastItem key={t.id} id={t.id} tone={t.tone} text={t.text} />)}
    </div>
  );
}

/* ------------------------------- spark ------------------------------ */
export function Spark({ data, w = 44, h = 18 }: { data: number[]; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data);
  const range = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - lo) / range) * h}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts} fill="none" stroke={up ? "#2fb98c" : "#e0564f"} strokeWidth={1.2} />
    </svg>
  );
}

/* ------------------------------- gauge ------------------------------ */
export function Gauge({ value, size = 74, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 6, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / 100));
  const color = value >= 70 ? "#2fb98c" : value >= 45 ? "#e0a33b" : "#e0564f";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#16213a" strokeWidth={6} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.4s" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num font-semibold text-fog-100" style={{ fontSize: size * 0.24 }}>{value}</span>
        {label && <span className="lbl !text-[7.5px] mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ formatters --------------------------- */
export const fmtSigned = (v: number, digits = 0): string =>
  `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const fmtR = (r: number): string => `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`;
export const fmtPx = (v: number, d = 2): string => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/* --------------------------- flash number ---------------------------- */
export function Flash({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value !== prev) {
      setDir(value > prev ? "up" : "down");
      setPrev(value);
      const t = setTimeout(() => setDir(null), 560);
      return () => clearTimeout(t);
    }
  }, [value, prev]);
  return <span className={`num rounded px-0.5 ${dir === "up" ? "flash-up" : dir === "down" ? "flash-down" : ""} ${className ?? ""}`}>{format(value)}</span>;
}
