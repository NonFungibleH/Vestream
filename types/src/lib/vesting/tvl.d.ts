export type PriceConfidence = "high" | "medium" | "low";
export type PriceSource = "dexscreener" | "defillama" | "coingecko";
export interface PriceInfo {
    priceUsd: number;
    source: PriceSource;
    confidence: PriceConfidence;
    liquidityUsd: number | null;
    /** Circulating market cap in USD (DexScreener marketCap → fdv). Null for
     *  defillama/coingecko-sourced rows. Persisted to token_prices_cache to
     *  power the explorer's unlock-risk metric. */
    marketCap?: number | null;
}
export interface ProtocolTvl {
    /** Adapter IDs this TVL aggregate covers. */
    adapterIds: readonly string[];
    /** Total USD value across ALL bands (high + medium + low). */
    tvlUsd: number;
    /** Per-confidence-band totals — lets the UI show a main headline + a
     *  breakdown footer without re-running the calc. */
    tvlByBand: {
        high: number;
        medium: number;
        low: number;
    };
    /** How many tokens each pricing source contributed. */
    pricingSources: {
        dexscreener: number;
        defillama: number;
        coingecko: number;
    };
    /** Per-chain breakdown sorted desc by tvl. */
    perChain: Array<{
        chainId: number;
        tvlUsd: number;
    }>;
    /** Total tokens we got a usable price for (any band, any source). */
    tokensPriced: number;
    /** Tokens skipped (no price from any source or below the floor). */
    tokensSkipped: number;
    /** Total unique (chainId, tokenAddress) pairs with a non-null address. */
    totalTokens: number;
    /** 0..1 = priced / total. */
    coverage: number;
    /** Top 5 single-token contributions by USD. */
    topContributors: Array<{
        tokenSymbol: string | null;
        tokenAddress: string;
        chainId: number;
        usd: number;
        confidence: PriceConfidence;
        source: PriceSource;
    }>;
    computedAt: string;
}
export declare function getProtocolTvl(adapterIds: readonly string[]): Promise<ProtocolTvl>;
/**
 * Batch helper for the /protocols index page — computes TVL for many protocols
 * in parallel. Accepts a record of (protocolSlug → adapterIds).
 */
export declare function getAllProtocolsTvl(adapterIdsByProtocol: Record<string, readonly string[]>): Promise<Record<string, ProtocolTvl>>;
export interface PricedAggregate {
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string | null;
    /** Whole-token amount (already divided by 10^decimals). */
    amount: number;
    /** USD value = amount × priceUsd. */
    usd: number;
    confidence: PriceConfidence;
    source: PriceSource;
    /** DexScreener pool depth in USD when source="dexscreener"; null for
     *  CoinGecko-priced tokens (no liquidity field exposed). Used by the TVL
     *  snapshot pipeline to apply a liquidity-multiplier ceiling so a single
     *  thin-pool token with a trillion-unit lock can't fake a $billions TVL. */
    liquidityUsd: number | null;
}
export interface PricingSummary {
    /** Per-token priced rows (one per (chainId, tokenAddress) that we successfully priced). */
    priced: PricedAggregate[];
    /** Count of aggregates we couldn't price (no DEX liquidity + no CoinGecko listing). */
    tokensSkipped: number;
}
/**
 * Price an arbitrary list of per-token locked aggregates. Used by both
 * `getProtocolTvl` (cache-backed) and the TVL snapshot cron (walker-backed).
 *
 * Input shape is intentionally minimal — any caller can adapt their own
 * aggregate type into this shape.
 */
export declare function priceAggregates(aggs: Array<{
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string | null;
    tokenDecimals: number;
    /** Stringified bigint — raw locked token units. */
    lockedAmount: string;
}>, opts?: {
    /** Maximum age (sec) of a cached price still considered "fresh enough".
     *  Tokens with cached entries within this window skip the external API
     *  call entirely. Defaults to 6 hours. */
    cacheMaxAgeSec?: number;
    /** Set to true to skip the cache entirely (forces a full API fetch).
     *  Used by the dedicated refresh cron when explicitly re-pricing stale
     *  entries; the standard snapshot cron leaves this unset. */
    skipCache?: boolean;
}): Promise<PricingSummary>;
