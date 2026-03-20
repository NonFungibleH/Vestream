"use client";

import { useState, useEffect } from "react";

const ACCESS_CODE = "Ilovevesting";

export default function EarlyAccessPage() {
  const [code, setCode]           = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [betaFull, setBetaFull]   = useState(false);
  const [slotsLeft, setSlotsLeft] = useState<number | null>(null);

  // Check beta capacity on mount
  useEffect(() => {
    fetch("/api/beta/status")
      .then((r) => r.json())
      .then((d) => {
        setBetaFull(d.full === true);
        setSlotsLeft(d.remaining ?? null);
      })
      .catch(() => {/* fail open — don't block sign-ups if API is unreachable */});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (betaFull) {
      setError("Beta is currently full. Join the waitlist.");
      return;
    }

    if (code !== ACCESS_CODE) {
      setError("Incorrect code. Try again.");
      return;
    }

    setLoading(true);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `vestr_early_access=1; path=/; max-age=604800; SameSite=Strict${secure}`;
    window.location.href = "/dashboard";
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#f8fafc" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl px-8 py-10 flex flex-col items-center text-center"
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.07)",
          boxShadow: "0 8px 40px rgba(15,23,42,0.08)",
        }}
      >
        {/* Logo */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
        >
          <span className="text-white font-bold text-lg">V</span>
        </div>

        {betaFull ? (
          /* ── Beta full state ─────────────────────────────────────────── */
          <>
            <h1 className="text-xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              Beta is Full
            </h1>
            <p className="text-sm mb-8" style={{ color: "#64748b" }}>
              All 100 beta spots have been claimed. Join the waitlist and we&apos;ll reach out when more spots open.
            </p>
            <a
              href="/"
              className="flex items-center justify-center w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
            >
              Join the waitlist →
            </a>
          </>
        ) : (
          /* ── Normal code entry ───────────────────────────────────────── */
          <>
            <h1 className="text-xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
              Early Access
            </h1>
            <p className="text-sm" style={{ color: "#64748b" }}>
              Enter your access code to continue.
            </p>

            {slotsLeft !== null && slotsLeft <= 20 ? (
              <p className="text-xs font-semibold mt-2 mb-6" style={{ color: "#f59e0b" }}>
                {slotsLeft} spot{slotsLeft !== 1 ? "s" : ""} remaining
              </p>
            ) : (
              <div className="mb-8" />
            )}

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
              <input
                type="password"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(""); }}
                placeholder="Access code"
                autoFocus
                disabled={loading}
                className="w-full text-sm px-4 py-3 rounded-xl outline-none text-center tracking-widest disabled:opacity-60"
                style={{
                  background: "#f8fafc",
                  border: "1px solid rgba(0,0,0,0.1)",
                  color: "#0f172a",
                }}
              />
              {error && (
                <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !code}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
              >
                {loading ? "Entering…" : "Continue"}
              </button>
            </form>

            <p className="text-xs mt-6" style={{ color: "#94a3b8" }}>
              Don&apos;t have an access code?{" "}
              <a href="/" className="underline" style={{ color: "#64748b" }}>
                Join the waitlist
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
