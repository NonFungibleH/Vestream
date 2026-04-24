// src/lib/vesting/tvl-walker/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the TVL walker subsystem.
//
// A "walker" exhaustively enumerates every vesting stream/lock/escrow for a
// given protocol × chain, aggregates locked amounts by token, and returns a
// serializable result that the snapshot pipeline can price.
//
// Why not reuse adapter.fetch()?
//   Adapters are wallet-scoped (`fetch(recipients, chainId)`) and designed
//   for per-user queries. Walkers are protocol-scoped (`walk(chainId)`) and
//   need to paginate through the entire data source without a recipient
//   filter. They also aggregate in-memory by token rather than returning
//   individual streams — TVL only needs `sum(lockedAmount)` per token.
//
// This separation keeps:
//   - adapter.fetch() fast (200 streams per user, max)
//   - walker.walk() thorough (everything, paginated, with retry + rate limit)
//   - vestingStreamsCache lean (only streams users actually query)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupportedChainId } from "../types";

/**
 * In-memory aggregate row — one per unique (chainId, tokenAddress) seen while
 * walking a protocol. `lockedAmount` is the sum of unclaimed remainder across
 * every stream for that token on that chain.
 */
export interface TokenAggregate {
  chainId:       number;
  /** Lowercase for EVM; base58 for Solana SPL mints. */
  tokenAddress:  string;
  tokenSymbol:   string | null;
  tokenDecimals: number;
  /** Stringified bigint — sum of remaining (unclaimed × unvested) amount. */
  lockedAmount:  string;
  /** Number of distinct streams/locks contributing to this aggregate. */
  streamCount:   number;
}

/**
 * Walker output — what each protocol × chain walk returns.
 */
export interface WalkerResult {
  protocol:     string;              // ProtocolMeta.slug (or adapterId)
  chainId:      SupportedChainId;
  tokens:       TokenAggregate[];    // one row per unique token
  streamCount:  number;              // total streams enumerated (sum of per-token)
  /** When not null, the walk was partial — e.g. subgraph returned an error
   *  mid-pagination. Snapshot pipeline can choose to NOT overwrite the
   *  existing snapshot row in that case. */
  error:        string | null;
  /** Wall-clock milliseconds taken — for cron telemetry. */
  elapsedMs:    number;
}

/**
 * Walker function signature — one per protocol. Implementations live under
 * ./{protocol}.ts and are registered in ./index.ts.
 */
export type WalkerFn = (chainId: SupportedChainId) => Promise<WalkerResult>;
