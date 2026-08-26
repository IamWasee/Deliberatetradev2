/* Legal - disclaimers, terms of service, privacy policy. */
import { useEffect, useRef, useState } from "react";
import { Ic } from "../components/ui";

interface Section { id: string; no: string; title: string; accent: string; paras: string[]; list?: string[] }

const A = { teal: "#39c5a5", amber: "#e0a33b", red: "#e0564f", fog: "#93a3ba" };

const SECTIONS: Section[] = [
  {
    id: "educational", no: "01", title: "Educational Purpose", accent: A.teal,
    paras: [
      "DeliberateTrade is an educational training simulator. Its sole purpose is to teach trading process, risk discipline, and emotional control in a consequence-free environment.",
      "Every account, balance, order, fill, and P&L figure on this platform is simulated using virtual (fake) money. No real securities, cryptoassets, or financial instruments of any kind are bought, sold, or held here.",
    ],
  },
  {
    id: "no-advice", no: "02", title: "No Financial Advice", accent: A.amber,
    paras: [
      "Nothing on this platform - including its tools, analytics, Process Scores, Readiness Scores, coach debriefs, missions, news wire, or educational content - constitutes financial, investment, legal, or tax advice.",
      "No content is a recommendation to buy or sell any real asset. Using this platform creates no advisor-client or fiduciary relationship of any kind.",
    ],
  },
  {
    id: "risk", no: "03", title: "Risk Warning", accent: A.red,
    paras: [
      "Trading and investing in real markets involves substantial risk of loss, including loss of your entire capital. The majority of retail traders lose money.",
      "Leverage, cryptoassets, and derivatives amplify both gains and losses. Only ever risk money you can afford to lose completely.",
    ],
  },
  {
    id: "simulated", no: "04", title: "Simulated Results & Market Data", accent: A.amber,
    paras: [
      "Simulated performance does not predict, guarantee, or reliably correlate with real-money results. A profitable simulated record is not evidence that you will profit with real funds.",
      "Prices, fills, slippage, spreads, and news on this platform are synthetic approximations generated for training. They may be delayed, inaccurate, or materially different from live markets, and must never be used as the basis for real trading decisions.",
    ],
  },
  {
    id: "not-broker", no: "05", title: "Not a Broker - No Real Funds", accent: A.teal,
    paras: [
      "We are not a broker, dealer, exchange, clearing firm, or financial institution. We do not hold customer funds, custody assets, execute real orders, or provide access to real markets.",
      "Virtual balances have no monetary value, cannot be deposited, withdrawn, transferred, or redeemed, and are not protected by any deposit-insurance or compensation scheme.",
    ],
  },
  {
    id: "liability", no: "06", title: "No Liability", accent: A.red,
    paras: [
      'To the maximum extent permitted by law, DeliberateTrade and its creators accept no liability for any direct, indirect, incidental, consequential, or punitive damages - including trading losses - arising from your use of, or reliance on, this platform.',
      'The service is provided "as is" and "as available", without warranties of any kind, express or implied, including accuracy, reliability, or fitness for a particular purpose.',
    ],
  },
  {
    id: "responsibility", no: "07", title: "Your Responsibility", accent: A.amber,
    paras: [
      "You are solely responsible for any real-money trading or investment decision you make - now or in the future - and for obtaining independent, licensed professional advice before acting.",
      "Graduating from this simulator, or reaching any Readiness Score, is an educational milestone. It is never a certification, a guarantee, or a signal that real-money trading is safe for you.",
    ],
  },
  {
    id: "tos", no: "08", title: "Terms of Service", accent: A.fog,
    paras: ["By using DeliberateTrade you agree to the following terms:"],
    list: [
      "Educational use only. The service is a training simulator. You may not present its outputs as professional advice, and you may not scrape, resell, or misuse it.",
      "Virtual funds only. Balances, P&L, and orders are simulated; nothing on the platform has monetary value or can be withdrawn.",
      "No professional relationship. No broker-client, advisory, or fiduciary relationship is created by using the service.",
      'No warranty. The service is provided "as is", without warranties of any kind, including accuracy of data or fitness for a particular purpose.',
      "Limitation of liability. To the maximum extent permitted by law, we are not liable for any damages arising from your use of the service.",
      "Changes. We may update the simulator or these terms at any time; continued use after a change constitutes acceptance.",
      "Governing law. These terms are interpreted under the laws of your jurisdiction of residence; if any provision is unenforceable, the remainder stays in effect.",
    ],
  },
  {
    id: "privacy", no: "09", title: "Privacy Policy", accent: A.teal,
    paras: [
      "What happens to your data on DeliberateTrade. We store your email and your trading performance on our servers. We do not store, and cannot read, anything you write in your own words. The detail is below.",
    ],
    list: [
      "What we collect. To create an account we collect and store on our servers: your email address, a display name if you provide one, your account tier, and the dates your account was created and last used. No address, payment card, or government ID is collected.",
      "Your password. Your password is sent over an encrypted connection and stored only as a bcrypt hash - a one-way transformation. It cannot be reversed back into your password. Nobody can read it: not our staff, not the platform owner, and not anyone who obtained a copy of the database. When you sign in we hash what you type and compare the result. We can never email you your existing password, only a link to set a new one.",
      "Your trading activity. Your trading plan, closed trades, open positions, rule violations, and performance scores are saved to our servers so your account works across devices and so we can support you. This is a change from earlier versions, where that data stayed only in your browser.",
      "What we can see, and what we cannot. Administrators can view your performance: equity, trades, win rate, R multiples, Process Score, rule violations, and the emotion TAGS you select from the fixed list. Administrators CANNOT read anything you write in your own words - journal entries, lesson notes, rule notes, or the thesis you type before a trade. That text is stored under database rules that grant staff no access to it, so the restriction is structural rather than a matter of policy alone.",
      "How we use your email. To verify your account, to sign you in, to let you reset your password, and to send service notices such as security or billing changes. We do not sell it, rent it, or use it for advertising.",
      "Who can see your account. Platform administrators can view account records - email address, tier, and activity dates - to provide support and manage subscriptions. Administrators cannot read your password, and cannot alter your trading history: they hold read access to it and nothing more.",
      "Processors we use. Supabase provides our database, authentication, and verification email delivery. Netlify hosts the site. Both process data on our behalf under their own security terms. We use no analytics, trackers, or third-party advertising.",
      "Retention. Account and trading data are kept while your account is open. Delete your account and every linked record - trades, positions, journals, violations, scores - is permanently removed from our database in the same operation; backups age out on our provider's rolling schedule.",
      "Your rights. You may request access to your data, a portable copy, correction, or erasure. Delete your account in-app at any time, or contact us at the address below. Depending on where you live, GDPR, UK GDPR, or CCPA/CPRA may give you additional rights, including the right to complain to your local data protection authority. We do not sell personal information as those laws define the term.",
      "Data location. Our database and authentication are operated by Supabase and your data may be processed outside your country of residence, including in the United States.",
      "Children. The service is not directed at children under 16, and we do not knowingly collect their data. If you believe a child has created an account, contact us and we will delete it.",
      "Security. Connections use HTTPS, passwords are hashed, and database access rules are enforced on the server so one account cannot read another's data. No system is perfectly secure; if a breach affects your data we will notify you and the relevant authority as required by law.",
      "Contact. Privacy requests and questions: abdullahwasee86@gmail.com",
      "Changes. Material changes to this policy update the effective date below. Continued use after a change means you accept the updated policy.",
    ],
  },
];

const PLAIN = [
  { mark: A.teal, text: "This is a trainer, not a broker. All money here is fake." },
  { mark: A.amber, text: "Nothing on this platform is financial advice." },
  { mark: A.red, text: "Simulated profits do not predict real profits. Most retail traders lose money." },
  { mark: A.amber, text: "We hold no funds, execute no real trades, and accept no liability for real-money decisions." },
  { mark: A.teal, text: "We store your email to run your account. Your password is hashed - nobody here can read it." },
  { mark: A.teal, text: "Your trades and scores are saved to your account. Delete it anytime - it's gone for good." },
  { mark: A.teal, text: "What you write in journals is yours. Staff can see your numbers, never your words." },
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
        <div className="animate-fade-up">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-teal"
              style={{ background: "rgba(57,197,165,0.1)", border: "1px solid rgba(57,197,165,0.35)" }}>
              <Ic.scale size={20} />
            </span>
            <h1 className="font-display font-bold text-[26px] md:text-[30px] text-fog-100 leading-tight">Legal, Terms & Privacy</h1>
            <span className="lbl num px-2 py-1 rounded-full" style={{ fontSize: 9.5, background: "#111b30", border: "1px solid #1c2942", color: "#93a3ba" }}>
              Effective 26 Aug 2026 - v3.0
            </span>
          </div>
          <p className="text-[13px] text-fog-400 leading-relaxed max-w-2xl">
            The short, unvarnished version of your relationship with this platform. Read it once - it is deliberately blunt, because ambiguity in disclaimers is how traders get hurt.
          </p>
        </div>

        <div className="panel p-5 mt-6 animate-fade-up" style={{ borderColor: "rgba(224,163,59,0.35)", animationDelay: "60ms" }}>
          <p className="lbl text-amber mb-3.5">In plain English</p>
          <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2.5">
            {PLAIN.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-fog-200">
                <span className="mt-[6px] w-2 h-2 rounded-[3px] shrink-0" style={{ background: p.mark }} />
                {p.text}
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
                className="panel p-5 md:p-6 scroll-mt-4 animate-fade-in" style={{ borderLeft: "3px solid " + s.accent }}>
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
