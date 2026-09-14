// src/lib/vesting/ingestors/doppler-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Doppler DERC20 claim ingestor.
//
// A beneficiary releasing vested tokens emits, on the TOKEN contract:
//   event TokensReleased(address indexed beneficiary, uint256 indexed scheduleId, uint256 amount)
// There is one token per launch, so we get the address set from the registry
// (doppler_vesting_allocations for the user's wallets, enabled integrators
// only) and scan each asset from its discovery block. `beneficiary` is
// indexed, so the log filter is exact. Timestamps come from block headers
// (cached per block). Handed off to upsertClaimEvents() (which prices in USD).
// ─────────────────────────────────────────────────────────────────────────────

import { getAddress, type GetLogsReturnType } from "viem";
import { upsertClaimEvents, type ClaimEventInput } from "./shared";
import { type SupportedChainId } from "../types";
import { makeFallbackClient } from "../rpc";
import {
  DOPPLER_AIRLOCK,
  DERC20_ABI,
  readAllocationsForWallets,
  streamId,
} from "../adapters/doppler";

const RELEASED_EVENT = DERC20_ABI[10]; // TokensReleased

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.keys(DOPPLER_AIRLOCK).map(Number) as SupportedChainId[];

export async function ingestDopplerClaimsForUser(
  userId:   string | null,
  wallets:  string[],
  chainIds: SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;
  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    if (!DOPPLER_AIRLOCK[chainId]) continue;
    const allocs = await readAllocationsForWallets(wallets, chainId);
    if (allocs.length === 0) continue;

    const client = makeFallbackClient(chainId, { forLogs: true });
    if (!client) continue;

    let latestBlock: bigint;
    try {
      latestBlock = await client.getBlockNumber();
    } catch (err) {
      console.error(`[doppler-claims] getBlockNumber chain ${chainId}:`, err);
      continue;
    }

    const blockTs = new Map<bigint, number>();
    const tsFor = async (n: bigint): Promise<number> => {
      const hit = blockTs.get(n);
      if (hit != null) return hit;
      const b = await client.getBlock({ blockNumber: n });
      const t = Number(b.timestamp);
      blockTs.set(n, t);
      return t;
    };

    // One scan per (asset, beneficiary). Assets are low-volume contracts and
    // the beneficiary topic makes the response tiny, so a single range call
    // from the discovery block is fine.
    const seen = new Set<string>();
    for (const a of allocs) {
      const key = `${a.asset}:${a.beneficiary}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let logs: GetLogsReturnType<typeof RELEASED_EVENT> = [];
      try {
        logs = await client.getLogs({
          address:   a.asset as `0x${string}`,
          event:     RELEASED_EVENT,
          args:      { beneficiary: getAddress(a.beneficiary) },
          fromBlock: a.discoveredBlock,
          toBlock:   latestBlock,
        });
      } catch (err) {
        console.error(`[doppler-claims] getLogs ${a.asset} ${a.beneficiary} chain ${chainId}:`, err);
        continue;
      }

      for (const l of logs) {
        if (l.args.scheduleId == null || l.args.amount == null) continue;
        const sid = Number(l.args.scheduleId);
        const row = allocs.find((x) => x.asset === a.asset && x.beneficiary === a.beneficiary && x.scheduleId === sid) ?? a;
        let claimedAt: number;
        try {
          claimedAt = await tsFor(l.blockNumber);
        } catch (err) {
          console.error(`[doppler-claims] block ${l.blockNumber} chain ${chainId}:`, err);
          continue;
        }
        inputs.push({
          userId,
          streamId:      streamId({ ...row, scheduleId: sid }),
          protocol:      "doppler",
          chainId,
          recipient:     a.beneficiary,
          tokenAddress:  a.asset,
          tokenSymbol:   a.tokenSymbol,
          tokenDecimals: a.tokenDecimals,
          amount:        l.args.amount.toString(),
          claimedAt:     new Date(claimedAt * 1000),
          txHash:        l.transactionHash,
        });
      }
    }
  }

  if (inputs.length === 0) return 0;
  return upsertClaimEvents(inputs);
}
