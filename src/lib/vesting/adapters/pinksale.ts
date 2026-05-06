import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  nextUnlockTimeForSteps,
  computeStepVesting,
} from "../types";
import { createPublicClient, http } from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";
import { makeFallbackClient, mapBounded } from "../rpc";

// ─── PinkLock V2 (PinkSale token vesting) ─────────────────────────────────────
// PinkLock has no subgraph — data is read directly from the V2 contracts.
// Docs: https://docs.pinksale.finance/important-contracts/pink-lock-v2
//
// Lock struct:
//   id, token, owner, amount, lockDate, tgeDate, tgeBps, cycle, cycleBps,
//   unlockedAmount, description
//
// Vesting schedule:
//   At tgeDate:         tgeBps / 10000 * amount unlocks
//   Every cycle secs:   cycleBps / 10000 * amount unlocks
//   Until total = amount fully unlocked

// ─── Contract addresses ────────────────────────────────────────────────────────

// PinkLock V2 contract addresses now live in a single source of truth.
// See PINKSALE_CONTRACT_ADDRESSES in src/lib/protocol-constants.ts.
import { PINKSALE_CONTRACT_ADDRESSES as PINKSALE_CONTRACTS } from "../../protocol-constants";

// ─── ABIs ──────────────────────────────────────────────────────────────────────

// Single-lock tuple shape — re-used by both array-returning and indexed
// variants of the lookup functions below.
const LOCK_TUPLE = {
  type: "tuple",
  components: [
    { name: "id",             type: "uint256" },
    { name: "token",          type: "address" },
    { name: "owner",          type: "address" },
    { name: "amount",         type: "uint256" },
    { name: "lockDate",       type: "uint256" },
    { name: "tgeDate",        type: "uint256" },
    { name: "tgeBps",         type: "uint256" },
    { name: "cycle",          type: "uint256" },
    { name: "cycleBps",       type: "uint256" },
    { name: "unlockedAmount", type: "uint256" },
    { name: "description",    type: "string"  },
  ],
} as const;

const PINKSALE_ABI = [
  // Bulk fetch — fast path for users with few locks. Response can blow past
  // free-RPC response-size caps for power users (~100KB on publicnode); we
  // gate on getUserNormalLocksLength below to decide which path to take.
  {
    name: "normalLocksForUser",
    type: "function" as const,
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ ...LOCK_TUPLE, type: "tuple[]" }],
    stateMutability: "view" as const,
  },
  // Paginated fetch — one lock at a time by (user, index). Used as the
  // slow-but-reliable path when a user has too many locks for the bulk
  // call to fit in free-tier RPC response budgets.
  {
    name: "getUserNormalLocksLength",
    type: "function" as const,
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    name: "getUserNormalLockAtIndex",
    type: "function" as const,
    inputs:  [
      { name: "user",  type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [LOCK_TUPLE],
    stateMutability: "view" as const,
  },
] as const;

const ERC20_ABI = [
  { name: "symbol",   type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
  { name: "decimals", type: "function" as const, inputs: [], outputs: [{ type: "uint8"  }], stateMutability: "view" as const },
  { name: "name",     type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
] as const;

// ─── viem helpers ──────────────────────────────────────────────────────────────
// Adapter is per-user contract reads only (no log scans), so it's safe to
// use the full multi-RPC pool including publicnode entries.
import { getRpcUrl as getRpcUrlPool } from "../rpc";
function getRpcUrl(chainId: SupportedChainId): string {
  return getRpcUrlPool(chainId) ?? "https://eth.drpc.org";
}

function getViemChain(chainId: SupportedChainId) {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return mainnet;
    case CHAIN_IDS.BSC:      return bsc;
    case CHAIN_IDS.POLYGON:  return polygon;
    case CHAIN_IDS.BASE:     return base;
    default:                 return mainnet;
  }
}

// ─── Vesting math ──────────────────────────────────────────────────────────────
// Build discrete unlock steps from TGE + cycle schedule, then use computeStepVesting.

interface PinkLockRaw {
  id:             bigint;
  token:          string;
  owner:          string;
  amount:         bigint;
  lockDate:       bigint;
  tgeDate:        bigint;
  tgeBps:         bigint;
  cycle:          bigint;
  cycleBps:       bigint;
  unlockedAmount: bigint;
  description:    string;
}

function buildUnlockSteps(
  amount:  bigint,
  tgeDate: number,
  tgeBps:  bigint,
  cycle:   number,
  cycleBps: bigint
): { timestamp: number; amount: string }[] {
  const steps: { timestamp: number; amount: string }[] = [];
  const BPS_DENOM = 10000n;

  // TGE step
  if (tgeBps > 0n) {
    const tgeAmount = (amount * tgeBps) / BPS_DENOM;
    if (tgeAmount > 0n) {
      steps.push({ timestamp: tgeDate, amount: tgeAmount.toString() });
    }
  }

  // Cycle steps — continue until we reach 100% of amount
  if (cycle > 0 && cycleBps > 0n) {
    const cycleAmount = (amount * cycleBps) / BPS_DENOM;
    if (cycleAmount > 0n) {
      let vestedSoFar = tgeBps > 0n ? (amount * tgeBps) / BPS_DENOM : 0n;
      let stepTime    = tgeDate + cycle;
      // Cap at 500 steps to avoid infinite loops for tiny cycleBps
      let iterations  = 0;
      while (vestedSoFar < amount && iterations < 500) {
        const remaining   = amount - vestedSoFar;
        const stepAmt     = remaining < cycleAmount ? remaining : cycleAmount;
        steps.push({ timestamp: stepTime, amount: stepAmt.toString() });
        vestedSoFar += stepAmt;
        stepTime    += cycle;
        iterations++;
      }
    }
  }

  // If no steps generated (e.g. both bps = 0), treat as single unlock at tgeDate
  if (steps.length === 0) {
    steps.push({ timestamp: tgeDate, amount: amount.toString() });
  }

  return steps.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── ERC-20 metadata ───────────────────────────────────────────────────────────

async function fetchTokenMeta(
  tokenAddresses: string[],
  chainId: SupportedChainId
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const result = new Map<string, { symbol: string; decimals: number }>();
  if (tokenAddresses.length === 0) return result;

  // Token metadata uses the fallback transport too — same rationale as
  // fetchForChain. Single multicall, but a dead provider was crashing the
  // whole token-meta lookup and bubbling up to "metadata: ???" symbols.
  const client = makeFallbackClient(chainId, { batch: true })
    ?? createPublicClient({
      chain:     getViemChain(chainId),
      transport: http(getRpcUrl(chainId)),
    });

  const contracts = tokenAddresses.flatMap((addr) => [
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol"   as const },
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" as const },
  ]);

  try {
    const results = await client.multicall({ contracts, allowFailure: true });
    for (let i = 0; i < tokenAddresses.length; i++) {
      const symResult = results[i * 2];
      const decResult = results[i * 2 + 1];
      result.set(tokenAddresses[i].toLowerCase(), {
        symbol:   symResult.status === "success" ? String(symResult.result)  : "???",
        decimals: decResult.status === "success" ? Number(decResult.result) : 18,
      });
    }
  } catch (err) {
    console.error(`PinkSale token metadata (chain ${chainId}):`, err);
    for (const addr of tokenAddresses) {
      result.set(addr.toLowerCase(), { symbol: "???", decimals: 18 });
    }
  }

  return result;
}

// ─── Main fetch ────────────────────────────────────────────────────────────────

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const contractAddress = PINKSALE_CONTRACTS[chainId];
  if (!contractAddress) return [];

  // Use the fallback transport spanning ALL pool RPCs. Single-URL transport
  // returned 0 streams for 500 owners (May 6 2026 diagnostic) because free-
  // tier RPCs were rate-limiting the simultaneous parallel calls. Promise
  // .allSettled swallowed the per-call errors silently → adapter returned
  // empty without throwing → seeder logged 0 batchFetchErrors → debugging
  // blind for days. Fallback transport rotates per-call so a throttled
  // provider trips a sibling automatically.
  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) {
    console.error(`[pinksale/${chainId}] no RPC pool configured`);
    return [];
  }

  // Two-phase fetch to dodge free-RPC response-size caps:
  //   Phase 1: ask each wallet how many locks it has (cheap, fixed-size).
  //   Phase 2: for wallets with ≤ BULK_FETCH_THRESHOLD locks, use the
  //            bulk normalLocksForUser call (one round-trip).
  //            For wallets above that, paginate via getUserNormalLockAtIndex
  //            in batched multicalls — each lock is its own ~500-byte
  //            response, so no individual call breaches the 100KB cap.
  //
  // Why this is necessary: publicnode (and several other free Polygon RPCs)
  // cap eth_call responses at 100KB. Power users on PinkSale Polygon have
  // 100+ locks each, returning ~250-450KB arrays from normalLocksForUser
  // and silently dropping out of the seed. Confirmed in production logs
  // May 1 2026: dozens of `call returned result of length 254944 exceeding
  // limit 100000` errors per seed run. Pagination eliminates this class
  // of failure entirely.
  const BULK_FETCH_THRESHOLD = 50;

  // Bounded concurrency — was unbounded `Promise.allSettled(wallets.map(...))`
  // which fired ALL N calls simultaneously. With N=500 owners × 4 chains
  // = 2000 simultaneous calls per seed run, free RPC pools throttle to
  // hell and most calls return errors that get silently swallowed
  // (May 6 2026 root cause for the heavy-group "0 streams fetched" bug).
  // 8 in-flight per chain is the sweet spot for free dRPC; it gives ~95%
  // call success in production traffic without extending walltime
  // meaningfully.
  const PER_WALLET_CONCURRENCY = 8;

  // Phase 1 — lengths, bounded concurrency.
  const lengthByWallet = await mapBounded(
    wallets,
    PER_WALLET_CONCURRENCY,
    (wallet) =>
      client.readContract({
        address:      contractAddress,
        abi:          PINKSALE_ABI,
        functionName: "getUserNormalLocksLength",
        args:         [wallet as `0x${string}`],
      }),
  );

  // Phase 2 — fetch locks per wallet, choosing path by length.
  type LockRaw = readonly {
    id: bigint; token: string; owner: string; amount: bigint;
    lockDate: bigint; tgeDate: bigint; tgeBps: bigint; cycle: bigint;
    cycleBps: bigint; unlockedAmount: bigint; description: string;
  }[];

  // Phase 2 — bounded concurrency for the same reasons as Phase 1.
  const locksByWallet = await mapBounded(
    wallets,
    PER_WALLET_CONCURRENCY,
    async (wallet, i): Promise<LockRaw> => {
      const lenRes = lengthByWallet[i];
      if (lenRes.status !== "fulfilled") {
        throw lenRes.reason;
      }
      const count = Number(lenRes.value as bigint);
      if (count === 0) return [];

      // Small enough for the bulk call — one round-trip, fast path.
      if (count <= BULK_FETCH_THRESHOLD) {
        const result = await client.readContract({
          address:      contractAddress,
          abi:          PINKSALE_ABI,
          functionName: "normalLocksForUser",
          args:         [wallet as `0x${string}`],
        });
        return result as LockRaw;
      }

      // Big array — paginate via getUserNormalLockAtIndex. Multicall'd in
      // chunks of 50 to keep each multicall response under 100KB
      // (50 locks × ~500 bytes ≈ 25KB).
      const PAGE = 50;
      const out: LockRaw[number][] = [];
      for (let start = 0; start < count; start += PAGE) {
        const end = Math.min(start + PAGE, count);
        const calls = [];
        for (let idx = start; idx < end; idx++) {
          calls.push({
            address:      contractAddress,
            abi:          PINKSALE_ABI,
            functionName: "getUserNormalLockAtIndex" as const,
            args:         [wallet as `0x${string}`, BigInt(idx)] as const,
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = await client.multicall({ contracts: calls as any, allowFailure: true });
        for (const r of results) {
          if (r.status === "success" && r.result) {
            out.push(r.result as LockRaw[number]);
          }
        }
      }
      return out as LockRaw;
    },
  );

  const allLocks: PinkLockRaw[] = [];
  for (const res of locksByWallet) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      for (const lock of res.value as readonly {
        id: bigint; token: string; owner: string; amount: bigint;
        lockDate: bigint; tgeDate: bigint; tgeBps: bigint; cycle: bigint;
        cycleBps: bigint; unlockedAmount: bigint; description: string;
      }[]) {
        allLocks.push({
          id:             lock.id,
          token:          lock.token,
          owner:          lock.owner,
          amount:         lock.amount,
          lockDate:       lock.lockDate,
          tgeDate:        lock.tgeDate,
          tgeBps:         lock.tgeBps,
          cycle:          lock.cycle,
          cycleBps:       lock.cycleBps,
          unlockedAmount: lock.unlockedAmount,
          description:    lock.description,
        });
      }
    } else if (res.status === "rejected") {
      console.error(`PinkSale (chain ${chainId}) readContract error:`, res.reason);
    }
  }

  if (allLocks.length === 0) return [];

  // Fetch token metadata for all unique token addresses
  const uniqueTokens = [...new Set(allLocks.map((l) => l.token.toLowerCase()))];
  const tokenMeta    = await fetchTokenMeta(uniqueTokens, chainId);

  return locksToVestingStreams(allLocks, tokenMeta, chainId);
}

/**
 * Convert raw PinkLockRaw entries to the VestingStream shape the cache
 * stores. Exported so the seeder can call it on walker-fetched locks
 * (bypassing the per-wallet adapter, which wouldn't see locks for
 * owners whose `getUserNormalLocksLength` returns 0).
 */
export function locksToVestingStreams(
  allLocks:  Array<{
    id: bigint; token: string; owner: string; amount: bigint;
    lockDate: bigint; tgeDate: bigint; tgeBps: bigint; cycle: bigint;
    cycleBps: bigint; unlockedAmount: bigint; description: string;
  }>,
  tokenMeta: Map<string, { symbol: string; decimals: number }>,
  chainId:   SupportedChainId,
): VestingStream[] {
  if (allLocks.length === 0) return [];
  const nowSec = Math.floor(Date.now() / 1000);
  return allLocks.map((lock): VestingStream => {
    const tgeDate   = Number(lock.tgeDate);
    const lockDate  = Number(lock.lockDate);
    const cycle     = Number(lock.cycle);
    const total     = lock.amount;
    const withdrawn = lock.unlockedAmount;

    const unlockSteps = buildUnlockSteps(
      total, tgeDate, lock.tgeBps, cycle, lock.cycleBps
    );

    const { claimableNow, lockedAmount, isFullyVested } = computeStepVesting(
      total, withdrawn, unlockSteps, nowSec
    );

    const lastStep = unlockSteps.at(-1);
    const endTime  = lastStep?.timestamp ?? tgeDate;

    // cliffTime = tgeDate if it's in the future (first unlock hasn't happened yet)
    const cliffTime = tgeDate > lockDate ? tgeDate : null;

    const meta = tokenMeta.get(lock.token.toLowerCase()) ?? { symbol: "???", decimals: 18 };

    return {
      id:              `pinksale-${chainId}-${lock.id.toString()}`,
      protocol:        "pinksale",
      category:        "vesting",
      chainId,
      recipient:       lock.owner.toLowerCase(),
      tokenAddress:    lock.token.toLowerCase(),
      tokenSymbol:     meta.symbol,
      tokenDecimals:   meta.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       lockDate,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  nextUnlockTimeForSteps(nowSec, unlockSteps),
      cancelable:      false,
      shape:           "steps",
      unlockSteps,
    };
  });
}

export const pinksaleAdapter: VestingAdapter = {
  id:   "pinksale",
  name: "PinkSale",
  supportedChainIds: [
    CHAIN_IDS.ETHEREUM,
    CHAIN_IDS.BSC,
    CHAIN_IDS.POLYGON,
    CHAIN_IDS.BASE,
  ],
  fetch: fetchForChain,
};
