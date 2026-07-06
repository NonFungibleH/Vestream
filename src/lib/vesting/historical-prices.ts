// src/lib/vesting/historical-prices.ts
// ─────────────────────────────────────────────────────────────────────────────
// Historical USD price lookups for tax / income reporting.
//
// Why this exists separately from quick-prices.ts:
//   - quick-prices fetches the CURRENT spot price for portfolio rendering.
//     Cached aggressively, accuracy targets ~5 minutes.
//   - historical-prices fetches the price AT a specific block timestamp,
//     used to compute USD-value-at-claim for tax reports. Cached forever
//     (historical prices don't change). Accuracy target: same-day for
//     CoinGecko-listed tokens; nearest-available ±24h for long-tail.
//
// API: CoinGecko `/coins/{id}/history?date=DD-MM-YYYY` returns the
// market data for that day. Free tier allows ~30 calls/min. We aggressively
// cache and de-duplicate by (chainId, tokenAddress, isoDate) so the same
// claim being scanned by 50 users only fetches CoinGecko once.
//
// Token resolution: we map (chainId, tokenAddress) → CoinGecko token id
// via /coins/list/with-platforms (fetched once at startup, cached for 24h).
// Tokens not on CoinGecko fall back to "missing" — UI prompts the user
// for manual cost basis.
// ─────────────────────────────────────────────────────────────────────────────

import { Redis } from "@upstash/redis";

export type PriceConfidence = "exact" | "nearest" | "missing";

export interface HistoricalPrice {
  /** USD value of one token unit at the requested time. Null when no price
   *  is available (token not on CoinGecko / outside their date range). */
  usd: number | null;
  /** How we got this price — drives the priceConfidence column on
   *  claim_events. */
  confidence: PriceConfidence;
  /** Day actually used for the lookup (UTC ISO date). When confidence is
   *  "nearest" this differs from the requested date. */
  resolvedDate: string | null;
}

// CoinGecko platform slug → our chain ID
const CG_PLATFORM_BY_CHAIN: Record<number, string> = {
  1:     "ethereum",
  56:    "binance-smart-chain",
  137:   "polygon-pos",
  8453:  "base",
  43114: "avalanche",
  // Solana entries handled separately because tokenAddress format differs
};

const REDIS_TOKEN_LIST_KEY = "vestream:cg:token-list";
const REDIS_PRICE_KEY      = (chainId: number, addr: string, date: string) =>
  `vestream:cg:price:${chainId}:${addr.toLowerCase()}:${date}`;
const REDIS_NEGATIVE_KEY   = (chainId: number, addr: string) =>
  `vestream:cg:no-id:${chainId}:${addr.toLowerCase()}`;

const TOKEN_LIST_TTL_SECONDS = 24 * 3600;          // 24h
const PRICE_TTL_SECONDS       = 365 * 24 * 3600;   // ~forever
const NEGATIVE_TTL_SECONDS    = 7 * 24 * 3600;     // 1 week — re-check in case CG added it

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return Redis.fromEnv();
}

interface CgTokenListEntry {
  id:        string;
  symbol:    string;
  platforms: Record<string, string | null>;
}

let inMemoryTokenList: CgTokenListEntry[] | null = null;
let inMemoryTokenListExpiry = 0;

/**
 * Fetch + cache CoinGecko's token list. Map of (platform, contract) →
 * CoinGecko id. ~14k entries, ~3 MB JSON. Cached 24h.
 */
async function getTokenList(): Promise<CgTokenListEntry[]> {
  const now = Date.now();
  if (inMemoryTokenList && now < inMemoryTokenListExpiry) {
    return inMemoryTokenList;
  }

  const redis = getRedis();
  if (redis) {
    const cached = await redis.get<CgTokenListEntry[]>(REDIS_TOKEN_LIST_KEY);
    if (cached && Array.isArray(cached)) {
      inMemoryTokenList = cached;
      inMemoryTokenListExpiry = now + 6 * 3600 * 1000; // refresh in-memory every 6h within Redis's 24h TTL
      return cached;
    }
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/list?include_platform=true",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`CG list ${res.status}`);
    const data = await res.json() as CgTokenListEntry[];
    inMemoryTokenList = data;
    inMemoryTokenListExpiry = now + 6 * 3600 * 1000;
    if (redis) await redis.set(REDIS_TOKEN_LIST_KEY, data, { ex: TOKEN_LIST_TTL_SECONDS });
    return data;
  } catch (err) {
    console.error("[historical-prices] failed to load CoinGecko list:", err);
    return inMemoryTokenList ?? [];
  }
}

/**
 * Resolve (chainId, contract) → CoinGecko coin id.
 * Returns null if the token isn't tracked by CoinGecko.
 */
export async function resolveCoinGeckoId(
  chainId: number,
  tokenAddress: string,
): Promise<string | null> {
  const platform = CG_PLATFORM_BY_CHAIN[chainId];
  if (!platform) return null;

  const addrLower = tokenAddress.toLowerCase();
  const redis = getRedis();

  // Fast-path: cached negative result (we recently checked and CG doesn't
  // know this token). Avoids re-walking the 14k-entry list every time.
  if (redis) {
    const negative = await redis.get<"1">(REDIS_NEGATIVE_KEY(chainId, addrLower));
    if (negative === "1") return null;
  }

  const list = await getTokenList();
  for (const entry of list) {
    const platformAddr = entry.platforms?.[platform];
    if (platformAddr && platformAddr.toLowerCase() === addrLower) {
      return entry.id;
    }
  }

  // Cache the negative result for a week (don't keep re-walking).
  if (redis) {
    await redis.set(REDIS_NEGATIVE_KEY(chainId, addrLower), "1", { ex: NEGATIVE_TTL_SECONDS });
  }
  return null;
}

/**
 * Fetch the historical USD price for one token at the given timestamp.
 * Caches per (chain, address, day) since CoinGecko returns same-day price
 * regardless of the exact second.
 *
 * Strategy:
 *   1. Resolve coin id; if missing → confidence: "missing", usd: null
 *   2. Check Redis cache for the requested date → hit returns "exact"
 *   3. Fetch from CoinGecko `/coins/{id}/history?date=DD-MM-YYYY`
 *   4. If CG returns a price → cache + return "exact"
 *   5. If CG returns no data (date too far back / outside their range) →
 *      try ±1 day, ±2, up to ±7. First hit returns "nearest".
 *   6. If no hit anywhere in ±7 → "missing"
 *
 * Use this from the claim-event ingestor at write time, not at read time.
 * Reading enriched claim_events rows is cheap; writing them is where we
 * pay for CoinGecko round-trips.
 */
export async function getHistoricalPrice(
  chainId:      number,
  tokenAddress: string,
  timestampSec: number,
): Promise<HistoricalPrice> {
  const requestedDate = isoDateUtc(timestampSec);

  const redis = getRedis();
  if (redis) {
    const cached = await redis.get<{ usd: number; confidence: PriceConfidence; resolvedDate: string }>(
      REDIS_PRICE_KEY(chainId, tokenAddress, requestedDate),
    );
    if (cached) {
      return {
        usd:          cached.usd,
        confidence:   cached.confidence,
        resolvedDate: cached.resolvedDate,
      };
    }
  }

  const coinId = await resolveCoinGeckoId(chainId, tokenAddress);
  if (!coinId) {
    return { usd: null, confidence: "missing", resolvedDate: null };
  }

  // Try the requested date first, then walk outward ±1, ±2, … ±7 days.
  // Stop at the first day with data.
  for (let delta = 0; delta <= 7; delta++) {
    for (const sign of delta === 0 ? [0] : [-1, 1]) {
      const date = isoDateUtc(timestampSec + sign * delta * 86400);
      const usd = await fetchCoinGeckoHistoryUsd(coinId, date);
      if (usd !== null) {
        const confidence: PriceConfidence = delta === 0 ? "exact" : "nearest";
        const result = { usd, confidence, resolvedDate: date };
        if (redis) {
          await redis.set(
            REDIS_PRICE_KEY(chainId, tokenAddress, requestedDate),
            result,
            { ex: PRICE_TTL_SECONDS },
          );
        }
        return result;
      }
    }
  }

  // No price within ±7 days. Cache the miss with shorter TTL so we
  // re-check in a week (CG occasionally backfills historical data).
  const miss: HistoricalPrice = { usd: null, confidence: "missing", resolvedDate: null };
  if (redis) {
    await redis.set(
      REDIS_PRICE_KEY(chainId, tokenAddress, requestedDate),
      miss,
      { ex: NEGATIVE_TTL_SECONDS },
    );
  }
  return miss;
}

/**
 * CoinGecko's history endpoint expects DD-MM-YYYY (their docs are clear:
 * day-month-year, NOT ISO). Returns null if no data for that date.
 */
async function fetchCoinGeckoHistoryUsd(coinId: string, isoDate: string): Promise<number | null> {
  const [yyyy, mm, dd] = isoDate.split("-");
  const cgDate = `${dd}-${mm}-${yyyy}`;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${cgDate}&localization=false`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      market_data?: { current_price?: { usd?: number } };
    };
    const price = data.market_data?.current_price?.usd;
    return typeof price === "number" && isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

function isoDateUtc(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
