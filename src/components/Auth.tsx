/* Auth screen - signup, verification, sign-in, forgot/reset, lockout.
   Session email is the key for owner privileges (see lib/admin.ts). */
import { useEffect, useState } from "react";
import { useApp } from "../lib/store";
import {
  PASSWORD_RULES, VERIFICATION_MS,
  createAccountRecord, createReset, createSession, codeExpired, codeExpiresAt,
  hashPassword, issueVerification, loadAccount, loadReset, clearReset,
  lockInfo, maskEmail, passwordStrength, rateLimited, recordLoginFail, resetLockout,
  saveAccount, sleep, validatePassword, wipeEverything,
  type LockState, type StoredAccount,
} from "../lib/auth";
import { setActiveEmail } from "../lib/admin";
import { Bar, Ic, Modal } from "./ui";

type Mode = "signup" | "signin" | "verify" | "forgot" | "reset";
const norm = (e: string) => e.trim().toLowerCase();
const fmtCountdown = (ms: number) => Math.floor(ms / 60000) + ":" + String(Math.max(0, Math.ceil((ms % 60000) / 1000))).padStart(2, "0");

export default function Auth() {
  const [mode, setMode] = useState<Mode>(() => (loadAccount() ? "signin" : "signup"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "down"; text: string } | null>(null);
  const [deviceAcct, setDeviceAcct] = useState<StoredAccount | null>(() => loadAccount());
  const [revealEmail, setRevealEmail] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [eraseArm, setEraseArm] = useState(false);
  const [verifyAcct, setVerifyAcct] = useState<StoredAccount | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [lockTick, setLockTick] = useState(0);

  const lock = lockInfo();
  useEffect(() => {
    const iv = setInterval(() => setLockTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  void lockTick;

  const codeRemainingMs = verifyAcct ? Math.max(0, codeExpiresAt(verifyAcct) - Date.now()) : 0;
  const codeIsExpired = mode === "verify" && (!verifyAcct || codeExpired(verifyAcct));

  const say = (tone: "ok" | "warn" | "down", text: string) => setNotice({ tone, text });
  const policy = validatePassword(pw);
  const strength = passwordStrength(pw);

  const enterDesk = (a: StoredAccount) => {
    createSession(a.email);
    setActiveEmail(a.email);
    window.location.reload();
  };

  const doSignup = async () => {
    setBusy(true); setNotice(null);
    if (rateLimited("signup", 3, 60_000).limited) { say("warn", "Too many attempts - wait a minute."); setBusy(false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(email))) { say("down", "Enter a valid email address."); setBusy(false); return; }
    if (name.trim().length < 2) { say("down", "Enter your name (2+ characters)."); setBusy(false); return; }
    if (!policy.ok) { say("down", "Password missing: " + policy.failed.join(", ") + "."); setBusy(false); return; }
    if (pw !== pw2) { say("down", "Passwords don't match."); setBusy(false); return; }
    const acct = await createAccountRecord(email, name, pw);
    issueVerification(acct);
    saveAccount(acct);
    setVerifyAcct(acct);
    setDevCode(acct.pendingCode!);
    setCode("");
    setMode("verify");
    say("ok", "Verification code sent - it expires in 10 minutes.");
    setBusy(false);
  };

  const doVerify = () => {
    setBusy(true); setNotice(null);
    if (rateLimited("verify", 5, 60_000).limited) { say("warn", "Too many attempts. Try again in a minute."); setBusy(false); return; }
    const a = loadAccount();
    if (!a) { setMode("signup"); setBusy(false); return; }
    if (codeExpired(a)) {
      issueVerification(a); saveAccount(a); setVerifyAcct(a); setDevCode(a.pendingCode!); setCode("");
      say("warn", "That code expired (codes live 10 minutes). A fresh one was sent.");
      setBusy(false); return;
    }
    if (code.trim() !== a.pendingCode) { say("down", "That code doesn't match. Check the dev inbox below."); setBusy(false); return; }
    a.verified = true; delete a.pendingCode; delete a.pendingCodeExpiresAt;
    saveAccount(a);
    enterDesk(a);
  };

  const failMsg = (r: LockState) =>
    r.locked
      ? (r.scope === "device"
          ? "Too many failures from this browser - every sign-in here is paused for 15 minutes (device lock)."
          : "Too many failed attempts - account locked for 5 minutes.")
      : "Incorrect credentials (" + (5 - r.attempts) + " attempt" + (5 - r.attempts === 1 ? "" : "s") + " left before lockout).";

  const doSignin = async () => {
    setBusy(true); setNotice(null);
    if (lock.locked) {
      say("warn", lock.scope === "device"
        ? "Device sign-in paused. Retry in " + Math.ceil(lock.retryInMs / 1000) + "s."
        : "Account locked. Try again in " + Math.ceil(lock.retryInMs / 1000) + "s.");
      setBusy(false); return;
    }
    if (rateLimited("login", 10, 60_000).limited) { say("warn", "Too many sign-in attempts. Slow down."); setBusy(false); return; }
    const fails = lockInfo().attempts;
    const bd = fails > 0 ? [0, 2000, 4000, 8000, 15000][Math.min(fails, 4)] : 0;
    if (bd > 0) {
      say("warn", "Slowing down - checking in " + Math.round(bd / 1000) + "s (anti-guessing backoff)...");
      await sleep(bd);
    }
    const a = loadAccount();
    if (!a || norm(email) !== a.email) { say("down", failMsg(recordLoginFail())); setDeviceAcct(a); setBusy(false); return; }
    const hash = await hashPassword(pw, a.salt);
    if (hash !== a.hash) { say("down", failMsg(recordLoginFail())); setBusy(false); return; }
    if (!a.verified) {
      issueVerification(a); saveAccount(a); setVerifyAcct(a); setDevCode(a.pendingCode!); setCode("");
      setMode("verify"); say("warn", "This account isn't verified yet - a fresh code was issued.");
      setBusy(false); return;
    }
    resetLockout();
    enterDesk(a);
  };

  const doForgot = () => {
    setBusy(true); setNotice(null);
    if (rateLimited("forgot", 3, 60_000).limited) { say("warn", "Too many requests - wait a minute."); setBusy(false); return; }
    const a = loadAccount();
    if (!a || norm(email) !== a.email) { say("down", "No account matches that email."); setBusy(false); return; }
    const r = createReset(a.email);
    setDevCode(r.code);
    setMode("reset");
    say("ok", "Reset code issued - valid 15 minutes.");
    setBusy(false);
  };

  const doReset = async () => {
    setBusy(true); setNotice(null);
    if (!policy.ok) { say("down", "Password missing: " + policy.failed.join(", ") + "."); setBusy(false); return; }
    if (pw !== pw2) { say("down", "Passwords don't match."); setBusy(false); return; }
    const r = loadReset();
    const a = loadAccount();
    if (!r || Date.now() > r.expiresAt) { say("down", "Reset token expired. Request a new one."); setBusy(false); return; }
    if (code.trim() !== r.code) { say("down", "Code doesn't match."); setBusy(false); return; }
    if (!a) { setMode("signup"); setBusy(false); return; }
    const fresh = await createAccountRecord(a.email, a.name, pw);
    a.salt = fresh.salt; a.hash = fresh.hash; a.verified = true;
    saveAccount(a);
    clearReset();
    enterDesk(a);
  };

  const resendCode = () => {
    if (rateLimited("resend", 3, 5 * 60_000).limited) { say("warn", "Resend limit reached - try again in a few minutes."); return; }
    const a = loadAccount();
    if (!a) return;
    issueVerification(a); saveAccount(a);
    setVerifyAcct(a);
    setDevCode(a.pendingCode!);
    setCode("");
    say("ok", "Fresh code sent. The previous one is void.");
  };

  const doEraseAccount = () => {
    clearReset();
    try { localStorage.removeItem("dt:account"); } catch { /* blocked */ }
    setActiveEmail(null);
    setDeviceAcct(null);
    setEraseArm(false);
    setRevealEmail(false);
    setMode("signup");
    setNotice(null);
    setDevCode(null);
    setEmail(""); setPw(""); setPw2(""); setCode("");
  };

  const submit =
    mode === "signup" ? doSignup : mode === "verify" ? doVerify :
    mode === "forgot" ? doForgot : mode === "reset" ? doReset : doSignin;
  const submitLabel =
    mode === "signup" ? "Create account" : mode === "verify" ? (codeIsExpired ? "Code expired - resend to continue" : "Verify & enter") :
    mode === "forgot" ? "Send reset code" : mode === "reset" ? "Set new password" : "Sign in";
  const submitDisabled = busy ||
    (mode === "signin" && lock.locked) ||
    (mode === "verify" && codeIsExpired) ||
    (mode === "reset" && code.trim().length !== 6);

  const titles: Record<Mode, string> = {
    signup: "Create your account",
    signin: "Sign in to your desk",
    verify: "Verify your email",
    forgot: "Forgot password",
    reset: "Set a new password",
  };

  return (
    <div className="h-full overflow-y-auto bg-ambient relative">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 w-full max-w-[920px] items-stretch">
          {/* brand card */}
          <div className="panel p-7 hidden lg:flex flex-col animate-fade-up" style={{ background: "linear-gradient(160deg, rgba(17,27,48,0.95), rgba(10,17,32,0.95))" }}>
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
                ["Email verification required - codes expire in 10 minutes.", "#39c5a5"],
                ["Passwords hashed with PBKDF2 (150k iterations).", "#e0a33b"],
                ["Two-layer brute-force protection: 5 failures lock the account, 10 pause the device.", "#6fb6e8"],
                ["Sessions auto-expire after 15 minutes idle.", "#b48ef0"],
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
            <p className="text-[11.5px] text-fog-500 mb-5">
              {mode === "signup" ? "One local account per device. Virtual money only." :
               mode === "verify" ? "Enter the 6-digit code from the dev inbox below." :
               mode === "forgot" ? "We'll issue a time-limited reset code." :
               mode === "reset" ? "Token valid for 15 minutes." :
               "Welcome back. The tape moved while you were away."}
            </p>

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

            <div className="space-y-3.5">
              {mode === "signup" && (
                <div>
                  <label className="lbl block mb-1.5">Name</label>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} />
                </div>
              )}

              {(mode === "signup" || mode === "signin" || mode === "forgot") && (
                <div>
                  <label className="lbl block mb-1.5">Email</label>
                  <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
              )}

              {(mode === "signup" || mode === "signin" || mode === "reset") && (
                <div>
                  <label className="lbl block mb-1.5">{mode === "reset" ? "New password" : "Password"}</label>
                  <input className="field num" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="min 8 chars, letters + numbers" />
                  {mode !== "signin" && pw.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <Bar value={strength / 3} color={strength >= 3 ? "#2fb98c" : strength === 2 ? "#e0a33b" : "#e0564f"} h={4} />
                      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {PASSWORD_RULES.map((r) => (
                          <li key={r.id} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: r.test(pw) ? "#2fb98c" : "#6b7d96" }}>
                            <span className="inline-flex">{r.test(pw) ? <Ic.check size={11} /> : <Ic.x size={11} />}</span>{r.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {(mode === "signup" || mode === "reset") && (
                <div>
                  <label className="lbl block mb-1.5">Confirm password</label>
                  <input className="field num" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="repeat it" />
                </div>
              )}

              {(mode === "verify" || mode === "reset") && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="lbl">6-digit code</label>
                    {mode === "verify" && (
                      <span className={"num text-[10.5px] font-bold px-1.5 py-0.5 rounded " + (codeIsExpired ? "text-down" : "text-fog-400")}
                        style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
                        {codeIsExpired ? "expired" : fmtCountdown(codeRemainingMs) + " left"}
                      </span>
                    )}
                  </div>
                  <input className="field num text-center" style={{ letterSpacing: "0.4em", fontSize: 18 }} value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000" inputMode="numeric" disabled={codeIsExpired}
                    onKeyDown={(e) => { if (e.key === "Enter" && !codeIsExpired) submit(); }} />
                  {mode === "verify" && (
                    <div className="mt-2">
                      <Bar value={codeRemainingMs / VERIFICATION_MS} color={codeIsExpired ? "#e0564f" : codeRemainingMs < 2 * 60_000 ? "#e0a33b" : "#39c5a5"} h={3} />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[10.5px] leading-snug" style={{ color: codeIsExpired ? "#e0564f" : "#6b7d96" }}>
                          {codeIsExpired ? "Code expired - request a fresh one. The old code is void." : "Codes expire after 10 minutes."}
                        </p>
                        <button onClick={resendCode} className="text-[11px] font-semibold text-teal hover:underline shrink-0 ml-2">Resend code</button>
                      </div>
                    </div>
                  )}
                  {devCode && (
                    <div className="mt-2 rounded-lg px-3 py-2 text-[11px] leading-snug" style={{ background: "#0a1120", border: "1px dashed #2a3c5e" }}>
                      <span className="text-fog-500">Dev inbox (no mail server on this build): your code is </span>
                      <button onClick={() => setCode(devCode)} className="num font-bold text-teal hover:underline">{devCode}</button>
                      <span className="text-fog-600"> - click to fill. In production this is emailed and never shown.</span>
                    </div>
                  )}
                </div>
              )}

              <button className="btn btn-teal w-full" style={{ padding: "11px 14px", fontSize: 13.5 }} disabled={submitDisabled} onClick={submit}>
                {busy ? "Working..." : submitLabel}
              </button>

              <div className="flex items-center justify-between pt-1">
                {mode === "signin" ? (
                  <>
                    <button className="text-[11px] text-fog-500 hover:text-fog-300 transition-colors" onClick={() => { setMode("forgot"); setNotice(null); }}>Forgot password?</button>
                    <button className="text-[11px] text-fog-500 hover:text-fog-300 transition-colors" onClick={() => { setMode("signup"); setNotice(null); }}>New here? Create account</button>
                  </>
                ) : (
                  <button className="text-[11px] text-fog-500 hover:text-fog-300 transition-colors" onClick={() => { setMode(loadAccount() ? "signin" : "signup"); setNotice(null); }}>Back</button>
                )}
              </div>

              {deviceAcct && mode === "signin" && (
                <div className="panel-inset p-3 flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full font-display font-bold text-[13px]"
                    style={{ background: "rgba(57,197,165,0.12)", border: "1px solid rgba(57,197,165,0.4)", color: "#39c5a5" }}>
                    {deviceAcct.email[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="lbl mb-0.5">Account on this device</p>
                    <p className="num text-[12px] text-fog-200 truncate">{revealEmail ? deviceAcct.email : maskEmail(deviceAcct.email)}</p>
                  </div>
                  <button className="text-[10.5px] font-semibold text-teal hover:underline ml-auto shrink-0" onClick={() => setRevealEmail((v) => !v)}>
                    {revealEmail ? "HIDE" : "SHOW"}
                  </button>
                  <span className={"lbl px-1.5 py-0.5 rounded shrink-0 " + (deviceAcct.verified ? "text-up" : "text-amber")}
                    style={{ border: "1px solid " + (deviceAcct.verified ? "rgba(47,185,140,0.4)" : "rgba(224,163,59,0.4)"), fontSize: 8.5 }}>
                    {deviceAcct.verified ? "VERIFIED" : "UNVERIFIED"}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4" style={{ borderTop: "1px solid #16213a" }}>
              {!eraseArm ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button className="text-[10.5px] text-fog-600 hover:text-fog-300 transition-colors" onClick={() => setEraseArm(true)}>
                    Locked out? Erase account only
                  </button>
                  <button className="text-[10.5px] font-semibold text-down hover:opacity-80 transition-opacity" onClick={() => { setDelText(""); setDelOpen(true); }}>
                    Delete account & all data
                  </button>
                </div>
              ) : (
                <div className="rounded-lg px-3 py-2.5 animate-pop" style={{ background: "rgba(224,86,79,0.07)", border: "1px solid rgba(224,86,79,0.4)" }}>
                  <p className="text-[11px] text-fog-300 leading-snug mb-2">
                    Erase credentials, session, lockout & throttle data? <strong className="text-fog-100">Trading history is kept.</strong>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="btn" style={{ background: "#e0564f", borderColor: "#e0564f", color: "#fff5f4", padding: "4px 12px", fontSize: 11 }} onClick={doEraseAccount}>
                      Yes, erase it
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setEraseArm(false)}>Cancel</button>
                    <span className="ml-auto num text-[9.5px] text-fog-600">auto-cancels in 4s</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal open={delOpen} onClose={() => setDelOpen(false)}
        title={<span className="flex items-center gap-2 text-down"><span className="inline-flex"><Ic.alert size={16} /></span> Delete account & all data</span>}>
        <p className="text-[12.5px] text-fog-300 leading-relaxed mb-3.5">
          This permanently erases <strong className="text-fog-100">everything this app stores about you</strong> on this device. No undo, no trash bin, no recovery email.
        </p>
        <ul className="space-y-1.5 mb-4">
          {[
            "Account credentials, session and login history",
            "Every trade, order and position - simulated or otherwise",
            "All journals, emotional check-ins and coach debriefs",
            "Trading plan, versions and violation ledger",
            "Process Score, Readiness Score, missions and reviews",
            "Indicator settings, watchlist state and preferences",
          ].map((t) => (
            <li key={t} className="flex gap-2.5 text-[12px] text-fog-400 leading-snug">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#e0564f" }} />{t}
            </li>
          ))}
        </ul>
        <label className="lbl block mb-1.5">Type <span className="num text-down font-bold">DELETE</span> to confirm</label>
        <input className="field num text-center" style={{ letterSpacing: "0.3em" }} value={delText} onChange={(e) => setDelText(e.target.value.toUpperCase())} placeholder="DELETE" autoFocus />
        <button className="w-full mt-4 py-2.5 rounded-lg font-display font-bold text-[13.5px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: delText === "DELETE" ? "#e0564f" : "#2a1518", border: "1px solid #e0564f", color: delText === "DELETE" ? "#fff5f4" : "#e0564f" }}
          disabled={delText !== "DELETE"}
          onClick={() => wipeEverything()}>
          Permanently delete everything
        </button>
      </Modal>
    </div>
  );
}
