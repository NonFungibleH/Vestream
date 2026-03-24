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

const PINKSALE_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x33d4cc8716beb13f814f538ad3b2de3b036f5e2a",
  [CHAIN_IDS.BSC]:      "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe",
  [CHAIN_IDS.POLYGON]:  "0x6C9A0D8B1c7a95a323d744dE30cf027694710633",
  [CHAIN_IDS.BASE]:     "0xdd6e31a046b828cbbafb939c2a394629aff8bbdc",
};

// ─── ABIs ──────────────────────────────────────────────────────────────────────

const PINKSALE_ABI = [
  {
    name: "normalLocksForUser",
    type: "function" as const,
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{
      type: "tuple[]",
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
    }],
    stateMutability: "view" as const,
  },
] as const;

const ERC20_ABI = [
  { name: "symbol",   type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
  { name: "decimals", type: "function" as const, inputs: [], outputs: [{ type: "uint8"  }], stateMutability: "view" as const },
  { name: "name",     type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
] as const;

// ─── viem helpers ──────────────────────────────────────────────────────────────

function getRpcUrl(chainId: SupportedChainId): string {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return process.env.ALCHEMY_RPC_URL_ETH  ?? "https://ethereum.publicnode.com";
    case CHAIN_IDS.BSC:      return process.env.BSC_RPC_URL           ?? "https://bsc.publicnode.com";
    case CHAIN_IDS.POLYGON:  return process.env.POLYGON_RPC_URL       ?? "https://polygon.publicnode.com";
    case CHAIN_IDS.BASE:     return process.env.ALCHEMY_RPC_URL_BASE  ?? "https://base.publicnode.com";
    default:                 return "https://ethereum.publicnode.com";
  }
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

  const client = createPublicClient({
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

  const client = createPublicClient({
    chain:     getViemChain(chainId),
    transport: http(getRpcUrl(chainId)),
  });

  // Fetch locks for all wallets in parallel
  const locksByWallet = await Promise.allSettled(
    wallets.map((wallet) =>
      client.readContract({
        address:      contractAddress,
        abi:          PINKSALE_ABI,
        functionName: "normalLocksForUser",
        args:         [wallet as `0x${string}`],
      })
    )
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
