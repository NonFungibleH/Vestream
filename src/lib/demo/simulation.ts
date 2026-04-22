// src/lib/demo/simulation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure-math demo implementation. No RPC calls, no on-chain state — just
// elapsed-time arithmetic. Activated when Sepolia env vars are not set.
//
// Contract: 1000 DEMO tokens vest linearly over 15 minutes starting when the
// user clicks "Start demo". The client polls /api/demo/status every few
// seconds; each tick the server re-computes `vested` from `now - startMs` and
// `claimableNow = vested - withdrawn`.
// ─────────────────────────────────────────────────────────────────────────────

import { DEMO_CONFIG } from "./config";
import type { DemoSession, DemoVestingState } from "./types";

/**
 * Compute the full public state for a simulation session.
 * Safe to call even if the session is uninitialised (returns `active: false`).
 */
export function computeSimulationState(session: DemoSession | null | undefined, nowMs: number = Date.now()): DemoVestingState {
  const empty: DemoVestingState = {
    sessionId:      null,
    mode:           "simulation",
    active:         false,
    startMs:        null,
    endMs:          null,
    remainingSec:   0,
    progress:       0,
    tokenSymbol:    DEMO_CONFIG.tokenSymbol,
    tokenDecimals:  DEMO_CONFIG.tokenDecimals,
    total:          DEMO_CONFIG.totalAmount,
    vested:         "0",
    claimableNow:   "0",
    withdrawn:      "0",
    locked:         DEMO_CONFIG.totalAmount,
    vestingAddress: null,
    lastClaimTx:    null,
    explorerUrl:    null,
  };

  if (!session?.sessionId || !session.startMs) return empty;

  const startMs     = session.startMs;
  const durationMs  = DEMO_CONFIG.durationSec * 1000;
  const endMs       = startMs + durationMs;
  const elapsed     = Math.max(0, Math.min(nowMs - startMs, durationMs));
  const progress    = durationMs > 0 ? elapsed / durationMs : 0;

  const total       = BigInt(session.total ?? DEMO_CONFIG.totalAmount);
  const withdrawn   = BigInt(session.withdrawn ?? "0");

  // Linear vest: vested = total * elapsed / duration
  const vested        = durationMs > 0 ? (total * BigInt(elapsed)) / BigInt(durationMs) : 0n;
  const claimableNow  = vested > withdrawn ? vested - withdrawn : 0n;
  const locked        = total > vested ? total - vested : 0n;
  const remainingSec  = Math.max(0, Math.ceil((endMs - nowMs) / 1000));

  return {
    sessionId:      session.sessionId,
    mode:           "simulation",
    active:         true,
    startMs,
    endMs,
    remainingSec,
    progress,
    tokenSymbol:    DEMO_CONFIG.tokenSymbol,
    tokenDecimals:  DEMO_CONFIG.tokenDecimals,
    total:          total.toString(),
    vested:         vested.toString(),
    claimableNow:   claimableNow.toString(),
    withdrawn:      withdrawn.toString(),
    locked:         locked.toString(),
    vestingAddress: null,
    lastClaimTx:    null,
    explorerUrl:    null,
  };
}

/**
 * Mutate the session to mark the current claimable amount as withdrawn.
 * Returns the new public state.
 */
export function simulateClaim(session: DemoSession, nowMs: number = Date.now()): DemoVestingState {
  const pre = computeSimulationState(session, nowMs);
  if (!pre.active) return pre;

  const newWithdrawn = (BigInt(pre.withdrawn) + BigInt(pre.claimableNow)).toString();
  session.withdrawn  = newWithdrawn;

  return computeSimulationState(session, nowMs);
}
