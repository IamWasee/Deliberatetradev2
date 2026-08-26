/* Auth screen - signup, email confirmation, sign-in, password reset.

   Identity is Supabase Auth. Passwords leave this component only inside the
   signUp / signInWithPassword calls in lib/account.ts; they are never hashed,
   stored or logged here, and no code path can read a stored password back.

   The lockout and backoff below are UX friction, not security: the real rate
   limiting is enforced by Supabase on the server. */
import { useEffect, useState } from "react";
import {
  PASSWORD_RULES, lockInfo, maskEmail, passwordStrength, rateLimited,
  recordLoginFail, resetLockout, sleep, validatePassword, wipeEverything,
  checkEmail, backoffDelay, type LockState,
} from "../lib/auth";
import { signUp, signIn, requestPasswordReset, resendVerification, updatePassword } from "../lib/account";
import { Bar, Ic, Modal } from "./ui";

type Mode = "signup" | "signin" | "sent" | "forgot" | "reset";

const fmtCountdown = (ms: number) =>
  Math.floor(ms / 60000) + ":" + String(Math.max(0, Math.ceil((ms % 60000) / 1000))).padStart(2, "0");

export default function Auth() {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "down"; text: string } | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [lockTick, setLockTick] = useState(0);

  const lock = lockInfo();
  useEffect(() => {
    const iv = setInterval(() => setLockTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  void lockTick;

  /* Supabase returns from a password-reset email with type=recovery in the
     URL fragment. Land those users straight on the new-password form. */
  useEffect(() => {
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (frag.get("type") === "recovery") setMode("reset");
    if (frag.get("error_description")) {
      setNotice({ tone: "down", text: frag.get("error_description")! });
    }
  }, []);

  const say = (tone: "ok" | "warn" | "down", text: string) => setNotice({ tone, text });
  const policy = validatePassword(pw);
  const strength = passwordStrength(pw);
  const emailCheck = checkEmail(email);

  const doSignup = async () => {
    setBusy(true); setNotice(null);
    if (rateLimited("signup", 3, 60_000).limited) { say("warn", "Too many attempts - wait a minute."); setBusy(false); return; }
    if (!emailCheck.ok) { say("down", emailCheck.reason); setBusy(false); return; }
    if (name.trim().length < 2) { say("down", "Enter your name (2+ characters)."); setBusy(false); return; }
    if (!policy.ok) { say("down", "Password missing: " + policy.failed.join(", ") + "."); setBusy(false); return; }
    if (pw !== pw2) { say("down", "Passwords don't match."); setBusy(false); return; }

    const r = await signUp(email, pw, name);
    if (!r.ok) { say("down", r.error); setBusy(false); return; }
    setPw(""); setPw2("");
    setMode("sent");
    setBusy(false);
  };

  const failMsg = (r: LockState) =>
    r.locked
      ? (r.scope === "device"
          ? "Too many failures from this browser - every sign-in here is paused for 15 minutes (device lock)."
          : "Too many failed attempts - sign-in locked for 5 minutes.")
      : (5 - r.attempts) + " attempt" + (5 - r.attempts === 1 ? "" : "s") + " left before lockout.";

  const doSignin = async () => {
    setBusy(true); setNotice(null);
    if (lock.locked) {
      say("warn", lock.scope === "device"
        ? "Device sign-in paused. Retry in " + Math.ceil(lock.retryInMs / 1000) + "s."
        : "Sign-in locked. Try again in " + Math.ceil(lock.retryInMs / 1000) + "s.");
      setBusy(false); return;
    }
    if (rateLimited("login", 10, 60_000).limited) { say("warn", "Too many sign-in attempts. Slow down."); setBusy(false); return; }
    if (!emailCheck.ok) { say("down", emailCheck.reason); setBusy(false); return; }

    const bd = backoffDelay(lockInfo().attempts);
    if (bd > 0) {
      say("warn", "Slowing down - checking in " + Math.round(bd / 1000) + "s (anti-guessing backoff)...");
      await sleep(bd);
    }

    const r = await signIn(email, pw);
    if (!r.ok) {
      /* An unconfirmed account is a state, not a failed guess - don't burn an
         attempt against the lockout for it. */
      if (/confirm your email/i.test(r.error)) { say("warn", r.error); setMode("sent"); setBusy(false); return; }
      say("down", r.error + " " + failMsg(recordLoginFail()));
      setBusy(false); return;
    }
    resetLockout();
    setPw("");
    /* The auth listener in useAuth swaps this screen for the desk. */
    setBusy(false);
  };

  const doForgot = async () => {
    setBusy(true); setNotice(null);
    if (rateLimited("reset", 3, 60_000).limited) { say("warn", "Too many requests - wait a minute."); setBusy(false); return; }
    if (!emailCheck.ok) { say("down", emailCheck.reason); setBusy(false); return; }
    const r = await requestPasswordReset(email);
    if (!r.ok) { say("down", r.error); setBusy(false); return; }
    say("ok", "If that address has an account, a reset link is on its way. The link expires in 1 hour.");
    setBusy(false);
  };

  const doReset = async () => {
    setBusy(true); setNotice(null);
    if (!policy.ok) { say("down", "Password missing: " + policy.failed.join(", ") + "."); setBusy(false); return; }
    if (pw !== pw2) { say("down", "Passwords don't match."); setBusy(false); return; }
    const r = await updatePassword(pw);
    if (!r.ok) { say("down", r.error); setBusy(false); return; }
    say("ok", "Password updated. Signing you in...");
    window.history.replaceState(null, "", window.location.pathname);
    setBusy(false);
  };

  const doResend = async () => {
    setBusy(true); setNotice(null);
    if (rateLimited("resend", 2, 120_000).limited) { say("warn", "Wait two minutes before requesting another email."); setBusy(false); return; }
    const r = await resendVerification(email);
    say(r.ok ? "ok" : "down", r.ok ? "Confirmation email sent again." : r.error);
    setBusy(false);
  };

  const submit = () => {
    if (busy) return;
    if (mode === "signup") void doSignup();
    else if (mode === "signin") void doSignin();
    else if (mode === "forgot") void doForgot();
    else if (mode === "reset") void doReset();
  };

  const disabled =
    busy ||
    (mode === "signup" && (!emailCheck.ok || !policy.ok || pw !== pw2 || name.trim().length < 2)) ||
    (mode === "signin" && (lock.locked || !email || !pw)) ||
    (mode === "forgot" && !emailCheck.ok) ||
    (mode === "reset" && (!policy.ok || pw !== pw2));

  const titles: Record<Mode, string> = {
    signup: "Create your account",
    signin: "Sign in to your desk",
    sent: "Check your inbox",
    forgot: "Forgot password",
    reset: "Set a new password",
  };

  const blurbs: Record<Mode, string> = {
    signup: "We store your email to run your account. Your password is hashed - nobody here can read it. Virtual money only.",
    signin: "Welcome back. The tape moved while you were away.",
    sent: "Confirm your email to activate the account.",
    forgot: "We'll email you a link to set a new password.",
    reset: "Choose a new password for your account.",
  };

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="lbl block mb-1.5">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 w-full max-w-[920px] items-stretch">

          {/* brand card */}
          <div className="panel p-7 hidden lg:flex flex-col animate-fade-up"
            style={{ background: "linear-gradient(160deg, rgba(17,27,48,0.95), rgba(10,17,32,0.95))" }}>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-teal inline-flex"><Ic.logo size={34} /></span>
              <div>
                <p className="font-display font-bold text-[19px] text-fog-100 leading-tight">DeliberateTrade</p>
                <p className="text-[10.5px] text-fog-500 num tracking-wider uppercase">process before profit</p>
              </div>
            </div>
            <h1 className="font-display font-bold text-[26px] leading-snug text-fog-100 mb-3">
              Paper trading that hurts enough to teach you.
            </h1>
            <p className="text-[13px] text-fog-400 leading-relaxed mb-6">
              A flight simulator for traders: mandatory journals, circuit breakers, tilt detection, stress tests - and a Process Score that outranks your P&L.
            </p>
            <div className="space-y-2.5 mt-auto">
              {[
                ["Email confirmation required before your first session.", "#39c5a5"],
                ["Passwords are stored only as a bcrypt hash - never readable, not even by us.", "#e0a33b"],
                ["Gmail addresses only while the platform is in early access.", "#6fb6e8"],
                ["Your numbers sync to your account. What you write in journals stays private.", "#b48ef0"],
              ].map(([t, c], i) => (
                <p key={i} className="flex items-start gap-2.5 text-[11.5px] text-fog-400 leading-snug">
                  <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c as string }} />{t}
                </p>
              ))}
            </div>
          </div>

          {/* form card */}
          <div className="panel p-6 sm:p-7 animate-fade-up" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center gap-2.5 mb-5 lg:hidden">
              <span className="text-teal inline-flex"><Ic.logo size={26} /></span>
              <p className="font-display font-bold text-[16px] text-fog-100">DeliberateTrade</p>
            </div>
            <h2 className="font-display font-bold text-[18px] text-fog-100 mb-1">{titles[mode]}</h2>
            <p className="text-[11.5px] text-fog-500 mb-5">{blurbs[mode]}</p>

            {notice && (
              <div className="rounded-lg px-3 py-2 mb-4 text-[11.5px] leading-snug animate-fade-in"
                style={{
                  background: notice.tone === "ok" ? "rgba(47,185,140,0.08)" : notice.tone === "warn" ? "rgba(224,163,59,0.08)" : "rgba(224,86,79,0.08)",
                  border: "1px solid " + (notice.tone === "ok" ? "rgba(47,185,140,0.4)" : notice.tone === "warn" ? "rgba(224,163,59,0.4)" : "rgba(224,86,79,0.4)"),
                  color: notice.tone === "ok" ? "#2fb98c" : notice.tone === "warn" ? "#e0a33b" : "#e0564f",
                }}>{notice.text}</div>
            )}

            {lock.locked && mode === "signin" && (
              <div className="rounded-lg px-3.5 py-2.5 mb-4 text-[11.5px] leading-snug animate-fade-in"
                style={{ background: "rgba(224,86,79,0.1)", border: "1px solid rgba(224,86,79,0.45)", color: "#e0564f" }}>
                <strong>{lock.scope === "device" ? "Device-wide sign-in paused." : "Brute-force lockout active."}</strong>{" "}
                Retry in <span className="num font-bold">{fmtCountdown(lock.retryInMs)}</span>.
              </div>
            )}

            {mode === "sent" ? (
              <div className="space-y-4">
                <div className="panel-inset p-4 text-center">
                  <span className="text-teal inline-flex justify-center mb-2"><Ic.check size={22} /></span>
                  <p className="text-[12.5px] text-fog-300 leading-relaxed">
                    We sent a confirmation link to<br />
                    <span className="num text-fog-100">{email ? maskEmail(email) : "your inbox"}</span>
                  </p>
                </div>
                <p className="text-[11.5px] text-fog-500 leading-relaxed">
                  Click the link in that email to activate your account, then sign in.
                  It can take a minute to arrive - check spam if you don't see it.
                </p>
                <button className="btn btn-ghost w-full" disabled={busy} onClick={() => void doResend()}>
                  Resend confirmation email
                </button>
                <button className="btn btn-teal w-full" onClick={() => { setNotice(null); setMode("signin"); }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {mode === "signup" && field("What should the desk call you?",
                  <input className="field" placeholder="Trader name or callsign" value={name}
                    maxLength={60} onChange={(e) => setName(e.target.value)} />)}

                {mode !== "reset" && field("Email",
                  <>
                    <input className="field" type="email" placeholder="you@gmail.com" value={email}
                      autoComplete="email" onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
                    {email.length > 0 && !emailCheck.ok && (
                      <p className="text-[11px] text-down mt-1.5">{emailCheck.reason}</p>
                    )}
                  </>)}

                {mode !== "forgot" && field(mode === "reset" ? "New password" : "Password",
                  <input className="field" type="password" placeholder={mode === "signin" ? "your password" : "min 8 chars, letters + numbers"}
                    value={pw} autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    onChange={(e) => setPw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />)}

                {(mode === "signup" || mode === "reset") && (
                  <>
                    {pw.length > 0 && (
                      <div className="space-y-1.5">
                        <Bar value={(strength + 1) * 25} color={strength >= 2 ? "#2fb98c" : strength === 1 ? "#e0a33b" : "#e0564f"} />
                        <div className="space-y-1">
                          {PASSWORD_RULES.map((r) => {
                            const pass = r.test(pw);
                            return (
                              <p key={r.id} className="flex items-center gap-1.5 text-[11px]"
                                style={{ color: pass ? "#2fb98c" : "#6b7d96" }}>
                                <span className="inline-flex">{pass ? <Ic.check size={11} /> : <Ic.x size={11} />}</span>{r.label}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {field("Confirm password",
                      <input className="field" type="password" placeholder="repeat it" value={pw2}
                        autoComplete="new-password" onChange={(e) => setPw2(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />)}
                    {pw2.length > 0 && pw !== pw2 && <p className="text-[11px] text-down">Passwords don't match.</p>}
                  </>
                )}

                <button className="btn btn-teal w-full" style={{ padding: "10px 14px" }}
                  disabled={disabled} onClick={submit}>
                  {busy ? "Working..." :
                   mode === "signup" ? "Create account" :
                   mode === "signin" ? "Sign in" :
                   mode === "forgot" ? "Email me a reset link" : "Set new password"}
                </button>

                <div className="flex items-center justify-between pt-1">
                  {mode === "signin" ? (
                    <>
                      <button className="text-[11.5px] text-fog-500 hover:text-fog-300 transition-colors"
                        onClick={() => { setNotice(null); setMode("signup"); }}>Create an account</button>
                      <button className="text-[11.5px] text-fog-500 hover:text-fog-300 transition-colors"
                        onClick={() => { setNotice(null); setMode("forgot"); }}>Forgot password?</button>
                    </>
                  ) : (
                    <button className="text-[11.5px] text-fog-500 hover:text-fog-300 transition-colors"
                      onClick={() => { setNotice(null); setMode("signin"); }}>Back to sign in</button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid #1c2942" }}>
              <p className="text-[10.5px] text-fog-500">Locked out? Erase local practice data</p>
              <button className="text-[10.5px] text-down hover:opacity-80 transition-opacity"
                onClick={() => setDelOpen(true)}>Clear this device</button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={delOpen} onClose={() => { setDelOpen(false); setDelText(""); }}
        title={<span className="flex items-center gap-2"><span className="text-down inline-flex"><Ic.alert size={16} /></span> Clear local data</span>}>
        <p className="text-[12.5px] text-fog-300 leading-relaxed mb-3">
          This wipes the trading data stored in this browser - plan, trades, journals, scores. It is immediate and cannot be undone.
        </p>
        <p className="text-[12px] text-fog-400 leading-relaxed mb-4">
          Your account itself is not affected: it lives on our servers and you can still sign in.
          To delete the account too, sign in and use account deletion.
        </p>
        <label className="lbl block mb-1.5">Type ERASE to confirm</label>
        <input className="field mb-4" value={delText} onChange={(e) => setDelText(e.target.value)} placeholder="ERASE" />
        <div className="grid grid-cols-2 gap-2.5">
          <button className="btn btn-ghost" onClick={() => { setDelOpen(false); setDelText(""); }}>Cancel</button>
          <button className="btn btn-down" disabled={delText.trim().toUpperCase() !== "ERASE"}
            onClick={() => { wipeEverything(); window.location.reload(); }}>Erase everything</button>
        </div>
      </Modal>
    </div>
  );
}
