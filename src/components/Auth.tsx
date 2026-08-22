/* Auth gate — signup + verification, sign-in + lockout, forgot password. */
import { useEffect, useState } from "react";
import {
  type LockState, type StoredAccount,
  PASSWORD_RULES, DEVICE_LOCK_MS, LOGIN_LOCK_MS, LOGIN_MAX_ATTEMPTS, VERIFICATION_MS,
  backoffDelay, clearAccount, codeExpired, codeExpiresAt, createAccountRecord, createReset,
  createSession, hashPassword, issueVerification, loadAccount, loadReset, clearReset,
  lockInfo, maskEmail, passwordStrength, rateLimited, recordLoginFail, resetLockout,
  saveAccount, sleep, validatePassword, wipeEverything,
} from "../lib/auth";
import { Bar, Ic, Modal } from "./ui";

type Mode = "signup" | "signin" | "verify" | "forgot" | "reset";
const norm = (e: string) => e.trim().toLowerCase();
const fmtCountdown = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.max(0, Math.ceil((ms % 60000) / 1000))).padStart(2, "0")}`;

export default function Auth() {
  const [mode, setMode] = useState<Mode>(() => (loadAccount() ? "signin" : "signup"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => loadAccount()?.email ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "down"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verifyAcct, setVerifyAcct] = useState<StoredAccount | null>(null);
  const [lockTick, setLockTick] = useState(0);
  const [codeTick, setCodeTick] = useState(0);
  const [eraseArm, setEraseArm] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [revealEmail, setRevealEmail] = useState(false);

  const lock = lockInfo();
  const [deviceAcct, setDeviceAcct] = useState<StoredAccount | null>(() => loadAccount());

  useEffect(() => {
    const iv = setInterval(() => setLockTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (mode !== "verify") return;
    const iv = setInterval(() => setCodeTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [mode]);
  useEffect(() => {
    if (!eraseArm) return;
    const t = setTimeout(() => setEraseArm(false), 4000);
    return () => clearTimeout(t);
  }, [eraseArm]);

  void lockTick; void codeTick;

  const say = (tone: "ok" | "warn" | "down", text: string) => setNotice({ tone, text });
  const policy = validatePassword(pw);
  const strength = passwordStrength(pw);

  const doSignup = async () => {
    setBusy(true); setNotice(null);
    if (rateLimited("signup", 3, 60_000).limited) { say("warn", "Too many attempts — wait a minute."); setBusy(false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(email))) { say("down", "Enter a valid email address."); setBusy(false); return; }
    if (name.trim().length < 2) { say("down", "Enter your name (2+ characters)."); setBusy(false); return; }
    if (!policy.ok) { say("down", `Password missing: ${policy.failed.join(", ")}.`); setBusy(false); return; }
    if (pw !== pw2) { say("down", "Passwords don't match."); setBusy(false); return; }
    const acct = await createAccountRecord(email, name, pw);
    issueVerification(acct);
    saveAccount(acct);
    setVerifyAcct(acct);
    setDevCode(acct.pendingCode!);
    setCode("");
    setMode("verify");
    say("ok", "Account created. Enter the 6-digit code to verify.");
    setBusy(false);
  };

  const doVerify = () => {
    setBusy(true); setNotice(null);
    if (rateLimited("verify", 5, 60_000).limited) { say("warn", "Too many attempts. Try again in a minute."); setBusy(false); return; }
    const a = loadAccount();
    if (!a) { setMode("signup"); setBusy(false); return; }
    if (codeExpired(a)) {
      issueVerification(a); saveAccount(a); setDevCode(a.pendingCode!); setCode("");
      say("warn", "That code expired (codes live 10 minutes). A fresh one was sent.");
      setBusy(false); return;
    }
    if (code.trim() !== a.pendingCode) { say("down", "That code doesn't match. Check the dev inbox below."); setBusy(false); return; }
    a.verified = true; delete a.pendingCode; delete a.pendingCodeExpiresAt;
    saveAccount(a);
    createSession(a.email);
    window.location.reload();
  };

  const doSignin = async () => {
    setBusy(true); setNotice(null);
    if (lock.locked) {
      say("warn", lock.scope === "device"
        ? `Device sign-in paused. Retry in ${Math.ceil(lock.retryInMs / 1000)}s.`
        : `Account locked. Try again in ${Math.ceil(lock.retryInMs / 1000)}s.`);
      setBusy(false); return;
    }
    if (rateLimited("login", 10, 60_000).limited) { say("warn", "Too many sign-in attempts. Slow down."); setBusy(false); return; }
    const delay = backoffDelay(lockInfo().attempts);
    if (delay > 0) {
      say("warn", `Slowing down — checking in ${Math.round(delay / 1000)}s (anti-guessing backoff)…`);
      await sleep(delay);
    }
    const a = loadAccount();
    if (!a || norm(email) !== a.email) { say("down", failMsg(recordLoginFail())); setDeviceAcct(a); setBusy(false); return; }
    const hash = await hashPassword(pw, a.salt);
    if (hash !== a.hash) { say("down", failMsg(recordLoginFail())); setBusy(false); return; }
    if (!a.verified) {
      issueVerification(a); saveAccount(a); setVerifyAcct(a); setDevCode(a.pendingCode!); setCode("");
      setMode("verify"); say("warn", "This account isn't verified yet — a fresh code was issued.");
      setBusy(false); return;
    }
    resetLockout();
    createSession(a.email);
    window.location.reload();
  };

  const doForgot = () => {
    setBusy(true); setNotice(null);
    if (rateLimited("forgot", 3, 60_000).limited) { say("warn", "Too many requests — wait a minute."); setBusy(false); return; }
    const a = loadAccount();
    if (!a || norm(email) !== a.email) { say("down", "No account matches that email."); setBusy(false); return; }
    const r = createReset(a.email);
    setDevCode(r.code);
    setCode("");
    setMode("reset");
    say("ok", "Reset code issued (valid 15 minutes).");
    setBusy(false);
  };

  const doReset = async () => {
    setBusy(true); setNotice(null);
    if (rateLimited("reset", 5, 60_000).limited) { say("warn", "Too many attempts — wait a minute."); setBusy(false); return; }
    const r = loadReset();
    if (!r || Date.now() > r.expiresAt) { say("down", "Reset request expired. Start over."); setMode("forgot"); setBusy(false); return; }
    if (code.trim() !== r.code) { say("down", "Code doesn't match."); setBusy(false); return; }
    if (!policy.ok) { say("down", `Password missing: ${policy.failed.join(", ")}.`); setBusy(false); return; }
    if (pw !== pw2) { say("down", "Passwords don't match."); setBusy(false); return; }
    const a = loadAccount();
    if (!a) { setMode("signup"); setBusy(false); return; }
    const fresh = await createAccountRecord(a.email, a.name, pw);
    a.salt = fresh.salt; a.hash = fresh.hash; a.verified = true;
    saveAccount(a);
    clearReset();
    createSession(a.email);
    window.location.reload();
  };

  const failMsg = (r: LockState) =>
    r.locked
      ? r.scope === "device"
        ? `Too many failures from this browser — every sign-in here is paused for ${Math.round(DEVICE_LOCK_MS / 60000)} minutes (device lock).`
        : `Too many failed attempts — account locked for ${Math.round(LOGIN_LOCK_MS / 60000)} minutes.`
      : `Incorrect credentials (${LOGIN_MAX_ATTEMPTS - r.attempts} attempt${LOGIN_MAX_ATTEMPTS - r.attempts === 1 ? "" : "s"} left before lockout).`;

  const resendCode = () => {
    if (rateLimited("resend", 3, 5 * 60_000).limited) { say("warn", "Resend limit reached — try again in a few minutes."); return; }
    const a = loadAccount();
    if (!a) return;
    issueVerification(a); saveAccount(a);
    setDevCode(a.pendingCode!); setCode("");
    say("ok", "Fresh code sent. The previous one is void.");
  };

  const doEraseAccount = () => {
    clearAccount();
    setDeviceAcct(null);
    setEraseArm(false);
    setRevealEmail(false);
    setMode("signup");
    setNotice(null);
    setDevCode(null);
    setEmail(""); setPw(""); setPw2(""); setCode("");
    say("ok", "Account erased. Trading history was kept.");
  };

  const codeRemainingMs = verifyAcct ? Math.max(0, codeExpiresAt(verifyAcct) - Date.now()) : 0;
  const codeIsExpired = verifyAcct ? codeRemainingMs <= 0 : false;
  const codeMmSs = fmtCountdown(codeRemainingMs);

  const submit =
    mode === "signup" ? doSignup : mode === "verify" ? doVerify :
    mode === "forgot" ? doForgot : mode === "reset" ? doReset : doSignin;
  const submitLabel =
    mode === "signup" ? "Create account →" : mode === "verify" ? (codeIsExpired ? "Code expired — resend to continue" : "Verify & enter →") :
    mode === "forgot" ? "Send reset code" : mode === "reset" ? "Set new password →" : "Sign in →";
  const submitDisabled = busy ||
    (mode === "signin" && lock.locked) ||
    (mode === "verify" && codeIsExpired) ||
    ((mode === "signup" || mode === "reset") && !policy.ok);

  return (
    <div className="h-full bg-ambient relative overflow-y-auto">
      <div className="absolute inset-0 bg-gridlines pointer-events-none" />
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-[860px] grid md:grid-cols-[1fr_360px] gap-5 animate-fade-in">
          {/* brand card */}
          <div className="panel relative overflow-hidden p-7 md:p-8 hidden md:flex flex-col" style={{ background: "linear-gradient(160deg,#0d1626 0%,#0a1120 70%)" }}>
            <div className="flex items-center gap-2.5 mb-6">
              <span className="text-teal"><Ic.logo size={30} /></span>
              <div>
                <h1 className="font-display font-bold text-[20px] text-fog-100 leading-none">Deliberate<span className="text-teal">Trade</span></h1>
                <p className="text-[10px] text-fog-500 tracking-[0.18em] uppercase mt-1">Deliberate practice desk</p>
              </div>
            </div>
            <p className="font-display font-bold text-[26px] leading-snug text-fog-100 mb-2">Paper trading that hurts enough to teach you.</p>
            <p className="text-[12.5px] text-fog-400 leading-relaxed mb-6 max-w-[380px]">
              Mandatory journals. Circuit breakers. A Tilt Detector that watches for revenge trading. This desk trains the discipline real money demands.
            </p>
            <div className="space-y-3 mt-auto">
              {[
                ["Email verification required — one-time codes expire after 10 minutes.", "#39c5a5"],
                ["Passwords hashed with PBKDF2 (150k iterations) — never stored in plain text.", "#e0a33b"],
                ["Two-layer brute-force protection: 5 failures lock the account 5 min; 10 pause this device 15 min.", "#6fb6e8"],
                ["Sessions expire after 15 minutes idle. Your data never leaves this browser.", "#b48ef0"],
              ].map(([t, c], i) => (
                <p key={i} className="flex gap-2.5 text-[11.5px] text-fog-400 leading-snug">
                  <span className="mt-[5px] w-2 h-2 rounded-[3px] shrink-0" style={{ background: c as string }} />{t}
                </p>
              ))}
            </div>
          </div>

          {/* auth card */}
          <div className="panel p-6 md:p-7 flex flex-col">
            <div className="md:hidden flex items-center gap-2 mb-5">
              <span className="text-teal"><Ic.logo size={26} /></span>
              <h1 className="font-display font-bold text-[17px] text-fog-100">Deliberate<span className="text-teal">Trade</span></h1>
            </div>

            <h2 className="font-display font-bold text-[19px] text-fog-100">
              {mode === "signup" ? "Create your local account" : mode === "signin" ? "Welcome back" :
               mode === "verify" ? "Verify your email" : mode === "forgot" ? "Forgot password" : "Set a new password"}
            </h2>
            <p className="text-[11.5px] text-fog-500 mb-4">
              {mode === "signin" ? "Your session is private to this device." :
               mode === "signup" ? "One local account. Nothing leaves your browser." :
               mode === "verify" ? "A one-time code was generated for your account." :
               mode === "forgot" ? "Enter the email on your account to get a reset code." :
               "Enter the code and set a strong new password."}
            </p>

            {/* device account strip */}
            {deviceAcct && (mode === "signin" || mode === "signup" || mode === "forgot") && (
              <div className="rounded-lg px-3 py-2.5 mb-4 flex items-center gap-2.5 animate-fade-in"
                style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-[12px] shrink-0"
                  style={{ background: "rgba(57,197,165,0.15)", color: "#39c5a5", border: "1px solid rgba(57,197,165,0.4)" }}>
                  {(deviceAcct.name || deviceAcct.email)[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="lbl !text-[8.5px] mb-0.5">Account on this device</p>
                  <p className="num text-[12px] text-fog-200 truncate">{revealEmail ? deviceAcct.email : maskEmail(deviceAcct.email)}</p>
                </div>
                <span className={`lbl !text-[8.5px] px-1.5 py-0.5 rounded shrink-0 ${deviceAcct.verified ? "text-up" : "text-amber"}`}
                  style={{ border: `1px solid ${deviceAcct.verified ? "rgba(47,185,140,0.4)" : "rgba(224,163,59,0.4)"}` }}>
                  {deviceAcct.verified ? "VERIFIED" : "UNVERIFIED"}
                </span>
                <button onClick={() => setRevealEmail((v) => !v)} title={revealEmail ? "Hide email" : "Show email"}
                  className="text-fog-500 hover:text-fog-200 transition-colors shrink-0 inline-flex"><Ic.eye size={14} /></button>
                <button onClick={() => { setEmail(deviceAcct.email); setMode("signin"); setNotice(null); }}
                  className="text-[10.5px] font-semibold text-teal hover:underline shrink-0">Use</button>
              </div>
            )}

            {notice && (
              <div className="rounded-lg px-3 py-2 mb-4 text-[11.5px] leading-snug animate-fade-in"
                style={{ background: `${notice.tone === "ok" ? "#2fb98c" : notice.tone === "warn" ? "#e0a33b" : "#e0564f"}14`, border: `1px solid ${notice.tone === "ok" ? "#2fb98c" : notice.tone === "warn" ? "#e0a33b" : "#e0564f"}55`, color: notice.tone === "ok" ? "#2fb98c" : notice.tone === "warn" ? "#e0a33b" : "#e0564f" }}>
                {notice.text}
              </div>
            )}

            {lock.locked && mode === "signin" && (
              <div className="rounded-lg px-3.5 py-2.5 mb-4 text-[11.5px] leading-snug animate-fade-in"
                style={{ background: "rgba(224,86,79,0.1)", border: "1px solid rgba(224,86,79,0.45)", color: "#e0564f" }}>
                <strong>{lock.scope === "device" ? "Device-wide sign-in paused." : "Brute-force lockout active."}</strong>{" "}
                {lock.scope === "device" ? "Every login from this browser is frozen — rotating emails won't help. " : "Too many failures against the account. "}
                Retry in <span className="num font-bold">{fmtCountdown(lock.retryInMs)}</span>.
              </div>
            )}

            <div className="space-y-3.5">
              {mode === "signup" && (
                <div>
                  <label className="lbl block mb-1.5">Display name</label>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" autoComplete="name" />
                </div>
              )}
              {mode !== "verify" && mode !== "reset" && (
                <div>
                  <label className="lbl block mb-1.5">Email</label>
                  <input className="field num" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </div>
              )}
              {(mode === "signup" || mode === "signin" || mode === "reset") && (
                <div>
                  <label className="lbl block mb-1.5">{mode === "reset" ? "New password" : "Password"}</label>
                  <input className="field num" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    onKeyDown={(e) => { if (e.key === "Enter" && !submitDisabled) submit(); }} />
                  {(mode === "signup" || mode === "reset") && (
                    <div className="mt-2 space-y-1 animate-fade-in">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((k) => (
                          <div key={k} className="h-[3px] flex-1 rounded-full transition-all duration-300"
                            style={{ background: k < strength ? (strength <= 1 ? "#e0564f" : strength === 2 ? "#e0a33b" : "#2fb98c") : "#1c2942" }} />
                        ))}
                      </div>
                      {PASSWORD_RULES.map((r) => {
                        const pass = r.test(pw);
                        return (
                          <p key={r.id} className="flex items-center gap-1.5 text-[10.5px] transition-colors" style={{ color: pass ? "#2fb98c" : "#6b7d96" }}>
                            <span className="inline-flex">{pass ? <Ic.check size={11} /> : <span className="w-[11px] h-[11px] rounded-full border border-current inline-block opacity-50" />}</span>
                            {r.label}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {(mode === "signup" || mode === "reset") && (
                <div>
                  <label className="lbl block mb-1.5">Confirm password</label>
                  <input className="field num" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••"
                    autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter" && !submitDisabled) submit(); }} />
                  {pw2.length > 0 && pw !== pw2 && <p className="text-[10.5px] text-down mt-1">Passwords don't match.</p>}
                </div>
              )}
              {(mode === "verify" || mode === "reset") && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="lbl">6-digit code</label>
                    {mode === "verify" && (
                      <span className={`num text-[10.5px] font-bold px-1.5 py-0.5 rounded ${codeIsExpired ? "text-down" : "text-fog-400"}`}
                        style={{ background: "#0a1120", border: "1px solid #1c2942" }}>
                        {codeIsExpired ? "expired" : `⏳ ${codeMmSs} left`}
                      </span>
                    )}
                  </div>
                  <input className="field num text-center tracking-[0.4em] text-[18px]" value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000" inputMode="numeric" disabled={codeIsExpired}
                    onKeyDown={(e) => { if (e.key === "Enter" && !codeIsExpired) submit(); }} />
                  {mode === "verify" && (
                    <div className="mt-2">
                      <Bar value={codeRemainingMs / VERIFICATION_MS} color={codeIsExpired ? "#e0564f" : codeRemainingMs < 2 * 60_000 ? "#e0a33b" : "#39c5a5"} h={3} />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[10.5px] leading-snug" style={{ color: codeIsExpired ? "#e0564f" : "#6b7d96" }}>
                          {codeIsExpired ? "Code expired — request a fresh one. The old code is void." : `Sent to ${verifyAcct?.email ?? "your inbox"}. Codes expire after 10 minutes.`}
                        </p>
                        <button onClick={resendCode} className="text-[11px] font-semibold text-teal hover:underline shrink-0 ml-2">Resend code</button>
                      </div>
                    </div>
                  )}
                  {devCode && (
                    <div className="mt-2 rounded-lg px-3 py-2 text-[11px] leading-snug" style={{ background: "#0a1120", border: "1px dashed #2a3c5e" }}>
                      <span className="text-fog-500">Dev inbox (no mail server on this build): your code is </span>
                      <button onClick={() => setCode(devCode)} className="num font-bold text-teal hover:underline">{devCode}</button>
                      <span className="text-fog-600"> — click to fill. In production this is emailed and never shown.</span>
                    </div>
                  )}
                </div>
              )}

              <button className="btn btn-teal w-full !py-2.5 !text-[13.5px]" disabled={submitDisabled} onClick={() => submit()}>
                {busy ? "Working…" : submitLabel}
              </button>

              <div className="flex items-center justify-between text-[11.5px] pt-1">
                {mode === "signin" ? (
                  <>
                    <button className="text-fog-500 hover:text-fog-200 transition-colors" onClick={() => { setMode("signup"); setNotice(null); setPw(""); setPw2(""); }}>Create account</button>
                    <button className="text-teal hover:underline" onClick={() => { setMode("forgot"); setNotice(null); setCode(""); setDevCode(null); }}>Forgot password?</button>
                  </>
                ) : mode === "signup" ? (
                  <button className="text-fog-500 hover:text-fog-200 transition-colors" onClick={() => { setMode("signin"); setNotice(null); }}>Have an account? Sign in</button>
                ) : (
                  <button className="text-fog-500 hover:text-fog-300" onClick={() => { setMode(loadAccount() ? "signin" : "signup"); setNotice(null); }}>← Back</button>
                )}
              </div>
            </div>

            <div className="mt-auto pt-5">
              {!eraseArm ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button className="text-[10.5px] text-fog-600 hover:text-fog-300 transition-colors" onClick={() => setEraseArm(true)}>
                    Locked out? Erase account only
                  </button>
                  <button className="text-[10.5px] font-semibold text-down/80 hover:text-down transition-colors" onClick={() => { setDelText(""); setDelOpen(true); }}>
                    Delete account &amp; all data
                  </button>
                </div>
              ) : (
                <div className="rounded-lg px-3 py-2.5 animate-pop" style={{ background: "rgba(224,86,79,0.07)", border: "1px solid rgba(224,86,79,0.4)" }}>
                  <p className="text-[11px] text-fog-300 leading-snug mb-2">
                    Erase credentials, session, lockout &amp; throttle data? <strong className="text-fog-100">Trading history is kept.</strong>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="btn !py-1 !px-3.5 !text-[11px] font-bold" style={{ background: "#e0564f", color: "#fff5f4", border: "1px solid #e0564f" }} onClick={doEraseAccount}>
                      Yes, erase it
                    </button>
                    <button className="btn btn-ghost !py-1 !px-3 !text-[11px]" onClick={() => setEraseArm(false)}>Cancel</button>
                    <span className="ml-auto num text-[9.5px] text-fog-600">auto-cancels in 4s</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* permanent deletion */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)}
        title={<span className="flex items-center gap-2 text-down"><span className="inline-flex"><Ic.alert size={16} /></span> Delete account &amp; all data</span>}>
        <p className="text-[12.5px] text-fog-300 leading-relaxed mb-3.5">
          This permanently erases <strong className="text-fog-100">everything this app stores about you</strong> on this device. No undo, no trash bin.
        </p>
        <ul className="space-y-1.5 mb-4">
          {[
            "Account credentials, session and login history",
            "Every trade, order and position — simulated or otherwise",
            "All journals, emotional check-ins and coach debriefs",
            "Trading plan, versions and violation ledger",
            "Process Score inputs, Readiness history, missions and reviews",
            "Indicator settings, watchlist state and preferences",
          ].map((t) => (
            <li key={t} className="flex gap-2.5 text-[12px] text-fog-400 leading-snug">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#e0564f" }} />{t}
            </li>
          ))}
        </ul>
        <label className="lbl block mb-1.5">Type <span className="num text-down font-bold">DELETE</span> to confirm</label>
        <input className="field num text-center tracking-[0.3em]" value={delText} onChange={(e) => setDelText(e.target.value.toUpperCase())} placeholder="DELETE" autoFocus />
        <button
          className="w-full mt-4 py-2.5 rounded-lg font-display font-bold text-[13.5px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: delText === "DELETE" ? "#e0564f" : "#2a1518", border: "1px solid #e0564f", color: delText === "DELETE" ? "#fff5f4" : "#e0564f" }}
          disabled={delText !== "DELETE"}
          onClick={() => wipeEverything()}>
          Permanently delete everything
        </button>
        <p className="text-[10.5px] text-fog-600 mt-3 leading-snug">
          On a hosted backend this deletes the user row and every child record in one transaction — see <span className="num">server/users.sql</span>.
        </p>
      </Modal>
    </div>
  );
}
