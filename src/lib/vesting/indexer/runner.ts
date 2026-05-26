// src/lib/vesting/indexer/runner.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generic indexer runner — resumable, bounded-window log scanner.
//
// Each tick:
//   1. Read indexer_state for (protocol, chainId) — get lastConfirmedBlock
//   2. Compute current chain head via fallback client
//   3. Build the scan window: [lastConfirmedBlock + 1, min(head - reorgLag,
//      lastConfirmedBlock + maxBlocksPerScan)]
//   4. Call indexer.scanWindow(...) — protocol-specific decoder writes to cache
//   5. Update indexer_state with new scanned / confirmed pointers, runAt,
//      eventCount; clear lastError
//
// Failure path: catch any error from scanWindow / RPC, write it to
// indexer_state.lastError, update lastAttemptAt (NOT lastRunAt), return.
// Next tick retries the same window — idempotent upsert guarantees re-runs
// are safe.
//
// The runner is intentionally chain/protocol agnostic. Add a new indexer by
// implementing the Indexer interface in ./<protocol>.ts and registering it
// in ./index.ts. No changes to runner.ts needed.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { indexerState } from "@/lib/db/schema";
import { makeFallbackClient } from "../rpc";
import type { Indexer } from "./types";

export interface RunResult {
  protocol:           string;
  chainId:            number;
  fromBlock:          bigint;
  toBlock:            bigint;
  eventCount:         number;
  durationMs:         number;
  skipped?:           "caught-up" | "no-client";
  error?:             string;
}

export async function runIndexer(indexer: Indexer): Promise<RunResult> {
  const startedAt = Date.now();
  const { protocol, chainId, genesisBlock, maxBlocksPerScan, reorgLag } = indexer;

  // Build the RPC client up front — `forLogs: true` to avoid log-pruned
  // free-tier providers (publicnode et al).
  const client = makeFallbackClient(chainId, { forLogs: true });
  if (!client) {
    return {
      protocol, chainId, fromBlock: 0n, toBlock: 0n,
      eventCount: 0, durationMs: Date.now() - startedAt,
      skipped: "no-client",
      error: `No log-capable RPC pool for chainId ${chainId}`,
    };
  }

  // 1. Read current state (or fall back to genesis).
  const existing = await db.select()
    .from(indexerState)
    .where(and(
      eq(indexerState.protocol, protocol),
      eq(indexerState.chainId,  chainId),
    ))
    .limit(1);

  // A `lastConfirmedBlock` of 0 means this row was inserted by touchAttempt()
  // (failed-first-tick stub) — the schema defaults the column to 0 notNull,
  // so a row created with only `lastAttemptAt`/`lastError` ends up with
  // confirmedBlock=0. Treat that as uninitialised and fall back to
  // genesisBlock - 1n. Without this guard an indexer that fails its first
  // tick gets stuck scanning from block 1 forever — Hedgey/137 was hitting
  // this (2026-05-26): fromBlock=0x1 instead of the configured 71_700_000.
  const existingBlock = existing[0]?.lastConfirmedBlock ?? 0;
  const lastConfirmed = existingBlock > 0
    ? BigInt(existingBlock)
    : genesisBlock - 1n;

  // 2. Get chain head.
  const head = await client.getBlockNumber();

  // 3. Compute scan window.
  const safeHead = head > reorgLag ? head - reorgLag : 0n;
  const fromBlock = lastConfirmed + 1n;
  if (fromBlock > safeHead) {
    // Nothing to do — already caught up to the confirmed tip.
    await touchAttempt(protocol, chainId, null);
    return {
      protocol, chainId, fromBlock, toBlock: safeHead,
      eventCount: 0, durationMs: Date.now() - startedAt,
      skipped: "caught-up",
    };
  }

  const windowEnd  = fromBlock + maxBlocksPerScan - 1n;
  const toBlock    = windowEnd < safeHead ? windowEnd : safeHead;

  // 4. Run the protocol-specific decoder.
  let eventCount = 0;
  try {
    const result = await indexer.scanWindow(client, fromBlock, toBlock);
    eventCount   = result.eventCount;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await touchAttempt(protocol, chainId, message);
    return {
      protocol, chainId, fromBlock, toBlock,
      eventCount: 0, durationMs: Date.now() - startedAt,
      error: message,
    };
  }

  // 5. Commit new state — `toBlock` becomes the new confirmed tip.
  const now = new Date();
  await db.insert(indexerState).values({
    protocol,
    chainId,
    lastScannedBlock:   Number(toBlock),
    lastConfirmedBlock: Number(toBlock),
    lastRunAt:          now,
    lastAttemptAt:      now,
    lastError:          null,
    lastEventCount:     eventCount,
    updatedAt:          now,
  }).onConflictDoUpdate({
    target: [indexerState.protocol, indexerState.chainId],
    set: {
      lastScannedBlock:   Number(toBlock),
      lastConfirmedBlock: Number(toBlock),
      lastRunAt:          now,
      lastAttemptAt:      now,
      lastError:          null,
      lastEventCount:     eventCount,
      updatedAt:          now,
    },
  });

  return {
    protocol, chainId, fromBlock, toBlock,
    eventCount, durationMs: Date.now() - startedAt,
  };
}

// Update lastAttemptAt + lastError without bumping lastRunAt — used for
// caught-up ticks (error: null) and failed ticks (error: message).
async function touchAttempt(protocol: string, chainId: number, error: string | null): Promise<void> {
  const now = new Date();
  await db.insert(indexerState).values({
    protocol,
    chainId,
    lastAttemptAt: now,
    lastError:     error,
    updatedAt:     now,
  }).onConflictDoUpdate({
    target: [indexerState.protocol, indexerState.chainId],
    set: {
      lastAttemptAt: now,
      lastError:     error,
      updatedAt:     now,
    },
  });
}
