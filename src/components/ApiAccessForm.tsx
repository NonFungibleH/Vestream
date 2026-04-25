"use client";
import { useState } from "react";

const PROTOCOLS = ["Sablier", "UNCX", "Hedgey", "Unvest", "Team Finance"];

export function ApiAccessForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", useCase: "" });
  const [protocols, setProtocols] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function toggleProtocol(p: string) {
    setProtocols(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/api-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, protocols }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? "Something went wrong"); setStatus("error"); return; }
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
            <path d="M5 12l4 4 10-10" stroke="#2D8A4A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="font-bold text-xl mb-2" style={{ color: "white" }}>Request received</h3>
        <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
          We&apos;ll review your application and send your API key to <strong style={{ color: "white" }}>{form.email}</strong> within 1–2 business days.
        </p>
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

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Protocols you need (optional)</label>
        <div className="flex flex-wrap gap-2">
          {PROTOCOLS.map(p => {
            const active = protocols.includes(p);
            return (
              <button key={p} type="button" onClick={() => toggleProtocol(p)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: active ? "rgba(28,184,184,0.15)" : "rgba(255,255,255,0.05)",
                  border: active ? "1px solid rgba(28,184,184,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  color: active ? "#1CB8B8" : "rgba(255,255,255,0.45)",
                }}>
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {status === "error" && (
        <p className="text-sm px-4 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
          {errorMsg}
        </p>
      )}

      <button type="submit" disabled={status === "loading"}
        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60 mt-1"
        style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", color: "white", boxShadow: "0 4px 20px rgba(28,184,184,0.35)" }}>
        {status === "loading" ? "Submitting..." : "Request API Access →"}
      </button>

      <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
        We review every application. You&apos;ll hear back within 1–2 business days.
      </p>
    </form>
  );
}
