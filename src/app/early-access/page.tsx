"use client";

import { useState, useEffect, useRef } from "react";

const ACCESS_CODE = "Ilovevesting";
type Step = "code" | "email" | "otp";

export default function EarlyAccessPage() {
  const [step, setStep]           = useState<Step>("code");
  const [code, setCode]           = useState("");
  const [email, setEmail]         = useState("");
  const [otp, setOtp]             = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [betaFull, setBetaFull]   = useState(false);
  const [slotsLeft, setSlotsLeft] = useState<number | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/beta/status")
      .then((r) => r.json())
      .then((d) => { setBetaFull(d.full === true); setSlotsLeft(d.remaining ?? null); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step === "email") emailRef.current?.focus();
    if (step === "otp")   otpRef.current?.focus();
  }, [step]);

  // ── Step 1: access code ───────────────────────────────────────────────────
  function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (betaFull) { setError("Beta is currently full. Join the waitlist."); return; }
    if (code !== ACCESS_CODE) { setError("Incorrect code. Try again."); return; }
    setStep("email");
  }

  // ── Step 2: email ─────────────────────────────────────────────────────────
  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send code. Try again."); return; }
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: verify OTP ────────────────────────────────────────────────────
  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Incorrect code. Try again."); return; }
      // Set early-access cookie then do a full navigation so middleware + session are both committed
      // 2592000 = 30 days — matches the iron-session TTL so users stay logged in for the same period
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `vestr_early_access=1; path=/; max-age=2592000; SameSite=Strict${secure}`;
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Shared card chrome ────────────────────────────────────────────────────
  const stepLabels: Record<Step, string> = { code: "1", email: "2", otp: "3" };
  const stepTitles: Record<Step, string> = {
    code:  "Early Access",
    email: "Create your account",
    otp:   "Check your email",
  };
  const stepSubs: Record<Step, string> = {
    code:  "Enter your access code to continue.",
    email: "We'll send a sign-in code to verify your email.",
    otp:   `We sent a 6-digit code to ${email}`,
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#f8fafc" }}>
      <div className="w-full max-w-sm rounded-3xl px-8 py-10 flex flex-col items-center text-center"
        style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 8px 40px rgba(15,23,42,0.08)" }}>

        {/* Logo */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
          <span className="text-white font-bold text-lg">V</span>
        </div>

        {betaFull ? (
          <>
            <h1 className="text-xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>Beta is Full</h1>
            <p className="text-sm mb-8" style={{ color: "#64748b" }}>
              All 100 beta spots have been claimed. Join the waitlist and we&apos;ll reach out when more spots open.
            </p>
            <a href="/" className="flex items-center justify-center w-full py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}>
              Join the waitlist →
            </a>
          </>
        ) : (
          <>
            {/* Step progress dots */}
            <div className="flex items-center gap-2 mb-6">
              {(["code", "email", "otp"] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                    style={{
                      background: s === step ? "linear-gradient(135deg,#2563eb,#7c3aed)" : step > s ? "rgba(37,99,235,0.15)" : "rgba(0,0,0,0.06)",
                      color: s === step ? "white" : step > s ? "#2563eb" : "#94a3b8",
                    }}>
                    {stepLabels[s]}
                  </div>
                  {i < 2 && <div className="w-8 h-px" style={{ background: "rgba(0,0,0,0.08)" }} />}
                </div>
              ))}
            </div>

            <h1 className="text-xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              {stepTitles[step]}
            </h1>
            <p className="text-sm" style={{ color: "#64748b" }}>{stepSubs[step]}</p>

            {slotsLeft !== null && slotsLeft <= 20 && step === "code" ? (
              <p className="text-xs font-semibold mt-2 mb-6" style={{ color: "#f59e0b" }}>
                {slotsLeft} spot{slotsLeft !== 1 ? "s" : ""} remaining
              </p>
            ) : <div className="mb-6" />}

            {/* ── Step 1: code ─────────────────────────────────────────── */}
            {step === "code" && (
              <form onSubmit={handleCode} className="w-full flex flex-col gap-3">
                <input type="password" value={code} onChange={e => { setCode(e.target.value); setError(""); }}
                  placeholder="Access code" autoFocus
                  className="w-full text-sm px-4 py-3 rounded-xl outline-none text-center tracking-widest"
                  style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.1)", color: "#0f172a" }} />
                {error && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{error}</p>}
                <button type="submit" disabled={!code}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}>
                  Continue →
                </button>
              </form>
            )}

            {/* ── Step 2: email ────────────────────────────────────────── */}
            {step === "email" && (
              <form onSubmit={handleEmail} className="w-full flex flex-col gap-3">
                <input ref={emailRef} type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
                  placeholder="your@email.com" required
                  className="w-full text-sm px-4 py-3 rounded-xl outline-none text-center"
                  style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.1)", color: "#0f172a" }} />
                {error && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{error}</p>}
                <button type="submit" disabled={loading || !email}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}>
                  {loading ? "Sending…" : "Send sign-in code →"}
                </button>
                <button type="button" onClick={() => { setStep("code"); setError(""); }}
                  className="text-xs" style={{ color: "#94a3b8" }}>← Back</button>
              </form>
            )}

            {/* ── Step 3: OTP ──────────────────────────────────────────── */}
            {step === "otp" && (
              <form onSubmit={handleOtp} className="w-full flex flex-col gap-3">
                <input ref={otpRef} type="text" inputMode="numeric" value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  placeholder="000000" maxLength={6}
                  className="w-full text-sm px-4 py-3 rounded-xl outline-none text-center tracking-[0.5em] font-mono"
                  style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.1)", color: "#0f172a" }} />
                {error && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{error}</p>}
                <button type="submit" disabled={loading || otp.length < 6}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}>
                  {loading ? "Verifying…" : "Access Vestream →"}
                </button>
                <button type="button" onClick={() => { setStep("email"); setOtp(""); setError(""); }}
                  className="text-xs" style={{ color: "#94a3b8" }}>← Resend to different email</button>
              </form>
            )}

            <p className="text-xs mt-6" style={{ color: "#94a3b8" }}>
              Don&apos;t have an access code?{" "}
              <a href="/" className="underline" style={{ color: "#64748b" }}>Join the waitlist</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
