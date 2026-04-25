"use client";

import { useState } from "react";

export function WaitlistForm({ dark = false }: { dark?: boolean }) {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold"
          style={dark
            ? { background: "rgba(63,165,104,0.15)", border: "1px solid rgba(63,165,104,0.3)", color: "#6ee7b7" }
            : { background: "rgba(63,165,104,0.08)", border: "1px solid rgba(63,165,104,0.2)", color: "#059669" }
          }
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          You&apos;re on the list!
        </div>
        <p className="text-xs" style={{ color: dark ? "rgba(255,255,255,0.4)" : "#B8BABD" }}>
          We&apos;ll email you as soon as we launch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-2 w-full max-w-sm">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={status === "loading"}
          className="flex-1 text-sm px-4 py-3 rounded-xl outline-none disabled:opacity-60"
          style={dark
            ? {
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "white",
              }
            : {
                background: "white",
                border: "1px solid rgba(0,0,0,0.12)",
                color: "#1A1D20",
              }
          }
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex-shrink-0 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 disabled:opacity-60"
          style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.35)" }}
        >
          {status === "loading" ? "..." : "Notify me →"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-xs" style={{ color: "#B3322E" }}>{error}</p>
      )}
      <p className="text-xs" style={{ color: dark ? "rgba(255,255,255,0.4)" : "#B8BABD" }}>
        Be the first to access Vestream when we launch.
      </p>
    </form>
  );
}
