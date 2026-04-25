// src/lib/vesting/tvl-walker/pinksale.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive PinkSale (PinkLock V2) walker — direct contract enumeration.
//
// PinkLock V2 exposes built-in enumeration helpers, so we don't need
// eth_getLogs at all. That's what makes this work on free-tier RPCs (Alchemy
// free caps eth_getLogs at 10 blocks; publicnode prunes logs; dRPC has range
// caps). Contract reads via Multicall3 are just regular eth_call requests
// every RPC supports.
//
// Strategy (per chain):
//   1. allNormalTokenLockedCount() → distinct-token count.
//   2. getCumulativeNormalTokenLockInfo(start, end), Multicall3.tryAggregate paged.
//   3. Per-token: getLocksForToken(token, start, end), batched the same way.
//   4. Active locks: unlockedAmount < amount, locked = amount - unlockedAmount.
//   5. Multicall ERC20 symbol + decimals for distinct tokens.
//   6. Aggregate by tokenAddress → TokenAggregate[].
//
// LP locks are skipped (separate product, not vesting — same reason we exclude
// them from DefiLlama in the audit methodology).
//
// Source: https://bscscan.com/address/0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe#code
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http } from "viem";
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

// Multicall3 — same address on all 4 supported chains.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

// Inclusive-exclusive ranges. Tuned conservatively for free-tier RPC quirks:
// * BSC/Base dRPC return sporadic HTTP 500 — small chunks let retries pick up.
// * ETH PinkLock has historical locks whose ABI-decode trips up viem on some
//   tokens — small chunks contain the blast radius (lose 50 locks not 5000).
// * Polygon worked at 100 in production; could re-raise per-chain later.
const PAGE_SIZE = 50;
// Realistic chain max: ~3-4k for BSC, much less elsewhere. Hitting this logs.
const MAX_TOKENS = 5000;

// ─── ABIs ──────────────────────────────────────────────────────────────────────

const VIEW = "view" as const;
const FN   = "function" as const;

const CUMULATIVE_LOCK_INFO_TUPLE = {
  type: "tuple[]",
  components: [
    { name: "token",   type: "address" },
    { name: "factory", type: "address" },
    { name: "amount",  type: "uint256" },
  ],
} as const;

const LOCK_TUPLE = {
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
} as const;

const PINKSALE_ABI = [
  { name: "allNormalTokenLockedCount", type: FN, inputs: [], outputs: [{ type: "uint256" }], stateMutability: VIEW },
  { name: "getCumulativeNormalTokenLockInfo", type: FN, stateMutability: VIEW,
    inputs:  [{ name: "start", type: "uint256" }, { name: "end", type: "uint256" }],
    outputs: [CUMULATIVE_LOCK_INFO_TUPLE] },
  { name: "totalLockCountForToken", type: FN, stateMutability: VIEW,
    inputs:  [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "getLocksForToken", type: FN, stateMutability: VIEW,
    inputs:  [{ name: "token", type: "address" }, { name: "start", type: "uint256" }, { name: "end", type: "uint256" }],
    outputs: [LOCK_TUPLE] },
] as const;

const ERC20_ABI = [
  { name: "symbol",   type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
  { name: "decimals", type: "function" as const, inputs: [], outputs: [{ type: "uint8"  }], stateMutability: "view" as const },
] as const;

// ─── viem helpers ──────────────────────────────────────────────────────────────

// Default fallback: dRPC. Even with dRPC's flakiness, contract reads are way
// more forgiving than eth_getLogs.
function getRpcUrl(chainId: SupportedChainId): string {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return process.env.ALCHEMY_RPC_URL_ETH  ?? "https://eth.drpc.org";
    case CHAIN_IDS.BSC:      return process.env.BSC_RPC_URL           ?? "https://bsc.drpc.org";
    case CHAIN_IDS.POLYGON:  return process.env.POLYGON_RPC_URL       ?? "https://polygon.drpc.org";
    case CHAIN_IDS.BASE:     return process.env.ALCHEMY_RPC_URL_BASE  ?? "https://base.drpc.org";
    default:                 return "https://eth.drpc.org";
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

function makeClient(chainId: SupportedChainId) {
  return createPublicClient({
    chain:     getViemChain(chainId),
    transport: http(getRpcUrl(chainId), { batch: true }),
  });
}

// ─── Retry helper ──────────────────────────────────────────────────────────────
// dRPC and other free tiers frequently return transient errors; 1s/2s/4s
// exponential backoff over 3 attempts handles them.
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Treat 500-series as transient too — dRPC BSC/Base sporadically returns
      // 500 on cold connections. Confirmed in prod: same call succeeds 1-2s later.
      const isTransient =
        msg.includes("Temporary internal error") ||
        msg.toLowerCase().includes("too many request") ||
        msg.toLowerCase().includes("rate limit") ||
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("500") ||
        msg.toLowerCase().includes("http request failed");
      if (!isTransient || attempt === maxAttempts - 1) throw err;
      void label;  // intentionally unused — retained for future telemetry
      await new Promise((r) => setTimeout(r, 1_000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// ─── Raw shapes (match ABI tuples) ────────────────────────────────────────────

interface CumulativeLockInfoRaw { token: string; factory: string; amount: bigint }
interface PinkLockRaw {
  id: bigint; token: string; owner: string; amount: bigint;
  lockDate: bigint; tgeDate: bigint; tgeBps: bigint;
  cycle: bigint; cycleBps: bigint; unlockedAmount: bigint;
  description: string;
}

// ─── Multicall helper ──────────────────────────────────────────────────────────
//
// Run `calls` via Multicall3.tryAggregate in fixed-size chunks. Per-call
// results align with input order; failed calls become null + push a labelled
// error. Top-level chunk failures push an error and skip that chunk only.
//
// Two-pass retry strategy:
//   Pass 1 — batched multicall (fast path, ~95% of calls succeed)
//   Pass 2 — for any calls that failed in pass 1, retry them INDIVIDUALLY
//            via direct readContract with withRetry's exponential backoff.
//            Catches transient HTTP 500s on dRPC BSC/Base + viem's batch
//            decode hiccups when one bad token's lock data poisons the
//            whole multicall response.
type Call = { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] };
async function chunkedMulticall<T>(
  client: ReturnType<typeof makeClient>,
  calls:  Call[],
  chunkSize: number,
  label:  string,
  errors: string[],
): Promise<(T | null)[]> {
  const out: (T | null)[] = new Array(calls.length).fill(null);
  const failedIndices: number[] = [];

  // Pass 1 — batched multicall, fast path.
  for (let i = 0; i < calls.length; i += chunkSize) {
    const slice = calls.slice(i, i + chunkSize);
    try {
      const results = await withRetry(`${label} ${i}`, () =>
        // viem's overloaded multicall types don't narrow well across our generic Call alias.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.multicall({ contracts: slice as any, multicallAddress: MULTICALL3, allowFailure: true }),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "success") out[i + j] = r.result as T;
        else failedIndices.push(i + j);
      }
    } catch (err) {
      // Whole-chunk failure (e.g. RPC went down mid-batch). Mark every call
      // in the chunk as failed so pass-2 picks them up individually.
      void err;
      for (let j = 0; j < slice.length; j++) failedIndices.push(i + j);
    }
  }

  // Pass 2 — direct readContract for the failures. Slower, but each call has
  // its own retry budget, and individual readContract calls don't share the
  // multicall response-size / decode-poison failure modes.
  if (failedIndices.length > 0) {
    // Cap pass-2 work — if HALF the calls failed in pass 1, the underlying
    // RPC is broken and individually retrying just wastes time. Better to
    // skip and report the partial result than burn 5min hitting a dead host.
    if (failedIndices.length > calls.length / 2) {
      errors.push(`${label}: pass-1 failed for ${failedIndices.length}/${calls.length} calls — skipping pass-2`);
      return out;
    }
    for (const idx of failedIndices) {
      const call = calls[idx];
      try {
        const result = await withRetry(`${label}#${idx} retry`, () =>
          client.readContract({
            address:      call.address,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            abi:          call.abi as any,
            functionName: call.functionName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args:         (call.args ?? []) as any,
          }),
        );
        out[idx] = result as T;
      } catch (err) {
        errors.push(`${label} #${idx}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return out;
}

// ─── Page through cumulative token info ────────────────────────────────────────

async function fetchAllLockedTokens(
  chainId: SupportedChainId, contract: `0x${string}`, total: bigint, errors: string[],
): Promise<string[]> {
  const totalNum = Number(total);
  const cap = Math.min(totalNum, MAX_TOKENS);
  if (totalNum > MAX_TOKENS) {
    console.error(`[tvl-walker:pinksale/${chainId}] token cap hit: total=${totalNum}, capping to ${MAX_TOKENS}`);
  }

  const calls: Call[] = [];
  for (let start = 0; start < cap; start += PAGE_SIZE) {
    calls.push({
      address: contract, abi: PINKSALE_ABI,
      functionName: "getCumulativeNormalTokenLockInfo",
      args: [BigInt(start), BigInt(Math.min(start + PAGE_SIZE, cap))],
    });
  }

  const results = await chunkedMulticall<readonly CumulativeLockInfoRaw[]>(
    makeClient(chainId), calls, /* chunkSize */ calls.length || 1, "cumulativeTokenInfo", errors,
  );

  const tokens = new Set<string>();
  for (const rows of results) {
    if (!rows) continue;
    for (const row of rows) {
      if (!row.token || row.token === "0x0000000000000000000000000000000000000000") continue;
      tokens.add(row.token.toLowerCase());
    }
  }
  return Array.from(tokens);
}

// ─── Per-token lock counts ────────────────────────────────────────────────────

async function fetchLockCounts(
  chainId: SupportedChainId, contract: `0x${string}`, tokens: string[], errors: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (tokens.length === 0) return result;

  const calls: Call[] = tokens.map((token) => ({
    address: contract, abi: PINKSALE_ABI,
    functionName: "totalLockCountForToken",
    args: [token as `0x${string}`],
  }));
  const results = await chunkedMulticall<bigint>(makeClient(chainId), calls, 200, "lockCount", errors);
  for (let i = 0; i < tokens.length; i++) {
    if (results[i] != null) result.set(tokens[i], Number(results[i] as bigint));
  }
  return result;
}

// ─── Fetch every lock for every token ─────────────────────────────────────────

async function fetchAllLocks(
  chainId: SupportedChainId, contract: `0x${string}`,
  lockCounts: Map<string, number>, errors: string[],
): Promise<PinkLockRaw[]> {
  // Flatten (token, start, end) page descriptors so multicall batches are
  // fixed size regardless of how lopsided per-token lock counts are.
  const calls: Call[] = [];
  for (const [token, count] of lockCounts) {
    if (count <= 0) continue;
    for (let start = 0; start < count; start += PAGE_SIZE) {
      calls.push({
        address: contract, abi: PINKSALE_ABI,
        functionName: "getLocksForToken",
        args: [token as `0x${string}`, BigInt(start), BigInt(Math.min(start + PAGE_SIZE, count))],
      });
    }
  }

  // 50 page-calls × 100 structs = up to 5000 Lock structs per response —
  // below typical RPC caps even with description strings.
  const results = await chunkedMulticall<readonly PinkLockRaw[]>(
    makeClient(chainId), calls, 50, "locksForToken", errors,
  );

  const locks: PinkLockRaw[] = [];
  for (const rows of results) if (rows) for (const lock of rows) locks.push(lock);
  return locks;
}

// ─── Token metadata (chunked multicall) ───────────────────────────────────────

async function fetchTokenMeta(
  chainId: SupportedChainId, tokenAddresses: string[], errors: string[],
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const result = new Map<string, { symbol: string; decimals: number }>();
  if (tokenAddresses.length === 0) return result;

  const calls: Call[] = tokenAddresses.flatMap((addr) => [
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol"   },
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" },
  ]);
  // 250 tokens × 2 calls each = 500 returns/response
  const results = await chunkedMulticall<unknown>(makeClient(chainId), calls, 500, "tokenMeta", errors);
  for (let i = 0; i < tokenAddresses.length; i++) {
    const sym = results[i * 2];
    const dec = results[i * 2 + 1];
    result.set(tokenAddresses[i].toLowerCase(), {
      symbol:   sym != null ? String(sym) : "???",
      decimals: dec != null ? Number(dec) : 18,
    });
  }
  return result;
}

// ─── Walker ────────────────────────────────────────────────────────────────────

export async function walkPinkSale(chainId: SupportedChainId): Promise<WalkerResult> {
  const started  = Date.now();
  const contract = PINKSALE_CONTRACTS[chainId];
  if (!contract) {
    return { protocol: "pinksale", chainId, tokens: [], streamCount: 0,
      error: "no contract deployed on this chain", elapsedMs: Date.now() - started };
  }

  const errors: string[] = [];
  const client = makeClient(chainId);

  // 1. Total normal-token-locked count.
  let totalTokens: bigint;
  try {
    totalTokens = await withRetry("allNormalTokenLockedCount", () =>
      client.readContract({
        address:      contract,
        abi:          PINKSALE_ABI,
        functionName: "allNormalTokenLockedCount",
      }),
    ) as bigint;
  } catch (err) {
    return { protocol: "pinksale", chainId, tokens: [], streamCount: 0,
      error: `allNormalTokenLockedCount failed: ${err instanceof Error ? err.message : String(err)}`,
      elapsedMs: Date.now() - started };
  }

  if (totalTokens === 0n) {
    return { protocol: "pinksale", chainId, tokens: [], streamCount: 0,
      error: null, elapsedMs: Date.now() - started };
  }

  // 2. Distinct token addresses.
  const tokens = await fetchAllLockedTokens(chainId, contract, totalTokens, errors);
  if (tokens.length === 0) {
    return { protocol: "pinksale", chainId, tokens: [], streamCount: 0,
      error: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      elapsedMs: Date.now() - started };
  }

  // 3. Per-token lock counts.
  const lockCounts = await fetchLockCounts(chainId, contract, tokens, errors);

  // 4. Every individual lock for every token.
  const locks = await fetchAllLocks(chainId, contract, lockCounts, errors);

  // 5. Filter active locks + per-lock locked = amount - unlockedAmount.
  const lockedPerLock: { token: string; locked: bigint }[] = [];
  const distinctTokens = new Set<string>();
  for (const lock of locks) {
    if (lock.unlockedAmount >= lock.amount) continue;
    const locked = lock.amount - lock.unlockedAmount;
    if (locked <= 0n) continue;
    const tokenKey = lock.token.toLowerCase();
    distinctTokens.add(tokenKey);
    lockedPerLock.push({ token: tokenKey, locked });
  }

  // 6. Token metadata.
  const tokenMeta = await fetchTokenMeta(chainId, Array.from(distinctTokens), errors);

  // 7. Aggregate.
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
