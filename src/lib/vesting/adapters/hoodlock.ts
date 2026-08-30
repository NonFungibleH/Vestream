import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  nextUnlockTimeForSteps,
  computeStepVesting,
} from "../types";
import { makeFallbackClient, mapBounded } from "../rpc";

// ─── HoodLock (RobinhoodLocker) — token locker on Robinhood Chain ─────────────
// Verified contract, no subgraph — data is read directly from the locker.
// Site: https://hoodlock.tech · Explorer: robinhoodchain.blockscout.com
//
// Lock struct: { owner, token, amount, unlockTime, withdrawn }
//
// This is a SINGLE-CLIFF locker: the whole `amount` unlocks at `unlockTime`,
// then the owner withdraws it in full. There is no linear/tranched schedule
// (HoodLock's marketed "vesting" product is not deployed at this address yet).
// We model each lock as a 100%-cliff vesting stream — the same way we model
// UNCX / PinkSale / Team Finance locks: one unlock step at `unlockTime`.
// ─────────────────────────────────────────────────────────────────────────────

// One locker per chain (only Robinhood Chain today). Lowercase.
export const HOODLOCK_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ROBINHOOD]: "0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f",
};

// Block of the first `Locked` event — the indexer's cold-start genesis.
export const HOODLOCK_GENESIS_BLOCK = 4_609_892n;

const LOCK_TUPLE = {
  type: "tuple",
  components: [
    { name: "owner",      type: "address" },
    { name: "token",      type: "address" },
    { name: "amount",     type: "uint256" },
    { name: "unlockTime", type: "uint256" },
    { name: "withdrawn",  type: "bool"    },
  ],
} as const;

export const HOODLOCK_ABI = [
  { name: "getLock",      type: "function" as const, inputs: [{ name: "id", type: "uint256" }], outputs: [LOCK_TUPLE], stateMutability: "view" as const },
  { name: "locksByOwner", type: "function" as const, inputs: [{ name: "o", type: "address" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" as const },
  { name: "locksByToken", type: "function" as const, inputs: [{ name: "t", type: "address" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" as const },
  { name: "nextLockId",   type: "function" as const, inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" as const },
  // Events (used by the indexer + claim ingestor).
  {
    name: "Locked", type: "event" as const, anonymous: false,
    inputs: [
      { indexed: true,  name: "id",         type: "uint256" },
      { indexed: true,  name: "owner",      type: "address" },
      { indexed: true,  name: "token",      type: "address" },
      { indexed: false, name: "amount",     type: "uint256" },
      { indexed: false, name: "unlockTime", type: "uint256" },
    ],
  },
  {
    name: "Withdrawn", type: "event" as const, anonymous: false,
    inputs: [
      { indexed: true,  name: "id",     type: "uint256" },
      { indexed: true,  name: "owner",  type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    name: "Extended", type: "event" as const, anonymous: false,
    inputs: [
      { indexed: true,  name: "id",            type: "uint256" },
      { indexed: false, name: "newUnlockTime", type: "uint256" },
    ],
  },
] as const;

const ERC20_ABI = [
  { name: "symbol",   type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
  { name: "decimals", type: "function" as const, inputs: [], outputs: [{ type: "uint8"  }], stateMutability: "view" as const },
] as const;

// Raw lock as read from getLock() (+ its numeric id).
export interface HoodLockRaw {
  id:         bigint;
  owner:      string;
  token:      string;
  amount:     bigint;
  unlockTime: bigint;
  withdrawn:  boolean;
}

/**
 * Convert raw HoodLock locks to VestingStream rows. Exported so the walker,
 * indexer and claim ingestor all map identically (identical rows → the
 * writeToCache setWhere dedup stays stable across the adapter + indexer paths).
 *
 * Cliff model: one unlock step at `unlockTime`. `startTime` = `unlockTime` too
 * (a pure lock releases instantly at unlock — no prior linear region), so both
 * the adapter and the event-driven indexer produce byte-identical rows without
 * the indexer needing the creation-block timestamp.
 */
export function locksToVestingStreams(
  locks:     HoodLockRaw[],
  tokenMeta: Map<string, { symbol: string; decimals: number }>,
  chainId:   SupportedChainId,
): VestingStream[] {
  if (locks.length === 0) return [];
  const nowSec  = Math.floor(Date.now() / 1000);
  const locker  = HOODLOCK_CONTRACTS[chainId] ?? null;
  return locks.map((l): VestingStream => {
    const unlock      = Number(l.unlockTime);
    const total       = l.amount;
    const withdrawn   = l.withdrawn ? l.amount : 0n;
    const unlockSteps = [{ timestamp: unlock, amount: total.toString() }];

    const { claimableNow, lockedAmount, isFullyVested } = computeStepVesting(
      total, withdrawn, unlockSteps, nowSec,
    );

    const meta = tokenMeta.get(l.token.toLowerCase()) ?? { symbol: "???", decimals: 18 };

    return {
      id:              `hoodlock-${chainId}-${l.id.toString()}`,
      protocol:        "hoodlock",
      category:        "vesting",
      chainId,
      recipient:       l.owner.toLowerCase(),
      tokenAddress:    l.token.toLowerCase(),
      tokenSymbol:     meta.symbol,
      tokenDecimals:   meta.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       unlock,
      endTime:         unlock,
      cliffTime:       unlock,
      isFullyVested,
      nextUnlockTime:  nextUnlockTimeForSteps(nowSec, unlockSteps),
      cancelable:      false,
      shape:           "steps",
      unlockSteps,
      // In-app claim: withdraw(id) on the locker, callable by the owner
      // (== our recipient) once block.timestamp >= unlockTime.
      claimContract:   locker,
      claimNativeId:   l.id.toString(),
    };
  });
}

/** Fetch + attach ERC-20 symbol/decimals for a set of token addresses. */
export async function fetchTokenMeta(
  tokenAddresses: string[],
  chainId:        SupportedChainId,
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const result = new Map<string, { symbol: string; decimals: number }>();
  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))];
  if (unique.length === 0) return result;

  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) {
    for (const a of unique) result.set(a, { symbol: "???", decimals: 18 });
    return result;
  }

  const contracts = unique.flatMap((addr) => [
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol"   as const },
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" as const },
  ]);

  try {
    const results = await client.multicall({ contracts, allowFailure: true });
    for (let i = 0; i < unique.length; i++) {
      const sym = results[i * 2];
      const dec = results[i * 2 + 1];
      result.set(unique[i], {
        symbol:   sym.status === "success" ? String(sym.result)  : "???",
        decimals: dec.status === "success" ? Number(dec.result) : 18,
      });
    }
  } catch (err) {
    console.error(`[hoodlock/${chainId}] token metadata:`, err);
    for (const a of unique) result.set(a, { symbol: "???", decimals: 18 });
  }
  return result;
}

/** Batch-read getLock() for a set of ids via multicall. */
export async function readLocks(
  ids:     bigint[],
  chainId: SupportedChainId,
): Promise<HoodLockRaw[]> {
  const contractAddress = HOODLOCK_CONTRACTS[chainId];
  if (!contractAddress || ids.length === 0) return [];
  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) return [];

  const out: HoodLockRaw[] = [];
  const PAGE = 50; // keep each multicall response well under free-RPC caps
  for (let start = 0; start < ids.length; start += PAGE) {
    const page  = ids.slice(start, start + PAGE);
    const calls = page.map((id) => ({
      address:      contractAddress,
      abi:          HOODLOCK_ABI,
      functionName: "getLock" as const,
      args:         [id] as const,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await client.multicall({ contracts: calls as any, allowFailure: true });
    results.forEach((r, i) => {
      if (r.status === "success" && r.result) {
        const s = r.result as { owner: string; token: string; amount: bigint; unlockTime: bigint; withdrawn: boolean };
        out.push({ id: page[i], owner: s.owner, token: s.token, amount: s.amount, unlockTime: s.unlockTime, withdrawn: s.withdrawn });
      }
    });
  }
  return out;
}

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const contractAddress = HOODLOCK_CONTRACTS[chainId];
  if (!contractAddress) return [];

  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) {
    console.error(`[hoodlock/${chainId}] no RPC pool configured`);
    return [];
  }

  // Phase 1 — lock ids per wallet (locksByOwner). Bounded concurrency.
  const idsByWallet = await mapBounded(
    wallets,
    8,
    (wallet) =>
      client.readContract({
        address:      contractAddress,
        abi:          HOODLOCK_ABI,
        functionName: "locksByOwner",
        args:         [wallet as `0x${string}`],
      }).catch(() => [] as readonly bigint[]),
  );

  const wanted = new Set(wallets.map((w) => w.toLowerCase()));
  const allIds: bigint[] = [];
  for (const res of idsByWallet) {
    if (res.status === "fulfilled") allIds.push(...(res.value as readonly bigint[]));
  }
  const uniqueIds = [...new Set(allIds.map((x) => x.toString()))].map((x) => BigInt(x));
  if (uniqueIds.length === 0) return [];

  // Phase 2 — read each lock. locksByOwner keeps stale ids after ownership
  // transfer (it never removes), so filter to locks whose CURRENT owner is one
  // of the requested wallets.
  const raw    = (await readLocks(uniqueIds, chainId)).filter((l) => wanted.has(l.owner.toLowerCase()));
  if (raw.length === 0) return [];

  const meta = await fetchTokenMeta(raw.map((l) => l.token), chainId);
  return locksToVestingStreams(raw, meta, chainId);
}

export const hoodlockAdapter: VestingAdapter = {
  id:   "hoodlock",
  name: "HoodLock",
  supportedChainIds: [CHAIN_IDS.ROBINHOOD],
  fetch: fetchForChain,
};
