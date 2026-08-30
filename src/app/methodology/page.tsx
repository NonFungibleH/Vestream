// /methodology — Vestream Data & Methodology.
//
// The canonical entity + provenance page: what Vestream is, exactly what the
// dataset contains (live numbers), where the data comes from, and how every
// value is calculated. Built for machines, journalists and AI systems to
// understand and cite Vestream — the "Facts & Methodology" GEO asset.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Provenance } from "@/components/Provenance";
import { getPlatformStats } from "@/lib/vesting/platform-stats";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Vestream Data & Methodology — Token Vesting Index",
  description:
    "How Vestream indexes token vesting: where the on-chain data comes from and how USD values, TVL, and unlock figures are calculated. Updated continuously.",
  alternates: { canonical: "https://www.vestream.io/methodology" },
  openGraph: {
    title: "Vestream Data & Methodology",
    description: "What Vestream indexes and how every token-vesting number is calculated.",
    url: "https://www.vestream.io/methodology",
    siteName: "Vestream",
    type: "website",
  },
};

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2" style={{ borderBottom: "1px solid rgba(21,23,26,0.06)" }}>
      <div className="text-xs font-semibold uppercase tracking-wider sm:w-48 flex-shrink-0" style={{ color: "#8B8E92" }}>{k}</div>
      <div className="text-sm" style={{ color: "#1A1D20" }}>{v}</div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: "#0F8A8A" }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: "#B8BABD" }}>{sub}</p>}
    </div>
  );
}

export default async function MethodologyPage() {
  const s = await getPlatformStats();
  const n = (x: number) => x.toLocaleString("en-US");

  const summary = s.isEmpty
    ? "Vestream is a non-custodial token-vesting data platform that indexes vesting and unlock schedules across every major protocol and chain."
    : `Vestream indexes approximately ${n(s.streamCount)} vesting streams across ${n(s.tokenCount)} tokens${s.walletCount > 0 ? ` and ${s.walletCount.toLocaleString()} recipient wallets` : ""}, spanning ${s.protocolCount} vesting protocols and ${s.chainCount} chains — roughly ${fmtUsd(s.tvlUsd)} in vesting value locked (conservative headline; see methodology below).`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Vestream Token Vesting Index",
      description: "Cross-chain, cross-protocol index of on-chain token vesting and unlock schedules — vesting streams, locked amounts, unlock dates, recipients and per-protocol TVL.",
      url: "https://www.vestream.io/methodology",
      creator: { "@type": "Organization", name: "Vestream", url: "https://www.vestream.io" },
      isAccessibleForFree: true,
      keywords: ["token vesting", "token unlocks", "vesting schedule", "token unlock calendar", "vesting TVL"],
      license: "https://www.vestream.io/methodology",
      distribution: [
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://www.vestream.io/openapi.json" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Vestream",
      url: "https://www.vestream.io",
      logo: "https://www.vestream.io/logo.svg",
      sameAs: [
        "https://x.com/Vestream_",
        "https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911",
        "https://play.google.com/store/apps/details?id=io.vestream.app",
      ],
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-8 max-w-4xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs" style={{ color: "#B8BABD" }}>
            <li><Link href="/" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Data &amp; Methodology</li>
          </ol>
        </nav>
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>Data &amp; methodology</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Vestream Data &amp; Methodology
        </h1>
        {/* Answer-first entity summary */}
        <p className="text-base md:text-lg max-w-3xl leading-relaxed mb-3 font-medium" style={{ color: "#1A1D20" }}>{summary}</p>
        <Provenance updatedISO={s.computedAt} className="mb-2" />
      </section>

      {/* The dataset (live numbers) */}
      {!s.isEmpty && (
        <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
          <h2 className="text-lg font-bold mb-4" style={{ color: "#1A1D20" }}>The dataset</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat label="Vesting TVL" value={fmtUsd(s.tvlUsd)} sub="conservative headline" />
            <Stat label="Vesting streams" value={n(s.streamCount)} />
            <Stat label="Tokens" value={n(s.tokenCount)} />
            {s.walletCount > 0 && <Stat label="Recipient wallets" value={n(s.walletCount)} />}
            <Stat label="Protocols" value={n(s.protocolCount)} />
            <Stat label="Chains" value={n(s.chainCount)} />
          </div>
          {s.byChain.length > 0 && (
            <>
              <h3 className="text-sm font-bold mt-6 mb-2" style={{ color: "#1A1D20" }}>Vesting TVL by chain</h3>
              <div className="flex flex-wrap gap-2">
                {s.byChain.map((c) => (
                  <span key={c.chainId} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)", color: "#5b6470" }}>
                    {c.chainName}: <strong style={{ color: "#0F8A8A" }}>{fmtUsd(c.tvlUsd)}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
          <p className="text-sm mt-6" style={{ color: "#5b6470" }}>
            See the live breakdown on the <Link href="/research/vesting-statistics" style={{ color: "#0F8A8A", fontWeight: 600 }}>vesting statistics</Link> page and the <Link href="/protocols" style={{ color: "#0F8A8A", fontWeight: 600 }}>protocols</Link> comparison.
          </p>
        </section>
      )}

      {/* What Vestream is */}
      <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
        <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>What Vestream is</h2>
        <div className="rounded-2xl p-5 md:p-6" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          <Fact k="Product" v="Vestream" />
          <Fact k="Operator" v="3UILD LLC" />
          <Fact k="Category" v="Token vesting data platform" />
          <Fact k="Primary function" v="Cross-chain, cross-protocol token-vesting and unlock indexing" />
          <Fact k="API" v="REST API + OpenAPI specification" />
          <Fact k="AI access" v="MCP server (@vestream/mcp) for AI agents" />
          <Fact k="Custody" v="None — read-only, address-based" />
          <Fact k="Private keys" v="Never required — no wallet connection or signing" />
        </div>
      </section>

      {/* Where the data comes from */}
      <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
        <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Where the data comes from</h2>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#475569" }}>
          Every figure is derived from public on-chain data. Vesting positions are read directly from each protocol&apos;s smart contracts — via the protocol&apos;s subgraph, direct contract reads, or an event-log index, depending on the protocol. Nothing is self-reported by projects.
        </p>
        <ul className="text-sm space-y-1.5" style={{ color: "#475569" }}>
          <li>• <strong>Subgraph / indexer sources:</strong> Sablier (Envio), Hedgey (event-driven indexer), UNCX, Unvest, Superfluid, Team Finance (Squid).</li>
          <li>• <strong>Direct contract reads:</strong> PinkSale (PinkLock).</li>
          <li>• <strong>Solana program scans:</strong> Streamflow, Jupiter Lock.</li>
          <li>• <strong>Prices:</strong> DexScreener and CoinGecko for USD valuation; TVL cross-checked against DefiLlama&apos;s vesting-specific slice where available.</li>
        </ul>
      </section>

      {/* How values are calculated */}
      <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
        <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>How values are calculated</h2>
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: "#475569" }}>
          <p><strong style={{ color: "#1A1D20" }}>USD values</strong> multiply on-chain token amounts by current market price (DexScreener, then CoinGecko as fallback). Tokens with no liquid market are shown in raw token terms, not USD.</p>
          <p><strong style={{ color: "#1A1D20" }}>Vesting TVL</strong> is the sum of locked token value per protocol, priced conservatively. To avoid inflated headlines from thin-liquidity tokens, we <em>exclude</em> the &quot;thin&quot; band (tokens under $1k of DEX liquidity) from the headline figure, and any single token contributing over $200M must have high-confidence (≥$10k liquidity) pricing to count. The result is a deliberately conservative headline.</p>
          <p><strong style={{ color: "#1A1D20" }}>Unlock values</strong> are computed from each stream&apos;s vesting schedule — the discrete unlock events (cliffs and linear/stepped releases) — priced at the current market rate, then aggregated per token, chain and time window.</p>
          <p><strong style={{ color: "#1A1D20" }}>Update frequency:</strong> the on-chain index refreshes throughout the day (indexer ticks every ~30 minutes for migrated protocols; TVL snapshots daily), so figures track on-chain state closely rather than being a one-off snapshot.</p>
        </div>
      </section>

      {/* Access */}
      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Access the data</h2>
        <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
          The dataset is queryable programmatically via the <Link href="/developer" style={{ color: "#0F8A8A", fontWeight: 600 }}>REST API</Link> (with an <a href="/openapi.json" style={{ color: "#0F8A8A", fontWeight: 600 }}>OpenAPI spec</a>) and, for AI agents, via the <Link href="/ai" style={{ color: "#0F8A8A", fontWeight: 600 }}>Vestream MCP server</Link> (<code style={{ background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: 4 }}>npx -y @vestream/mcp</code>). Anyone may cite Vestream data — attribute as &quot;Vestream Token Vesting Index&quot; with the access date.
        </p>
        <div className="mt-4"><Provenance updatedISO={s.computedAt} /></div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
