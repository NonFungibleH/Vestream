// src/lib/vesting/quick-prices.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight per-token USD pricing for UI surfaces that show <50 unlocks.
//
// Distinct from the cron-driven snapshot pipeline in `tvl.ts` (which prices
// thousands of tokens for the daily TVL refresh). This helper takes a small
// list of (chainId, address) pairs and returns USD prices via DexScreener's
// batch endpoint, with edge-cache friendly fetch options so repeat hits in
// the same minute don't actually round-trip.
//
// Used to attach `usdValue` to:
//   - Protocol detail page Latest / Next / Upcoming queue cards
//   - The cross-protocol /api/unlocks/upcoming response (homepage widget)
//
// Confidence bands: high ≥ $10k DEX liquidity, medium ≥ $1k, low below $1k.
// Unlike the TVL snapshot pipeline (tvl.ts), this helper does NOT drop thin
// tokens — for a single unlock row we show the market price even on low
// liquidity (it's still the token's price; manipulation only distorts when
// you MULTIPLY a thin price by a large locked supply, which is the TVL
// aggregate's problem, not a per-token display's). The TVL pipeline keeps
// its own thin-band exclusion + per-token ceiling, so the headline TVL is
// unaffected by this. Consumers may dim `confidence: "low"` rows.
// ─────────────────────────────────────────────────────────────────────────────

import { Redis } from "@upstash/redis";
import { fetchWithRetry } from "../fetch-with-retry";

// ── Cross-lambda price cache ───────────────────────────────────────────────
//
// Next.js's fetch cache is per-deployment, per-region, and Vercel resets it
// frequently — it can't be relied on to keep cold lambdas from re-querying
// DexScreener. For surfaces that need consistent sub-second renders for
// every visitor (not just visitors who land in an SWR window), we layer
// Upstash Redis underneath: lambdas check Redis first (~10ms), only hit
// DexScreener on miss, write back so the next cold lambda benefits.
//
// TTL: 5 minutes. Aggressive enough to keep prices reasonably fresh on a
// volatile market, conservative enough that DexScreener rate limits aren't
// a concern for our ~10-token-per-page workload.
//
// Negative caching: when DexScreener has no liquid pair for a token, we
// store an explicit `null` marker for 60 seconds. Without this, every
// pageload would re-fetch the same dead token over and over and pay the
// full latency every time.
const REDIS_TTL_SECONDS = 300;
const REDIS_NULL_TTL_SECONDS = 60;
const REDIS_KEY_PREFIX = "vestream:px:v1";

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return Redis.fromEnv();
}

const redisKey = (chainId: number, address: string) =>
  `${REDIS_KEY_PREFIX}:${chainId}:${address.toLowerCase()}`;

// Mirror of the chain-slug map in tvl.ts. Kept local so callers don't need
// the (heavier) tvl.ts import path.
const DS_CHAIN_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  137:  "polygon",
  8453: "base",
  // Solana — DexScreener uses the chain slug "solana"; chainId 101 is our
  // synthetic ID for the SVM ecosystem.
  101:  "solana",
};

const LIQUIDITY_HIGH      = 10_000;
const LIQUIDITY_MEDIUM    = 1_000;

const DS_BATCH_SIZE = 30;

interface DexPair {
  chainId:    string;
  baseToken:  { address: string; symbol: string };
  priceUsd?:  string;
  volume?:    { h24?: number };
  liquidity?: { usd?: number };
}

export interface QuickPrice {
  priceUsd:    number;
  /** "high" ≥ $10k DEX liquidity, "medium" ≥ $1k, "low" below $1k. Low-
   *  confidence prices ARE returned (the per-token market price is useful
   *  even on thin liquidity); the consumer may dim them. Thin tokens are
   *  excluded from the TVL aggregate separately in tvl.ts. */
  confidence:  "high" | "medium" | "low";
  /** 24-hour USD volume from DexScreener (`pair.volume.h24`). Used by the
   *  explorer's risk column to compute the absorption ratio
   *  (unlockValueUsd / volume24hUsd) — "can the market absorb this?".
   *  Null when DexScreener didn't return a volume figure for the pair we
   *  selected; the consumer treats null as "can't compute". */
  volume24hUsd?: number | null;
}

/**
 * Map key shape: `${chainId}:${addressLower}` — same convention as tvl.ts so
 * caller's lookup loop stays consistent across surfaces.
 */
export type QuickPriceMap = Map<string, QuickPrice>;

const priceKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

/**
 * Quick-batch price for ≤ 30 (chainId, address) pairs. Pairs on chains we
 * don't have a DexScreener slug for are silently skipped. Tokens with NO
 * DexScreener pair at all are absent from the returned map (the caller
 * treats absence as "unknown price"); thin-liquidity tokens ARE priced
 * and returned with `confidence: "low"`.
 *
 * Caching strategy (top-down):
 *   1. In-process: callers within the same lambda invocation share results
 *      naturally (we return a Map; callers call once).
 *   2. Upstash Redis (5-minute TTL): cross-lambda shared cache so cold
 *      lambdas don't re-fetch DexScreener for tokens another lambda
 *      already priced.
 *   3. Next.js fetch cache: 60-second per-batch revalidation for the
 *      DexScreener API call itself.
 *
 * The Redis layer is the load-bearing one for "every user gets a fast
 * page" — without it, every cold lambda hits DexScreener live (1-5s).
 * With it, only the first lambda after each 5-minute window pays the
 * upstream cost; everyone else gets ~10ms Redis reads.
 *
 * `opts.redis: false` — REQUIRED for callers on ISR page render paths.
 * The Upstash SDK hardcodes `fetch(…, { cache: "no-store" })` on every
 * command (verified: @upstash/redis nodejs.js → `cache: config.cache ??
 * "no-store"`), and Next 16.3.0-canary.19 hard-errors when a no-store
 * fetch executes inside a route that exports `revalidate`. ISR pages are
 * already cached at the route level (plus usually unstable_cache around
 * the caller), so they don't need the cross-lambda Redis layer — only
 * the DexScreener fetch, which uses `next: { revalidate: 60 }` and is
 * ISR-safe. Route handlers (/api/*) keep the default redis: true.
 */
export async function getQuickUsdPrices(
  pairs: ReadonlyArray<{ chainId: number; address: string }>,
  opts?: { redis?: boolean },
): Promise<QuickPriceMap> {
  const useRedis = opts?.redis !== false;
  const out: QuickPriceMap = new Map();
  if (pairs.length === 0) return out;

  // De-dup by (chainId, lower address). The DexScreener endpoint takes a
  // comma-separated address list and returns matched pairs across ALL
  // chains, so chain-grouping is purely a slot-management concern.
  const seen = new Set<string>();
  const uniquePairs: Array<{ chainId: number; address: string }> = [];
  for (const p of pairs) {
    if (!DS_CHAIN_SLUG[p.chainId]) continue;
    const k = priceKey(p.chainId, p.address);
    if (seen.has(k)) continue;
    seen.add(k);
    uniquePairs.push({ chainId: p.chainId, address: p.address.toLowerCase() });
  }
  if (uniquePairs.length === 0) return out;

  // ── Redis cache check ─────────────────────────────────────────────────────
  // Try to satisfy as many pairs as possible from Redis before going to
  // DexScreener. mget batches the lookups into a single round-trip.
  const redis = useRedis ? getRedis() : null;
  const stillNeeded: Array<{ chainId: number; address: string }> = [];
  if (redis) {
    try {
      const keys = uniquePairs.map((p) => redisKey(p.chainId, p.address));
      // Upstash returns parsed JSON values directly. `null` means cache miss
      // OR an explicit "no liquid pair" negative-cache entry — we
      // disambiguate via a sentinel `{ priceUsd: 0 }` for negatives.
      const cached = await redis.mget<Array<QuickPrice | { _miss: true } | null>>(...keys);
      for (let i = 0; i < uniquePairs.length; i++) {
        const entry = cached[i];
        if (entry == null) {
          stillNeeded.push(uniquePairs[i]);
        } else if ("_miss" in entry && entry._miss === true) {
          // Negative cache hit — token has no liquid pair, skip both Redis
          // re-fetch AND DexScreener re-fetch for this TTL window.
          continue;
        } else if ("priceUsd" in entry && typeof entry.priceUsd === "number") {
          out.set(priceKey(uniquePairs[i].chainId, uniquePairs[i].address), entry as QuickPrice);
        } else {
          // Malformed cache entry — refetch.
          stillNeeded.push(uniquePairs[i]);
        }
      }
    } catch (err) {
      console.warn("[quick-prices] redis mget failed; falling through to DexScreener:", err);
      // Fall through with full uniquePairs list.
      stillNeeded.push(...uniquePairs);
    }
  } else {
    // No Redis configured — every pair needs a DexScreener hit.
    stillNeeded.push(...uniquePairs);
  }

  if (stillNeeded.length === 0) {
    return out;
  }

  // Bound the live work. Each DexScreener miss costs a network round-trip;
  // an uncapped, SERIAL loop over hundreds of cache-miss tokens (the explorer
  // can present 800+) stacked batches to minutes — past Cloudflare's 100s
  // origin limit (Error 524). Two guards:
  //   1. CAP the number of tokens priced live per call. `stillNeeded` is in
  //      caller order (soonest-unlocking first for the explorer), so the cap
  //      keeps the most-relevant tokens; the rest render "—" and get warmed
  //      by the hourly token_prices_cache cron. NOT silently dropped — logged.
  //   2. Run the (now ≤ LIVE_PRICE_CAP/30) batches in PARALLEL with an
  //      explicit per-request timeout, so worst-case latency ≈ one batch
  //      (~4s) instead of sum-of-batches.
  const LIVE_PRICE_CAP = 120; // 4 batches of 30
  const toQuery = stillNeeded.slice(0, LIVE_PRICE_CAP);
  const dropped = stillNeeded.length - toQuery.length;
  if (dropped > 0) {
    console.warn(`[quick-prices] live-pricing capped at ${LIVE_PRICE_CAP}: priced ${toQuery.length}, left ${dropped} unpriced this render (cron warms the rest)`);
  }

  const addresses = toQuery.map((p) => p.address);
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += DS_BATCH_SIZE) {
    batches.push(addresses.slice(i, i + DS_BATCH_SIZE));
  }

  // Group by chain we want to keep — DexScreener returns pairs from any
  // chain that mentions one of these addresses (cross-chain bridged
  // tokens). We pin pairs back to the requested chain via the response's
  // chain slug so a USDC-on-Ethereum hit doesn't get mis-applied to a
  // USDC-on-Base unlock card.
  const wantedSlugs = new Set(toQuery.map((p) => DS_CHAIN_SLUG[p.chainId]));

  // Track which pairs we successfully priced from DexScreener so we can
  // negative-cache the rest at the end.
  const dexResolved = new Set<string>();

  // Fetch all batches concurrently (≤ 4 after the cap). 4s timeout each so a
  // single slow DexScreener response can't stall the whole render.
  const batchResults = await Promise.all(batches.map(async (batch): Promise<{ pairs?: DexPair[] } | null> => {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`;
      const res = await fetchWithRetry(url, {
        next:    { revalidate: 60 },
        headers: { Accept: "application/json" },
      }, { tag: "dexscreener-quick", retries: 1, timeoutMs: 4000 });
      if (!res || !res.ok) return null;
      return (await res.json()) as { pairs?: DexPair[] };
    } catch (err) {
      console.warn("[quick-prices] batch failed:", err);
      return null;
    }
  }));

  for (const data of batchResults) {
    if (!data) continue;
    // Pick the highest-volume pair per (chain-slug, address) — mirrors
    // DexScreener's primary-pair ranking. No liquidity floor (display path).
    const best = new Map<string, DexPair>();
    for (const pair of data.pairs ?? []) {
      if (!wantedSlugs.has(pair.chainId)) continue;
      // No liquidity floor for DISPLAY — show the market price even on
      // thin liquidity. (The TVL aggregate excludes thin tokens in tvl.ts.)
      const price = parseFloat(pair.priceUsd ?? "0");
      if (!Number.isFinite(price) || price <= 0) continue;

      const k = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
      const ex = best.get(k);
      if (!ex || (pair.volume?.h24 ?? 0) > (ex.volume?.h24 ?? 0)) {
        best.set(k, pair);
      }
    }

    // Project chain-slug-keyed pairs back to chainId-keyed entries so the
    // caller can look up by their numeric chainId.
    for (const [, pair] of best) {
      const liqUsd = pair.liquidity?.usd ?? 0;
      const conf: "high" | "medium" | "low" = liqUsd >= LIQUIDITY_HIGH ? "high"
                                     : liqUsd >= LIQUIDITY_MEDIUM ? "medium"
                                     : "low";
      const matchedPair = toQuery.find(
        (p) => DS_CHAIN_SLUG[p.chainId] === pair.chainId
            && p.address === pair.baseToken.address.toLowerCase(),
      );
      if (!matchedPair) continue;
      const vol = typeof pair.volume?.h24 === "number" && Number.isFinite(pair.volume.h24)
        ? pair.volume.h24
        : null;
      const quickPrice: QuickPrice = {
        priceUsd:    parseFloat(pair.priceUsd!),
        confidence:  conf,
        volume24hUsd: vol,
      };
      out.set(priceKey(matchedPair.chainId, matchedPair.address), quickPrice);
      dexResolved.add(priceKey(matchedPair.chainId, matchedPair.address));
    }
  }

  // ── Redis writeback ──────────────────────────────────────────────────────
  // Cache positive hits AND negative results (token had no liquid pair) so
  // the next cold lambda doesn't repeat the work. Negative caching is
  // shorter-TTL than positive (60s vs 5min) — illiquid tokens occasionally
  // get a new pair listed and we want to discover that within the hour,
  // not on the 5-minute boundary.
  if (redis && toQuery.length > 0) {
    try {
      // Build the pipeline of sets in a single round-trip via pipeline.
      // Only the tokens we actually queried (toQuery) — never negative-cache
      // the over-cap tail we never looked at.
      const pipeline = redis.pipeline();
      for (const p of toQuery) {
        const k = redisKey(p.chainId, p.address);
        const lookupKey = priceKey(p.chainId, p.address);
        if (dexResolved.has(lookupKey)) {
          pipeline.set(k, out.get(lookupKey), { ex: REDIS_TTL_SECONDS });
        } else {
          pipeline.set(k, { _miss: true }, { ex: REDIS_NULL_TTL_SECONDS });
        }
      }
      await pipeline.exec();
    } catch (err) {
      console.warn("[quick-prices] redis writeback failed (non-fatal):", err);
    }
  }

  return out;
}

/**
 * Convenience: given a stringified bigint amount, decimals, and a price entry,
 * produce a USD value. Returns null when any input is missing so the caller
 * can render "—" cleanly. Bounded against unsafe integer overflow by going
 * through a Number division at scaled precision.
 */
export function toUsdValue(
  amountRaw: string | null | undefined,
  decimals:  number,
  price:     QuickPrice | undefined,
): number | null {
  if (!amountRaw || !price) return null;
  try {
    const safeDecimals = Math.min(Math.max(decimals, 0), 36);
    const amt = BigInt(amountRaw);
    // Scale through a 6-dp intermediate to keep precision for stablecoins
    // without overflowing on huge supplies.
    const scale6 = 10n ** 6n;
    const denom  = 10n ** BigInt(safeDecimals);
    if (denom === 0n) return null;
    const scaled = (amt * scale6) / denom;
    const tokens = Number(scaled) / 1_000_000;
    if (!Number.isFinite(tokens) || tokens <= 0) return null;
    const usd = tokens * price.priceUsd;
    return Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}

/**
 * Friendly USD formatter. Compact for ≥ $1k, two-decimal for ≥ $1, four-
 * decimal for sub-dollar (relevant for stablecoin dust + memecoin trickle).
 */
export function formatUsdCompact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  if (usd >= 1)   return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
