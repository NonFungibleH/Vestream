/**
 * Persistent vesting stream cache — backed by Supabase (vesting_streams_cache table).
 *
 * Strategy:
 *  - On every successful subgraph fetch, upsert all returned streams to the DB.
 *  - On subsequent requests for the same wallet(s), serve from DB if data is fresh
 *    (< CACHE_TTL_SECONDS old). Skip subgraph entirely.
 *  - If any wallet has no rows, or all rows are stale, fall back to subgraph fetch.
 *  - Fully-vested streams are refreshed less frequently (hourly) since they won't change.
 *
 * This gives us:
 *  - Instant repeat loads (no subgraph round-trip)
 *  - Resilience if subgraphs go down
 *  - A growing proprietary dataset of indexed vesting positions
 *  - Foundation for the external API / AI data layer
 */

import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";
import { inArray, and, gte, sql } from "drizzle-orm";
import { VestingStream } from "./types";

/** How old cached data can be before we re-fetch from subgraphs */
const ACTIVE_TTL_SECONDS   = 30 * 60;      // 30 min for active streams (tighten when needed)
const VESTED_TTL_SECONDS   = 24 * 60 * 60; // 24 hrs for fully-vested streams (never change)

// ─── Read ─────────────────────────────────────────────────────────────────────

export interface CacheReadResult {
  streams:    VestingStream[];
  /** true if every requested wallet had fresh cached data (no subgraph needed) */
  isFresh:    boolean;
  /** wallets that had no cache or stale cache — must be re-fetched */
  staleWallets: string[];
}

/**
 * Returns cached streams for the given wallets.
 * Wallets with no rows or stale rows are listed in `staleWallets`.
 */
export async function readFromCache(wallets: string[]): Promise<CacheReadResult> {
  if (wallets.length === 0) return { streams: [], isFresh: true, staleWallets: [] };

  const lowerWallets = wallets.map((w) => w.toLowerCase());
  const now = new Date();

  // Fetch all cached rows for these wallets
  const rows = await db
    .select()
    .from(vestingStreamsCache)
    .where(inArray(vestingStreamsCache.recipient, lowerWallets));

  if (rows.length === 0) {
    return { streams: [], isFresh: false, staleWallets: wallets };
  }

  // Determine which wallets have at least one fresh row
  const freshWallets = new Set<string>();
  const streams: VestingStream[] = [];

  for (const row of rows) {
    const ttl = row.isFullyVested ? VESTED_TTL_SECONDS : ACTIVE_TTL_SECONDS;
    const ageSeconds = (now.getTime() - row.lastRefreshedAt.getTime()) / 1000;
    const fresh = ageSeconds < ttl;

    if (fresh) {
      freshWallets.add(row.recipient);
      streams.push(row.streamData as unknown as VestingStream);
    }
  }

  // Any wallet that had no fresh rows needs a re-fetch
  const staleWallets = lowerWallets.filter((w) => !freshWallets.has(w));

  return {
    streams,
    isFresh: staleWallets.length === 0,
    staleWallets,
  };
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upserts a batch of VestingStream objects to the persistent cache.
 * Safe to call fire-and-forget — errors are caught and logged, never thrown.
 *
 * Returns the number of rows that were actually written. A zero return
 * combined with a non-empty input means the write failed — the error was
 * logged but not thrown, so the caller has to check this if it cares.
 */
export async function writeToCache(streams: VestingStream[]): Promise<number> {
  if (streams.length === 0) return 0;

  // Dedupe by stream id. Postgres' `INSERT ... ON CONFLICT DO UPDATE` rejects
  // a batch that tries to upsert the same conflict target twice in one
  // statement ("ON CONFLICT DO UPDATE command cannot affect row a second
  // time"). We hit this in practice because a single discovery pass can
  // surface the same stream via multiple recipients (NFT transfers, joint
  // owners) or via overlapping where-clauses. Keep the LAST occurrence —
  // later fetches tend to have the freshest mutable fields.
  const byId = new Map<string, VestingStream>();
  for (const s of streams) byId.set(s.id, s);
  const unique = Array.from(byId.values());

  try {
    const now = new Date();
    const rows = unique.map((s) => ({
      streamId:        s.id,
      recipient:       s.recipient.toLowerCase(),
      chainId:         s.chainId,
      protocol:        s.protocol,
      tokenAddress:    s.tokenAddress ?? null,
      tokenSymbol:     s.tokenSymbol ?? null,
      isFullyVested:   s.isFullyVested,
      endTime:         s.endTime ?? null,
      streamData:      s as unknown as Record<string, unknown>,
      firstSeenAt:     now,
      lastRefreshedAt: now,
    }));

    // Batch upsert — on conflict update mutable fields only
    await db
      .insert(vestingStreamsCache)
      .values(rows)
      .onConflictDoUpdate({
        target: vestingStreamsCache.streamId,
        set: {
          isFullyVested:   sql`excluded.is_fully_vested`,
          streamData:      sql`excluded.stream_data`,
          lastRefreshedAt: sql`excluded.last_refreshed_at`,
        },
      });
    return unique.length;
  } catch (err) {
    // Never block the API response — log and continue
    console.error("[vesting-cache] write failed:", err);
    return 0;
  }
}

// ─── Stats (for future admin / data layer endpoints) ──────────────────────────

/** Returns the total number of indexed streams in the cache */
export async function getCacheStats(): Promise<{ totalStreams: number; uniqueWallets: number }> {
  const result = await db.execute(
    sql`SELECT COUNT(*) as total_streams, COUNT(DISTINCT recipient) as unique_wallets
        FROM vesting_streams_cache`
  );
  const row = result[0] as { total_streams: string; unique_wallets: string };
  return {
    totalStreams:   parseInt(row.total_streams,  10),
    uniqueWallets: parseInt(row.unique_wallets, 10),
  };
}
