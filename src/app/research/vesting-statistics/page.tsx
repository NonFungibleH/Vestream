// /research/vesting-statistics — the flagship citable statistics page.
//
// Answers "how much crypto is locked in token vesting?", "which chain/protocol
// has the most vesting TVL?", "how many vesting streams exist?" directly, from
// Vestream's own dataset — the kind of proprietary stat other sites cite.
// Provenance + Dataset schema make it AI/journalist-citable.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Provenance } from "@/components/Provenance";
import { getPlatformStats } from "@/lib/vesting/platform-stats";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Token Vesting Statistics — TVL, Streams & Locked Supply",
  description:
    "Live token-vesting statistics from the Vestream index: total value locked in vesting, number of vesting streams and tokens, and a breakdown of vesting TVL by chain and by protocol.",
  alternates: { canonical: "https://www.vestream.io/research/vesting-statistics" },
  openGraph: {
    title: "Token Vesting Statistics",
    description: "How much crypto is locked in token vesting — by chain and by protocol.",
    url: "https://www.vestream.io/research/vesting-statistics",
    siteName: "Vestream",
    type: "article",
  },
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "#0F8A8A" }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: "#B8BABD" }}>{sub}</p>}
    </div>
  );
}

function BarRow({ name, value, max, href }: { name: string; value: number; max: number; href?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const label = href ? <Link href={href} className="hover:underline" style={{ color: "#1A1D20" }}>{name}</Link> : <span style={{ color: "#1A1D20" }}>{name}</span>;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-28 sm:w-36 flex-shrink-0 text-sm font-medium truncate">{label}</div>
      <div className="flex-1 h-5 rounded" style={{ background: "rgba(15,138,138,0.08)" }}>
        <div className="h-5 rounded" style={{ width: `${pct}%`, background: "#0F8A8A" }} />
      </div>
      <div className="w-20 text-right text-sm tabular-nums font-semibold flex-shrink-0" style={{ color: "#0F8A8A" }}>{fmtUsd(value)}</div>
    </div>
  );
}

export default async function VestingStatisticsPage() {
  const s = await getPlatformStats();
  const n = (x: number) => x.toLocaleString("en-US");

  const answer = s.isEmpty
    ? "Vestream tracks the value locked in on-chain token vesting across every major protocol and chain."
    : `Approximately ${fmtUsd(s.tvlUsd)} is currently locked in token vesting across the ${s.protocolCount} protocols and ${s.chainCount} chains indexed by Vestream — spread over ${n(s.streamCount)} vesting streams and ${n(s.tokenCount)} tokens.`;

  const topChain = s.byChain[0];
  const topProto = s.byProtocol[0];
  const secondAnswer = (!s.isEmpty && topChain && topProto)
    ? ` The chain with the most vesting value locked is ${topChain.chainName} (${fmtUsd(topChain.tvlUsd)}), and the largest vesting protocol by TVL is ${topProto.name} (${fmtUsd(topProto.tvlUsd)}).`
    : "";

  const chainMax = s.byChain[0]?.tvlUsd ?? 0;
  const protoMax = s.byProtocol[0]?.tvlUsd ?? 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Token Vesting Statistics — Vestream Index",
    description: "Total value locked in token vesting, vesting stream and token counts, and vesting TVL broken down by blockchain and by protocol, from the Vestream on-chain index.",
    url: "https://www.vestream.io/research/vesting-statistics",
    creator: { "@type": "Organization", name: "Vestream", url: "https://www.vestream.io" },
    isAccessibleForFree: true,
    dateModified: s.computedAt,
    keywords: ["token vesting TVL", "how much crypto is locked in vesting", "vesting statistics", "vesting by chain", "vesting by protocol"],
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://www.vestream.io/openapi.json" }],
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-8 max-w-4xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs" style={{ color: "#B8BABD" }}>
            <li><Link href="/" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/research/vesting-statistics" style={{ color: "#8B8E92" }}>Research</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Vesting statistics</li>
          </ol>
        </nav>
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>Vestream research</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Token Vesting Statistics
        </h1>
        {/* Answer-first */}
        <p className="text-base md:text-lg max-w-3xl leading-relaxed mb-3 font-medium" style={{ color: "#1A1D20" }}>{answer}{secondAnswer}</p>
        <Provenance updatedISO={s.computedAt} className="mb-2" />
      </section>

      {!s.isEmpty && (
        <>
          <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Vesting TVL" value={fmtUsd(s.tvlUsd)} sub="conservative headline" />
              <Stat label="Vesting streams" value={n(s.streamCount)} />
              <Stat label="Tokens vesting" value={n(s.tokenCount)} />
              <Stat label="Recipient wallets" value={n(s.walletCount)} />
            </div>
          </section>

          <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
            <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Vesting TVL by protocol</h2>
            <div className="rounded-2xl p-4 md:p-5" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              {s.byProtocol.map((p) => (
                <BarRow key={p.slug} name={p.name} value={p.tvlUsd} max={protoMax} href={`/protocols/${p.slug}`} />
              ))}
            </div>
          </section>

          <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
            <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Vesting TVL by chain</h2>
            <div className="rounded-2xl p-4 md:p-5" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              {s.byChain.map((c) => (
                <BarRow key={c.chainId} name={c.chainName} value={c.tvlUsd} max={chainMax} />
              ))}
            </div>
          </section>
        </>
      )}

      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: "#1A1D20" }}>Cite this data</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
            Attribute as: <em>&quot;Vestream Token Vesting Index, accessed [date]&quot;</em>. The underlying data is queryable via the <Link href="/developer" style={{ color: "#0F8A8A", fontWeight: 600 }}>REST API</Link> / <a href="/openapi.json" style={{ color: "#0F8A8A", fontWeight: 600 }}>OpenAPI spec</a> and the <Link href="/ai" style={{ color: "#0F8A8A", fontWeight: 600 }}>MCP server</Link>. See the full <Link href="/methodology" style={{ color: "#0F8A8A", fontWeight: 600 }}>methodology</Link> for how these figures are calculated.
          </p>
        </div>
        <div className="mt-4"><Provenance updatedISO={s.computedAt} /></div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
