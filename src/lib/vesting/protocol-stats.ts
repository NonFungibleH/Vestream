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
  /** Most recent cache-refresh timestamp across all streams for this protocol. */
  lastIndexedAt: Date | null;
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
    amount:       sd.totalAmount ?? null,
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
    totalStreams:  statsRow?.total  ?? 0,
    activeStreams: statsRow?.active ?? 0,
    tokensTracked: statsRow?.tokens ?? 0,
    chainIds:      (statsRow?.chains ?? []).filter((c): c is number => c != null).sort((a, b) => a - b),
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
 * Top N upcoming unlocks across ALL indexed protocols, ordered by how soon they
 * trigger — with diversification applied. Used by the "Upcoming Unlocks" panel
 * on /protocols (and formerly /unlocks) so the landing page feels varied, not
 * "6 tranches from one recipient".
 *
 * Three rules applied on top of the naive "soonest first":
 *
 *   1. Skip linear/continuous streams. Sablier linear and Superfluid
 *      streaming-vesting streams have no discrete "unlock event" at the
 *      endTime — they flow per-second. Showing them here yielded the
 *      "0.0000 USDC" rows the UI can't meaningfully render.
 *      We keep only shape === "steps" (tranched / cliff schedules).
 *
 *   2. Dedupe by recipient. A single wallet with four Sablier tranches
 *      at T+12h, T+13h, T+14h, T+15h used to fill the entire widget
 *      with the same address. Max one row per recipient in the top N.
 *
 *   3. Interleave by protocol. After dedupe, round-robin through the
 *      per-protocol queues so no single protocol dominates the list.
 *      A visitor glancing at the panel sees breadth across 4-5
 *      protocols rather than "Sablier Sablier Sablier Sablier".
 *
 * We fetch a larger pool than we display (see POOL_MULTIPLIER) so there
 * are enough candidates left after filtering + deduping for the
 * interleave step to produce a full `limit` rows.
 */
export async function getUpcomingUnlocksAcross(limit = 10): Promise<UnlockSummary[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  // Fetch enough candidates that even after stripping linear streams and
  // deduping by recipient we have N×5 rows spread across protocols.
  // 100 rows = ~5ms from the cache table, not a real cost.
  const POOL_MULTIPLIER = 10;

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
        // JSONB filter: only streams with a discrete unlock step at endTime.
        // Linear / continuous streams store shape: "linear" (or absent);
        // tranched / cliff streams store shape: "steps".
        sql`${vestingStreamsCache.streamData}->>'shape' = 'steps'`,
      ),
    )
    .orderBy(asc(vestingStreamsCache.endTime))
    .limit(limit * POOL_MULTIPLIER);

  // Dedupe by recipient — keep the earliest-unlocking row per wallet.
  // Input is already ordered by endTime asc so the first occurrence wins.
  const seenRecipients = new Set<string>();
  const deduped: UnlockSummary[] = [];
  for (const row of rows) {
    if (seenRecipients.has(row.recipient)) continue;
    seenRecipients.add(row.recipient);
    deduped.push(rowToUnlock(row));
  }

  // Round-robin interleave by protocol. Build per-protocol queues (preserving
  // the endTime-asc order within each), then cycle through the queues popping
  // the head of each until we fill `limit` rows or run out of candidates.
  const byProtocol = new Map<string, UnlockSummary[]>();
  for (const u of deduped) {
    const q = byProtocol.get(u.protocol);
    if (q) q.push(u);
    else   byProtocol.set(u.protocol, [u]);
  }

  const out: UnlockSummary[] = [];
  while (out.length < limit && byProtocol.size > 0) {
    for (const [p, q] of Array.from(byProtocol.entries())) {
      if (out.length >= limit) break;
      const head = q.shift();
      if (head) out.push(head);
      if (q.length === 0) byProtocol.delete(p);
    }
  }
  return out;
}

/**
 * Top N upcoming unlocks for a SINGLE protocol group. Powers the per-protocol
 * upcoming strip on /unlocks/[protocol].
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

/** Relative time since a past Date — "14 min ago", "3 d ago". */
export function relativeTimeSince(date: Date | null, nowMs = Date.now()): string {
  if (!date) return "never";
  const diffSec = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
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
export function relativeFreshness(date: Date | null, nowMs = Date.now()): string {
  if (!date) return "never";
  const diffSec = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
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
