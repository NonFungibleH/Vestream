// src/app/api/cron/refresh-prices/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hourly cron — refreshes the N stalest entries in token_prices_cache so the
// working set stays warm across the day, instead of cramming every external
// API call into one nightly 5-minute window.
//
// Why this exists: with ~30k tokens cached, hammering DexScreener + CoinGecko
// for all of them at 03:15 UTC reliably 429s both free-tier APIs. Spreading
// the work hourly means each run does ~500 tokens (small enough to fit
// inside free-tier rate windows) and the entire cache rotates through every
// 24-60 hours. Combined with the read-through cache in priceAggregates(),
// every consumer of pricing data sees ~hourly freshness without paying for
// upgraded API tiers.
//
// What this DOESN'T do: it doesn't recompute protocol_tvl_snapshots rows —
// that's still the daily TVL snapshot cron's job. This route only keeps the
// raw token-price cache fresh. When the snapshot cron runs (now every 6h
// instead of daily, see vercel.json), it reads from the warm cache instead
// of the cold APIs.
//
// Auth: same Bearer-token pattern as the other crons.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import {
  pickStalestCachedTokens,
  pickUncachedActiveVestingTokens,
  writePriceCache,
  REFRESH_AFTER_SEC,
} from "@/lib/vesting/token-price-cache";
import { priceAggregates } from "@/lib/vesting/tvl";

export const dynamic     = "force-dynamic";
export const maxDuration = 300; // Needs headroom — 1000 tokens × live API calls can exceed 60s.

/**
 * How many tokens to refresh per run. Sized so 24 runs (one day) refreshes
 * ~24k tokens — enough to cycle through the entire cache within 24h even
 * for large installations (PinkSale BSC alone has 14k+ tokens). Conservative
 * enough to stay under DexScreener / CoinGecko free-tier rate windows.
 *
 * 2026-05-28: bumped from 500 → 1000. With 500, PinkSale/Streamflow/LlamaPay
 * tokens were aging 2+ days because the rotation never reached them before
 * the cache refilled from the next TVL snapshot run. At 1000/hr the full
 * cache cycles in ~24h regardless of total size.
 *
 * Tuning notes: if we observe 429s during the hourly run, drop back to 750.
 * If rows still age past 24h regularly, bump to 1500.
 */
const REFRESH_BATCH_SIZE = 1000;

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Optional: ?minAgeDays=X — only refresh tokens older than X days.
  // Useful for targeted catch-up runs ("refresh everything older than 3d")
  // without changing the batch size. Default is no extra floor (the
  // REFRESH_AFTER_SEC gate below still applies as a minimum).
  const minAgeDaysParam = req.nextUrl.searchParams.get("minAgeDays");
  const minAgeSec = minAgeDaysParam
    ? Math.max(REFRESH_AFTER_SEC, Number(minAgeDaysParam) * 86_400)
    : REFRESH_AFTER_SEC;

  // Optional: ?limit=N — override the batch size for this run (capped at 2000).
  const limitParam = req.nextUrl.searchParams.get("limit");
  const batchSize = limitParam
    ? Math.min(2000, Math.max(1, Number(limitParam)))
    : REFRESH_BATCH_SIZE;

  // 1a. Pick the N stalest tokens currently in the cache (freshen what we know).
  const candidates  = await pickStalestCachedTokens(batchSize);
  const staleEnough = candidates.filter((c) => c.ageSec >= minAgeSec);

  // 1b. ALSO seed active-vesting tokens that aren't in the cache yet, soonest-
  //     unlocking first. pickStalestCachedTokens only refreshes existing rows,
  //     so without this new active-vesting tokens are never priced ahead of
  //     time and the explorer live-prices them on render (the 524 fan-out).
  //     Capped so the extra API load stays inside free-tier rate windows.
  // Soonest-unlocking uncached active tokens, seeded each run so the explorer
  // stops showing "—" for USD/risk. Bumped 300→1000 (2026-06-17) to backfill
  // the ~7k-token gap in hours not days; the cron can also be hit manually
  // (?limit=) to accelerate. priceAggregates batches + degrades gracefully.
  const UNCACHED_SEED = 1000;
  const uncached = await pickUncachedActiveVestingTokens(UNCACHED_SEED);

  if (staleEnough.length === 0 && uncached.length === 0) {
    return NextResponse.json({
      ok:             true,
      message:        candidates.length === 0
        ? "Cache is empty and no uncached active-vesting tokens found."
        : `All ${candidates.length} cached candidates fresh (< ${REFRESH_AFTER_SEC}s) and no uncached active tokens. Nothing to do.`,
      refreshedCount: 0,
      candidateCount: candidates.length,
      elapsedMs:      Date.now() - startedAt,
    });
  }

  // 2. Build a priceAggregates-compatible input shape (stale refresh + uncached
  //    seed, de-duplicated by chain:token).
  //
  //    priceAggregates expects walker-style aggregates with tokenSymbol +
  //    tokenDecimals + lockedAmount. For pure price-refresh we don't have
  //    a meaningful "locked amount" — pass "1" (one unit) with decimals=0,
  //    so the function just resolves prices without trying to compute USD
  //    locked value. The PricedAggregate.usd field will be garbage in this
  //    call but we don't use it — only the side effect of writePriceCache.
  const inputMap = new Map<string, { chainId: number; tokenAddress: string; tokenSymbol: null; tokenDecimals: number; lockedAmount: string }>();
  for (const c of [...staleEnough, ...uncached]) {
    inputMap.set(`${c.chainId}:${c.tokenAddress.toLowerCase()}`, {
      chainId:       c.chainId,
      tokenAddress:  c.tokenAddress,
      tokenSymbol:   null,
      tokenDecimals: 0,       // see comment above — keeps wholeTokens=1
      lockedAmount:  "1",
    });
  }
  const inputs = [...inputMap.values()];

  // 3. Force a cache bypass so we actually call the external APIs. The
  //    whole point of this run is to refresh stale entries — using the
  //    cache for them would be a no-op.
  const { priced, tokensSkipped } = await priceAggregates(inputs, { skipCache: true });

  // priceAggregates() already wrote refreshed entries back to the cache
  // via writePriceCache (side effect inside the function). The returned
  // `priced` array is the new prices for confirmation/diagnostics.
  // No further writes needed here — but assert behaviour with the count.

  return NextResponse.json({
    ok:             true,
    message:        `Priced ${priced.length}/${inputs.length} (${staleEnough.length} stale refresh + ${uncached.length} uncached active-vesting seed)`,
    refreshedCount: priced.length,
    skippedCount:   tokensSkipped,
    staleCount:     staleEnough.length,
    uncachedSeeded: uncached.length,
    candidateCount: candidates.length,
    oldestAgeSec:   staleEnough[staleEnough.length - 1]?.ageSec,
    elapsedMs:      Date.now() - startedAt,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
