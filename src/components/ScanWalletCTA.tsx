"use client";

// ScanWalletCTA — the activation hook for organic/SEO traffic.
// ─────────────────────────────────────────────────────────────────────────────
// SEO visitors land on a token / protocol / article / unlocks page, get their
// answer, and used to leave (the only CTA was "download the app"). This card
// funnels them into the free wallet scanner — the strongest activation moment —
// with an inline "paste → scan free" input that deep-links to
// /find-vestings?a=<address>, which auto-scans on arrival (see FindVestingsClient).
// Light theme + teal to match the scanner they land on.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { track } from "@/lib/analytics";

interface Props {
  heading?: string;
  sub?: string;
  /** Where this CTA is placed — for analytics attribution. */
  surface?: string;
}

export function ScanWalletCTA({ heading, sub, surface = "seo_page" }: Props) {
  const [addr, setAddr] = useState("");

  const go = () => {
    const a = addr.trim();
    try { track("cta_clicked", { cta: "scan_wallet", surface, has_address: a.length > 0 }); } catch { /* consent-gated no-op */ }
    window.location.href = a ? `/find-vestings?a=${encodeURIComponent(a)}` : "/find-vestings";
  };

  return (
    <div
      className="rounded-2xl p-5 md:p-6"
      style={{
        background: "linear-gradient(135deg, rgba(28,184,184,0.08), rgba(15,138,138,0.05))",
        border: "1px solid rgba(28,184,184,0.22)",
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <div className="flex-1">
          <p className="text-base md:text-lg font-bold" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            {heading ?? "Track your own token vesting"}
          </p>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: "#5b6470" }}>
            {sub ?? "Paste any wallet, see every unlock across 11+ protocols and 9+ chains. Free, no sign-up."}
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); go(); }}
          className="flex items-center gap-2 w-full md:w-auto"
        >
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="0x… or Solana pubkey"
            spellCheck={false}
            aria-label="Wallet address to scan"
            className="flex-1 md:w-56 px-4 py-3 text-sm font-mono rounded-xl outline-none focus:ring-2"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.10)", color: "#1A1D20" }}
          />
          <button
            type="submit"
            className="px-5 py-3 rounded-xl text-sm font-semibold text-white whitespace-nowrap transition-all hover:brightness-110"
            style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}
          >
            Scan free →
          </button>
        </form>
      </div>
    </div>
  );
}
