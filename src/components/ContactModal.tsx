"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = "idle" | "submitting" | "success" | "error";

// ─── ContactModal ─────────────────────────────────────────────────────────────

export default function ContactModal({
  open,
  onClose,
}: {
  open:    boolean;
  onClose: () => void;
}) {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [state,   setState]   = useState<FormState>("idle");
  const [error,   setError]   = useState<string | null>(null);

  const firstInput = useRef<HTMLInputElement>(null);

  // Focus first field when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => firstInput.current?.focus(), 60);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset form when re-opened
  useEffect(() => {
    if (open) {
      setName(""); setEmail(""); setCompany(""); setMessage("");
      setState("idle"); setError(null);
    }
  }, [open]);

  if (!open) return null;

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

      const data = await res.json() as { success?: boolean; error?: string };

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

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-3xl"
        style={{ background: "white", boxShadow: "0 24px 80px rgba(0,0,0,0.18)", border: "1px solid rgba(0,0,0,0.06)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-slate-100"
          style={{ color: "#94a3b8" }}
          aria-label="Close"
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {state === "success" ? (

          /* ── Success state ─────────────────────────────────────────────── */
          <div className="px-8 py-10 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.08))", border: "1px solid rgba(37,99,235,0.15)" }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5 9-9" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: "#0f172a" }}>
              Message sent!
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "#64748b" }}>
              Thanks for reaching out. We&apos;ll get back to you shortly.
            </p>
            <button
              onClick={onClose}
              className="text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}
            >
              Done
            </button>
          </div>

        ) : (

          /* ── Form state ────────────────────────────────────────────────── */
          <>
            {/* Header */}
            <div className="px-8 pt-8 pb-5" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
              >
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <h2 id="contact-modal-title" className="text-xl font-bold mb-1" style={{ color: "#0f172a" }}>
                Get in touch
              </h2>
              <p className="text-sm" style={{ color: "#64748b" }}>
                Tell us about your portfolio or integration needs — we&apos;ll come back to you within one business day.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">

              {/* Name + Company row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
                    Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    ref={firstInput}
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2.5 rounded-xl text-sm transition-all outline-none"
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      color: "#0f172a",
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
                    Company
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Fund"
                    className="w-full px-3 py-2.5 rounded-xl text-sm transition-all outline-none"
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      color: "#0f172a",
                    }}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
                  Email <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-3 py-2.5 rounded-xl text-sm transition-all outline-none"
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#0f172a",
                  }}
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
                  Message <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your portfolio size, chains you track, or any custom integration needs..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm transition-all outline-none resize-none"
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#0f172a",
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {/* Error message */}
              {state === "error" && error && (
                <div
                  className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-xs"
                  style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}
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
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 mt-2"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}
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

              <p className="text-center text-[11px]" style={{ color: "#94a3b8" }}>
                We reply within one business day.
              </p>

            </form>
          </>

        )}
      </div>
    </div>
  );
}
