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
import { vestingStreamsCache, tokenVestingRollups } from "../db/schema";
import { normaliseAddress } from "../address-validation";

// Same testnet exclusion convention as protocol-stats.ts — public surfaces
// hide Sepolia / Base Sepolia.
const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);

// Build-time DB unreachable: missing DATABASE_URL OR localhost pointer
// (CI sets a dummy `postgres://ci:ci@localhost:5432/ci` URL).
function isDbUnreachable(): boolean {
  const dbUrl = process.env.DATABASE_URL;
  return !dbUrl || /(\/\/|@)(localhost|127\.0\.0\.1)/.test(dbUrl);
}

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
  if (isDbUnreachable()) return [];

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
  if (isDbUnreachable()) return [];

  // Read the pre-aggregated per-token rollup (one row per (chain, address),
  // ~8k rows) instead of a GROUP BY over the whole vesting_streams_cache
  // (~200k rows, ~12s). That live group-by was timing out inside the sitemap
  // route → the sitemap silently shipped ZERO /tokens/[symbol] URLs. The
  // rollup is refreshed hourly by the refresh-rollups cron and reads in tens
  // of ms. One symbol can span multiple chains/addresses, so sum stream_count
  // per lower(symbol).
  const rows = await db
    .select({
      symbol: sql<string>`lower(${tokenVestingRollups.tokenSymbol})`,
      total:  sql<number>`sum(${tokenVestingRollups.streamCount})::int`,
    })
    .from(tokenVestingRollups)
    .where(
      and(
        sql`${tokenVestingRollups.tokenSymbol} is not null`,
        sql`length(${tokenVestingRollups.tokenSymbol}) >= 2`,
        sql`lower(${tokenVestingRollups.tokenSymbol}) != 'unknown'`,
        notInArray(tokenVestingRollups.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]),
      ),
    )
    .groupBy(sql`lower(${tokenVestingRollups.tokenSymbol})`)
    .orderBy(sql`sum(${tokenVestingRollups.streamCount}) desc`)
    .limit(limit);

  return rows.map((r) => (r.symbol ?? "").toLowerCase()).filter((s) => s.length >= 2);
}

export interface TopTokenRow {
  chainId: number;
  address: string;
}

/**
 * Top-N (chainId, address) pairs ordered by total indexed stream count.
 * Used to surface the highest-traffic /token/{chainId}/{address} pages
 * in the sitemap — long-tail addresses fall through to on-demand ISR.
 *
 * Excludes testnets and rows with non-EVM-shaped addresses so we don't
 * sitemap synthetic placeholders.
 */
export async function getTopTokens(limit = 1000): Promise<TopTokenRow[]> {
  if (isDbUnreachable()) return [];

  // Same reason as getTopSymbols: read the small pre-aggregated rollup rather
  // than a GROUP BY over the whole cache, which timed out and emptied the
  // sitemap's /token/{chainId}/{address} URLs. token_address is already
  // lower-cased + validated in the rollup.
  const rows = await db
    .select({
      chainId: tokenVestingRollups.chainId,
      address: tokenVestingRollups.tokenAddress,
    })
    .from(tokenVestingRollups)
    .where(
      and(
        sql`length(${tokenVestingRollups.tokenAddress}) >= 32`,
        notInArray(tokenVestingRollups.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]),
      ),
    )
    .orderBy(sql`${tokenVestingRollups.streamCount} desc`)
    .limit(limit);

  return rows
    .filter((r) => r.address && r.address.length >= 32)
    .map((r) => ({ chainId: r.chainId, address: r.address.toLowerCase() }));
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
  if (isDbUnreachable()) return [];

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

  // Merge rows that differ only by address CASING. The GROUP BY above keys on
  // the raw tokenAddress, so an EVM token cached under both checksummed and
  // lowercase forms produces two buckets for the same on-chain token — which
  // surfaced as e.g. USDC listing "Base" twice, with an inflated chain count
  // (July 2026 audit). normaliseAddress lowercases EVM but leaves case-
  // sensitive Solana mints untouched, so distinct Solana tokens never merge.
  const merged = new Map<string, ChainSummary>();
  for (const r of aggregates) {
    if (!r.address) continue;
    const address = normaliseAddress(r.address);
    const key = `${r.chainId}:${address}`;
    const existing = merged.get(key);
    if (existing) {
      existing.streamCount += r.streamCount;
      existing.walletCount += r.walletCount;
      // lockedAmount is a stringified integer (raw token units) — sum via
      // BigInt to preserve precision; fall back to the larger on any parse
      // surprise (e.g. a legacy decimal-bearing row).
      try {
        existing.lockedAmount = (BigInt(existing.lockedAmount) + BigInt(r.lockedSum ?? "0")).toString();
      } catch {
        if (Number(r.lockedSum ?? "0") > Number(existing.lockedAmount)) existing.lockedAmount = r.lockedSum ?? existing.lockedAmount;
      }
    } else {
      merged.set(key, {
        chainId:      r.chainId,
        address,
        symbol:       r.symbol ?? trimmed,
        streamCount:  r.streamCount,
        walletCount:  r.walletCount,
        lockedAmount: r.lockedSum ?? "0",
        decimals:     r.decimals ?? 18,
      });
    }
  }

  return [...merged.values()].sort((a, b) => b.streamCount - a.streamCount);
}
