// src/lib/vesting/tvl-walker/uncx-vm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive UNCX VestingManager walker — event-driven. No subgraph, so we
// enumerate VestingCreated logs in 49,999-block chunks (10 in flight), then
// batch-read getVestingSchedule via multicall (500 per call), compute locked
// per schedule (sum of future-tranche amounts clamped to total-released;
// cancelled → 0), and multicall symbol()/decimals() on the distinct tokens.
// Polygon is not deployed → returns empty result cleanly.
// MAX_LOG_WINDOW caps the scan so early-protocol RPC misconfig can't cause
// an hours-long walk.
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http, type Hex } from "viem";
import { mainnet, bsc, base } from "viem/chains";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

// ─── Per-chain config ──────────────────────────────────────────────────────────

const CHAIN_CONFIG: Partial<Record<SupportedChainId, {
  contractAddress: `0x${string}`;
  fromBlock:       bigint;
  chain:           typeof mainnet | typeof bsc | typeof base;
  getRpcUrl:       () => string | undefined;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    contractAddress: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    fromBlock:       23_143_944n,
    chain:           mainnet,
    // RPC fallback strategy: dRPC public endpoints. See the getRpcUrl
    // comment block in tvl-walker/pinksale.ts for the full survey of why
    // (publicnode prunes, Ankr requires keys, free-tier Alchemy caps
    // eth_getLogs at 10 blocks which is unusable for event scans).
    getRpcUrl:       () => process.env.ALCHEMY_RPC_URL_ETH ?? "https://eth.drpc.org",
  },
  [CHAIN_IDS.BASE]: {
    contractAddress: "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45",
    fromBlock:       43_187_425n,
    chain:           base,
    getRpcUrl:       () =>
      process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL ?? "https://base.drpc.org",
  },
  [CHAIN_IDS.BSC]: {
    contractAddress: "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa",
    fromBlock:       85_818_300n,
    chain:           bsc,
    getRpcUrl:       () => process.env.BSC_RPC_URL ?? "https://bsc.drpc.org",
  },
};

// 9_999 to fit dRPC's free-tier 10k-block cap on eth_getLogs. Going higher
// is fine if a paid Alchemy/QuickNode URL is set in env (their block-range
// caps are much higher), but the default fallback enforces the lower limit.
const CHUNK_SIZE       = 9_999n;
const CHUNK_BATCH      = 3;            // concurrent getLogs calls — tuned low for free-tier RPC rate limits
const MULTICALL_BATCH  = 500;          // schedules per multicall call
const MAX_LOG_WINDOW   = 2_000_000n;   // same safety cap used in pinksale-style walkers

// Verified topic hash from on-chain tx logs.
// event VestingCreated(uint256 indexed vestingId, address indexed beneficiary, address indexed token, ...)
const VESTING_CREATED_TOPIC =
  "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f" as Hex;

// ─── Minimal ABIs ──────────────────────────────────────────────────────────────

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

const ERC20_ABI = [
  { name: "symbol",   type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
  { name: "decimals", type: "function" as const, inputs: [], outputs: [{ type: "uint8"  }], stateMutability: "view" as const },
] as const;

// ─── Schedule → locked math ────────────────────────────────────────────────────

type Schedule = {
  token:       `0x${string}`;
  totalAmount: bigint;
  released:    bigint;
  cancelled:   boolean;
  tranches:    readonly { time: bigint; amount: bigint }[];
};

/** Sum future-tranche amounts, clamped to (total-released). Cancelled → 0. */
function computeLocked(s: Schedule, nowSec: number): bigint {
  if (s.cancelled) return 0n;
  const remaining = s.totalAmount > s.released ? s.totalAmount - s.released : 0n;
  if (remaining === 0n) return 0n;
  let future = 0n;
  for (const t of s.tranches) if (Number(t.time) > nowSec) future += t.amount;
  return future > remaining ? remaining : future;
}

// ─── Token metadata via multicall ──────────────────────────────────────────────

async function fetchTokenMeta(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client:         any,
  tokenAddresses: string[],
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const result = new Map<string, { symbol: string; decimals: number }>();
  if (tokenAddresses.length === 0) return result;

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
  } catch {
    for (const addr of tokenAddresses) {
      result.set(addr.toLowerCase(), { symbol: "???", decimals: 18 });
    }
  }

  return result;
}

// ─── Retry helper for transient dRPC / free-tier RPC errors ─────────────────
// Same pattern as tvl-walker/pinksale.ts withRetry — see that file for the
// full rationale. Free-tier RPCs return "Temporary internal error" and
// "Too many request, try again later" intermittently; short backoff fixes it.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
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
        msg.includes("502");
      if (!isTransient || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1_000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// ─── Walker ────────────────────────────────────────────────────────────────────

function empty(chainId: SupportedChainId, started: number, error: string | null = null): WalkerResult {
  return { protocol: "uncx-vm", chainId, tokens: [], streamCount: 0, error, elapsedMs: Date.now() - started };
}

export async function walkUncxVm(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  const config = CHAIN_CONFIG[chainId];
  // Polygon (or any other un-deployed chain) — clean empty result.
  if (!config) return empty(chainId, started);

  const rpcUrl = config.getRpcUrl();
  if (!rpcUrl) return empty(chainId, started, "no RPC URL configured for this chain");

  const client = createPublicClient({ chain: config.chain, transport: http(rpcUrl) });

  // ── Phase 1: enumerate vestingIds via VestingCreated logs ───────────────────
  const chunkErrors: string[] = [];
  let latestBlock: bigint;
  try {
    latestBlock = await withRetry(() => client.getBlockNumber());
  } catch (err) {
    return empty(chainId, started, `getBlockNumber: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Clamp scan window — see MAX_LOG_WINDOW comment above.
  const gap       = latestBlock - config.fromBlock;
  const fromBlock = gap > MAX_LOG_WINDOW ? latestBlock - MAX_LOG_WINDOW : config.fromBlock;

  const chunks: { from: bigint; to: bigint }[] = [];
  for (let from = fromBlock; from <= latestBlock; from += CHUNK_SIZE + 1n) {
    chunks.push({
      from,
      to: from + CHUNK_SIZE > latestBlock ? latestBlock : from + CHUNK_SIZE,
    });
  }

  const vestingIds = new Set<bigint>();
  for (let i = 0; i < chunks.length; i += CHUNK_BATCH) {
    const batch = chunks.slice(i, i + CHUNK_BATCH);
    const results = await Promise.allSettled(
      batch.map(({ from, to }) =>
        withRetry(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.getLogs as any)({
            address:   config.contractAddress,
            topics:    [VESTING_CREATED_TOPIC],
            fromBlock: from,
            toBlock:   to,
          })
        )
      )
    );
    // Small breather between batches to keep free-tier RPCs happy.
    if (i + CHUNK_BATCH < chunks.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        for (const log of r.value as { topics: readonly (Hex | null | undefined)[] }[]) {
          if (log.topics[0] === VESTING_CREATED_TOPIC && log.topics[1]) {
            vestingIds.add(BigInt(log.topics[1] as Hex));
          }
        }
      } else {
        const { from, to } = batch[j];
        chunkErrors.push(
          `chunk ${from}-${to}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    }
  }

  const ids = Array.from(vestingIds);
  if (ids.length === 0) {
    return empty(chainId, started, chunkErrors.length > 0 ? chunkErrors.join("; ").slice(0, 500) : null);
  }

  // ── Phase 2: multicall getVestingSchedule in MULTICALL_BATCH chunks ─────────
  const nowSec = Math.floor(Date.now() / 1000);
  const schedules: { token: string; locked: bigint }[] = [];
  const tokenSet   = new Set<string>();

  for (let i = 0; i < ids.length; i += MULTICALL_BATCH) {
    const slice = ids.slice(i, i + MULTICALL_BATCH);
    try {
      const results = await client.multicall({
        contracts: slice.map((vestingId) => ({
          address:      config.contractAddress,
          abi:          VESTING_MANAGER_ABI,
          functionName: "getVestingSchedule" as const,
          args:         [vestingId] as [bigint],
        })),
        allowFailure: true,
      });
      for (const r of results) {
        if (r.status !== "success") continue;
        const s = r.result as Schedule;
        const locked = computeLocked(s, nowSec);
        if (locked === 0n) continue;
        const token = s.token.toLowerCase();
        tokenSet.add(token);
        schedules.push({ token, locked });
      }
    } catch (err) {
      chunkErrors.push(
        `multicall batch ${i}-${i + slice.length}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Phase 3: token metadata ─────────────────────────────────────────────────
  const tokenMeta = await fetchTokenMeta(client, Array.from(tokenSet));

  // ── Phase 4: aggregate ──────────────────────────────────────────────────────
  const byToken = new Map<string, TokenAggregate>();
  for (const { token, locked } of schedules) {
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
    protocol:    "uncx-vm",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: schedules.length,
    error:       chunkErrors.length > 0 ? chunkErrors.join("; ").slice(0, 500) : null,
    elapsedMs:   Date.now() - started,
  };
}
