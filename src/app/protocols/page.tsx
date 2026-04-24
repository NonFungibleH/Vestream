// src/app/protocols/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Index hub for all per-protocol landing pages. Lists the 7 protocols we
// index with a live "last indexed" stamp per row pulled from cache — so this
// page itself is also a freshness signal.
//
// Light B2C theme to match the individual per-protocol pages — each card
// preserves its own protocol-brand accent so the grid feels like a rainbow
// of real integrations rather than generic tiles.
//
// Revalidates every 60s. Feeds the sitemap and cross-links back from every
// individual protocol page.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
// LiveActivityTicker intentionally removed from this page — it polls
// /api/unlocks/live-activity and renders recent-activity rows. Pre-launch we
// don't have enough platform traffic to make the feed feel alive, and an empty
// "Reconnecting to the live feed…" placeholder undermines the rest of the
// page. Re-add when we have steady real traffic (track via analytics).
import { UpcomingUnlockTicker } from "@/components/UpcomingUnlockTicker";
import { TvlComparisonBar } from "@/components/TvlComparisonBar";
import { listProtocols, type ProtocolMeta } from "@/lib/protocol-constants";
import {
  getProtocolStats,
  relativeFreshness,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";
import { getGlobalStats, type GlobalProtocolStats } from "@/lib/vesting/global-stats";
import { getAllProtocolsTvl, type ProtocolTvl } from "@/lib/vesting/tvl";
import { fetchDefiLlamaTvl } from "@/lib/defillama";

// See note on /protocols/[slug]/page.tsx — same rationale. This index
// page fans out into all 7 protocols' getProtocolStats() + getGlobalStats()
// calls at render time, every one a DB or subgraph query. Pre-rendering at
// build fails without the prod env; rendering on request with an edge
// Cache-Control header gives us the same perceived freshness at the
// visitor-level while letting `next build` complete.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Token unlock trackers — TokenVest",
  description:
    "Live on-chain unlock trackers for Sablier, Hedgey, Superfluid, UNCX, Team Finance, Unvest and PinkSale — across Ethereum, Base, BSC and Polygon.",
  alternates: { canonical: "https://vestream.io/protocols" },
  openGraph: {
    title: "Token unlock trackers — TokenVest",
    description:
      "Live on-chain unlock trackers for every major vesting protocol. Track your wallet, get alerts before every cliff.",
    url: "https://vestream.io/protocols",
    siteName: "TokenVest",
    type: "website",
  },
};

export default async function UnlocksIndexPage() {
  const protocols = listProtocols();

  // Fetch stats for all protocols in parallel. Each fetch is independent and
  // wrapped so one failure doesn't sink the whole page.
  //
  // Two data sources per protocol:
  //   - local cache stats: what WE'VE indexed (low initially, grows with
  //                        traffic + seeder runs)
  //   - global stats:      direct subgraph counts across all chains
  //                        (reflects on-chain reality — used for the
  //                        "streams tracked" headline number)
  // We display whichever is larger so the page never looks smaller than the
  // on-chain truth, even before the seeder has run.
  const [statsEntries, globalEntries, tvlMap, externalTvlEntries] = await Promise.all([
    Promise.all(
      protocols.map(async (p) => {
        try {
          return [p.slug, await getProtocolStats(p.adapterIds)] as const;
        } catch (err) {
          console.error(`[unlocks] stats failed for ${p.slug}:`, err);
          return [p.slug, null as ProtocolStats | null] as const;
        }
      }),
    ),
    Promise.all(
      protocols.map(async (p) => {
        // Use the first adapter ID that has a direct subgraph path — falls
        // through zero-fill for hedgey/pinksale/team-finance.
        let best: GlobalProtocolStats | null = null;
        for (const aid of p.adapterIds) {
          try {
            const g = await getGlobalStats(aid);
            if (g.totalStreams > (best?.totalStreams ?? 0)) best = g;
          } catch (err) {
            console.error(`[unlocks] global stats failed for ${aid}:`, err);
          }
        }
        return [p.slug, best] as const;
      }),
    ),
    (async (): Promise<Record<string, ProtocolTvl>> => {
      try {
        const byId = Object.fromEntries(protocols.map((p) => [p.slug, p.adapterIds] as const));
        return await getAllProtocolsTvl(byId);
      } catch (err) {
        console.error("[unlocks] tvl aggregate failed:", err);
        return {};
      }
    })(),
    // External TVL sources (DefiLlama) — fetched in parallel with the local
    // pricing pipeline. Used for protocols where we don't run a seeder and
    // the local cache would report $0 at launch (Streamflow). Failures here
    // fall back to local TVL (typically null for Streamflow in v1 → the
    // card would show "no data" instead of a real number, which is the
    // pre-DefiLlama baseline).
    Promise.all(
      protocols
        .filter((p) => p.externalTvl)
        .map(async (p) => {
          const cfg = p.externalTvl!;
          try {
            const snap = await fetchDefiLlamaTvl(cfg.slug, cfg.category);
            return [p.slug, snap] as const;
          } catch (err) {
            console.error(`[unlocks] DefiLlama fetch failed for ${p.slug}:`, err);
            return [p.slug, null] as const;
          }
        }),
    ),
  ]);
  const statsMap  = new Map(statsEntries);
  const globalMap = new Map(globalEntries);

  // Merge external TVL sources into the tvl map. For protocols with an
  // external source configured, we synthesise a ProtocolTvl from the
  // DefiLlama snapshot so the downstream UI doesn't have to branch.
  // Track which slugs came from an external source so the UI can surface
  // attribution (e.g. "via DefiLlama" tag).
  const externallySourced = new Set<string>();
  for (const [slug, snap] of externalTvlEntries) {
    if (!snap) continue;
    const protocol = protocols.find((p) => p.slug === slug);
    if (!protocol) continue;
    externallySourced.add(slug);
    tvlMap[slug] = {
      adapterIds:      protocol.adapterIds,
      tvlUsd:          snap.totalUsd,
      // All-in-one "high" band — DefiLlama's figure is curated, not sampled.
      tvlByBand:       { high: snap.totalUsd, medium: 0, low: 0 },
      pricingSources:  { dexscreener: 0, coingecko: 0 },
      // Per-chain rows: DefiLlama returns chain NAMES (e.g. "Solana"), not
      // numeric IDs. We emit a single synthetic chainId=0 row so the UI
      // doesn't render a broken chain-pill; the per-chain bar isn't the
      // primary signal on the Streamflow card anyway.
      perChain:        snap.perChain.length > 0
                         ? [{ chainId: protocol.chainIds[0] ?? 0, tvlUsd: snap.totalUsd }]
                         : [],
      tokensPriced:    snap.perChain.length > 0 ? 1 : 0,
      tokensSkipped:   0,
      totalTokens:     snap.perChain.length > 0 ? 1 : 0,
      coverage:        1,
      topContributors: [],
      computedAt:      snap.fetchedAt,
    };
  }

  const tvlRows = protocols.map((p) => ({ protocol: p, tvl: tvlMap[p.slug] ?? null }));

  // Effective counts: max(local cache, subgraph-reported global). The subgraph
  // ceiling of 1000 per chain can slightly undercount on very large protocols
  // (e.g. Sablier mainnet), so we take the max with local cache which can
  // exceed it once seeded + supplemented by user activity.
  function effectiveTotal(slug: string): number {
    const local  = statsMap.get(slug)?.totalStreams ?? 0;
    const global = globalMap.get(slug)?.totalStreams ?? 0;
    return Math.max(local, global);
  }
  function effectiveActive(slug: string): number {
    const local  = statsMap.get(slug)?.activeStreams ?? 0;
    const global = globalMap.get(slug)?.activeStreams ?? 0;
    return Math.max(local, global);
  }

  const grandTotal = protocols.reduce((sum, p) => sum + effectiveTotal(p.slug), 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Token unlock trackers",
    url: "https://vestream.io/protocols",
    hasPart: protocols.map((p) => ({
      "@type": "WebPage",
      name: `${p.name} unlock tracker`,
      url: `https://vestream.io/protocols/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav theme="light" />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-14 md:pt-36 md:pb-20 px-4 md:px-8 text-center">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.3), transparent)",
          }}
        />

        <div className="relative max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{
              background: "rgba(37,99,235,0.06)",
              borderColor: "rgba(37,99,235,0.2)",
              color: "#2563eb",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#2563eb" }} />
            Live · {protocols.length} protocols · {grandTotal.toLocaleString()} streams indexed
          </div>

          <h1
            className="font-bold tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#0f172a",
            }}
          >
            Every major token unlock,<br />
            <span
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              in one live index
            </span>
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#64748b" }}
          >
            TokenVest tracks every vesting schedule on Sablier, Hedgey, Superfluid, UNCX, Team Finance,
            Unvest and PinkSale — across Ethereum, Base, BSC and Polygon. Pick a protocol below to see
            live activity.
          </p>
        </div>
      </section>

      {/* ── TVL (left) + Upcoming unlocks (right) ────────────────────────── */}
      {/* Previously LIVE ACTIVITY sat in the left cell, but pre-launch there
          isn't enough real traffic to fill it, and an empty "Reconnecting…"
          state undermines the rest of the page. Swapped in the TVL bar so
          the left column always has content and the two panels feel balanced. */}
      <section className="px-4 md:px-8 pb-10 md:pb-14 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TvlComparisonBar rows={tvlRows} externallySourced={externallySourced} />
        <UpcomingUnlockTicker />
      </section>

      {/* ── Protocol grid ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 md:pb-28 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2
              className="text-xl md:text-2xl font-bold"
              style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
            >
              Browse by protocol
            </h2>
            <p className="text-sm mt-1" style={{ color: "#64748b" }}>
              {protocols.length} protocols indexed · dive into any one for the full feed.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {protocols.map((p) => (
            <ProtocolCard
              key={p.slug}
              protocol={p}
              stats={statsMap.get(p.slug) ?? null}
              effectiveTotal={effectiveTotal(p.slug)}
              effectiveActive={effectiveActive(p.slug)}
              externalTvlUsd={externallySourced.has(p.slug) ? tvlMap[p.slug]?.tvlUsd : undefined}
            />
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1a1040 0%, #0f1525 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(124,58,237,0.18) 0%, transparent 70%)",
            }}
          />
          <div className="relative">
            <h2
              className="text-2xl md:text-3xl font-bold mb-4"
              style={{ letterSpacing: "-0.02em", color: "white" }}
            >
              Ready to get alerted on your unlocks?
            </h2>
            <p
              className="text-sm md:text-base mb-8 max-w-xl mx-auto"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Track your wallet across all 8 protocols — EVM and Solana. Get an email and push notification
              the moment any of your tokens unlock, no matter the chain or schedule.
            </p>
            <Link
              href="/early-access"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                color: "white",
                boxShadow: "0 4px 24px rgba(124,58,237,0.4)",
              }}
            >
              Get early access →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function ProtocolCard({
  protocol,
  stats,
  effectiveTotal,
  effectiveActive,
  externalTvlUsd,
}: {
  protocol:        ProtocolMeta;
  stats:           ProtocolStats | null;
  effectiveTotal:  number;
  effectiveActive: number;
  /** When set (DefiLlama-backed protocols like Streamflow), the card swaps
   *  the stream-count stats for a TVL headline — otherwise those protocols
   *  show "— streams · — active" until user traffic populates the cache,
   *  which undersells the live TVL we already have. */
  externalTvlUsd?: number;
}) {
  // Streamflow-style (external TVL) badge has different semantics than the
  // "indexed today" freshness badge — it signals "DefiLlama is our live TVL
  // source" rather than "we just ran a seeder".
  const liveLabel = externalTvlUsd && externalTvlUsd > 0
    ? "via DefiLlama"
    : stats?.lastIndexedAt
      ? `Indexed ${relativeFreshness(stats.lastIndexedAt)}`
      : `${protocol.chainIds.length} chains`;
  const showTvl = externalTvlUsd !== undefined && externalTvlUsd > 0;

  // Protocol-colour hover accent — we intensify the tint on hover by upgrading
  // the rgba 0.08 base into a 0.14 halo, purely via CSS.
  const accentHalo = protocol.bg.replace("0.08", "0.18");

  return (
    <Link
      href={`/protocols/${protocol.slug}`}
      className="rounded-2xl p-5 relative overflow-hidden transition-all hover:-translate-y-0.5"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${accentHalo} 0%, transparent 65%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold"
            style={{
              background: protocol.bg,
              border: `1px solid ${protocol.border}`,
              color: protocol.color,
            }}
          >
            {protocol.name.charAt(0)}
          </div>
          <span
            className="text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: protocol.color }}
          >
            {liveLabel}
          </span>
        </div>

        <h3 className="text-base font-bold mb-1" style={{ color: "#0f172a" }}>
          {protocol.name}
        </h3>
        <p className="text-xs leading-relaxed mb-4" style={{ color: "#64748b" }}>
          {protocol.tagline}
        </p>

        <div
          className="flex items-center gap-4 text-xs pt-3"
          style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}
        >
          {showTvl ? (
            <>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                  {compactUsd(externalTvlUsd!)}
                </div>
                <div style={{ color: "#94a3b8" }}>TVL</div>
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                  {protocol.chainIds.length}
                </div>
                <div style={{ color: "#94a3b8" }}>chain{protocol.chainIds.length === 1 ? "" : "s"}</div>
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                  Live
                </div>
                <div style={{ color: "#94a3b8" }}>indexing</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                  {effectiveTotal > 0 ? effectiveTotal.toLocaleString() : "—"}
                </div>
                <div style={{ color: "#94a3b8" }}>streams</div>
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                  {effectiveActive > 0 ? effectiveActive.toLocaleString() : "—"}
                </div>
                <div style={{ color: "#94a3b8" }}>active</div>
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                  {protocol.chainIds.length}
                </div>
                <div style={{ color: "#94a3b8" }}>chain{protocol.chainIds.length === 1 ? "" : "s"}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
