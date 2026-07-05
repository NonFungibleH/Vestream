// src/lib/vesting/unlock-schedule.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure generator: a vesting schedule → the discrete unlock tranches it produces.
//
// Why this exists: unlocks are NOT on-chain events (unlike claims, which we
// index from eth_getLogs). Tokens vesting is just time passing against a
// schedule. So to record income at unlock time (accrual-basis tax), we must
// COMPUTE the tranches from each stream's schedule, then price each at its
// unlock timestamp.
//
// Phase 1 = DISCRETE schedules only (stepped/tranched + one-lump cliff/instant).
// Continuous/linear streams (Sablier linear, Superfluid, LlamaPay) accrue
// per-second with no tranche boundary → return [] here; deferred to Phase 2.
//
// `unlockSteps` are ALREADY incremental per-step amounts (not cumulative) —
// computeStepVesting in @vestream/shared sums them directly. Do NOT difference.
// ─────────────────────────────────────────────────────────────────────────────

import type { VestingStream } from "./types";

export interface UnlockTranche {
  /** Unix seconds — when this tranche vested/unlocked. */
  unlockTime: number;
  /** Token base units (stringified bigint). */
  amount: string;
  /** Stable, unique per (stream, tranche): `${stream.id}:${stepIndex}:${unlockTime}`.
   *  Used as the dedup key so regenerating never double-inserts. */
  trancheKey: string;
}

// A stream whose end is within this window of its cliff releases as one lump at
// the cliff (no meaningful linear portion). Mirrors rounds.ts's isCliffOnly.
const CLIFF_ONLY_TOLERANCE_SEC = 3 * 86_400;

function isZero(amount: string): boolean {
  try { return BigInt(amount) === 0n; } catch { return true; }
}

/**
 * True for schedules that release in discrete lumps (Phase 1): stepped/tranched,
 * instant (duration 0), or cliff-only (end at/near the cliff). False for real
 * linear duration and linear-after-cliff — those are continuous (Phase 2).
 */
export function isDiscreteSchedule(s: VestingStream): boolean {
  if (s.shape === "steps" && (s.unlockSteps?.length ?? 0) > 0) return true;
  const duration = s.endTime - s.startTime;
  if (duration <= 0) return true; // instant lump
  if (s.cliffTime != null && s.endTime - s.cliffTime <= CLIFF_ONLY_TOLERANCE_SEC) return true; // cliff-only
  return false; // linear / linear-after-cliff → continuous, deferred
}

/**
 * Enumerate the discrete unlock tranches for a stream. Empty for continuous
 * schedules (Phase 2). Never emits a zero-amount tranche or one before
 * startTime. For stepped streams the tranche amounts sum to the schedule total.
 */
export function computeUnlockTranches(stream: VestingStream): UnlockTranche[] {
  if (!isDiscreteSchedule(stream)) return [];

  // Stepped / tranched: one tranche per non-zero step, amount as-is.
  if (stream.shape === "steps" && (stream.unlockSteps?.length ?? 0) > 0) {
    const out: UnlockTranche[] = [];
    stream.unlockSteps!.forEach((step, i) => {
      if (isZero(step.amount)) return;
      if (step.timestamp < stream.startTime) return;
      out.push({
        unlockTime: step.timestamp,
        amount: step.amount,
        trancheKey: `${stream.id}:${i}:${step.timestamp}`,
      });
    });
    return out;
  }

  // Cliff / instant lump: whole allocation at the cliff (or end, if no cliff).
  const unlockTime = stream.cliffTime ?? stream.endTime;
  if (isZero(stream.totalAmount)) return [];
  return [
    {
      unlockTime,
      amount: stream.totalAmount,
      trancheKey: `${stream.id}:0:${unlockTime}`,
    },
  ];
}
