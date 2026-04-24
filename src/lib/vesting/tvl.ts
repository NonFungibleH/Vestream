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
// Pricing pipeline (April 2026 rewrite):
//   1. Aggregate locked tokens from the cache (GROUP BY chain, tokenAddress)
//   2. PASS A — DexScreener batch /latest/dex/tokens/{addrs}. Classify each
//      priced pair by its DEX liquidity:
//         ≥ $10k    → confidence "high"
//         $1k–$10k  → confidence "medium"
//         $100–$1k  → confidence "low"     (was excluded before the rewrite;
//                                           added so memecoin-heavy protocols
//                                           like UNCX aren't reported as $0)
//         < $100    → skipped (not trustworthy)
//   3. PASS B — For tokens DexScreener returned nothing for, try CoinGecko
//      /simple/token_price/{platform}. Tagged as confidence "medium" with
//      source "coingecko". Free-tier API (30 req/min) — we batch up to 100
//      contracts per call and leave ~2s between batches to stay safe.
//   4. Sum tokens × priceUsd into `tvlUsd` (all bands combined) AND per-band
//      totals, so the UI can show high-confidence + breakdown independently.
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

// ─── Chain slug maps (DexScreener + CoinGecko use different names) ───────────

const DS_CHAIN_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  137:  "polygon",
  8453: "base",
};

const CG_PLATFORM_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "binance-smart-chain",
  137:  "polygon-pos",
  8453: "base",
};

// Pricing thresholds (USD liquidity) — tiered to preserve the long tail
// without over-trusting thin markets.
const LIQUIDITY_FLOOR_USD = 100;
const LIQUIDITY_MEDIUM    = 1_000;
const LIQUIDITY_HIGH      = 10_000;

const DS_BATCH_SIZE       = 30;    // DexScreener max tokens per request
const DS_CONCURRENCY      = 4;
const CG_BATCH_SIZE       = 100;   // CoinGecko contract_addresses cap
const CG_CONCURRENCY      = 2;     // Stay well under 30 req/min free tier
const TTL_MS              = 10 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type PriceConfidence = "high" | "medium" | "low";
export type PriceSource     = "dexscreener" | "coingecko";

export interface PriceInfo {
  priceUsd:     number;
  source:       PriceSource;
  confidence:   PriceConfidence;
  liquidityUsd: number | null; // null when source = coingecko
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

  // Pass B: CoinGecko for any aggregate DexScreener didn't price.
  const unpriced = aggs.filter((a) => {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    return !dsChain || !dsPrices.has(`${dsChain}:${a.tokenAddress}`);
  });
  const cgPrices = await priceViaCoinGecko(unpriced);

  // Merge. Keep DexScreener results where present (they carry liquidity
  // metadata which matters for the high/medium/low split).
  const prices = new Map<string, PriceInfo>(dsPrices);
  for (const a of unpriced) {
    const platform = CG_PLATFORM_SLUG[a.chainId];
    if (!platform) continue;
    const cgKey    = `${platform}:${a.tokenAddress}`;
    const info     = cgPrices.get(cgKey);
    if (!info) continue;
    // Re-key under the DexScreener-style slug so the downstream loop has a
    // single lookup convention.
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
    pricingSources:  { dexscreener: 0, coingecko: 0 },
    perChain:        [],
    tokensPriced:    0,
    tokensSkipped:   0,
    totalTokens:     0,
    coverage:        0,
    topContributors: [],
    computedAt:      new Date().toISOString(),
  };
}
