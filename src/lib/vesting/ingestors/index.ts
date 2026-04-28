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
//   sablier      — Envio Hasura GraphQL endpoint           ✅ shipped (b6faad4)
//   hedgey       — eth_getLogs PlanTokensUnlocked events   🚧 Phase 2
//   uncx         — The Graph subgraph Withdrawal events    🚧 Phase 2
//   uncx-vm      — The Graph subgraph Released events      🚧 Phase 2
//   unvest       — The Graph subgraph Released events      🚧 Phase 2
//   team-finance — Squid endpoint VestingClaimed events    🚧 Phase 2
//   superfluid   — hosted subgraph TokenWithdrawnEvent     🚧 Phase 2
//   pinksale     — eth_getLogs LockUnlocked + multicall    🚧 Phase 2
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
export const SHIPPED_INGESTORS: AdapterId[] = ["sablier"];

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

    // Phase 2 — TODO: replace each with a real ingestor.
    // Each adapter has its own data source quirks; see the existing
    // adapters in /lib/vesting/adapters/{slug}.ts for the schema.
    notYetImplemented("hedgey"),
    notYetImplemented("uncx"),
    notYetImplemented("uncx-vm"),
    notYetImplemented("unvest"),
    notYetImplemented("team-finance"),
    notYetImplemented("superfluid"),
    notYetImplemented("pinksale"),

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
