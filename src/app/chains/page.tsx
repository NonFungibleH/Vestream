// /chains — index of per-chain token-unlock pages.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { publicChainIds, chainSlug, chainBrand, chainIcon } from "@/lib/protocol-constants";

export const metadata: Metadata = {
  title: "Token Unlocks by Chain · Vestream",
  description:
    "Track token vesting and upcoming unlocks by blockchain: Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, Solana, and Robinhood Chain.",
  alternates: { canonical: "https://www.vestream.io/chains" },
  openGraph: {
    title: "Token Unlocks by Chain",
    description: "Vesting TVL, protocols, and upcoming unlocks for every chain Vestream indexes.",
    url: "https://www.vestream.io/chains", siteName: "Vestream", type: "website",
  },
};

export default function ChainsIndexPage() {
  const chains = publicChainIds()
    .map((id) => ({ id, slug: chainSlug(id)!, brand: chainBrand(id), icon: chainIcon(id) }))
    .filter((c) => c.slug);

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-16 max-w-4xl mx-auto w-full">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>By chain</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Token unlocks by chain
        </h1>
        <p className="text-base md:text-lg max-w-2xl leading-relaxed mb-8" style={{ color: "#475569" }}>
          Vestream indexes token vesting across every major EVM chain plus Solana and Robinhood Chain. Pick a chain to see its vesting TVL, the protocols integrated on it, and every upcoming unlock.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {chains.map((c) => (
            <Link key={c.id} href={`/chains/${c.slug}`} className="flex items-center gap-3 p-4 rounded-2xl transition-colors" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: c.brand.bg, border: `1px solid ${c.brand.border}` }}>
                {c.icon
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.icon} alt="" width={40} height={40} className="w-full h-full object-contain p-1.5" />
                  : <span className="font-extrabold text-lg" style={{ color: c.brand.color }}>{c.brand.name[0]}</span>}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: "#1A1D20" }}>{c.brand.name}</p>
                <p className="text-xs truncate" style={{ color: "#64748b" }}>Vesting TVL, protocols &amp; upcoming unlocks</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <SiteFooter theme="light" />
    </div>
  );
}
