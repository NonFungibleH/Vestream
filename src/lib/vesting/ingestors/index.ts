// src/lib/vesting/ingestors/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fan-out orchestrator for claim event ingestion across all 10 supported
// protocols. Each per-protocol ingestor lives in a separate file and
// exports a function with the shape:
//
//   ingest{Protocol}ClaimsForUser(userId, wallets, chainIds?) → Promise<number>
//
// `ingestAllClaimsForUser` runs them all in parallel and returns a per-
// protocol breakdown of how many new events landed. Adapters that aren't
// yet implemented return 0 with a clear `notImplemented: true` flag so
// the API surface honestly reports coverage.
//
// Phase 1 shipped Sablier. Phase 2 filled in the seven remaining
// adapters. Each is a self-contained file because the data sources differ
// substantially:
//
//   sablier      — Envio Hasura GraphQL endpoint           ✅ shipped
//   hedgey       — eth_getLogs PlanRedeemed events         ✅ shipped
//   team-finance — Squid endpoint vestingClaims            ✅ shipped (synthetic txHash)
//   pinksale     — eth_getLogs LockUnlocked + multicall    ✅ shipped
//   uncx         — The Graph subgraph WithdrawEvent        ✅ shipped
//   uncx-vm      — eth_getLogs TokensReleased events       ✅ shipped
//   unvest       — The Graph subgraph Claim entity         ✅ shipped
//   superfluid   — Subgraph cliff + end events             ✅ shipped (flow accrual N/A)
//   streamflow   — Solana program account snapshot diffs   ✅ shipped (Solana-gated)
//   jupiter-lock — Solana program account snapshot diffs   ✅ shipped (Solana-gated)
//
// All 10 ingestors shipped. EVM ingestors run unconditionally. Solana
// ingestors (streamflow, jupiter-lock) self-gate on SOLANA_ENABLED=true
// + SOLANA_RPC_URL — they no-op silently in EVM-only deployments.
// Schemas verified via GraphQL introspection against live subgraphs;
// event signatures verified against deployed contract sources.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupportedChainId } from "../types";
import { ingestSablierClaimsForUser } from "./sablier-claims";
import { ingestHedgeyClaimsForUser } from "./hedgey-claims";
import { ingestTeamFinanceClaimsForUser } from "./team-finance-claims";
import { ingestPinksaleClaimsForUser } from "./pinksale-claims";
import { ingestUncxVmClaimsForUser } from "./uncx-vm-claims";
import { ingestUncxClaimsForUser } from "./uncx-claims";
import { ingestUnvestClaimsForUser } from "./unvest-claims";
import { ingestSuperfluidClaimsForUser } from "./superfluid-claims";
import { ingestStreamflowClaimsForUser } from "./streamflow-claims";
import { ingestJupiterLockClaimsForUser } from "./jupiter-lock-claims";

export type AdapterId =
  | "sablier"
  | "hedgey"
  | "uncx"
  | "uncx-vm"
  | "unvest"
  | "team-finance"
  | "superfluid"
  | "pinksale"
  | "streamflow"
  | "jupiter-lock";

export interface IngestResult {
  protocol:        AdapterId;
  inserted:        number;
  notImplemented?: true;
  error?:          string;
}

/** Adapters with shipped ingestors. Update this list as Phase 2 lands
 *  each one. Determines what /api/claims/history reports as `coverage`
 *  vs `pending`. */
export const SHIPPED_INGESTORS: AdapterId[] = [
  "sablier",
  "hedgey",
  "team-finance",
  "pinksale",
  "uncx-vm",
  "uncx",
  "unvest",
  "superfluid",
  "streamflow",
  "jupiter-lock",
];

/**
 * Run every adapter's ingestor in parallel for the given user. Returns
 * a per-protocol breakdown so the API surface can honestly report
 * coverage and the UI can surface "X protocols indexed, Y pending".
 *
 * Errors are isolated per-adapter — one ingestor failing doesn't block
 * the others. A failed adapter returns inserted: 0 + an error string.
 */
export async function ingestAllClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds?: SupportedChainId[],
): Promise<IngestResult[]> {
  const tasks: Array<Promise<IngestResult>> = [
    // Shipped:
    ingestSablierClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "sablier" as const, inserted }))
      .catch((err) => ({ protocol: "sablier" as const, inserted: 0, error: String(err?.message ?? err) })),
    ingestHedgeyClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "hedgey" as const, inserted }))
      .catch((err) => ({ protocol: "hedgey" as const, inserted: 0, error: String(err?.message ?? err) })),
    ingestTeamFinanceClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "team-finance" as const, inserted }))
      .catch((err) => ({ protocol: "team-finance" as const, inserted: 0, error: String(err?.message ?? err) })),

    ingestPinksaleClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "pinksale" as const, inserted }))
      .catch((err) => ({ protocol: "pinksale" as const, inserted: 0, error: String(err?.message ?? err) })),
    ingestUncxVmClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "uncx-vm" as const, inserted }))
      .catch((err) => ({ protocol: "uncx-vm" as const, inserted: 0, error: String(err?.message ?? err) })),
    ingestUncxClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "uncx" as const, inserted }))
      .catch((err) => ({ protocol: "uncx" as const, inserted: 0, error: String(err?.message ?? err) })),
    ingestUnvestClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "unvest" as const, inserted }))
      .catch((err) => ({ protocol: "unvest" as const, inserted: 0, error: String(err?.message ?? err) })),

    // Superfluid ships discrete cliff + end events from the hosted
    // VestingScheduler subgraph. Continuous flow accrual between
    // cliff and end is NOT yet captured as discrete claim_events —
    // see superfluid-claims.ts header comment.
    ingestSuperfluidClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "superfluid" as const, inserted }))
      .catch((err) => ({ protocol: "superfluid" as const, inserted: 0, error: String(err?.message ?? err) })),

    // Solana adapters: snapshot-diff strategy via vestingStreamsCache.
    // Gated behind SOLANA_ENABLED=true. See per-file headers for the
    // limitations (first-run baseline = lump sum, multi-claim bundling
    // between refreshes).
    ingestStreamflowClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "streamflow" as const, inserted }))
      .catch((err) => ({ protocol: "streamflow" as const, inserted: 0, error: String(err?.message ?? err) })),
    ingestJupiterLockClaimsForUser(userId, wallets, chainIds)
      .then((inserted) => ({ protocol: "jupiter-lock" as const, inserted }))
      .catch((err) => ({ protocol: "jupiter-lock" as const, inserted: 0, error: String(err?.message ?? err) })),
  ];

  return Promise.all(tasks);
}

export { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
export {
  ingestSablierClaimsForUser,
  getClaimHistoryForUser,
} from "./sablier-claims";
