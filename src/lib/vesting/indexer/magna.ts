// src/lib/vesting/indexer/magna.ts
// ─────────────────────────────────────────────────────────────────────────────
// Magna claim indexer — Phase 2 of the Magna integration.
//
// THE PROBLEM: Magna is merkle-based. A vester contract stores only merkle
// ROOTS; every recipient's allocation + unlock schedule lives in an off-chain
// leaf. So unlike Sablier/Hedgey/UNCX there is no on-chain enumeration of
// recipients, and Phase 1's TVL walker can only see aggregate escrow balances.
//
// THE INSIGHT: a claim REVEALS the leaf. `withdraw(amount, rootIndex,
// decodableArgs, proof)` carries the caller's encoded leaf, and the vester
// exposes view functions that decode exactly those args back into structured
// data:
//   getCalendarLeafAllocationData(rootIndex, decodableArgs, proof)
//     → (CalendarAllocation, CalendarUnlockSchedule{unlockTimestamps[], unlockAmounts[]})
//   getIntervalLeafAllocationData(...)
//     → (IntervalAllocation,  IntervalUnlockSchedule{pieces[]{startDate, periodLength, numberOfPeriods, amount}})
// Both carry Allocation{id, originalBeneficiary, totalAllocation, …} and
// DistributionState{withdrawalAddress, withdrawn, fundedAmount, terminated…}.
//
// So: watch ERC-20 Transfer OUT of each known vester (the claim payout),
// pull the originating tx, decode its withdraw() calldata, then call the
// matching leaf view to recover the FULL vesting schedule for that recipient
// and write a normal VestingStream to cache. From then on that recipient's
// Magna vesting behaves like any other protocol on Vestream — token pages,
// unlock calendar, alerts, tax.
//
// Coverage: recipients who have claimed at least once. Never-claimed
// allocations stay invisible on-chain (Phase 3 fills those via Magna's public
// Portal API). Documented in CLAUDE.md alongside the Team Finance merkle note.
//
// Discovery of WHICH vesters to watch comes from the magna_vesters registry
// populated by the Phase 1 walker (seed + factory scans).
// ─────────────────────────────────────────────────────────────────────────────

import { decodeFunctionData, erc20Abi, type Hex, type PublicClient } from "viem";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { magnaVesters } from "@/lib/db/schema";
import {
  CHAIN_IDS,
  type SupportedChainId,
  type VestingStream,
  nextUnlockTimeForSteps,
} from "../types";
import { writeToCache } from "../dbcache";
import type { Indexer } from "./types";

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

const VESTER_ABI = [
  { name: "token", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "withdrawalAmount", type: "uint256" },
      { name: "rootIndex",        type: "uint32"  },
      { name: "decodableArgs",    type: "bytes"   },
      { name: "proof",            type: "bytes32[]" },
      { name: "postClaimHandler", type: "address" },
      { name: "extraData",        type: "bytes"   },
    ],
    outputs: [],
  },
  {
    // Overload without the post-claim handler.
    name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "withdrawalAmount", type: "uint256" },
      { name: "rootIndex",        type: "uint32"  },
      { name: "decodableArgs",    type: "bytes"   },
      { name: "proof",            type: "bytes32[]" },
    ],
    outputs: [],
  },
  { name: "multicall", type: "function", stateMutability: "nonpayable", inputs: [{ name: "data", type: "bytes[]" }], outputs: [] },
  {
    name: "getCalendarLeafAllocationData", type: "function", stateMutability: "view",
    inputs: [
      { name: "rootIndex",     type: "uint32" },
      { name: "decodableArgs", type: "bytes" },
      { name: "proof",         type: "bytes32[]" },
    ],
    outputs: [
      {
        type: "tuple", components: [
          { name: "allocation", type: "tuple", components: [
            { name: "id",                        type: "string"  },
            { name: "originalBeneficiary",       type: "address" },
            { name: "totalAllocation",           type: "uint256" },
            { name: "cancelable",                type: "bool"    },
            { name: "revokable",                 type: "bool"    },
            { name: "transferableByAdmin",       type: "bool"    },
            { name: "transferableByBeneficiary", type: "bool"    },
          ]},
          { name: "calendarUnlockScheduleId", type: "string" },
          { name: "distributionState", type: "tuple", components: [
            { name: "withdrawalAddress",   type: "address" },
            { name: "terminatedTimestamp", type: "uint32"  },
            { name: "withdrawn",           type: "uint256" },
            { name: "terminatedWithdrawn", type: "uint256" },
            { name: "fundedAmount",        type: "uint256" },
            { name: "terminatedAmount",    type: "uint256" },
          ]},
        ],
      },
      {
        type: "tuple", components: [
          { name: "unlockScheduleId",  type: "string"    },
          { name: "unlockTimestamps",  type: "uint32[]"  },
          { name: "unlockAmounts",     type: "uint256[]" },
        ],
      },
    ],
  },
  {
    name: "getIntervalLeafAllocationData", type: "function", stateMutability: "view",
    inputs: [
      { name: "rootIndex",     type: "uint32" },
      { name: "decodableArgs", type: "bytes" },
      { name: "proof",         type: "bytes32[]" },
    ],
    outputs: [
      {
        type: "tuple", components: [
          { name: "allocation", type: "tuple", components: [
            { name: "id",                        type: "string"  },
            { name: "originalBeneficiary",       type: "address" },
            { name: "totalAllocation",           type: "uint256" },
            { name: "cancelable",                type: "bool"    },
            { name: "revokable",                 type: "bool"    },
            { name: "transferableByAdmin",       type: "bool"    },
            { name: "transferableByBeneficiary", type: "bool"    },
          ]},
          { name: "intervalUnlockScheduleId", type: "string" },
          { name: "distributionState", type: "tuple", components: [
            { name: "withdrawalAddress",   type: "address" },
            { name: "terminatedTimestamp", type: "uint32"  },
            { name: "withdrawn",           type: "uint256" },
            { name: "terminatedWithdrawn", type: "uint256" },
            { name: "fundedAmount",        type: "uint256" },
            { name: "terminatedAmount",    type: "uint256" },
          ]},
        ],
      },
      {
        type: "tuple", components: [
          { name: "unlockScheduleId", type: "string" },
          { name: "pieces", type: "tuple[]", components: [
            { name: "startDate",       type: "uint32"  },
            { name: "periodLength",    type: "uint32"  },
            { name: "numberOfPeriods", type: "uint32"  },
            { name: "amount",          type: "uint256" },
          ]},
        ],
      },
    ],
  },
] as const;

/** Genesis blocks — earliest factory deployment per chain (Phase 1 recon). */
const GENESIS: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]:  16_979_000n,
  [CHAIN_IDS.BASE]:       4_609_000n,
  [CHAIN_IDS.BSC]:       85_217_000n,
  [CHAIN_IDS.POLYGON]:   48_081_000n,
  [CHAIN_IDS.ARBITRUM]: 126_788_000n,
  [CHAIN_IDS.OPTIMISM]: 129_131_000n,
  [CHAIN_IDS.AVALANCHE]: 32_740_000n,
};

type WithdrawArgs = { amount: bigint; rootIndex: number; decodableArgs: Hex; proof: readonly Hex[] };

/** Pull every withdraw() call out of a tx's calldata (handles multicall). */
function extractWithdrawCalls(input: Hex): WithdrawArgs[] {
  const out: WithdrawArgs[] = [];
  const tryDecode = (data: Hex) => {
    try {
      const d = decodeFunctionData({ abi: VESTER_ABI, data });
      if (d.functionName === "withdraw") {
        const a = d.args as readonly unknown[];
        out.push({
          amount:        a[0] as bigint,
          rootIndex:     Number(a[1] as number | bigint),
          decodableArgs: a[2] as Hex,
          proof:         a[3] as readonly Hex[],
        });
      } else if (d.functionName === "multicall") {
        for (const inner of (d.args as readonly unknown[])[0] as Hex[]) tryDecode(inner);
      }
    } catch { /* not a withdraw/multicall we understand — skip */ }
  };
  tryDecode(input);
  return out;
}

/** Interval pieces → discrete unlock steps (same shape as calendar schedules). */
function piecesToSteps(
  pieces: readonly { startDate: number; periodLength: number; numberOfPeriods: number; amount: bigint }[],
): { timestamp: number; amount: string }[] {
  const steps: { timestamp: number; amount: string }[] = [];
  for (const p of pieces) {
    const periods = Number(p.numberOfPeriods);
    if (periods <= 0) continue;
    // Magna's interval schedule releases `amount` per period, at the END of
    // each period (period n unlocks at startDate + n*periodLength).
    for (let n = 1; n <= periods; n++) {
      steps.push({
        timestamp: Number(p.startDate) + n * Number(p.periodLength),
        amount:    p.amount.toString(),
      });
    }
  }
  return steps.sort((a, b) => a.timestamp - b.timestamp);
}

function makeIndexer(chainId: SupportedChainId): Indexer {
  const genesisBlock = GENESIS[chainId];
  if (!genesisBlock) throw new Error(`Magna not configured for chainId ${chainId}`);

  return {
    protocol:         "magna",
    chainId,
    genesisBlock,
    // Claims are sparse (enterprise vesting, not retail churn), but we scan
    // Transfer logs filtered by vester address list, so windows stay cheap.
    // 9,999 fits dRPC's free-tier 10k eth_getLogs cap.
    maxBlocksPerScan: 9_999n,
    reorgLag:         12n,

    async scanWindow(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
      // 1. Which vesters do we know about on this chain? (Phase 1 registry.)
      let vesters: string[] = [];
      try {
        const rows = await db.select({ address: magnaVesters.address })
          .from(magnaVesters)
          .where(sql`${magnaVesters.chainId} = ${chainId as number}`);
        vesters = rows.map((r) => r.address.toLowerCase());
      } catch (err) {
        console.warn(`[magna-indexer/${chainId}] registry read failed:`, err);
        return { eventCount: 0 };
      }
      if (vesters.length === 0) return { eventCount: 0 };
      const vesterSet = new Set(vesters);

      // 2. Transfers OUT of a vester = claim payouts.
      //
      // NOTE: we filter by the TOKEN contract (log `address`), not by a
      // from-address topic. An address-array in topics[1] is an OR filter that
      // several free-tier RPCs silently ignore — verified: it returned ~100k
      // unfiltered logs on dRPC — whereas the `address` filter is honoured
      // everywhere. We then match `from ∈ vesters` in code, which is exact.
      // Token list comes from the vesters' token() (cached in the registry
      // walk), so the query stays narrow.
      const tokensToWatch = new Set<string>();
      const vesterTokenPre = new Map<string, string>();
      const ADDR_BATCH = 60;
      for (let i = 0; i < vesters.length; i += ADDR_BATCH) {
        const slice = vesters.slice(i, i + ADDR_BATCH);
        try {
          const results = await client.multicall({
            contracts: slice.map((v) => ({ address: v as `0x${string}`, abi: VESTER_ABI, functionName: "token" as const })),
            allowFailure: true,
          });
          for (let j = 0; j < slice.length; j++) {
            const r = results[j];
            if (r.status === "success") {
              const t = String(r.result).toLowerCase();
              tokensToWatch.add(t);
              vesterTokenPre.set(slice[j], t);
            }
          }
        } catch { /* partial coverage beats none */ }
      }
      if (tokensToWatch.size === 0) return { eventCount: 0 };

      const candidateTxs = new Map<Hex, Set<string>>(); // txHash -> vesters involved
      const tokenList = Array.from(tokensToWatch) as `0x${string}`[];
      for (let i = 0; i < tokenList.length; i += ADDR_BATCH) {
        const slice = tokenList.slice(i, i + ADDR_BATCH);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const logs = await (client.getLogs as any)({
          address:   slice,
          topics:    [TRANSFER_TOPIC],
          fromBlock,
          toBlock,
        }) as { topics: readonly (Hex | null)[]; transactionHash: Hex }[];
        for (const log of logs) {
          if (!log.topics[1]) continue;
          const from = `0x${(log.topics[1] as Hex).slice(26)}`.toLowerCase();
          if (!vesterSet.has(from)) continue;   // exact match in code
          const set = candidateTxs.get(log.transactionHash) ?? new Set<string>();
          set.add(from);
          candidateTxs.set(log.transactionHash, set);
        }
      }
      if (candidateTxs.size === 0) return { eventCount: 0 };

      // 3. For each claim tx: decode withdraw() calldata → leaf views → stream.
      const tokenCache  = new Map<string, { symbol: string; decimals: number }>();
      const vesterToken = vesterTokenPre; // reuse token() reads from step 2
      const nowSec  = Math.floor(Date.now() / 1000);
      const streams: VestingStream[] = [];

      for (const [txHash, involved] of candidateTxs) {
        let input: Hex;
        try {
          const tx = await client.getTransaction({ hash: txHash });
          input = tx.input;
        } catch { continue; }

        const calls = extractWithdrawCalls(input);
        if (calls.length === 0) continue;

        for (const vester of involved) {
          const vesterAddr = vester as `0x${string}`;

          // token() once per vester per window.
          if (!vesterToken.has(vester)) {
            try {
              const t = await client.readContract({ address: vesterAddr, abi: VESTER_ABI, functionName: "token" });
              vesterToken.set(vester, String(t).toLowerCase());
            } catch { continue; }
          }
          const tokenAddr = vesterToken.get(vester)!;

          if (!tokenCache.has(tokenAddr)) {
            try {
              const [symbol, decimals] = await Promise.all([
                client.readContract({ address: tokenAddr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
                client.readContract({ address: tokenAddr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
              ]);
              tokenCache.set(tokenAddr, { symbol, decimals });
            } catch {
              tokenCache.set(tokenAddr, { symbol: "???", decimals: 18 });
            }
          }
          const { symbol: tokenSymbol, decimals: tokenDecimals } = tokenCache.get(tokenAddr)!;

          for (const call of calls) {
            // Try calendar first, then interval — whichever decodes is the
            // schedule type for this leaf. A wrong-type call reverts, which is
            // how we discriminate (there's no on-chain type flag on the leaf).
            let recipient: string | null = null;
            let totalAmount = 0n, withdrawn = 0n, terminatedAt = 0;
            let unlockSteps: { timestamp: number; amount: string }[] = [];
            let cancelable = false;

            try {
              const r = await client.readContract({
                address: vesterAddr, abi: VESTER_ABI,
                functionName: "getCalendarLeafAllocationData",
                args: [call.rootIndex, call.decodableArgs, call.proof as readonly Hex[]],
              }) as unknown as readonly [
                { allocation: { originalBeneficiary: string; totalAllocation: bigint; cancelable: boolean };
                  distributionState: { withdrawalAddress: string; withdrawn: bigint; terminatedTimestamp: number } },
                { unlockTimestamps: readonly number[]; unlockAmounts: readonly bigint[] },
              ];
              const [alloc, sched] = r;
              recipient   = (alloc.distributionState.withdrawalAddress && !/^0x0+$/.test(alloc.distributionState.withdrawalAddress))
                ? alloc.distributionState.withdrawalAddress
                : alloc.allocation.originalBeneficiary;
              totalAmount = alloc.allocation.totalAllocation;
              withdrawn   = alloc.distributionState.withdrawn;
              terminatedAt = Number(alloc.distributionState.terminatedTimestamp ?? 0);
              cancelable  = alloc.allocation.cancelable;
              unlockSteps = sched.unlockTimestamps.map((t, i) => ({
                timestamp: Number(t), amount: (sched.unlockAmounts[i] ?? 0n).toString(),
              })).sort((a, b) => a.timestamp - b.timestamp);
            } catch {
              try {
                const r = await client.readContract({
                  address: vesterAddr, abi: VESTER_ABI,
                  functionName: "getIntervalLeafAllocationData",
                  args: [call.rootIndex, call.decodableArgs, call.proof as readonly Hex[]],
                }) as unknown as readonly [
                  { allocation: { originalBeneficiary: string; totalAllocation: bigint; cancelable: boolean };
                    distributionState: { withdrawalAddress: string; withdrawn: bigint; terminatedTimestamp: number } },
                  { pieces: readonly { startDate: number; periodLength: number; numberOfPeriods: number; amount: bigint }[] },
                ];
                const [alloc, sched] = r;
                recipient   = (alloc.distributionState.withdrawalAddress && !/^0x0+$/.test(alloc.distributionState.withdrawalAddress))
                  ? alloc.distributionState.withdrawalAddress
                  : alloc.allocation.originalBeneficiary;
                totalAmount = alloc.allocation.totalAllocation;
                withdrawn   = alloc.distributionState.withdrawn;
                terminatedAt = Number(alloc.distributionState.terminatedTimestamp ?? 0);
                cancelable  = alloc.allocation.cancelable;
                unlockSteps = piecesToSteps(sched.pieces);
              } catch { continue; } // neither type decoded — not our leaf
            }

            if (!recipient || totalAmount === 0n) continue;

            // Vested-to-date = sum of steps at or before now (cliff-safe: a
            // step's amount only counts once its timestamp has passed).
            let vested = 0n;
            for (const s of unlockSteps) {
              if (s.timestamp <= nowSec) vested += BigInt(s.amount);
            }
            if (vested > totalAmount) vested = totalAmount;
            const claimableNow = vested > withdrawn ? vested - withdrawn : 0n;
            const remaining    = totalAmount > withdrawn ? totalAmount - withdrawn : 0n;
            const lockedAmount = remaining > claimableNow ? remaining - claimableNow : 0n;

            const startTime = unlockSteps[0]?.timestamp ?? 0;
            const endTime   = unlockSteps.at(-1)?.timestamp ?? 0;

            streams.push({
              // Allocation id is a UUID string; hash-free composite keeps the
              // canonical "{protocol}-{chainId}-{nativeId}" shape unique per
              // (vester, leaf).
              id:              `magna-${chainId}-${vester}-${call.rootIndex}-${recipient.toLowerCase()}`,
              protocol:        "magna",
              category:        "vesting",
              chainId,
              recipient,
              tokenAddress:    tokenAddr,
              tokenSymbol,
              tokenDecimals,
              totalAmount:     totalAmount.toString(),
              withdrawnAmount: withdrawn.toString(),
              claimableNow:    claimableNow.toString(),
              lockedAmount:    lockedAmount.toString(),
              startTime,
              endTime,
              cliffTime:       null,
              isFullyVested:   lockedAmount === 0n && claimableNow === 0n,
              nextUnlockTime:  nextUnlockTimeForSteps(nowSec, unlockSteps),
              shape:           "steps",
              unlockSteps,
              cancelable:      cancelable || terminatedAt > 0,
              lockTxHash:      txHash,
              // Claiming happens on Magna's own portal (needs the merkle proof,
              // which we don't persist) — no in-app claim wiring.
            });
          }
        }
      }

      if (streams.length > 0) await writeToCache(streams);
      return { eventCount: streams.length };
    },
  };
}

export const magnaIndexers: Indexer[] = [
  makeIndexer(CHAIN_IDS.ETHEREUM),
  makeIndexer(CHAIN_IDS.BASE),
  makeIndexer(CHAIN_IDS.BSC),
  makeIndexer(CHAIN_IDS.POLYGON),
  makeIndexer(CHAIN_IDS.ARBITRUM),
  makeIndexer(CHAIN_IDS.OPTIMISM),
  makeIndexer(CHAIN_IDS.AVALANCHE),
];
