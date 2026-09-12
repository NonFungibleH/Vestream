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
import { UNLISTED_ADAPTER_IDS } from "@/lib/protocol-constants";

// Same testnet exclusion convention as protocol-stats.ts — public surfaces
// hide Sepolia / Base Sepolia.
const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);
// /tokens/<symbol> is a public, statically-generated surface, so `unlisted`
// protocols must be excluded here too. Missing this let Bankr launches into
// the symbol pages, including tokens whose symbol is a bare number ("1",
// "420", "4663"), which crashed the production build on /tokens/waku.
const excludeUnlisted = UNLISTED_ADAPTER_IDS.length > 0
  ? notInArray(vestingStreamsCache.protocol, [...UNLISTED_ADAPTER_IDS])
  : undefined;

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
        excludeUnlisted,
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
  // sitemap's /token/{chainId}/{address} URLs. EVM addresses are lower-cased
  // in the rollup; Solana mints are stored case-preserved (base58 is
  // case-sensitive) — normaliseAddress below keeps that distinction.
  const rows = await db
    .select({
      chainId: tokenVestingRollups.chainId,
      address: tokenVestingRollups.tokenAddress,
    })
    .from(tokenVestingRollups)
    .where(sitemapTokenGate())
    .orderBy(sql`${tokenVestingRollups.streamCount} desc`)
    .limit(limit);

  return rows
    .filter((r) => r.address && r.address.length >= 32)
    // normaliseAddress lowercases EVM but preserves Solana base58 case.
    // A plain .toLowerCase() here corrupted every Solana (chain 101) mint,
    // so the sitemap fed Google dead /token/101/<lowercased> URLs that
    // 404'd → the "Excluded by noindex" bucket (247 pages, Aug 2026).
    .map((r) => ({ chainId: r.chainId, address: normaliseAddress(r.address) }));
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
        excludeUnlisted,
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

/**
 * The SEO quality gate: a token page worth submitting to Google, and worth
 * linking to from another page. ONE definition, shared by the sitemap
 * (getTopTokens) and by related-token links (getRelatedTokens), so internal
 * links never point at a page we would not submit.
 *
 * History: the first gate (Aug 2026) required an unlock still ahead and >1
 * recipient, and still shipped 708 URLs of which Google indexed almost none —
 * 356 "Discovered - currently not indexed" plus 359 "Crawled - currently not
 * indexed". Of 9,079 rollups, 85% carry no USD value, 91% have a single wallet
 * and 87% have no market cap, so most submitted pages were a token nobody has
 * heard of with no number on it, and hundreds of near-identical shells read as
 * templated low-value content — a judgement Google applies domain-wide.
 * Tightened 2026-09-09 to pages with a REASON to exist: real locked value and
 * an unlock still ahead (the countdown is what makes the page unique). ~250
 * URLs. Everything else stays crawlable via internal links; it is just not
 * force-submitted. Widen once Google is indexing what we do submit.
 */
export function sitemapTokenGate() {
  return and(
    sql`length(${tokenVestingRollups.tokenAddress}) >= 32`,
    notInArray(tokenVestingRollups.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]),
    sql`${tokenVestingRollups.lastEnd} > ${Math.floor(Date.now() / 1000)}`,
    sql`${tokenVestingRollups.walletCount} >= 2`,
    sql`${tokenVestingRollups.lockedValueUsd} > 1000`,
    sql`${tokenVestingRollups.nextUnlock} is not null`,
  );
}

export interface RelatedToken {
  chainId:        number;
  tokenAddress:   string;
  tokenSymbol:    string | null;
  lockedValueUsd: number | null;
  walletCount:    number;
  nextUnlock:     number | null;
  protocols:      string[];
}

/**
 * Other tokens vesting on the same chain, biggest locked value first, that
 * pass the sitemap gate. Rendered as a "related tokens" block on every token
 * page — until 2026-09-12 a token page linked to no other token page at all,
 * so the whole long tail hung off the sitemap alone, which is exactly what
 * "Discovered - currently not indexed" means.
 */
export async function getRelatedTokens(chainId: number, tokenAddress: string, limit = 6): Promise<RelatedToken[]> {
  if (isDbUnreachable()) return [];
  const rows = await db
    .select({
      chainId:        tokenVestingRollups.chainId,
      tokenAddress:   tokenVestingRollups.tokenAddress,
      tokenSymbol:    tokenVestingRollups.tokenSymbol,
      lockedValueUsd: tokenVestingRollups.lockedValueUsd,
      walletCount:    tokenVestingRollups.walletCount,
      nextUnlock:     tokenVestingRollups.nextUnlock,
      protocols:      tokenVestingRollups.protocols,
    })
    .from(tokenVestingRollups)
    .where(and(
      sitemapTokenGate(),
      sql`${tokenVestingRollups.chainId} = ${chainId}`,
      sql`${tokenVestingRollups.tokenAddress} <> ${normaliseAddress(tokenAddress)}`,
    ))
    .orderBy(sql`${tokenVestingRollups.lockedValueUsd} desc nulls last`)
    .limit(limit);
  return rows.map((r) => ({ ...r, protocols: r.protocols ?? [] }));
}

/** How many public chains a symbol vests on — >1 means the /tokens/[symbol]
 *  hub is a real multi-chain page rather than a redirect back to one token. */
export async function getSymbolChainCount(symbol: string): Promise<number> {
  const trimmed = symbol.trim();
  if (!trimmed || isDbUnreachable()) return 0;
  const rows = await db
    .select({ n: sql<number>`count(distinct ${tokenVestingRollups.chainId})::int` })
    .from(tokenVestingRollups)
    .where(and(
      sql`lower(${tokenVestingRollups.tokenSymbol}) = ${trimmed.toLowerCase()}`,
      notInArray(tokenVestingRollups.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]),
    ));
  return rows[0]?.n ?? 0;
}

/**
 * Symbols whose gated token pages span 2+ chains — the /tokens/[symbol] hubs
 * worth submitting. A hub for a single-chain symbol redirects to the token
 * page, so it is not a page in its own right.
 */
export async function getMultiChainSymbols(limit = 500): Promise<string[]> {
  if (isDbUnreachable()) return [];
  const rows = await db
    .select({ sym: sql<string>`lower(${tokenVestingRollups.tokenSymbol})` })
    .from(tokenVestingRollups)
    .where(and(
      sitemapTokenGate(),
      sql`${tokenVestingRollups.tokenSymbol} is not null`,
      sql`length(${tokenVestingRollups.tokenSymbol}) >= 2`,
      sql`lower(${tokenVestingRollups.tokenSymbol}) != 'unknown'`,
    ))
    .groupBy(sql`lower(${tokenVestingRollups.tokenSymbol})`)
    .having(sql`count(distinct ${tokenVestingRollups.chainId}) >= 2`)
    .orderBy(sql`sum(${tokenVestingRollups.lockedValueUsd}) desc nulls last`)
    .limit(limit);
  return rows.map((r) => r.sym);
}
