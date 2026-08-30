// src/lib/vesting/indexer/hoodlock.ts
// ─────────────────────────────────────────────────────────────────────────────
// HoodLock (RobinhoodLocker) event indexer — Robinhood Chain (4663).
//
// Strategy: scan ALL of the locker's events in a block window, collect the set
// of lock ids touched by any of them (Locked / Withdrawn / Extended /
// LockOwnershipTransferred all carry `id` as the first indexed topic), then
// re-read each touched lock's CURRENT state via getLock() and upsert. Reading
// current state (rather than decoding each event type) means create, withdraw,
// extend and ownership-transfer are all handled by one idempotent path — the
// row always reflects the lock's authoritative on-chain state.
//
// The decode → VestingStream mapping is shared with the adapter
// (adapters/hoodlock.ts → locksToVestingStreams) so the adapter and indexer
// produce byte-identical rows.
// ─────────────────────────────────────────────────────────────────────────────

import type { Hex, PublicClient } from "viem";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { writeToCache } from "../dbcache";
import type { Indexer } from "./types";
import {
  HOODLOCK_CONTRACTS,
  HOODLOCK_GENESIS_BLOCK,
  readLocks,
  fetchTokenMeta,
  locksToVestingStreams,
} from "../adapters/hoodlock";

// FeeChanged carries no `id` topic — skip it when collecting lock ids.
const FEE_CHANGED_TOPIC =
  "0x6bbc57480a46553fa4d156ce702beef5f3ad66303b0ed1a5d4cb44966c6584c3" as Hex;

function makeIndexer(chainId: SupportedChainId): Indexer {
  const contractAddress = HOODLOCK_CONTRACTS[chainId];
  if (!contractAddress) throw new Error(`HoodLock not configured for chainId ${chainId}`);

  return {
    protocol:     "hoodlock",
    chainId,
    genesisBlock: HOODLOCK_GENESIS_BLOCK,
    // Robinhood Chain has very fast blocks (head ~49M two months in) but the
    // locker is a single low-volume contract, and the official RPC serves
    // address-filtered getLogs over the FULL range in one call (verified). The
    // indexer cron runs daily, so use a wide window to catch up cold-start in a
    // single tick rather than over many days. If the RPC ever adds a range cap,
    // the runner just makes smaller daily progress instead.
    maxBlocksPerScan: 50_000_000n,
    // Arbitrum-Orbit L2, fast finality — a small lag is ample insurance.
    reorgLag: 20n,

    async scanWindow(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
      // Pull every log from the locker in this window (no topic filter), then
      // collect the lock ids touched by any event that carries one.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (client.getLogs as any)({
        address: contractAddress,
        fromBlock,
        toBlock,
      }) as { topics: readonly (Hex | null | undefined)[] }[];

      const ids = new Set<string>();
      for (const log of logs) {
        const topic0 = log.topics[0];
        if (!topic0 || topic0 === FEE_CHANGED_TOPIC) continue;
        const idTopic = log.topics[1];
        if (idTopic != null) ids.add(BigInt(idTopic).toString());
      }
      if (ids.size === 0) return { eventCount: 0 };

      // Re-read current state for every touched lock → authoritative rows.
      const raw = await readLocks([...ids].map((x) => BigInt(x)), chainId);
      if (raw.length === 0) return { eventCount: 0 };

      const meta    = await fetchTokenMeta(raw.map((l) => l.token), chainId);
      const streams = locksToVestingStreams(raw, meta, chainId);

      // writeToCache's setWhere clause makes the upsert idempotent — the
      // reorg-lag re-scan and retry-on-error both rely on this.
      if (streams.length > 0) await writeToCache(streams);
      return { eventCount: streams.length };
    },
  };
}

export const hoodlockIndexers: Indexer[] = [
  makeIndexer(CHAIN_IDS.ROBINHOOD),
];
