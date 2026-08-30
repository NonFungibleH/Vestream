// src/app/find-vestings/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Public "scan any wallet" page. Designed to funnel users into the mobile app.
//
// Flow:
//   1. User pastes an address
//   2. /api/find-vestings scans all 10 protocols × 8 chains (EVM + Solana)
//   3. Results render as a grouped summary (protocol × chain × token)
//   4. Strong mobile app CTAs prompt them to install for push alerts
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { protocolBrand, protocolIcon, chainBrand, chainIcon } from "@/lib/protocol-constants";
import FindVestingsClient from "./FindVestingsClient";

export const metadata: Metadata = {
  title: "Find your token vestings – scan any wallet · Vestream",
  description: "Paste a wallet address and instantly see every vesting owed to it across Sablier, Hedgey, Streamflow, Jupiter Lock and more — EVM and Solana. Free, no signup.",
  alternates: { canonical: "https://www.vestream.io/find-vestings" },
};

// Display order mirrors the homepage "Integrated with" strip – same row-1 /
// row-2 split, same chain order. Colours + logo icons come from
// protocol-constants.ts (single source of truth), which also fixes the
// palette drift the old hardcoded lists here had accumulated.
const PROTOCOL_ROW_1_SLUGS = ["sablier", "hedgey", "uncx", "llamapay"] as const;
const PROTOCOL_ROW_2_SLUGS = ["unvest", "superfluid", "pinksale", "streamflow", "jupiter-lock", "team-finance"] as const;

// Homepage "Available on" order: Ethereum, BNB, Base, Polygon, Arbitrum,
// Optimism, Avalanche, Solana. (The old literal list here was missing
// Avalanche while the copy above promised 8 chains.)
const CHAIN_IDS = [1, 56, 8453, 137, 42161, 10, 43114, 101] as const;

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
        "Scan any wallet address across 10 vesting protocols and 8 chains (Ethereum, Base, BNB, Polygon, Arbitrum, Optimism, Avalanche, Solana) to surface every unlock schedule – cliffs, linear streams, step releases, claimable balances.",
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
          Free · No signup · 10 protocols · 8 chains
        </div>

        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-bold mb-5"
          style={{ letterSpacing: "-0.03em", color: "#1A1D20" }}
        >
          Find every vesting<br className="hidden md:block" />{" "}
          <span style={{ color: "#1CB8B8" }}>to your wallet</span>
        </h1>
        <p className="text-base md:text-lg max-w-xl mx-auto mb-8" style={{ color: "#8B8E92", lineHeight: 1.6 }}>
          Paste any address. We&rsquo;ll scan every major vesting protocol across EVM and Solana – instantly.
        </p>

        {/* Protocol + chain pills – mirrors the homepage "Integrated with"
            strip so the visual treatment is consistent across the funnel. */}
        <div className="mt-2">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            We scan
          </p>
          <div className="flex items-center justify-center gap-1.5 md:gap-2 flex-wrap mb-2">
            {PROTOCOL_ROW_1_SLUGS.map((slug) => (
              <ProtocolPill key={slug} slug={slug} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 md:gap-2 flex-wrap">
            {PROTOCOL_ROW_2_SLUGS.map((slug) => (
              <ProtocolPill key={slug} slug={slug} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-widest mr-1" style={{ color: "#cbd5e1" }}>across</p>
            {CHAIN_IDS.map((id) => {
              const c = chainBrand(id);
              const icon = chainIcon(id);
              return (
                <div
                  key={id}
                  className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}
                >
                  {icon && (
                    <span
                      className="w-[16px] h-[16px] rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={icon} alt="" width={16} height={16} className="w-full h-full object-contain p-[1.5px]" />
                    </span>
                  )}
                  <span className="text-[11px] font-semibold" style={{ color: c.color }}>{c.name}</span>
                </div>
              );
            })}
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

// Compact pill matching the homepage protocol-strip treatment: real logo
// mark in a white tile, colour-tinted monogram fallback for protocols with
// no square mark upstream (Hedgey).
function ProtocolPill({ slug }: { slug: string }) {
  const b = protocolBrand(slug);
  const icon = protocolIcon(slug);
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
      style={{ background: b.bg, border: `1px solid ${b.border}` }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" width={20} height={20} className="w-full h-full object-contain p-[2px]" />
        ) : (
          <span className="font-extrabold text-[11px] leading-none" style={{ color: b.color }}>{b.name[0]}</span>
        )}
      </div>
      <p className="text-[11px] font-bold leading-tight whitespace-nowrap" style={{ color: b.color }}>{b.name}</p>
    </div>
  );
}
