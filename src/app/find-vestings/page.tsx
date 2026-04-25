// src/app/find-vestings/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Public "scan any wallet" page. Designed to funnel users into the mobile app.
//
// Flow:
//   1. User pastes an address
//   2. /api/find-vestings scans all 9 protocols × 5 chains (EVM + Solana)
//   3. Results render as a grouped summary (protocol × chain × token)
//   4. Strong mobile app CTAs prompt them to install for push alerts
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import FindVestingsClient from "./FindVestingsClient";

export const metadata: Metadata = {
  title: "Find your token vestings — scan any wallet · Vestream",
  description: "Paste a wallet address and instantly see every vesting schedule across Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, PinkSale, Streamflow, and Jupiter Lock. Free, no signup.",
  alternates: { canonical: "https://vestream.io/find-vestings" },
};

// Display order mirrors the homepage "Integrated with" strip — same colours,
// same row-1 / row-2 split, same chain pills. Single source of truth for the
// visual would be nice but for now consistent literal lists keep the two
// pages tightly aligned.
const PROTOCOLS_ROW_1 = [
  { name: "Sablier",      color: "#f97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.15)"  },
  { name: "Hedgey",       color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.15)"  },
  { name: "UNCX",         color: "#f59e0b", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.15)"  },
  { name: "Team Finance", color: "#10b981", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.15)"  },
] as const;

const PROTOCOLS_ROW_2 = [
  { name: "Unvest",       color: "#06b6d4", bg: "rgba(6,182,212,0.07)",   border: "rgba(6,182,212,0.15)"   },
  { name: "Superfluid",   color: "#1db954", bg: "rgba(29,185,84,0.07)",   border: "rgba(29,185,84,0.15)"   },
  { name: "PinkSale",     color: "#ec4899", bg: "rgba(236,72,153,0.07)",  border: "rgba(236,72,153,0.15)"  },
  { name: "Streamflow",   color: "#14f195", bg: "rgba(20,241,149,0.08)",  border: "rgba(20,241,149,0.22)"  },
  { name: "Jupiter Lock", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.22)"  },
] as const;

const CHAINS = [
  { name: "Ethereum",  color: "#6366f1", bg: "rgba(99,102,241,0.07)",   border: "rgba(99,102,241,0.16)"   },
  { name: "BNB Chain", color: "#eab308", bg: "rgba(234,179,8,0.07)",    border: "rgba(234,179,8,0.16)"    },
  { name: "Base",      color: "#3b82f6", bg: "rgba(59,130,246,0.07)",   border: "rgba(59,130,246,0.16)"   },
  { name: "Polygon",   color: "#8b5cf6", bg: "rgba(139,92,246,0.07)",   border: "rgba(139,92,246,0.16)"   },
  { name: "Solana",    color: "#14f195", bg: "rgba(20,241,149,0.08)",   border: "rgba(20,241,149,0.22)"   },
] as const;

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
          Free · No signup · 9 protocols · 5 chains
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
        <p className="text-base md:text-lg max-w-xl mx-auto mb-8" style={{ color: "#64748b", lineHeight: 1.6 }}>
          Paste any address. We&rsquo;ll scan every major vesting protocol across EVM and Solana — instantly.
        </p>

        {/* Protocol + chain pills — mirrors the homepage "Integrated with"
            strip so the visual treatment is consistent across the funnel. */}
        <div className="mt-2">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>
            We scan
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
            {PROTOCOLS_ROW_1.map((p) => (
              <ProtocolPill key={p.name} {...p} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {PROTOCOLS_ROW_2.map((p) => (
              <ProtocolPill key={p.name} {...p} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-widest mr-1" style={{ color: "#cbd5e1" }}>across</p>
            {CHAINS.map((c) => (
              <div
                key={c.name}
                className="flex items-center px-2.5 py-0.5 rounded-full"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}
              >
                <span className="text-[11px] font-semibold" style={{ color: c.color }}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scanner + results (client island) ─────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pb-14 md:pb-20">
        <FindVestingsClient />
      </section>

      <SiteFooter theme="light" note="Scan results may take 10–30 seconds for wallets with many streams." />
    </main>
  );
}

// Compact pill that matches the homepage protocol-strip styling exactly.
function ProtocolPill({
  name, color, bg, border,
}: { name: string; color: string; bg: string; border: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: color }}
      >
        <span className="text-white font-bold text-[9px] leading-none">{name[0]}</span>
      </div>
      <p className="text-[11px] font-bold leading-tight whitespace-nowrap" style={{ color }}>{name}</p>
    </div>
  );
}
