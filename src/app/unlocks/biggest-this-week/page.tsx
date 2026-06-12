// /unlocks/biggest-this-week — top USD-value unlocks landing this week.
//
// SEO target: "biggest token unlocks this week", "largest unlocks today",
// etc. The list ranks by enriched usdValue (sub-project A), so what
// users see matches what they came to find.
//
// Rendering: ISR with 1h revalidation, same gating depth as the rest of
// the public /unlocks/* family (top 10 visible + PaywallTeaser for the
// rest). DB short-circuits at build phase; on-demand ISR fills on first
// request. See ./protocols/[protocol]/page.tsx for the full canary-quirk
// history that mandates this shape.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { WINDOWS, getUnlocksInWindow, enrichGroupsWithUsd } from "@/lib/vesting/unlock-windows";
import { UnlockListPublic } from "../_components/UnlockListPublic";

export const revalidate = 3600;
const CANONICAL_URL = "https://www.vestream.io/unlocks/biggest-this-week";

export const metadata: Metadata = {
  title:       "Biggest Token Unlocks This Week — Live Calendar | Vestream",
  description: "Every token unlock landing this week, ranked by USD value. Live, on-chain, across Sablier, Hedgey, UNCX, and more.",
  alternates:  { canonical: CANONICAL_URL },
  openGraph:   {
    title:       "Biggest token unlocks this week",
    description: "Ranked by USD value, live on-chain.",
    url:         CANONICAL_URL,
    siteName:    "Vestream",
    type:        "website",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Biggest token unlocks this week",
    description: "Ranked by USD value, live on-chain.",
  },
};

export default async function BiggestThisWeekPage() {
  // "This week" window matches /unlocks/this-week — Mon→Sun in user-local
  // time, but the underlying SQL window is UTC so the cached result is
  // shared. enrichGroupsWithUsd() prices everything; the unpriced tail
  // falls to the end of the sort.
  const win = WINDOWS["this-week"].range();
  let groups: Awaited<ReturnType<typeof enrichGroupsWithUsd>> = [];
  try {
    const r = await getUnlocksInWindow(win.startSec, win.endSec, 500);
    groups = await enrichGroupsWithUsd(r.groups, { redis: false });
  } catch (err) {
    console.warn("[biggest-this-week] DB unavailable, rendering empty:", err);
  }

  // Priced rows first (USD desc), unpriced rows after (raw amount desc)
  // — same fallback shape as the explorer's "Largest" sort so the two
  // surfaces agree.
  groups = [...groups].sort((a, b) => {
    const av = a.usdValue, bv = b.usdValue;
    if (av != null && bv != null) return bv - av;
    if (av != null) return -1;
    if (bv != null) return 1;
    try {
      const ar = BigInt(a.amount ?? "0"), br = BigInt(b.amount ?? "0");
      return br > ar ? 1 : br < ar ? -1 : 0;
    } catch { return 0; }
  });

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",    item: "https://www.vestream.io/" },
      { "@type": "ListItem", position: 2, name: "Unlocks", item: "https://www.vestream.io/unlocks" },
      { "@type": "ListItem", position: 3, name: "Biggest this week", item: CANONICAL_URL },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteNav theme="light" />

      {/* Hero */}
      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-10 md:pb-14 max-w-5xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li><Link href="/unlocks" className="hover:underline" style={{ color: "#8B8E92" }}>Unlocks</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Biggest this week</li>
          </ol>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold mb-3"
          style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Biggest unlocks this week
        </h1>
        <p className="text-base max-w-2xl leading-relaxed mb-6" style={{ color: "#475569" }}>
          Every token unlock event scheduled this week, ranked by USD value at the time of the page render. Mass distributions to many wallets are collapsed into a single row.
        </p>
      </section>

      <UnlockListPublic
        groups={groups}
        emptyMessage="No unlocks indexed for this week yet."
        heading="All scheduled unlocks"
      />

      <SiteFooter theme="light" />
    </div>
  );
}
