// src/lib/vesting/token-symbols.ts
// ─────────────────────────────────────────────────────────────────────────────
// Symbol-routed token lookup powering /token/[symbol] SEO landing pages.
//
// Branded queries like "ARB unlock", "OP vesting", "PEPE token cliff" land on
// /token/[symbol] which either:
//   - 308-redirects to the canonical chain+address page when there's exactly
//     one (chain, address) pair for the symbol, OR
//   - renders a multi-chain disambiguation page when the symbol exists on
//     multiple chains (e.g. USDC, USDT, ETH)
//
// Symbol-only URLs are shareable (vestream.io/token/arb) and capture
// branded keyword traffic the chain+address URLs never could.
// ─────────────────────────────────────────────────────────────────────────────

import { and, count, eq, notInArray, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";

// Same testnet exclusion convention as protocol-stats.ts — public surfaces
// hide Sepolia / Base Sepolia.
const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);

export interface SymbolMatch {
  /** EVM chain id (1, 56, 137, 8453) or synthetic Solana id (101). */
  chainId:      number;
  /** Token contract address — lower-cased for stable comparison. */
  address:      string;
  /** Display symbol from the cache (often canonical-cased). */
  symbol:       string;
  /** How many indexed streams exist for this (chain, address). Drives
   *  ordering on the disambiguation page so the most-referenced chain
   *  surfaces first. */
  streamCount:  number;
}

/**
 * Look up every (chainId, address) pair where any indexed stream's
 * tokenSymbol matches the input — case-insensitive, trim-tolerant.
 *
 * Returns at most 20 matches per symbol; in practice no real symbol
 * has more than 5-10 distinct contracts across mainnets.
 */
export async function getTokensBySymbol(symbol: string): Promise<SymbolMatch[]> {
  const trimmed = symbol.trim();
  if (!trimmed) return [];
  // Build-time short-circuit (CI has no DATABASE_URL; postgres burns 30-60s
  // per query in connect-retry which times the build out). See same guard
  // in unlock-windows.ts for context.
  if (!process.env.DATABASE_URL) return [];

  const rows = await db
    .select({
      chainId:     vestingStreamsCache.chainId,
      address:     vestingStreamsCache.tokenAddress,
      symbol:      vestingStreamsCache.tokenSymbol,
      streamCount: count(),
    })
    .from(vestingStreamsCache)
    .where(
      and(
        // ILIKE-equivalent in postgres via lower() comparison.
        sql`lower(${vestingStreamsCache.tokenSymbol}) = ${trimmed.toLowerCase()}`,
        excludeTestnets,
      ),
    )
    .groupBy(vestingStreamsCache.chainId, vestingStreamsCache.tokenAddress, vestingStreamsCache.tokenSymbol)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  return rows
    .filter((r) => r.address) // tokenAddress is nullable in schema
    .map((r) => ({
      chainId:     r.chainId,
      address:     (r.address ?? "").toLowerCase(),
      symbol:      r.symbol ?? trimmed,
      streamCount: r.streamCount,
    }));
}

/**
 * Top-N symbols ordered by total indexed stream count. Drives
 * generateStaticParams for /token/[symbol] so the highest-traffic
 * symbols are pre-rendered at build time, while long-tail symbols
 * fall through to on-demand ISR.
 *
 * Filters out adapter-fallback "UNKNOWN" symbols and very short
 * placeholder symbols that wouldn't make useful landing pages.
 */
export async function getTopSymbols(limit = 200): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];

  const rows = await db
    .select({
      symbol: vestingStreamsCache.tokenSymbol,
      total:  count(),
    })
    .from(vestingStreamsCache)
    .where(
      and(
        sql`${vestingStreamsCache.tokenSymbol} is not null`,
        sql`length(${vestingStreamsCache.tokenSymbol}) >= 2`,
        sql`lower(${vestingStreamsCache.tokenSymbol}) != 'unknown'`,
        excludeTestnets,
      ),
    )
    .groupBy(vestingStreamsCache.tokenSymbol)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return rows.map((r) => (r.symbol ?? "").toLowerCase()).filter((s) => s.length >= 2);
}

/**
 * Per-chain summary for a single (symbol, chain) — drives the disambiguation
 * page's per-chain card. Computes total locked amount + recipient count for
 * the chain so visitors see scale at a glance.
 */
export interface ChainSummary {
  chainId:        number;
  address:        string;
  symbol:         string;
  streamCount:    number;
  walletCount:    number;
  /** Sum of locked amounts as stringified bigint (per-chain — meaningful
   *  for token amount, NOT USD-comparable across chains). */
  lockedAmount:   string;
  decimals:       number;
}

export async function getChainSummariesForSymbol(symbol: string): Promise<ChainSummary[]> {
  const trimmed = symbol.trim();
  if (!trimmed) return [];
  if (!process.env.DATABASE_URL) return [];

  // First lookup the (chain, address) pairs, then per-pair compute totals.
  const matches = await getTokensBySymbol(trimmed);
  if (matches.length === 0) return [];

  // Per-chain aggregate totals — drizzle in one query with grouped sum.
  const aggregates = await db
    .select({
      chainId:     vestingStreamsCache.chainId,
      address:     vestingStreamsCache.tokenAddress,
      symbol:      vestingStreamsCache.tokenSymbol,
      streamCount: count(),
      walletCount: sql<number>`count(distinct ${vestingStreamsCache.recipient})::int`,
      // Sum locked amount via streamData.lockedAmount JSON path. Falls back
      // to totalAmount for legacy rows.
      lockedSum: sql<string>`coalesce(sum((${vestingStreamsCache.streamData} ->> 'lockedAmount')::numeric), 0)::text`,
      decimals:  sql<number>`coalesce(max((${vestingStreamsCache.streamData} ->> 'tokenDecimals')::int), 18)`,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        sql`lower(${vestingStreamsCache.tokenSymbol}) = ${trimmed.toLowerCase()}`,
        eq(vestingStreamsCache.isFullyVested, false),
        excludeTestnets,
      ),
    )
    .groupBy(vestingStreamsCache.chainId, vestingStreamsCache.tokenAddress, vestingStreamsCache.tokenSymbol);

  return aggregates
    .filter((r) => r.address)
    .map((r) => ({
      chainId:      r.chainId,
      address:      (r.address ?? "").toLowerCase(),
      symbol:       r.symbol ?? trimmed,
      streamCount:  r.streamCount,
      walletCount:  r.walletCount,
      lockedAmount: r.lockedSum ?? "0",
      decimals:     r.decimals ?? 18,
    }))
    .sort((a, b) => b.streamCount - a.streamCount);
}
