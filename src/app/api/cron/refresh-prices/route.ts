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
  writePriceCache,
  REFRESH_AFTER_SEC,
} from "@/lib/vesting/token-price-cache";
import { priceAggregates } from "@/lib/vesting/tvl";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;  // Hourly cron — bounded; no need for the full 300s.

/**
 * How many tokens to refresh per run. Sized so 24 runs (one day) refreshes
 * ~12k tokens — enough to cycle through the entire cache every 2-3 days
 * even if some entries fail. Conservative enough to fit comfortably under
 * DexScreener / CoinGecko free-tier rate windows.
 *
 * Tuning notes: if we observe cache rows aging past 24h regularly, bump
 * this up. If we observe 429s during the hourly run, bump it down.
 */
const REFRESH_BATCH_SIZE = 500;

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // 1. Pick the N stalest tokens currently in the cache.
  //    Brand-new tokens not yet in the cache get picked up by the TVL
  //    snapshot cron's walker output — by design (see header comment).
  const candidates = await pickStalestCachedTokens(REFRESH_BATCH_SIZE);

  if (candidates.length === 0) {
    return NextResponse.json({
      ok:           true,
      message:      "Cache is empty — nothing to refresh. The next TVL snapshot run will seed it.",
      refreshedCount: 0,
      elapsedMs:    Date.now() - startedAt,
    });
  }

  // Apply the staleness threshold: ONLY refresh entries older than
  // REFRESH_AFTER_SEC. If the top-N stalest are all fresh, this cron is
  // effectively a no-op — fine, no API calls wasted.
  const staleEnough = candidates.filter((c) => c.ageSec >= REFRESH_AFTER_SEC);

  if (staleEnough.length === 0) {
    return NextResponse.json({
      ok:           true,
      message:      `All ${candidates.length} candidates are still fresh (< ${REFRESH_AFTER_SEC}s old). Nothing to refresh this run.`,
      refreshedCount: 0,
      candidateCount: candidates.length,
      elapsedMs:    Date.now() - startedAt,
    });
  }

  // 2. Build a priceAggregates-compatible input shape.
  //
  //    priceAggregates expects walker-style aggregates with tokenSymbol +
  //    tokenDecimals + lockedAmount. For pure price-refresh we don't have
  //    a meaningful "locked amount" — pass "1" (one unit) with decimals=0,
  //    so the function just resolves prices without trying to compute USD
  //    locked value. The PricedAggregate.usd field will be garbage in this
  //    call but we don't use it — only the side effect of writePriceCache.
  const inputs = staleEnough.map((c) => ({
    chainId:       c.chainId,
    tokenAddress:  c.tokenAddress,
    tokenSymbol:   null,
    tokenDecimals: 0,       // see comment above — keeps wholeTokens=1
    lockedAmount:  "1",
  }));

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
    message:        `Refreshed ${priced.length}/${staleEnough.length} stale prices`,
    refreshedCount: priced.length,
    skippedCount:   tokensSkipped,
    staleCount:     staleEnough.length,
    candidateCount: candidates.length,
    oldestAgeSec:   staleEnough[staleEnough.length - 1]?.ageSec,
    elapsedMs:      Date.now() - startedAt,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
