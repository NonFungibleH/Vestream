"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACCESS_CODE = "Ilovevesting";

export default function EarlyAccessPage() {
  const router = useRouter();
  const [code, setCode]     = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (code !== ACCESS_CODE) {
      setError("Incorrect code. Try again.");
      return;
    }

    setLoading(true);
    // Set cookie for 7 days
    document.cookie = "vestr_early_access=1; path=/; max-age=604800; SameSite=Lax";
    router.push("/dashboard");
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

        <h1 className="text-xl font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
          Early Access
        </h1>
        <p className="text-sm mb-8" style={{ color: "#64748b" }}>
          Enter your access code to continue.
        </p>

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
      </div>
    </div>
  );
}
