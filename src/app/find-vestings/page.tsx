// src/app/find-vestings/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Public "scan any wallet" page. Designed to funnel users into the mobile app.
//
// Flow:
//   1. User pastes an address
//   2. /api/find-vestings scans all 7 protocols × 4 mainnets
//   3. Results render as a grouped summary (protocol × chain × token)
//   4. Strong mobile app CTAs prompt them to install for push alerts
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import FindVestingsClient from "./FindVestingsClient";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Find your token vestings — scan any wallet · Vestream",
  description: "Paste a wallet address and instantly see every vesting schedule across Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, and PinkSale. Free, no signup.",
  alternates: { canonical: "https://vestream.io/find-vestings" },
};

export default function FindVestingsPage() {
  return (
    <main className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pt-24 md:pt-32 pb-10 md:pb-14 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
          style={{
            background: "rgba(37,99,235,0.06)",
            color: "#2563eb",
            border: "1px solid rgba(37,99,235,0.2)",
          }}
        >
          Free · No signup · 7 protocols · 4 chains
        </div>

        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-bold mb-5"
          style={{
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #0f172a 0%, #2563eb 50%, #7c3aed 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Find every vesting<br className="hidden md:block" /> on your wallet
        </h1>
        <p className="text-base md:text-lg max-w-xl mx-auto" style={{ color: "#64748b", lineHeight: 1.6 }}>
          Paste any address. We&rsquo;ll scan Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid and PinkSale across Ethereum, BNB, Polygon and Base.
        </p>
      </section>

      {/* ── Scanner + results (client island) ─────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <FindVestingsClient />
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="max-w-5xl mx-auto px-4 md:px-8 pb-12">
        <div className="pt-8 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            © 2026 Vestream. Scan results may take 10–30 seconds for wallets with many streams.
          </p>
          <div className="flex items-center gap-4 md:gap-5 flex-wrap">
            <Link href="/developer" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Developer API</Link>
            <Link href="/ai" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>AI Agents</Link>
            <Link href="/resources" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Resources</Link>
            <Link href="/privacy" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Privacy Policy</Link>
            <Link href="/terms" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Terms of Service</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
