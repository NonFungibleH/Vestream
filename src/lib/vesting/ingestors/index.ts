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
import { isAdapterEnabled } from "@/lib/protocol-constants";

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

/** Map each adapter id to its ingestor fn. Single source of truth used by
 *  both the full fan-out and the scoped per-token path. */
const INGESTOR_BY_PROTOCOL: Record<AdapterId, (u: string, w: string[], c?: SupportedChainId[]) => Promise<number>> = {
  "sablier":      ingestSablierClaimsForUser,
  "hedgey":       ingestHedgeyClaimsForUser,
  "team-finance": ingestTeamFinanceClaimsForUser,
  "pinksale":     ingestPinksaleClaimsForUser,
  "uncx-vm":      ingestUncxVmClaimsForUser,
  "uncx":         ingestUncxClaimsForUser,
  "unvest":       ingestUnvestClaimsForUser,
  "superfluid":   ingestSuperfluidClaimsForUser,
  "streamflow":   ingestStreamflowClaimsForUser,
  "jupiter-lock": ingestJupiterLockClaimsForUser,
};

function runGated(protocol: AdapterId, run: () => Promise<number>): Promise<IngestResult> {
  if (!isAdapterEnabled(protocol)) return Promise.resolve({ protocol, inserted: 0 });
  return run()
    .then((inserted) => ({ protocol, inserted }))
    .catch((err): IngestResult => ({ protocol, inserted: 0, error: String(err?.message ?? err) }));
}

/**
 * Scoped ingest for a single token: only run the ingestor(s) for the
 * token's protocol(s) on its chain. Much cheaper than the full fan-out
 * (one chain, 1–2 protocols vs 10 protocols × all chains) — this powers
 * the per-token "Run report" button on the Tax page. The ingestors don't
 * filter by token address themselves, but the per-token history GET
 * filters on read; ingesting the user's other claims on the same
 * protocol/chain is legitimate (it's their data) and idempotent.
 */
export async function ingestClaimsForToken(
  userId:  string,
  wallets: string[],
  opts: { chainId: SupportedChainId; protocols: AdapterId[] },
): Promise<IngestResult[]> {
  const seen = new Set<AdapterId>();
  const tasks = opts.protocols
    .filter((p) => INGESTOR_BY_PROTOCOL[p] && !seen.has(p) && (seen.add(p), true))
    .map((protocol) => runGated(protocol, () => INGESTOR_BY_PROTOCOL[protocol](userId, wallets, [opts.chainId])));
  return Promise.all(tasks);
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
  // Adapter gating: protocols flagged `disabled: true` in protocol-constants
  // (e.g. team-finance, paused May 2026) are short-circuited here so no
  // upstream API call goes out. Same gate as seedAll + aggregateVestingStreams
  // — keep all three entry points consistent when toggling.
  const gated = <P extends AdapterId>(
    protocol: P,
    run: () => Promise<number>,
  ): Promise<IngestResult> => {
    if (!isAdapterEnabled(protocol)) {
      return Promise.resolve({ protocol, inserted: 0 });
    }
    return run()
      .then((inserted) => ({ protocol, inserted }))
      .catch((err): IngestResult => ({ protocol, inserted: 0, error: String(err?.message ?? err) }));
  };

  const tasks: Array<Promise<IngestResult>> = [
    // Shipped:
    gated("sablier",      () => ingestSablierClaimsForUser(userId, wallets, chainIds)),
    gated("hedgey",       () => ingestHedgeyClaimsForUser(userId, wallets, chainIds)),
    gated("team-finance", () => ingestTeamFinanceClaimsForUser(userId, wallets, chainIds)),

    gated("pinksale",     () => ingestPinksaleClaimsForUser(userId, wallets, chainIds)),
    gated("uncx-vm",      () => ingestUncxVmClaimsForUser(userId, wallets, chainIds)),
    gated("uncx",         () => ingestUncxClaimsForUser(userId, wallets, chainIds)),
    gated("unvest",       () => ingestUnvestClaimsForUser(userId, wallets, chainIds)),

    // Superfluid ships discrete cliff + end events from the hosted
    // VestingScheduler subgraph. Continuous flow accrual between
    // cliff and end is NOT yet captured as discrete claim_events —
    // see superfluid-claims.ts header comment.
    gated("superfluid",   () => ingestSuperfluidClaimsForUser(userId, wallets, chainIds)),

    // Solana adapters: snapshot-diff strategy via vestingStreamsCache.
    // Gated behind SOLANA_ENABLED=true. See per-file headers for the
    // limitations (first-run baseline = lump sum, multi-claim bundling
    // between refreshes).
    gated("streamflow",   () => ingestStreamflowClaimsForUser(userId, wallets, chainIds)),
    gated("jupiter-lock", () => ingestJupiterLockClaimsForUser(userId, wallets, chainIds)),
  ];

  return Promise.all(tasks);
}

export { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
export {
  ingestSablierClaimsForUser,
  getClaimHistoryForUser,
} from "./sablier-claims";
