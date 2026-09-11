// src/lib/vesting/new-locks.ts
// ─────────────────────────────────────────────────────────────────────────────
// "Locked today" — the projects that put tokens into vesting in the last N
// hours, one row per TOKEN rather than per schedule.
//
// This is a discovery feed, not a leaderboard. The reader is browsing for
// projects that have just locked supply (a credibility signal worth looking
// at), so rows are ordered newest-first and an unpriced token still earns its
// place — ranking by USD would have hidden most of the day's activity behind
// the ~50% of new tokens that have no DEX pair yet.
//
// ── Why `firstSeenAt` needs a second filter ──────────────────────────────────
// The cache has no on-chain creation timestamp (see the stream_data shape in
// schema.ts — there is no createdAt on any adapter). `first_seen_at` is when
// OUR indexer first wrote the row, which is a good proxy for the event-driven
// protocols that tick hourly but a bad one for seeder/discovery protocols,
// where a years-old lock can appear today simply because we finally walked
// its recipient. Measured on a normal day: every new Hedgey, PinkSale and
// Magna row had a vesting start time already in the past — discovery catching
// up, not new locks.
//
// So a row must ALSO have a start time that isn't already behind us. That is
// the difference between "we noticed it today" and "it was locked today", and
// on the day this shipped it cut 58 raw rows to 33 genuine ones.
// ─────────────────────────────────────────────────────────────────────────────

import { and, gt, notInArray, sql } from "drizzle-orm";
import { UNLISTED_ADAPTER_IDS } from "@/lib/protocol-constants";
import { db } from "../db";
import { vestingStreamsCache } from "../db/schema";

const PUBLIC_HIDDEN_CHAIN_IDS = [11155111, 84532] as const;
const excludeTestnets = notInArray(vestingStreamsCache.chainId, [...PUBLIC_HIDDEN_CHAIN_IDS]);
// `unlisted` protocols (Doppler) stay indexed for wallet scans + alerts but
// never reach a public aggregate. On a typical day Doppler is ~80% of all new
// rows, so without this the feed would be nothing else.
const excludeUnlisted = UNLISTED_ADAPTER_IDS.length > 0
  ? notInArray(vestingStreamsCache.protocol, [...UNLISTED_ADAPTER_IDS])
  : undefined;

/** One project that locked tokens inside the window. */
export type NewLockRow = {
  chainId:      number;
  tokenAddress: string;
  tokenSymbol:  string | null;
  /** Protocol the lock was created on. Ties broken by row count. */
  protocol:     string;
  /** How many separate schedules this token created in the window. */
  lockCount:    number;
  /** Distinct recipients across those schedules. */
  walletCount:  number;
  /** Summed totalAmount in raw base units — same token, so decimals cancel. */
  totalAmount:  string;
  decimals:     number;
  /** Earliest vesting start across the new schedules (unix seconds). */
  startTime:    number;
  /** Latest end across the new schedules (unix seconds), 0 when open-ended. */
  endTime:      number;
  /** When we indexed the most recent of these schedules. */
  seenAt:       Date;
  /** Filled in by the caller via enrichNewLocksWithUsd; null when unpriceable. */
  usdValue:     number | null;
};

export const EMPTY_NEW_LOCKS: NewLockRow[] = [];

/**
 * Projects that locked tokens in the last `hours`.
 *
 * One indexed read. Measured at 56ms for a 24h window against production, so
 * it is safe on an ISR render path without its own timeout wrapper — the
 * caller still bounds it, consistent with the rest of /unlocks.
 */
export async function getNewLocks(hours = 24, limit = 24): Promise<NewLockRow[]> {
  // Build phase has no reliable pooler — see the DB-short-circuit rule in
  // CLAUDE.md. ISR fills this in on the first runtime render after deploy.
  if (process.env.NEXT_PHASE === "phase-production-build") return EMPTY_NEW_LOCKS;

  const cutoffSec = Math.floor(Date.now() / 1000) - hours * 3600;

  try {
    const rows = await db
      .select({
        chainId:      vestingStreamsCache.chainId,
        tokenAddress: sql<string>`min(${vestingStreamsCache.tokenAddress})`.as("token_address"),
        tokenSymbol:  sql<string | null>`max(${vestingStreamsCache.tokenSymbol})`.as("token_symbol"),
        protocol:     sql<string>`mode() within group (order by ${vestingStreamsCache.protocol})`.as("protocol"),
        lockCount:    sql<number>`count(*)::int`.as("lock_count"),
        walletCount:  sql<number>`count(distinct ${vestingStreamsCache.recipient})::int`.as("wallet_count"),
        totalAmount:  sql<string>`sum((${vestingStreamsCache.streamData}->>'totalAmount')::numeric)::text`.as("total_amount"),
        decimals:     sql<number>`max((${vestingStreamsCache.streamData}->>'tokenDecimals')::int)`.as("decimals"),
        startTime:    sql<number>`min((${vestingStreamsCache.streamData}->>'startTime')::bigint)::int`.as("start_time"),
        endTime:      sql<number>`max(${vestingStreamsCache.endTime})::int`.as("end_time"),
        seenAt:       sql<Date>`max(${vestingStreamsCache.firstSeenAt})`.as("seen_at"),
      })
      .from(vestingStreamsCache)
      .where(and(
        gt(vestingStreamsCache.firstSeenAt, sql`now() - (${hours} || ' hours')::interval`),
        // Not back-dated: the schedule starts inside the window or later. See
        // the header note — this is what makes the row a NEW lock rather than
        // an old one we happened to discover today.
        sql`(${vestingStreamsCache.streamData}->>'startTime')::bigint > ${cutoffSec}`,
        excludeTestnets,
        excludeUnlisted,
      ))
      // Solana mints are case-sensitive base58, EVM addresses are not — group
      // the same way the rest of the codebase counts distinct tokens.
      .groupBy(
        vestingStreamsCache.chainId,
        sql`case when ${vestingStreamsCache.tokenAddress} like '0x%'
                 then lower(${vestingStreamsCache.tokenAddress})
                 else ${vestingStreamsCache.tokenAddress} end`,
      )
      .orderBy(sql`max(${vestingStreamsCache.firstSeenAt}) desc`)
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      // numeric sums arrive with a trailing ".0"; the USD helper parses a
      // BigInt from this string and would throw on the decimal point.
      totalAmount: String(r.totalAmount ?? "0").split(".")[0],
      decimals:    r.decimals ?? 18,
      startTime:   Number(r.startTime ?? 0),
      endTime:     Number(r.endTime ?? 0),
      usdValue:    null,
    }));
  } catch (e) {
    console.warn("[new-locks] query failed (non-fatal):", e);
    return EMPTY_NEW_LOCKS;
  }
}

/**
 * Attach USD where we can price it. Deliberately non-blocking on failure: an
 * unpriced row still renders with its token amount, because the feed's job is
 * to surface the project, not to rank it.
 */
export async function enrichNewLocksWithUsd(
  rows: NewLockRow[],
  opts?: { redis?: boolean; liveFallback?: boolean },
): Promise<NewLockRow[]> {
  if (rows.length === 0) return rows;
  try {
    const { getQuickUsdPrices, toUsdValue } = await import("./quick-prices");
    const prices = await getQuickUsdPrices(
      rows.map((r) => ({ chainId: r.chainId, address: r.tokenAddress })),
      { redis: opts?.redis },
    );
    return rows.map((r) => ({
      ...r,
      usdValue: toUsdValue(
        r.totalAmount,
        r.decimals,
        prices.get(`${r.chainId}:${r.tokenAddress.toLowerCase()}`),
      ),
    }));
  } catch (e) {
    console.warn("[new-locks] pricing failed (non-fatal):", e);
    return rows;
  }
}
