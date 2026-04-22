// src/lib/demo/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the 15-minute vesting demo.
//
// Both simulation and Sepolia modes return the same DemoVestingState shape so
// the UI can render identically regardless of backend.
// ─────────────────────────────────────────────────────────────────────────────

import type { DemoMode } from "./config";

/**
 * Demo session — persisted in an iron-session cookie. Client owns the state;
 * the server is stateless per request (apart from on-chain reads in Sepolia
 * mode, which are idempotent).
 */
export interface DemoSession {
  /** UUID assigned at demo-start. */
  sessionId?: string;
  /** Unix ms when the vesting schedule began. */
  startMs?: number;
  /** Total amount locked (stringified bigint, 18 decimals). */
  total?: string;
  /** Cumulative amount the user has claimed so far (stringified bigint). */
  withdrawn?: string;
  /** Mode this session was started in (simulation | sepolia). */
  mode?: DemoMode;
  /** Optional on-chain vesting contract address (sepolia mode only). */
  vestingAddress?: string;
  /** Optional tx hash of the latest claim (sepolia mode only). */
  lastClaimTx?: string;
}

/** Public response shape returned by /api/demo/* routes. */
export interface DemoVestingState {
  sessionId:      string | null;
  mode:           DemoMode;
  active:         boolean;
  /** Unix ms. */
  startMs:        number | null;
  /** Unix ms. */
  endMs:          number | null;
  /** Seconds remaining until fully vested; 0 when done. */
  remainingSec:   number;
  /** 0–1 progress. */
  progress:       number;
  tokenSymbol:    string;
  tokenDecimals:  number;
  /** Stringified bigint. */
  total:          string;
  /** Stringified bigint. */
  vested:         string;
  /** Stringified bigint — ready to withdraw right now. */
  claimableNow:   string;
  /** Stringified bigint — cumulative claimed. */
  withdrawn:      string;
  /** Stringified bigint — not yet vested. */
  locked:         string;
  /** Only populated in sepolia mode. */
  vestingAddress: string | null;
  lastClaimTx:    string | null;
  explorerUrl:    string | null;
}
