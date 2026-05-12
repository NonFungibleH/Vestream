// src/lib/vesting/tvl-walker/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Walker registry — maps protocol slug → (chainId → WalkerResult) function.
//
// Used by the snapshot compute pipeline (src/lib/vesting/tvl-snapshot.ts) to
// dispatch per-protocol × chain walks. Each walker is an exhaustive enumerator
// of the protocol's underlying data source — subgraph for UNCX/Unvest/
// Superfluid/Team Finance, on-chain events for UNCX-VM/PinkSale, Solana
// program accounts for Jupiter Lock.
//
// Not in the registry (intentional):
//   - Streamflow — uses DefiLlama's chainTvls.vesting breakdown. Their
//     entry already exposes a vesting-specific slice that excludes their
//     payments product; no point reinventing it.
//
// Self-indexed via walker (added Phase 2/3 of the May 2026 TVL methodology
// pass): Sablier, Hedgey, LlamaPay. DefiLlama globalises across every
// chain those protocols deploy on, but Vestream only indexes a subset, so
// the passthrough was apples-to-oranges next to our self-indexed protocols
// (UNCX, Unvest, etc.) which only count the chains we actually walk.
//
// To add a new self-indexed protocol:
//   1. Write src/lib/vesting/tvl-walker/{protocol}.ts exporting walk{Protocol}
//   2. Register below
//   3. Add the slug to src/lib/protocol-constants.ts (without externalTvl)
//   4. The snapshot cron picks it up automatically
// ─────────────────────────────────────────────────────────────────────────────

import type { SupportedChainId } from "../types";
import type { WalkerFn, WalkerResult, TokenAggregate } from "./types";

import { walkUncx }        from "./uncx";
import { walkUncxVm }      from "./uncx-vm";
import { walkUnvest }      from "./unvest";
import { walkSuperfluid }  from "./superfluid";
import { walkTeamFinance } from "./team-finance";
import { walkPinkSale }    from "./pinksale";
import { walkJupiterLock } from "./jupiter-lock";
import { walkSablier }     from "./sablier";
import { walkHedgey }      from "./hedgey";
import { walkLlamapay }    from "./llamapay";

export type { WalkerResult, TokenAggregate, WalkerFn };

/**
 * Registry of exhaustive walkers, keyed by protocol slug. Each walker
 * enumerates its protocol's data source for the given chainId and returns
 * per-token aggregated locked amounts.
 *
 * The slug here matches ProtocolMeta.slug in protocol-constants.ts — so the
 * /protocols page card for "uncx" reads snapshot rows written by walkUncx +
 * walkUncxVm (combined via the adapterIds list in protocol-constants).
 */
export const WALKER_REGISTRY: Record<string, WalkerFn> = {
  "uncx":         walkUncx,
  "uncx-vm":      walkUncxVm,
  "unvest":       walkUnvest,
  "superfluid":   walkSuperfluid,
  "team-finance": walkTeamFinance,
  "pinksale":     walkPinkSale,
  "jupiter-lock": walkJupiterLock,
  "sablier":      walkSablier,
  "hedgey":       walkHedgey,
  "llamapay":     walkLlamapay,
};

/**
 * Human-readable list of protocols with walker coverage. Used by the cron
 * route to validate `?protocol=` query params and to build telemetry logs.
 */
export const WALKER_PROTOCOLS = Object.keys(WALKER_REGISTRY);

/**
 * Convenience dispatcher — invokes the walker for a given slug + chainId.
 * Returns null if no walker is registered for that slug.
 */
export async function runWalker(
  protocol: string,
  chainId:  SupportedChainId,
): Promise<WalkerResult | null> {
  const fn = WALKER_REGISTRY[protocol];
  if (!fn) return null;
  return fn(chainId);
}
