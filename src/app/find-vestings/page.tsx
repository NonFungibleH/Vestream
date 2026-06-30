// src/app/find-vestings/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Public "scan any wallet" page. Designed to funnel users into the mobile app.
//
// Flow:
//   1. User pastes an address
//   2. /api/find-vestings scans all 10 protocols × 7 chains (EVM + Solana)
//   3. Results render as a grouped summary (protocol × chain × token)
//   4. Strong mobile app CTAs prompt them to install for push alerts
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import FindVestingsClient from "./FindVestingsClient";

export const metadata: Metadata = {
  title: "Find your token vestings — scan any wallet · Vestream",
  description: "Paste a wallet address and instantly see every vesting schedule across Sablier, Hedgey, Superfluid, LlamaPay, UNCX, Unvest, Team Finance, PinkSale, Streamflow, and Jupiter Lock. Free, no signup.",
  alternates: { canonical: "https://www.vestream.io/find-vestings" },
};

// Display order mirrors the homepage "Integrated with" strip — same colours,
// same row-1 / row-2 split, same chain pills. Single source of truth for the
// visual would be nice but for now consistent literal lists keep the two
// pages tightly aligned.
const PROTOCOLS_ROW_1 = [
  // 2026-05-15: aligned to canonical palette in protocol-constants.ts.
  // Previous values had Hedgey #3b82f6 (collided with Base chain) and
  // UNCX #F0992E (collided with Sablier). Both fixed.
  { name: "Sablier",      color: "#F0992E", bg: "rgba(240,153,46,0.07)",  border: "rgba(240,153,46,0.15)"  },
  { name: "Hedgey",       color: "#8169E0", bg: "rgba(129,105,224,0.07)", border: "rgba(129,105,224,0.15)" },
  { name: "UNCX",         color: "#3D7FD0", bg: "rgba(61,127,208,0.07)",  border: "rgba(61,127,208,0.15)"  },
  { name: "LlamaPay",     color: "#A26B3F", bg: "rgba(162,107,63,0.07)",  border: "rgba(162,107,63,0.15)"  },
] as const;

const PROTOCOLS_ROW_2 = [
  { name: "Unvest",       color: "#0BA0CB", bg: "rgba(11,160,203,0.07)",  border: "rgba(11,160,203,0.15)"  },
  { name: "Superfluid",   color: "#28B895", bg: "rgba(40,184,149,0.07)",  border: "rgba(40,184,149,0.15)"  },
  { name: "PinkSale",     color: "#E063A0", bg: "rgba(224,99,160,0.07)",  border: "rgba(224,99,160,0.15)"  },
  { name: "Team Finance", color: "#2F6BFF", bg: "rgba(47,107,255,0.07)",  border: "rgba(47,107,255,0.15)"  },
  { name: "Streamflow",   color: "#5DCE9D", bg: "rgba(93,206,157,0.08)",  border: "rgba(93,206,157,0.22)"  },
  { name: "Jupiter Lock", color: "#F0B83D", bg: "rgba(240,184,61,0.08)",  border: "rgba(240,184,61,0.22)"  },
] as const;

const CHAINS = [
  { name: "Ethereum",  color: "#6366f1", bg: "rgba(28,184,184,0.07)",   border: "rgba(28,184,184,0.16)"   },
  { name: "BNB Chain", color: "#eab308", bg: "rgba(234,179,8,0.07)",    border: "rgba(234,179,8,0.16)"    },
  { name: "Base",      color: "#3b82f6", bg: "rgba(59,130,246,0.07)",   border: "rgba(59,130,246,0.16)"   },
  { name: "Polygon",   color: "#8b5cf6", bg: "rgba(139,92,246,0.07)",   border: "rgba(139,92,246,0.16)"   },
  { name: "Arbitrum",  color: "#28A0F0", bg: "rgba(40,160,240,0.07)",   border: "rgba(40,160,240,0.16)"   },
  { name: "Optimism",  color: "#FF0420", bg: "rgba(255,4,32,0.07)",     border: "rgba(255,4,32,0.16)"     },
  { name: "Solana",    color: "#5DCE9D", bg: "rgba(93,206,157,0.08)",   border: "rgba(93,206,157,0.22)"   },
] as const;

// 2026-05-17 SEO/AI-search pass: HowTo + BreadcrumbList JSON-LD.
// This page is the canonical landing target for "how do I find my vesting
// unlocks" / "scan wallet for token unlocks" style AI-search queries.
// HowTo schema signals that the page IS the step-by-step procedure
// (paste address → click scan → review results), which Google's AI
// Overviews surface preferentially over generic landing pages. Without
// it the AI tends to summarise from third-party tutorials that talk
// ABOUT scanning instead of pointing the user AT the scanner.
const findVestingsJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      "@id":   "https://www.vestream.io/find-vestings#howto",
      name:    "How to find every token vesting unlock for a wallet",
      description:
        "Scan any wallet address across 10 vesting protocols and 7 chains (Ethereum, Base, BNB, Polygon, Arbitrum, Optimism, Solana) to surface every unlock schedule — cliffs, linear streams, step releases, claimable balances.",
      totalTime: "PT30S",
      supply:    { "@type": "HowToSupply", name: "An EVM or Solana wallet address" },
      tool:      { "@type": "HowToTool",   name: "A web browser" },
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "Paste a wallet address",
          text: "Paste any public EVM (0x…) or Solana wallet address into the scanner.",
          url: "https://www.vestream.io/find-vestings#step-1",
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Run the scan",
          text: "Vestream queries Sablier, Hedgey, UNCX, Unvest, Superfluid, LlamaPay, Team Finance, PinkSale, Streamflow, and Jupiter Lock in parallel. Results return in 10–30 seconds.",
          url: "https://www.vestream.io/find-vestings#step-2",
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Review every unlock",
          text: "See a grouped summary by protocol × chain × token. Each row shows total amount locked, amount claimable now, and the next unlock date.",
          url: "https://www.vestream.io/find-vestings#step-3",
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home",           item: "https://www.vestream.io" },
        { "@type": "ListItem", position: 2, name: "Find vestings",  item: "https://www.vestream.io/find-vestings" },
      ],
    },
  ],
};

export default function FindVestingsPage() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(findVestingsJsonLd) }}
      />
      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pt-24 md:pt-32 pb-10 md:pb-14 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
          style={{
            background: "rgba(28,184,184,0.06)",
            color: "#1CB8B8",
            border: "1px solid rgba(28,184,184,0.2)",
          }}
        >
          Free · No signup · 10 protocols · 7 chains
        </div>

        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-bold mb-5"
          style={{ letterSpacing: "-0.03em", color: "#1A1D20" }}
        >
          Find every vesting<br className="hidden md:block" />{" "}
          <span style={{ color: "#1CB8B8" }}>to your wallet</span>
        </h1>
        <p className="text-base md:text-lg max-w-xl mx-auto mb-8" style={{ color: "#8B8E92", lineHeight: 1.6 }}>
          Paste any address. We&rsquo;ll scan every major vesting protocol across EVM and Solana — instantly.
        </p>

        {/* Protocol + chain pills — mirrors the homepage "Integrated with"
            strip so the visual treatment is consistent across the funnel. */}
        <div className="mt-2">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            We scan
          </p>
          <div className="flex items-center justify-center gap-1.5 md:gap-2 flex-wrap mb-2">
            {PROTOCOLS_ROW_1.map((p) => (
              <ProtocolPill key={p.name} {...p} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 md:gap-2 flex-wrap">
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
