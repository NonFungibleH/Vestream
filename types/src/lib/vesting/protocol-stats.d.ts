export interface ProtocolStats {
    /** Total streams of this protocol currently indexed, active + fully vested. */
    totalStreams: number;
    /** Indexed streams still releasing — i.e. `isFullyVested = false` and not
     *  past their end (live scope). Reconciles with the calendar's "upcoming". */
    activeStreams: number;
    /** Fully vested but not fully withdrawn — streams sitting claimable-but-
     *  unclaimed. The honest "N still have tokens to collect" signal. */
    unclaimedStreams: number;
    /** Distinct chain IDs this protocol is indexed on (sorted asc). */
    chainIds: number[];
    /** Distinct ERC-20 token contract addresses seen for this protocol. */
    tokensTracked: number;
    /** Distinct recipient wallets across all streams for this protocol —
     *  mirrors the `Recipients` stat shown on /token/[chainId]/[address] so a
     *  visitor on the protocol page can see at a glance whether the protocol's
     *  vesting is concentrated to a few wallets or spread across many. */
    recipientCount: number;
    /** Most recent cache-refresh timestamp across all streams for this protocol.
     *  Typed as `Date | string | null` because Next.js's `unstable_cache` JSON-
     *  roundtrips Date instances into ISO strings on rehydration — every
     *  consumer of this field MUST be defensive. The relativeFreshness /
     *  relativeTimeSince helpers in this file already handle both shapes via
     *  `toDateSafe`. */
    lastIndexedAt: Date | string | null;
}
export interface UnlockSummary {
    streamId: string;
    protocol: string;
    chainId: number;
    tokenSymbol: string | null;
    /** Lowercase ERC-20 contract address — used to deep-link to /token/[chainId]/[address]. */
    tokenAddress: string;
    /** ERC-20 decimals for the token. Needed by formatters to scale the raw
     *  bigint amount down to the human unit. Without it, formatters default
     *  to 18 and USDC (decimals=6) rendered as "0.0000 USDC". */
    tokenDecimals: number;
    /** Unix seconds — end of the schedule. */
    endTime: number | null;
    /** Stringified bigint total amount for the stream. */
    amount: string | null;
    /** Recipient address (lowercased, already on-chain public info). */
    recipient: string;
    /** USD-equivalent value of `amount` at the most recent DexScreener price.
     *  Populated server-side via `getQuickUsdPrices()`. `null` when:
     *   - the chain isn't priced (testnets, anything DexScreener doesn't slug)
     *   - the token has no DEX pair with ≥$1k liquidity (memecoin dust)
     *   - amount itself is missing or zero
     *  Renderers should fall back to the raw amount silently when null. */
    usdValue?: number | null;
    /** True when this position vests LINEARLY with no cliff — its dated event is
     *  a gradual-vest *completion*, not a discrete lump unlock. Renderers use it
     *  to say "fully vests" instead of "unlocks" (e.g. a Superfluid stream with
     *  no cliff amount). A stream with steps OR a real cliff lump stays an
     *  "unlock". */
    isLinearVest?: boolean;
}
/**
 * Group of upcoming unlocks that share `(protocol, chainId, tokenAddress, hourBucket)`.
 *
 * Used by the cross-protocol upcoming-unlocks widget on `/protocols`. A single
 * mass distribution (e.g. "Sablier ETH, 10K USDC each, T+8h, 50 recipients")
 * collapses to one row instead of 50 — see `getUpcomingUnlockGroupsAcross`
 * for the grouping rules.
 *
 * Wire-compatible superset of `UnlockSummary` for older consumers: every field
 * on `UnlockSummary` is here too, so a renderer that only knew about single
 * unlocks still works on a group of size 1. The new fields are:
 *   - `walletCount`  — distinct recipients folded into this group
 *   - `streamCount`  — total streams folded in (≥ walletCount; one wallet
 *                      can have multiple streams in the same hour bucket)
 *   - `groupKey`     — stable identifier suitable for React `key=`
 *
 * `recipient` and `streamId` carry the *first* (earliest) member of the group
 * — preserved so single-stream groups still deep-link the same way and
 * groups of size > 1 still have a deterministic React key.
 */
export interface UnlockGroupSummary extends UnlockSummary {
    /** Number of distinct recipient wallets folded into this group. ≥ 1. */
    walletCount: number;
    /** Number of streams folded into this group. ≥ walletCount. */
    streamCount: number;
    /** Stable id: `${protocol}-${chainId}-${tokenAddress}-${hourBucket}`. */
    groupKey: string;
}
/**
 * Aggregate stats for a protocol (or a merged group — pass multiple adapter IDs
 * for UNCX which has classic + VestingManager variants).
 *
 * Two-tier read path:
 *
 *   1. Fast path — SELECT FROM protocol_summaries (≤10 rows total table).
 *      Per-row data was pre-aggregated by refreshProtocolSummaries() at
 *      end-of-cron. Sub-30ms regardless of cache size. When passed multiple
 *      adapter ids (UNCX classic + VM), we sum/union across the matching
 *      rows in TS — no GROUP BY needed since the table already has one
 *      row per adapter.
 *
 *   2. Bootstrap fallback — legacy GROUP BY directly over
 *      vesting_streams_cache. Fires when the summaries table is empty,
 *      e.g. fresh deploy after migration 0018 but before the first cron
 *      pass. Slow (5+ seconds for Sablier) but only runs once per
 *      (deploy, protocol) until the next cron populates the summaries.
 *
 * Either path produces a stable ProtocolStats shape so the consumers
 * don't need to know which one fired.
 */
export declare function getProtocolStats(adapterIds: readonly string[]): Promise<ProtocolStats>;
/**
 * Bulk fast-path read: ONE select over the whole protocol_summaries table
 * (≤ a dozen rows, ~100ms), returned as a map keyed by adapter id. Callers
 * that render many protocols at once (the /protocols index) use this instead
 * of N parallel getProtocolStats() calls — the fan-out was saturating the
 * Supabase pooler and forcing the multi-second GROUP-BY fallback, which is
 * what made the page 8s+. NEVER touches the 176k-row vesting_streams_cache.
 * Returns an empty map on error (caller renders last-good, not 0s).
 */
export declare function getAllProtocolStatsMap(): Promise<Map<string, ProtocolStats>>;
/**
 * Fold the summary rows for a protocol's adapter ids (e.g. UNCX = uncx +
 * uncx-vm) into one ProtocolStats from a map built by getAllProtocolStatsMap().
 * Returns null if none of the ids have a row (so the caller can show an
 * "indexing…" state instead of a fake 0).
 */
export declare function foldProtocolStats(map: Map<string, ProtocolStats>, adapterIds: readonly string[]): ProtocolStats | null;
/**
 * Recompute protocol_summaries from the live cache and upsert every row.
 *
 * Called from the seeder cron at end-of-run (alongside refreshStatusSummary).
 * Single SELECT — Postgres does the GROUP BY work; we then walk results
 * and upsert. Idempotent.
 *
 * Active-stream semantics (revised May 6 2026):
 *
 *   - vesting protocols: active = count where the recipient still has
 *     unclaimed tokens, i.e. (stream_data->>'withdrawnAmount')::numeric
 *     < (stream_data->>'totalAmount')::numeric. This catches BOTH
 *     mid-schedule streams (still releasing) AND past-end-time streams
 *     where the recipient never claimed. Previously this filter was
 *     `is_fully_vested = false` which was time-only — once endTime
 *     passed the stream dropped out of "active" even if every token
 *     was still sitting in the contract waiting to be claimed. For
 *     protocols with many short locks (Jupiter Lock — token-launchpad
 *     style 1-day locks) the time-only filter undercounted active by
 *     >90% because most locks are time-expired but tokens are still
 *     in the contract.
 *
 *   - stream protocols (LlamaPay, Sablier Flow): active = total
 *     Streaming protocols set is_fully_vested=true on every row to
 *     suppress cliff-countdown rendering, and their per-second flow
 *     model means there's no clean "withdrawn vs total" pair to check.
 *     Every flowing stream is active by definition.
 *
 * Testnets (Sepolia, Base Sepolia) are excluded so the public per-protocol
 * page totals match the /status page totals — both now apply the same
 * `excludeTestnets` filter. Previously /protocols included Sepolia
 * streams (Sablier had ~6.6K Sepolia rows inflating its total).
 *
 * Numeric-cast safety: stringified bigints in jsonb are bounded by the
 * underlying token's max supply. JUP, ETH, etc. all fit comfortably in
 * Postgres `numeric` (no precision limit). The ::numeric cast is the
 * cleanest way to compare two stringified bigints in SQL.
 */
export declare function refreshProtocolSummaries(): Promise<{
    rows: number;
}>;
/**
 * Most recently fully-unlocked stream for this protocol.
 * Used in the "Latest unlock" card on the landing page — the freshness signal.
 */
export declare function getLatestUnlock(adapterIds: readonly string[]): Promise<UnlockSummary | null>;
/**
 * Next upcoming unlock — the nearest future `endTime` among indexed active streams.
 * Used alongside the latest unlock to show live momentum.
 */
export declare function getNextUpcomingUnlock(adapterIds: readonly string[]): Promise<UnlockSummary | null>;
/**
 * Top N upcoming-unlock GROUPS across ALL indexed protocols, ordered by
 * soonest trigger time. Powers the "Upcoming unlocks" widget on /protocols.
 *
 * ─── Why grouping is necessary ────────────────────────────────────────────
 *
 * Real-world distributions are rarely "one wallet, one timestamp". The
 * canonical shape is "team distribution: 50 wallets, all unlocking the
 * same 10K USDC at the same hour". Without grouping, that single event
 * eats 50 widget rows, the widget looks identical for every recipient,
 * and we lose information ("how big was this unlock event in aggregate?").
 *
 * Grouping key: `(protocol, chainId, tokenAddress, hourBucket)` where
 * `hourBucket = floor(endTime / 3600)`. The 1-hour window absorbs
 * minor scheduling jitter (block-time variance, slightly staggered
 * schedules) while still keeping genuinely different events apart.
 * `protocol` keeps Sablier and Hedgey events separate even when they
 * happen in the same hour with the same token; `chainId` and
 * `tokenAddress` complete the natural identity of an unlock event.
 *
 * ─── Coverage caveat (read this before changing anything) ─────────────────
 *
 * This query reads only from `vestingStreamsCache`, which is per-user
 * seeded — i.e. a stream lands in the cache when SOMEONE searches the
 * recipient wallet. We aggregate exhaustively at the *token* level via
 * the walkers in `src/lib/vesting/tvl-walker/` for TVL display, but
 * those walkers don't write individual streams back to the cache. Until
 * they do, this widget shows "what users have already searched for",
 * not "everything indexed-on-chain". Acceptable for now — the immediate
 * UX issue is one-wallet-per-row, and grouping fixes that even with
 * partial cache coverage.
 *
 * The proper fix (walker → cache backfill) is a separate workstream;
 * see `src/lib/vesting/tvl-walker/` and the on-this-day-TODO at the
 * top of `dbcache.ts`. Path A in the original ticket.
 *
 * ─── Layered rules on top of grouping ─────────────────────────────────────
 *
 *   1. Include both stepped and linear schedules. Earlier versions filtered
 *      on shape === "steps" to avoid "0.0000 USDC" amounts on continuous
 *      streams, but that excluded most of our integrated protocols. Now
 *      every active stream whose endTime is in the future contributes;
 *      `lockedAmount` (what's still to vest) is summed across the group.
 *
 *   2. Per-protocol cap so one prolific protocol can't fill the list.
 *      uncx + uncx-vm are merged for the cap (shared display name).
 *
 *   3. Pool size: fetch up to 100 raw rows so grouping + the per-protocol
 *      cap have plenty of material. Hour-bucketing of a 50-wallet event
 *      collapses to one group, so the raw multiplier needs to be larger
 *      than the old 15× to keep enough material around after collapse.
 */
export declare function getUpcomingUnlockGroupsAcross(limit?: number): Promise<UnlockGroupSummary[]>;
/**
 * Top N upcoming unlocks for a SINGLE protocol, with same-token-same-hour
 * mass distributions COLLAPSED into a single grouped row. Powers the
 * Upcoming queue on /protocols/[slug].
 *
 * Same grouping rules as `getUpcomingUnlockGroupsAcross` (cross-protocol
 * widget): bucket by (chainId, tokenAddress, hourBucket) so e.g. Hedgey's
 * 6 simultaneous CHEEL drips to 6 wallets render as ONE row with a
 * "6 wallets unlock together" subtitle, not six near-identical "in 4d 5h"
 * lines that crowd out genuinely-different upcoming events.
 *
 * Returns `UnlockGroupSummary[]` (a wire-compatible superset of
 * `UnlockSummary` — single-stream groups have walletCount=1/streamCount=1
 * and look identical to the old single-stream renderer).
 */
export declare function getUpcomingUnlocksForProtocol(adapterIds: readonly string[], limit?: number): Promise<UnlockGroupSummary[]>;
export interface ProtocolFunStats {
    /** Largest active stream on this protocol (by raw token amount —
     *  cross-token USD comparisons would need a per-token price join here
     *  which is more than the existing infra has cheaply available).
     *  Null when the protocol has no active streams. */
    biggestStream: {
        streamId: string;
        tokenSymbol: string;
        tokenAddress: string;
        chainId: number;
        recipient: string;
        /** Stringified bigint — whole-token math happens in the UI layer. */
        totalAmount: string;
        decimals: number;
    } | null;
    /** Token with the most active streams on this protocol. */
    mostPopularToken: {
        tokenSymbol: string;
        tokenAddress: string | null;
        chainId: number;
        streamCount: number;
    } | null;
    /** Streams whose first_seen_at is within the past 24h — the indexer's
     *  pulse, basically. "N new streams indexed today." */
    newStreamsLast24h: number;
}
export declare function getProtocolFunStats(adapterIds: readonly string[]): Promise<ProtocolFunStats>;
/** Truncate a wallet / contract address for public display: `0x3f5C…8b2e`. */
export declare function truncateAddress(addr: string): string;
/** Human-readable chain name for a chain ID (7 public chains incl. Solana). */
export declare function chainLabel(chainId: number): string;
/**
 * Coerce a Date | ISO string | null into a Date | null. Defensive against
 * Next.js's `unstable_cache` JSON-roundtripping a Date into a string — when
 * a cached return value is rehydrated, what was a Date in code becomes the
 * `.toISOString()` string. Calling `.getTime()` on the result throws.
 *
 * Used by every date formatter below; pass through here first. Exported so
 * consumers of `ProtocolStats.lastIndexedAt` (which is `Date | string | null`
 * for the same reason) can normalize before doing Date arithmetic.
 */
export declare function toDateSafe(input: Date | string | null | undefined): Date | null;
/** Relative time since a past Date — "14 min ago", "3 d ago". */
export declare function relativeTimeSince(date: Date | string | null, nowMs?: number): string;
/**
 * Freshness formatter tuned for "we re-index on a daily cadence" displays.
 *
 * `relativeTimeSince` is honest but ugly here: the cron runs at 03:00 UTC
 * and by 09:00 UTC the same day it already reads "6 h ago" — which reads
 * as "stale" even though nothing on-chain has actually changed meaningfully.
 * This formatter drops hour precision after the first hour and switches to
 * day buckets so the freshness pill stays confidence-inspiring for the full
 * ~23-hour window between runs.
 *
 * Buckets (descending priority):
 *   today     → "today"                      (indexed at any point today)
 *   else      → "recently"                   (no day-count timeline shown)
 *
 * We deliberately collapse everything older than today to "recently" rather
 * than surfacing an exact "N days ago" timeline. A specific day-count reads as
 * stale ("indexed 7 days ago") even when the protocol genuinely has no new
 * on-chain data — the freshest-data signal can legitimately sit days old (see
 * the lastRefreshedAt semantic shift). "recently" keeps the freshness pill
 * confidence-inspiring without implying a refresh cadence we don't promise.
 * (Product call, 2026-06.)
 */
export declare function relativeFreshness(date: Date | string | null, nowMs?: number): string;
/** Time-until from now → a unix-seconds future timestamp — "in 4 d 2 h". */
export declare function relativeTimeUntil(unixSec: number | null, nowMs?: number): string;
/**
 * Divide a stringified-bigint amount by 10^decimals and return a compact human string
 * — e.g. "4.2K NOVA", "1.25M USDC", "812.50 FLUX".
 * Conservative: if decimals are unknown (0) we just comma-format the whole number.
 */
export declare function formatAmountCompact(amount: string | null, tokenSymbol: string | null, decimals?: number): string;
