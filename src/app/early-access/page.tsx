"use client";

// /early-access
// ─────────────────────────────────────────────────────────────────────────────
// Sign-in / sign-up landing for Vestream. Two steps: email → OTP.
//
// Previously had a third "access code" gate (a hardcoded shared password
// during the closed beta). Removed because:
//   1. The duplicate hurt UX. Users who came in via /login were bounced
//      here by middleware (missing vestr_early_access cookie) and forced
//      to re-enter their email + OTP a second time after typing the
//      access code. /api/auth/email now sets the early-access cookie
//      server-side on successful OTP verify, so /login alone is
//      sufficient — and this page can drop the gate entirely.
//   2. The beta-full capacity check it depended on was a soft limit only.
//      Capacity is now managed via tier (Founders Circle / Pro / Free).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Step = "email" | "otp";

export default function EarlyAccessPage() {
  const [step, setStep]           = useState<Step>("email");
  const [email, setEmail]         = useState("");
  const [otp, setOtp]             = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  // ── Step 1: email ─────────────────────────────────────────────────────────
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

  // ── Step 2: verify OTP ────────────────────────────────────────────────────
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
      // /api/auth/email now sets BOTH the iron-session cookie AND
      // vestr_early_access on successful verify, so we no longer set
      // the access cookie client-side here. Full nav so middleware sees
      // the freshly set cookies on the dashboard request.
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const stepLabels: Record<Step, string> = { email: "1", otp: "2" };
  const stepTitles: Record<Step, string> = {
    email: "Welcome to Vestream",
    otp:   "Check your email",
  };
  const stepSubs: Record<Step, string> = {
    email: "Enter your email and we'll send you a sign-in code. No password.",
    otp:   `We sent a 6-digit code to ${email}`,
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F5F5F3" }}>
      <div className="w-full max-w-sm rounded-3xl px-8 py-10 flex flex-col items-center text-center"
        style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 8px 40px rgba(15,23,42,0.08)" }}>

        <img src="/logo-icon.svg" alt="Vestream" className="w-10 h-10 mb-5" />

        {/* Step progress dots */}
        <div className="flex items-center gap-2 mb-6">
          {(["email", "otp"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                style={{
                  background: s === step ? "#1CB8B8" : step > s ? "rgba(28,184,184,0.15)" : "rgba(0,0,0,0.06)",
                  color:      s === step ? "white"   : step > s ? "#1CB8B8"               : "#B8BABD",
                }}>
                {stepLabels[s]}
              </div>
              {i < 1 && <div className="w-8 h-px" style={{ background: "rgba(21,23,26,0.10)" }} />}
            </div>
          ))}
        </div>

        <h1 className="text-xl font-bold mb-1" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          {stepTitles[step]}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8B8E92" }}>{stepSubs[step]}</p>

        {/* ── Step 1: email ────────────────────────────────────────── */}
        {step === "email" && (
          <form onSubmit={handleEmail} className="w-full flex flex-col gap-3">
            <input
              type="email" value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              placeholder="your@email.com" required autoFocus
              className="w-full text-sm px-4 py-3 rounded-xl outline-none text-center"
              style={{ background: "#F5F5F3", border: "1px solid rgba(0,0,0,0.1)", color: "#1A1D20" }}
            />
            {error && <p className="text-xs font-medium" style={{ color: "#B3322E" }}>{error}</p>}
            <button
              type="submit" disabled={loading || !email}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}
            >
              {loading ? "Sending…" : "Send sign-in code →"}
            </button>
          </form>
        )}

        {/* ── Step 2: OTP ──────────────────────────────────────────── */}
        {step === "otp" && (
          <form onSubmit={handleOtp} className="w-full flex flex-col gap-3">
            <input
              ref={otpRef} type="text" inputMode="numeric"
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              placeholder="000000" maxLength={6}
              className="w-full text-sm px-4 py-3 rounded-xl outline-none text-center tracking-[0.5em] font-mono"
              style={{ background: "#F5F5F3", border: "1px solid rgba(0,0,0,0.1)", color: "#1A1D20" }}
            />
            {error && <p className="text-xs font-medium" style={{ color: "#B3322E" }}>{error}</p>}
            <button
              type="submit" disabled={loading || otp.length < 6}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}
            >
              {loading ? "Verifying…" : "Sign in →"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              className="text-xs"
              style={{ color: "#B8BABD" }}
            >
              ← Use a different email
            </button>
          </form>
        )}

        <p className="text-xs mt-6" style={{ color: "#B8BABD" }}>
          By signing in you agree to our{" "}
          <Link href="/terms" className="underline" style={{ color: "#8B8E92" }}>Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline" style={{ color: "#8B8E92" }}>Privacy</Link>.
        </p>
      </div>
    </div>
  );
}
