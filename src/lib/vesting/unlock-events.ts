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

import { db } from "../db";
import { vestingUnlockEvents } from "../db/schema";
import { normaliseAddress } from "../address-validation";
import { computeUnlockTranches } from "./unlock-schedule";
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
