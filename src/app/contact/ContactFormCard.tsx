"use client";

// src/app/contact/ContactFormCard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The interactive form card embedded on /contact. Mirrors the modal version
// in `components/ContactModal.tsx` — same POST shape (/api/contact), same
// validation rules — but rendered as a full-width page card instead of a
// centred modal. Kept as a separate client component so the page shell
// (`page.tsx`) can stay server-rendered for SEO.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactFormCard() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [state,   setState]   = useState<FormState>("idle");
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "submitting") return;

    setState("submitting");
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, message }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setState("error");
      } else {
        setState("success");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div
        className="rounded-3xl p-8 md:p-10 text-center"
        style={{
          background: "white",
          border: "1px solid rgba(21,23,26,0.10)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{
            background: "linear-gradient(135deg, rgba(28,184,184,0.08), rgba(15,138,138,0.08))",
            border: "1px solid rgba(28,184,184,0.15)",
          }}
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5 9-9" stroke="#1CB8B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          Message sent!
        </h2>
        <p className="text-sm leading-relaxed mb-6 max-w-sm mx-auto" style={{ color: "#8B8E92" }}>
          Thanks for reaching out. We&apos;ll get back to you within one business day — usually sooner.
        </p>
        <button
          type="button"
          onClick={() => {
            setName(""); setEmail(""); setCompany(""); setMessage("");
            setState("idle"); setError(null);
          }}
          className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)",
            color: "white",
            boxShadow: "0 4px 16px rgba(28,184,184,0.25)",
          }}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-3xl p-6 md:p-8"
      style={{
        background: "white",
        border: "1px solid rgba(21,23,26,0.10)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name + Company */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" required>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              autoComplete="name"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all outline-none focus:ring-2 focus:ring-blue-100"
              style={{
                background: "#F5F5F3",
                border: "1px solid #e2e8f0",
                color: "#1A1D20",
              }}
            />
          </Field>
          <Field label="Company">
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Fund (optional)"
              autoComplete="organization"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all outline-none focus:ring-2 focus:ring-blue-100"
              style={{
                background: "#F5F5F3",
                border: "1px solid #e2e8f0",
                color: "#1A1D20",
              }}
            />
          </Field>
        </div>

        {/* Email */}
        <Field label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            autoComplete="email"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all outline-none focus:ring-2 focus:ring-blue-100"
            style={{
              background: "#F5F5F3",
              border: "1px solid #e2e8f0",
              color: "#1A1D20",
            }}
          />
        </Field>

        {/* Message */}
        <Field label="Message" required>
          <textarea
            required
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your use case — how many wallets, which chains, API volume, custom integration needs..."
            className="w-full px-3.5 py-3 rounded-xl text-sm transition-all outline-none resize-y focus:ring-2 focus:ring-blue-100"
            style={{
              background: "#F5F5F3",
              border: "1px solid #e2e8f0",
              color: "#1A1D20",
              lineHeight: 1.6,
              minHeight: "8rem",
            }}
          />
        </Field>

        {/* Error */}
        {state === "error" && error && (
          <div
            className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-xs"
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#B3322E",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
              <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={state === "submitting"}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 mt-2"
          style={{
            background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)",
            boxShadow: "0 4px 16px rgba(28,184,184,0.25)",
          }}
        >
          {state === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin" width={14} height={14} viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.5" strokeDasharray="8 8" strokeLinecap="round" />
              </svg>
              Sending…
            </span>
          ) : (
            "Send message →"
          )}
        </button>

        <p className="text-center text-[11px] pt-1" style={{ color: "#B8BABD" }}>
          We reply within one business day. We never share your details with third parties.
        </p>
      </form>
    </div>
  );
}

// ── Small bits ───────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label:     string;
  required?: boolean;
  children:  React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
        {label} {required && <span style={{ color: "#B3322E" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
