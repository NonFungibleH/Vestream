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
  nextUnlockTimeForSteps,
} from "../types";
import { writeToCache } from "../dbcache";
import type { Indexer } from "./types";

// Per-chain config — copied from src/lib/vesting/adapters/uncx-vm.ts.
// Single source of truth for genesis block + contract address.
const UNCX_VM_CONFIG: Partial<Record<SupportedChainId, {
  contractAddress: `0x${string}`;
  genesisBlock:    bigint;
  /** Per-chain override for the log window. Omitted = DEFAULT_SCAN_WINDOW. */
  maxBlocksPerScan?: bigint;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    contractAddress: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    genesisBlock:    23_143_944n,
  },
  [CHAIN_IDS.BASE]: {
    contractAddress: "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45",
    genesisBlock:    43_187_425n,
    // Base's official RPC hard-caps eth_getLogs at a 2,000-block range
    // ("eth_getLogs is limited to a 2,000 range"), and it is the only
    // log-capable free provider left on this chain — drpc rejects every
    // range on its free plan regardless of size. The shared 5,000 default
    // therefore failed on EVERY window and the cursor sat still for 87h.
    maxBlocksPerScan: 2000n,
  },
  [CHAIN_IDS.BSC]: {
    contractAddress: "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa",
    genesisBlock:    85_818_300n,
  },
  // Robinhood Chain (2026-09-12). UNCX shipped their V2 token vesting here —
  // address from their own deployment docs, then verified on-chain: 26,672
  // bytes of code, and the contract emits the same VestingCreated topic this
  // indexer already decodes, so no new decode path is needed.
  //
  // Genesis is the deployment block, found by binary search on eth_getCode;
  // the first vesting is in that very block. Usage is genuinely early — two
  // vestings at the time of writing (blocks 59,662,330 and 59,731,743) — but
  // indexing from day one costs one cron tick and means no backfill later.
  // Same reasoning as the HoodLock bet on this chain.
  [CHAIN_IDS.ROBINHOOD]: {
    contractAddress: "0xB31eAEFA2A0bdC53Df6D7a7f0f289b6eE1a8AAF3",
    genesisBlock:    59_662_330n,
  },
};

// Verified on-chain topic hash for:
//   VestingCreated(uint256 indexed vestingId, address indexed beneficiary,
//                  address indexed token, ...)
const VESTING_CREATED_TOPIC =
  "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f" as Hex;

// 2026-06-10: struct corrected to match the Sourcify-verified ABI and
// kept identical to adapters/uncx-vm.ts. The old shape mis-decoded
// (wrong top-level field order + 2-field tranches where the contract has
// 3), producing garbage claimable. tranche.amount is CUMULATIVE; claimable
// is read from getReleasableAmount. See the adapter header for the full
// write-up — these two decode paths MUST stay in lockstep.
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
        { name: "released",    type: "uint256" },
        { name: "isSoft",      type: "bool"    },
        { name: "isNftized",   type: "bool"    },
        { name: "cancelled",   type: "bool"    },
        { name: "isTopable",   type: "bool"    },
        { name: "vestingType", type: "uint8"   },
        {
          name: "tranches",
          type: "tuple[]",
          components: [
            { name: "time",   type: "uint256" },
            { name: "amount", type: "uint256" }, // CUMULATIVE
            { name: "flag",   type: "uint256" },
          ],
        },
      ],
    }],
  },
  {
    name: "getReleasableAmount",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "vestingId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Cumulative tranche amounts → incremental unlockSteps. Mirror of the
 *  helper in adapters/uncx-vm.ts (kept inline so the two decode paths are
 *  self-contained). Input must be time-sorted. */
function cumulativeToIncremental(
  sorted: { timestamp: number; cumulative: bigint }[],
): { timestamp: number; amount: string }[] {
  const steps: { timestamp: number; amount: string }[] = [];
  let prev = 0n;
  for (const t of sorted) {
    const inc = t.cumulative > prev ? t.cumulative - prev : 0n;
    steps.push({ timestamp: t.timestamp, amount: inc.toString() });
    prev = t.cumulative;
  }
  return steps;
}

/** Default log window. UNCX-VM events are sparse (single digits per day on
 *  most chains), so payloads stay well under free-tier caps even this wide,
 *  and wider windows mean faster catch-up from a cold start. Chains whose RPC
 *  caps the RANGE itself override it in UNCX_VM_CONFIG. */
const DEFAULT_SCAN_WINDOW = 5000n;

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
    maxBlocksPerScan: config.maxBlocksPerScan ?? DEFAULT_SCAN_WINDOW,
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

      // 2. Multicall every schedule + its authoritative releasable amount.
      const scheduleResults = await client.multicall({
        contracts: entries.map(({ vestingId }) => ({
          address:      config.contractAddress,
          abi:          VESTING_MANAGER_ABI,
          functionName: "getVestingSchedule" as const,
          args:         [vestingId] as [bigint],
        })),
      });
      const releasableResults = await client.multicall({
        contracts: entries.map(({ vestingId }) => ({
          address:      config.contractAddress,
          abi:          VESTING_MANAGER_ABI,
          functionName: "getReleasableAmount" as const,
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

        const sortedCum = [...schedule.tranches]
          .map((t) => ({ timestamp: Number(t.time), cumulative: t.amount }))
          .sort((a, b) => a.timestamp - b.timestamp);
        const unlockSteps = cumulativeToIncremental(sortedCum);

        const total     = schedule.totalAmount;
        const withdrawn = schedule.released;
        const releasableRes = releasableResults[i];
        const claimableNow  = releasableRes?.status === "success" ? releasableRes.result : 0n;
        const remaining     = total > withdrawn ? total - withdrawn : 0n;
        const lockedAmount  = remaining > claimableNow ? remaining - claimableNow : 0n;
        const isFullyVested = lockedAmount === 0n && claimableNow === 0n;

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
          // In-app claiming: release(vestingId) on the VestingManager —
          // keep in lockstep with adapters/uncx-vm.ts. Without these the
          // indexer's 30-min ticks would overwrite the adapter-seeded
          // claim fields with undefined.
          claimContract:   config.contractAddress,
          claimNativeId:   entries[i].vestingId.toString(),
        });
      }

      // 4. Upsert. writeToCache's setWhere clause guarantees idempotency
      //    on re-run (reorg-lag re-scan + retry-on-error both rely on this).
      if (streams.length > 0) await writeToCache(streams);
      return { eventCount: streams.length };
    },
  };
}

// Derived from UNCX_VM_CONFIG rather than listed again here: the two had to
// be kept in step by hand, and adding Robinhood Chain to the config alone
// (2026-09-12) silently registered no indexer at all — findIndexer returned
// undefined and the cron would have 404'd with the config looking correct.
export const uncxVmIndexers: Indexer[] = (
  Object.keys(UNCX_VM_CONFIG).map(Number) as SupportedChainId[]
).map(makeIndexer);
