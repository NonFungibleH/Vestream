// src/lib/vesting/token-summary.ts
// ─────────────────────────────────────────────────────────────────────────────
// Token-level unlock summary — collapse the per-holder VestingStream[] that
// `explorerFetch()` returns for a token into one headline object the mobile
// watchlist card can render: total locked across all holders, the earliest
// upcoming unlock, and how much unlocks at that moment.
//
// This is the data backbone of the watchlist ("follow any token's unlocks
// without owning it"). Amounts stay token-denominated (stringified bigint) —
// the client prices them with its existing price hook, exactly as StreamCard
// already does for owned streams. 2026-06-11.
// ─────────────────────────────────────────────────────────────────────────────
import type { VestingStream } from "./types";

export interface TokenUnlockSummary {
  chainId: number;
  tokenAddress: string;          // canonical lowercase
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  streamCount: number;           // number of vesting positions for this token
  recipientCount: number;        // distinct holder addresses
  totalAmount: string;           // Σ totalAmount   (bigint string)
  totalLocked: string;           // Σ lockedAmount  (bigint string)
  totalClaimable: string;        // Σ claimableNow  (bigint string)
  nextUnlockTime: number | null; // earliest upcoming unlock across all holders (unix s)
  nextUnlockAmount: string | null; // Σ of step amounts unlocking within that day
  protocols: string[];           // distinct protocols holding this token
}

function safe(raw: string | undefined | null): bigint {
  if (!raw) return 0n;
  try { return BigInt(raw); } catch { return 0n; }
}

/**
 * Summarise every holder's stream for one token into a single card payload.
 *
 * `nowSec` is injectable so the unit test is deterministic; production callers
 * let it default to wall-clock.
 */
export function summariseToken(
  streams: VestingStream[],
  chainId: number,
  tokenAddress: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): TokenUnlockSummary {
  let totalAmount = 0n;
  let totalLocked = 0n;
  let totalClaimable = 0n;
  const recipients = new Set<string>();
  const protocols = new Set<string>();
  let tokenSymbol: string | null = null;
  let tokenDecimals: number | null = null;
  let nextUnlockTime: number | null = null;

  for (const s of streams) {
    totalAmount    += safe(s.totalAmount);
    totalLocked    += safe(s.lockedAmount);
    totalClaimable += safe(s.claimableNow);
    if (s.recipient) recipients.add(s.recipient.toLowerCase());
    if (s.protocol) protocols.add(s.protocol);
    if (!tokenSymbol && s.tokenSymbol) tokenSymbol = s.tokenSymbol;
    if (tokenDecimals == null && typeof s.tokenDecimals === "number") tokenDecimals = s.tokenDecimals;

    const nut = s.nextUnlockTime;
    if (nut != null && nut > nowSec && (nextUnlockTime == null || nut < nextUnlockTime)) {
      nextUnlockTime = nut;
    }
  }

  // Aggregate what actually unlocks at the earliest upcoming moment. unlockSteps
  // are per-stream, so sum the step amounts whose timestamp falls within the
  // same 24h window as `nextUnlockTime` — a real holder-summed "next unlock"
  // figure rather than one stream's slice. Streams without steps (pure linear)
  // don't contribute a discrete amount, so the figure is null when no holder
  // has a step in that window (the card then shows just the time).
  let nextUnlockAmount: bigint | null = null;
  if (nextUnlockTime != null) {
    const windowEnd = nextUnlockTime + 86_400;
    let acc = 0n;
    let matched = false;
    for (const s of streams) {
      for (const step of s.unlockSteps ?? []) {
        if (step.timestamp >= nextUnlockTime && step.timestamp < windowEnd) {
          acc += safe(step.amount);
          matched = true;
        }
      }
    }
    if (matched) nextUnlockAmount = acc;
  }

  return {
    chainId,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenSymbol,
    tokenDecimals,
    streamCount: streams.length,
    recipientCount: recipients.size,
    totalAmount: totalAmount.toString(),
    totalLocked: totalLocked.toString(),
    totalClaimable: totalClaimable.toString(),
    nextUnlockTime,
    nextUnlockAmount: nextUnlockAmount == null ? null : nextUnlockAmount.toString(),
    protocols: [...protocols],
  };
}
