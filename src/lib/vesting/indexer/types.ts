// src/lib/vesting/indexer/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Event-driven indexer — type contracts.
//
// An Indexer is a per-protocol-per-chain object that knows how to:
//   1. Start scanning from a given fromBlock
//   2. Scan a bounded block window for relevant logs
//   3. Decode those logs into VestingStream rows and write them to cache
//
// The generic runner (./runner.ts) handles the resumption / state-persistence
// loop. Indexers themselves are stateless per call — they're handed a window
// and return how many events they processed. This split lets us iterate on
// individual protocol decoders without touching the cron / state plumbing.
//
// One Indexer object per (protocol, chainId). Registry at ./index.ts maps
// `${protocol}-${chainId}` → Indexer.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicClient } from "viem";
import type { SupportedChainId } from "../types";

export interface Indexer {
  /** Protocol slug — must match VestingStream.protocol. e.g. "uncx-vm". */
  readonly protocol: string;

  /** Target chain. One Indexer per (protocol, chainId). */
  readonly chainId: SupportedChainId;

  /**
   * Earliest block to scan from on a cold start. Usually the contract
   * deployment block (or close to it). Cron resumes from `indexer_state`
   * once initialised — this is the genesis fallback.
   */
  readonly genesisBlock: bigint;

  /**
   * Max blocks per scan window. Bounded to keep eth_getLogs response sizes
   * under free-tier RPC caps (~100KB). 100 is a safe default for low-volume
   * contracts; 1000+ works for sparser ones.
   */
  readonly maxBlocksPerScan: bigint;

  /**
   * Reorg lag — confirmed block = scanned block - reorgLag. Re-scans this
   * trailing window on every tick, so a reorg in the last N blocks gets
   * idempotently re-indexed via upsert.
   */
  readonly reorgLag: bigint;

  /**
   * Scan a half-open block window [fromBlock, toBlock] inclusive, decode any
   * relevant logs into VestingStream rows, write them to cache. Returns the
   * number of events processed (for diagnostics).
   *
   * Must be idempotent — re-running the same window twice MUST produce the
   * same cache state (the reorg-lag re-scan and resumability rely on this).
   */
  scanWindow(
    client:    PublicClient,
    fromBlock: bigint,
    toBlock:   bigint,
  ): Promise<{ eventCount: number }>;
}
