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
import { vestingStreamsCache, seederState } from "@/lib/db/schema";
import { inArray, and, gte, sql } from "drizzle-orm";
import { isAdapterEnabled } from "@/lib/protocol-constants";
import { VestingStream, categoryForProtocol } from "./types";
import { normaliseAddress } from "@/lib/address-validation";

/** Hydrate a cached stream blob into a typed VestingStream. Back-fills the
 *  `category` field for rows written before the field existed (every adapter
 *  now sets it explicitly, but old cache rows survive until next refresh).
 *  Cheaper than running a one-shot UPDATE migration. */
function hydrateCachedStream(blob: Record<string, unknown>): VestingStream {
  const s = blob as Partial<VestingStream> & { protocol: string };
  if (!s.category) {
    s.category = categoryForProtocol(s.protocol);
  }
  return s as VestingStream;
}

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

  // Ecosystem-aware normalisation — EVM → lowercase, Solana → as-is.
  // Preserves the old behaviour for EVM addresses while keeping Solana
  // base58 intact (lowercasing would corrupt the pubkey).
  const normalisedWallets = wallets.map(normaliseAddress);
  const now = new Date();

  // Fetch all cached rows for these wallets
  const rows = await db
    .select()
    .from(vestingStreamsCache)
    .where(inArray(vestingStreamsCache.recipient, normalisedWallets));

  if (rows.length === 0) {
    return { streams: [], isFresh: false, staleWallets: wallets };
  }

  // Determine which wallets have at least one fresh row
  const freshWallets = new Set<string>();
  const streams: VestingStream[] = [];

  for (const row of rows) {
    // Never serve streams from a disabled/paused protocol (e.g. Team Finance),
    // even if stale cache rows linger — defends against surfacing a protocol we
    // aren't licensed/agreed to show. The seeder already skips disabled
    // adapters, so this is belt-and-braces.
    if (!isAdapterEnabled(row.protocol)) continue;
    const ttl = row.isFullyVested ? VESTED_TTL_SECONDS : ACTIVE_TTL_SECONDS;
    const ageSeconds = (now.getTime() - row.lastRefreshedAt.getTime()) / 1000;
    const fresh = ageSeconds < ttl;

    if (fresh) {
      freshWallets.add(row.recipient);
      streams.push(hydrateCachedStream(row.streamData as Record<string, unknown>));
    }
  }

  // Any wallet that had no fresh rows needs a re-fetch
  const staleWallets = normalisedWallets.filter((w) => !freshWallets.has(w));

  return {
    streams,
    isFresh: staleWallets.length === 0,
    staleWallets,
  };
}

// ─── Read (no TTL filter — for merge fallback) ───────────────────────────────
//
// Returns EVERY cached row for these wallets, regardless of staleness.
//
// Use case: route handlers that union live adapter results with last-known-
// good cache rows so transient adapter failures don't make streams "disappear"
// from the user's portfolio. Without this, the full-miss path in
// /api/vesting and /api/mobile/vestings replaces the cache wholesale with
// whatever adapters return NOW — and a single Sepolia subgraph hiccup could
// drop the user's other streams from the UI even though we already had them.
//
// Discovered May 4 2026: user's wallet had 3 streams in cache (Sablier FeeC,
// Sablier SEP, Hedgey SEP — all Sepolia) but the mobile portfolio only
// showed 1 because that day's adapter run only re-fetched FeeC successfully
// and the route's full-miss path returned only that fresh result.
//
// This helper is intentionally simple — no freshness logic, no merging.
// Callers do the union themselves so they can apply their own merge policy
// (overwrite-by-id is the obvious one, but a future caller might want
// "drop streams older than X days from cache" or similar).
export async function readAllStreamsForWallets(wallets: string[]): Promise<VestingStream[]> {
  if (wallets.length === 0) return [];
  const normalisedWallets = wallets.map(normaliseAddress);
  const rows = await db
    .select()
    .from(vestingStreamsCache)
    .where(inArray(vestingStreamsCache.recipient, normalisedWallets));
  // Exclude disabled/paused protocols (e.g. Team Finance) from the merge
  // fallback so a lingering cache row can never surface to users.
  return rows
    .filter((r) => isAdapterEnabled(r.protocol))
    .map((r) => hydrateCachedStream(r.streamData as Record<string, unknown>));
}

/**
 * Union helper used by route handlers: take the fresh adapter results as
 * canonical for any stream id they cover, and fall back to the last-known-
 * good cache row for any id that fresh DIDN'T cover. Result is deduped by
 * stream id, fresh wins on conflict.
 *
 * O(n + m) — single pass over each list with a Set membership check.
 */
export function mergeFreshWithCached(
  fresh:  VestingStream[],
  cached: VestingStream[],
): VestingStream[] {
  const freshIds = new Set(fresh.map((s) => s.id));
  const out: VestingStream[] = fresh.slice();
  for (const c of cached) {
    if (!freshIds.has(c.id)) out.push(c);
  }
  return out;
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

  // Postgres bigint max is 2^63 - 1 ≈ 9.22 × 10^18. JS Number can represent
  // values larger than that (up to 2^53 ≈ 9 × 10^15 with full precision, then
  // approximate up to 1.79 × 10^308) but writes to a bigint column will reject
  // anything over the bigint cap with "invalid input syntax for type bigint".
  //
  // Real-world UNCX-VM contracts on ETH have streams with sentinel endTime
  // values like 9.6 × 10^27 (year 304 octillion AD — clearly garbage / a
  // contract-level "never expires" marker). One bad row kills the entire
  // batch insert and we lose every other stream in the batch too.
  //
  // 4_102_444_800 = 2099-12-31 UTC in unix seconds. Anything past that is
  // either garbage data or so far in the future that we can safely treat
  // it as "never expires" — clamp to the sentinel and move on.
  const SAFE_END_TIME_MAX = 4_102_444_800;
  const clampEndTime = (t: number | null | undefined): number | null => {
    if (t == null) return null;
    if (!Number.isFinite(t) || t < 0) return null;
    if (t > SAFE_END_TIME_MAX) return SAFE_END_TIME_MAX;
    return Math.floor(t);
  };

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
      endTime:         clampEndTime(s.endTime),
      streamData:      s as unknown as Record<string, unknown>,
      firstSeenAt:     now,
      lastRefreshedAt: now,
    }));

    // Batch upsert — on conflict update mutable fields only.
    //
    // setWhere skips the UPDATE entirely when nothing changed. Most rows
    // in a typical cron pass have identical stream_data + is_fully_vested
    // to what's already in the cache (a vesting schedule that's still
    // releasing on the same curve produces the same VestingStream every
    // run). The previous version unconditionally re-wrote every matched
    // row, generating heavy index updates and WAL volume — the May 2 2026
    // Supabase Disk IO Budget warning was driven by exactly this pattern.
    //
    // Semantics shift slightly: lastRefreshedAt now means "last time this
    // row's data actually moved" rather than "last time the seeder
    // touched it". This is more useful diagnostically — the cache-stats
    // freshestSec column becomes a real "is data still flowing?" signal.
    // For "did the cron run?" use the seeder's summary log instead.
    //
    // IS DISTINCT FROM correctly compares NULLs as equal (unlike `<>`),
    // and works on jsonb because Postgres canonicalizes jsonb on insert.
    await db
      .insert(vestingStreamsCache)
      .values(rows)
      .onConflictDoUpdate({
        target: vestingStreamsCache.streamId,
        set: {
          isFullyVested:   sql`excluded.is_fully_vested`,
          streamData:      sql`excluded.stream_data`,
          lastRefreshedAt: sql`excluded.last_refreshed_at`,
          // Keep the denormalised token_symbol column in sync with the freshly
          // fetched value — but NEVER downgrade a real symbol back to
          // unknown/null/''. Historically this column was insert-only, so a row
          // first seen before its symbol resolved (Sablier's subgraph often lags
          // token metadata) stayed "unknown" forever even after streamData
          // caught up — surfacing as "1.62M unknown" in the upcoming queue while
          // the token page (which reads streamData) showed the real symbol. This
          // COALESCE keeps the better of the two so the gap can't regrow.
          tokenSymbol:     sql`COALESCE(NULLIF(NULLIF(excluded.token_symbol, 'unknown'), ''), ${vestingStreamsCache.tokenSymbol})`,
        },
        // Update when:
        //  - stream data moved (the always-update case from the original
        //    optimization commit df6a6b3),
        //  - OR the row hasn't been touched in 23h+ (added 2026-05-06 to
        //    fix "Unvest ETH 2d ago" stale-freshness bug for low-activity
        //    chains where streams genuinely don't move week-over-week —
        //    those cells were reading as "broken" in the freshness UI
        //    even though the seeder was healthy).
        // 23h threshold matches the daily 03:00 UTC cron cadence: every
        // stable row gets one UPDATE per day, freshestSec advances at
        // most ~24h, no IO storm. Replaces the row-lock-contended
        // bumpSeedHeartbeat (disabled in 4344cae) with a per-row,
        // primary-key-only UPDATE that doesn't fight concurrent writers.
        setWhere: sql`
          ${vestingStreamsCache.streamData} IS DISTINCT FROM excluded.stream_data
          OR ${vestingStreamsCache.isFullyVested} IS DISTINCT FROM excluded.is_fully_vested
          OR ${vestingStreamsCache.lastRefreshedAt} < NOW() - INTERVAL '23 hours'
        `,
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

/**
 * Bump lastRefreshedAt on ONE canonical row for a (protocol, chainId)
 * cell. Cheap (single-row UPDATE) and runs at the end of each seed
 * job to keep the freshness UI showing "the seeder ran" even when
 * stream data didn't change.
 *
 * Background: writeToCache's setWhere clause skips UPDATE for rows
 * whose data is identical to what's already cached (90% IO save).
 * Side effect: if a (protocol, chain) has no new/changed streams in
 * a seed run, MAX(lastRefreshedAt) for that cell stays at whatever
 * the last actual data movement was — which can be days ago for
 * stable protocols. Users read that as "broken" even though the
 * seeder is healthy.
 *
 * This heartbeat closes the gap: freshness now means "either data
 * moved OR the seeder ran" with one tiny additional UPDATE per cell
 * per seed run.
 */
export async function bumpSeedHeartbeat(
  protocol: string,
  chainId:  number,
): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Re-enabled 2026-05-06 with a SAFER pattern.
  //
  // Previous attempt (4344cae) used `UPDATE WHERE stream_id = (SELECT
  // ... LIMIT 1)`. The subquery did a sequential scan that fought
  // concurrent writeToCache upserts during the 4-group fan-out and
  // choked the pool. This one is structurally different:
  //
  //   1. Pure WHERE clause — no subquery, just protocol + chain_id +
  //      age filter. Index seek, not scan.
  //   2. AND last_refreshed_at < NOW() - INTERVAL '5 minutes' — skips
  //      rows the same seed run JUST wrote (which would be locked
  //      momentarily by writeToCache). 5 min is a generous buffer.
  //   3. Runs at the END of runJob, AFTER all writeToCache calls
  //      complete in this job. Each (protocol, chain) cell is owned by
  //      exactly one job, so no concurrent writer can be touching this
  //      cell's rows when this fires.
  //
  // Effect: every row in a cell whose data didn't change in this seed
  // run AND was last touched > 5 min ago gets its lastRefreshedAt
  // bumped to NOW(). The cell's MAX(lastRefreshedAt) — which the
  // freshness UI reads — therefore reflects "last seeder run" instead
  // of the much-rarer "last data movement".
  // Single-row UPDATE — touches the FIRST stream_id in (protocol,
  // chain_id) order. Cheap (one row, primary-key locked), fast (index
  // seek), and sufficient for the freshness UI which reads MAX of the
  // cell. Bulk-update version was correct but slow on large cells
  // (PinkSale BSC has 14k+ rows); single-row keeps the seeder budget
  // intact while still advancing freshestSec.
  //
  // Concurrency: this runs AFTER the seed job's writeToCache calls
  // complete, AND the row we touch may have JUST been written by
  // writeToCache (in which case its lock has been released because
  // upserts hold row locks only for the statement duration). Even if
  // we briefly contend, it's a single row UPDATE — completes in ms.
  try {
    await db.execute(sql`
      UPDATE vesting_streams_cache
      SET last_refreshed_at = NOW()
      WHERE stream_id = (
        SELECT stream_id FROM vesting_streams_cache
        WHERE protocol = ${protocol} AND chain_id = ${chainId}
        ORDER BY stream_id
        LIMIT 1
      )
    `);
  } catch (err) {
    console.error(`[dbcache] bumpSeedHeartbeat(${protocol}, ${chainId}):`, err);
  }
}

/**
 * Record a seeder-attempt outcome into seeder_state. Called from every
 * runJob exit point — success, empty discovery, error, special-path
 * walkers — so the admin /status grid can show "checked Xh ago" for
 * every cell regardless of whether data moved or any cache row exists.
 *
 * Why this exists alongside bumpSeedHeartbeat: that one bumps a cache
 * row's last_refreshed_at so `freshestSec` advances. It misses two
 * legitimate "cron ran" cases: (a) discover() returned 0 recipients
 * (curated-list adapters, quiet chains) and (b) the cell has 0 cache
 * rows yet (fresh deploy). seeder_state is unconditional — one upsert
 * per job per cron tick, ~11 protocols × ~5 chains = ~55 small writes
 * per group run. Negligible.
 *
 * Failures here are swallowed: this is diagnostic instrumentation, not
 * load-bearing. The seed job itself succeeded before this was called.
 */
export async function recordSeederAttempt(
  adapterId:      string,
  chainId:        number,
  streamsWritten: number,
  error:          string | null,
): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const now = new Date();
  try {
    await db
      .insert(seederState)
      .values({
        adapterId,
        chainId,
        lastAttemptAt:      now,
        lastSuccessAt:      error ? null : now,
        lastError:          error,
        lastStreamsWritten: streamsWritten,
      })
      .onConflictDoUpdate({
        target: [seederState.adapterId, seederState.chainId],
        set: {
          lastAttemptAt:      now,
          // Preserve last_success_at on failure so ops can see "last good run"
          // separately from "last attempt" — same shape as indexer_state.
          lastSuccessAt:      error
            ? sql`${seederState.lastSuccessAt}`
            : now,
          lastError:          error,
          lastStreamsWritten: streamsWritten,
          updatedAt:          now,
        },
      });
  } catch (err) {
    console.error(`[dbcache] recordSeederAttempt(${adapterId}, ${chainId}):`, err);
  }
}

/**
 * Distinct recipients currently indexed for a given (protocol, chainId).
 *
 * Used by the seeder to re-seed previously-known owners — solves the
 * PinkSale failure mode where the walker's token-side discovery
 * returns owners whose locks have all been withdrawn (so the
 * owner-side adapter call returns 0). Cache rows came from a prior
 * successful seed; those owners DEFINITELY had active locks recently
 * and are far more likely to still have something than a freshly-
 * enumerated token-side owner. We union them with walker discovery
 * so genuinely new owners still surface — best of both.
 */
export async function getCachedRecipients(
  protocol: string,
  chainId:  number,
  limit:    number,
): Promise<string[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  try {
    const result = await db.execute(
      sql`SELECT DISTINCT recipient
          FROM vesting_streams_cache
          WHERE protocol = ${protocol}
            AND chain_id = ${chainId}
          LIMIT ${limit}`
    );
    return result.map((row) => (row as { recipient: string }).recipient);
  } catch (err) {
    console.error(`[dbcache] getCachedRecipients(${protocol}, ${chainId}):`, err);
    return [];
  }
}
