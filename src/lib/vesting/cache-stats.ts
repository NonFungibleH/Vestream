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

import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { statusSummary, vestingStreamsCache } from "@/lib/db/schema";

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
 * Cell rollup reader.
 *
 * Now reads from the materialised `status_summary` table (~60 rows,
 * sub-50ms) instead of doing a GROUP BY full-scan over
 * vesting_streams_cache (~50-100k rows). The summary table is maintained
 * by `refreshStatusSummary()` below, called from the seed-cache cron at
 * the end of each group's run.
 *
 * Falls back to the legacy GROUP BY if the summary table is empty (e.g.
 * fresh deploy where migration 0016 ran but the cron hasn't yet
 * populated the rollup). This guarantees /status renders SOMETHING from
 * day one of the migration without a stale-empty grace period.
 */
export async function getCacheStatsCells(): Promise<CacheStatsCell[]> {
  // Build-time guard — see CLAUDE.md landmine. The /status page renders
  // statically with revalidate=60 and would otherwise call into the DB
  // during `next build`; transient pooler drops there have killed builds
  // before. ISR fills with real data on the first runtime request.
  if (process.env.NEXT_PHASE === "phase-production-build") return [];

  // ── Fast path: read the materialised rollup ────────────────────────────────
  //
  // Wrapped in try/catch because the table can be MISSING (migration 0016
  // not yet applied — happens on first deploy after introducing the table,
  // and notably happened in prod when drizzle-kit migrate silently failed
  // against the Supabase transaction pooler). On any failure here, fall
  // back to computing the rollup live — slow but correct, and the user
  // sees data instead of an error banner.
  try {
    const fast = await db
      .select({
        protocol:        statusSummary.protocol,
        chainId:         statusSummary.chainId,
        streams:         statusSummary.streams,
        active:          statusSummary.active,
        withTokenSymbol: statusSummary.withTokenSymbol,
        distinctTokens:  statusSummary.distinctTokens,
        freshestSec:     statusSummary.freshestSec,
        oldestSec:       statusSummary.oldestSec,
      })
      .from(statusSummary)
      .orderBy(asc(statusSummary.protocol), asc(statusSummary.chainId));

    if (fast.length > 0) {
      return fast.map((r) => ({
        protocol:        r.protocol,
        chainId:         r.chainId,
        streams:         r.streams,
        active:          r.active,
        withTokenSymbol: r.withTokenSymbol,
        distinctTokens:  r.distinctTokens,
        freshestSec:     r.freshestSec,
        oldestSec:       r.oldestSec,
      }));
    }
    // Empty rollup → fall through to bootstrap path.
  } catch (err) {
    // Most common cause: table not present in the deployed DB. Log loudly
    // (one-line so the line shows up in Vercel without scrollback) and
    // serve the GROUP BY answer.
    console.warn(
      `[cache-stats] status_summary fast path failed (likely table missing); falling back to GROUP BY: ${err instanceof Error ? err.message : err}`,
    );
  }

  // ── Bootstrap fallback: legacy GROUP BY ────────────────────────────────────
  // Fires on (a) fresh deploys before the first cron run after migration
  // 0016 has populated the rollup, and (b) any error path above.
  return computeCacheStatsCellsFromCache();
}

/**
 * Underlying GROUP BY computation — the same expression that the legacy
 * getCacheStatsCells() ran on every read. Now extracted so it can be
 * called from refreshStatusSummary() (write path) and as a bootstrap
 * fallback in getCacheStatsCells (read path).
 *
 * Uses `extract(epoch from …)::int` so timestamps come back as integers
 * — sidesteps the PgBouncer-transaction-pooler Date-marshalling quirk.
 */
async function computeCacheStatsCellsFromCache(): Promise<CacheStatsCell[]> {
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

/**
 * Recompute status_summary from the live cache and upsert every row.
 *
 * Called from the seed-cache cron at the end of each group's run. One
 * call covers all (protocol, chainId) cells — the GROUP BY runs once and
 * we batch-upsert the result. Idempotent: running it twice in a row
 * produces no schema changes.
 *
 * Build-time guard: short-circuits during `next build` so a transient
 * pooler drop mid-build doesn't kill the build.
 */
export async function refreshStatusSummary(): Promise<{ rows: number }> {
  if (process.env.NEXT_PHASE === "phase-production-build") return { rows: 0 };

  const cells = await computeCacheStatsCellsFromCache();
  if (cells.length === 0) return { rows: 0 };

  const now = new Date();
  // Single multi-row upsert is much faster than per-row inserts on a
  // PgBouncer-pooled connection. ON CONFLICT (protocol, chain_id) keeps
  // the table at exactly one row per cell — never grows beyond ~60.
  await db
    .insert(statusSummary)
    .values(
      cells.map((c) => ({
        protocol:        c.protocol,
        chainId:         c.chainId,
        streams:         c.streams,
        active:          c.active,
        withTokenSymbol: c.withTokenSymbol,
        distinctTokens:  c.distinctTokens,
        freshestSec:     c.freshestSec,
        oldestSec:       c.oldestSec,
        computedAt:      now,
      })),
    )
    .onConflictDoUpdate({
      target: [statusSummary.protocol, statusSummary.chainId],
      set: {
        streams:         sql`excluded.streams`,
        active:          sql`excluded.active`,
        withTokenSymbol: sql`excluded.with_token_symbol`,
        distinctTokens:  sql`excluded.distinct_tokens`,
        freshestSec:     sql`excluded.freshest_sec`,
        oldestSec:       sql`excluded.oldest_sec`,
        computedAt:      sql`excluded.computed_at`,
      },
    });

  return { rows: cells.length };
}

/**
 * Single-row "when did data last move?" lookup.
 *
 * Per the May 2 2026 lastRefreshedAt semantic shift (CLAUDE.md), this is
 * literally "max wall-clock time of the most recent row that had its
 * stream_data change in any way" — i.e. the cron ran AND found something
 * worth updating. A multi-hour-stale max is the strongest single signal
 * that the seeder pipeline is broken: either the cron isn't running, or
 * it's running and silently producing nothing usable.
 *
 * Returns null if the cache is empty (fresh deploy / migration recovery).
 */
export async function getMaxLastRefreshedAt(): Promise<number | null> {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;

  const [row] = await db
    .select({
      maxSec: sql<number | null>`extract(epoch from max(${vestingStreamsCache.lastRefreshedAt}))::int`,
    })
    .from(vestingStreamsCache);

  return row?.maxSec ?? null;
}
