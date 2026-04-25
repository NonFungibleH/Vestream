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

import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";
import type { VestingStream } from "./types";

export interface ProtocolStats {
  /** Total streams of this protocol currently indexed, active + fully vested. */
  totalStreams: number;
  /** Indexed streams still releasing — i.e. `isFullyVested = false`. */
  activeStreams: number;
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
}): UnlockSummary {
  const sd = row.streamData as Partial<VestingStream>;
  // `lockedAmount` reflects what's still to vest as of last index — correct
  // for both shapes:
  //   stepped:  sum of all future-step amounts still pending
  //   linear:   whole vest remaining (monotonically decreasing over time)
  // Fallback to totalAmount for legacy cache rows without lockedAmount.
  const amount = sd.lockedAmount ?? sd.totalAmount ?? null;
  return {
    streamId:     row.streamId,
    protocol:     row.protocol,
    chainId:      row.chainId,
    tokenSymbol:  row.tokenSymbol ?? null,
    tokenAddress: (row.tokenAddress ?? "").toLowerCase(),
    // Default to 18 for legacy rows that somehow lack tokenDecimals in their
    // streamData blob. Any adapter written since inception sets it.
    tokenDecimals: typeof sd.tokenDecimals === "number" ? sd.tokenDecimals : 18,
    endTime:      row.endTime ?? null,
    amount,
    recipient:    row.recipient,
  };
}

// ─── queries ─────────────────────────────────────────────────────────────────

/**
 * Aggregate stats for a protocol (or a merged group — pass multiple adapter IDs
 * for UNCX which has classic + VestingManager variants).
 */
export async function getProtocolStats(
  adapterIds: readonly string[],
): Promise<ProtocolStats> {
  const filter = adapterFilter(adapterIds);

  const [statsRow] = await db
    .select({
      total:       sql<number>`count(*)::int`,
      active:      sql<number>`count(*) filter (where ${vestingStreamsCache.isFullyVested} = false)::int`,
      tokens:      sql<number>`count(distinct ${vestingStreamsCache.tokenAddress})::int`,
      recipients:  sql<number>`count(distinct ${vestingStreamsCache.recipient})::int`,
      chains:      sql<number[] | null>`array_agg(distinct ${vestingStreamsCache.chainId})`,
      lastIndexed: sql<Date | string | null>`max(${vestingStreamsCache.lastRefreshedAt})`,
    })
    .from(vestingStreamsCache)
    .where(filter);

  // `max()` over a timestamp column can come back as a Date *or* as an ISO
  // string depending on pg driver configuration — normalise defensively so
  // relativeTimeSince() always gets a real Date.
  const lastIndexedAt = toDate(statsRow?.lastIndexed);

  return {
    totalStreams:   statsRow?.total      ?? 0,
    activeStreams:  statsRow?.active     ?? 0,
    tokensTracked:  statsRow?.tokens     ?? 0,
    recipientCount: statsRow?.recipients ?? 0,
    chainIds:       (statsRow?.chains ?? []).filter((c): c is number => c != null).sort((a, b) => a - b),
    lastIndexedAt,
  };
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
    .where(and(adapterFilter(adapterIds), eq(vestingStreamsCache.isFullyVested, true)))
    .orderBy(desc(vestingStreamsCache.endTime))
    .limit(1);

  return rows[0] ? rowToUnlock(rows[0]) : null;
}

/**
 * Next upcoming unlock — the nearest future `endTime` among indexed active streams.
 * Used alongside the latest unlock to show live momentum.
 */
export async function getNextUpcomingUnlock(
  adapterIds: readonly string[],
): Promise<UnlockSummary | null> {
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
export async function getUpcomingUnlockGroupsAcross(
  limit = 10,
): Promise<UnlockGroupSummary[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  // Fetch up to 100 raw rows. A single mass distribution can collapse 50
  // rows → 1 group, so we deliberately fetch more than the old 15×limit
  // pool. Bounded so the query stays cheap on a growing cache.
  const POOL_SIZE = Math.max(100, limit * 20);

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

  const PER_PROTOCOL_MAX = 3;
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
 * Top N upcoming unlocks for a SINGLE protocol group. Powers the per-protocol
 * upcoming strip on /protocols/[slug].
 */
export async function getUpcomingUnlocksForProtocol(
  adapterIds: readonly string[],
  limit = 6,
): Promise<UnlockSummary[]> {
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
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(limit);

  return rows.map(rowToUnlock);
}

// ─── formatting helpers (pure — safe to import from Server Components) ───────

/** Truncate a wallet / contract address for public display: `0x3f5C…8b2e`. */
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Human-readable chain name for a chain ID (4 public chains only). */
export function chainLabel(chainId: number): string {
  switch (chainId) {
    case 1:     return "Ethereum";
    case 56:    return "BNB Chain";
    case 137:   return "Polygon";
    case 8453:  return "Base";
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
 *   < 1 min   → "just now"
 *   < 60 min  → "X min ago"                  (minute precision builds trust
 *                                              for manual reruns / user hits)
 *   < 24 h    → "today"                      (the key UX change)
 *   < 48 h    → "yesterday"
 *   else      → "N days ago"
 */
export function relativeFreshness(date: Date | string | null, nowMs = Date.now()): string {
  const d = toDateSafe(date);
  if (!d) return "never";
  const diffSec = Math.max(0, Math.floor((nowMs - d.getTime()) / 1000));
  if (diffSec < 60)    return "just now";
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return "today";
  if (diffSec < 86400 * 2) return "yesterday";
  return `${Math.floor(diffSec / 86400)} days ago`;
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
