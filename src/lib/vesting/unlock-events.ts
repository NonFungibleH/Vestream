// src/lib/vesting/unlock-events.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turn a wallet's vesting streams into unlock-event rows (accrual-basis income),
// dedup-insert them, and price them at the unlock timestamp.
//
//   toUnlockRows(userId, streams)      pure: streams → insert-shaped rows
//   generateUnlockEventsForUser(...)   db: chunked onConflictDoNothing insert
//   priceUnlockEvents(userId)          db: enrich "missing" rows (Task 5)
//
// The pure mapping carries the logic (and the tests); the db paths mirror the
// claim-event ingestors (shared.ts) and are exercised in manual verification —
// the repo has no db-test harness.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingUnlockEvents, claimEvents } from "../db/schema";
import { normaliseAddress, addressesEqual } from "../address-validation";
import { computeUnlockTranches } from "./unlock-schedule";
import { getHistoricalPrice, type PriceConfidence } from "./historical-prices";
import type { VestingStream } from "./types";

/** Insert-shaped unlock-event row (pre-pricing). */
export interface UnlockEventInput {
  userId: string;
  streamId: string;
  protocol: string;
  chainId: number;
  recipient: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenDecimals: number;
  amount: string;
  unlockTime: Date;
  trancheKey: string;
  usdValueAtUnlock: string | null;
  priceConfidence: "exact" | "nearest" | "missing" | "manual";
  manualPrice: boolean;
}

/**
 * Pure: map a wallet's discrete streams to unlock-event rows — one per tranche,
 * unpriced (`priceConfidence: "missing"`, `usdValueAtUnlock: null`). Continuous
 * streams contribute nothing (computeUnlockTranches returns []).
 *
 * Addresses go through normaliseAddress: EVM (0x…) lowercased, Solana base58
 * preserved verbatim (base58 is case-sensitive — never blanket .toLowerCase()).
 */
export function toUnlockRows(userId: string, streams: VestingStream[]): UnlockEventInput[] {
  const rows: UnlockEventInput[] = [];
  for (const stream of streams) {
    for (const tranche of computeUnlockTranches(stream)) {
      rows.push({
        userId,
        streamId: stream.id,
        protocol: stream.protocol,
        chainId: stream.chainId,
        recipient: normaliseAddress(stream.recipient),
        tokenAddress: normaliseAddress(stream.tokenAddress),
        tokenSymbol: stream.tokenSymbol || null,
        tokenDecimals: stream.tokenDecimals,
        amount: tranche.amount,
        unlockTime: new Date(tranche.unlockTime * 1000),
        trancheKey: tranche.trancheKey,
        usdValueAtUnlock: null,
        priceConfidence: "missing",
        manualPrice: false,
      });
    }
  }
  return rows;
}

const INSERT_CHUNK = 200;

/**
 * Generate + dedup-insert unlock events for one user's streams. Idempotent:
 * re-runs are no-ops via onConflictDoNothing on the (userId, trancheKey) unique
 * index. Best-effort per chunk; returns the count of newly-inserted rows.
 *
 * Does NOT price — pricing is a separate pass (priceUnlockEvents) so generation
 * stays cheap and a pricing failure never blocks event capture.
 */
export async function generateUnlockEventsForUser(
  userId: string,
  streams: VestingStream[],
): Promise<number> {
  const rows = toUnlockRows(userId, streams);
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    try {
      const result = await db
        .insert(vestingUnlockEvents)
        .values(chunk)
        .onConflictDoNothing({
          target: [vestingUnlockEvents.userId, vestingUnlockEvents.trancheKey],
        })
        .returning({ id: vestingUnlockEvents.id });
      inserted += result.length;
    } catch (err) {
      console.error(`[unlock-events] insert failed for user ${userId} chunk @${i}:`, err);
    }
  }
  return inserted;
}

// ── Pricing ─────────────────────────────────────────────────────────────────

/**
 * Pure: whole-token amount × USD price, 6-dp string (numeric-safe). Mirrors the
 * conversion in token-rollups.ts — `min(decimals, 30)` guards absurd decimals.
 * Returns null on a malformed amount (UI prompts for manual FMV in that case).
 */
export function usdValueForTranche(amount: string, decimals: number, priceUsd: number): string | null {
  try {
    const tokensWhole = Number(BigInt(amount)) / Math.pow(10, Math.min(decimals, 30));
    return (tokensWhole * priceUsd).toFixed(6);
  } catch {
    return null;
  }
}

export interface TranchePricing {
  usdValueAtUnlock: string | null;
  priceConfidence: PriceConfidence;
}

/**
 * Price one tranche at its unlock timestamp. getHistoricalPrice is Redis-cached
 * per (chain, token, UTC-day), so tranches of the same stepped stream that fall
 * on the same day share a cache hit. Null price → value null, confidence
 * "missing" (the "needs your input" flag for manual FMV entry).
 */
export async function priceForTranche(
  chainId: number,
  tokenAddress: string,
  unlockSec: number,
  amount: string,
  decimals: number,
): Promise<TranchePricing> {
  const price = await getHistoricalPrice(chainId, tokenAddress, unlockSec);
  if (price.usd === null) {
    return { usdValueAtUnlock: null, priceConfidence: "missing" };
  }
  return {
    usdValueAtUnlock: usdValueForTranche(amount, decimals, price.usd),
    priceConfidence: price.confidence,
  };
}

/**
 * Enrich this user's unpriced unlock rows. Selects rows with
 * priceConfidence = "missing" AND manual_price = false (never touches
 * user-entered FMV), prices each at its unlock timestamp, and UPDATEs the row.
 * Best-effort per row; returns the count of rows that got a non-null price.
 */
export async function priceUnlockEvents(userId: string): Promise<number> {
  const rows = await db
    .select({
      id: vestingUnlockEvents.id,
      chainId: vestingUnlockEvents.chainId,
      tokenAddress: vestingUnlockEvents.tokenAddress,
      unlockTime: vestingUnlockEvents.unlockTime,
      amount: vestingUnlockEvents.amount,
      tokenDecimals: vestingUnlockEvents.tokenDecimals,
    })
    .from(vestingUnlockEvents)
    .where(
      and(
        eq(vestingUnlockEvents.userId, userId),
        eq(vestingUnlockEvents.priceConfidence, "missing"),
        eq(vestingUnlockEvents.manualPrice, false),
      ),
    );

  let priced = 0;
  for (const row of rows) {
    try {
      const { usdValueAtUnlock, priceConfidence } = await priceForTranche(
        row.chainId,
        row.tokenAddress,
        Math.floor(row.unlockTime.getTime() / 1000),
        row.amount,
        row.tokenDecimals,
      );
      // Nothing resolved — leave it "missing" so the next pass retries.
      if (priceConfidence === "missing") continue;
      await db
        .update(vestingUnlockEvents)
        .set({ usdValueAtUnlock, priceConfidence })
        .where(eq(vestingUnlockEvents.id, row.id));
      priced++;
    } catch (err) {
      console.error(`[unlock-events] pricing failed for row ${row.id}:`, err);
    }
  }
  return priced;
}

/**
 * Load a user's unlock events for CSV export, applying the same date/token
 * filters the claim exporter uses (getClaimHistoryForUser). Newest first.
 * `tokenAddress` is matched case-insensitively for EVM only via normaliseAddress.
 */
export async function getUnlockEventsForExport(
  userId: string,
  opts: { since?: Date; until?: Date; protocol?: string; tokenAddress?: string } = {},
): Promise<(typeof vestingUnlockEvents.$inferSelect)[]> {
  const conditions = [eq(vestingUnlockEvents.userId, userId)];
  if (opts.since)        conditions.push(sql`${vestingUnlockEvents.unlockTime} >= ${opts.since}`);
  if (opts.until)        conditions.push(sql`${vestingUnlockEvents.unlockTime} <= ${opts.until}`);
  if (opts.protocol)     conditions.push(eq(vestingUnlockEvents.protocol, opts.protocol));
  if (opts.tokenAddress) conditions.push(eq(vestingUnlockEvents.tokenAddress, normaliseAddress(opts.tokenAddress)));

  return db
    .select()
    .from(vestingUnlockEvents)
    .where(and(...conditions))
    .orderBy(sql`${vestingUnlockEvents.unlockTime} desc`);
}

// ── Dashboard merge (unlock + claim side by side) ────────────────────────────

/** Minimal unlock-row shape the pure merge needs (subset of the DB row). */
export interface MergeUnlockInput {
  id: string;
  streamId: string;
  protocol: string;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenDecimals: number;
  amount: string;
  unlockTime: Date;
  usdValueAtUnlock: string | null;
  priceConfidence: string;
  manualPrice: boolean;
}

/** Minimal claim-row shape the pure merge needs. */
export interface MergeClaimInput {
  streamId: string;
  tokenAddress: string;
  amount: string;
  claimedAt: Date;
  usdValueAtClaim: string | null;
  priceConfidence: string;
}

/** One dashboard row per unlock tranche, carrying both bases. */
export interface TaxEventRow {
  id: string;
  protocol: string;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenDecimals: number;
  amount: string;
  unlockTime: Date;
  usdAtUnlock: string | null;
  unlockConfidence: string;
  manualPrice: boolean;
  claimedAt: Date | null;
  usdAtClaim: string | null;
  claimConfidence: string | null;
  /** True when the unlock price is missing — prompt for manual FMV. */
  needsInput: boolean;
}

/**
 * Pure: produce one dashboard row per unlock tranche, pairing it with the claim
 * that most likely realised it. Matching is greedy one-to-one by (streamId,
 * token) and time: earliest tranche takes the earliest claim on/after it, and a
 * claim is consumed so it can't be attributed to two tranches. Unmatched
 * tranches keep a null claim side. `needsInput` flags missing unlock prices.
 */
export function mergeUnlockAndClaim(
  unlockRows: MergeUnlockInput[],
  claimRows: MergeClaimInput[],
): TaxEventRow[] {
  // Sort tranches oldest-first so greedy assignment is stable + deterministic.
  const tranches = [...unlockRows].sort((a, b) => a.unlockTime.getTime() - b.unlockTime.getTime());
  const claims = [...claimRows].sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime());
  const claimUsed = new Array(claims.length).fill(false);

  return tranches.map((u) => {
    let matchIdx = -1;
    for (let i = 0; i < claims.length; i++) {
      if (claimUsed[i]) continue;
      const c = claims[i];
      if (c.streamId !== u.streamId) continue;
      if (!addressesEqual(c.tokenAddress, u.tokenAddress)) continue;
      if (c.claimedAt.getTime() < u.unlockTime.getTime()) continue; // claim must be on/after unlock
      matchIdx = i; // claims are time-sorted, so the first hit is the nearest
      break;
    }
    const claim = matchIdx >= 0 ? claims[matchIdx] : null;
    if (matchIdx >= 0) claimUsed[matchIdx] = true;

    return {
      id: u.id,
      protocol: u.protocol,
      chainId: u.chainId,
      tokenAddress: u.tokenAddress,
      tokenSymbol: u.tokenSymbol,
      tokenDecimals: u.tokenDecimals,
      amount: u.amount,
      unlockTime: u.unlockTime,
      usdAtUnlock: u.usdValueAtUnlock,
      unlockConfidence: u.priceConfidence,
      manualPrice: u.manualPrice,
      claimedAt: claim?.claimedAt ?? null,
      usdAtClaim: claim?.usdValueAtClaim ?? null,
      claimConfidence: claim?.priceConfidence ?? null,
      needsInput: u.priceConfidence === "missing",
    };
  });
}

/**
 * Load a user's unlock tranches + claim events and merge them into dashboard
 * rows (both bases per tranche). Newest tranche first.
 */
export async function getTaxEventsForUser(userId: string): Promise<TaxEventRow[]> {
  // Only unlocks that have actually happened are taxable income. The tranche
  // generator deliberately enumerates the WHOLE schedule, future dates
  // included, because the same rows feed the unlock calendar — but a tax
  // table must not list them. Two reasons, both real: an unlock dated next
  // month cannot have a historical price, so it lands here as
  // priceConfidence "missing" and the UI flags it "needs your input"; and if
  // a user obliges, they have invented a fair market value for a date that
  // has not occurred. Measured on the first production run: 9 of 36 generated
  // events were future-dated and every one of them was flagged unpriced.
  const [unlockRows, claimRows] = await Promise.all([
    db.select().from(vestingUnlockEvents).where(and(
      eq(vestingUnlockEvents.userId, userId),
      lte(vestingUnlockEvents.unlockTime, new Date()),
    )),
    db.select().from(claimEvents).where(eq(claimEvents.userId, userId)),
  ]);

  const merged = mergeUnlockAndClaim(
    unlockRows.map((r) => ({
      id: r.id,
      streamId: r.streamId,
      protocol: r.protocol,
      chainId: r.chainId,
      tokenAddress: r.tokenAddress,
      tokenSymbol: r.tokenSymbol,
      tokenDecimals: r.tokenDecimals,
      amount: r.amount,
      unlockTime: r.unlockTime,
      usdValueAtUnlock: r.usdValueAtUnlock,
      priceConfidence: r.priceConfidence,
      manualPrice: r.manualPrice,
    })),
    claimRows.map((r) => ({
      streamId: r.streamId,
      tokenAddress: r.tokenAddress,
      amount: r.amount,
      claimedAt: r.claimedAt,
      usdValueAtClaim: r.usdValueAtClaim,
      priceConfidence: r.priceConfidence,
    })),
  );

  return merged.sort((a, b) => b.unlockTime.getTime() - a.unlockTime.getTime());
}

/**
 * Set a manual fair-market-value USD for one unlock event. Guards: the row must
 * belong to the user AND still be unpriced (priceConfidence "missing") — we
 * never overwrite an auto-priced row. Marks it manual so pricing passes skip it.
 * Returns true if a row was updated.
 */
export async function setManualUnlockPrice(
  userId: string,
  eventId: string,
  usd: number,
): Promise<boolean> {
  const result = await db
    .update(vestingUnlockEvents)
    .set({
      usdValueAtUnlock: usd.toFixed(6),
      priceConfidence: "manual",
      manualPrice: true,
    })
    .where(
      and(
        eq(vestingUnlockEvents.id, eventId),
        eq(vestingUnlockEvents.userId, userId),
        eq(vestingUnlockEvents.priceConfidence, "missing"),
      ),
    )
    .returning({ id: vestingUnlockEvents.id });
  return result.length > 0;
}
