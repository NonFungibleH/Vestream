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
import { after } from "next/server";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
// LiveActivityTicker intentionally removed from this page — it polls
// /api/unlocks/live-activity and renders recent-activity rows. Pre-launch we
// don't have enough platform traffic to make the feed feel alive, and an empty
// "Reconnecting to the live feed…" placeholder undermines the rest of the
// page. Re-add when we have steady real traffic (track via analytics).
import { UpcomingUnlockTicker } from "@/components/UpcomingUnlockTicker";
import { getUpcomingUnlocksEnriched } from "@/lib/vesting/upcoming-unlocks";
import { TvlComparisonBar } from "@/components/TvlComparisonBar";
import { listProtocols, protocolIcon, type ProtocolMeta } from "@/lib/protocol-constants";
import {
  getAllProtocolStatsMap,
  foldProtocolStats,
  relativeFreshness,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";
import type { ProtocolTvl } from "@/lib/vesting/tvl";
import { readAllSnapshots } from "@/lib/vesting/tvl-snapshot";
import {
  getLastGoodProtocolsData,
  setLastGoodProtocolsData,
} from "@/lib/vesting/page-data-fallback";

// ISR with 5-minute revalidation (2026-06-12). This page was force-dynamic
// for a long stretch, relying on src/middleware.ts to inject an SWR
// Cache-Control header for edge caching — but on Next 16.3.0-canary.19 the
// framework's `private, no-cache, no-store` for dynamic routes overrides
// middleware-set Cache-Control (verified live: /protocols served no-store +
// x-vercel-cache MISS while static /unlocks kept the header). Net effect:
// ZERO HTTP caching — every visitor executed the lambda, and any cold
// Data-Cache window stalled long enough for Cloudflare to kill the
// connection (the recurring QUIC-error / 524 reports).
//
// ISR makes the framework emit `s-maxage=300, stale-while-revalidate`
// natively, so Vercel's edge + Cloudflare serve cached HTML instantly and
// revalidate in the background — users never wait on a render. The DB-at-
// build-time problem that originally motivated force-dynamic is handled by
// the NEXT_PHASE short-circuits in the query helpers; the build-phase
// degraded result throws (see loader guard below) and the catch bakes the
// Redis last-good payload instead of dashes.
//
// Perf still comes from caching one level deeper too: the entire "load
// /protocols data" payload is wrapped in unstable_cache, stored in Vercel's
// Data Cache (shared across instances AND persisted across deploys).
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
// (Data Cache hit) is ~50-100ms — and with ISR, no visitor ever waits on
// either: renders happen in the background revalidation, off the user path.
export const revalidate = 300;
// 1800s (30 min) — was 300s. Bumped 2026-05-10 as part of the egress-
// reduction pass after Supabase Free's 5 GB/month quota was exceeded.
// /protocols data (per-protocol stream counts + TVL snapshots) is updated
// by the daily cron at 03:00/03:15 UTC; intra-day movement is bounded by
// the cron cadence anyway, so a 30-min stale window has no real effect on
// what the page can show. Cron-side `revalidateTag("protocols-page")` in
// /api/cron/seed-cache + /api/cron/tvl-snapshot still busts the cache the
// moment the cron lands, so post-cron freshness is unchanged.
const CACHE_TTL_SECONDS = 1800;

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
      // Block-explorer-fast render path: TWO small pre-aggregated reads only,
      // never the 176k-row vesting_streams_cache. Previously this fanned out N
      // parallel getProtocolStats() calls (each able to fall into a ~5–8s
      // GROUP-BY over that raw table) which saturated the Supabase pooler and
      // produced 8s+ TTFB. Now: one bulk protocol_summaries read folded in
      // memory + one snapshots read.
      const [summariesMap, snapshotRows] = await Promise.all([
        getAllProtocolStatsMap().catch((err) => {
          console.error("[protocols] summaries read failed:", err);
          return new Map<string, ProtocolStats>();
        }),
        readAllSnapshots().catch((err) => {
          console.error("[unlocks] snapshot read failed:", err);
          return [] as Awaited<ReturnType<typeof readAllSnapshots>>;
        }),
      ]);

      const statsEntries: Array<readonly [string, ProtocolStats | null]> =
        protocols.map((p) => [p.slug, foldProtocolStats(summariesMap, p.adapterIds)] as const);

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
          pricingSources:  { dexscreener: 0, defillama: 0, coingecko: 0 }, // aggregate-level — per-token not stored
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

      // Guard against caching a degraded result. If the bulk summaries read
      // failed (caught → empty map), every foldProtocolStats() returns null.
      // Caching that — or saving it as last-good — makes the page show "0
      // streams indexed" for 5 min and poisons the fallback. Throw instead:
      // unstable_cache skips the write, the caller keeps the previous last-good
      // (real counts), and the next request retries fresh.
      if (statsEntries.length > 0 && statsEntries.every(([, s]) => s === null)) {
        throw new Error("all protocol stats null — skipping cache to avoid serving 0 streams");
      }
      // Same guard for TVL (2026-06-26). The snapshot read is wrapped in
      // `.catch(() => [])`, so a transient pooler blip OR the build-phase
      // short-circuit returns zero rows — which the old code cached as a
      // "legitimately empty" tvlMap, blanking the TVL bar ("Pricing indexed
      // tokens…") for the full 5-min TTL. In steady state every protocol has a
      // snapshot row, so zero rows means a degraded read, never legitimate:
      // throw to skip the cache and fall back to last-good (now durable in
      // Postgres — see page-data-fallback.ts) instead of caching emptiness.
      if (snapshotRows.length === 0) {
        throw new Error("zero TVL snapshot rows — skipping cache to avoid blanking the TVL bar");
      }

      return { statsEntries, tvlMap, methodologyMap, computedAtMap };
    } catch (err) {
      // Throw — don't cache this empty result. unstable_cache doesn't
      // persist thrown errors, so the next request retries fresh. The
      // page component catches this and falls back to last-known-good
      // from Redis (page-data-fallback.ts). See /protocols/[slug] page
      // for the matching pattern.
      console.error("[unlocks] loadProtocolsData fatal — throwing to skip cache write:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  // v6 = bump after the May 5 2026 DefiLlama chain-filtering + sanity-cap
  // pivot. Numbers materially shifted (Sablier $5.48B → $1.69B with
  // Arbitrum-vesting outlier capped, Streamflow $552M restored from a
  // wrongly-clamped $78M, etc.). Key bump force-flushes Vercel's Data
  // Cache so users see the new figures immediately rather than waiting
  // out the 5-min TTL. v5 lasted from the page-data-fallback work.
  // v11 = flush the poisoned all-null-stats entry that rendered "0 streams
  // indexed" (2026-06-04). Paired with the all-null guard above.
  ["protocols-page-data-v11"],
  {
    revalidate: CACHE_TTL_SECONDS,
    tags: ["protocols-page"],
  },
);

export const metadata: Metadata = {
  title: "Token unlock trackers — Vestream",
  description:
    "Live on-chain unlock trackers for Sablier, Hedgey, Superfluid, LlamaPay, UNCX, Unvest, PinkSale, Streamflow and Jupiter Lock — across Ethereum, Base, BSC, Polygon and Solana.",
  alternates: { canonical: "https://www.vestream.io/protocols" },
  openGraph: {
    title: "Token unlock trackers — Vestream",
    description:
      "Live on-chain unlock trackers for every major vesting protocol. Track your wallet, get alerts before every cliff.",
    url: "https://www.vestream.io/protocols",
    siteName: "Vestream",
    type: "website",
  },
  // 2026-05-17: added Twitter card for parity with per-protocol pages.
  // Without this, Twitter falls back to the root-layout fallback card —
  // generic homepage hero instead of the protocols-index branding.
  twitter: {
    card:        "summary_large_image",
    title:       "Token unlock trackers — Vestream",
    description: "Live on-chain unlock trackers for every major vesting protocol. Track your wallet, get alerts before every cliff.",
  },
};

export default async function UnlocksIndexPage() {
  const protocols = listProtocols();

  // Load from Vercel Data Cache — wraps a single SELECT over the
  // protocolTvlSnapshots table + per-protocol stream counts. The snapshot
  // table itself is populated daily by /api/cron/tvl-snapshot at 03:15 UTC;
  // render path is pure DB, no DefiLlama/subgraph/RPC calls.
  //
  // "Never empty" pattern (matches /protocols/[slug]):
  //   1. loadProtocolsData throws on fatal failure (won't cache empty)
  //   2. We catch and fall back to Redis last-good
  //   3. After successful render, we write to last-good (fire-and-forget)
  type ProtocolsData = Awaited<ReturnType<typeof loadProtocolsData>>;
  const fallbackEmpty: ProtocolsData = {
    statsEntries:   protocols.map((p) => [p.slug, null]),
    tvlMap:         {},
    methodologyMap: {},
    computedAtMap:  {},
  };
  let pageData: ProtocolsData;
  try {
    pageData = await loadProtocolsData();
    // Inside after(): the Upstash SDK write is a no-store fetch, which
    // would hard-error / dynamic-flip an ISR render if it executed during
    // render. after() runs it once the response/prerender has finished.
    const goodData = pageData;
    after(() => setLastGoodProtocolsData(goodData));
  } catch (err) {
    console.warn("[protocols-index] loadProtocolsData threw, trying last-good:", err);
    // ISR-safe raw-fetch read — at build time this bakes the last-good
    // payload into the prerendered HTML instead of dashes (the build-phase
    // NEXT_PHASE short-circuits make the loader throw via its degraded
    // guard, landing here).
    const lastGood = await getLastGoodProtocolsData<ProtocolsData>();
    pageData = lastGood ?? fallbackEmpty;
  }
  const { statsEntries, tvlMap, methodologyMap, computedAtMap } = pageData;
  const statsMap = new Map(statsEntries);

  // Rows whose snapshot methodology is "defillama-vesting" — the UI surfaces
  // these with a "via DefiLlama" attribution tag. Everything else was
  // computed by our own walker + pricing pipeline.
  const externallySourced = new Set<string>();
  for (const slug of Object.keys(methodologyMap)) {
    if (methodologyMap[slug] === "defillama-vesting") externallySourced.add(slug);
  }

  const tvlRows = protocols.map((p) => {
    const stats = statsMap.get(p.slug);
    return {
      protocol:      p,
      tvl:           tvlMap[p.slug] ?? null,
      // Active stream count from indexed-cache stats — same number that
      // populates the per-protocol detail page. Surfaced next to the
      // dollar TVL so the headline reflects scale alongside dollars
      // (Sablier alone manages ~365k positions across our chains).
      activeStreams: stats?.activeStreams ?? null,
      // Cumulative total — includes ended / fully-withdrawn streams.
      // Helpful context: a protocol with 1k active and 30k total has
      // demonstrably been used at scale, even if claim activity has
      // settled down.
      totalStreams:  stats?.totalStreams ?? null,
    };
  });

  // Oldest snapshot age across rendered protocols, used by the
  // TvlComparisonBar tooltip as a "last verified X ago" signal.
  const computedAtValues = Object.values(computedAtMap);
  const oldestSnapshot = computedAtValues.length > 0
    ? new Date(Math.min(...computedAtValues.map((s) => new Date(s).getTime())))
    : null;
  const snapshotAgeHours = oldestSnapshot
    ? Math.max(0, Math.round((Date.now() - oldestSnapshot.getTime()) / 3_600_000))
    : null;

  // Server-render the FIRST paint of the upcoming-unlocks panel so it shows
  // data instantly instead of a client fetch-after-mount skeleton (the "not
  // instant" report). The widget still polls /api/unlocks/upcoming every 30s
  // for liveness — this just seeds the initial render. redis:false because
  // this is an ISR render path (see upcoming-unlocks.ts). Best-effort: on
  // failure the widget falls back to its own client fetch (no regression).
  let initialUpcoming:
    | { ok: true; nowMs: number; unlocks: Awaited<ReturnType<typeof getUpcomingUnlocksEnriched>> }
    | null = null;
  try {
    const unlocks = await getUpcomingUnlocksEnriched(15, { redis: false });
    initialUpcoming = { ok: true, nowMs: Date.now(), unlocks };
  } catch (err) {
    console.warn("[protocols-index] upcoming initial render failed:", err);
  }

  // Stream counts come from our indexed cache only. Historically we also
  // queried every subgraph for a "global" count and took the max — but that
  // doubled the page's cold-start latency and the cache number is the one
  // that actually matches everything else on the site.
  function effectiveTotal(slug: string): number {
    return statsMap.get(slug)?.totalStreams ?? 0;
  }

  const grandTotal = protocols.reduce((sum, p) => sum + effectiveTotal(p.slug), 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Token unlock trackers",
    url: "https://www.vestream.io/protocols",
    hasPart: protocols.map((p) => ({
      "@type": "WebPage",
      name: `${p.name} unlock tracker`,
      url: `https://www.vestream.io/protocols/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
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
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(28,184,184,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(28,184,184,0.3), transparent)",
          }}
        />

        <div className="relative max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{
              background: "rgba(28,184,184,0.06)",
              borderColor: "rgba(28,184,184,0.2)",
              color: "#1CB8B8",
            }}
          >
            {/* Radar-style pulsing dot — same pattern as TvlComparisonBar
                + UpcomingUnlockTicker so the "live" signal looks consistent
                across every surface. The expanding ring makes the live-ness
                obvious; a static `animate-pulse` opacity fade reads as
                background animation noise instead of "this is live data". */}
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#1CB8B8" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#1CB8B8" }} />
            </span>
            Live · {protocols.length} protocols · {grandTotal.toLocaleString()} streams indexed
          </div>

          <h1
            className="font-bold tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#1A1D20",
            }}
          >
            Every major token unlock,<br />
            <span style={{ color: "#1CB8B8" }}>
              in one live index
            </span>
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#8B8E92" }}
          >
            Every major vesting schedule across Ethereum, Base, BSC, Polygon, Arbitrum, Optimism and Solana — indexed in real time. Pick a protocol below to see live activity.
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
        <UpcomingUnlockTicker initialData={initialUpcoming} />
      </section>

      {/* ── Protocol grid ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-12 md:pb-16 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2
              className="text-xl md:text-2xl font-bold"
              style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}
            >
              Browse by protocol
            </h2>
            <p className="text-sm mt-1" style={{ color: "#8B8E92" }}>
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
              tvlUsd={tvlMap[p.slug]?.tvlUsd}
              isExternalSource={externallySourced.has(p.slug)}
            />
          ))}
        </div>
      </section>

      {/* ── Cross-link to full unlock calendar ──────────────────────────── */}
      {/* Sits BELOW the protocol grid intentionally — by the time a visitor
          has scrolled past every protocol, they're in deep-dive mode and a
          link to "every upcoming unlock by window" is the natural next
          surface. Above-the-fold placement competed with the TVL bar and
          ticker for attention. */}
      <section className="px-4 md:px-8 pb-16 md:pb-20 max-w-5xl mx-auto">
        <Link
          href="/unlocks"
          className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-all hover:-translate-y-0.5"
          style={{
            background: "white",
            border:     "1px solid rgba(28,184,184,0.22)",
            boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(28,184,184,0.06)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(28,184,184,0.10)", border: "1px solid rgba(28,184,184,0.22)" }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: "#1A1D20" }}>
                See the full unlock calendar
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#8B8E92" }}>
                Browse upcoming unlocks by window — today, this week, this month, or rolling 30/60/90 days.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold whitespace-nowrap hidden sm:inline" style={{ color: "#0F8A8A" }}>
            Open calendar →
          </span>
        </Link>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)",
            border: "1px solid rgba(15,138,138,0.25)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(15,138,138,0.18) 0%, transparent 70%)",
            }}
          />
          <div className="relative">
            <h2
              className="text-2xl md:text-3xl font-bold mb-4"
              style={{ letterSpacing: "-0.02em", color: "white" }}
            >
              See what&apos;s vesting to your wallet
            </h2>
            <p
              className="text-sm md:text-base mb-8 max-w-xl mx-auto"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Paste any address — we&apos;ll scan all 9 protocols across EVM and Solana
              and surface every stream, lock, and unlock you&apos;re owed. Free, no signup.
            </p>
            <Link
              href="/find-vestings"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{
                background: "#1CB8B8",
                color: "white",
                boxShadow: "0 4px 24px rgba(15,138,138,0.4)",
              }}
            >
              Find my vestings →
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
  tvlUsd,
  isExternalSource,
}: {
  protocol:         ProtocolMeta;
  stats:            ProtocolStats | null;
  /** Aggregated TVL for this protocol (sum across chains) from the daily
   *  snapshot table — populated for DefiLlama-sourced AND walker-sourced
   *  protocols. Undefined / 0 when the protocol has no snapshot yet. */
  tvlUsd?:          number;
  /** True for DefiLlama-passthrough protocols (Sablier, Hedgey, Streamflow);
   *  drives the "via DefiLlama" attribution label only — not the layout. */
  isExternalSource: boolean;
}) {
  // All cards use the SAME bottom-row layout: TVL · chains · "Live" — the
  // top-right uppercase badge handles source/freshness nuance instead.
  // Stream counts intentionally omitted: DefiLlama-sourced protocols don't
  // populate vestingStreamsCache (per-user-query cache, not a global index),
  // so "— streams" alongside real TVL would undersell those protocols. TVL
  // is the universally-comparable metric.
  const hasTvl = typeof tvlUsd === "number" && tvlUsd > 0;
  const liveLabel = isExternalSource
    ? "via DefiLlama"
    : stats?.lastIndexedAt
      ? `Indexed ${relativeFreshness(stats.lastIndexedAt)}`
      : `${protocol.chainIds.length} chain${protocol.chainIds.length === 1 ? "" : "s"}`;

  // Protocol-colour hover accent — we intensify the tint on hover by upgrading
  // the rgba 0.08 base into a 0.14 halo, purely via CSS.
  const accentHalo = protocol.bg.replace("0.08", "0.18");

  // Logo mark for the avatar tile (matches the homepage "Available on" strip);
  // null for icon-less protocols (Hedgey) → colour-tinted monogram fallback.
  const icon = protocolIcon(protocol.slug);

  return (
    <Link
      href={`/protocols/${protocol.slug}`}
      className="rounded-2xl p-5 relative overflow-hidden transition-all hover:-translate-y-0.5"
      style={{
        background: "white",
        border: "1px solid rgba(21,23,26,0.10)",
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
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold overflow-hidden"
            style={{
              background: protocol.bg,
              border: `1px solid ${protocol.border}`,
              color: protocol.color,
            }}
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icon}
                alt=""
                width={30}
                height={30}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              protocol.name.charAt(0)
            )}
          </div>
          <span
            className="text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: protocol.color }}
          >
            {liveLabel}
          </span>
        </div>

        <h3 className="text-base font-bold mb-1" style={{ color: "#1A1D20" }}>
          {protocol.name}
        </h3>
        <p className="text-xs leading-relaxed mb-4" style={{ color: "#8B8E92" }}>
          {protocol.tagline}
        </p>

        <div
          className="flex items-center gap-4 text-xs pt-3"
          style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}
        >
          <div>
            <div className="font-semibold text-sm" style={{ color: "#1A1D20" }}>
              {hasTvl ? compactUsd(tvlUsd!) : "—"}
            </div>
            <div style={{ color: "#B8BABD" }}>TVL</div>
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#1A1D20" }}>
              {protocol.chainIds.length}
            </div>
            <div style={{ color: "#B8BABD" }}>chain{protocol.chainIds.length === 1 ? "" : "s"}</div>
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#1A1D20" }}>
              Live
            </div>
            <div style={{ color: "#B8BABD" }}>indexing</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
