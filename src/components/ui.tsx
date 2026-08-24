/* UI kit - icons, primitives, toasts. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";

/* -------------------------------- icons ------------------------------ */
type IconProps = { size?: number };
const S = ({ size = 16, children }: IconProps & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const Ic = {
  logo: (p: IconProps) => <S {...p}><path d="M3 17l5-7 4 3 6-8" /><path d="M3 21h18" opacity=".45" /></S>,
  chart: (p: IconProps) => <S {...p}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></S>,
  candles: (p: IconProps) => <S {...p}><path d="M7 5v3M7 15v4M7 8h0a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z" /><path d="M17 3v3M17 14v5M17 6h0a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /></S>,
  brain: (p: IconProps) => <S {...p}><path d="M12 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0 2-5 3 3 0 0 0-2-5 3 3 0 0 0-3-3Z" /><path d="M12 4v16" opacity=".5" /></S>,
  journal: (p: IconProps) => <S {...p}><path d="M5 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" /><path d="M8 4v16" /><path d="M12 9h4M12 13h4" /></S>,
  target: (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".5" /></S>,
  practice: (p: IconProps) => <S {...p}><path d="M4 12a8 8 0 0 1 14-5" /><path d="M18 12a8 8 0 0 1-14 5" /><path d="M18 3v4h-4" /><path d="M6 21v-4h4" /></S>,
  flask: (p: IconProps) => <S {...p}><path d="M10 3v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" /><path d="M8 3h8" /><path d="M7 15h10" /></S>,
  gauge: (p: IconProps) => <S {...p}><path d="M4 14a8 8 0 0 1 16 0" /><path d="M12 14l3.5-3.5" /><path d="M4 18h16" opacity=".45" /></S>,
  scroll: (p: IconProps) => <S {...p}><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4Z" /><path d="M6 4a2 2 0 0 0-2 2v2h4" /><path d="M10 9h6M10 13h6" /></S>,
  scale: (p: IconProps) => <S {...p}><path d="M12 4v16" /><path d="M5 7l7-2 7 2" /><path d="M5 7l-2 6a3 3 0 0 0 6 0L7 7" opacity=".8" /><path d="M17 7l-2 6a3 3 0 0 0 6 0l-2-6" opacity=".8" /><path d="M8 20h8" /></S>,
  shield: (p: IconProps) => <S {...p}><path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3Z" /><path d="M9 12l2 2 4-4" /></S>,
  lock: (p: IconProps) => <S {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></S>,
  flame: (p: IconProps) => <S {...p}><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5 .5 1.5 1.5 2 1.5 2S10 5 12 3Z" /></S>,
  pause: (p: IconProps) => <S {...p}><rect x="7" y="5" width="3.5" height="14" rx="1" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" /></S>,
  x: (p: IconProps) => <S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>,
  check: (p: IconProps) => <S {...p}><path d="M5 13l4 4L19 7" /></S>,
  alert: (p: IconProps) => <S {...p}><path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v4.5M12 17.3v.2" /></S>,
  clock: (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>,
  download: (p: IconProps) => <S {...p}><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M5 19h14" /></S>,
  zap: (p: IconProps) => <S {...p}><path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" /></S>,
  trendUp: (p: IconProps) => <S {...p}><path d="M4 17l6-6 4 3 6-8" /><path d="M14 6h6v6" /></S>,
  trendDown: (p: IconProps) => <S {...p}><path d="M4 7l6 6 4-3 6 8" /><path d="M14 18h6v-6" /></S>,
};

/* -------------------------------- modal ------------------------------ */
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
          <button onClick={onClose} className="text-fog-500 hover:text-fog-200 transition-colors"><Ic.x size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------- toasts ----------------------------- */
function ToastItem({ id, tone, text }: { id: string; tone: string; text: string }) {
  const { dispatch } = useApp();
  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: "DISMISS_TOAST", id }), tone === "down" ? 6500 : 4200);
    return () => clearTimeout(t);
  }, [id, tone, dispatch]);
  const color = tone === "ok" ? "#2fb98c" : tone === "warn" ? "#e0a33b" : tone === "down" ? "#e0564f" : "#6fb6e8";
  return (
    <div className="animate-pop pointer-events-auto relative overflow-hidden"
      style={{ background: "#0e1729", border: "1px solid " + color + "55", borderRadius: 10, padding: "9px 14px", minWidth: 240, maxWidth: 420, boxShadow: "0 14px 34px -18px rgba(0,0,0,0.9)" }}>
      <p className="text-[12px] leading-snug text-fog-200">{text}</p>
      <span className="absolute bottom-0 left-0 h-[2px]" style={{ background: color, animation: "toastbar linear forwards", animationDuration: tone === "down" ? "6.5s" : "4.2s" }} />
    </div>
  );
}
export function Toasts() {
  const { state } = useApp();
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[95] flex flex-col gap-2 items-center pointer-events-none">
      {state.toasts.slice(-3).map((t) => <ToastItem key={t.id} id={t.id} tone={t.tone} text={t.text} />)}
    </div>
  );
}

/* ------------------------------ primitives --------------------------- */
export function Bar({ value, color = "#39c5a5", h = 5 }: { value: number; color?: string; h?: number }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ background: "#16213a", height: h }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: Math.max(0, Math.min(100, value * 100)) + "%", background: color }} />
    </div>
  );
}

export function Spark({ data, w = 56, h = 20 }: { data: number[]; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => ((i / (data.length - 1)) * w).toFixed(1) + "," + (h - 2 - ((v - min) / r) * (h - 4)).toFixed(1)).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts} fill="none" stroke={up ? "#2fb98c" : "#e0564f"} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function Gauge({ value, size = 54 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? "#2fb98c" : value >= 45 ? "#e0a33b" : "#e0564f";
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16213a" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value / 100)))}
        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.4s" }} />
    </svg>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 group" role="switch" aria-checked={on}>
      <span className="relative inline-block w-[34px] h-[19px] rounded-full transition-colors duration-200"
        style={{ background: on ? "#39c5a5" : "#24344f" }}>
        <span className="absolute top-[2px] w-[15px] h-[15px] rounded-full transition-all duration-200"
          style={{ left: on ? 17 : 2, background: on ? "#062019" : "#93a3ba" }} />
      </span>
      {label && <span className={"text-[11px] font-semibold transition-colors " + (on ? "text-teal" : "text-fog-500 group-hover:text-fog-300")}>{label}</span>}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 p-1 rounded-lg" style={{ background: "#0a1120", border: "1px solid #1c2942", gridTemplateColumns: "repeat(" + options.length + ", 1fr)" }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className="py-1.5 rounded-md text-[12px] font-semibold capitalize transition-all duration-150"
          style={value === o.id ? { background: "#24344f", color: "#eef3fa" } : { color: "#6b7d96" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Flash-on-change number. */
export function Flash({ value, format, className = "" }: { value: number; format: (n: number) => string; className?: string }) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (value === prev.current) return;
    setCls(value > prev.current ? "flash-up" : "flash-down");
    prev.current = value;
    const t = setTimeout(() => setCls(""), 560);
    return () => clearTimeout(t);
  }, [value]);
  return <span className={"num " + cls + " " + className} style={{ borderRadius: 4, padding: "0 3px" }}>{format(value)}</span>;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-10 animate-fade-in">
      <p className="font-display font-semibold text-[15px] text-fog-300 mb-1.5">{title}</p>
      <p className="text-[12px] text-fog-500 max-w-[380px] mx-auto leading-relaxed">{body}</p>
    </div>
  );
}

/* ------------------------------ formatters --------------------------- */
export const fmtPx = (v: number, d = 2): string => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtSigned = (v: number, digits = 0): string =>
  (v >= 0 ? "+$" : "-$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtR = (r: number): string => (r >= 0 ? "+" : "") + r.toFixed(2) + "R";
