// src/lib/demo/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mode-agnostic facade. API routes import from here and don't need to know
// whether the backend is simulation or on-chain Sepolia.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { DEMO_CONFIG, getDemoMode, SEPOLIA_CONFIG } from "./config";
import { computeSimulationState, simulateClaim } from "./simulation";
import type { DemoSession, DemoVestingState } from "./types";

export type { DemoSession, DemoVestingState } from "./types";
export { DEMO_CONFIG, SEPOLIA_CONFIG, getDemoMode } from "./config";

/** Start a new demo session. Mutates `session` in place. */
export async function startDemo(session: DemoSession): Promise<DemoVestingState> {
  const mode   = getDemoMode();
  const nowMs  = Date.now();

  session.sessionId = randomUUID();
  session.startMs   = nowMs;
  session.total     = DEMO_CONFIG.totalAmount;
  session.withdrawn = "0";
  session.mode      = mode;

  if (mode === "sepolia") {
    // Lazy-load to keep viem out of the simulation bundle path
    const { readRealState } = await import("./real");
    const state = await readRealState(session);
    session.vestingAddress = state.vestingAddress ?? undefined;
    // Override start/total from on-chain state when available
    if (state.startMs) session.startMs = state.startMs;
    if (state.total)   session.total   = state.total;
    return state;
  }

  return computeSimulationState(session, nowMs);
}

/** Read the current state without mutating the session. */
export async function readDemoState(session: DemoSession | null | undefined): Promise<DemoVestingState> {
  const mode = getDemoMode();

  if (mode === "sepolia" && session?.sessionId) {
    const { readRealState } = await import("./real");
    return readRealState(session);
  }

  return computeSimulationState(session, Date.now());
}

/**
 * Claim all currently claimable tokens. In simulation mode this is instant;
 * in Sepolia mode we broadcast a real tx and wait for inclusion.
 */
export async function claimDemo(session: DemoSession): Promise<DemoVestingState> {
  if (!session.sessionId) {
    // No active session — nothing to claim
    return computeSimulationState(session, Date.now());
  }

  if (session.mode === "sepolia") {
    const { sendRealClaim, readRealState } = await import("./real");
    const txHash = await sendRealClaim();
    session.lastClaimTx = txHash;
    return readRealState(session);
  }

  return simulateClaim(session);
}

/** Reset the session so the user can run the demo again. */
export function resetDemo(session: DemoSession): void {
  delete session.sessionId;
  delete session.startMs;
  delete session.total;
  delete session.withdrawn;
  delete session.mode;
  delete session.vestingAddress;
  delete session.lastClaimTx;
}
