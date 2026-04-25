"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ConnectWalletProps {
  compact?: boolean;
}

export function ConnectWallet({ compact = false }: ConnectWalletProps) {
  const router = useRouter();
  const [step, setStep]     = useState<"email" | "code">("email");
  const [email, setEmail]   = useState("");
  const [code, setCode]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to send code"); return; }
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, code }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Invalid code"); return; }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Compact mode: small navbar button (just links to login) ──────────────────
  if (compact) {
    return (
      <a href="/login"
        className="text-sm font-semibold px-4 py-1.5 rounded-xl transition-all duration-150"
        style={{
          background: "#1CB8B8",
          color: "white",
          boxShadow: "0 2px 12px rgba(28,184,184,0.35)",
        }}
      >
        Sign in
      </a>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────────
  if (step === "email") {
    return (
      <form onSubmit={handleSendCode} className="flex flex-col gap-3 w-full">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </span>
          <input
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-9 pr-4 py-3 rounded-2xl text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
            }}
          />
        </div>
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !email}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-60 hover:scale-[1.02]"
          style={{
            background: "#1CB8B8",
            boxShadow: "0 4px 24px rgba(28,184,184,0.4)",
          }}
        >
          {loading ? "Sending…" : "Send sign-in code →"}
        </button>
      </form>
    );
  }

  // step === "code"
  return (
    <form onSubmit={handleVerify} className="flex flex-col gap-3 w-full">
      <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
        Code sent to <span className="font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>{email}</span>
      </p>
      <input
        type="text"
        required
        autoFocus
        inputMode="numeric"
        placeholder="6-digit code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-full px-4 py-3 rounded-2xl text-sm text-center tracking-[0.3em] font-mono outline-none"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "white",
          fontSize: "1.25rem",
        }}
      />
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      <button
        type="submit"
        disabled={loading || code.length < 6}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-60 hover:scale-[1.02]"
        style={{
          background: "#1CB8B8",
          boxShadow: "0 4px 24px rgba(28,184,184,0.4)",
        }}
      >
        {loading ? "Signing in…" : "Verify code →"}
      </button>
      <button
        type="button"
        onClick={() => { setStep("email"); setCode(""); setError(null); }}
        className="text-xs"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        ← Use a different email
      </button>
    </form>
  );
}
