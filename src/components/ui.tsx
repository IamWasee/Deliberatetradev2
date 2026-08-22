/* DeliberateTrade UI kit — icons drawn inline, primitives with feedback. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";

/* ------------------------------- icons ------------------------------ */
const S = ({ children, size = 16, className, style }: { children: ReactNode; size?: number; className?: string; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    {children}
  </svg>
);

export const Ic = {
  logo: (p: { size?: number }) => (
    <S {...p}><path d="M3 17l5-6 4 3 6-8" /><path d="M3 21h18" opacity=".4" /><circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none" /></S>
  ),
  candles: (p: { size?: number }) => (
    <S {...p}><path d="M7 4v3M7 15v3M7 7h0a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM17 6v2M17 18v2M17 8h0a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" /></S>
  ),
  gauge: (p: { size?: number }) => (
    <S {...p}><path d="M12 15l3.5-5.5" /><path d="M4 17a9 9 0 1 1 16 0" /></S>
  ),
  journal: (p: { size?: number }) => (
    <S {...p}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /><path d="M9 8h6" /></S>
  ),
  target: (p: { size?: number }) => (
    <S {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></S>
  ),
  flask: (p: { size?: number }) => (
    <S {...p}><path d="M10 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19L14 9V3" /><path d="M8.5 3h7" /><path d="M7.5 15h9" /></S>
  ),
  flag: (p: { size?: number }) => (
    <S {...p}><path d="M5 21V4" /><path d="M5 4c4-2 7 2 14 0v9c-7 2-10-2-14 0" /></S>
  ),
  scroll: (p: { size?: number }) => (
    <S {...p}><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M6 4a2 2 0 0 0-2 2v2h4" /><path d="M10 9h7M10 13h7" /></S>
  ),
  scale: (p: { size?: number }) => (
    <S {...p}><path d="M12 3v18M7 21h10" /><path d="M4 7h16" /><path d="M6 7l-3 6a3.2 3.2 0 0 0 6 0zM18 7l-3 6a3.2 3.2 0 0 0 6 0z" /></S>
  ),
  lock: (p: { size?: number }) => (<S {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></S>),
  alert: (p: { size?: number }) => (<S {...p}><path d="M12 4 2.8 20h18.4z" /><path d="M12 10v4.5M12 17.3v.2" /></S>),
  check: (p: { size?: number }) => (<S {...p}><path d="M4.5 12.5l5 5 10-11" /></S>),
  x: (p: { size?: number }) => (<S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>),
  flame: (p: { size?: number }) => (<S {...p}><path d="M12 3s5.5 4.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 7.6 12 3 12 3z" /><path d="M12 12s2.3 1.8 2.3 3.8a2.3 2.3 0 0 1-4.6 0C9.7 13.8 12 12 12 12z" /></S>),
  clock: (p: { size?: number }) => (<S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>),
  pause: (p: { size?: number }) => (<S {...p}><rect x="7" y="5" width="3.4" height="14" rx="1" /><rect x="13.6" y="5" width="3.4" height="14" rx="1" /></S>),
  brain: (p: { size?: number }) => (<S {...p}><path d="M9.5 4A2.7 2.7 0 0 0 7 6.7 3.2 3.2 0 0 0 4.5 10 3.3 3.3 0 0 0 6 15.6 3 3 0 0 0 9.5 20c1 0 2.5-.5 2.5-2V6c0-1.5-1.5-2-2.5-2z" /><path d="M14.5 4A2.7 2.7 0 0 1 17 6.7 3.2 3.2 0 0 1 19.5 10 3.3 3.3 0 0 1 18 15.6 3 3 0 0 1 14.5 20c-1 0-2.5-.5-2.5-2V6c0-1.5 1.5-2 2.5-2z" /></S>),
  download: (p: { size?: number }) => (<S {...p}><path d="M12 4v11M7.5 11l4.5 4.5L16.5 11" /><path d="M4.5 20h15" /></S>),
  shield: (p: { size?: number }) => (<S {...p}><path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></S>),
  eye: (p: { size?: number }) => (<S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></S>),
  bolt: (p: { size?: number }) => (<S {...p}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" /></S>),
  arrowUp: (p: { size?: number }) => (<S {...p}><path d="M12 19V5M6 11l6-6 6 6" /></S>),
  arrowDown: (p: { size?: number }) => (<S {...p}><path d="M12 5v14M6 13l6 6 6-6" /></S>),
};

/* ------------------------------ formats ----------------------------- */
export const fmtPx = (n: number, dec = 2) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtSigned = (n: number, dec = 0) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
export const fmtR = (r: number) => `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}R`;

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(5,9,17,0.82)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`panel w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto animate-pop`} style={{ background: "#0e1729" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line sticky top-0 z-10" style={{ background: "#0e1729" }}>
          <h3 className="font-display font-semibold text-[15px] text-fog-100">{title}</h3>
          <button onClick={onClose} className="text-fog-500 hover:text-fog-200 transition-colors"><Ic.x size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------- bar ------------------------------- */
export function Bar({ value, color = "#39c5a5", h = 5 }: { value: number; color?: string; h?: number }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ background: "#16213a", height: h }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

/* ------------------------------- gauge ------------------------------ */
export function Gauge({ value, label, size = 120 }: { value: number; label: string; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(100, value)) / 100;
  const color = value >= 75 ? "#2fb98c" : value >= 50 ? "#e0a33b" : "#e0564f";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#16213a" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="8" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac * 0.75)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.4s" }} />
      </svg>
      <div className="absolute text-center">
        <div className="num font-semibold text-fog-100" style={{ fontSize: size / 4.4 }}>{Math.round(value)}</div>
        <div className="lbl !text-[8.5px]">{label}</div>
      </div>
    </div>
  );
}

/* ------------------------------ sparkline --------------------------- */
export function Spark({ data, w = 48, h = 18 }: { data: number[]; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / range) * (h - 4)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts} fill="none" stroke={up ? "#2fb98c" : "#e0564f"} strokeWidth="1.3" />
    </svg>
  );
}

/* --------------------------- flash number --------------------------- */
export function Flash({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const prev = useRef(value);
  const [dir, setDir] = useState<"" | "up" | "down">("");
  useEffect(() => {
    if (value > prev.current) setDir("up");
    else if (value < prev.current) setDir("down");
    prev.current = value;
    if (value !== prev.current || dir) {
      const t = setTimeout(() => setDir(""), 500);
      return () => clearTimeout(t);
    }
  }, [value, dir]);
  return <span key={dir + value} className={`${className ?? ""} ${dir === "up" ? "flash-up" : dir === "down" ? "flash-down" : ""}`} style={{ borderRadius: 4, padding: "0 2px" }}>{format(value)}</span>;
}

/* ------------------------------- toggle ----------------------------- */
export function Toggle({ on, onChange, label, danger }: { on: boolean; onChange: () => void; label?: string; danger?: boolean }) {
  return (
    <button onClick={onChange} className="flex items-center gap-2 group" type="button">
      {label && <span className="lbl group-hover:text-fog-300 transition-colors">{label}</span>}
      <span className="relative inline-block w-[34px] h-[18px] rounded-full transition-colors duration-200"
        style={{ background: on ? (danger ? "rgba(224,86,79,0.75)" : "rgba(57,197,165,0.75)") : "#1c2942" }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-fog-100 transition-all duration-200"
          style={{ left: on ? 18 : 2 }} />
      </span>
    </button>
  );
}

/* ----------------------------- segmented ---------------------------- */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-1 rounded-lg gap-1" style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all duration-150"
          style={value === o.id ? { background: "#24344f", color: "#eef3fa" } : { color: "#6b7d96" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- empty ----------------------------- */
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-8 animate-fade-in">
      <p className="font-display font-semibold text-[14px] text-fog-300 mb-1">{title}</p>
      <p className="text-[12px] text-fog-500 max-w-[340px] mx-auto leading-relaxed">{body}</p>
    </div>
  );
}

/* ------------------------------- toasts ----------------------------- */
const TONE_COLOR: Record<string, string> = { ok: "#2fb98c", warn: "#e0a33b", down: "#e0564f", info: "#6fb6e8" };
const TONE_MS: Record<string, number> = { ok: 3800, warn: 5200, down: 6200, info: 4200 };

function ToastItem({ id, tone, text }: { id: string; tone: string; text: string }) {
  const { dispatch } = useApp();
  const life = TONE_MS[tone] ?? 4200;
  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: "DISMISS_TOAST", id }), life);
    return () => clearTimeout(t); // each toast owns its own timer
  }, [dispatch, id, life]);
  const color = TONE_COLOR[tone];
  return (
    <div className="relative overflow-hidden pointer-events-auto animate-pop rounded-lg px-3.5 py-2.5 flex items-start gap-2.5 max-w-[400px]"
      style={{ background: "rgba(10,17,32,0.96)", border: `1px solid ${color}55`, boxShadow: "0 12px 32px -12px rgba(0,0,0,0.7)" }}>
      <span className="mt-[3px] shrink-0" style={{ color }}>{tone === "ok" ? <Ic.check size={14} /> : tone === "info" ? <Ic.bolt size={14} /> : <Ic.alert size={14} />}</span>
      <p className="text-[12px] leading-snug text-fog-200 pr-4">{text}</p>
      <button onClick={() => dispatch({ type: "DISMISS_TOAST", id })}
        className="absolute top-1.5 right-1.5 text-fog-600 hover:text-fog-200 transition-colors"><Ic.x size={11} /></button>
      <span className="absolute bottom-0 left-0 h-[2px]" style={{ background: color, animation: `toastbar ${life}ms linear forwards` }} />
    </div>
  );
}

export function Toasts() {
  const { state } = useApp();
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 items-center pointer-events-none">
      {state.toasts.slice(-3).map((t) => <ToastItem key={t.id} id={t.id} tone={t.tone} text={t.text} />)}
    </div>
  );
}
