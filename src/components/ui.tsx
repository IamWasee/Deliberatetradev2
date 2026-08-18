import React, { useEffect, useRef, useState } from "react";
import type { Toast } from "../lib/types";

/* ------------------------------ icons ----------------------------- */
type IconProps = { size?: number; className?: string; strokeWidth?: number };
const I = ({ d, size = 17, className = "", strokeWidth = 1.7, filled = false }: IconProps & { d: string; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
export const Ic = {
  logo: (p: IconProps) => (
    <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 32 32" className={p.className}>
      <rect width="32" height="32" rx="7" fill="#111b30" />
      <rect x="7" y="14" width="4" height="10" rx="1" fill="#39c5a5" />
      <rect x="14" y="9" width="4" height="13" rx="1" fill="#eef3fa" />
      <rect x="21" y="5" width="4" height="14" rx="1" fill="#39c5a5" />
      <rect x="5" y="25" width="22" height="2.2" rx="1" fill="#e0a33b" />
    </svg>
  ),
  dash: (p: IconProps) => <I {...p} d="M4 4h7v9H4zM13 4h7v5h-7zM13 12h7v8h-7zM4 16h7v4H4z" />,
  candles: (p: IconProps) => <I {...p} d="M7 3v4M7 15v6M5 7h4v8H5zM17 3v3M17 13v8M15 6h4v7h-4z" />,
  book: (p: IconProps) => <I {...p} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 5.5v15M20 18v3H6.5" />,
  target: (p: IconProps) => <I {...p} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" />,
  grad: (p: IconProps) => <I {...p} d="M3 8.5 12 4l9 4.5-9 4.5zM7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11M21 9v5" />,
  scroll: (p: IconProps) => <I {...p} d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 8.5h8M8 12h8M8 15.5h5" />,
  flame: (p: IconProps) => <I {...p} d="M12 3c1 3-3 4.5-3 8a3.5 3.5 0 0 0 7 0c0-1.5-.7-2.6-1.5-3.6C15.5 9 18 10.5 18 14a6 6 0 0 1-12 0c0-5 5-6.5 6-11z" />,
  lock: (p: IconProps) => <I {...p} d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6zM12 14.5v2" />,
  x: (p: IconProps) => <I {...p} d="M6 6l12 12M18 6L6 18" />,
  check: (p: IconProps) => <I {...p} d="M5 12.5 10 17.5 19 7" />,
  alert: (p: IconProps) => <I {...p} d="M12 4 2.8 20h18.4zM12 10v4.5M12 17.3v.2" />,
  zap: (p: IconProps) => <I {...p} d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />,
  clock: (p: IconProps) => <I {...p} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v4.5l3 1.8" />,
  down: (p: IconProps) => <I {...p} d="M12 4v13m0 0 5-5m-5 5-5-5" />,
  brain: (p: IconProps) => <I {...p} d="M9.5 4A2.5 2.5 0 0 0 7 6.5c-1.7.3-3 1.7-3 3.5 0 .9.3 1.7.9 2.3A3.5 3.5 0 0 0 7 18.5 2.8 2.8 0 0 0 9.8 21c1 0 1.7-.3 2.2-.9V5a2.6 2.6 0 0 0-2.5-1zM14.5 4A2.5 2.5 0 0 1 17 6.5c1.7.3 3 1.7 3 3.5 0 .9-.3 1.7-.9 2.3A3.5 3.5 0 0 1 17 18.5 2.8 2.8 0 0 1 14.2 21c-1 0-1.7-.3-2.2-.9V5a2.6 2.6 0 0 1 2.5-1z" />,
  pause: (p: IconProps) => <I {...p} d="M9 5v14M15 5v14" />,
  export: (p: IconProps) => <I {...p} d="M12 3v11m0-11L8 7m4-4 4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />,
  plus: (p: IconProps) => <I {...p} d="M12 5v14M5 12h14" />,
  pulse: (p: IconProps) => <I {...p} d="M3 12h4l2.5-6 4 12L16 12h5" />,
};

/* ------------------------------ modal ----------------------------- */
export function Modal({ open, onClose, title, children, wide = false, locked = false }: {
  open: boolean; onClose?: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean; locked?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(5,9,17,0.78)", backdropFilter: "blur(3px)" }}>
      <div className={`panel w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[88vh] overflow-y-auto animate-pop shadow-2xl`} style={{ background: "#0e1729" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line sticky top-0 z-10" style={{ background: "#0e1729" }}>
          <h3 className="font-display font-semibold text-[15px] text-fog-100">{title}</h3>
          {!locked && onClose && (
            <button onClick={onClose} className="text-fog-500 hover:text-fog-100 transition-colors p-1 rounded-md hover:bg-ink-700"><Ic.x size={16} /></button>
          )}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------ gauge ----------------------------- */
export function Gauge({ value, size = 118, label, tone }: { value: number; size?: number; label: string; tone?: string }) {
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const filled = arc * Math.min(1, Math.max(0, value / 100));
  const color = tone ?? (value >= 80 ? "#2fb98c" : value >= 55 ? "#e0a33b" : "#e0564f");
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-[225deg]">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a2740" strokeWidth="8" strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.5s" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-semibold text-fog-100" style={{ fontSize: size / 4.4 }}>{Math.round(value)}</span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-fog-500">/ 100</span>
        </div>
      </div>
      <span className="lbl">{label}</span>
    </div>
  );
}

/* ------------------------------ bars ------------------------------ */
export function Bar({ value, color = "#39c5a5", h = 5 }: { value: number; color?: string; h?: number }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ background: "#16213a", height: h }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color, transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
    </div>
  );
}

/* --------------------------- flash number ------------------------- */
export function Flash({ value, format, className = "" }: { value: number; format: (n: number) => string; className?: string }) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (value !== prev.current) {
      setCls(value > prev.current ? "animate-flash-up" : "animate-flash-down");
      prev.current = value;
      const t = setTimeout(() => setCls(""), 700);
      return () => clearTimeout(t);
    }
  }, [value]);
  return <span className={`num rounded px-1 -mx-1 ${cls} ${className}`}>{format(value)}</span>;
}

/* ---------------------------- sparkline --------------------------- */
export function Spark({ data, w = 72, h = 24, color }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  const c = color ?? (data[data.length - 1] >= data[0] ? "#2fb98c" : "#e0564f");
  return (
    <svg width={w} height={h} className="block">
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/* ----------------------------- toggle ----------------------------- */
export function Toggle({ on, onChange, danger = false }: { on: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <button onClick={() => onChange(!on)} className="relative rounded-full transition-colors duration-200 shrink-0"
      style={{ width: 36, height: 20, background: on ? (danger ? "#e0564f" : "#39c5a5") : "#24344f" }}>
      <span className="absolute top-[2px] rounded-full bg-fog-100 transition-all duration-200"
        style={{ width: 16, height: 16, left: on ? 18 : 2 }} />
    </button>
  );
}

/* --------------------------- segmented ---------------------------- */
export function Segmented<T extends string>({ options, value, onChange, size = "sm" }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg p-[3px] gap-[2px]" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md font-semibold transition-all duration-150 ${size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[13px]"} ${value === o.id ? "text-ink-950" : "text-fog-400 hover:text-fog-200"}`}
          style={value === o.id ? { background: "#39c5a5" } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- toasts ----------------------------- */
const TOAST_TONE: Record<Toast["kind"], string> = { ok: "#2fb98c", warn: "#e0a33b", bad: "#e0564f", info: "#6fb6e8" };
const TOAST_LIFE = 4200;

/**
 * Sits top-center (below the top bar) so it never covers the order ticket or
 * primary buttons. Each toast owns its own timer + visible countdown bar, so
 * new notifications can no longer keep old ones alive forever.
 */
export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-[92px] z-[60] flex flex-col items-center gap-2 w-[min(400px,92vw)] pointer-events-none">
      {toasts.slice(-3).map((t) => (
        <ToastItem key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  const tone = TOAST_TONE[toast.kind];
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), TOAST_LIFE);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button onClick={() => dismiss(toast.id)}
      className="pointer-events-auto relative w-full text-left px-3.5 py-2.5 pb-3 flex items-start gap-2.5 animate-pop cursor-pointer overflow-hidden rounded-xl"
      style={{ background: "rgba(14,23,41,0.96)", border: "1px solid #1c2942", borderLeft: `3px solid ${tone}`, boxShadow: "0 12px 32px -12px rgba(0,0,0,0.65)" }}>
      <span className="mt-[3px] shrink-0" style={{ color: tone }}>
        {toast.kind === "ok" ? <Ic.check size={14} /> : toast.kind === "bad" ? <Ic.alert size={14} /> : toast.kind === "warn" ? <Ic.alert size={14} /> : <Ic.zap size={14} />}
      </span>
      <span className="text-[12.5px] leading-snug text-fog-200 pr-1">{toast.text}</span>
      <span className="absolute bottom-0 left-0 h-[3px] rounded-r-full" style={{ background: tone, animation: `toastbar ${TOAST_LIFE}ms linear forwards` }} />
    </button>
  );
}

/* ---------------------------- helpers ----------------------------- */
export const fmtUsd = (n: number, digits = 2) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const fmtSigned = (n: number, digits = 2) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const fmtR = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
export const fmtPx = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 gap-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-fog-500" style={{ background: "#111b30", border: "1px solid #1c2942" }}>
        <Ic.pulse size={19} />
      </div>
      <p className="font-display font-semibold text-fog-200 text-[14px]">{title}</p>
      <p className="text-[12.5px] text-fog-500 max-w-[340px] leading-relaxed">{body}</p>
    </div>
  );
}
