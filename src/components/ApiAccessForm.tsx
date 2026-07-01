"use client";
import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

/** Server response is intentionally minimal to prevent email enumeration –
 *  the actual API key (new or existing-key recovery info) lands via email,
 *  not in the browser. See /api/api-access/route.ts for the design note. */
interface IssueResponse {
  ok:       boolean;
  message?: string;
}

export function ApiAccessForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", useCase: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
      // No new/duplicate distinction in the response any more (privacy). The
      // outcome is uniformly "submitted" from the client's POV. The server
      // still knows internally and routes the right email content.
      track("api_access_requested", {
        has_company: Boolean(form.company?.trim()),
        outcome:     "submitted",
      });
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  // ── Success: check your inbox ──────────────────────────────────────────
  // Identical UI regardless of whether a fresh key was issued or an
  // existing-key recovery email was sent – preserves the enumeration-safe
  // backend response.
  if (status === "success") {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "rgba(45,179,106,0.12)", border: "1px solid rgba(45,179,106,0.30)" }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#2DB36A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h3 className="font-bold text-xl mb-2" style={{ color: "white" }}>Check your inbox</h3>
        <p className="text-sm leading-relaxed max-w-md mx-auto mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
          We&apos;ve sent your API key details to <strong style={{ color: "white" }}>{form.email}</strong>.
          Keep an eye on your inbox (and spam folder) – it usually arrives within a minute.
        </p>
        <div className="rounded-xl p-4 max-w-md mx-auto mb-4"
          style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.18)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#1CB8B8" }}>
            What you get
          </p>
          <ul className="text-xs space-y-1 text-left" style={{ color: "rgba(255,255,255,0.65)" }}>
            <li>• 30 requests / minute (burst)</li>
            <li>• 150 requests / day</li>
            <li>• All 10 protocols + 7 chains</li>
            <li>• REST + MCP server access</li>
          </ul>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Didn&apos;t receive it? Email{" "}
          <a href="mailto:team@vestream.io" className="underline" style={{ color: "#1CB8B8" }}>team@vestream.io</a>.
        </p>
        <Link
          href="/developer/quickstart"
          className="block w-full max-w-md mx-auto text-center py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 mt-5"
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
          required rows={4} placeholder="Describe your use case – e.g. an AI agent that monitors vesting schedules for a fund, a wallet app showing unlock timelines..."
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
