/* Legal — disclaimers, terms of service, privacy policy. */
import { useEffect, useRef, useState } from "react";
import { Ic } from "../components/ui";

interface Section { id: string; no: string; title: string; accent: string; paras: string[]; list?: string[] }
const ACCENT = { teal: "#39c5a5", amber: "#e0a33b", red: "#e0564f", fog: "#93a3ba" };

const SECTIONS: Section[] = [
  {
    id: "educational", no: "01", title: "Educational Purpose", accent: ACCENT.teal,
    paras: [
      "DeliberateTrade is an educational training simulator. Its sole purpose is to teach trading process, risk discipline, and emotional control in a consequence-free environment.",
      "Every account, balance, order, fill, and P&L figure on this platform is simulated using virtual (fake) money. No real securities, cryptoassets, or financial instruments of any kind are bought, sold, or held here.",
    ],
  },
  {
    id: "no-advice", no: "02", title: "No Financial Advice", accent: ACCENT.amber,
    paras: [
      "Nothing on this platform — including its tools, analytics, Process Scores, Readiness Scores, coach debriefs, missions, news wire, or educational content — constitutes financial, investment, legal, or tax advice.",
      "No content is a recommendation to buy or sell any real asset. Using this platform creates no advisor–client or fiduciary relationship of any kind.",
    ],
  },
  {
    id: "risk", no: "03", title: "Risk Warning", accent: ACCENT.red,
    paras: [
      "Trading and investing in real markets involves substantial risk of loss, including loss of your entire capital. The majority of retail traders lose money.",
      "Leverage, cryptoassets, and derivatives amplify both gains and losses. Only ever risk money you can afford to lose completely.",
    ],
  },
  {
    id: "simulated", no: "04", title: "Simulated Results & Market Data", accent: ACCENT.amber,
    paras: [
      "Simulated performance does not predict, guarantee, or reliably correlate with real-money results. A profitable simulated record is not evidence that you will profit with real funds.",
      "Prices, fills, slippage, spreads, and news on this platform are synthetic approximations generated for training. They may be delayed, inaccurate, or materially different from live markets, and must never be used as the basis for real trading decisions.",
    ],
  },
  {
    id: "not-broker", no: "05", title: "Not a Broker — No Real Funds", accent: ACCENT.teal,
    paras: [
      "We are not a broker, dealer, exchange, clearing firm, or financial institution. We do not hold customer funds, custody assets, execute real orders, or provide access to real markets.",
      "Virtual balances have no monetary value, cannot be deposited, withdrawn, transferred, or redeemed, and are not protected by any deposit-insurance or compensation scheme.",
    ],
  },
  {
    id: "liability", no: "06", title: "No Liability", accent: ACCENT.red,
    paras: [
      "To the maximum extent permitted by law, DeliberateTrade and its creators accept no liability for any direct, indirect, incidental, consequential, or punitive damages — including trading losses — arising from your use of, or reliance on, this platform.",
      "The service is provided \u201cas is\u201d and \u201cas available\u201d, without warranties of any kind, express or implied, including accuracy, reliability, or fitness for a particular purpose.",
    ],
  },
  {
    id: "responsibility", no: "07", title: "Your Responsibility", accent: ACCENT.amber,
    paras: [
      "You are solely responsible for any real-money trading or investment decision you make — now or in the future — and for obtaining independent, licensed professional advice before acting.",
      "Graduating from this simulator, or reaching any Readiness Score, is an educational milestone. It is never a certification, a guarantee, or a signal that real-money trading is safe for you.",
    ],
  },
  {
    id: "tos", no: "08", title: "Terms of Service", accent: ACCENT.fog,
    paras: ["By using DeliberateTrade you agree to the following terms:"],
    list: [
      "Educational use only. The service is a training simulator. You may not present its outputs as professional advice, and you may not scrape, resell, or misuse it.",
      "Virtual funds only. Balances, P&L, and orders are simulated; nothing on the platform has monetary value or can be withdrawn.",
      "No professional relationship. No broker–client, advisory, or fiduciary relationship is created by using the service.",
      "No warranty. The service is provided \u201cas is\u201d, without warranties of any kind, including accuracy of data or fitness for a particular purpose.",
      "Limitation of liability. To the maximum extent permitted by law, we are not liable for any damages arising from your use of the service.",
      "Changes. We may update the simulator or these terms at any time; continued use after a change constitutes acceptance.",
      "Governing law. These terms are interpreted under the laws of your jurisdiction of residence; if any provision is unenforceable, the remainder stays in effect.",
    ],
  },
  {
    id: "privacy", no: "09", title: "Privacy Policy", accent: ACCENT.teal,
    paras: ["What happens to your data on DeliberateTrade:"],
    list: [
      "What is stored. Your trading plan, orders, positions, journals, emotional check-ins, scores, and indicator settings are stored locally in your browser on this device — nowhere else.",
      "What is never collected. No name, email, address, payment data, or government ID is required or stored. No real money ever touches the platform.",
      "No transmission. Your data does not leave your device. There are no servers, analytics, trackers, or third-party advertising.",
      "Your controls. Export a performance report anytime from the Readiness tab, wipe everything with account deletion, or clear your browser's site data. Deletion is immediate and permanent.",
      "GDPR / CCPA. Because data lives only on your device, you exercise access, portability, and erasure directly through these controls — we hold nothing to request from us.",
      "Children. The platform is not directed at minors; educational use assumes appropriate supervision.",
      "Changes. Material changes to this policy update the effective date below.",
    ],
  },
];

const PLAIN = [
  { mark: ACCENT.teal, text: "This is a trainer, not a broker. All money here is fake." },
  { mark: ACCENT.amber, text: "Nothing on this platform is financial advice." },
  { mark: ACCENT.red, text: "Simulated profits do not predict real profits. Most retail traders lose money." },
  { mark: ACCENT.amber, text: "We hold no funds, execute no real trades, and accept no liability for real-money decisions." },
  { mark: ACCENT.teal, text: "Your data stays in your browser. Delete it anytime — it's gone for good." },
];

export default function Legal() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id); },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    SECTIONS.forEach((s) => { if (refs.current[s.id]) io.observe(refs.current[s.id]!); });
    return () => io.disconnect();
  }, []);

  const go = (id: string) => refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <div className="animate-fade-in">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-teal"
              style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.35)" }}>
              <Ic.scale size={20} />
            </span>
            <h1 className="font-display font-bold text-[26px] md:text-[30px] text-fog-100 leading-tight">Legal, Terms &amp; Privacy</h1>
            <span className="lbl num !text-[9.5px] px-2 py-1 rounded-full" style={{ background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>
              Effective 1 Feb 2026 · v1.0
            </span>
          </div>
          <p className="text-[13px] text-fog-400 leading-relaxed max-w-2xl">
            The short, unvarnished version of your relationship with this platform. Read it once — ambiguity in disclaimers is how traders get hurt.
          </p>
        </div>

        <div className="panel p-5 mt-6 animate-fade-in" style={{ borderColor: "rgba(224,163,59,0.35)" }}>
          <p className="lbl text-amber mb-3.5">In plain English</p>
          <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2.5">
            {PLAIN.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-fog-200">
                <span className="mt-[6px] w-2 h-2 rounded-[3px] shrink-0" style={{ background: p.mark }} />{p.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid md:grid-cols-[190px_1fr] gap-8 mt-8 pb-12">
          <nav className="hidden md:block">
            <div className="sticky top-2 space-y-0.5">
              {SECTIONS.map((s) => (
                <button key={s.id} onClick={() => go(s.id)}
                  className="w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-all duration-150"
                  style={{ background: active === s.id ? "rgba(57,197,165,0.08)" : undefined, color: active === s.id ? "#eef3fa" : "#6b7d96" }}>
                  <span className="num text-[10px]" style={{ color: active === s.id ? s.accent : "#4d5f78" }}>{s.no}</span>
                  <span className="text-[12px] font-medium">{s.title}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="space-y-6 min-w-0">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} ref={(el) => { refs.current[s.id] = el; }}
                className="panel p-5 md:p-6 scroll-mt-4 animate-fade-in" style={{ borderLeft: `3px solid ${s.accent}` }}>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="font-display font-bold text-[15px] num" style={{ color: s.accent }}>{s.no}</span>
                  <h2 className="font-display font-bold text-[17.5px] text-fog-100">{s.title}</h2>
                </div>
                <div className="space-y-2.5">
                  {s.paras.map((p, i) => <p key={i} className="text-[13px] text-fog-300 leading-relaxed">{p}</p>)}
                </div>
                {s.list && (
                  <ol className="mt-3.5 space-y-2.5">
                    {s.list.map((li, i) => (
                      <li key={i} className="flex gap-3 text-[12.5px] text-fog-300 leading-relaxed">
                        <span className="num text-[11px] font-bold shrink-0 mt-[1px] w-5 text-right" style={{ color: s.accent }}>{i + 1}.</span>
                        <span>{li}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
            <p className="text-[11px] text-fog-600 leading-relaxed pt-2">
              Questions about this document don't change it: if you need advice about real trading or investing, consult a licensed professional in your jurisdiction. DeliberateTrade cannot and will not give it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
