// src/app/api/mobile/discover/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mobile Discover-tab endpoint. Returns:
//
//   - hero: the largest USD-valued unlock landing in the next 24h
//   - list: up to 30 upcoming unlock groups in the next 365d (the mobile
//           screen filters client-side into 24h / 7d / 30d windows)
//   - stats: portfolio-wide fun facts (largest week, most-active protocol,
//            indexed-today count, total tokens being tracked)
//
// Pulls from vesting_streams_cache (already populated by the daily seed
// cron + the new event-driven indexers). Reuses
// getUpcomingUnlockGroupsAcross from protocol-stats.ts so the grouping
// logic (hour-bucket dedupe for mass distributions) is identical to what
// the web /protocols page surfaces.
//
// Auth: mobile bearer token. Pro tier doesn't gate this — Discover is
// the public-feeling part of the app that helps Free users see WHY Pro
// would be useful. ("Push alerts for any of these? → Upgrade.")
//
// Caching: 5-minute revalidate via next.revalidate on the response. The
// underlying queries are cheap (indexed) so we don't bother with Redis
// unless we see real load.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { desc, eq, gt, sql } from "drizzle-orm";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { vestingStreamsCache, protocolSummaries } from "@/lib/db/schema";
import {
  getUpcomingUnlockGroupsAcross,
  chainLabel,
  type UnlockGroupSummary,
} from "@/lib/vesting/protocol-stats";
import { getQuickUsdPrices } from "@/lib/vesting/quick-prices";

export const dynamic = "force-dynamic";

interface DiscoverEvent {
  groupKey:      string;
  streamId:      string;
  protocol:      string;
  chainId:       number;
  chainLabel:    string;
  tokenSymbol:   string;
  tokenAddress: string;
  /** Stringified bigint — raw amount in token base units. */
  rawAmount:    string | null;
  tokenDecimals: number;
  /** Whole-token float for display ("12.34M"). Computed server-side
   *  so the mobile client doesn't need BigInt math. */
  tokensWhole:  number | null;
  unlockTime:   number;            // unix seconds
  usdValue:     number | null;     // USD at scan time
  walletCount:  number;            // distinct recipient wallets in the group
  streamCount:  number;
}

interface DiscoverStats {
  /** Number of streams whose firstSeenAt is within the last 24h. */
  newStreamsLast24h: number;
  /** Total active (not fully vested) streams across all protocols. */
  totalActiveStreams: number;
  /** Distinct tokens being tracked across all protocols. */
  distinctTokens: number;
  /** Most-active protocol by active-stream count + its count. */
  mostActiveProtocol: { protocol: string; count: number } | null;
  /** Biggest single upcoming-unlock USD value in the next 7 days. Null
   *  when no priced unlock lands inside the window. */
  biggestThisWeekUsd: number | null;
  biggestThisWeekToken: string | null;
}

export interface DiscoverResponse {
  /** The hero — biggest USD unlock in the next 24h (null when nothing
   *  is priced + scheduled within the window). */
  hero: DiscoverEvent | null;
  /** Top 30 upcoming unlocks in next 365 days. The screen filters
   *  client-side into 24h / 7d / 30d. */
  events: DiscoverEvent[];
  stats: DiscoverStats;
}

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Cross-protocol upcoming-unlock groups. 30 is enough for 24h/7d/30d
    //    filter chips on the client; one big enough query is cheaper than
    //    three filtered ones.
    const groups = await getUpcomingUnlockGroupsAcross(30);

    // 2. Price every distinct (chainId, tokenAddress) so we can build the
    //    hero (biggest 24h USD) + display USD on every priced row.
    const tokensToPrice: Array<{ chainId: number; address: string }> = [];
    for (const g of groups) {
      if (g.tokenAddress) tokensToPrice.push({ chainId: g.chainId, address: g.tokenAddress });
    }
    const priceMap = await raceWithTimeout(getQuickUsdPrices(tokensToPrice), 5_000, new Map());

    // 3. Materialise events.
    const events: DiscoverEvent[] = groups
      .filter((g): g is UnlockGroupSummary & { endTime: number; tokenSymbol: string } =>
        g.endTime !== null && !!g.tokenSymbol,
      )
      .map((g) => {
        const tokensWhole =
          g.amount && g.tokenDecimals != null
            ? Number(safeBigInt(g.amount)) / Math.pow(10, g.tokenDecimals)
            : null;
        const priceEntry = priceMap.get(`${g.chainId}:${(g.tokenAddress ?? "").toLowerCase()}`);
        const usdValue   =
          tokensWhole != null && priceEntry?.usd != null
            ? tokensWhole * priceEntry.usd
            : null;
        return {
          groupKey:     g.groupKey,
          streamId:     g.streamId,
          protocol:     g.protocol,
          chainId:      g.chainId,
          chainLabel:   chainLabel(g.chainId),
          tokenSymbol:  g.tokenSymbol,
          tokenAddress: g.tokenAddress,
          rawAmount:    g.amount,
          tokenDecimals: g.tokenDecimals,
          tokensWhole,
          unlockTime:   g.endTime,
          usdValue,
          walletCount:  g.walletCount,
          streamCount:  g.streamCount,
        };
      });

    // 4. Hero = biggest USD in next 24h. Falls back to soonest priced
    //    in next 24h, then to soonest unpriced if nothing's priced.
    const now24h = Math.floor(Date.now() / 1000) + 86_400;
    const within24h = events.filter((e) => e.unlockTime <= now24h);
    const heroPriced = within24h
      .filter((e) => e.usdValue != null)
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))[0];
    const hero = heroPriced ?? within24h[0] ?? null;

    // 5. Stats — fast aggregate queries against the cache.
    const stats = await loadDiscoverStats(events);

    return NextResponse.json({ hero, events, stats } satisfies DiscoverResponse, {
      headers: {
        // 5-minute browser/CDN cache — Discover doesn't need to be real-time;
        // the hero countdown still ticks live on the client.
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[api/mobile/discover] error:", err);
    return NextResponse.json({ error: "Discover unavailable" }, { status: 500 });
  }
}

// 2026-05-14 hotfix: cross-protocol aggregate stats are wrapped in
// unstable_cache(5min). The original implementation did three separate
// COUNT/GROUP BY queries against the 130K-row vesting_streams_cache on
// EVERY request — `count(distinct token_address)` alone scan-scanned
// the full table and pushed the mobile request past its 45s timeout.
// The cache key has no parameters because these stats are global;
// every user gets the same numbers.
//
// We also dropped the `distinctTokens` query entirely and derive it
// from the protocol_summaries rollup table (≤10 rows). The remaining
// scalar counts are cheap enough that one slow lambda per 5min is
// acceptable.
const loadCachedDiscoverStats = unstable_cache(
  async (): Promise<{
    newStreamsLast24h:  number;
    totalActiveStreams: number;
    distinctTokens:     number;
    mostActiveProtocol: { protocol: string; count: number } | null;
  }> => {
    const settled = await Promise.allSettled([
      // Newly indexed in last 24h — firstSeenAt only counts true creation,
      // matching the same convention used by getProtocolFunStats.
      // (vesting_streams_cache.first_seen_at has no dedicated index, but
      // this is a one-pass scan that completes in ~500ms even at 130K
      // rows; acceptable now that it's cache-amortised.)
      db
        .select({ count: sql<number>`count(*)::int`.as("count") })
        .from(vestingStreamsCache)
        .where(gt(vestingStreamsCache.firstSeenAt, sql`now() - interval '24 hours'`)),

      // Protocol summaries — pre-aggregated rollup table (≤10 rows).
      // SUM activeStreams + tokensTracked across rows. UNCX-VM rolls into
      // UNCX so total counts are approximate (small overlap) but the
      // numbers shown on Discover are decorative, not financial.
      db
        .select({
          protocol:      protocolSummaries.protocol,
          activeStreams: protocolSummaries.activeStreams,
          tokensTracked: protocolSummaries.tokensTracked,
        })
        .from(protocolSummaries),
    ]);

    const newStreamsLast24h =
      settled[0].status === "fulfilled" && settled[0].value.length > 0
        ? Number(settled[0].value[0].count ?? 0)
        : 0;

    let totalActiveStreams = 0;
    let distinctTokens = 0;
    let mostActiveProtocol: { protocol: string; count: number } | null = null;
    if (settled[1].status === "fulfilled") {
      for (const r of settled[1].value) {
        totalActiveStreams += Number(r.activeStreams ?? 0);
        distinctTokens     += Number(r.tokensTracked ?? 0);
        if (
          !mostActiveProtocol ||
          Number(r.activeStreams ?? 0) > mostActiveProtocol.count
        ) {
          mostActiveProtocol = {
            protocol: r.protocol,
            count:    Number(r.activeStreams ?? 0),
          };
        }
      }
    }

    return { newStreamsLast24h, totalActiveStreams, distinctTokens, mostActiveProtocol };
  },
  ["discover-stats-v1"],
  { revalidate: 300, tags: ["discover-page"] },
);

async function loadDiscoverStats(events: DiscoverEvent[]): Promise<DiscoverStats> {
  const { newStreamsLast24h, totalActiveStreams, distinctTokens, mostActiveProtocol } =
    await loadCachedDiscoverStats();

  // Biggest USD in next 7 days derived from the events list we already
  // priced — saves an additional pricing roundtrip.
  const week = Math.floor(Date.now() / 1000) + 7 * 86_400;
  const biggestThisWeek = events
    .filter((e) => e.unlockTime <= week && e.usdValue != null)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))[0];

  return {
    newStreamsLast24h,
    totalActiveStreams,
    distinctTokens,
    mostActiveProtocol,
    biggestThisWeekUsd:   biggestThisWeek?.usdValue ?? null,
    biggestThisWeekToken: biggestThisWeek?.tokenSymbol ?? null,
  };
}

// Promise.race timeout that returns a fallback rather than throwing.
// Prevents a stalled DexScreener call from cascading into a 504 — the
// page can render without prices, the hero just falls back to "soonest".
function raceWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function safeBigInt(s: string): bigint {
  try { return BigInt(s); } catch { return 0n; }
}
