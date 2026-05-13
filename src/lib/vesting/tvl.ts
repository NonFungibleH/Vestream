// src/lib/vesting/tvl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol Total Value Locked (TVL) computed from `vestingStreamsCache`
// + multi-source pricing.
//
// Why NOT query the subgraphs directly for amounts:
//   • We already aggregate normalised `lockedAmount` into the cache via the
//     seeder + real user traffic — one source of truth is enough.
//   • Subgraph schemas differ; per-adapter arithmetic lives in adapter
//     `.fetch()` methods.
//
// Pricing pipeline (April 2026 → May 2026 3-layer rewrite):
//   1. Aggregate locked tokens from the cache (GROUP BY chain, tokenAddress)
//   2. PASS A — DexScreener batch /latest/dex/tokens/{addrs}. Classify each
//      priced pair by its DEX liquidity:
//         ≥ $10k    → confidence "high"
//         $1k–$10k  → confidence "medium"
//         $100–$1k  → confidence "low"     (was excluded before the rewrite;
//                                           added so memecoin-heavy protocols
//                                           like UNCX aren't reported as $0)
//         < $100    → skipped (not trustworthy)
//   3. PASS B — For tokens DexScreener returned nothing for, try DefiLlama
//      Coins API /prices/current/{chain}:{addr},... — internally aggregated
//      from CoinGecko + CMC + DexScreener + on-chain oracles. No published
//      rate limit. Tagged as confidence "medium" with source "defillama".
//   4. PASS C — Deep fallback for what BOTH DexScreener and DefiLlama
//      missed, hit CoinGecko /simple/token_price/{platform}. Free-tier API
//      (30 req/min). Rarely needed since DefiLlama already aggregates
//      CoinGecko — this layer exists only for resilience if DefiLlama is
//      down. Source tagged "coingecko".
//   5. Sum tokens × priceUsd into `tvlUsd` (all bands combined) AND per-band
//      totals, so the UI can show high-confidence + breakdown independently.
//
// Why the 3-layer (over the original 2-layer DexScreener→CoinGecko):
//   The 2026-05-12 + 2026-05-13 TVL snapshot crons hit 300s timeouts after
//   40+ "exhausted retries; returning HTTP 429" warnings from CoinGecko.
//   DefiLlama as the primary fallback eliminates the rate-limit storm
//   because it has no published rate limit and its single batch endpoint
//   accepts 100+ tokens per call. CoinGecko stays as deep insurance for
//   the rare DefiLlama outage.
//
// Why the floor dropped $1000 → $100:
//   Before the rewrite, a memecoin with $800 of DEX liquidity was considered
//   unpriced and contributed $0 to the protocol's TVL. UNCX is used almost
//   exclusively for pre-launch/low-cap tokens, so 90% of its locks fell
//   below the floor — causing the dashboard to show $56K TVL across 3,000
//   streams. The new tiered system keeps those tokens in the total but
//   flags them as lower-confidence; aggregate numbers stay directionally
//   honest without hiding the long tail.
//
// Caveats the UI must surface:
//   • Seed bias: protocols outside the seeder's high-volume set under-
//     report TVL until real visitors search their wallets. (Fixed
//     separately by the SEED_LIMIT bump + deep-seed mode in seeder.ts.)
//
// Results memoised per-process for 10 min.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import { fetchWithRetry } from "../fetch-with-retry";
import {
  readPriceCache,
  writePriceCache,
  priceInfoFromCached,
  DEFAULT_PRICE_CACHE_TTL_SEC,
  type CachedPrice,
} from "./token-price-cache";

// ─── Chain slug maps (DexScreener + CoinGecko use different names) ───────────

const DS_CHAIN_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  137:  "polygon",
  8453: "base",
  101:  "solana",     // DexScreener Solana slug — works for SPL mints
};

const CG_PLATFORM_SLUG: Record<number, string> = {
  1:     "ethereum",
  56:    "binance-smart-chain",
  137:   "polygon-pos",
  8453:  "base",
  42161: "arbitrum-one",        // added May 5 2026 — was missing, so any
  10:    "optimistic-ethereum", // Arbitrum/Optimism token DexScreener
                                 // missed got no Pass B fallback at all
  101:   "solana",              // CoinGecko platform slug for SPL tokens
};

// DefiLlama Coins API uses simpler chain slugs (matches their general
// taxonomy — same format as their TVL endpoint). Solana is "solana",
// EVM chains are their human-readable name. Reference:
//   https://defillama.com/docs/api  → /coins/prices/current
const LLAMA_CHAIN_SLUG: Record<number, string> = {
  1:     "ethereum",
  56:    "bsc",
  137:   "polygon",
  8453:  "base",
  42161: "arbitrum",
  10:    "optimism",
  101:   "solana",
};

// Pricing thresholds (USD liquidity) — tiered to preserve the long tail
// without over-trusting thin markets.
const LIQUIDITY_FLOOR_USD = 100;
const LIQUIDITY_MEDIUM    = 1_000;
const LIQUIDITY_HIGH      = 10_000;

const DS_BATCH_SIZE       = 30;    // DexScreener max tokens per request
const DS_CONCURRENCY      = 4;
const LLAMA_BATCH_SIZE    = 100;   // DefiLlama Coins API tested at ~100 tokens
                                   // per call; larger payloads risk URL length.
const LLAMA_CONCURRENCY   = 4;     // No published rate limit; 4 parallel keeps
                                   // ~400 tokens-priced-per-second realistic.
const CG_BATCH_SIZE       = 100;   // CoinGecko contract_addresses cap
const CG_CONCURRENCY      = 2;     // Stay well under 30 req/min free tier
const TTL_MS              = 10 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type PriceConfidence = "high" | "medium" | "low";
export type PriceSource     = "dexscreener" | "defillama" | "coingecko";

export interface PriceInfo {
  priceUsd:     number;
  source:       PriceSource;
  confidence:   PriceConfidence;
  liquidityUsd: number | null; // null when source = defillama or coingecko
}

export interface ProtocolTvl {
  /** Adapter IDs this TVL aggregate covers. */
  adapterIds:       readonly string[];
  /** Total USD value across ALL bands (high + medium + low). */
  tvlUsd:           number;
  /** Per-confidence-band totals — lets the UI show a main headline + a
   *  breakdown footer without re-running the calc. */
  tvlByBand: {
    high:      number;
    medium:    number;
    low:       number;
  };
  /** How many tokens each pricing source contributed. */
  pricingSources: {
    dexscreener: number;
    defillama:   number;
    coingecko:   number;
  };
  /** Per-chain breakdown sorted desc by tvl. */
  perChain:         Array<{ chainId: number; tvlUsd: number }>;
  /** Total tokens we got a usable price for (any band, any source). */
  tokensPriced:     number;
  /** Tokens skipped (no price from any source or below the floor). */
  tokensSkipped:    number;
  /** Total unique (chainId, tokenAddress) pairs with a non-null address. */
  totalTokens:      number;
  /** 0..1 = priced / total. */
  coverage:         number;
  /** Top 5 single-token contributions by USD. */
  topContributors:  Array<{
    tokenSymbol:  string | null;
    tokenAddress: string;
    chainId:      number;
    usd:          number;
    confidence:   PriceConfidence;
    source:       PriceSource;
  }>;
  computedAt:       string;
}

interface LockedTokenAggregate {
  chainId:       number;
  tokenAddress:  string;
  tokenSymbol:   string | null;
  tokenDecimals: number;
  totalLocked:   string;    // stringified bigint
}

// ─── Cache-table aggregation ─────────────────────────────────────────────────

async function getLockedAggregates(
  adapterIds: readonly string[],
): Promise<LockedTokenAggregate[]> {
  if (adapterIds.length === 0) return [];

  const rows = await db
    .select({
      chainId:       vestingStreamsCache.chainId,
      tokenAddress:  vestingStreamsCache.tokenAddress,
      tokenSymbol:   sql<string | null>`max(${vestingStreamsCache.tokenSymbol})`,
      tokenDecimals: sql<number>`coalesce(max((${vestingStreamsCache.streamData}->>'tokenDecimals')::int), 18)`,
      totalLocked:   sql<string>`coalesce(sum(nullif(${vestingStreamsCache.streamData}->>'lockedAmount', '')::numeric), 0)::text`,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        inArray(vestingStreamsCache.protocol, Array.from(adapterIds)),
        eq(vestingStreamsCache.isFullyVested, false),
      ),
    )
    .groupBy(vestingStreamsCache.chainId, vestingStreamsCache.tokenAddress);

  return rows
    .filter((r) => r.tokenAddress != null)
    .map((r) => ({
      chainId:       r.chainId,
      tokenAddress:  (r.tokenAddress as string).toLowerCase(),
      tokenSymbol:   r.tokenSymbol ?? null,
      tokenDecimals: r.tokenDecimals ?? 18,
      totalLocked:   r.totalLocked ?? "0",
    }));
}

// ─── DexScreener (primary pricing source) ────────────────────────────────────

interface DexPair {
  chainId:    string;
  baseToken:  { address: string; symbol: string };
  priceUsd?:  string;
  volume?:    { h24?: number };
  liquidity?: { usd?: number };
}

function confidenceFromLiquidity(liqUsd: number): PriceConfidence | null {
  if (liqUsd >= LIQUIDITY_HIGH)      return "high";
  if (liqUsd >= LIQUIDITY_MEDIUM)    return "medium";
  if (liqUsd >= LIQUIDITY_FLOOR_USD) return "low";
  return null; // below floor → skip
}

async function dexScreenerBatch(addresses: string[]): Promise<Map<string, PriceInfo>> {
  const out = new Map<string, PriceInfo>();
  if (addresses.length === 0) return out;

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${addresses.join(",")}`;
    const res = await fetchWithRetry(url, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    }, { tag: "dexscreener-tvl", retries: 2 });
    if (!res || !res.ok) return out;
    const data = (await res.json()) as { pairs?: DexPair[] };

    // Group by chain:address, pick the highest-volume pair that passes the
    // floor (matches DexScreener's own primary-pair ranking logic).
    const best = new Map<string, DexPair>();
    for (const pair of data.pairs ?? []) {
      const price = parseFloat(pair.priceUsd ?? "0");
      if (!Number.isFinite(price) || price <= 0) continue;
      const liqUsd = pair.liquidity?.usd ?? 0;
      if (liqUsd < LIQUIDITY_FLOOR_USD) continue;

      const key = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
      const existing = best.get(key);
      if (!existing || (pair.volume?.h24 ?? 0) > (existing.volume?.h24 ?? 0)) {
        best.set(key, pair);
      }
    }
    for (const [key, pair] of best) {
      const liqUsd = pair.liquidity?.usd ?? 0;
      const conf   = confidenceFromLiquidity(liqUsd);
      if (!conf) continue;
      out.set(key, {
        priceUsd:     parseFloat(pair.priceUsd!),
        source:       "dexscreener",
        confidence:   conf,
        liquidityUsd: liqUsd,
      });
    }
  } catch (err) {
    console.error("[tvl] DexScreener batch failed:", err);
  }
  return out;
}

async function priceViaDexScreener(
  aggs: LockedTokenAggregate[],
): Promise<Map<string, PriceInfo>> {
  const priceable = aggs.filter((a) => DS_CHAIN_SLUG[a.chainId]);
  const unique = Array.from(new Set(priceable.map((a) => a.tokenAddress.toLowerCase())));

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += DS_BATCH_SIZE) {
    batches.push(unique.slice(i, i + DS_BATCH_SIZE));
  }

  const all = new Map<string, PriceInfo>();
  for (let i = 0; i < batches.length; i += DS_CONCURRENCY) {
    const group   = batches.slice(i, i + DS_CONCURRENCY);
    const results = await Promise.all(group.map(dexScreenerBatch));
    for (const m of results) for (const [k, v] of m) all.set(k, v);
  }
  return all;
}

// ─── CoinGecko (fallback pricing source) ─────────────────────────────────────
//
// Used only for tokens DexScreener returned nothing for. Free-tier API is
// rate-limited to ~30 req/min — at CG_CONCURRENCY=2 and ~1s per batch we
// cap at ~120 req/min in absolute terms but realistic parallel groups of 2
// with each batch up to 100 contracts = ~200 contracts priced per second
// theoretical, ~10-20 contracts/sec practical with rate limiting.
//
// Response shape:
//   { "0xabc...": { "usd": 0.123, "usd_24h_vol": 1234 }, ... }
// No explicit liquidity — we tag everything "medium" confidence since
// CoinGecko's inclusion is itself a quality signal (they curate
// aggressively).

// ─── PASS B — DefiLlama (May 2026) ───────────────────────────────────────────
//
// Single endpoint: https://coins.llama.fi/prices/current/{chain}:{addr},...
// Accepts up to ~100 comma-separated `{chain}:{addr}` keys per call.
// No published rate limit; cross-chain in one call (we still group by chain
// for parity with the CoinGecko path's confidence-tagging logic).
//
// Response shape:
//   {
//     "coins": {
//       "ethereum:0xabc...": {
//         "decimals":   18,
//         "symbol":     "FOO",
//         "price":      0.123,
//         "timestamp":  1715600000,
//         "confidence": 0.99
//       },
//       ...
//     }
//   }
//
// `confidence` is DefiLlama's own quality signal (0..1). We treat
// >= 0.9 as our "medium" confidence (no liquidity number to compute high),
// < 0.5 as our "low" (still kept — same long-tail rationale as the
// DexScreener floor). 0.5–0.9 → "medium".

async function defiLlamaBatch(
  chain:     string,
  addresses: string[],
): Promise<Map<string, PriceInfo>> {
  const out = new Map<string, PriceInfo>();
  if (addresses.length === 0) return out;

  try {
    const keys = addresses.map((a) => `${chain}:${a}`).join(",");
    const url  = `https://coins.llama.fi/prices/current/${keys}`;
    const res  = await fetchWithRetry(url, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    }, { tag: "defillama-tvl", retries: 1 });
    if (!res || !res.ok) return out;
    const data = (await res.json()) as {
      coins?: Record<string, { price?: number; confidence?: number }>;
    };
    if (!data?.coins) return out;
    for (const [key, body] of Object.entries(data.coins)) {
      const price = body?.price;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
      // Map DefiLlama confidence (0..1) → our band.
      const llamaConf = typeof body.confidence === "number" ? body.confidence : 0.9;
      const confidence: PriceConfidence =
        llamaConf >= 0.9 ? "medium" :
        llamaConf >= 0.5 ? "medium" :
        "low";
      // Key in the prices map matches the DexScreener style (`dsChain:addr`)
      // so the merge step downstream doesn't need a parallel keyspace —
      // we rekey at the call site, not here.
      out.set(key, {
        priceUsd:     price,
        source:       "defillama",
        confidence,
        liquidityUsd: null,
      });
    }
  } catch (err) {
    console.error(`[tvl] DefiLlama batch (${chain}) failed:`, err);
  }
  return out;
}

async function priceViaDefiLlama(
  unpriced: LockedTokenAggregate[],
): Promise<Map<string, PriceInfo>> {
  // Group by chain so we can hit a single batched URL per chain.
  const byChain = new Map<string, string[]>();
  for (const a of unpriced) {
    const chain = LLAMA_CHAIN_SLUG[a.chainId];
    if (!chain) continue;
    const addr = a.tokenAddress.toLowerCase();
    if (!byChain.has(chain)) byChain.set(chain, []);
    byChain.get(chain)!.push(addr);
  }

  const all = new Map<string, PriceInfo>();
  for (const [chain, addrs] of byChain) {
    const unique  = Array.from(new Set(addrs));
    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += LLAMA_BATCH_SIZE) {
      batches.push(unique.slice(i, i + LLAMA_BATCH_SIZE));
    }
    for (let i = 0; i < batches.length; i += LLAMA_CONCURRENCY) {
      const group   = batches.slice(i, i + LLAMA_CONCURRENCY);
      const results = await Promise.all(group.map((b) => defiLlamaBatch(chain, b)));
      for (const m of results) for (const [k, v] of m) all.set(k, v);
    }
  }
  return all;
}

// ─── PASS C — CoinGecko (deep fallback, demoted from Pass B in May 2026) ────
//
// Now only called for tokens BOTH DexScreener AND DefiLlama missed.
// In practice this should be near-zero traffic, which makes the 30 req/min
// free-tier limit a non-issue.

async function coinGeckoBatch(
  platform: string,
  addresses: string[],
): Promise<Map<string, PriceInfo>> {
  const out = new Map<string, PriceInfo>();
  if (addresses.length === 0) return out;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}`
              + `?contract_addresses=${addresses.join(",")}`
              + `&vs_currencies=usd`;
    const res = await fetchWithRetry(url, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    }, { tag: "coingecko-tvl", retries: 1 });
    if (!res || !res.ok) return out;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    for (const [addr, body] of Object.entries(data)) {
      const price = body?.usd;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
      const key = `${platform}:${addr.toLowerCase()}`;
      out.set(key, {
        priceUsd:     price,
        source:       "coingecko",
        confidence:   "medium",
        liquidityUsd: null,
      });
    }
  } catch (err) {
    console.error(`[tvl] CoinGecko batch (${platform}) failed:`, err);
  }
  return out;
}

async function priceViaCoinGecko(
  unpriced: LockedTokenAggregate[],
): Promise<Map<string, PriceInfo>> {
  // Group remaining tokens by chain so we can hit the per-platform endpoint.
  const byPlatform = new Map<string, string[]>();
  for (const a of unpriced) {
    const platform = CG_PLATFORM_SLUG[a.chainId];
    if (!platform) continue;
    const addr = a.tokenAddress.toLowerCase();
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform)!.push(addr);
  }

  const all = new Map<string, PriceInfo>();
  for (const [platform, addrs] of byPlatform) {
    const unique = Array.from(new Set(addrs));
    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += CG_BATCH_SIZE) {
      batches.push(unique.slice(i, i + CG_BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i += CG_CONCURRENCY) {
      const group   = batches.slice(i, i + CG_CONCURRENCY);
      const results = await Promise.all(group.map((b) => coinGeckoBatch(platform, b)));
      for (const m of results) for (const [k, v] of m) all.set(k, v);
    }
  }
  return all;
}

// ─── Per-process memoisation ─────────────────────────────────────────────────

interface CacheEntry {
  value:     ProtocolTvl;
  expiresAt: number;
}
const CACHE = new Map<string, CacheEntry>();

function cacheKey(adapterIds: readonly string[]): string {
  return Array.from(adapterIds).slice().sort().join("+");
}

// ─── Main compute ────────────────────────────────────────────────────────────

export async function getProtocolTvl(
  adapterIds: readonly string[],
): Promise<ProtocolTvl> {
  const key = cacheKey(adapterIds);
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const aggs = await getLockedAggregates(adapterIds);

  // Pass A: DexScreener for every aggregate on a supported chain.
  const dsPrices = await priceViaDexScreener(aggs);

  // Pass B: DefiLlama for any aggregate DexScreener didn't price.
  const unpricedAfterDs = aggs.filter((a) => {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    return !dsChain || !dsPrices.has(`${dsChain}:${a.tokenAddress}`);
  });
  const llamaPrices = await priceViaDefiLlama(unpricedAfterDs);

  // Merge. Keep DexScreener results where present (they carry liquidity
  // metadata which matters for the high/medium/low split).
  const prices = new Map<string, PriceInfo>(dsPrices);
  for (const a of unpricedAfterDs) {
    const llamaChain = LLAMA_CHAIN_SLUG[a.chainId];
    if (!llamaChain) continue;
    const info = llamaPrices.get(`${llamaChain}:${a.tokenAddress}`);
    if (!info) continue;
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (dsChain) prices.set(`${dsChain}:${a.tokenAddress}`, info);
  }

  // Pass C: CoinGecko deep fallback for anything BOTH DS and DefiLlama
  // missed. Rarely fires in practice since DefiLlama aggregates CoinGecko.
  const unpricedAfterLlama = unpricedAfterDs.filter((a) => {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    return !dsChain || !prices.has(`${dsChain}:${a.tokenAddress}`);
  });
  const cgPrices = await priceViaCoinGecko(unpricedAfterLlama);
  for (const a of unpricedAfterLlama) {
    const platform = CG_PLATFORM_SLUG[a.chainId];
    if (!platform) continue;
    const cgKey    = `${platform}:${a.tokenAddress}`;
    const info     = cgPrices.get(cgKey);
    if (!info) continue;
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (dsChain) prices.set(`${dsChain}:${a.tokenAddress}`, info);
  }

  let tvlUsd        = 0;
  let tvlHigh       = 0;
  let tvlMedium     = 0;
  let tvlLow        = 0;
  let tokensPriced  = 0;
  let tokensSkipped = 0;
  let srcDex        = 0;
  let srcLlama      = 0;
  let srcCg         = 0;
  const perChainMap = new Map<number, number>();
  const contribs: ProtocolTvl["topContributors"] = [];

  for (const a of aggs) {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (!dsChain) { tokensSkipped++; continue; }

    const info = prices.get(`${dsChain}:${a.tokenAddress}`);
    if (!info) { tokensSkipped++; continue; }

    let wholeTokens: number;
    try {
      wholeTokens = Number(BigInt(a.totalLocked.split(".")[0] ?? "0")) / 10 ** a.tokenDecimals;
    } catch {
      const asNum = Number(a.totalLocked);
      if (!Number.isFinite(asNum)) { tokensSkipped++; continue; }
      wholeTokens = asNum / 10 ** a.tokenDecimals;
    }
    if (!Number.isFinite(wholeTokens) || wholeTokens <= 0) { tokensSkipped++; continue; }

    const usd = wholeTokens * info.priceUsd;
    if (!Number.isFinite(usd) || usd <= 0) { tokensSkipped++; continue; }

    tvlUsd += usd;
    if      (info.confidence === "high")   tvlHigh   += usd;
    else if (info.confidence === "medium") tvlMedium += usd;
    else                                   tvlLow    += usd;
    if      (info.source === "dexscreener") srcDex++;
    else if (info.source === "defillama")   srcLlama++;
    else                                    srcCg++;

    perChainMap.set(a.chainId, (perChainMap.get(a.chainId) ?? 0) + usd);
    contribs.push({
      tokenSymbol:  a.tokenSymbol,
      tokenAddress: a.tokenAddress,
      chainId:      a.chainId,
      usd,
      confidence:   info.confidence,
      source:       info.source,
    });
    tokensPriced++;
  }

  contribs.sort((a, b) => b.usd - a.usd);

  const result: ProtocolTvl = {
    adapterIds,
    tvlUsd,
    tvlByBand: {
      high:   tvlHigh,
      medium: tvlMedium,
      low:    tvlLow,
    },
    pricingSources: {
      dexscreener: srcDex,
      defillama:   srcLlama,
      coingecko:   srcCg,
    },
    perChain:       Array.from(perChainMap.entries())
      .map(([chainId, tvl]) => ({ chainId, tvlUsd: tvl }))
      .sort((a, b) => b.tvlUsd - a.tvlUsd),
    tokensPriced,
    tokensSkipped,
    totalTokens:    aggs.length,
    coverage:       aggs.length > 0 ? tokensPriced / aggs.length : 0,
    topContributors: contribs.slice(0, 5),
    computedAt:     new Date().toISOString(),
  };

  CACHE.set(key, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

/**
 * Batch helper for the /protocols index page — computes TVL for many protocols
 * in parallel. Accepts a record of (protocolSlug → adapterIds).
 */
export async function getAllProtocolsTvl(
  adapterIdsByProtocol: Record<string, readonly string[]>,
): Promise<Record<string, ProtocolTvl>> {
  const entries = await Promise.all(
    Object.entries(adapterIdsByProtocol).map(async ([slug, ids]) => {
      try {
        return [slug, await getProtocolTvl(ids)] as const;
      } catch (err) {
        console.error(`[tvl] ${slug} failed:`, err);
        return [slug, emptyTvl(ids)] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

function emptyTvl(adapterIds: readonly string[]): ProtocolTvl {
  return {
    adapterIds,
    tvlUsd:          0,
    tvlByBand:       { high: 0, medium: 0, low: 0 },
    pricingSources:  { dexscreener: 0, defillama: 0, coingecko: 0 },
    perChain:        [],
    tokensPriced:    0,
    tokensSkipped:   0,
    totalTokens:     0,
    coverage:        0,
    topContributors: [],
    computedAt:      new Date().toISOString(),
  };
}

// ─── Shared pricing primitive for external callers (tvl-snapshot.ts) ─────────
//
// Same math as `getProtocolTvl` above, but takes aggregates as an argument
// instead of reading from `vestingStreamsCache`. The /protocols page still
// uses the DB path; the TVL snapshot cron uses exhaustive walker output via
// `priceAggregates` directly. Keeping one pricing pipeline — so a
// methodology change here automatically ripples to both paths.

export interface PricedAggregate {
  chainId:      number;
  tokenAddress: string;
  tokenSymbol:  string | null;
  /** Whole-token amount (already divided by 10^decimals). */
  amount:       number;
  /** USD value = amount × priceUsd. */
  usd:          number;
  confidence:   PriceConfidence;
  source:       PriceSource;
  /** DexScreener pool depth in USD when source="dexscreener"; null for
   *  CoinGecko-priced tokens (no liquidity field exposed). Used by the TVL
   *  snapshot pipeline to apply a liquidity-multiplier ceiling so a single
   *  thin-pool token with a trillion-unit lock can't fake a $billions TVL. */
  liquidityUsd: number | null;
}

export interface PricingSummary {
  /** Per-token priced rows (one per (chainId, tokenAddress) that we successfully priced). */
  priced:         PricedAggregate[];
  /** Count of aggregates we couldn't price (no DEX liquidity + no CoinGecko listing). */
  tokensSkipped:  number;
}

/**
 * Price an arbitrary list of per-token locked aggregates. Used by both
 * `getProtocolTvl` (cache-backed) and the TVL snapshot cron (walker-backed).
 *
 * Input shape is intentionally minimal — any caller can adapt their own
 * aggregate type into this shape.
 */
export async function priceAggregates(
  aggs: Array<{
    chainId:       number;
    tokenAddress:  string;
    tokenSymbol:   string | null;
    tokenDecimals: number;
    /** Stringified bigint — raw locked token units. */
    lockedAmount:  string;
  }>,
  opts?: {
    /** Maximum age (sec) of a cached price still considered "fresh enough".
     *  Tokens with cached entries within this window skip the external API
     *  call entirely. Defaults to 6 hours. */
    cacheMaxAgeSec?: number;
    /** Set to true to skip the cache entirely (forces a full API fetch).
     *  Used by the dedicated refresh cron when explicitly re-pricing stale
     *  entries; the standard snapshot cron leaves this unset. */
    skipCache?: boolean;
  },
): Promise<PricingSummary> {
  if (aggs.length === 0) return { priced: [], tokensSkipped: 0 };

  // Map walker-style input into the internal aggregate shape used by the DS/CG
  // helpers (they still expect `totalLocked`).
  const internalAggs: LockedTokenAggregate[] = aggs.map((a) => ({
    chainId:       a.chainId,
    tokenAddress:  a.tokenAddress.toLowerCase(),
    tokenSymbol:   a.tokenSymbol,
    tokenDecimals: a.tokenDecimals,
    totalLocked:   a.lockedAmount,
  }));

  // ── Read-through cache (May 11 2026) ─────────────────────────────────────
  //
  // The snapshot cron used to call DexScreener / CoinGecko for every token
  // on every run — thousands of requests in a few minutes, which 429-rate-
  // limited the free APIs and tanked the headline. With token_prices_cache
  // in front, each subsequent run serves cached prices < 6h old without
  // touching external APIs at all. Only cache MISSES or STALE entries
  // require an external fetch.
  //
  // Failure-soft by design: if the cache table is missing (pre-migration)
  // or any DB error occurs, readPriceCache returns an empty map and the
  // pipeline falls through to the original API-only path.
  const cacheHits = opts?.skipCache
    ? new Map<string, CachedPrice>()
    : await readPriceCache(
        internalAggs.map((a) => ({ chainId: a.chainId, tokenAddress: a.tokenAddress })),
        opts?.cacheMaxAgeSec ?? DEFAULT_PRICE_CACHE_TTL_SEC,
      );

  // Build the `prices` map seeded with cache hits, then only ask DS/CG
  // for the tokens we couldn't serve from cache.
  const prices = new Map<string, PriceInfo>();
  const cacheKey = (chainId: number, addr: string) => `${chainId}:${addr.toLowerCase()}`;
  for (const a of internalAggs) {
    const ck = cacheKey(a.chainId, a.tokenAddress);
    const hit = cacheHits.get(ck);
    if (!hit) continue;
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (!dsChain) continue;  // can't represent cached entry in DS-keyed map
    prices.set(`${dsChain}:${a.tokenAddress}`, priceInfoFromCached(hit));
  }

  // Tokens needing an external fetch — anything not satisfied by cache.
  const cacheMisses = internalAggs.filter(
    (a) => !cacheHits.has(cacheKey(a.chainId, a.tokenAddress)),
  );

  // Pass A — DexScreener (only for cache misses).
  const dsPrices = cacheMisses.length > 0
    ? await priceViaDexScreener(cacheMisses)
    : new Map<string, PriceInfo>();
  // Merge DS results into the prices map.
  for (const [k, v] of dsPrices.entries()) prices.set(k, v);

  // Pass B — DefiLlama for what DexScreener didn't price. Internally
  // aggregates CoinGecko + CMC + DexScreener + on-chain oracles. No
  // rate limit. Handles the 95% case for the "DexScreener missed it"
  // path; CoinGecko (Pass C) only runs for the rare residual.
  const unpricedAfterDs = cacheMisses.filter((a) => {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    return !dsChain || !dsPrices.has(`${dsChain}:${a.tokenAddress}`);
  });
  const llamaPrices = unpricedAfterDs.length > 0
    ? await priceViaDefiLlama(unpricedAfterDs)
    : new Map<string, PriceInfo>();
  // DefiLlama's keys are `{chain}:{addr}` (e.g. "ethereum:0x..."). Re-key
  // into the DexScreener-style map keyspace before merging.
  for (const a of unpricedAfterDs) {
    const llamaChain = LLAMA_CHAIN_SLUG[a.chainId];
    if (!llamaChain) continue;
    const info = llamaPrices.get(`${llamaChain}:${a.tokenAddress}`);
    if (!info) continue;
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (dsChain) prices.set(`${dsChain}:${a.tokenAddress}`, info);
  }

  // Pass C — CoinGecko deep fallback for what BOTH DS and DefiLlama missed.
  const unpricedAfterLlama = unpricedAfterDs.filter((a) => {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    return !dsChain || !prices.has(`${dsChain}:${a.tokenAddress}`);
  });
  const cgPrices = unpricedAfterLlama.length > 0
    ? await priceViaCoinGecko(unpricedAfterLlama)
    : new Map<string, PriceInfo>();
  for (const a of unpricedAfterLlama) {
    const platform = CG_PLATFORM_SLUG[a.chainId];
    if (!platform) continue;
    const info    = cgPrices.get(`${platform}:${a.tokenAddress}`);
    if (!info) continue;
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (dsChain) prices.set(`${dsChain}:${a.tokenAddress}`, info);
  }

  // Write back to cache: every newly-fetched price (cache MISSES only —
  // hits already came from the cache). Awaited (was fire-and-forget) —
  // on Vercel, a `void promise` from a handler can be killed before it
  // lands the row in Postgres, leaving the cache permanently empty.
  // The cache emptiness was the root cause of repeated TVL-snapshot
  // timeouts because every run fought CoinGecko's rate limit from
  // scratch with no help from prior runs.
  const newEntries: Array<{
    chainId:      number;
    tokenAddress: string;
    priceUsd:     number;
    liquidityUsd: number | null;
    source:       PriceSource;
  }> = [];
  for (const a of cacheMisses) {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (!dsChain) continue;
    const info = prices.get(`${dsChain}:${a.tokenAddress}`);
    if (!info) continue;  // truly unpriced — nothing to cache
    newEntries.push({
      chainId:      a.chainId,
      tokenAddress: a.tokenAddress,
      priceUsd:     info.priceUsd,
      liquidityUsd: info.liquidityUsd,
      source:       info.source,
    });
  }
  if (newEntries.length > 0) {
    await writePriceCache(newEntries);
  }

  const priced: PricedAggregate[] = [];
  let tokensSkipped = 0;

  for (const a of internalAggs) {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (!dsChain) { tokensSkipped++; continue; }

    const info = prices.get(`${dsChain}:${a.tokenAddress}`);
    if (!info) { tokensSkipped++; continue; }

    let wholeTokens: number;
    try {
      wholeTokens = Number(BigInt(a.totalLocked.split(".")[0] ?? "0")) / 10 ** a.tokenDecimals;
    } catch {
      const asNum = Number(a.totalLocked);
      if (!Number.isFinite(asNum)) { tokensSkipped++; continue; }
      wholeTokens = asNum / 10 ** a.tokenDecimals;
    }
    if (!Number.isFinite(wholeTokens) || wholeTokens <= 0) { tokensSkipped++; continue; }

    const usd = wholeTokens * info.priceUsd;
    if (!Number.isFinite(usd) || usd <= 0) { tokensSkipped++; continue; }

    priced.push({
      chainId:      a.chainId,
      tokenAddress: a.tokenAddress,
      tokenSymbol:  a.tokenSymbol,
      amount:       wholeTokens,
      usd,
      confidence:   info.confidence,
      source:       info.source,
      liquidityUsd: info.liquidityUsd,
    });
  }

  return { priced, tokensSkipped };
}
