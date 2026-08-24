/* GuidedTour — phase 1 spotlights the live UI, phase 2 teaches candles. */
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";
import type { View } from "../lib/types";
import { Ic } from "./ui";

interface Step { id: string; target?: string; view?: View; title: string; body: string }

const WALKTHROUGH: Step[] = [
  { id: "welcome", title: "Welcome to your desk", body: "This is not a game and not a casino — it's a flight simulator for trading. Before you touch any button, I'll show you what everything does and why it exists. Two minutes now saves real money later." },
  { id: "nav", target: '[data-tour="nav"]', title: "Your eight rooms", body: "Terminal = trade. Debrief = process dashboard (process first, P&L second). Journal = mandatory after every close. Practice = missions from your weakest area. Playground = the math lab. Readiness = your graduation report. My Plan = the contract you signed. Legal = the fine print. A badge on Journal means un-filed journals wait." },
  { id: "equity", target: '[data-tour="equity"]', title: "Equity & session result", body: "Your total account value, live. Next to it: today's session P&L. Watch it, but don't chase it — the Process ring next to it matters more than the dollars." },
  { id: "riskmeter", target: '[data-tour="riskmeter"]', title: "The risk meter", body: "How much of your allowed open risk is deployed. When it nears red, the engine stops new trades. Glance at it before every order — it's your earliest warning system." },
  { id: "process", target: '[data-tour="process"]', title: "Your Process Score", body: "0–100. Weighted: risk adherence 30 · post-loss behavior 25 · sizing 15 · setups 15 · emotional awareness 10 · journal quality 5. Post-loss discipline is the star — revenge trading is what blows accounts. This number, not P&L, predicts real-money survival." },
  { id: "controls", target: '[data-tour="controls"]', title: "Stress, friction & the session", body: "STRESS arms random adverse 2–3% moves against your open positions — train with it on. Friction sets fill realism (Easy → Brutal). 'End session' closes everything and opens a fresh day with new missions." },
  { id: "ticker", target: '[data-tour="ticker"]', title: "The tape", body: "Live prices for everything tradable. Click a symbol to jump to its chart. The % shows the move since session open." },
  { id: "watchlist", target: '[data-tour="watchlist"]', view: "terminal", title: "Watchlist", body: "Your instruments with a sparkline of recent action. Teal dot = you hold a position. Click one to load it into the chart and order ticket." },
  { id: "chart", target: '[data-tour="chart"]', view: "terminal", title: "The chart", body: "Green candle = buyers won that window; red = sellers. Drag to pan history, scroll to zoom — the price axis rescales to whatever you're looking at. The ⤢ button expands it fullscreen (Esc to return). When you're in a trade, grab the red STOP or green TARGET line and drag it — the new level saves on release. Indicators (SMA/EMA/RSI/MACD/Bollinger/VWAP/ATR) come from these exact candles. The REGIME chip says trend, range or chop — trade the regime you're in." },
  { id: "ticket", target: '[data-tour="ticket"]', view: "terminal", title: "The order ticket — read slowly", body: "Every order forces discipline: side, hard stop, and size computed from your plan's risk % — not a gut feeling. Oversizing demands an explicit 'I am breaking my risk rule' checkbox. The Check-in button opens the emotional check-in; no order goes in without it." },
  { id: "news", target: '[data-tour="news"]', view: "terminal", title: "News wire", body: "Headlines arrive randomly and move that symbol's price. Lesson: news is noise you can't predict — your stop is the only thing that protects you from it." },
  { id: "tilt", title: "The Tilt Detector", body: "Six signals are scored from your trade log: sizing up after a loss, re-entering within minutes of a stop-out, abandoning your setups after a red streak, breaking rules after a loss, overtrading bursts, and revenge direction-flips. Strong evidence pauses trading and hits your Post-Loss component — the 25% slice of Process Score that separates survivors." },
  { id: "rules", title: "The guardrails that keep you alive", body: "(1) Circuit breaker: hit your daily loss limit and trading locks until a mandatory review. (2) Tilt cool-downs after revenge patterns. (3) Mandatory journal after every close — nonsense is rejected. (4) Stress injections test whether you'll hold a stop. Restrictive? That's the point." },
  { id: "to-school", title: "One more thing: learn the candles", body: "You can't trade what you can't read. Next: a controlled chart showing exactly what a candle is, the patterns that matter, and how to think before entry — with quick quizzes. Skip it if you know this cold." },
];

function CandleSVG({ o, h, l, c, w = 60, hgt = 120, showLabels = false }: { o: number; h: number; l: number; c: number; w?: number; hgt?: number; showLabels?: boolean }) {
  const up = c >= o;
  const col = up ? "#2fb98c" : "#e0564f";
  const lo = Math.min(o, c), hi = Math.max(o, c);
  const range = h - l || 1;
  const Y = (v: number) => hgt - 10 - ((v - l) / range) * (hgt - 20);
  const cx = showLabels ? w * 0.38 : w / 2;
  const bw = w * 0.34;
  return (
    <svg width={w} height={hgt} className="shrink-0">
      <line x1={cx} y1={Y(h)} x2={cx} y2={Y(l)} stroke={col} strokeWidth={1.6} />
      <rect x={cx - bw / 2} y={Y(hi)} width={bw} height={Math.max(2, Math.abs(Y(lo) - Y(hi)))} fill={col} rx={1.5} />
      {showLabels && (
        <g style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "#93a3ba" }}>
          <line x1={cx + bw / 2} y1={Y(h)} x2={cx + bw / 2 + 14} y2={Y(h)} stroke="#3a4c6e" strokeDasharray="2 2" /><text x={cx + bw / 2 + 17} y={Y(h) + 3}>high</text>
          <line x1={cx + bw / 2} y1={Y(l)} x2={cx + bw / 2 + 14} y2={Y(l)} stroke="#3a4c6e" strokeDasharray="2 2" /><text x={cx + bw / 2 + 17} y={Y(l) + 3}>low</text>
          <line x1={cx - bw / 2} y1={Y(hi)} x2={cx - bw / 2 - 14} y2={Y(hi)} stroke="#3a4c6e" strokeDasharray="2 2" /><text x={cx - bw / 2 - 17} y={Y(hi) + 3} textAnchor="end">{up ? "close" : "open"}</text>
          <line x1={cx - bw / 2} y1={Y(lo)} x2={cx - bw / 2 - 14} y2={Y(lo)} stroke="#3a4c6e" strokeDasharray="2 2" /><text x={cx - bw / 2 - 17} y={Y(lo) + 3} textAnchor="end">{up ? "open" : "close"}</text>
        </g>
      )}
    </svg>
  );
}

interface MiniCandle { o: number; h: number; l: number; c: number }
function MiniChart({ data, h = 150, lines = [], marks = [] }: {
  data: MiniCandle[]; h?: number;
  lines?: { price: number; color: string; label?: string }[];
  marks?: { i: number; text: string; color: string }[];
}) {
  const w = 340;
  const all = data.flatMap((d) => [d.h, d.l]).concat(lines.map((l) => l.price));
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const Y = (v: number) => h - 8 - ((v - min) / range) * (h - 16);
  const bw = w / data.length;
  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {lines.map((l, i) => (
        <g key={i}>
          <line x1={0} y1={Y(l.price)} x2={w} y2={Y(l.price)} stroke={l.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
          {l.label && <text x={w - 4} y={Y(l.price) - 3} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: l.color }}>{l.label}</text>}
        </g>
      ))}
      {data.map((d, i) => {
        const up = d.c >= d.o;
        const col = up ? "#2fb98c" : "#e0564f";
        const cx = i * bw + bw / 2;
        const lo = Math.min(d.o, d.c), hi = Math.max(d.o, d.c);
        return (
          <g key={i}>
            <line x1={cx} y1={Y(d.h)} x2={cx} y2={Y(d.l)} stroke={col} strokeWidth={1.4} />
            <rect x={cx - bw * 0.3} y={Y(hi)} width={bw * 0.6} height={Math.max(2, Math.abs(Y(lo) - Y(hi)))} fill={col} rx={1} />
            {marks.filter((m) => m.i === i).map((m, mi) => (
              <text key={mi} x={cx} y={Y(d.h) - 6} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: m.color }}>{m.text}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const TREND: MiniCandle[] = [
  { o: 50, h: 53, l: 49, c: 52 }, { o: 52, h: 55, l: 51, c: 54 }, { o: 54, h: 55, l: 51.5, c: 52 },
  { o: 52, h: 56, l: 51.8, c: 55.5 }, { o: 55.5, h: 59, l: 55, c: 58 }, { o: 58, h: 60, l: 57, c: 59.5 },
  { o: 59.5, h: 62, l: 58.8, c: 61 }, { o: 61, h: 61.5, l: 58, c: 58.5 }, { o: 58.5, h: 63, l: 58, c: 62.4 },
  { o: 62.4, h: 65, l: 62, c: 64.5 },
];
const REVERSAL: MiniCandle[] = [
  { o: 60, h: 62, l: 59.5, c: 61.5 }, { o: 61.5, h: 63, l: 61, c: 62.5 }, { o: 62.5, h: 63.5, l: 60, c: 60.5 },
  { o: 60.5, h: 61, l: 57, c: 57.5 }, { o: 57.5, h: 58, l: 53, c: 53.5 }, { o: 53.5, h: 54.5, l: 49, c: 49.5 },
  { o: 49.5, h: 50, l: 46, c: 46.5 }, { o: 46.5, h: 48.5, l: 46, c: 48 }, { o: 48, h: 49, l: 44, c: 44.5 },
  { o: 44.5, h: 45, l: 41.5, c: 42 },
];

type SchoolStep =
  | { kind: "lesson"; title: string; body: string; visual: () => ReactNode }
  | { kind: "quiz"; q: string; options: string[]; correct: number; explain: string; chart?: () => ReactNode };

const SCHOOL_STEPS: SchoolStep[] = [
  {
    kind: "lesson", title: "Anatomy of a candle",
    body: "One candle is a story of a time window. The thick body spans open→close; the thin wicks show how far price pushed before being rejected. Body near the top = buyers controlled it. Long wicks = a fight happened and one side lost.",
    visual: () => (
      <div className="flex items-center justify-center gap-10 py-2">
        <CandleSVG o={40} h={52} l={38} c={50} showLabels />
        <CandleSVG o={50} h={52} l={38} c={40} showLabels />
      </div>
    ),
  },
  {
    kind: "lesson", title: "Green vs red — who won?",
    body: "Green: close above open, buyers won the window. Red: sellers won. Don't judge by color alone — judge by where the close sits inside the full range and how long the wicks are.",
    visual: () => (
      <div className="flex items-end justify-center gap-12 py-2">
        <div className="text-center"><CandleSVG o={42} h={53} l={41} c={52} /><p className="num text-[10px] text-up mt-1">buyers</p></div>
        <div className="text-center"><CandleSVG o={52} h={53} l={41} c={42} /><p className="num text-[10px] text-down mt-1">sellers</p></div>
      </div>
    ),
  },
  {
    kind: "lesson", title: "Wicks are rejections",
    body: "A long lower wick: price dove, then buyers pushed it back up — demand lives below. A long upper wick: supply lives above. Wicks at the edge of a move are the market showing its hand.",
    visual: () => (
      <div className="flex items-end justify-center gap-12 py-2">
        <div className="text-center"><CandleSVG o={46} h={47.5} l={36} c={47} /><p className="num text-[10px] text-up mt-1">buyers rejected lows</p></div>
        <div className="text-center"><CandleSVG o={47} h={55} l={46} c={46.5} /><p className="num text-[10px] text-down mt-1">sellers rejected highs</p></div>
      </div>
    ),
  },
  {
    kind: "lesson", title: "Three patterns worth knowing",
    body: "Hammer: small body on top, long lower wick after a fall. Engulfing: a body that fully swallows the previous candle. Doji: open ≈ close — indecision; whoever breaks the doji's range often wins.",
    visual: () => (
      <div className="grid grid-cols-3 gap-2 py-2">
        <div className="panel-inset p-2 text-center"><div className="flex justify-center"><CandleSVG o={46.5} h={47.5} l={38} c={47} w={44} hgt={90} /></div><p className="text-[10.5px] font-semibold text-fog-200 mt-1">Hammer</p><p className="text-[9.5px] text-fog-500">after a downtrend</p></div>
        <div className="panel-inset p-2 text-center"><div className="flex justify-center gap-1"><CandleSVG o={48} h={49} l={44} c={44.5} w={30} hgt={90} /><CandleSVG o={44.5} h={51} l={44} c={50} w={34} hgt={90} /></div><p className="text-[10.5px] font-semibold text-fog-200 mt-1">Engulfing</p><p className="text-[9.5px] text-fog-500">green eats the red</p></div>
        <div className="panel-inset p-2 text-center"><div className="flex justify-center"><CandleSVG o={46} h={51} l={41} c={46.3} w={44} hgt={90} /></div><p className="text-[10.5px] font-semibold text-fog-200 mt-1">Doji</p><p className="text-[9.5px] text-fog-500">indecision</p></div>
      </div>
    ),
  },
  {
    kind: "lesson", title: "Trend vs chop — trade what's there",
    body: "Uptrend: higher highs and higher lows — buy pullbacks. Downtrend: lower lows — rallies are for selling or standing aside. Chop: no direction, wicks everywhere — where impatient traders donate money. Name the regime before you name a trade.",
    visual: () => (
      <div className="grid md:grid-cols-2 gap-3 py-1">
        <div className="panel-inset p-2"><MiniChart data={TREND} h={120} /><p className="text-[10px] text-up num text-center mt-1">uptrend · higher highs</p></div>
        <div className="panel-inset p-2"><MiniChart data={REVERSAL} h={120} /><p className="text-[10px] text-down num text-center mt-1">downtrend · lower lows</p></div>
      </div>
    ),
  },
  {
    kind: "lesson", title: "How to think before you enter",
    body: "Every trade is four numbers decided BEFORE entry: entry, stop (where you're wrong), target (where you're right), size (what being wrong costs). If reward isn't at least ~2× risk, skip it. You're not paid to trade — you're paid to take good bets and skip bad ones.",
    visual: () => (
      <div className="py-1"><MiniChart data={TREND} h={140} lines={[
        { price: 64.5, color: "#eef3fa", label: "ENTRY" },
        { price: 61.5, color: "#e0564f", label: "STOP −1R" },
        { price: 70.5, color: "#2fb98c", label: "TARGET +2R" },
      ]} /></div>
    ),
  },
  {
    kind: "quiz", q: "This candle closed green. What does that tell you?",
    options: ["Buyers controlled this window", "The trend is definitely up now", "You should buy immediately", "Nothing useful"],
    correct: 0,
    explain: "A green close means buyers won that one window. Context — trend, level, wicks — decides what it's worth for the next one.",
    chart: () => <div className="flex justify-center"><CandleSVG o={44} h={53} l={43} c={52} w={50} hgt={110} /></div>,
  },
  {
    kind: "quiz", q: "After a steep fall you see this candle. The long lower wick suggests…",
    options: ["Sellers are accelerating", "Buyers rejected the lower prices — possible reversal", "The market is closed", "A guaranteed bottom"],
    correct: 1,
    explain: "Price was pushed down and bought back up. A clue, not a guarantee — it only matters at a sensible level, with a stop below the wick.",
    chart: () => <div className="flex justify-center"><CandleSVG o={46} h={47.5} l={35} c={47} w={50} hgt={110} /></div>,
  },
  {
    kind: "quiz", q: "Long after this uptrend pullback. Where does a sensible stop go?",
    options: ["Just above the recent high", "Below the recent swing low", "Exactly at your entry", "Stops are optional"],
    correct: 1,
    explain: "Below the swing low — where your idea (higher lows) is proven wrong. Above the high is where shorts sit; at entry guarantees a scratch; 'optional' is how accounts die.",
    chart: () => <MiniChart data={TREND} h={130} marks={[{ i: 2, text: "swing low", color: "#e0a33b" }]} />,
  },
];

function CandleSchool({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const step = SCHOOL_STEPS[i];
  const isQuiz = step.kind === "quiz";
  const last = i === SCHOOL_STEPS.length - 1;
  const answered = picked !== null;
  const correct = isQuiz && answered && picked === (step as Extract<SchoolStep, { kind: "quiz" }>).correct;

  const next = () => { if (last) { onDone(); return; } setPicked(null); setI(i + 1); };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(5,9,17,0.92)" }}>
      <div className="panel w-full max-w-xl max-h-[92vh] overflow-y-auto animate-pop" style={{ background: "#0e1729" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line sticky top-0 z-10" style={{ background: "#0e1729" }}>
          <h3 className="font-display font-semibold text-[15px] text-fog-100 flex items-center gap-2">
            <span className="text-amber inline-flex"><Ic.candles size={16} /></span> Candle School
          </h3>
          <div className="flex items-center gap-2">
            <span className="num text-[10.5px] text-fog-500">{i + 1} / {SCHOOL_STEPS.length}</span>
            <button onClick={onDone} className="text-fog-500 hover:text-fog-200 transition-colors text-[11.5px] font-semibold">Skip school</button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="flex gap-[3px] mb-4">
            {SCHOOL_STEPS.map((_, k) => (
              <div key={k} className="h-[3px] flex-1 rounded-full transition-all duration-300" style={{ background: k < i ? "#39c5a5" : k === i ? "#e0a33b" : "#1c2942" }} />
            ))}
          </div>
          <p className="lbl mb-1.5 text-amber">{isQuiz ? "Quick check" : "Lesson"}</p>
          <h4 className="font-display font-bold text-[17px] text-fog-100 mb-2">{step.kind === "lesson" ? step.title : "Read the chart"}</h4>
          <p className="text-[13px] text-fog-300 leading-relaxed mb-3">{step.kind === "lesson" ? step.body : step.q}</p>
          <div className="panel-inset p-3 mb-4 animate-fade-in" key={i}>
            {step.kind === "lesson" ? step.visual() : step.chart ? step.chart() : null}
          </div>
          {isQuiz && (
            <div className="space-y-2 mb-4">
              {step.options.map((op, oi) => {
                const isCorrect = oi === step.correct;
                const isPicked = picked === oi;
                let style: React.CSSProperties = { background: "#0a1120", border: "1px solid #1c2942", color: "#c3cfdf" };
                if (answered) {
                  if (isCorrect) style = { background: "rgba(47,185,140,0.12)", border: "1px solid #2fb98c", color: "#2fb98c" };
                  else if (isPicked) style = { background: "rgba(224,86,79,0.12)", border: "1px solid #e0564f", color: "#e0564f" };
                  else style = { ...style, opacity: 0.5 };
                }
                return (
                  <button key={oi} disabled={answered} onClick={() => setPicked(oi)}
                    className="w-full text-left px-3.5 py-2.5 rounded-lg text-[12.5px] font-medium transition-all duration-150" style={style}>
                    {String.fromCharCode(65 + oi)} · {op}
                  </button>
                );
              })}
              {answered && (
                <p className="text-[12px] leading-relaxed p-3 rounded-lg animate-fade-in"
                  style={{ background: correct ? "rgba(47,185,140,0.07)" : "rgba(224,86,79,0.07)", border: `1px solid ${correct ? "rgba(47,185,140,0.4)" : "rgba(224,86,79,0.4)"}`, color: "#c3cfdf" }}>
                  <strong style={{ color: correct ? "#2fb98c" : "#e0564f" }}>{correct ? "Correct. " : "Not quite. "}</strong>{step.explain}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 pb-5">
          <button onClick={onDone} className="btn btn-ghost !text-[12px]">Finish &amp; open the desk</button>
          {!isQuiz ? (
            <button onClick={next} className="btn btn-teal">{last ? "Done" : "Continue"} →</button>
          ) : (
            <button onClick={next} disabled={!answered} className="btn btn-teal">{last ? "Finish school →" : "Next"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Tour() {
  const { state: s, dispatch } = useApp();
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"walk" | "school">("walk");
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = WALKTHROUGH[i];
  const open = s.tourOpen;

  useEffect(() => {
    if (!open || phase !== "walk" || !step.target) { setRect(null); return; }
    const measure = () => {
      const el = document.querySelector(step.target!);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect(r.width > 0 && r.height > 0 ? r : null);
    };
    measure();
    const iv = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearInterval(iv); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, phase, step, i]);

  if (!open) return null;
  if (phase === "school") return <CandleSchool onDone={() => dispatch({ type: "TOUR_FINISHED" })} />;

  const skipAll = () => dispatch({ type: "TOUR_FINISHED" });
  const next = () => { if (i < WALKTHROUGH.length - 1) setI(i + 1); else setPhase("school"); };
  const back = () => { if (i > 0) setI(i - 1); };

  const pad = 10;
  const spot = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const below = spot ? spot.top + spot.height + 14 : 0;
  const calloutTop = spot ? (below + 260 > window.innerHeight ? Math.max(12, spot.top - 250) : below) : undefined;
  const calloutLeft = spot ? Math.min(Math.max(12, spot.left), window.innerWidth - 380) : undefined;

  return (
    <div className="fixed inset-0 z-[75]">
      <div className="absolute inset-0" aria-hidden>
        <div className="absolute rounded-xl transition-all duration-300"
          style={spot ? {
            top: spot.top, left: spot.left, width: spot.width, height: spot.height,
            boxShadow: "0 0 0 9999px rgba(5,9,17,0.78)", border: "1.5px solid rgba(57,197,165,0.8)",
          } : { boxShadow: "0 0 0 9999px rgba(5,9,17,0.78)" }} />
      </div>
      <div className="absolute animate-pop"
        style={spot ? { top: calloutTop, left: calloutLeft, width: 360 } : { top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 92vw)" }}>
        <div className="panel p-5" style={{ background: "#0e1729", border: "1px solid #2a3c5e", boxShadow: "0 24px 60px -18px rgba(0,0,0,0.8)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="lbl text-teal">Desk tour · {i + 1}/{WALKTHROUGH.length}</span>
            <button onClick={skipAll} className="text-fog-500 hover:text-fog-200 transition-colors text-[11.5px] font-semibold">Skip tour</button>
          </div>
          <h4 className="font-display font-bold text-[16.5px] text-fog-100 mb-2">{step.title}</h4>
          <p className="text-[12.5px] text-fog-300 leading-relaxed whitespace-pre-line">{step.body}</p>
          <div className="flex gap-[3px] my-4">
            {WALKTHROUGH.map((_, k) => (
              <div key={k} className="h-[3px] flex-1 rounded-full transition-all duration-300" style={{ background: k < i ? "#39c5a5" : k === i ? "#e0a33b" : "#1c2942" }} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button onClick={back} disabled={i === 0} className="btn btn-ghost !text-[12px] !py-1.5">← Back</button>
            <button onClick={next} className="btn btn-teal !py-1.5">{i === WALKTHROUGH.length - 1 ? "Start Candle School →" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
