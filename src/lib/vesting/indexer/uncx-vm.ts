// src/lib/vesting/indexer/uncx-vm.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNCX VestingManager event indexer — proof-of-concept for the event-driven
// migration. Scans VestingCreated events in a bounded block window, decodes
// each vesting schedule via getVestingSchedule(), normalises to VestingStream
// and upserts into vesting_streams_cache.
//
// Replaces the per-wallet recipient-discovery walk that uncx-vm.ts adapter
// did — that approach re-walked the same recipient set every daily seed and
// re-fetched their schedules even when nothing had changed. The indexer
// only does work proportional to NEW events since the last tick.
//
// The decode logic is intentionally copied from
// src/lib/vesting/adapters/uncx-vm.ts so the two paths produce identical
// VestingStream shapes during the migration. Once the indexer fully
// supplants the adapter, the adapter file can be retired (Phase 6).
// ─────────────────────────────────────────────────────────────────────────────

import { erc20Abi, type Hex, type PublicClient } from "viem";
import {
  CHAIN_IDS,
  type SupportedChainId,
  type VestingStream,
  computeStepVesting,
  nextUnlockTimeForSteps,
} from "../types";
import { writeToCache } from "../dbcache";
import type { Indexer } from "./types";

// Per-chain config — copied from src/lib/vesting/adapters/uncx-vm.ts.
// Single source of truth for genesis block + contract address.
const UNCX_VM_CONFIG: Partial<Record<SupportedChainId, {
  contractAddress: `0x${string}`;
  genesisBlock:    bigint;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    contractAddress: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    genesisBlock:    23_143_944n,
  },
  [CHAIN_IDS.BASE]: {
    contractAddress: "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45",
    genesisBlock:    43_187_425n,
  },
  [CHAIN_IDS.BSC]: {
    contractAddress: "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa",
    genesisBlock:    85_818_300n,
  },
};

// Verified on-chain topic hash for:
//   VestingCreated(uint256 indexed vestingId, address indexed beneficiary,
//                  address indexed token, ...)
const VESTING_CREATED_TOPIC =
  "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f" as Hex;

const VESTING_MANAGER_ABI = [
  {
    name: "getVestingSchedule",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "vestingId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "token",       type: "address" },
        { name: "creator",     type: "address" },
        { name: "beneficiary", type: "address" },
        { name: "totalAmount", type: "uint256" },
        { name: "isSoft",      type: "bool"    },
        { name: "isNftized",   type: "bool"    },
        { name: "isTopable",   type: "bool"    },
        { name: "released",    type: "uint256" },
        { name: "cancelled",   type: "bool"    },
        { name: "vestingType", type: "uint8"   },
        {
          name: "tranches",
          type: "tuple[]",
          components: [
            { name: "time",   type: "uint256" },
            { name: "amount", type: "uint256" },
          ],
        },
      ],
    }],
  },
] as const;

function makeIndexer(chainId: SupportedChainId): Indexer {
  const config = UNCX_VM_CONFIG[chainId];
  if (!config) throw new Error(`UNCX-VM not configured for chainId ${chainId}`);

  return {
    protocol:         "uncx-vm",
    chainId,
    genesisBlock:     config.genesisBlock,
    // 5000-block window. UNCX-VM has very sparse events (single-digit per
    // day on most chains) so per-window log payloads stay well under
    // free-tier RPC caps even at this width. Larger windows = faster
    // catch-up from a cold start.
    maxBlocksPerScan: 5000n,
    // 12-block lag is conservative for ETH and trivial for BSC/Base (both
    // fast-finality chains). Cheap insurance against re-org thrash.
    reorgLag:         12n,

    async scanWindow(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
      // 1. Pull VestingCreated logs from the window.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (client.getLogs as any)({
        address:   config.contractAddress,
        topics:    [VESTING_CREATED_TOPIC],
        fromBlock,
        toBlock,
      }) as { topics: readonly (Hex | null | undefined)[]; transactionHash?: Hex }[];

      const valid = logs.filter(
        (log) =>
          log.topics[0] === VESTING_CREATED_TOPIC &&
          log.topics.length >= 3 &&
          log.topics[1] != null &&
          log.topics[2] != null,
      );

      if (valid.length === 0) return { eventCount: 0 };

      // topic[1] = vestingId, topic[2] = beneficiary (both indexed, padded).
      // 2026-05-14: carry transactionHash through so the stream-detail
      // page can render a tap-to-explorer link back to the creation tx.
      const entries = valid.map((log) => ({
        vestingId: BigInt(log.topics[1] as Hex),
        recipient: `0x${(log.topics[2] as Hex).slice(26)}`,
        lockTxHash: log.transactionHash ?? null,
      }));

      // 2. Multicall every schedule for this batch.
      const scheduleResults = await client.multicall({
        contracts: entries.map(({ vestingId }) => ({
          address:      config.contractAddress,
          abi:          VESTING_MANAGER_ABI,
          functionName: "getVestingSchedule" as const,
          args:         [vestingId] as [bigint],
        })),
      });

      // 3. Decode → VestingStream, lazily fetching token metadata (cached
      //    per window to avoid duplicate readContract calls when the same
      //    token shows up in multiple events).
      const tokenCache = new Map<string, { symbol: string; decimals: number }>();
      const nowSec     = Math.floor(Date.now() / 1000);
      const streams: VestingStream[] = [];

      for (let i = 0; i < entries.length; i++) {
        const result = scheduleResults[i];
        if (result.status !== "success") continue;

        const schedule = result.result;
        if (schedule.cancelled) continue;

        const tokenAddr = schedule.token.toLowerCase();
        if (!tokenCache.has(tokenAddr)) {
          try {
            const [symbol, decimals] = await Promise.all([
              client.readContract({ address: schedule.token, abi: erc20Abi, functionName: "symbol"   }),
              client.readContract({ address: schedule.token, abi: erc20Abi, functionName: "decimals" }),
            ]);
            tokenCache.set(tokenAddr, { symbol, decimals });
          } catch {
            // Bad token (broken metadata) — placeholder & move on.
            tokenCache.set(tokenAddr, { symbol: "???", decimals: 18 });
          }
        }
        const { symbol: tokenSymbol, decimals: tokenDecimals } = tokenCache.get(tokenAddr)!;

        const unlockSteps = [...schedule.tranches]
          .map((t) => ({ timestamp: Number(t.time), amount: t.amount.toString() }))
          .sort((a, b) => a.timestamp - b.timestamp);

        const total     = schedule.totalAmount;
        const withdrawn = schedule.released;
        const { claimableNow, lockedAmount, isFullyVested } =
          computeStepVesting(total, withdrawn, unlockSteps, nowSec);

        streams.push({
          id:              `uncx-vm-${chainId}-${entries[i].vestingId.toString()}`,
          protocol:        "uncx-vm",
          category:        "vesting",
          chainId,
          recipient:       entries[i].recipient,
          tokenAddress:    tokenAddr,
          tokenSymbol,
          tokenDecimals,
          totalAmount:     total.toString(),
          withdrawnAmount: withdrawn.toString(),
          claimableNow:    claimableNow.toString(),
          lockedAmount:    lockedAmount.toString(),
          startTime:       unlockSteps[0]?.timestamp ?? 0,
          endTime:         unlockSteps.at(-1)?.timestamp ?? 0,
          cliffTime:       null,
          isFullyVested,
          nextUnlockTime:  nextUnlockTimeForSteps(nowSec, unlockSteps),
          shape:           "steps",
          unlockSteps,
          cancelable:      schedule.isSoft,
          lockTxHash:      entries[i].lockTxHash,
        });
      }

      // 4. Upsert. writeToCache's setWhere clause guarantees idempotency
      //    on re-run (reorg-lag re-scan + retry-on-error both rely on this).
      if (streams.length > 0) await writeToCache(streams);
      return { eventCount: streams.length };
    },
  };
}

export const uncxVmIndexers: Indexer[] = [
  makeIndexer(CHAIN_IDS.ETHEREUM),
  makeIndexer(CHAIN_IDS.BASE),
  makeIndexer(CHAIN_IDS.BSC),
];
