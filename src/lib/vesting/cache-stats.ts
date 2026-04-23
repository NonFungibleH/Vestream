// src/lib/vesting/cache-stats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-(protocol × chain) rollup of vesting_streams_cache.
//
// Shared by:
//   - /api/admin/cache-stats  (JSON readout for scripts / monitoring)
//   - /admin/cache-stats       (human-readable table for ops)
//
// Keep the logic in one place so the HTML view and the JSON view can't drift
// apart. If you need a new column in either surface, add it here and both get
// it for free.
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";

export interface CacheStatsCell {
  /** Adapter id — "sablier", "hedgey", "uncx", "uncx-vm", "unvest",
   *  "superfluid", "team-finance", "pinksale". */
  protocol: string;
  /** Numeric chain id (1, 56, 137, 8453, 11155111…). */
  chainId:  number;
  /** Total rows cached for this (protocol, chain). */
  streams:  number;
  /** Subset where isFullyVested = false. */
  active:   number;
  /** Rows where tokenSymbol resolved during adapter.fetch. A low share
   *  (< 80%) usually means token-metadata reads failed — worth checking
   *  the RPC or subgraph on that chain. */
  withTokenSymbol: number;
  /** Distinct tokenAddress count — proxy for "how many distinct projects
   *  are using this protocol on this chain". */
  distinctTokens:  number;
  /** Most recent lastRefreshedAt in this cell, as unix seconds.
   *  null if the cell is empty. Lets ops see "this chain stopped updating". */
  freshestSec: number | null;
  /** Oldest firstSeenAt in this cell, as unix seconds. Gives a sense of how
   *  long we've been tracking anything here. null for empty cells. */
  oldestSec:   number | null;
}

/**
 * Single GROUP BY scan of vesting_streams_cache. Returns one row per
 * (protocol, chainId). Empty cache → empty array (not an error).
 *
 * Uses `extract(epoch from …)::int` so timestamps come back as integers
 * rather than Date objects — sidesteps the PgBouncer-transaction-pooler
 * Date-marshalling quirk that bit the live-activity route earlier.
 */
export async function getCacheStatsCells(): Promise<CacheStatsCell[]> {
  const rows = await db
    .select({
      protocol:        vestingStreamsCache.protocol,
      chainId:         vestingStreamsCache.chainId,
      streams:         sql<number>`count(*)::int`,
      active:          sql<number>`count(*) filter (where ${vestingStreamsCache.isFullyVested} = false)::int`,
      withTokenSymbol: sql<number>`count(*) filter (where ${vestingStreamsCache.tokenSymbol} is not null)::int`,
      distinctTokens:  sql<number>`count(distinct ${vestingStreamsCache.tokenAddress})::int`,
      freshestSec:     sql<number | null>`extract(epoch from max(${vestingStreamsCache.lastRefreshedAt}))::int`,
      oldestSec:       sql<number | null>`extract(epoch from min(${vestingStreamsCache.firstSeenAt}))::int`,
    })
    .from(vestingStreamsCache)
    .groupBy(vestingStreamsCache.protocol, vestingStreamsCache.chainId)
    .orderBy(vestingStreamsCache.protocol, vestingStreamsCache.chainId);

  return rows.map((r) => ({
    protocol:        r.protocol,
    chainId:         r.chainId,
    streams:         r.streams         ?? 0,
    active:          r.active          ?? 0,
    withTokenSymbol: r.withTokenSymbol ?? 0,
    distinctTokens:  r.distinctTokens  ?? 0,
    freshestSec:     r.freshestSec ?? null,
    oldestSec:       r.oldestSec   ?? null,
  }));
}
