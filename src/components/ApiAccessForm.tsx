"use client";
import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

interface IssueResponse {
  ok: boolean;
  issued?:        boolean;   // true → fresh key in `key`
  already_issued?: boolean;  // true → existing key, only `prefix` returned
  key?:    string;           // plaintext, ONLY shown once
  prefix?: string;
  tier?:   string;
  monthly_limit?: number;
  message?: string;
}

export function ApiAccessForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", useCase: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<IssueResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/api-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: IssueResponse = await res.json();
      if (!res.ok) {
        setErrorMsg((data as { error?: string }).error ?? "Something went wrong");
        setStatus("error");
        return;
      }
      track("api_access_requested", {
        has_company: Boolean(form.company?.trim()),
        outcome:     data.issued ? "issued" : data.already_issued ? "duplicate" : "queued",
      });
      setResult(data);
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  async function copyKey() {
    if (!result?.key) return;
    try {
      await navigator.clipboard.writeText(result.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard refused (rare) — user can still select-copy from the input.
    }
  }

  // ── Success: existing key (already on file) ────────────────────────────
  if (status === "success" && result?.already_issued) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "rgba(28,184,184,0.12)", border: "1px solid rgba(28,184,184,0.25)" }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
        </div>
        <h3 className="font-bold text-xl mb-2" style={{ color: "white" }}>You already have a key</h3>
        <p className="text-sm leading-relaxed max-w-md mx-auto mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
          {result.message ?? `An API key starting with ${result.prefix} is already on file for ${form.email}.`}
        </p>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Lost the plaintext? Email{" "}
          <a href="mailto:hello@vestream.io" className="underline" style={{ color: "#1CB8B8" }}>hello@vestream.io</a>
          {" "}and we&apos;ll re-issue.
        </p>
      </div>
    );
  }

  // ── Success: fresh free-tier key issued — show ONCE ────────────────────
  if (status === "success" && result?.key) {
    return (
      <div className="py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(45,179,106,0.12)", border: "1px solid rgba(45,179,106,0.25)" }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <path d="M5 12l4 4 10-10" stroke="#2DB36A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg" style={{ color: "white" }}>Your free API key is ready</h3>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              We&apos;ve also emailed it to <strong style={{ color: "white" }}>{form.email}</strong>.
            </p>
          </div>
        </div>

        {/* The plaintext key — shown ONCE, copy-button included */}
        <div className="rounded-xl p-3 mb-4 flex items-center gap-2"
          style={{ background: "#0d0f14", border: "1px solid rgba(28,184,184,0.30)" }}>
          <code className="flex-1 text-xs font-mono break-all" style={{ color: "#1CB8B8" }}>
            {result.key}
          </code>
          <button
            onClick={copyKey}
            type="button"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex-shrink-0"
            style={{
              background: copied ? "rgba(45,179,106,0.15)" : "rgba(28,184,184,0.15)",
              color:      copied ? "#2DB36A" : "#1CB8B8",
              border:     copied ? "1px solid rgba(45,179,106,0.35)" : "1px solid rgba(28,184,184,0.35)",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>

        <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
          <strong style={{ color: "white" }}>Store this somewhere safe.</strong>{" "}
          We&apos;ll never show the plaintext again — only the prefix{" "}
          <code style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.7)" }}>{result.prefix}</code>{" "}
          for identification. If you lose it, request a new one or email{" "}
          <a href="mailto:hello@vestream.io" className="underline" style={{ color: "#1CB8B8" }}>hello@vestream.io</a>.
        </p>

        <div className="rounded-xl p-4 mb-3"
          style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.18)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#1CB8B8" }}>
            Your free tier
          </p>
          <ul className="text-xs space-y-1" style={{ color: "rgba(255,255,255,0.65)" }}>
            <li>• 30 requests / minute (burst)</li>
            <li>• 150 requests / day</li>
            <li>• All 9 protocols + 5 chains</li>
            <li>• REST + MCP server access</li>
          </ul>
        </div>

        <Link
          href="/developer/quickstart"
          className="block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 20px rgba(28,184,184,0.35)" }}
        >
          Quickstart guide →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Name *</label>
          <input
            type="text" required placeholder="Your name"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="text-sm px-4 py-3 rounded-xl outline-none transition-all"
            style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Email *</label>
          <input
            type="email" required placeholder="you@company.com"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="text-sm px-4 py-3 rounded-xl outline-none transition-all"
            style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Company / Project</label>
        <input
          type="text" placeholder="Acme Labs (optional)"
          value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
          className="text-sm px-4 py-3 rounded-xl outline-none transition-all"
          style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>What are you building? *</label>
        <textarea
          required rows={4} placeholder="Describe your use case — e.g. an AI agent that monitors vesting schedules for a fund, a wallet app showing unlock timelines..."
          value={form.useCase} onChange={e => setForm(f => ({ ...f, useCase: e.target.value }))}
          className="text-sm px-4 py-3 rounded-xl outline-none transition-all resize-none"
          style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.1)", color: "white", lineHeight: 1.6 }}
        />
      </div>

      {status === "error" && (
        <p className="text-sm px-4 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
          {errorMsg}
        </p>
      )}

      <button type="submit" disabled={status === "loading"}
        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60 mt-1"
        style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 20px rgba(28,184,184,0.35)" }}>
        {status === "loading" ? "Issuing key…" : "Get my free API key →"}
      </button>

      <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
        Free tier: 150 requests/day. Upgrade to Pro any time for 5,000/day.
      </p>
    </form>
  );
}
