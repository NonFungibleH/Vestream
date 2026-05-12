// src/app/protocols/[protocol]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol SEO landing page.
//
// Theme: B2C light (matches the homepage `/` — #F5F5F3 page, white cards).
// Brand nod: each page is dominated by the protocol's own accent colour —
// the primary CTA, hero gradient, live-dot, stat highlights and unlock card
// borders all take their cue from PROTOCOLS[slug].color. TokenVest stays the
// container; the protocol gets the visual attention.
//
// Rendering: ISR with revalidate=60. Stats + latest/upcoming unlock are
// re-fetched from vestingStreamsCache every minute so crawlers + LLMs see
// genuinely fresh content. dynamicParams=false locks routes to the curated 7.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  getProtocol,
  listProtocols,
  PROTOCOL_SLUGS,
  type ProtocolMeta,
} from "@/lib/protocol-constants";
import {
  chainLabel,
  formatAmountCompact,
  getLatestUnlock,
  getNextUpcomingUnlock,
  getProtocolStats,
  getUpcomingUnlocksForProtocol,
  relativeFreshness,
  relativeTimeSince,
  relativeTimeUntil,
  toDateSafe,
  truncateAddress,
  type ProtocolStats,
  type UnlockGroupSummary,
  type UnlockSummary,
} from "@/lib/vesting/protocol-stats";
import { getQuickUsdPrices, toUsdValue, formatUsdCompact } from "@/lib/vesting/quick-prices";
import {
  getLastGoodProtocolData,
  setLastGoodProtocolData,
} from "@/lib/vesting/page-data-fallback";

// ISR with 60-second revalidation. Builds pre-render every protocol slug
// once, runtime requests are served from edge cache (Cache-Control:
// s-maxage=60), and the page revalidates in the background after expiry
// so users always get instant page loads.
//
// The original force-dynamic was added because builds without DB access
// hung for 60s × N retries when the loadProtocolData function tried to
// reach Postgres. We now short-circuit DB work during the build phase
// (NEXT_PHASE === "phase-production-build") so builds always finish in
// seconds — empty pages get baked, ISR fills them on first runtime hit,
// and Vercel's edge then serves them sub-100ms to every subsequent
// visitor without ever calling our lambda.
//
// This is the right architecture for marketing pages with mostly-static
// data (protocol stats, TVL, next-unlock) that change on minute scale.
// The 1-2s cold renders the user reported as "painfully slow" went
// away because no user ever hits a cold lambda — only the ISR
// background revalidation does, and that's not on the critical path.
// Force dynamic rendering — the page calls Upstash Redis (no-store) via
// getQuickUsdPrices, which Next.js 16.3.0-canary.19 hard-errors on for
// any page also trying to ISR. Middleware-level Cache-Control header
// (src/middleware.ts → isMarketingDataPath) supplies the SWR caching
// previously provided by `revalidate = 60` — users still get edge-cached
// responses, the lambda only fires once every 60s per protocol.
//
// Was: `revalidate = 60` + `dynamicParams = false`. Both removed; SWR
// edge cache covers the same UX without the static-dynamic boundary error.
export const dynamic = "force-dynamic";

// Per-slug data load wrapped in Vercel Data Cache. 5-min TTL — same as
// /protocols index. Without this, EVERY visit triggered live subgraph
// round-trips via getGlobalStats(aid) per adapter (UNCX = 2 adapters,
// each ~5-10s on cold lambdas). User-facing symptom: clicking a protocol
// card on /protocols felt like the browser hung — page just sat there
// for 10-20s before rendering.
//
// getGlobalStats has been DROPPED entirely (same as the /protocols index
// rewrite) — the cache count from getProtocolStats is the canonical
// source. Subgraph live counts were redundant + slow.
// Bumped 300 → 3600 (1h) on May 4 2026. The protocol detail pages were
// hitting the Cloudflare 100s ceiling under deploy-cache-reset conditions
// because each cold render makes 4 DB aggregations + a DexScreener pricing
// call. With a 60s revalidate, the cache window kept rolling closed and
// every fresh refresh hit a cold path. 1h means one cold render per
// (protocol, deploy) instead of one every minute, and amortises the
// pricing cost across thousands of subsequent visits.
const CACHE_TTL_SECONDS = 3600;

interface ProtocolPageData {
  stats:        ProtocolStats | null;
  latest:       UnlockSummary | null;
  upcoming:     UnlockSummary | null;
  upcomingList: UnlockGroupSummary[];
}

// Empty-shape default. Returned during the build phase (no DB access)
// and on any runtime failure. ISR re-renders on the next request after
// revalidate=60, so empty pages get filled with real data quickly
// post-deploy.
const EMPTY_PROTOCOL_DATA: ProtocolPageData = {
  stats:        null,
  latest:       null,
  upcoming:     null,
  upcomingList: [],
};

const loadProtocolData = unstable_cache(
  async (adapterIds: readonly string[]): Promise<ProtocolPageData> => {
    // Skip DB work during the build phase. Postgres-js hangs for 60s
    // retrying ECONNREFUSED on missing DATABASE_URL (CI / cold builds),
    // which used to time out the build per-page. Returning empty here
    // lets the build complete in seconds; ISR fills the pages with real
    // data on the first runtime request after deploy.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return EMPTY_PROTOCOL_DATA;
    }
    // Each query gets resolved independently. If three of four succeed and
    // one throws (transient DB blip, Multicall timeout, RPC slow), we want
    // to render with the three successful results, NOT discard everything
    // and serve all-dashes. The previous Promise.all + try/catch returned
    // EMPTY_PROTOCOL_DATA on any single failure, which then got cached for
    // 5 minutes by the surrounding unstable_cache — turning a single 200ms
    // hiccup into 5 minutes of empty-page UX. Production-incident
    // pattern observed when the deep seed cron ran concurrently with
    // page renders: random query slowdowns cascaded into oscillating
    // empty/full pages as 5-min cache windows rolled over.
    const settled = await Promise.allSettled([
      getProtocolStats(adapterIds),
      getLatestUnlock(adapterIds),
      getNextUpcomingUnlock(adapterIds),
      getUpcomingUnlocksForProtocol(adapterIds, 6),
    ]);
    const stats        = settled[0].status === "fulfilled" ? settled[0].value : null;
    const latest       = settled[1].status === "fulfilled" ? settled[1].value : null;
    const upcoming     = settled[2].status === "fulfilled" ? settled[2].value : null;
    const upcomingList = settled[3].status === "fulfilled" ? settled[3].value : [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "rejected") {
        const queryName = ["getProtocolStats", "getLatestUnlock", "getNextUpcomingUnlock", "getUpcomingUnlocksForProtocol"][i];
        console.warn(`[protocol-page] ${queryName} failed for ${adapterIds.join(",")}:`, r.reason);
      }
    }

    // Detect "empty due to failure" vs "legitimately empty". A protocol
    // that's truly fresh-with-no-data is rare but possible; a protocol
    // whose every query rejected is the production-incident case.
    const rejectionCount = settled.filter((r) => r.status === "rejected").length;
    const allEmpty       = !stats && !latest && !upcoming && upcomingList.length === 0;

    if (allEmpty && rejectionCount > 0) {
      // THROW — don't cache an empty result that came from failures. The
      // unstable_cache layer doesn't cache thrown errors, so the next
      // request retries fresh. The page component catches this and falls
      // back to last-known-good from Redis (page-data-fallback.ts).
      throw new Error(
        `[protocol-page] degraded render for ${adapterIds.join(",")}: ${rejectionCount}/${settled.length} queries failed; declining to cache empty result`,
      );
    }

    // Skip pricing entirely if EVERY query genuinely returned empty —
    // saves an unnecessary DexScreener round-trip.
    if (allEmpty) {
      return EMPTY_PROTOCOL_DATA;
    }

    // Attach USD values to the cards. We batch-price every distinct
    // (chain, address) across the latest + next + upcoming list so the
    // card renderer doesn't need to know about pricing — it just reads
    // `unlock.usdValue` and shows "—" when null.
    const tokensToPrice: Array<{ chainId: number; address: string }> = [];
    const pushToken = (u: UnlockSummary | null) => {
      if (u && u.tokenAddress) {
        tokensToPrice.push({ chainId: u.chainId, address: u.tokenAddress });
      }
    };
    pushToken(latest);
    pushToken(upcoming);
    for (const u of upcomingList) pushToken(u);
    // Pricing call gets a hard 5s ceiling. DexScreener occasionally hangs
    // under load and a stalled fetch cascades into the Cloudflare 100s
    // gateway timeout. Better to render without USD values than serve a
    // 504 — the unlock card still shows the token amount + symbol.
    // Promise.race because AbortSignal in fetch's `init` disables Next's
    // data cache (CLAUDE.md landmine).
    let priceMap;
    try {
      priceMap = await Promise.race([
        getQuickUsdPrices(tokensToPrice),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("pricing timeout (5s)")), 5_000),
        ),
      ]);
    } catch (err) {
      console.warn(`[protocol-page] pricing failed for ${adapterIds.join(",")}; rendering without USD values:`, err);
      priceMap = new Map();
    }
    const enrich = <T extends UnlockSummary>(u: T | null): T | null => {
      if (!u) return null;
      const price = priceMap.get(`${u.chainId}:${u.tokenAddress.toLowerCase()}`);
      return { ...u, usdValue: toUsdValue(u.amount, u.tokenDecimals, price) };
    };
    return {
      stats,
      latest:   enrich(latest),
      upcoming: enrich(upcoming),
      upcomingList: upcomingList.map((g) => enrich(g)!),
    };
  },
  // v5 = bump after 8ddabb7 (Promise.allSettled). Bumping the cache key
  // invalidates every poisoned-empty entry from before that fix and forces
  // a fresh render. Cheap operation — at most 9 protocols × N chains worth
  // of cold renders, all of which fall under the new resilient code path.
  ["protocol-page-data-v5"],
  { revalidate: CACHE_TTL_SECONDS, tags: ["protocol-page"] },
);

export async function generateStaticParams() {
  // Skip disabled protocols (e.g. team-finance, paused May 2026) — paired
  // with `dynamicParams = false` above this means a paused protocol's URL
  // returns 404 from the static-params layer, before we ever hit the page
  // body's notFound() guard.
  return PROTOCOL_SLUGS
    .map((slug) => ({ slug, meta: getProtocol(slug) }))
    .filter(({ meta }) => meta && !meta.disabled)
    .map(({ slug }) => ({ protocol: slug }));
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ protocol: string }> },
): Promise<Metadata> {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta || meta.disabled) return { title: "Not found" };

  const title = `${meta.name} unlock tracker & alerts — TokenVest`;
  const description = meta.description.slice(0, 158).replace(/\s+\S*$/, "") + "…";
  const keywords = meta.searchKeywords;
  const url = `https://vestream.io/protocols/${meta.slug}`;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "TokenVest",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ProtocolLandingPage(
  { params }: { params: Promise<{ protocol: string }> },
) {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta || meta.disabled) notFound();

  // Single-cached fetch for the page's data — see CACHE_TTL_SECONDS comment.
  //
  // Three-layer resilience for "never empty" UX:
  //   1. loadProtocolData throws on degraded result (Promise.allSettled
  //      detected rejections AND all data was empty). This prevents
  //      unstable_cache from poisoning a 5-min cache window with empty.
  //   2. We catch the throw and read last-known-good from Redis. If a
  //      previous successful render exists (almost always after the
  //      first deploy), we render with that instead of dashes.
  //   3. After a successful render, we write to last-good (fire-and-
  //      forget — non-blocking). Each render keeps the fallback fresh.
  let pageData: ProtocolPageData;
  try {
    pageData = await loadProtocolData(meta.adapterIds);
    // Don't await — non-blocking write to Redis last-good.
    setLastGoodProtocolData(meta.slug, pageData);
  } catch (err) {
    console.warn(`[protocol-page] loadProtocolData threw for ${meta.slug}:`, err);
    const lastGood = await getLastGoodProtocolData<ProtocolPageData>(meta.slug);
    pageData = lastGood ?? EMPTY_PROTOCOL_DATA;
  }
  const { stats, latest, upcoming, upcomingList } = pageData;

  // Stream counts now come from cache only (getGlobalStats was dropped —
  // see the loadProtocolData comment for the why).
  const effectiveTotal  = stats?.totalStreams  ?? 0;
  const effectiveActive = stats?.activeStreams ?? 0;
  const hasData = effectiveTotal > 0;
  const related = meta.relatedSlugs
    .map((s) => getProtocol(s))
    .filter((p): p is ProtocolMeta => !!p);

  // Stronger tints derived from the base accent — used for hero wash and CTA shadow.
  const accentWash = meta.bg.replace("0.08", "0.12");
  const accentHalo = meta.bg.replace("0.08", "0.22");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `https://vestream.io/protocols/${meta.slug}`,
        name: `${meta.name} unlock tracker & alerts`,
        description: meta.description,
        url: `https://vestream.io/protocols/${meta.slug}`,
        isPartOf: { "@id": "https://vestream.io/#website" },
        dateModified: (toDateSafe(stats?.lastIndexedAt ?? null) ?? new Date()).toISOString(),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://vestream.io/" },
          { "@type": "ListItem", position: 2, name: "Protocols", item: "https://vestream.io/protocols" },
          { "@type": "ListItem", position: 3, name: meta.name, item: `https://vestream.io/protocols/${meta.slug}` },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav theme="light" />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* Breadcrumb is INSIDE the hero (left-aligned, above the centered
          headline) so the protocol-coloured halo wraps both. Avoids the
          segmented look of a separate breadcrumb bar between SiteNav and
          the branded hero treatment. */}
      <section className="relative overflow-hidden pt-20 pb-14 md:pt-24 md:pb-20 px-4 md:px-8 text-center">
        {/* Protocol-coloured wash behind the hero */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${accentHalo} 0%, transparent 70%)`,
        }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(90deg, transparent, ${meta.color}80, transparent)`,
        }} />

        {/* Breadcrumb — left-aligned, sits inside the protocol's halo so it
            shares the branded ground with the headline below. Pairs with
            the BreadcrumbList JSON-LD for SEO. */}
        <nav
          aria-label="Breadcrumb"
          className="relative max-w-4xl mx-auto mb-8 text-left"
        >
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li>
              <Link href="/" className="hover:underline transition-colors" style={{ color: "#8B8E92" }}>
                Home
              </Link>
            </li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li>
              <Link href="/protocols" className="hover:underline transition-colors" style={{ color: "#8B8E92" }}>
                Protocols
              </Link>
            </li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>
              {meta.name}
            </li>
          </ol>
        </nav>

        <div className="relative max-w-4xl mx-auto">
          {/* Live indicator in the protocol's colour */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: meta.color }}
            />
            {stats?.lastIndexedAt
              ? `Live · indexed ${relativeFreshness(stats.lastIndexedAt)}`
              : `Live · indexing ${meta.chainIds.length} chains`}
          </div>

          {/* Protocol logo tile */}
          <div className="flex items-center justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold"
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color, boxShadow: `0 6px 20px ${accentWash}` }}
            >
              {meta.name.charAt(0)}
            </div>
          </div>

          <h1
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.03em", color: "#1A1D20" }}
          >
            {meta.name} unlock<br />
            <span style={{ color: "#1CB8B8" }}>tracker & alerts</span>
          </h1>

          <p className="text-base md:text-lg mb-3" style={{ color: "#334155" }}>
            {meta.tagline}
          </p>

          <p className="text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: "#8B8E92" }}>
            {meta.description}
          </p>

          <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap">
            {/* Primary CTA uses the protocol's brand colour — strongest brand nod */}
            <Link
              href="/early-access"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: meta.color, color: "white", boxShadow: `0 6px 20px ${meta.color}55` }}
            >
              Track your {meta.name} wallet →
            </Link>
            {/* Calendar CTA moved out of the hero — too many side-by-side
                buttons made the hero feel cluttered. It now sits as a
                full-width banner directly below the Upcoming queue, where
                visitors are already in calendar-discovery mode. */}
            <Link
              href="/protocols"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "transparent", color: "#475569" }}
            >
              All trackers
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live stat strip ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-20 max-w-5xl mx-auto">
        <div
          className="rounded-2xl px-4 py-5 md:px-8 md:py-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-2"
          style={{ background: "white", border: `1px solid ${meta.border}`, boxShadow: `0 2px 10px ${accentWash}` }}
        >
          <Stat
            label="Streams indexed"
            value={hasData ? effectiveTotal.toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Active now"
            value={hasData ? effectiveActive.toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Recipients"
            value={hasData ? (stats!.recipientCount ?? 0).toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Tokens tracked"
            value={hasData ? (stats!.tokensTracked ?? 0).toLocaleString() : "—"}
            color={meta.color}
          />
          <Stat
            label="Chains covered"
            value={meta.chainIds.length.toString()}
            color={meta.color}
          />
          <Stat
            label="Last indexed"
            value={stats?.lastIndexedAt ? relativeFreshness(stats.lastIndexedAt) : "—"}
            color={meta.color}
          />
        </div>
        {!hasData && (
          // Honest empty-state copy. Earlier wording said "first scan in
          // progress" which implied temporary emptiness. Untrue: the cache
          // is UPSERT-only and never gets wiped during reindex (verified
          // src/lib/vesting/dbcache.ts:127-137). If the stat strip is empty,
          // it means the seeder has not yet successfully populated this
          // protocol/chain combo — usually a one-time bootstrap issue
          // (RPC config, subgraph URL, GRAPH_API_KEY) rather than a
          // periodic indexing window. Tell users that honestly + tell
          // them their personal wallet results are unaffected.
          <p className="text-xs text-center mt-3" style={{ color: "#94A3B8" }}>
            We don&apos;t have indexed data for this protocol yet — our seed scanner
            is working through it. If you arrived from a wallet search, your
            specific results are unaffected — those come from a live on-chain
            read, not this cache.
          </p>
        )}
      </section>

      {/* ── Latest + upcoming unlock row ─────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: meta.color }}>
            Live activity
          </p>
          <h2 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            What&apos;s happening on {meta.name} right now
          </h2>
          <p className="text-sm max-w-xl mx-auto" style={{ color: "#8B8E92" }}>
            Pulled from TokenVest&apos;s index — updated every minute so you see what crawlers see.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <UnlockCard
            variant="latest"
            unlock={latest}
            accent={meta.color}
            bg={meta.bg}
            border={meta.border}
            protocolName={meta.name}
          />
          <UnlockCard
            variant="upcoming"
            unlock={upcoming}
            accent={meta.color}
            bg={meta.bg}
            border={meta.border}
            protocolName={meta.name}
          />
        </div>

        {/* ── Upcoming queue (top 6) ─────────────────────────────────────── */}
        {upcomingList.length > 1 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: meta.color }}>
                Upcoming queue
              </p>
              <p className="text-xs" style={{ color: "#B8BABD" }}>
                next {upcomingList.length} scheduled releases
              </p>
            </div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "white", border: `1px solid ${meta.border}` }}
            >
              <div className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                {upcomingList.map((u) => (
                  <UpcomingRow key={u.groupKey} u={u} accent={meta.color} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Calendar banner — same shape as the cross-protocol /protocols
            listing's banner so the calendar CTA reads consistently across
            surfaces. Sits HERE (below the Upcoming queue) intentionally:
            visitors who've scrolled past the hero into the queue are in
            "tell me more about timing" mode, exactly the moment a deeper
            calendar link converts. ────────────────────────────────────── */}
        <div className="mt-8">
          <Link
            href={`/protocols/${meta.slug}/unlocks`}
            className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-all hover:-translate-y-0.5"
            style={{
              background: "white",
              border:     `1px solid ${meta.border}`,
              boxShadow:  `0 1px 3px rgba(0,0,0,0.04), 0 4px 12px ${meta.color}10`,
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "#1A1D20" }}>
                  See the full {meta.name} unlock calendar
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#8B8E92" }}>
                  Every upcoming {meta.name} unlock — sorted, filterable by chain, deep-link to each token.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold whitespace-nowrap hidden sm:inline" style={{ color: meta.color }}>
              Open calendar →
            </span>
          </Link>
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            Why TokenVest
          </p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Purpose-built for {meta.name} recipients
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {meta.useCases.map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl p-5"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-sm font-bold"
                style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
              >
                ✓
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "#1A1D20" }}>{uc.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>
                {uc.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            From recipients
          </p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            What {meta.name} users say
          </h2>
        </div>

        {meta.testimonials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {meta.testimonials.map((t, i) => (
              <div
                key={`${meta.slug}-testimonial-${i}`}
                className="rounded-2xl p-6"
                style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill={meta.color} className="mb-4" aria-hidden="true">
                  <path d="M7.17 3C4.31 3 2 5.31 2 8.17v5.68C2 16.71 4.31 19 7.17 19h.34c.55 0 1 .45 1 1 0 .55-.45 1-1 1H5.5c-.55 0-1 .45-1 1s.45 1 1 1h4.17c1.38 0 2.5-1.12 2.5-2.5v-8.33C12.17 6.31 9.86 3 7 3h.17zm10 0c-2.86 0-5.17 2.31-5.17 5.17v5.68c0 2.86 2.31 5.15 5.17 5.15h.34c.55 0 1 .45 1 1 0 .55-.45 1-1 1H15.5c-.55 0-1 .45-1 1s.45 1 1 1h4.17c1.38 0 2.5-1.12 2.5-2.5v-8.33C22.17 6.31 19.86 3 17 3h.17z"/>
                </svg>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "#334155" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-xs" style={{ color: "#B8BABD" }}>
                  <span className="font-semibold" style={{ color: "#1A1D20" }}>{t.author}</span>
                  {t.role ? ` · ${t.role}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: "white", border: `1px dashed ${meta.border}` }}
          >
            <p className="text-sm mb-4" style={{ color: "#475569" }}>
              We&apos;re collecting testimonials from {meta.name} recipients using TokenVest for unlock alerts.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: meta.color }}
            >
              Share your story →
            </Link>
          </div>
        )}
      </section>

      {/* ── Related protocols ────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>
            More trackers
          </p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
            Other protocols we index
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {related.map((r) => (
            <Link
              key={r.slug}
              href={`/protocols/${r.slug}`}
              className="rounded-2xl p-5 transition-all hover:opacity-90"
              style={{ background: "white", border: `1px solid ${r.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-sm font-bold"
                style={{ background: r.bg, border: `1px solid ${r.border}`, color: r.color }}
              >
                {r.name.charAt(0)}
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#1A1D20" }}>{r.name}</h3>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "#8B8E92" }}>
                {r.tagline}
              </p>
              <span className="text-xs font-semibold" style={{ color: r.color }}>
                View tracker →
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/protocols"
            className="text-sm font-semibold"
            style={{ color: "#8B8E92" }}
          >
            Browse all {listProtocols().length} protocol trackers →
          </Link>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, white 0%, ${meta.bg} 100%)`, border: `1px solid ${meta.border}`, boxShadow: `0 8px 40px ${accentWash}` }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${accentHalo} 0%, transparent 70%)`,
          }} />
          <div className="relative">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest mb-4"
              style={{ background: "white", border: `1px solid ${meta.border}`, color: meta.color }}
            >
              📱 Mobile alerts for {meta.name}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
              Never miss another {meta.name} unlock
            </h2>
            <p className="text-sm md:text-base mb-8 max-w-xl mx-auto" style={{ color: "#475569" }}>
              Add your wallet to TokenVest and get a push notification the moment any {meta.name} tranche becomes claimable — across every chain you hold on. No checking dashboards. No missed deadlines.
            </p>
            <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap">
              <Link
                href="/early-access"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: meta.color, color: "white", boxShadow: `0 4px 20px ${meta.color}55` }}
              >
                Get the app →
              </Link>
              <Link
                href="/find-vestings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:bg-slate-50"
                style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#1A1D20" }}
              >
                Scan a wallet now →
              </Link>
            </div>
            <p className="text-xs mt-6 max-w-lg mx-auto" style={{ color: "#B8BABD" }}>
              Claims still happen on the audited {meta.name} contract — TokenVest never touches your tokens. We&apos;re the alert layer above it.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

// ─── Small sub-components ────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center md:text-left">
      <div className="font-bold text-xl md:text-2xl tracking-tight" style={{ letterSpacing: "-0.02em", color }}>
        {value}
      </div>
      <div className="text-[11px] md:text-xs mt-0.5" style={{ color: "#B8BABD" }}>
        {label}
      </div>
    </div>
  );
}

function UpcomingRow({ u, accent }: { u: UnlockGroupSummary; accent: string }) {
  const amount = formatAmountCompact(u.amount, u.tokenSymbol, u.tokenDecimals);
  const ttl    = u.endTime ? relativeTimeUntil(u.endTime) : "—";
  // Only link when we know a chain+address — otherwise fall back to a plain row.
  const canLink = !!u.tokenAddress && /^0x[0-9a-f]{40}$/i.test(u.tokenAddress);
  // Group rollup line — same shape as the cross-protocol widget on /protocols.
  // Single-stream groups (walletCount=1) keep the legacy "for 0xabcd…" line;
  // multi-wallet groups switch to "N wallets unlock together" so a Hedgey
  // mass distribution doesn't crowd out genuinely distinct events.
  const isGroup = u.walletCount > 1;
  // Row layout pinned to a consistent two-line shape (amount + chain on top,
  // recipient/group caption below). Previously the top line could wrap on
  // mobile because of `flex-wrap` + the optional "view token" hint, which
  // gave each row a different height — fine on desktop, looked ragged on a
  // 375px phone. `flex-nowrap` + `min-w-0 truncate` on the amount keeps the
  // top line at exactly one line; "view token" → a chevron arrow on mobile
  // (saves ~70px of horizontal space) and full text only on sm+.
  const inner = (
    <div className="px-4 md:px-5 py-3 flex items-center gap-3 min-h-[60px] transition-colors hover:bg-slate-50/60">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate min-w-0" style={{ color: "#1A1D20" }}>
            {amount}
          </span>
          {u.usdValue != null && (
            <span className="text-[11px] font-semibold flex-shrink-0 tabular-nums" style={{ color: "#0F8A4A" }}>
              {formatUsdCompact(u.usdValue)}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex-shrink-0"
            style={{ background: "rgba(0,0,0,0.04)", color: "#8B8E92" }}
          >
            {chainLabel(u.chainId)}
          </span>
          {canLink && (
            <span
              className="text-[10px] font-semibold flex-shrink-0 hidden sm:inline"
              style={{ color: accent, opacity: 0.7 }}
              aria-hidden="true"
            >
              view token →
            </span>
          )}
        </div>
        <div className="text-[10.5px] font-mono truncate mt-0.5" style={{ color: "#B8BABD" }}>
          {isGroup
            ? <>
                <span className="font-sans font-semibold" style={{ color: "#475569" }}>
                  {u.walletCount}
                </span>
                {" "}wallets unlock together
              </>
            : <>for {truncateAddress(u.recipient)}</>
          }
        </div>
      </div>
      <div
        className="flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap"
        style={{ background: `${accent}15`, color: accent }}
      >
        {ttl}
      </div>
    </div>
  );
  return canLink ? (
    <Link href={`/token/${u.chainId}/${u.tokenAddress}`} className="block">
      {inner}
    </Link>
  ) : inner;
}

function UnlockCard({
  variant,
  unlock,
  accent,
  bg,
  border,
  protocolName,
}: {
  variant: "latest" | "upcoming";
  unlock: UnlockSummary | null;
  accent: string;
  bg: string;
  border: string;
  protocolName: string;
}) {
  const title = variant === "latest" ? "Most recent unlock" : "Next scheduled unlock";
  const emptyTitle = variant === "latest"
    ? `No recent ${protocolName} unlocks indexed yet`
    : `No upcoming ${protocolName} unlocks indexed yet`;
  const emptyBody = variant === "latest"
    ? `As soon as a tracked wallet has its first ${protocolName} stream complete, it'll appear here — live, on every visit.`
    : `Add your ${protocolName} wallet and we'll start tracking upcoming releases here.`;

  if (!unlock) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{ background: "white", border: `1px dashed ${border}` }}
      >
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: accent }}>
          {title}
        </p>
        <h3 className="text-base font-semibold mb-2" style={{ color: "#1A1D20" }}>{emptyTitle}</h3>
        <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>
          {emptyBody}
        </p>
      </div>
    );
  }

  const relative = variant === "latest"
    ? (unlock.endTime ? relativeTimeSince(new Date(unlock.endTime * 1000)) : "—")
    : relativeTimeUntil(unlock.endTime);

  // UnlockSummary now carries tokenDecimals — pulled from the cached JSONB
  // blob. Previously this was hardcoded to 18, which rendered USDC/USDT
  // (6-decimal stablecoins) as "0.0000 USDC" on the Upcoming Unlocks panel.
  const amountDisplay = formatAmountCompact(unlock.amount, unlock.tokenSymbol, unlock.tokenDecimals);

  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{ background: "white", border: `1px solid ${border}`, boxShadow: `0 2px 12px ${bg.replace("0.08", "0.15")}` }}
    >
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${bg.replace("0.08", "0.22")} 0%, transparent 65%)` }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: accent }}>
            {title}
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
            style={{ background: bg, color: accent, border: `1px solid ${border}` }}>
            {chainLabel(unlock.chainId)}
          </span>
        </div>
        <p className="text-2xl font-bold mb-1" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>
          {amountDisplay}
          {unlock.usdValue != null && (
            <span className="ml-2 text-base font-semibold" style={{ color: "#0F8A4A" }}>
              {formatUsdCompact(unlock.usdValue)}
            </span>
          )}
        </p>
        <p className="text-xs mb-4" style={{ color: "#8B8E92" }}>
          for <code style={{ fontFamily: "monospace", color: "#334155" }}>{truncateAddress(unlock.recipient)}</code> · {relative}
        </p>
        {/* View token CTA — these unlock cards are featured prominently but
            had no way to drill into the per-token page. Adding a link makes
            them as actionable as every other token row across the site. */}
        {unlock.tokenAddress && (
          <Link
            href={`/token/${unlock.chainId}/${unlock.tokenAddress.toLowerCase()}`}
            className="inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:underline"
            style={{ color: accent }}
          >
            View token →
          </Link>
        )}
      </div>
    </div>
  );
}
