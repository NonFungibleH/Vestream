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

  // ── 2026-05-13 rewrite: hard-timeout, no retries ───────────────────────────
  //
  // The previous resilience pass wrapped this in retryOnce + Promise.race +
  // try/catch. Combined latency on a slow pool: 1.5s wait + 2× query time +
  // 5s GROUP BY timeout = potentially 30+ seconds. The page was hitting
  // Cloudflare's ~100s gateway timeout, returning 504. Worse than the
  // original "throw and let Redis fallback render last-known-good".
  //
  // This version: race each call against a hard timeout. Worst case for
  // both paths combined: 3s. Page renders in 3s max with `[]` if pool is
  // sick. loadStatusData's Promise.all isn't poisoned because we resolve
  // (never reject) on timeout.
  const fastPromise = db
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
    .orderBy(asc(statusSummary.protocol), asc(statusSummary.chainId))
    .then((rows): CacheStatsCell[] => rows.map((r) => ({
      protocol:        r.protocol,
      chainId:         r.chainId,
      streams:         r.streams,
      active:          r.active,
      withTokenSymbol: r.withTokenSymbol,
      distinctTokens:  r.distinctTokens,
      freshestSec:     r.freshestSec,
      oldestSec:       r.oldestSec,
    })))
    .catch((err): CacheStatsCell[] | null => {
      console.warn(
        `[cache-stats] status_summary fast path failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    });

  // 15s (was 6s, was 2s). The status_summary read is a ~48-row indexed SELECT
  // — a few ms warm — but /status is low-traffic (operator page, noindex), so
  // its serverless lambda is usually COLD and the cold Supabase pooler
  // connection setup can spike past several seconds. The 6s budget STILL lost
  // that race consistently → [] → every cell rendered "Pending" even though the
  // table was full, AND that empty payload got committed to the 10-min
  // unstable_cache (and re-committed by every cold background revalidation), so
  // the page stayed all-Pending indefinitely. Verified 2026-06-30: once the
  // connection is warm the query returns full data instantly — it is purely the
  // cold-connect losing the timeout race. 15s gives even a slow cold connection
  // room to complete while staying under maxDuration=30; unstable_cache shields
  // users from the latency (only the cold render / background revalidate pays
  // it). A real data render then populates the durable last-good below.
  const fast = await Promise.race([
    fastPromise,
    new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn("[cache-stats] status_summary fast path exceeded 15s, giving up");
        resolve(null);
      }, 15000),
    ),
  ]);

  if (fast && fast.length > 0) return fast;

  // ── Bootstrap fallback: legacy GROUP BY ──
  // Reached only when fast path returned null/empty. Hard 2s budget so the
  // overall function can never block the page beyond ~4s total.
  const slow = await Promise.race([
    computeCacheStatsCellsFromCache().catch((err) => {
      console.warn(
        `[cache-stats] GROUP BY fallback failed: ${err instanceof Error ? err.message : err}`,
      );
      return [] as CacheStatsCell[];
    }),
    new Promise<CacheStatsCell[]>((resolve) =>
      setTimeout(() => {
        console.warn("[cache-stats] GROUP BY fallback exceeded 2s, returning empty");
        resolve([]);
      }, 2000),
    ),
  ]);

  return slow;
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
// "Active" filter — must match `refreshProtocolSummaries()` in protocol-stats.ts
// EXACTLY so /status and /protocols agree on what "active" means.
//
// Definition (per the May 6 2026 + May 10 2026 unification): a stream is
// active if the recipient still has unclaimed tokens, i.e.
//   withdrawnAmount < totalAmount
// or, when withdrawnAmount is missing from streamData (legacy cache rows
// pre-2025), fall back to !is_fully_vested.
//
// Why not the simpler `is_fully_vested = false`: that filter is time-only —
// once endTime passes, the row drops out of "active" even if every token
// is still sitting in the contract waiting to be withdrawn. Jupiter Lock
// (token-launchpad-style 1-day locks) under-counted active by >90% under
// that filter because most locks are time-expired but tokens-still-held.
//
// Net effect for the user: "active streams" on /status now matches "active
// streams" on the /protocols TVL bar. Both surfaces show the same set of
// streams that have non-zero claimable balance for some recipient.
const activeStreamFilter = sql`count(*) filter (
  where (
    (${vestingStreamsCache.streamData}->>'withdrawnAmount') is not null
    and (${vestingStreamsCache.streamData}->>'totalAmount')   is not null
    and (${vestingStreamsCache.streamData}->>'withdrawnAmount')::numeric
      < (${vestingStreamsCache.streamData}->>'totalAmount')::numeric
  )
  or (
    (${vestingStreamsCache.streamData}->>'withdrawnAmount') is null
    and ${vestingStreamsCache.isFullyVested} = false
  )
)::int`;

async function computeCacheStatsCellsFromCache(): Promise<CacheStatsCell[]> {
  const rows = await db
    .select({
      protocol:        vestingStreamsCache.protocol,
      chainId:         vestingStreamsCache.chainId,
      streams:         sql<number>`count(*)::int`,
      active:          sql<number>`${activeStreamFilter}`,
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
 * Resilience (added 2026-05-10): the GROUP BY full-scans
 * vesting_streams_cache (155k+ rows) which intermittently times out on
 * the Supabase transaction pooler — exactly the failure mode that left
 * the rollup stuck at 4d-stale despite the seeder writing successfully.
 * We now retry the GROUP BY up to 3 times (linear backoff: 1s, 3s) and
 * use a per-protocol chunked computation as the second-attempt fallback,
 * so a single dropped connection no longer kills the rollup-refresh.
 *
 * Build-time guard: short-circuits during `next build` so a transient
 * pooler drop mid-build doesn't kill the build.
 */
export async function refreshStatusSummary(): Promise<{ rows: number }> {
  if (process.env.NEXT_PHASE === "phase-production-build") return { rows: 0 };

  // Try the single-shot GROUP BY first (fastest, ~1s on a healthy pooler).
  // On failure, fall through to a per-protocol chunked walk which makes
  // many small queries — each one is below the pooler's idle-cancel
  // threshold so transient drops only cost us one chunk's retry.
  let cells: CacheStatsCell[];
  try {
    cells = await retryOnce(() => computeCacheStatsCellsFromCache(), "groupBy");
  } catch (err) {
    console.warn(
      `[cache-stats] full GROUP BY failed twice; falling back to chunked walk: ${err instanceof Error ? err.message : err}`,
    );
    cells = await computeCacheStatsCellsChunked();
  }
  if (cells.length === 0) return { rows: 0 };

  const now = new Date();
  // Single multi-row upsert is much faster than per-row inserts on a
  // PgBouncer-pooled connection. ON CONFLICT (protocol, chain_id) keeps
  // the table at exactly one row per cell — never grows beyond ~60.
  await retryOnce(
    () =>
      db
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
        }),
    "upsert",
  );

  return { rows: cells.length };
}

/**
 * Retry once after a 1.5s pause. Used for ops-critical short queries
 * that are vulnerable to transient PgBouncer connection drops — one
 * retry catches the typical "pool just rotated my idle connection"
 * race without making us look like a buggy retry-storm to ops.
 */
async function retryOnce<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[cache-stats] ${label} attempt 1 failed, retrying in 1.5s: ${err instanceof Error ? err.message : err}`);
    await new Promise((r) => setTimeout(r, 1500));
    return await fn();
  }
}

/**
 * Per-protocol chunked variant of computeCacheStatsCellsFromCache.
 *
 * Used as the resilient fallback when the single big GROUP BY fails
 * twice. Each query targets one protocol — Postgres can satisfy these
 * via the `(protocol, chain_id)` index without scanning the whole
 * 155k-row table, so a transient pooler hiccup costs us at most one
 * protocol's chunk (which we then retry once). Slower in aggregate
 * (~5x — many round trips) but doesn't fail catastrophically.
 *
 * Important: this MUST yield the same shape and ordering rules as
 * computeCacheStatsCellsFromCache so /status renders identically
 * regardless of which path produced the data.
 */
async function computeCacheStatsCellsChunked(): Promise<CacheStatsCell[]> {
  // Single small query to find which protocols actually have rows.
  // Cheap (DISTINCT on an indexed column) and bounds the per-protocol
  // loop to "real" protocols only.
  const protocolRows = await retryOnce(
    () =>
      db
        .selectDistinct({ protocol: vestingStreamsCache.protocol })
        .from(vestingStreamsCache),
    "distinct-protocols",
  );

  const out: CacheStatsCell[] = [];
  for (const { protocol } of protocolRows) {
    const rows = await retryOnce(
      () =>
        db
          .select({
            protocol:        vestingStreamsCache.protocol,
            chainId:         vestingStreamsCache.chainId,
            streams:         sql<number>`count(*)::int`,
            // Same activeStreamFilter as the single-shot path — see definition above.
            active:          sql<number>`${activeStreamFilter}`,
            withTokenSymbol: sql<number>`count(*) filter (where ${vestingStreamsCache.tokenSymbol} is not null)::int`,
            distinctTokens:  sql<number>`count(distinct ${vestingStreamsCache.tokenAddress})::int`,
            freshestSec:     sql<number | null>`extract(epoch from max(${vestingStreamsCache.lastRefreshedAt}))::int`,
            oldestSec:       sql<number | null>`extract(epoch from min(${vestingStreamsCache.firstSeenAt}))::int`,
          })
          .from(vestingStreamsCache)
          .where(sql`${vestingStreamsCache.protocol} = ${protocol}`)
          .groupBy(vestingStreamsCache.protocol, vestingStreamsCache.chainId)
          .orderBy(vestingStreamsCache.chainId),
      `chunk(${protocol})`,
    );

    for (const r of rows) {
      out.push({
        protocol:        r.protocol,
        chainId:         r.chainId,
        streams:         r.streams         ?? 0,
        active:          r.active          ?? 0,
        withTokenSymbol: r.withTokenSymbol ?? 0,
        distinctTokens:  r.distinctTokens  ?? 0,
        freshestSec:     r.freshestSec ?? null,
        oldestSec:       r.oldestSec   ?? null,
      });
    }
  }
  // Match the ordering of the single-query path so callers can't tell
  // these two implementations apart.
  out.sort((a, b) =>
    a.protocol === b.protocol ? a.chainId - b.chainId : a.protocol < b.protocol ? -1 : 1,
  );
  return out;
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

  // 2026-05-13: replaced retryOnce with a hard 2s timeout. Same reasoning
  // as getCacheStatsCells above — retries on a slow pool push past Cloudflare's
  // ~100s ceiling; better to fail fast and let the hero render
  // "freshness unavailable" than to hang the entire page.
  const queryPromise = db
    .select({
      maxSec: sql<number | null>`extract(epoch from max(${vestingStreamsCache.lastRefreshedAt}))::int`,
    })
    .from(vestingStreamsCache)
    .then((rows): number | null => rows[0]?.maxSec ?? null)
    .catch((err): number | null => {
      console.warn(
        `[cache-stats] getMaxLastRefreshedAt failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    });

  return Promise.race([
    queryPromise,
    new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn("[cache-stats] getMaxLastRefreshedAt exceeded 2s, returning null");
        resolve(null);
      }, 2000),
    ),
  ]);
}

// ── Derived-table freshness (pipeline monitor) ───────────────────────────────
//
// The per-cell matrix above tracks vesting_streams_cache. But the AGGREGATE
// surfaces (Vesting Explorer's Upcoming tab, /protocols stats + TVL, the /status
// grid itself) read from DERIVED tables refreshed by SEPARATE crons. A frozen
// cron there is invisible to the cache matrix — exactly how token_vesting_rollups
// sat dead for 11 days (2026-06-21 → 07-02) and the Explorer showed nothing for
// Team Finance while everything else looked healthy. This surfaces each derived
// table's age so a freeze is caught immediately — rendered on /status and exposed
// in /api/admin/cache-stats JSON (poll it from an uptime monitor to page on it).

export interface PipelineFreshnessEntry {
  key:           string;        // machine key (table name)
  label:         string;        // human label
  computedAtSec: number | null; // last refresh, unix seconds (null = never)
  ageHours:      number | null; // hours since last refresh (null = never)
  maxAgeHours:   number;        // expected max before it counts as stale
  stale:         boolean;       // ageHours == null || ageHours > maxAgeHours
}

export async function getPipelineFreshness(): Promise<PipelineFreshnessEntry[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];

  // Thresholds allow for one missed cron run + buffer. rollups/summaries/status
  // refresh every 12h → stale past 26h; tvl-snapshots run daily → stale past 30h.
  const SPECS = [
    { key: "token_vesting_rollups",  label: "Explorer rollups", maxAgeHours: 26 },
    { key: "protocol_summaries",     label: "Protocol stats",   maxAgeHours: 26 },
    { key: "status_summary",         label: "Status matrix",    maxAgeHours: 26 },
    { key: "protocol_tvl_snapshots", label: "TVL snapshots",    maxAgeHours: 30 },
  ] as const;

  try {
    // BOUNDED AT SOURCE (2026-09-12). This was the only read in this file
    // without its own timeout. /status got away with it by wrapping the call
    // in a 3s race of its own; /api/admin/cache-stats did not, and its
    // Promise.all([getCacheStatsCells(), getPipelineFreshness()]) therefore
    // never settled — 120s with no response at all, while /status rendered
    // fine. Per-caller bounding is how that asymmetry happens, so the bound
    // belongs here. Four max() reads over small tables take ~150ms; 5s is
    // generous, and an empty array renders freshness as "unknown" rather
    // than hanging the caller.
    const rows = (await Promise.race([
      db.execute(sql`
      SELECT
        extract(epoch from (SELECT max(computed_at)     FROM token_vesting_rollups))::bigint  AS rollups,
        extract(epoch from (SELECT max(computed_at)     FROM protocol_summaries))::bigint      AS summaries,
        extract(epoch from (SELECT max(computed_at)     FROM status_summary))::bigint          AS status,
        extract(epoch from (SELECT max(last_attempt_at) FROM protocol_tvl_snapshots))::bigint  AS tvl
      `),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getPipelineFreshness exceeded 5s")), 5_000),
      ),
    ])) as unknown as Array<{ rollups: number | null; summaries: number | null; status: number | null; tvl: number | null }>;

    const r = rows[0] ?? { rollups: null, summaries: null, status: null, tvl: null };
    const secByKey: Record<string, number | null> = {
      token_vesting_rollups:  r.rollups   != null ? Number(r.rollups)   : null,
      protocol_summaries:     r.summaries != null ? Number(r.summaries) : null,
      status_summary:         r.status    != null ? Number(r.status)    : null,
      protocol_tvl_snapshots: r.tvl       != null ? Number(r.tvl)       : null,
    };

    const nowSec = Math.floor(Date.now() / 1000);
    return SPECS.map((s) => {
      const sec = secByKey[s.key];
      const ageHours = sec != null ? Math.max(0, (nowSec - sec) / 3600) : null;
      return {
        key:           s.key,
        label:         s.label,
        computedAtSec: sec,
        ageHours:      ageHours != null ? Math.round(ageHours * 10) / 10 : null,
        maxAgeHours:   s.maxAgeHours,
        stale:         ageHours == null || ageHours > s.maxAgeHours,
      };
    });
  } catch (err) {
    console.warn(`[cache-stats] getPipelineFreshness failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ─── Silent-failure alarms ───────────────────────────────────────────────────
// getPipelineFreshness() above answers "did the pipeline run?" by reading
// max(computed_at) per TABLE. That is exactly the blind spot that let three
// real failures run for months undetected (found 2026-09-09):
//
//   - uncx-vm's TVL walker returned $0 on all three chains for an unknown
//     period. consecutive_failures stayed 0 and last_error stayed null,
//     because returning nothing is not an error. Table freshness looked fine.
//   - The hedgey BSC indexer last succeeded 102 days earlier, failing every
//     day on an RPC block-range cap. Its row was still being touched daily,
//     so nothing downstream noticed the cursor had stopped moving.
//   - Five protocols sat on guard-held TVL snapshots up to 158 hours old
//     while max(last_attempt_at) across the table stayed current.
//
// The common shape: an aggregate looks healthy while individual rows are
// frozen. These checks are per-row and deliberately loud.
// ─────────────────────────────────────────────────────────────────────────────

export type AlarmKind = "indexer-stalled" | "snapshot-failing" | "walker-zero";

export interface PipelineAlarm {
  kind:    AlarmKind;
  /** e.g. "hedgey/56" — protocol, plus chain where the failure is per-chain. */
  subject: string;
  /** One line, already human-readable; safe to render directly. */
  detail:  string;
}

/** Hours a cursor may sit still before it counts as stalled (one missed daily
 *  cron plus buffer). */
const INDEXER_STALL_HOURS = 26;

/**
 * Per-row failures the table-level freshness checks cannot see. Never throws;
 * an empty array means "no alarms" OR "could not check", and the caller
 * should not treat emptiness as proof of health.
 */
export async function getPipelineAlarms(): Promise<PipelineAlarm[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const alarms: PipelineAlarm[] = [];

  try {
    // 1. Cursors that have stopped advancing. last_run_at only moves on a
    //    SUCCESSFUL scan, so this catches a job that retries and fails daily.
    const stalled = (await db.execute(sql`
      SELECT protocol, chain_id,
             round(extract(epoch from (now() - last_run_at)) / 3600)::int AS hours
        FROM indexer_state
       WHERE last_run_at < now() - (${INDEXER_STALL_HOURS} * interval '1 hour')
       ORDER BY last_run_at ASC
    `)) as unknown as Array<{ protocol: string; chain_id: number; hours: number }>;
    for (const r of rowsOfResult<{ protocol: string; chain_id: number; hours: number }>(stalled)) {
      alarms.push({
        kind:    "indexer-stalled",
        subject: `${r.protocol}/${r.chain_id}`,
        detail:  `indexer cursor has not advanced for ${r.hours}h`,
      });
    }

    // 2. TVL snapshots the guard is holding. consecutive_failures > 0 means
    //    the walker ran and its result was rejected, so the displayed number
    //    is older than it looks.
    const failing = (await db.execute(sql`
      SELECT protocol, chain_id, consecutive_failures AS fails,
             round(extract(epoch from (now() - computed_at)) / 3600)::int AS hours
        FROM protocol_tvl_snapshots
       WHERE consecutive_failures > 0
       ORDER BY consecutive_failures DESC
    `)) as unknown as Array<{ protocol: string; chain_id: number; fails: number; hours: number }>;
    for (const r of rowsOfResult<{ protocol: string; chain_id: number; fails: number; hours: number }>(failing)) {
      alarms.push({
        kind:    "snapshot-failing",
        subject: `${r.protocol}/${r.chain_id}`,
        detail:  `TVL snapshot rejected ${r.fails}x in a row; showing a figure ${r.hours}h old`,
      });
    }

    // 3. Walkers reporting nothing for a protocol that demonstrably has
    //    streams. This is the uncx-vm case: a $0 snapshot written with no
    //    error while thousands of schedules sat in the cache.
    //
    //    Restricted to methodologies where WE walk the chain. Protocols on
    //    'defillama-vesting' (hedgey, llamapay, streamflow) take their TVL
    //    from DefiLlama and legitimately record stream_count = 0, so without
    //    this filter they fire on every chain, every run — and an alarm that
    //    cries wolf is one nobody reads.
    const zeroed = (await db.execute(sql`
      SELECT s.protocol, s.chain_id, count(v.stream_id)::int AS cached
        FROM protocol_tvl_snapshots s
        JOIN vesting_streams_cache v
          ON v.protocol = s.protocol AND v.chain_id = s.chain_id
       WHERE s.stream_count = 0
         AND s.methodology <> 'defillama-vesting'
         AND v.is_fully_vested = false
       GROUP BY s.protocol, s.chain_id
      HAVING count(v.stream_id) > 0
    `)) as unknown as Array<{ protocol: string; chain_id: number; cached: number }>;
    for (const r of rowsOfResult<{ protocol: string; chain_id: number; cached: number }>(zeroed)) {
      alarms.push({
        kind:    "walker-zero",
        subject: `${r.protocol}/${r.chain_id}`,
        detail:  `walker found 0 streams but ${r.cached} active rows are cached`,
      });
    }
  } catch (err) {
    console.warn(`[cache-stats] getPipelineAlarms failed: ${err instanceof Error ? err.message : err}`);
  }

  return alarms;
}

/** postgres-js returns rows directly; drizzle's execute wraps them in .rows. */
function rowsOfResult<T>(r: unknown): T[] {
  return ((r as { rows?: T[] }).rows ?? (r as T[])) || [];
}
