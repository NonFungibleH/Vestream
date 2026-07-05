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

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { vestingUnlockEvents } from "../db/schema";
import { normaliseAddress } from "../address-validation";
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
