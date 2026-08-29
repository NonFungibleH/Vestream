import type { PriceInfo, PriceSource } from "./tvl";
/** Default freshness window — 6 hours. Most callers use this. */
export declare const DEFAULT_PRICE_CACHE_TTL_SEC: number;
/** Hourly refresh-cron upper bound — anything older than this is "stale" and
 *  becomes a candidate for refresh. Slightly tighter than the read-side TTL
 *  so consumers always see fresh data even if the refresh cron is briefly
 *  behind. */
export declare const REFRESH_AFTER_SEC: number;
export interface CachedPrice {
    chainId: number;
    tokenAddress: string;
    priceUsd: number;
    liquidityUsd: number | null;
    /** Circulating market cap in USD (DexScreener marketCap → fdv fallback).
     *  Null when unknown. Drives the explorer's unlock-risk metric. */
    marketCap: number | null;
    source: PriceSource;
    fetchedAt: Date;
    /** Seconds since fetchedAt. Computed at read time. */
    ageSec: number;
}
/**
 * Bulk-read prices for a list of (chainId, tokenAddress) pairs. Returns a
 * Map keyed by `${chainId}:${tokenAddressLower}` so the caller can do O(1)
 * lookups in the pricing loop.
 *
 * `maxAgeSec` lets the caller decide what's "fresh enough". The default
 * (6 hours) is appropriate for the TVL snapshot cron; the refresh cron
 * uses a different threshold to pick candidates for re-fetching.
 *
 * On DB error (e.g. table missing pre-migration), returns an empty map.
 * The caller's pricing pipeline then runs as if the cache didn't exist.
 */
export declare function readPriceCache(keys: Array<{
    chainId: number;
    tokenAddress: string;
}>, maxAgeSec?: number): Promise<Map<string, CachedPrice>>;
/**
 * Bulk-write prices to the cache. Idempotent upsert keyed on
 * (chainId, tokenAddress). Errors are swallowed — the caller's pricing
 * pipeline succeeded externally; we don't want a cache write blip to
 * mark the run as failed.
 *
 * Pass `now` to control the timestamp (used by tests + refresh cron when
 * batching writes that conceptually happened at the same instant).
 */
export declare function writePriceCache(entries: Array<{
    chainId: number;
    tokenAddress: string;
    priceUsd: number;
    liquidityUsd: number | null;
    marketCap?: number | null;
    source: PriceSource;
}>, now?: Date): Promise<void>;
/**
 * Pick the N stalest entries from the cache. Used by the hourly refresh
 * cron — those entries become the candidates for re-pricing this hour.
 *
 * Tokens that aren't in the cache yet are NOT returned here — they get
 * picked up by the daily TVL snapshot cron's walker output instead. This
 * keeps the hourly cron's job scoped to "freshen what we already know
 * about" rather than "discover new tokens", which would re-walk the
 * whole protocol set.
 */
export declare function pickStalestCachedTokens(limit: number): Promise<Array<{
    chainId: number;
    tokenAddress: string;
    ageSec: number;
}>>;
/**
 * Pick the N active-vesting tokens that have NO row in the price cache yet,
 * soonest-unlocking first (most likely to be viewed in the explorer).
 *
 * pickStalestCachedTokens only refreshes tokens ALREADY cached — brand-new
 * active-vesting tokens never enter the cache via the hourly cron, so the
 * explorer live-prices them on every render (the DexScreener fan-out that
 * caused Error 524). Seeding them here, ordered by next unlock, closes that
 * coverage gap durably. Testnets excluded to match the explorer's filter.
 *
 * On DB error returns [] (cache pipeline degrades to live-pricing as before).
 */
export declare function pickUncachedActiveVestingTokens(limit: number): Promise<Array<{
    chainId: number;
    tokenAddress: string;
}>>;
/**
 * Convert a PriceInfo (used by priceAggregates) ↔ cache entry. Centralised
 * so callers don't have to remember which fields map to what.
 */
export declare function priceInfoFromCached(c: CachedPrice): PriceInfo;
