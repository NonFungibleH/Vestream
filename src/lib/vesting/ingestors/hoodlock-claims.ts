// src/lib/vesting/ingestors/hoodlock-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// HoodLock (RobinhoodLocker) claim event ingestor — Robinhood Chain (4663).
//
// A HoodLock withdrawal releases the WHOLE lock at once, emitting:
//   event Withdrawn(uint256 indexed id, address indexed owner, uint256 amount)
// so each Withdrawn log is one claim of `amount`. `owner` is indexed, so we can
// getLogs filtered directly by the user's wallet. The event carries no token or
// timestamp, so we resolve token via getLock(id) and claimedAt via the log's
// block timestamp. Handed off to upsertClaimEvents() (which prices in USD).
// ─────────────────────────────────────────────────────────────────────────────

import { parseAbi, getAddress, type GetLogsReturnType } from "viem";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import { type SupportedChainId } from "../types";
import { makeFallbackClient } from "../rpc";
import { HOODLOCK_CONTRACTS, HOODLOCK_GENESIS_BLOCK, readLocks, fetchTokenMeta } from "../adapters/hoodlock";

const WITHDRAWN_EVENT = parseAbi([
  "event Withdrawn(uint256 indexed id, address indexed owner, uint256 amount)",
])[0];

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.keys(HOODLOCK_CONTRACTS).map(Number) as SupportedChainId[];

export async function ingestHoodlockClaimsForUser(
  userId:   string,
  wallets:  string[],
  chainIds: SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const contractAddress = HOODLOCK_CONTRACTS[chainId];
    const client = makeFallbackClient(chainId, { forLogs: true });
    if (!contractAddress || !client) continue;

    let latestBlock: bigint;
    try {
      latestBlock = await client.getBlockNumber();
    } catch (err) {
      console.error(`[hoodlock-claims] getBlockNumber chain ${chainId}:`, err);
      continue;
    }

    for (const wallet of wallets) {
      try {
        const owner = getAddress(wallet);

        // Withdrawn logs for this owner. The locker is a single low-volume
        // contract and the official RPC serves address-filtered getLogs over
        // the full range, so a single call is fine at current volume.
        let logs: GetLogsReturnType<typeof WITHDRAWN_EVENT> = [];
        try {
          logs = await client.getLogs({
            address:   contractAddress,
            event:     WITHDRAWN_EVENT,
            args:      { owner },
            fromBlock: HOODLOCK_GENESIS_BLOCK,
            toBlock:   latestBlock,
          });
        } catch (err) {
          console.error(`[hoodlock-claims] getLogs wallet ${wallet} chain ${chainId}:`, err);
          continue;
        }
        if (logs.length === 0) continue;

        // Resolve token address per lock id (the event omits it).
        const ids      = [...new Set(logs.map((l) => (l.args.id as bigint).toString()))].map((x) => BigInt(x));
        const locks    = await readLocks(ids, chainId);
        const tokenById = new Map(locks.map((l) => [l.id.toString(), l.token.toLowerCase()]));
        const meta      = await fetchTokenMeta(locks.map((l) => l.token), chainId);

        // Block timestamps (event carries none). Cache per block.
        const tsByBlock = new Map<string, number>();
        async function blockTs(bn: bigint): Promise<number> {
          const key = bn.toString();
          const cached = tsByBlock.get(key);
          if (cached != null) return cached;
          const block = await client!.getBlock({ blockNumber: bn });
          const ts = Number(block.timestamp);
          tsByBlock.set(key, ts);
          return ts;
        }

        for (const log of logs) {
          const id     = log.args.id as bigint;
          const amount = log.args.amount as bigint;
          if (typeof amount !== "bigint" || amount === 0n) continue;
          if (log.blockNumber == null) continue;

          const token = tokenById.get(id.toString());
          if (!token) continue;
          const m  = meta.get(token) ?? { symbol: "", decimals: 18 };
          const ts = await blockTs(log.blockNumber);
          const streamId = `hoodlock-${chainId}-${id.toString()}`;
          const txHash = log.transactionHash
            ? log.transactionHash.toLowerCase()
            : syntheticTxHash(streamId, ts);

          inputs.push({
            userId,
            streamId,
            protocol:      "hoodlock",
            chainId,
            recipient:     owner.toLowerCase(),
            tokenAddress:  token,
            tokenSymbol:   m.symbol || null,
            tokenDecimals: m.decimals,
            amount:        amount.toString(),
            claimedAt:     new Date(ts * 1000),
            txHash,
          });
        }
      } catch (err) {
        console.error(`[hoodlock-claims] wallet ${wallet} chain ${chainId} failed:`, err);
      }
    }
  }

  return upsertClaimEvents(inputs);
}
