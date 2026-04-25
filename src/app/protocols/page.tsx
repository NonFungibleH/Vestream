// src/app/protocols/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Index hub for all per-protocol landing pages. Lists every protocol we
// index (currently 9) with a live "last indexed" stamp per row pulled from
// cache — so this page itself is also a freshness signal.
//
// Light B2C theme to match the individual per-protocol pages — each card
// preserves its own protocol-brand accent so the grid feels like a rainbow
// of real integrations rather than generic tiles.
//
// Page is force-dynamic (DB is not available at build time) but all slow
// work is wrapped in unstable_cache with a 5-min TTL; see the comment on
// loadProtocolsData below for the full perf story. Feeds the sitemap and
// cross-links back from every individual protocol page.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
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
import type { ProtocolTvl } from "@/lib/vesting/tvl";
import { readAllSnapshots } from "@/lib/vesting/tvl-snapshot";

// Page stays force-dynamic (DB-dependent data can't be pre-rendered at build
// time — ECONNREFUSED without DATABASE_URL). Perf comes from caching one
// level deeper: the entire "load /protocols data" payload is wrapped in
// unstable_cache with a 5-min TTL, stored in Vercel's Data Cache (shared
// across serverless instances, unlike in-process module state).
//
// TVL data model (April 2026 rewrite — honest-TVL pass):
//   TVL no longer gets computed at page-render time. The daily cron
//   `/api/cron/tvl-snapshot` runs at 03:15 UTC — it dispatches per-protocol
//   to either (a) the DefiLlama vesting-aggregate passthrough (Sablier,
//   Hedgey, Streamflow), or (b) our own exhaustive walker + DexScreener/
//   CoinGecko pricing pipeline (UNCX, Unvest, Superfluid, Team Finance,
//   PinkSale, Jupiter Lock). Results land in `protocolTvlSnapshots`.
//
// This page reads that table — one SELECT across all 9 protocols × up to 4
// chains each, sums per protocol for the headline, preserves per-chain
// breakdown for the bar, and surfaces the `methodology` + `computedAt`
// columns to the UI so every TVL number is traceable to how it was derived
// and when. See CLAUDE.md "TVL Methodology" section for the full rules.
//
// Net: cold /protocols render drops from ~10-15s to ~1-2s; warm render
// (Data Cache hit) is ~50-100ms.
export const dynamic = "force-dynamic";
const CACHE_TTL_SECONDS = 300;  // 5 min — marketing-page data, slow-changing

/**
 * All DB work the /protocols page needs, wrapped in Vercel Data Cache. Pure
 * DB reads — no external API calls on the render path.
 *
 * Hardened: the entire body runs inside a try/catch so a DB outage,
 * snapshot-table-missing, or any other downstream failure can NEVER crash
 * the page render. Worst case the user sees the marketing layout with
 * placeholder values for stream counts and TVL — which is strictly better
 * than a Server Components hard error.
 */
const loadProtocolsData = unstable_cache(
  async (): Promise<{
    statsEntries:   Array<readonly [string, ProtocolStats | null]>;
    tvlMap:         Record<string, ProtocolTvl>;
    methodologyMap: Record<string, string>;
    computedAtMap:  Record<string, string>;
  }> => {
    const protocols = listProtocols();

    // Empty-shape default — returned on any failure so the render path
    // always receives a valid object. The page handles missing tvl rows
    // gracefully via `tvlMap[slug] ?? null` everywhere.
    const empty = {
      statsEntries:   protocols.map((p) => [p.slug, null as ProtocolStats | null] as const),
      tvlMap:         {} as Record<string, ProtocolTvl>,
      methodologyMap: {} as Record<string, string>,
      computedAtMap:  {} as Record<string, string>,
    };

    try {
      const [statsEntries, snapshotRows] = await Promise.all([
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
        readAllSnapshots().catch((err) => {
          console.error("[unlocks] snapshot read failed:", err);
          return [] as Awaited<ReturnType<typeof readAllSnapshots>>;
        }),
      ]);

      // Aggregate snapshot rows by protocol — sum across chains.
      const tvlMap: Record<string, ProtocolTvl> = {};
      const methodologyMap: Record<string, string> = {};
      const computedAtMap: Record<string, string> = {};

      for (const p of protocols) {
        const rows = snapshotRows.filter((r) => {
          // Protocol may be aggregated from multiple adapter IDs (e.g. UNCX
          // displays uncx + uncx-vm). Match any of them.
          return p.adapterIds.includes(r.protocol);
        });
        if (rows.length === 0) continue;

        let tvlUsd = 0;
        let tvlHigh = 0;
        let tvlMedium = 0;
        let tvlLow = 0;
        let tokensPriced = 0;
        let tokensTotal  = 0;
        const perChainMap = new Map<number, number>();
        let latestComputedAt: Date | null = null;
        // Methodology: if ANY row is defillama-vesting, mark the protocol as
        // externally sourced for the UI tag. Walker rows win for display of
        // methodology if there's a mix (unlikely but possible).
        let methodology = rows[0].methodology;
        for (const r of rows) {
          tvlUsd    += r.tvlUsd;
          tvlHigh   += r.tvlHigh;
          tvlMedium += r.tvlMedium;
          tvlLow    += r.tvlLow;
          tokensPriced += r.tokensPriced;
          tokensTotal  += r.tokensTotal;
          perChainMap.set(r.chainId, (perChainMap.get(r.chainId) ?? 0) + r.tvlUsd);
          if (!latestComputedAt || r.computedAt > latestComputedAt) {
            latestComputedAt = r.computedAt;
          }
          // Prefer the less-precise methodology tag for display — if we have
          // both defillama and walker rows for the same protocol, the walker
          // methodology is the more "accurate" label to show.
          if (r.methodology !== "defillama-vesting") methodology = r.methodology;
        }

        methodologyMap[p.slug] = methodology;
        computedAtMap[p.slug] = (latestComputedAt ?? new Date()).toISOString();

        tvlMap[p.slug] = {
          adapterIds:      p.adapterIds,
          tvlUsd,
          tvlByBand:       { high: tvlHigh, medium: tvlMedium, low: tvlLow },
          pricingSources:  { dexscreener: 0, coingecko: 0 }, // aggregate-level — per-token not stored
          perChain:        Array.from(perChainMap.entries())
            .map(([chainId, usd]) => ({ chainId, tvlUsd: usd }))
            .sort((a, b) => b.tvlUsd - a.tvlUsd),
          tokensPriced,
          tokensSkipped:   Math.max(0, tokensTotal - tokensPriced),
          totalTokens:     tokensTotal,
          coverage:        tokensTotal > 0 ? tokensPriced / tokensTotal : (tvlUsd > 0 ? 1 : 0),
          topContributors: [],   // available in snapshot row.topContributors if needed
          computedAt:      (latestComputedAt ?? new Date()).toISOString(),
        };
      }

      return { statsEntries, tvlMap, methodologyMap, computedAtMap };
    } catch (err) {
      console.error("[unlocks] loadProtocolsData fatal:", err);
      return empty;
    }
  },
  ["protocols-page-data-v4"],
  {
    revalidate: CACHE_TTL_SECONDS,
    tags: ["protocols-page"],
  },
);

export const metadata: Metadata = {
  title: "Token unlock trackers — TokenVest",
  description:
    "Live on-chain unlock trackers for Sablier, Hedgey, Superfluid, UNCX, Team Finance, Unvest, PinkSale, Streamflow and Jupiter Lock — across Ethereum, Base, BSC, Polygon and Solana.",
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

  // Load from Vercel Data Cache — wraps a single SELECT over the
  // protocolTvlSnapshots table + per-protocol stream counts. The snapshot
  // table itself is populated daily by /api/cron/tvl-snapshot at 03:15 UTC;
  // render path is pure DB, no DefiLlama/subgraph/RPC calls.
  const { statsEntries, tvlMap, methodologyMap, computedAtMap } =
    await loadProtocolsData();
  const statsMap = new Map(statsEntries);

  // Rows whose snapshot methodology is "defillama-vesting" — the UI surfaces
  // these with a "via DefiLlama" attribution tag. Everything else was
  // computed by our own walker + pricing pipeline.
  const externallySourced = new Set<string>();
  for (const slug of Object.keys(methodologyMap)) {
    if (methodologyMap[slug] === "defillama-vesting") externallySourced.add(slug);
  }

  const tvlRows = protocols.map((p) => ({ protocol: p, tvl: tvlMap[p.slug] ?? null }));

  // Oldest snapshot age across rendered protocols, used by the
  // TvlComparisonBar tooltip as a "last verified X ago" signal.
  const computedAtValues = Object.values(computedAtMap);
  const oldestSnapshot = computedAtValues.length > 0
    ? new Date(Math.min(...computedAtValues.map((s) => new Date(s).getTime())))
    : null;
  const snapshotAgeHours = oldestSnapshot
    ? Math.max(0, Math.round((Date.now() - oldestSnapshot.getTime()) / 3_600_000))
    : null;

  // Stream counts come from our indexed cache only. Historically we also
  // queried every subgraph for a "global" count and took the max — but that
  // doubled the page's cold-start latency and the cache number is the one
  // that actually matches everything else on the site.
  function effectiveTotal(slug: string): number {
    return statsMap.get(slug)?.totalStreams ?? 0;
  }
  function effectiveActive(slug: string): number {
    return statsMap.get(slug)?.activeStreams ?? 0;
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
            Unvest, PinkSale, Streamflow and Jupiter Lock — across Ethereum, Base, BSC, Polygon and
            Solana. Pick a protocol below to see live activity.
          </p>
        </div>
      </section>

      {/* ── TVL (left) + Upcoming unlocks (right) ────────────────────────── */}
      {/* Previously LIVE ACTIVITY sat in the left cell, but pre-launch there
          isn't enough real traffic to fill it, and an empty "Reconnecting…"
          state undermines the rest of the page. Swapped in the TVL bar so
          the left column always has content and the two panels feel balanced. */}
      <section className="px-4 md:px-8 pb-10 md:pb-14 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TvlComparisonBar
          rows={tvlRows}
          externallySourced={externallySourced}
          snapshotAgeHours={snapshotAgeHours}
        />
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
              Track your wallet across all 9 protocols — EVM and Solana. Get an email and push notification
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
