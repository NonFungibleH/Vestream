// src/lib/vesting/tvl-walker/hedgey.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Hedgey (TokenVestingPlans) walker — enumerates every active
// vesting plan via the NFT contract's ERC721Enumerable interface, reads each
// plan's tuple via multicall, computes per-plan locked amounts, and aggregates
// by token. Self-indexed replacement for the DefiLlama
// `chainTvls.vesting` passthrough.
//
// Why self-index instead of DefiLlama:
//   - DefiLlama sums TVL across every chain Hedgey deploys on. We index 6
//     mainnet chains; their global figure includes any deployment we don't
//     watch. That makes the /protocols card misleading.
//   - We already wire ERC721Enumerable enumeration in the per-wallet adapter
//     (HEDGEY_PAGE_SIZE pattern) — same primitives, different filter.
//   - Removes silent DefiLlama outage failure mode.
//
// Strategy (per chain):
//   1. totalSupply() → N plans
//   2. tokenByIndex(0..N-1) via Multicall3.tryAggregate paged → planIds
//   3. plans(planId) via Multicall3 paged → tuple per plan
//   4. Compute locked amount per plan (linear vest with cliff + rate/period)
//   5. Aggregate by token; one viem multicall per chain for ERC20 metadata
//
// Vesting math (mirrors Hedgey contract):
//   nowSec < cliff      → locked = amount
//   nowSec >= start + (amount * period) / rate  → locked = 0
//   else                → vested = ((nowSec - start) / period) * rate
//                          (floored to whole-period multiples — Hedgey
//                          contracts release in `period`-sized chunks)
//                       → locked = max(0, amount - vested)
//
// Free-tier RPCs are protected via the shared rpc.ts pool's multi-provider
// rotation + the chunked multicall's pass-1/pass-2 retry pattern (same code
// PinkSale uses; see pinksale.ts for the rationale).
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";
import { makeFallbackClient } from "../rpc";

const CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.POLYGON]:  "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.ARBITRUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.OPTIMISM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
};

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const PAGE_SIZE = 200;     // multicall chunk size — fits well under free-tier 100KB resp cap
const MAX_PLANS = 100_000; // hard cap (Hedgey's largest deployment is ~3k plans today)

const VIEW = "view" as const;
const FN   = "function" as const;

const PLAN_TUPLE = {
  type: "tuple",
  components: [
    { name: "token",            type: "address" },
    { name: "amount",           type: "uint256" },
    { name: "start",            type: "uint256" },
    { name: "cliff",            type: "uint256" },
    { name: "rate",             type: "uint256" },
    { name: "period",           type: "uint256" },
    { name: "vestingAdmin",     type: "address" },
    { name: "adminTransferOBO", type: "bool"    },
  ],
} as const;

const HEDGEY_ABI = [
  { name: "totalSupply",  type: FN, stateMutability: VIEW, inputs: [], outputs: [{ type: "uint256" }] },
  { name: "tokenByIndex", type: FN, stateMutability: VIEW,
    inputs:  [{ name: "index", type: "uint256" }],
    outputs: [{ type: "uint256" }] },
  { name: "plans",        type: FN, stateMutability: VIEW,
    inputs:  [{ name: "planId", type: "uint256" }],
    outputs: [PLAN_TUPLE] },
] as const;

const ERC20_ABI = [
  { name: "symbol",   type: FN, stateMutability: VIEW, inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: FN, stateMutability: VIEW, inputs: [], outputs: [{ type: "uint8"  }] },
] as const;

interface PlanRaw {
  token: `0x${string}`;
  amount: bigint;
  start: bigint;
  cliff: bigint;
  rate: bigint;
  period: bigint;
  vestingAdmin: `0x${string}`;
  adminTransferOBO: boolean;
}

// ─── viem helpers ────────────────────────────────────────────────────────────

// Build a multi-provider fallback client. If the first RPC in the pool
// is dead at the moment of the call (the failure mode that blanked
// Hedgey on ETH + Polygon during the 2026-05-05 daily cron), viem's
// fallback transport automatically tries the next URL — so a single
// dead provider can no longer kill the whole walk.
function makeClient(chainId: SupportedChainId) {
  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) {
    throw new Error(`Hedgey: no RPC pool configured for chain ${chainId}`);
  }
  return client;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes("Temporary internal error") ||
        msg.toLowerCase().includes("too many request") ||
        msg.toLowerCase().includes("rate limit") ||
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("500") ||
        msg.includes("429") ||
        msg.toLowerCase().includes("request timeout") ||
        msg.toLowerCase().includes("http request failed");
      if (!isTransient || attempt === maxAttempts - 1) throw err;
      void label;
      await new Promise((r) => setTimeout(r, 1_000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

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

  for (let i = 0; i < calls.length; i += chunkSize) {
    const slice = calls.slice(i, i + chunkSize);
    try {
      const results = await withRetry(`${label} ${i}`, () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.multicall({ contracts: slice as any, multicallAddress: MULTICALL3, allowFailure: true }),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "success") out[i + j] = r.result as T;
        else failedIndices.push(i + j);
      }
    } catch {
      for (let j = 0; j < slice.length; j++) failedIndices.push(i + j);
    }
  }

  // Pass-2: per-call retry for failures, except when MOST calls failed
  // and the underlying RPC is plainly down. Same heuristic as PinkSale.
  if (failedIndices.length > 0) {
    if (calls.length > 50 && failedIndices.length > calls.length * 0.9) {
      errors.push(`${label}: pass-1 failed for ${failedIndices.length}/${calls.length} — RPC appears dead`);
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

// ─── Vesting math ───────────────────────────────────────────────────────────

function computePlanLocked(plan: PlanRaw, nowSec: number): bigint {
  // Cliff hasn't hit → fully locked
  if (BigInt(nowSec) < plan.cliff) return plan.amount;
  // No rate or period → degenerate plan (treat as fully locked)
  if (plan.period === 0n || plan.rate === 0n) return plan.amount;

  const elapsed = BigInt(nowSec) > plan.start ? BigInt(nowSec) - plan.start : 0n;
  // Whole-period periods only — Hedgey releases in period-sized chunks
  const periodsElapsed = elapsed / plan.period;
  const vested = periodsElapsed * plan.rate;
  if (vested >= plan.amount) return 0n;
  return plan.amount - vested;
}

// ─── Walker ──────────────────────────────────────────────────────────────────

export async function walkHedgey(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();
  const contract = CONTRACTS[chainId];
  if (!contract) {
    return {
      protocol:    "hedgey",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "Hedgey not deployed on this chain",
      elapsedMs:   Date.now() - started,
    };
  }

  const errors: string[] = [];
  const client = makeClient(chainId);
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. totalSupply
  let totalSupplyBn: bigint;
  try {
    totalSupplyBn = await withRetry("totalSupply", () =>
      client.readContract({ address: contract, abi: HEDGEY_ABI, functionName: "totalSupply" }),
    ) as bigint;
  } catch (err) {
    return {
      protocol:    "hedgey",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       `totalSupply failed: ${err instanceof Error ? err.message : String(err)}`,
      elapsedMs:   Date.now() - started,
    };
  }

  const totalSupply = Number(totalSupplyBn);
  if (totalSupply === 0) {
    return { protocol: "hedgey", chainId, tokens: [], streamCount: 0, error: null, elapsedMs: Date.now() - started };
  }
  const cap = Math.min(totalSupply, MAX_PLANS);

  // 2. tokenByIndex(0..cap-1) → planIds
  const indexCalls: Call[] = [];
  for (let i = 0; i < cap; i++) {
    indexCalls.push({
      address:      contract,
      abi:          HEDGEY_ABI,
      functionName: "tokenByIndex",
      args:         [BigInt(i)],
    });
  }
  const planIdResults = await chunkedMulticall<bigint>(client, indexCalls, PAGE_SIZE, "tokenByIndex", errors);
  const planIds: bigint[] = [];
  for (const r of planIdResults) {
    if (r != null) planIds.push(r);
  }
  if (planIds.length === 0) {
    return {
      protocol:    "hedgey",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       errors.length > 0 ? errors.slice(0, 3).join("; ").slice(0, 500) : null,
      elapsedMs:   Date.now() - started,
    };
  }

  // 3. plans(planId) for each
  const planCalls: Call[] = planIds.map((id) => ({
    address:      contract,
    abi:          HEDGEY_ABI,
    functionName: "plans",
    args:         [id],
  }));
  const planResults = await chunkedMulticall<PlanRaw>(client, planCalls, PAGE_SIZE, "plans", errors);

  // 4. Aggregate by token
  const byToken = new Map<string, { lockedAmount: bigint; streamCount: number }>();
  for (const plan of planResults) {
    if (!plan) continue;
    if (!plan.token || plan.token === "0x0000000000000000000000000000000000000000") continue;
    if (plan.amount === 0n) continue;

    const locked = computePlanLocked(plan, nowSec);
    if (locked === 0n) continue;

    const tokenKey = plan.token.toLowerCase();
    const existing = byToken.get(tokenKey);
    if (existing) {
      existing.lockedAmount += locked;
      existing.streamCount  += 1;
    } else {
      byToken.set(tokenKey, { lockedAmount: locked, streamCount: 1 });
    }
  }

  // 5. Token metadata (symbol + decimals) via one multicall per chain
  const tokenAddresses = Array.from(byToken.keys());
  const metaCalls: Call[] = tokenAddresses.flatMap((addr) => [
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol"   },
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" },
  ]);
  const metaResults = await chunkedMulticall<unknown>(client, metaCalls, 100, "tokenMeta", errors);

  const tokens: TokenAggregate[] = tokenAddresses.map((addr, i) => {
    const symResult = metaResults[i * 2];
    const decResult = metaResults[i * 2 + 1];
    const agg = byToken.get(addr)!;
    return {
      chainId,
      tokenAddress:  addr,
      tokenSymbol:   symResult != null ? String(symResult) : null,
      tokenDecimals: decResult != null ? Number(decResult) : 18,
      lockedAmount:  agg.lockedAmount.toString(),
      streamCount:   agg.streamCount,
    };
  });

  return {
    protocol:    "hedgey",
    chainId,
    tokens,
    streamCount: planIds.length,
    error:       errors.length > 0 ? errors.slice(0, 3).join("; ").slice(0, 500) : null,
    elapsedMs:   Date.now() - started,
  };
}
