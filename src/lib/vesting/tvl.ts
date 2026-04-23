// src/lib/vesting/tvl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol Total Value Locked (TVL) computed from the `vestingStreamsCache`
// table + DexScreener spot prices.
//
// Why NOT query the subgraphs directly for amounts:
//   • We already aggregate normalised `lockedAmount` into the cache via the
//     seeder + real user traffic — one source of truth is enough.
//   • Subgraph schemas differ (Sablier has depositAmount, Unvest has locked,
//     Superfluid has totalAmount − all the per-adapter arithmetic is already
//     implemented in the adapter `.fetch()` methods).
//
// Algorithm
//   1. SELECT chain_id, token_address, max(symbol), SUM(locked), max(decimals)
//      FROM vesting_streams_cache WHERE protocol IN (...) AND is_fully_vested = false
//      GROUP BY chain_id, token_address
//   2. Batch DexScreener /latest/dex/tokens/{addr1,addr2,...} (up to 30 per call)
//      with a small concurrency limit to stay under the 300 req/min rate cap.
//   3. For each aggregate with a priced pair, add tokens × priceUsd to the total.
//
// Caveats to surface in the UI
//   • Coverage: not every token has a DexScreener pair — report priced/total
//     so the user knows what fraction of protocols' TVL we're actually seeing.
//   • Liquidity floor: pairs with < $1k liquidity are ignored — their priceUsd
//     can be wildly wrong. This preserves directional accuracy.
//   • Seed bias: protocols outside the seeder set (hedgey / pinksale / team-
//     finance) will under-report TVL until real visitors search their wallets.
//
// Results memoised per-process for 10 min — same cadence as getGlobalStats().
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import { fetchWithRetry } from "../fetch-with-retry";

// ─── DexScreener chain slug mapping ──────────────────────────────────────────
// Only these chains have DexScreener coverage — tokens on other chains are
// reported under `tokensSkipped`.

const DS_CHAIN_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  137:  "polygon",
  8453: "base",
};

const LIQUIDITY_FLOOR_USD  = 1_000;     // below this we don't trust the price
const PRICE_BATCH_SIZE     = 30;         // DexScreener max tokens per request
const PRICE_CONCURRENCY    = 4;          // simultaneous DexScreener requests
const TTL_MS               = 10 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProtocolTvl {
  /** Adapter IDs this TVL aggregate covers. */
  adapterIds:       readonly string[];
  /** Total USD value of all *active* locked tokens we could price. */
  tvlUsd:           number;
  /** Per-chain breakdown sorted desc by tvl. */
  perChain:         Array<{ chainId: number; tvlUsd: number }>;
  /** How many (chainId, tokenAddress) pairs had a usable DexScreener price. */
  tokensPriced:     number;
  /** How many were skipped because no price / no DEX pair / non-mainnet chain. */
  tokensSkipped:    number;
  /** Total unique (chainId, tokenAddress) pairs with a non-null address. */
  totalTokens:      number;
  /** 0..1 fraction = priced / total. Useful confidence indicator in the UI. */
  coverage:         number;
  /** Top 5 single-token contributions by USD — lets UI explain "what's driving TVL". */
  topContributors:  Array<{
    tokenSymbol:  string | null;
    tokenAddress: string;
    chainId:      number;
    usd:          number;
  }>;
  /** ISO timestamp of compute time. */
  computedAt:       string;
}

interface LockedTokenAggregate {
  chainId:       number;
  tokenAddress:  string;
  tokenSymbol:   string | null;
  tokenDecimals: number;
  totalLocked:   string;    // stringified bigint — SUM can exceed 2^53
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
      // max(symbol) — there's only one symbol per address anyway
      tokenSymbol:   sql<string | null>`max(${vestingStreamsCache.tokenSymbol})`,
      // Decimals live inside the jsonb blob. Default to 18.
      tokenDecimals: sql<number>`coalesce(max((${vestingStreamsCache.streamData}->>'tokenDecimals')::int), 18)`,
      // Sum of locked amounts — huge bigints, return as text.
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

// ─── DexScreener pricing ─────────────────────────────────────────────────────

interface DexPair {
  chainId:    string;
  baseToken:  { address: string; symbol: string };
  priceUsd?:  string;
  volume?:    { h24?: number };
  liquidity?: { usd?: number };
}

async function priceBatch(addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (addresses.length === 0) return out;

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${addresses.join(",")}`;
    // Align the fetch cache lifetime with the page's `revalidate = 60`. Using
    // `no-store` forces the entire calling route into dynamic rendering,
    // which defeats SSG for /unlocks (the page is a rainbow grid of protocol
    // cards that are genuinely ISR-friendly). 60s keeps TVL numbers fresh
    // without 500'ing the static build.
    //
    // fetchWithRetry auto-retries 5xx + 429 (DexScreener has both) with
    // exponential backoff + jitter, so a brief upstream blip no longer
    // blanks every user's TVL bar for 60s.
    const res = await fetchWithRetry(url, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    }, { tag: "dexscreener-tvl", retries: 2 });
    if (!res || !res.ok) return out;
    const data = (await res.json()) as { pairs?: DexPair[] };

    // For each (chainSlug:tokenAddress) key, pick the highest-volume pair that
    // has at least LIQUIDITY_FLOOR_USD of liquidity — matches DexScreener's
    // own "primary pair" ranking logic.
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
      out.set(key, parseFloat(pair.priceUsd!));
    }
  } catch (err) {
    console.error("[tvl] DexScreener batch failed:", err);
  }
  return out;
}

async function priceAll(addresses: string[]): Promise<Map<string, number>> {
  const all = new Map<string, number>();
  if (addresses.length === 0) return all;

  // Dedupe
  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase())));

  // Split into size-30 batches, run up to PRICE_CONCURRENCY in parallel
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += PRICE_BATCH_SIZE) {
    batches.push(unique.slice(i, i + PRICE_BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += PRICE_CONCURRENCY) {
    const group   = batches.slice(i, i + PRICE_CONCURRENCY);
    const results = await Promise.all(group.map(priceBatch));
    for (const m of results) for (const [k, v] of m) all.set(k, v);
  }
  return all;
}

// ─── Main compute ────────────────────────────────────────────────────────────

interface CacheEntry {
  value:     ProtocolTvl;
  expiresAt: number;
}
const CACHE = new Map<string, CacheEntry>();

function cacheKey(adapterIds: readonly string[]): string {
  return Array.from(adapterIds).slice().sort().join("+");
}

export async function getProtocolTvl(
  adapterIds: readonly string[],
): Promise<ProtocolTvl> {
  const key = cacheKey(adapterIds);
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const aggs = await getLockedAggregates(adapterIds);

  // Only fetch prices for addresses on chains DexScreener covers
  const priceable = aggs.filter((a) => DS_CHAIN_SLUG[a.chainId]);
  const prices    = await priceAll(priceable.map((a) => a.tokenAddress));

  let tvlUsd        = 0;
  let tokensPriced  = 0;
  let tokensSkipped = 0;
  const perChainMap = new Map<number, number>();
  const contribs: ProtocolTvl["topContributors"] = [];

  for (const a of aggs) {
    const dsChain = DS_CHAIN_SLUG[a.chainId];
    if (!dsChain) { tokensSkipped++; continue; }

    const price = prices.get(`${dsChain}:${a.tokenAddress}`);
    if (!price) { tokensSkipped++; continue; }

    // Convert stringified bigint → float. SUM is NUMERIC so it may be non-integer;
    // try BigInt first (exact for integer sums), fall back to Number for safety.
    let wholeTokens: number;
    try {
      wholeTokens = Number(BigInt(a.totalLocked.split(".")[0] ?? "0")) / 10 ** a.tokenDecimals;
    } catch {
      const asNum = Number(a.totalLocked);
      if (!Number.isFinite(asNum)) { tokensSkipped++; continue; }
      wholeTokens = asNum / 10 ** a.tokenDecimals;
    }
    if (!Number.isFinite(wholeTokens) || wholeTokens <= 0) { tokensSkipped++; continue; }

    const usd = wholeTokens * price;
    if (!Number.isFinite(usd) || usd <= 0) { tokensSkipped++; continue; }

    tvlUsd += usd;
    perChainMap.set(a.chainId, (perChainMap.get(a.chainId) ?? 0) + usd);
    contribs.push({
      tokenSymbol:  a.tokenSymbol,
      tokenAddress: a.tokenAddress,
      chainId:      a.chainId,
      usd,
    });
    tokensPriced++;
  }

  contribs.sort((a, b) => b.usd - a.usd);

  const result: ProtocolTvl = {
    adapterIds,
    tvlUsd,
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
 * Batch helper for the /unlocks index page — computes TVL for many protocols
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
    perChain:        [],
    tokensPriced:    0,
    tokensSkipped:   0,
    totalTokens:     0,
    coverage:        0,
    topContributors: [],
    computedAt:      new Date().toISOString(),
  };
}
