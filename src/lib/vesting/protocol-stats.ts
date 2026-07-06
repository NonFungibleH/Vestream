// src/lib/vesting/protocol-stats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Aggregate statistics for the public per-protocol landing pages.
//
// These queries run on every protocol page request (subject to the page's
// `export const revalidate = 60`) so the returned numbers update at most
// once a minute — fresh enough for SEO crawlers, cheap enough for the DB.
//
// All queries scope to the read-only `vestingStreamsCache` table; they
// do NOT trigger adapter fetches. If nothing is cached for a protocol
// (because no user has ever asked about it yet) the helpers return
// zeroed stats / null unlocks — the page renders an empty-state.
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, desc, eq, gt, gte, inArray, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { protocolSummaries, vestingStreamsCache } from "../db/schema";
import { PROTOCOL_DEFAULT_CATEGORY } from "@vestream/shared";
import type { VestingStream } from "./types";
import { normaliseAddress } from "../address-validation";

// Sepolia + Base Sepolia. Public landing-page surfaces (per-protocol stats,
// /protocols upcoming-unlocks widget, "latest" / "next" unlock cards) hide
// these so visitors see only mainnet activity — testnet streams are noise
// from internal smoke-tests, not user-relevant unlocks. Authenticated dashboard
// + REST API still see every chain so devs / power users can opt in.
const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);

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
  streamId:    string;
  protocol:    string;
  chainId:     number;
  tokenSymbol: string | null;
  /** Lowercase ERC-20 contract address — used to deep-link to /token/[chainId]/[address]. */
  tokenAddress: string;
  /** ERC-20 decimals for the token. Needed by formatters to scale the raw
   *  bigint amount down to the human unit. Without it, formatters default
   *  to 18 and USDC (decimals=6) rendered as "0.0000 USDC". */
  tokenDecimals: number;
  /** Unix seconds — end of the schedule. */
  endTime:     number | null;
  /** Stringified bigint total amount for the stream. */
  amount:      string | null;
  /** Recipient address (lowercased, already on-chain public info). */
  recipient:   string;
  /** USD-equivalent value of `amount` at the most recent DexScreener price.
   *  Populated server-side via `getQuickUsdPrices()`. `null` when:
   *   - the chain isn't priced (testnets, anything DexScreener doesn't slug)
   *   - the token has no DEX pair with ≥$1k liquidity (memecoin dust)
   *   - amount itself is missing or zero
   *  Renderers should fall back to the raw amount silently when null. */
  usdValue?:   number | null;
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function adapterFilter(adapterIds: readonly string[]) {
  // inArray with an empty list errors out, so defensively fall back to impossible match
  if (adapterIds.length === 0) return sql`false`;
  return inArray(vestingStreamsCache.protocol, Array.from(adapterIds));
}

function rowToUnlock(row: {
  streamId:     string;
  protocol:     string;
  chainId:      number;
  tokenSymbol:  string | null;
  tokenAddress: string | null;
  endTime:      number | null;
  recipient:    string;
  streamData:   Record<string, unknown>;
}, opts?: { completed?: boolean }): UnlockSummary {
  const sd = row.streamData as Partial<VestingStream>;
  // Amount semantics differ by direction:
  //   • upcoming (default): `lockedAmount` = what's still to vest — correct for
  //     both shapes (stepped: sum of pending steps; linear: whole vest remaining).
  //   • completed (opts.completed): a fully-vested stream has lockedAmount == 0,
  //     so showing it renders "0.0000" — the "most recently fully vested" card
  //     wants the TOTAL that just finished vesting (totalAmount) instead.
  // Each falls back to the other for legacy rows missing one field.
  const amount = opts?.completed
    ? (sd.totalAmount ?? sd.lockedAmount ?? null)
    : (sd.lockedAmount ?? sd.totalAmount ?? null);
  // Linear-with-no-cliff → the dated event is a vest completion, not a lump.
  // `steps` (tranched) or a real cliff lump keep "unlock". Undefined shape is
  // treated as linear (the common case for pre-shape legacy rows).
  const hasCliff = typeof sd.cliffTime === "number" && sd.cliffTime > 0;
  const isLinearVest = (sd.shape == null || sd.shape === "linear") && !hasCliff;
  return {
    streamId:     row.streamId,
    protocol:     row.protocol,
    chainId:      row.chainId,
    tokenSymbol:  row.tokenSymbol ?? null,
    // Ecosystem-aware: EVM → lowercase canonical, Solana base58 → PRESERVED.
    // A raw `.toLowerCase()` corrupts case-sensitive Solana mints (an uppercase
    // "L" → "l", not a valid base58 char), which made the /token link vanish or
    // 404 for those tokens on /protocols/streamflow. See chain-links.test.ts.
    tokenAddress: normaliseAddress(row.tokenAddress ?? ""),
    // Default to 18 for legacy rows that somehow lack tokenDecimals in their
    // streamData blob. Any adapter written since inception sets it.
    tokenDecimals: typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
    endTime:      row.endTime ?? null,
    amount,
    recipient:    row.recipient,
    isLinearVest,
  };
}

// ─── queries ─────────────────────────────────────────────────────────────────

/**
 * Build-time short-circuit predicate.
 *
 * Vercel production builds occasionally have the Supabase pooler drop
 * mid-build (observed May 2 2026 — XX000 FATAL during /sitemap.xml +
 * /unlocks/[range] static generation). Once it drops, every subsequent
 * query CONNECTION_CLOSEDs, but individual static pages still exhaust
 * their per-page 60s budget retrying — three timeouts, exit 1.
 *
 * Skipping DB work entirely during `next build` lets the build finish
 * in seconds. ISR (revalidate=60–3600 depending on the page) then fills
 * each page with real data on the first runtime request after deploy.
 *
 * Same guard already lives inside `getUnlocksInWindow` for the same
 * reason — keep these in sync.
 */
function shouldSkipDbAtBuildTime(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

const EMPTY_PROTOCOL_STATS: ProtocolStats = {
  totalStreams:    0,
  activeStreams:   0,
  unclaimedStreams: 0,
  chainIds:        [],
  tokensTracked:   0,
  recipientCount:  0,
  lastIndexedAt:   null,
};

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
export async function getProtocolStats(
  adapterIds: readonly string[],
): Promise<ProtocolStats> {
  if (shouldSkipDbAtBuildTime()) return EMPTY_PROTOCOL_STATS;
  if (adapterIds.length === 0)   return EMPTY_PROTOCOL_STATS;

  // ── Fast path (protocol_summaries), with one retry ──────────────────────────
  // The fast-path query is ~30ms. A TRANSIENT error (cold Supabase pooler,
  // connection reset) must NOT drop us into the multi-second GROUP-BY fallback
  // when the summaries table is populated — that fallback running for all
  // protocols in parallel is what made /protocols slow + cached "0 streams".
  // So retry the cheap query once before falling back. Only the *bootstrap*
  // case (table genuinely has no row for this protocol → fastPathStats returns
  // null) or repeated failure reaches the GROUP BY.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fast = await fastPathStats(adapterIds);
      if (fast) return fast;
      break; // genuinely empty (fresh deploy, pre-cron) → bootstrap GROUP BY
    } catch (err) {
      console.warn(
        `[protocol-stats] protocol_summaries fast path attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}`,
      );
      if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
    }
  }

  // ── Bootstrap fallback (legacy GROUP BY) ──────────────────────────────────
  return computeProtocolStatsFromCache(adapterIds);
}

/**
 * Fast path: read pre-aggregated counts from protocol_summaries and fold the
 * (possibly multiple, e.g. UNCX classic + VM) matching rows into one
 * ProtocolStats. Returns null when the table has no row for any of the adapter
 * ids (bootstrap case) so the caller can fall back to the GROUP BY.
 */
async function fastPathStats(adapterIds: readonly string[]): Promise<ProtocolStats | null> {
  const rows = await db
    .select({
      protocol:       protocolSummaries.protocol,
      totalStreams:   protocolSummaries.totalStreams,
      activeStreams:  protocolSummaries.activeStreams,
      unclaimedStreams: protocolSummaries.unclaimedStreams,
      tokensTracked:  protocolSummaries.tokensTracked,
      recipientCount: protocolSummaries.recipientCount,
      chainIds:       protocolSummaries.chainIds,
      lastIndexedAt:  protocolSummaries.lastIndexedAt,
    })
    .from(protocolSummaries)
    .where(inArray(protocolSummaries.protocol, Array.from(adapterIds)));

  if (rows.length === 0) return null;

  // Sum across matched rows. Distinct-token / distinct-recipient counts can't
  // be summed perfectly across protocols, but for the UNCX classic+VM merge the
  // overlap is negligible (different contracts → different streams), so a sum is
  // close enough for the public stats display.
  let total = 0, active = 0, unclaimed = 0, tokens = 0, recipients = 0;
  const chainSet = new Set<number>();
  let lastIndexedAt: Date | null = null;
  for (const r of rows) {
    total      += r.totalStreams;
    active     += r.activeStreams;
    unclaimed  += r.unclaimedStreams;
    tokens     += r.tokensTracked;
    recipients += r.recipientCount;
    for (const c of r.chainIds ?? []) chainSet.add(c);
    if (r.lastIndexedAt) {
      const d = toDate(r.lastIndexedAt);
      if (d && (!lastIndexedAt || d > lastIndexedAt)) lastIndexedAt = d;
    }
  }
  return {
    totalStreams:    total,
    activeStreams:   active,
    unclaimedStreams: unclaimed,
    tokensTracked:   tokens,
    recipientCount:  recipients,
    chainIds:        Array.from(chainSet).sort((a, b) => a - b),
    lastIndexedAt,
  };
}

/**
 * Bulk fast-path read: ONE select over the whole protocol_summaries table
 * (≤ a dozen rows, ~100ms), returned as a map keyed by adapter id. Callers
 * that render many protocols at once (the /protocols index) use this instead
 * of N parallel getProtocolStats() calls — the fan-out was saturating the
 * Supabase pooler and forcing the multi-second GROUP-BY fallback, which is
 * what made the page 8s+. NEVER touches the 176k-row vesting_streams_cache.
 * Returns an empty map on error (caller renders last-good, not 0s).
 */
export async function getAllProtocolStatsMap(): Promise<Map<string, ProtocolStats>> {
  if (shouldSkipDbAtBuildTime()) return new Map();
  const rows = await db
    .select({
      protocol:       protocolSummaries.protocol,
      totalStreams:   protocolSummaries.totalStreams,
      activeStreams:  protocolSummaries.activeStreams,
      unclaimedStreams: protocolSummaries.unclaimedStreams,
      tokensTracked:  protocolSummaries.tokensTracked,
      recipientCount: protocolSummaries.recipientCount,
      chainIds:       protocolSummaries.chainIds,
      lastIndexedAt:  protocolSummaries.lastIndexedAt,
    })
    .from(protocolSummaries);

  const map = new Map<string, ProtocolStats>();
  for (const r of rows) {
    map.set(r.protocol, {
      totalStreams:   r.totalStreams,
      activeStreams:  r.activeStreams,
      unclaimedStreams: r.unclaimedStreams,
      tokensTracked:  r.tokensTracked,
      recipientCount: r.recipientCount,
      chainIds:       (r.chainIds ?? []).slice().sort((a, b) => a - b),
      lastIndexedAt:  toDate(r.lastIndexedAt),
    });
  }
  return map;
}

/**
 * Fold the summary rows for a protocol's adapter ids (e.g. UNCX = uncx +
 * uncx-vm) into one ProtocolStats from a map built by getAllProtocolStatsMap().
 * Returns null if none of the ids have a row (so the caller can show an
 * "indexing…" state instead of a fake 0).
 */
export function foldProtocolStats(
  map: Map<string, ProtocolStats>,
  adapterIds: readonly string[],
): ProtocolStats | null {
  const matched = adapterIds
    .map((id) => map.get(id))
    .filter((s): s is ProtocolStats => !!s);
  if (matched.length === 0) return null;

  let total = 0, active = 0, unclaimed = 0, tokens = 0, recipients = 0;
  const chainSet = new Set<number>();
  let lastIndexedAt: Date | null = null;
  for (const s of matched) {
    total      += s.totalStreams;
    active     += s.activeStreams;
    unclaimed  += s.unclaimedStreams;
    tokens     += s.tokensTracked;
    recipients += s.recipientCount;
    for (const c of s.chainIds) chainSet.add(c);
    // ProtocolStats.lastIndexedAt is typed string | Date | null — coerce to Date.
    const d = toDate(s.lastIndexedAt);
    if (d && (!lastIndexedAt || d > lastIndexedAt)) {
      lastIndexedAt = d;
    }
  }
  return {
    totalStreams:    total,
    activeStreams:   active,
    unclaimedStreams: unclaimed,
    tokensTracked:   tokens,
    recipientCount:  recipients,
    chainIds:        Array.from(chainSet).sort((a, b) => a - b),
    lastIndexedAt,
  };
}

/**
 * Underlying GROUP BY computation — the same expression that
 * getProtocolStats used to run on every read. Now factored out so it can
 * be called from refreshProtocolSummaries() (write path) and as a
 * bootstrap fallback in getProtocolStats (read path).
 *
 * Active-count semantic + testnet filter mirror the write path — see
 * refreshProtocolSummaries() docstring for the full reasoning.
 */
async function computeProtocolStatsFromCache(
  adapterIds: readonly string[],
): Promise<ProtocolStats> {
  const filter = adapterFilter(adapterIds);

  // This GROUP BY runs across the entire vestingStreamsCache table with JSONB
  // parsing. On a large table it can take 5-20s. Cap at 6s so that repeated
  // parallel calls from the /protocols page don't cascade into a 524 timeout.
  // The caller (getProtocolStats) catches this error and the page renders with
  // placeholder stats. The protocol_summaries fast path avoids this entirely
  // when the cron has run.
  // Live scope + unclaimed mirror the write path (refreshProtocolSummaries)
  // so the bootstrap fallback reconciles with the calendar the same way.
  const liveScope = sql`(
    ${vestingStreamsCache.isFullyVested} = false
    and (
      ${vestingStreamsCache.endTime} is null
      or ${vestingStreamsCache.endTime} <= 0
      or ${vestingStreamsCache.endTime} > extract(epoch from now())
    )
  )`;
  const queryPromise = db
    .select({
      total:       sql<number>`count(*)::int`,
      active:      sql<number>`count(*) filter (where ${liveScope})::int`,
      unclaimed:   sql<number>`count(*) filter (
        where ${vestingStreamsCache.isFullyVested} = true
        and (${vestingStreamsCache.streamData}->>'withdrawnAmount') is not null
        and (${vestingStreamsCache.streamData}->>'totalAmount')   is not null
        and (${vestingStreamsCache.streamData}->>'withdrawnAmount')::numeric
          < (${vestingStreamsCache.streamData}->>'totalAmount')::numeric
      )::int`,
      tokens:      sql<number>`count(distinct case when ${vestingStreamsCache.tokenAddress} like '0x%' then lower(${vestingStreamsCache.tokenAddress}) else ${vestingStreamsCache.tokenAddress} end) filter (where ${liveScope})::int`,
      recipients:  sql<number>`count(distinct case when ${vestingStreamsCache.recipient} like '0x%' then lower(${vestingStreamsCache.recipient}) else ${vestingStreamsCache.recipient} end) filter (where ${liveScope})::int`,
      tokensAll:   sql<number>`count(distinct case when ${vestingStreamsCache.tokenAddress} like '0x%' then lower(${vestingStreamsCache.tokenAddress}) else ${vestingStreamsCache.tokenAddress} end)::int`,
      recipientsAll: sql<number>`count(distinct case when ${vestingStreamsCache.recipient} like '0x%' then lower(${vestingStreamsCache.recipient}) else ${vestingStreamsCache.recipient} end)::int`,
      chains:      sql<number[] | null>`array_agg(distinct ${vestingStreamsCache.chainId})`,
      lastIndexed: sql<Date | string | null>`max(${vestingStreamsCache.lastRefreshedAt})`,
    })
    .from(vestingStreamsCache)
    .where(and(filter, excludeTestnets));

  const [statsRow] = await Promise.race([
    queryPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("computeProtocolStatsFromCache: 6s query timeout")), 6_000)
    ),
  ]);

  const lastIndexedAt = toDate(statsRow?.lastIndexed);

  // Stream-category protocols store is_fully_vested=true, so the live-scope
  // filter would zero their token/recipient counts — fall back to all-time
  // for them (mirrors refreshProtocolSummaries).
  const isStreamCat = adapterIds.some((id) => PROTOCOL_DEFAULT_CATEGORY[id] === "stream");

  return {
    totalStreams:    statsRow?.total      ?? 0,
    activeStreams:   isStreamCat ? (statsRow?.total ?? 0) : (statsRow?.active ?? 0),
    unclaimedStreams: statsRow?.unclaimed ?? 0,
    tokensTracked:   (isStreamCat ? statsRow?.tokensAll     : statsRow?.tokens)     ?? 0,
    recipientCount:  (isStreamCat ? statsRow?.recipientsAll : statsRow?.recipients) ?? 0,
    chainIds:        (statsRow?.chains ?? []).filter((c): c is number => c != null).sort((a, b) => a - b),
    lastIndexedAt,
  };
}

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
export async function refreshProtocolSummaries(): Promise<{ rows: number }> {
  if (shouldSkipDbAtBuildTime()) return { rows: 0 };

  // Read all per-protocol aggregates in one pass. Postgres's GROUP BY is
  // fast given the protocol index; we do the active-vs-stream split in TS
  // since the column is already loaded.
  // "Live" scope = still has locked tokens AND hasn't passed its end (or is
  // perpetual / end-unknown). Matches the calendar/explorer's upcoming scope
  // (is_fully_vested=false AND end_time>now) so the hero's Active/Tokens/
  // Recipients reconcile with it. The past-due-but-unclaimed tail is
  // deliberately excluded here and counted separately as `unclaimed` below.
  // Perpetual streams (end_time null/≤0, e.g. LlamaPay payroll) stay in scope
  // so streaming protocols aren't zeroed. Hits the partial index
  // vsc_active_protocol_end_time_idx (WHERE is_fully_vested = false).
  const liveScope = sql`(
    ${vestingStreamsCache.isFullyVested} = false
    and (
      ${vestingStreamsCache.endTime} is null
      or ${vestingStreamsCache.endTime} <= 0
      or ${vestingStreamsCache.endTime} > extract(epoch from now())
    )
  )`;
  const aggregates = await db
    .select({
      protocol:        vestingStreamsCache.protocol,
      // All-time footprint — every stream ever indexed for this protocol.
      // The credibility/marketing number, deliberately NOT reconciled to the
      // live scope.
      total:           sql<number>`count(*)::int`,
      // Still-vesting count (live scope) — reconciles with the calendar's
      // "upcoming" so the hero's "Active now" no longer contradicts it.
      vestingActive:   sql<number>`count(*) filter (where ${liveScope})::int`,
      // Fully vested but not fully withdrawn = tokens sitting claimable-but-
      // unclaimed. The honest home for the population that used to inflate
      // "Active now" (which counted every withdrawn<total, past-due included).
      unclaimed:       sql<number>`count(*) filter (
        where ${vestingStreamsCache.isFullyVested} = true
        and (${vestingStreamsCache.streamData}->>'withdrawnAmount') is not null
        and (${vestingStreamsCache.streamData}->>'totalAmount')   is not null
        and (${vestingStreamsCache.streamData}->>'withdrawnAmount')::numeric
          < (${vestingStreamsCache.streamData}->>'totalAmount')::numeric
      )::int`,
      // Count addresses case-INSENSITIVELY for EVM (0x…) but case-SENSITIVELY
      // for Solana base58 (where case is significant). Storage isn't uniformly
      // lowercased, so a plain `count(distinct token_address)` double-counts the
      // mixed-case EVM variants of a single token — e.g. Team Finance showed
      // "68 tokens" when there were really 63. The token page + Explorer already
      // read via lower(); this makes the protocol-hero counts agree.
      //
      // Filtered to the live scope so "Tokens"/"Recipients" reconcile with the
      // calendar/explorer (tokens/wallets with a still-pending unlock) instead
      // of counting every token/wallet ever touched. Continuous-stream
      // protocols (llamapay, sablier-flow) store is_fully_vested=true and so
      // fall outside the live scope — they use the all-time counts below
      // instead (same reason their "active" uses total, not vestingActive).
      tokens:          sql<number>`count(distinct case when ${vestingStreamsCache.tokenAddress} like '0x%' then lower(${vestingStreamsCache.tokenAddress}) else ${vestingStreamsCache.tokenAddress} end) filter (where ${liveScope})::int`,
      recipients:      sql<number>`count(distinct case when ${vestingStreamsCache.recipient} like '0x%' then lower(${vestingStreamsCache.recipient}) else ${vestingStreamsCache.recipient} end) filter (where ${liveScope})::int`,
      tokensAll:       sql<number>`count(distinct case when ${vestingStreamsCache.tokenAddress} like '0x%' then lower(${vestingStreamsCache.tokenAddress}) else ${vestingStreamsCache.tokenAddress} end)::int`,
      recipientsAll:   sql<number>`count(distinct case when ${vestingStreamsCache.recipient} like '0x%' then lower(${vestingStreamsCache.recipient}) else ${vestingStreamsCache.recipient} end)::int`,
      chains:          sql<number[] | null>`array_agg(distinct ${vestingStreamsCache.chainId})`,
      lastIndexed:     sql<Date | string | null>`max(${vestingStreamsCache.lastRefreshedAt})`,
    })
    .from(vestingStreamsCache)
    .where(excludeTestnets)
    .groupBy(vestingStreamsCache.protocol);

  if (aggregates.length === 0) return { rows: 0 };

  const now = new Date();
  const values = aggregates.map((r) => {
    const category = PROTOCOL_DEFAULT_CATEGORY[r.protocol] ?? "vesting";
    // Stream-category protocols (llamapay, sablier-flow) store
    // is_fully_vested=true, so the live scope would zero their counts. Fall
    // back to the all-time counts for them — same reason "active" uses total.
    const isStreamCat = category === "stream";
    const active = isStreamCat ? r.total : r.vestingActive;
    return {
      protocol:        r.protocol,
      totalStreams:    r.total      ?? 0,
      activeStreams:   active       ?? 0,
      unclaimedStreams: r.unclaimed ?? 0,
      tokensTracked:   (isStreamCat ? r.tokensAll     : r.tokens)     ?? 0,
      recipientCount:  (isStreamCat ? r.recipientsAll : r.recipients) ?? 0,
      chainIds:        (r.chains ?? []).filter((c): c is number => c != null).sort((a, b) => a - b),
      lastIndexedAt:   toDate(r.lastIndexed),
      computedAt:      now,
    };
  });

  // Single bulk upsert. PRIMARY KEY is `protocol`, so each adapter has at
  // most one row in the table forever. Old rows for protocols that have
  // since been removed from the registry stay intact — harmless, just a
  // tiny stale row no consumer queries for.
  await db
    .insert(protocolSummaries)
    .values(values)
    .onConflictDoUpdate({
      target: protocolSummaries.protocol,
      set: {
        totalStreams:   sql`excluded.total_streams`,
        activeStreams:  sql`excluded.active_streams`,
        unclaimedStreams: sql`excluded.unclaimed_streams`,
        tokensTracked:  sql`excluded.tokens_tracked`,
        recipientCount: sql`excluded.recipient_count`,
        chainIds:       sql`excluded.chain_ids`,
        lastIndexedAt:  sql`excluded.last_indexed_at`,
        computedAt:     sql`excluded.computed_at`,
      },
    });

  return { rows: values.length };
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Most recently fully-unlocked stream for this protocol.
 * Used in the "Latest unlock" card on the landing page — the freshness signal.
 */
export async function getLatestUnlock(
  adapterIds: readonly string[],
): Promise<UnlockSummary | null> {
  if (shouldSkipDbAtBuildTime()) return null;

  // Only consider streams whose vest actually COMPLETED in the past. Without
  // the `endTime <= now` guard this picked the fully-vested row with the
  // largest endTime — which for some protocols (notably Team Finance) is a
  // future date (e.g. 2029) flagged isFullyVested=true after an early/withdrawn
  // close. now − futureEndTime is negative → the card clamped to "0s ago",
  // so "most recently fully vested" was permanently stuck at 0s.
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      recipient:    vestingStreamsCache.recipient,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(and(
      adapterFilter(adapterIds),
      eq(vestingStreamsCache.isFullyVested, true),
      lte(vestingStreamsCache.endTime, nowSec),
      excludeTestnets,
    ))
    .orderBy(desc(vestingStreamsCache.endTime))
    .limit(1);

  // completed:true → show the TOTAL amount that vested, not lockedAmount (0).
  return rows[0] ? rowToUnlock(rows[0], { completed: true }) : null;
}

/**
 * Next upcoming unlock — the nearest future `endTime` among indexed active streams.
 * Used alongside the latest unlock to show live momentum.
 */
export async function getNextUpcomingUnlock(
  adapterIds: readonly string[],
): Promise<UnlockSummary | null> {
  if (shouldSkipDbAtBuildTime()) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      recipient:    vestingStreamsCache.recipient,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        adapterFilter(adapterIds),
        eq(vestingStreamsCache.isFullyVested, false),
        gt(vestingStreamsCache.endTime, nowSec),
        excludeTestnets,
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(1);

  return rows[0] ? rowToUnlock(rows[0]) : null;
}

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
// Cached entry point — every public consumer (homepage upcoming card,
// /protocols upcoming list, /api/unlocks/upcoming, mobile Discover)
// pulls through this. 60s revalidate is short enough that fresh
// indexer writes show up quickly but long enough that the slow
// SELECT (no covering index on is_fully_vested + end_time over a
// 130K-row table) fires at most once a minute per Vercel region.
//
// 2026-05-14: introduced when the protocol page + mobile Discover
// both started timing out on cold renders after the v6 cache-key
// bump invalidated every protocol's payload.
//
// 2026-05-15 follow-up: post-filter against the current nowSec so
// events whose endTime has elapsed during the cache window get
// dropped. Without this, a stream that was "in 5s" when the cache
// populated stays in the cached array for the full 60s as "in 0s" /
// "now", which the protocol page rendered as a permanent-feeling
// stale row at the top of the upcoming list. We fetch MORE than
// `limit` from the cache (limit * 3, capped at 60) so the
// post-filter still leaves enough rows to fill the requested limit
// after dropping passed events.
//
// Cache key is parameterised on `cacheLimit` (the inner over-fetch),
// NOT the outer `limit`, so every caller asking for ≤20 events
// shares the same cache slot.
export async function getUpcomingUnlockGroupsAcross(
  limit = 10,
): Promise<UnlockGroupSummary[]> {
  if (shouldSkipDbAtBuildTime()) return [];
  const cacheLimit = Math.min(60, Math.max(30, limit * 3));
  const nowSec     = Math.floor(Date.now() / 1000);
  const stillFuture = (g: UnlockGroupSummary) => g.endTime != null && g.endTime > nowSec;

  // Drop anything whose endTime has now passed. The cached payload was filtered
  // against an older nowSec so events that were near-term when the cache
  // populated leak through as "now"; this pass removes them.
  const cached = await getUpcomingUnlockGroupsAcrossCached(cacheLimit);
  let live = cached.filter(stillFuture);

  // Stale-cache guard: on a low-traffic endpoint the cache can age well past
  // its 60s revalidate (stale-while-revalidate serves old data between hits).
  // As it ages, more of the over-fetched groups elapse and get filtered out —
  // the visible list silently shrinks (we saw it fall from 15 → 5). When the
  // filtered result comes up short of `limit`, recompute fresh so the list
  // stays full; the recompute also re-warms the cache for the next caller.
  if (live.length < limit) {
    const fresh = await getUpcomingUnlockGroupsAcrossUncached(cacheLimit);
    live = fresh.filter(stillFuture);
  }

  return live.slice(0, limit);
}

const getUpcomingUnlockGroupsAcrossCached = unstable_cache(
  async (limit: number) => getUpcomingUnlockGroupsAcrossUncached(limit),
  ["upcoming-unlock-groups-across-v1"],
  { revalidate: 60, tags: ["upcoming-unlocks"] },
);

async function getUpcomingUnlockGroupsAcrossUncached(
  limit: number,
): Promise<UnlockGroupSummary[]> {

  const nowSec = Math.floor(Date.now() / 1000);
  // Fetch a generous raw row pool. A single mass distribution can collapse
  // 50 rows → 1 group, so we over-fetch to ensure post-grouping we still
  // have enough variety per protocol to fill the per-protocol cap.
  // Bumped from 100 → 500 (and 20× → 50× the limit) to fix the homepage
  // calendar undercounting vs /protocols totals — the previous pool was
  // small enough that high-volume protocols (Sablier/Hedgey) could
  // dominate the raw rows and leave little material for the rest.
  const POOL_SIZE = Math.max(500, limit * 50);

  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      recipient:    vestingStreamsCache.recipient,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.isFullyVested, false),
        gt(vestingStreamsCache.endTime, nowSec),
        excludeTestnets,
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(POOL_SIZE);

  // ── Group by (protocolCanonical, chainId, tokenAddress, hourBucket) ─────
  //
  // protocolCanonical merges uncx-vm → uncx so the two UNCX adapter variants
  // collapse together (the front-end already shows them as one card).
  //
  // hourBucket = floor(endTime / 3600) — a 1-hour window. We pick the
  // earliest endTime within the bucket as the representative time so the
  // countdown stays meaningful ("in 8h 41m" — the soonest in-group unlock).
  interface Group {
    representative: typeof rows[number];
    protoCanonical: string;
    hourBucket:     number;
    recipients:     Set<string>;
    streamCount:    number;
    /** Sum of lockedAmount (preferred) or totalAmount (legacy fallback) across the group. */
    amountSum:      bigint;
    /** True if at least one member contributed an amount — needed to distinguish
     *  "sum is genuinely zero" from "no members had a parseable amount". */
    hasAmount:      boolean;
    earliestEnd:    number;
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const protoCanonical = row.protocol === "uncx-vm" ? "uncx" : row.protocol;
    const tokenKey       = (row.tokenAddress ?? "").toLowerCase();
    const end            = row.endTime ?? 0;
    const hourBucket     = Math.floor(end / 3600);
    const key            = `${protoCanonical}-${row.chainId}-${tokenKey}-${hourBucket}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        representative: row,
        protoCanonical,
        hourBucket,
        recipients:     new Set(),
        streamCount:    0,
        amountSum:      0n,
        hasAmount:      false,
        earliestEnd:    end,
      };
      groups.set(key, g);
    } else if (end > 0 && end < g.earliestEnd) {
      // Keep the earliest endTime row as representative so the displayed
      // countdown reflects the soonest unlock in the group.
      g.representative = row;
      g.earliestEnd    = end;
    }

    g.recipients.add(row.recipient);
    g.streamCount += 1;

    const sd = row.streamData as Partial<VestingStream>;
    const rawAmount = sd.lockedAmount ?? sd.totalAmount ?? null;
    if (rawAmount) {
      try {
        g.amountSum += BigInt(rawAmount);
        g.hasAmount  = true;
      } catch {
        // Ignore unparseable amount; group still counts the wallet/stream.
      }
    }
  }

  // ── Order groups chronologically + apply per-protocol cap ───────────────
  //
  // We can't rely on `rows` being sorted-equivalent to the group order
  // because grouping mixes rows from different time-buckets. Sort the
  // collected groups by their representative endTime ascending.
  const ordered = Array.from(groups.values()).sort(
    (a, b) => (a.earliestEnd || Number.MAX_SAFE_INTEGER) - (b.earliestEnd || Number.MAX_SAFE_INTEGER),
  );

  // Per-protocol cap exists to prevent a single high-volume protocol
  // (Sablier or Hedgey can each have 100+ groups in a 30-day window)
  // from monopolising the displayed calendar. Previous value of 3 was
  // far too aggressive — a homepage calendar showing "10 protocols × 3
  // unlocks each = 27 events" was reading as far smaller than the
  // protocol-page totals users were comparing it against. Setting it to
  // a fraction of the requested limit gives diversity without starving:
  // limit=10 → max 4 per protocol; limit=50 → max 10 per protocol.
  const PER_PROTOCOL_MAX = Math.max(4, Math.ceil(limit / 2));
  const countPerProto    = new Map<string, number>();
  const selected: Group[] = [];
  for (const g of ordered) {
    if ((countPerProto.get(g.protoCanonical) ?? 0) >= PER_PROTOCOL_MAX) continue;
    countPerProto.set(g.protoCanonical, (countPerProto.get(g.protoCanonical) ?? 0) + 1);
    selected.push(g);
    if (selected.length >= limit) break;
  }
  // Pass 2 — fill remainder if the cap starved us of `limit` rows.
  if (selected.length < limit) {
    const already = new Set(selected);
    for (const g of ordered) {
      if (already.has(g)) continue;
      selected.push(g);
      if (selected.length >= limit) break;
    }
  }

  // ── Project Group → UnlockGroupSummary ──────────────────────────────────
  return selected.map((g) => {
    const base = rowToUnlock(g.representative);
    return {
      ...base,
      // Sum-of-locked-amounts as a stringified bigint to keep the wire
      // format identical to single-stream rows. If no member contributed
      // a parseable amount we propagate null rather than "0" so the
      // formatter can render "—" instead of misleading "0 USDC".
      amount:      g.hasAmount ? g.amountSum.toString() : null,
      walletCount: g.recipients.size,
      streamCount: g.streamCount,
      groupKey:    `${g.protoCanonical}-${base.chainId}-${base.tokenAddress}-${g.hourBucket}`,
    };
  });
}

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
export async function getUpcomingUnlocksForProtocol(
  adapterIds: readonly string[],
  limit = 6,
): Promise<UnlockGroupSummary[]> {
  if (shouldSkipDbAtBuildTime()) return [];

  const nowSec = Math.floor(Date.now() / 1000);
  // 60-second buffer past now: rows whose endTime is within 60s of `now`
  // routinely render as "in 0s" by the time the HTML reaches the browser.
  // See earlier comment on the protocol page Upcoming queue for context.
  const cutoffSec = nowSec + 60;

  // Two-phase, to stay correct under heavy front-of-queue clustering. A single
  // mass distribution can be 100s of streams sharing one (token, hour) bucket.
  // The old approach fetched a fixed pool of the earliest raw rows and grouped
  // in JS — so when the front of the queue was one giant distribution it
  // surfaced far fewer than `limit` groups (Unvest showed 3 instead of 6: its
  // first bucket alone held 118 streams, eating the whole 120-row pool).
  //
  // Phase 1 finds the earliest `limit` distinct (chain, token, hour) groups
  // directly in SQL — a cheap GROUP BY over the end_time index, accurate over
  // ALL matching rows regardless of clustering. Phase 2 then fetches only those
  // groups' member rows (bounded by their real sizes), so the unchanged JS
  // grouping below sees complete groups and its amount sums stay exact.
  const hourBucketExpr = sql<number>`floor(${vestingStreamsCache.endTime} / 3600)`;
  const tokenKeyExpr   = sql<string>`lower(coalesce(${vestingStreamsCache.tokenAddress}, ''))`;

  const baseWhere = and(
    adapterFilter(adapterIds),
    eq(vestingStreamsCache.isFullyVested, false),
    gt(vestingStreamsCache.endTime, cutoffSec),
    excludeTestnets,
  );

  // Phase 1 — the earliest `limit` distinct groups.
  const groupRows = await db
    .select({
      chainId:  vestingStreamsCache.chainId,
      tok:      tokenKeyExpr,
      hb:       hourBucketExpr,
    })
    .from(vestingStreamsCache)
    .where(baseWhere)
    .groupBy(vestingStreamsCache.chainId, tokenKeyExpr, hourBucketExpr)
    .orderBy(asc(sql`min(${vestingStreamsCache.endTime})`))
    .limit(limit);

  if (groupRows.length === 0) return [];

  // Phase 2 — member rows for exactly those groups (bucket = [hb*3600, +3600)).
  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      protocol:     vestingStreamsCache.protocol,
      chainId:      vestingStreamsCache.chainId,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      tokenAddress: vestingStreamsCache.tokenAddress,
      endTime:      vestingStreamsCache.endTime,
      recipient:    vestingStreamsCache.recipient,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        baseWhere,
        or(
          ...groupRows.map((g) => {
            const bucketStart = Number(g.hb) * 3600;
            return and(
              eq(vestingStreamsCache.chainId, g.chainId),
              eq(tokenKeyExpr, g.tok),
              gte(vestingStreamsCache.endTime, bucketStart),
              lt(vestingStreamsCache.endTime, bucketStart + 3600),
            );
          }),
        ),
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime));

  interface Group {
    representative: typeof rows[number];
    protoCanonical: string;
    hourBucket:     number;
    recipients:     Set<string>;
    streamCount:    number;
    amountSum:      bigint;
    hasAmount:      boolean;
    earliestEnd:    number;
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const protoCanonical = row.protocol === "uncx-vm" ? "uncx" : row.protocol;
    const tokenKey       = (row.tokenAddress ?? "").toLowerCase();
    const end            = row.endTime ?? 0;
    const hourBucket     = Math.floor(end / 3600);
    const key            = `${protoCanonical}-${row.chainId}-${tokenKey}-${hourBucket}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        representative: row,
        protoCanonical,
        hourBucket,
        recipients:     new Set(),
        streamCount:    0,
        amountSum:      0n,
        hasAmount:      false,
        earliestEnd:    end,
      };
      groups.set(key, g);
    } else if (end > 0 && end < g.earliestEnd) {
      g.representative = row;
      g.earliestEnd    = end;
    }

    g.recipients.add(row.recipient);
    g.streamCount += 1;

    const sd = row.streamData as Partial<VestingStream>;
    const rawAmount = sd.lockedAmount ?? sd.totalAmount ?? null;
    if (rawAmount) {
      try {
        g.amountSum += BigInt(rawAmount);
        g.hasAmount  = true;
      } catch {
        // Ignore unparseable amount.
      }
    }
  }

  const ordered = Array.from(groups.values())
    .sort((a, b) => (a.earliestEnd || Number.MAX_SAFE_INTEGER) - (b.earliestEnd || Number.MAX_SAFE_INTEGER))
    .slice(0, limit);

  return ordered.map((g) => {
    const base = rowToUnlock(g.representative);
    return {
      ...base,
      amount:      g.hasAmount ? g.amountSum.toString() : null,
      walletCount: g.recipients.size,
      streamCount: g.streamCount,
      groupKey:    `${g.protoCanonical}-${base.chainId}-${base.tokenAddress}-${g.hourBucket}`,
    };
  });
}

// ─── Fun-fact stats (protocol landing page extras) ──────────────────────────
//
// Surfaces "interesting things to know about this protocol" alongside the
// hard numbers in getProtocolStats. Adopted 2026-05-14 for the protocol
// landing page polish pass — a Carta-style data card that gives retail
// visitors a sense of scale + activity beyond the raw stream count.
//
// All three queries hit the same vesting_streams_cache table that already
// powers the rest of the page. No new tables, no new crons.

export interface ProtocolFunStats {
  /** Largest active stream on this protocol (by raw token amount —
   *  cross-token USD comparisons would need a per-token price join here
   *  which is more than the existing infra has cheaply available).
   *  Null when the protocol has no active streams. */
  biggestStream: {
    streamId:     string;
    tokenSymbol:  string;
    tokenAddress: string;
    chainId:      number;
    recipient:    string;
    /** Stringified bigint — whole-token math happens in the UI layer. */
    totalAmount:  string;
    decimals:     number;
  } | null;
  /** Token with the most active streams on this protocol. */
  mostPopularToken: {
    tokenSymbol:  string;
    tokenAddress: string | null;
    chainId:      number;
    streamCount:  number;
  } | null;
  /** Streams whose first_seen_at is within the past 24h — the indexer's
   *  pulse, basically. "N new streams indexed today." */
  newStreamsLast24h: number;
}

const EMPTY_FUN_STATS: ProtocolFunStats = {
  biggestStream:     null,
  mostPopularToken:  null,
  newStreamsLast24h: 0,
};

export async function getProtocolFunStats(
  adapterIds: readonly string[],
): Promise<ProtocolFunStats> {
  if (shouldSkipDbAtBuildTime()) return EMPTY_FUN_STATS;
  if (adapterIds.length === 0)   return EMPTY_FUN_STATS;

  const ids = Array.from(adapterIds);

  // All three queries fan out in parallel. PromiseAllSettled so any single
  // failure (transient DB blip, missing column on a stale deploy) degrades
  // to that field being empty instead of taking the whole protocol page
  // down — same defensive shape as the surrounding queries in this file.
  const settled = await Promise.allSettled([
    // Biggest by raw token amount. We can't trivially convert to USD
    // server-side without joining tokenPricesCache, so we sort by token
    // count and let the page surface "10M FOO" — still useful, and the
    // page already prices on render.
    db
      .select({
        streamId:      vestingStreamsCache.streamId,
        tokenSymbol:   vestingStreamsCache.tokenSymbol,
        tokenAddress:  vestingStreamsCache.tokenAddress,
        chainId:       vestingStreamsCache.chainId,
        recipient:     vestingStreamsCache.recipient,
        streamData:    vestingStreamsCache.streamData,
      })
      .from(vestingStreamsCache)
      .where(
        and(
          inArray(vestingStreamsCache.protocol, ids),
          eq(vestingStreamsCache.isFullyVested, false),
          excludeTestnets,
        ),
      )
      // Sort BY ::numeric on the stringified bigint inside streamData so
      // small-decimals tokens don't beat big tokens just because their
      // raw integer count is larger. The streamData jsonb path
      // (->>'totalAmount') is text; cast to numeric for sort.
      .orderBy(sql`(${vestingStreamsCache.streamData}->>'totalAmount')::numeric DESC NULLS LAST`)
      .limit(1),

    // Most popular = token with most active streams.
    db
      .select({
        tokenSymbol:  vestingStreamsCache.tokenSymbol,
        tokenAddress: vestingStreamsCache.tokenAddress,
        chainId:      vestingStreamsCache.chainId,
        streamCount:  sql<number>`count(*)::int`.as("stream_count"),
      })
      .from(vestingStreamsCache)
      .where(
        and(
          inArray(vestingStreamsCache.protocol, ids),
          eq(vestingStreamsCache.isFullyVested, false),
          excludeTestnets,
        ),
      )
      .groupBy(
        vestingStreamsCache.tokenSymbol,
        vestingStreamsCache.tokenAddress,
        vestingStreamsCache.chainId,
      )
      .orderBy(sql`count(*) DESC`)
      .limit(1),

    // New streams indexed in last 24h. The setWhere clause on writeToCache
    // means lastRefreshedAt is "data moved" rather than "row touched", so
    // we use firstSeenAt explicitly for the discovery count.
    db
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(vestingStreamsCache)
      .where(
        and(
          inArray(vestingStreamsCache.protocol, ids),
          gt(vestingStreamsCache.firstSeenAt, sql`now() - interval '24 hours'`),
          excludeTestnets,
        ),
      ),
  ]);

  // Decode each result independently so a failure on one doesn't poison others.
  let biggestStream: ProtocolFunStats["biggestStream"] = null;
  if (settled[0].status === "fulfilled" && settled[0].value.length > 0) {
    const r = settled[0].value[0];
    const sd = r.streamData as { totalAmount?: string; tokenDecimals?: number };
    biggestStream = {
      streamId:     r.streamId,
      tokenSymbol:  r.tokenSymbol ?? "—",
      tokenAddress: r.tokenAddress ?? "",
      chainId:      r.chainId,
      recipient:    r.recipient,
      totalAmount:  sd.totalAmount ?? "0",
      decimals:     sd.tokenDecimals ?? 18,
    };
  }

  let mostPopularToken: ProtocolFunStats["mostPopularToken"] = null;
  if (settled[1].status === "fulfilled" && settled[1].value.length > 0) {
    const r = settled[1].value[0];
    mostPopularToken = {
      tokenSymbol:  r.tokenSymbol ?? "—",
      tokenAddress: r.tokenAddress ?? null,
      chainId:      r.chainId,
      streamCount:  Number(r.streamCount ?? 0),
    };
  }

  const newStreamsLast24h =
    settled[2].status === "fulfilled" && settled[2].value.length > 0
      ? Number(settled[2].value[0].count ?? 0)
      : 0;

  return { biggestStream, mostPopularToken, newStreamsLast24h };
}

// ─── formatting helpers (pure — safe to import from Server Components) ───────

/** Truncate a wallet / contract address for public display: `0x3f5C…8b2e`. */
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Human-readable chain name for a chain ID (7 public chains incl. Solana). */
export function chainLabel(chainId: number): string {
  switch (chainId) {
    case 1:     return "Ethereum";
    case 56:    return "BNB Chain";
    case 137:   return "Polygon";
    case 8453:  return "Base";
    case 42161: return "Arbitrum";
    case 10:    return "Optimism";
    case 43114: return "Avalanche";
    case 101:   return "Solana";
    case 11155111: return "Sepolia";
    case 84532:    return "Base Sepolia";
    default:    return `Chain ${chainId}`;
  }
}

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
export function toDateSafe(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Relative time since a past Date — "14 min ago", "3 d ago". */
export function relativeTimeSince(date: Date | string | null, nowMs = Date.now()): string {
  const d = toDateSafe(date);
  if (!d) return "never";
  const diffSec = Math.max(0, Math.floor((nowMs - d.getTime()) / 1000));
  if (diffSec < 60)      return `${diffSec}s ago`;
  if (diffSec < 3600)    return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400)   return `${Math.floor(diffSec / 3600)} h ago`;
  return `${Math.floor(diffSec / 86400)} d ago`;
}

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
export function relativeFreshness(date: Date | string | null, nowMs = Date.now()): string {
  const d = toDateSafe(date);
  if (!d) return "never";
  const startOfDayUTC = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const dayDiff = Math.round((startOfDayUTC(new Date(nowMs)) - startOfDayUTC(d)) / 86_400_000);
  if (dayDiff <= 0) return "today";
  return "recently";
}

/** Time-until from now → a unix-seconds future timestamp — "in 4 d 2 h". */
export function relativeTimeUntil(unixSec: number | null, nowMs = Date.now()): string {
  if (!unixSec) return "unknown";
  const diffSec = Math.max(0, unixSec - Math.floor(nowMs / 1000));
  if (diffSec < 60)      return `in ${diffSec}s`;
  if (diffSec < 3600)    return `in ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    return m > 0 ? `in ${h} h ${m} min` : `in ${h} h`;
  }
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  return h > 0 ? `in ${d} d ${h} h` : `in ${d} d`;
}

/**
 * Divide a stringified-bigint amount by 10^decimals and return a compact human string
 * — e.g. "4.2K NOVA", "1.25M USDC", "812.50 FLUX".
 * Conservative: if decimals are unknown (0) we just comma-format the whole number.
 */
export function formatAmountCompact(
  amount: string | null,
  tokenSymbol: string | null,
  decimals = 18,
): string {
  if (!amount) return tokenSymbol ?? "—";
  let whole: number;
  try {
    // BigInt → number conversion is lossy above 2^53 but fine for display
    whole = Number(BigInt(amount)) / 10 ** decimals;
  } catch {
    return tokenSymbol ?? "—";
  }
  const sym = tokenSymbol ? ` ${tokenSymbol}` : "";
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(2)}M${sym}`;
  if (whole >= 1_000)     return `${(whole / 1_000).toFixed(1)}K${sym}`;
  if (whole >= 1)         return `${whole.toFixed(2)}${sym}`;
  // Sub-1 amounts: toFixed(4) rounds very small values to "0.0000" which
  // reads as broken data. Show "< 0.0001" instead so the UI stays honest.
  const fixed = whole.toFixed(4);
  if (fixed === "0.0000" && whole > 0) return `< 0.0001${sym}`;
  return `${fixed}${sym}`;
}
