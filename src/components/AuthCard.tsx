"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "email" | "code";

export function AuthCard() {
  const router = useRouter();
  const [step,    setStep]    = useState<Step>("email");
  const [email,   setEmail]   = useState("");
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "send", email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send code. Try again."); return; }
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "verify", email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Incorrect code. Try again."); return; }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const primaryBtn: React.CSSProperties = {
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    boxShadow:  "0 4px 16px rgba(37,99,235,0.25)",
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-white"
      style={{ border: "1px solid #e5e7eb", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", width: "100%", maxWidth: 400 }}>

      {/* Header */}
      <div className="px-7 pt-7 pb-5" style={{ borderBottom: "1px solid #f1f5f9" }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <span className="font-bold text-gray-900" style={{ fontSize: 16, letterSpacing: "-0.02em" }}>TokenVest</span>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          {step === "email"
            ? "Enter your email to sign in or create a free account."
            : <>Check your inbox — we sent a code to <span className="font-semibold text-gray-800">{email}</span>.</>
          }
        </p>
      </div>

      {/* Body */}
      <div className="px-7 py-6">
        {step === "email" ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-3">
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke="#9ca3af" strokeWidth={2} strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                type="email" required autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none text-gray-900 transition-colors"
                style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
                onFocus={e => (e.target.style.borderColor = "#3b82f6")}
                onBlur={e  => (e.target.style.borderColor = "#e5e7eb")}
              />
            </div>

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 hover:brightness-110"
              style={primaryBtn}
            >
              {loading ? "Sending…" : "Send sign-in code →"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
            <input
              type="text" required autoFocus
              inputMode="numeric" maxLength={6}
              placeholder="● ● ● ● ● ●"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-4 py-4 rounded-xl text-center font-mono outline-none text-gray-900 transition-colors"
              style={{
                background: "#f9fafb", border: "1px solid #e5e7eb",
                fontSize: "1.5rem", letterSpacing: "0.4em",
              }}
              onFocus={e => (e.target.style.borderColor = "#3b82f6")}
              onBlur={e  => (e.target.style.borderColor = "#e5e7eb")}
            />

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 hover:brightness-110"
              style={primaryBtn}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(null); }}
              className="text-xs text-center text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="px-7 pb-5 text-center">
        <p className="text-[11px] text-gray-400">
          No password · no wallet required · free account on sign-up
        </p>
      </div>
    </div>
  );
}
