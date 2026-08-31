// /chains - index of per-chain token-unlock pages, as a vesting-TVL leaderboard.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Provenance } from "@/components/Provenance";
import { chainSlug, chainBrand, chainIcon } from "@/lib/protocol-constants";
import { getChainsOverview } from "@/lib/vesting/chain-stats";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Token Unlocks by Chain · Vestream",
  description:
    "Vesting TVL leaderboard by blockchain: Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, Solana, and Robinhood Chain. See TVL, protocols, and upcoming unlocks per chain.",
  alternates: { canonical: "https://www.vestream.io/chains" },
  openGraph: {
    title: "Token Unlocks by Chain",
    description: "Vesting TVL, protocols, and upcoming unlocks for every chain Vestream indexes.",
    url: "https://www.vestream.io/chains", siteName: "Vestream", type: "website",
  },
};

function n(x: number) { return x.toLocaleString("en-US"); }

export default async function ChainsIndexPage() {
  const o = await getChainsOverview();
  const max = o.chains[0]?.tvlUsd ?? 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Token vesting by chain",
    itemListElement: o.chains.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: chainBrand(c.chainId).name,
      url: `https://www.vestream.io/chains/${chainSlug(c.chainId)}`,
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-8 max-w-4xl mx-auto w-full">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>By chain</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Token unlocks by chain
        </h1>
        <p className="text-base md:text-lg max-w-2xl leading-relaxed mb-6" style={{ color: "#475569" }}>
          Vestream indexes token vesting across every major EVM chain plus Solana and Robinhood Chain. Pick a chain to see its vesting TVL, the protocols integrated on it, and every upcoming unlock.
        </p>

        {/* Headline stats */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="rounded-xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>Total vesting TVL</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: "#0F8A8A" }}>{o.totalTvl > 0 ? fmtUsd(o.totalTvl) : "—"}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>Chains</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: "#0F8A8A" }}>{n(o.chains.length)}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>Streams</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: "#0F8A8A" }}>{o.totalStreams > 0 ? n(o.totalStreams) : "—"}</p>
          </div>
        </div>
        <Provenance updatedISO={o.computedAt} />
      </section>

      {/* TVL leaderboard — one rich, clickable tile per chain */}
      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Vesting TVL by chain</h2>
        <div className="space-y-2">
          {o.chains.map((c, i) => {
            const brand = chainBrand(c.chainId);
            const icon  = chainIcon(c.chainId);
            const slug  = chainSlug(c.chainId);
            const pct   = max > 0 && c.tvlUsd > 0 ? Math.max(3, (c.tvlUsd / max) * 100) : 0;
            return (
              <Link
                key={c.chainId}
                href={`/chains/${slug}`}
                className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl transition-colors hover:bg-white"
                style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}
              >
                <span className="text-sm font-bold tabular-nums w-5 text-center flex-shrink-0" style={{ color: "#B8BABD" }}>{i + 1}</span>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: brand.bg, border: `1px solid ${brand.border}` }}>
                  {icon
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="" width={36} height={36} className="w-full h-full object-contain p-1.5" />
                    : <span className="font-extrabold text-base" style={{ color: brand.color }}>{brand.name[0]}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-sm truncate" style={{ color: "#1A1D20" }}>{brand.name}</p>
                    <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "#0F8A8A" }}>{c.tvlUsd > 0 ? fmtUsd(c.tvlUsd) : "—"}</p>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: "rgba(15,138,138,0.08)" }}>
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: brand.color }} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "#8B8E92" }}>
                    {n(c.protocolCount)} {c.protocolCount === 1 ? "protocol" : "protocols"}
                    {c.streamCount > 0 ? ` · ${n(c.streamCount)} streams` : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
