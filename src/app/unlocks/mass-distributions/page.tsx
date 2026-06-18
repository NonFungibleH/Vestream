// /unlocks/mass-distributions — token unlock events with 25+ recipients.
//
// SEO target: "airdrop unlocks", "launchpad token vesting", "team round
// unlocks". The distinguishing feature is walletCount ≥ 25 — that filter
// catches airdrops, launchpad allocations, and seed-round distributions
// while excluding the long tail of single-recipient team grants.
//
// 30-day window — wide enough to cover the typical launchpad cadence
// without diluting the signal with multi-year team vests.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getUnlocksInWindow, enrichGroupsWithUsd, EMPTY_WINDOW_RESULT } from "@/lib/vesting/unlock-windows";
import { withTimeout } from "@/lib/with-timeout";
import { UnlockListPublic } from "../_components/UnlockListPublic";

export const revalidate = 3600;
const CANONICAL_URL = "https://www.vestream.io/unlocks/mass-distributions";
const MIN_WALLETS = 25;
const WINDOW_DAYS = 30;

export const metadata: Metadata = {
  title:       "Token Mass Distributions — Airdrops & Launchpad Unlocks | Vestream",
  description: `On-chain unlock events with ${MIN_WALLETS}+ recipients in the next ${WINDOW_DAYS} days. Catches airdrops, launchpad rounds, and seed allocations.`,
  alternates:  { canonical: CANONICAL_URL },
  openGraph:   {
    title:       "Token mass distributions",
    description: `${MIN_WALLETS}+ recipients per event, next ${WINDOW_DAYS} days.`,
    url:         CANONICAL_URL,
    siteName:    "Vestream",
    type:        "website",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Token mass distributions",
    description: `${MIN_WALLETS}+ recipients per event, next ${WINDOW_DAYS} days.`,
  },
};

export default async function MassDistributionsPage() {
  const now = Math.floor(Date.now() / 1000);
  const endSec = now + WINDOW_DAYS * 86400;

  let groups: Awaited<ReturnType<typeof enrichGroupsWithUsd>> = [];
  try {
    const r = await withTimeout(getUnlocksInWindow(now, endSec, 2000), 12_000, EMPTY_WINDOW_RESULT, "mass-distributions");
    // Filter to mass events FIRST so we only pay DexScreener for tokens
    // we'll actually render. Cuts the priced batch by ~95% (typical
    // result: 5-15 mass events vs 100-500 total groups in the window).
    const mass = r.groups.filter((g) => g.walletCount >= MIN_WALLETS);
    groups = await enrichGroupsWithUsd(mass, { redis: false });
  } catch (err) {
    console.warn("[mass-distributions] DB unavailable, rendering empty:", err);
  }

  // Sort: walletCount desc (biggest distributions first), then USD desc
  // as a tiebreak so a $5M event with 25 wallets ranks above a $100 event
  // with 25 wallets.
  groups = [...groups].sort((a, b) => {
    if (a.walletCount !== b.walletCount) return b.walletCount - a.walletCount;
    const av = a.usdValue ?? 0, bv = b.usdValue ?? 0;
    return bv - av;
  });

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",    item: "https://www.vestream.io/" },
      { "@type": "ListItem", position: 2, name: "Unlocks", item: "https://www.vestream.io/unlocks" },
      { "@type": "ListItem", position: 3, name: "Mass distributions", item: CANONICAL_URL },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteNav theme="light" />

      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-10 md:pb-14 max-w-5xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li><Link href="/unlocks" className="hover:underline" style={{ color: "#8B8E92" }}>Unlocks</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Mass distributions</li>
          </ol>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold mb-3"
          style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Mass distributions
        </h1>
        <p className="text-base max-w-2xl leading-relaxed mb-2" style={{ color: "#475569" }}>
          Token unlock events with {MIN_WALLETS}+ recipients landing in the next {WINDOW_DAYS} days. Captures airdrops, launchpad rounds, and seed-round distributions — the events most likely to move a token&apos;s circulating supply.
        </p>
        <p className="text-xs" style={{ color: "#8B8E92" }}>
          Single-recipient team grants are excluded by design — see <Link href="/unlocks/biggest-this-week" className="underline">biggest unlocks this week</Link> for those.
        </p>
      </section>

      <UnlockListPublic
        groups={groups}
        emptyMessage={`No upcoming events with ${MIN_WALLETS}+ recipients in the next ${WINDOW_DAYS} days.`}
        heading="Mass distribution events"
      />

      <SiteFooter theme="light" />
    </div>
  );
}
