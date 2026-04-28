// src/lib/vesting/ingestors/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fan-out orchestrator for claim event ingestion across all 9 supported
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
// Phase 1 shipped Sablier. Phase 2 will fill in the seven remaining
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
//   superfluid   — VestingScheduler CFA flow integration   🚧 Phase 3 (different model)
//   streamflow   — Solana program account snapshot diffs   🚧 Phase 3
//   jupiter-lock — Solana program account snapshot diffs   🚧 Phase 3
//
// Each Phase 2 adapter is ~150 lines of work and needs to be verified
// against real subgraph responses — schema field names vary and shipping
// untested queries silently fails for users. Stubbed here with clear
// stubbing markers so the orchestrator + API surface land cleanly without
// claiming coverage we don't have.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupportedChainId } from "../types";
import { ingestSablierClaimsForUser } from "./sablier-claims";
import { ingestHedgeyClaimsForUser } from "./hedgey-claims";
import { ingestTeamFinanceClaimsForUser } from "./team-finance-claims";
import { ingestPinksaleClaimsForUser } from "./pinksale-claims";
import { ingestUncxVmClaimsForUser } from "./uncx-vm-claims";
import { ingestUncxClaimsForUser } from "./uncx-claims";
import { ingestUnvestClaimsForUser } from "./unvest-claims";

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
];

/** Stub for a not-yet-implemented adapter. Returns 0 + a flag the
 *  orchestrator surfaces in the response. */
async function notYetImplemented(protocol: AdapterId): Promise<IngestResult> {
  return { protocol, inserted: 0, notImplemented: true };
}

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

    // Superfluid: deferred. Vesting Scheduler uses Constant Flow
    // Agreements (CFA) — discrete events fire only at cliff
    // (`VestingCliffAndFlowExecutedEvent.cliffAmount`) and end
    // (`VestingEndExecutedEvent.earlyEndCompensation`); the bulk of
    // value transfer happens via continuous flow at `flowRate`, with
    // no discrete amount per claim. Tax-grade attribution needs flow
    // integration over the user's holding window — different model
    // from the per-event ingestors above. Tracked as Phase 3 work.
    notYetImplemented("superfluid"),

    // Phase 3 — Solana adapters. Different ingestion model entirely
    // (program-account snapshot diffs, no event log model) so they
    // cluster after the EVM ones.
    notYetImplemented("streamflow"),
    notYetImplemented("jupiter-lock"),
  ];

  return Promise.all(tasks);
}

export { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
export {
  ingestSablierClaimsForUser,
  getClaimHistoryForUser,
} from "./sablier-claims";
