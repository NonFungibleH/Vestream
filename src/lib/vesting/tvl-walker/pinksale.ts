// src/lib/vesting/tvl-walker/pinksale.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive PinkSale (PinkLock V2) walker — PinkLock has no subgraph, so:
//   1. Scan `LockAdded` events for the last 2M blocks to discover every unique
//      owner address (mirrors the seeder's discoverPinksaleRecipients).
//   2. Multicall `normalLocksForUser(owner)` in batches of 100.
//   3. locked = amount - unlockedAmount per lock (unlockedAmount is the
//      running already-claimed total; remainder is currently-locked).
//   4. Multicall ERC-20 symbol + decimals for distinct tokens, one call/chain.
//   5. Aggregate by (chainId, token).
//
// LockAdded(uint256 indexed id, address token, address indexed owner, uint256 amount, uint256 unlockDate)
//   topic[0] = signature hash; topic[2] = owner (the indexed address).
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http, type Hex } from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

// ─── Contract addresses ────────────────────────────────────────────────────────

const PINKSALE_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x33d4cc8716beb13f814f538ad3b2de3b036f5e2a",
  [CHAIN_IDS.BSC]:      "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe",
  [CHAIN_IDS.POLYGON]:  "0x6C9A0D8B1c7a95a323d744dE30cf027694710633",
  [CHAIN_IDS.BASE]:     "0xdd6e31a046b828cbbafb939c2a394629aff8bbdc",
};

// keccak256("LockAdded(uint256,address,address,uint256,uint256)")
const PINKSALE_LOCK_ADDED_TOPIC =
  "0x694af1cc8727cdd0afbdd53d9b87b69248bd490224e9dd090e788546506e076f" as Hex;

// Per-chain RPC limits. Public RPCs vary wildly in both `eth_getLogs` block-range
// caps and how far back they retain logs (pruning), so chunk size and scan window
// must be tuned per chain. Trade-off: BSC's 500k-block window only sees the last
// ~17 days of locks (publicnode prunes older) — acceptable for PinkLock since it's
// dominated by new launches with recent activity.
const CHAIN_LIMITS: Partial<Record<SupportedChainId, { chunkSize: bigint; windowBlocks: bigint }>> = {
  [CHAIN_IDS.ETHEREUM]: { chunkSize: 49_999n, windowBlocks: 2_000_000n }, // ~10 months
  [CHAIN_IDS.BSC]:      { chunkSize:  4_999n, windowBlocks:   500_000n }, // ~17 days; publicnode prunes older
  [CHAIN_IDS.POLYGON]:  { chunkSize:  9_999n, windowBlocks: 1_000_000n }, // ~26 days; 10k cap on getLogs
  [CHAIN_IDS.BASE]:     { chunkSize: 49_999n, windowBlocks: 2_000_000n }, // ~46 days
};

const DISCOVERY_BATCH_SIZE  = 10;        // parallel chunks per tick (mirrors seeder)
const MAX_OWNERS            = 10_000;    // safety cap per chain
const LOCKS_MULTICALL_BATCH = 100;       // normalLocksForUser calls per multicall

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

// ─── Raw lock shape (matches ABI tuple) ────────────────────────────────────────

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

// ─── Owner discovery via event scan (mirrors seeder.discoverPinksaleRecipients) ─

async function discoverOwners(
  chainId:  SupportedChainId,
  contract: `0x${string}`,
  chunkSize:    bigint,
  windowBlocks: bigint,
  errors:   string[],
): Promise<string[]> {
  const client = createPublicClient({
    chain:     getViemChain(chainId),
    transport: http(getRpcUrl(chainId)),
  });
  const latestBlock = await client.getBlockNumber();
  const fromBlock   = latestBlock > windowBlocks ? latestBlock - windowBlocks : 0n;

  const chunks: Array<{ from: bigint; to: bigint }> = [];
  for (let from = fromBlock; from <= latestBlock; from += chunkSize + 1n) {
    const to = from + chunkSize > latestBlock ? latestBlock : from + chunkSize;
    chunks.push({ from, to });
  }

  const owners = new Set<string>();

  for (let i = 0; i < chunks.length; i += DISCOVERY_BATCH_SIZE) {
    const batch   = chunks.slice(i, i + DISCOVERY_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(({ from, to }) =>
        client.getLogs({
          address:   contract,
          fromBlock: from,
          toBlock:   to,
        }).then((logs) =>
          logs.filter((l) => l.topics[0] === PINKSALE_LOCK_ADDED_TOPIC),
        ),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const log of r.value) {
          const t2 = log.topics[2];
          if (typeof t2 === "string" && t2.length === 66) {
            owners.add(`0x${t2.slice(26).toLowerCase()}`);
          }
        }
      } else {
        errors.push(`log chunk error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    }
  }

  return Array.from(owners);
}

// ─── Fetch locks for a batch of owners via multicall ──────────────────────────

async function fetchLocksForOwners(
  chainId:  SupportedChainId,
  contract: `0x${string}`,
  owners:   string[],
  errors:   string[],
): Promise<PinkLockRaw[]> {
  const client = createPublicClient({
    chain:     getViemChain(chainId),
    transport: http(getRpcUrl(chainId)),
  });
  const locks: PinkLockRaw[] = [];

  for (let i = 0; i < owners.length; i += LOCKS_MULTICALL_BATCH) {
    const batch = owners.slice(i, i + LOCKS_MULTICALL_BATCH);
    const contracts = batch.map((owner) => ({
      address:      contract,
      abi:          PINKSALE_ABI,
      functionName: "normalLocksForUser" as const,
      args:         [owner as `0x${string}`],
    }));

    try {
      const results = await client.multicall({ contracts, allowFailure: true });
      for (const r of results) {
        if (r.status !== "success") continue;
        const rows = r.result as readonly PinkLockRaw[] | undefined;
        if (!rows) continue;
        for (const lock of rows) {
          locks.push({
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
      }
    } catch (err) {
      errors.push(`multicall batch ${i}..${i + batch.length} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return locks;
}

// ─── Token metadata (one multicall per chain) ──────────────────────────────────

async function fetchTokenMeta(
  chainId:        SupportedChainId,
  tokenAddresses: string[],
  errors:         string[],
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
        symbol:   symResult.status === "success" ? String(symResult.result) : "???",
        decimals: decResult.status === "success" ? Number(decResult.result) : 18,
      });
    }
  } catch (err) {
    errors.push(`token metadata multicall failed: ${err instanceof Error ? err.message : String(err)}`);
    for (const addr of tokenAddresses) {
      result.set(addr.toLowerCase(), { symbol: "???", decimals: 18 });
    }
  }

  return result;
}

// ─── Walker ────────────────────────────────────────────────────────────────────

export async function walkPinkSale(chainId: SupportedChainId): Promise<WalkerResult> {
  const started  = Date.now();
  const contract = PINKSALE_CONTRACTS[chainId];
  if (!contract) {
    return {
      protocol:    "pinksale",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "no contract deployed on this chain",
      elapsedMs:   Date.now() - started,
    };
  }

  const limits = CHAIN_LIMITS[chainId];
  if (!limits) {
    return {
      protocol:    "pinksale",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       null,
      elapsedMs:   Date.now() - started,
    };
  }

  const errors: string[] = [];

  // 1. Discover owners from event scan
  let owners: string[];
  try {
    owners = await discoverOwners(chainId, contract, limits.chunkSize, limits.windowBlocks, errors);
  } catch (err) {
    return {
      protocol:    "pinksale",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       `owner discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      elapsedMs:   Date.now() - started,
    };
  }

  if (owners.length > MAX_OWNERS) {
    console.error(`[tvl-walker:pinksale/${chainId}] owner cap hit: discovered ${owners.length}, capping to ${MAX_OWNERS}`);
    owners = owners.slice(0, MAX_OWNERS);
  }

  if (owners.length === 0) {
    return {
      protocol:    "pinksale",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      elapsedMs:   Date.now() - started,
    };
  }

  // 2. Fetch locks for every owner via multicall
  const locks = await fetchLocksForOwners(chainId, contract, owners, errors);

  // 3. Collect distinct tokens + compute per-lock locked amount
  const lockedPerLock: { token: string; locked: bigint }[] = [];
  const tokenSet = new Set<string>();
  for (const lock of locks) {
    const locked = lock.amount > lock.unlockedAmount ? lock.amount - lock.unlockedAmount : 0n;
    if (locked <= 0n) continue;
    const tokenKey = lock.token.toLowerCase();
    tokenSet.add(tokenKey);
    lockedPerLock.push({ token: tokenKey, locked });
  }

  // 4. Multicall token metadata for distinct tokens
  const tokenMeta = await fetchTokenMeta(chainId, Array.from(tokenSet), errors);

  // 5. Aggregate by token
  const byToken = new Map<string, TokenAggregate>();
  for (const { token, locked } of lockedPerLock) {
    const existing = byToken.get(token);
    if (existing) {
      existing.lockedAmount = (BigInt(existing.lockedAmount) + locked).toString();
      existing.streamCount += 1;
    } else {
      const meta = tokenMeta.get(token) ?? { symbol: "???", decimals: 18 };
      byToken.set(token, {
        chainId,
        tokenAddress:  token,
        tokenSymbol:   meta.symbol,
        tokenDecimals: meta.decimals,
        lockedAmount:  locked.toString(),
        streamCount:   1,
      });
    }
  }

  return {
    protocol:    "pinksale",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: lockedPerLock.length,
    error:       errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
    elapsedMs:   Date.now() - started,
  };
}
