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

import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

// ─── Contract addresses ────────────────────────────────────────────────────────

// PinkLock V2 contract addresses are now in a single source of truth.
// See PINKSALE_CONTRACT_ADDRESSES in src/lib/protocol-constants.ts for
// the V1/V2 history and audit comment.
import { PINKSALE_CONTRACT_ADDRESSES as PINKSALE_CONTRACTS } from "../../protocol-constants";

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
//
// RPC selection now goes through the shared multi-RPC pool in
// `src/lib/vesting/rpc.ts` via viem's `fallback` transport. Every call
// the client makes tries every URL in the pool in priority order until
// one succeeds — so a single dead provider can no longer kill the walk.
// Replaces the previous round-robin pattern that left the whole walk
// pinned to whichever URL `getRpcUrl()` happened to hand out at the
// makeClient() call site (the failure mode that blanked Hedgey on
// ETH + Polygon during the 2026-05-05 daily TVL cron).
import { makeFallbackClient } from "../rpc";

function makeClient(chainId: SupportedChainId) {
  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) {
    throw new Error(`PinkSale: no RPC pool configured for chain ${chainId}`);
  }
  return client;
}

// ─── Retry helper ──────────────────────────────────────────────────────────────
// dRPC and other free tiers frequently return transient errors. Exponential
// backoff (1/2/4/8/16s) over 5 attempts handles them.
//
// Bumped 3 → 5 attempts on May 1 2026 after BSC walker came back with only
// 304 streams from a contract holding 22k tokens. The PinkSale walker uses
// chunkedMulticall which batches O(N/chunk) eth_calls — at PAGE_SIZE=50 and
// 22k tokens that's ~440 multicall round-trips. dRPC's free-tier rate limit
// kicks in around 100 reqs/sec, so ~3-4 of those 440 chunks were getting
// throttled and exhausting their 3-attempt retry budget. Five attempts with
// up to 16s of backoff comfortably absorbs the throttle bursts.
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
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
        msg.includes("429") ||
        msg.toLowerCase().includes("request timeout") ||
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
    // Cap pass-2 work at 90% — if NEARLY ALL calls failed in pass 1 the
    // underlying RPC is broken and individually retrying wastes time. The
    // previous 50% threshold tripped on rate-limited BSC even when ~70%
    // of calls would have recovered with a few retries (May 1 2026 deep
    // seed: BSC walker returned only 304 streams of an expected ~3000+
    // because we abandoned pass-2 after pass-1 looked rough). Lifting to
    // 90% means we now actually retry rate-limited chunks instead of
    // bailing on them.
    //
    // BUT — the 90% heuristic only makes sense when there are ENOUGH calls
    // for "90%" to be a real signal. On small workloads (Polygon PinkSale
    // has ~611 tokens → 13 multicall page-calls; the entire list fits in a
    // single chunk of size 20), a single transient batch failure means
    // 13/13 calls failed → 100% > 90% → bailout fires → fetchAllLockedTokens
    // returns 0 tokens → discoverPinkSaleOwners returns 0 owners. Polygon
    // production trace May 4 2026: totalTokens=611 then "enumerated 0 owners"
    // 88ms later, no enumeration log line — exactly this bypass pattern.
    //
    // Skip the bailout when calls.length is small (<= 50). Pass-2's per-call
    // retry budget is bounded enough that even retrying 50 calls one-by-one
    // is fast — and for small N, "ALL failed" means "one batch hiccupped",
    // not "RPC is dead". The bailout still protects large-N workloads (BSC's
    // 22k tokens → ~440 multi-page calls) where blanket pass-2 retries
    // genuinely would waste time on a dead provider.
    if (calls.length > 50 && failedIndices.length > calls.length * 0.9) {
      errors.push(`${label}: pass-1 failed for ${failedIndices.length}/${calls.length} calls — RPC appears dead, skipping pass-2`);
      return out;
    }
    if (failedIndices.length > calls.length / 2) {
      console.warn(`[tvl-walker] ${label}: pass-1 failed for ${failedIndices.length}/${calls.length} (>50%) — pass-2 will be slow`);
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

  // Chunk at 20 — one multicall returning 20 pages of up to 50 token-info
  // tuples each = up to 1000 tuples per response, well within dRPC limits.
  // Sending the whole call list in a single multicall (the previous
  // behaviour) overloaded dRPC on BSC where ~5k tokens means ~100 paged
  // calls in one request → 100% pass-1 failure observed in production.
  const results = await chunkedMulticall<readonly CumulativeLockInfoRaw[]>(
    makeClient(chainId), calls, 20, "cumulativeTokenInfo", errors,
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
  const results = await chunkedMulticall<bigint>(makeClient(chainId), calls, 100, "lockCount", errors);
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

  // 25 page-calls × 50 structs = up to 1250 Lock structs per response.
  // Conservative for dRPC free-tier; ETH "Position 281 out of bounds" was
  // a single token's bad encoding poisoning the whole 50-call multicall —
  // smaller chunks contain blast radius.
  const results = await chunkedMulticall<readonly PinkLockRaw[]>(
    makeClient(chainId), calls, 25, "locksForToken", errors,
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
  // 50 tokens × 2 calls each = 100 returns/response. Was 500/response which
  // overloaded dRPC on chains with many distinct tokens.
  const results = await chunkedMulticall<unknown>(makeClient(chainId), calls, 100, "tokenMeta", errors);
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

/**
 * Discover the unique set of PinkLock V2 lock owners on a chain — i.e.
 * every wallet address that has ever created a normal-token lock through
 * the PinkSale launchpad.
 *
 * Why this lives in the walker module: it reuses the SAME enumeration
 * pipeline `walkPinkSale` already uses (Multicall3 + getCumulativeNorm-
 * alTokenLockInfo + getLocksForToken). Both the seeder (recipients for
 * /protocols/pinksale stat strip) and the walker (TVL aggregation) need
 * to enumerate locks; they just project the result differently.
 *
 * Why it does NOT use eth_getLogs (the seeder's previous approach):
 *
 *   - Free-tier RPCs cap eth_getLogs aggressively. Alchemy free is 10
 *     blocks per request. publicnode prunes logs older than ~17 days
 *     (BSC) / ~10 days (Polygon). dRPC has range caps too.
 *   - PinkLock V2 has built-in enumeration helpers, so we don't need
 *     logs at all. Contract reads via Multicall3 are just regular
 *     eth_call requests every RPC supports without limits.
 *
 * Returned addresses are lowercase, deduplicated. Owner=0x0000…
 * entries are filtered out (defensive — shouldn't happen in practice
 * but cheaper to filter than to debug if a corrupt response slips
 * through). Returns [] on any total-tokens-count failure (we'd rather
 * the seeder fall back to its curated list than seed garbage).
 */
/**
 * Returns ALL PinkSale locks for a chain plus the resolved token metadata.
 * The seeder uses this to populate vesting_streams_cache directly,
 * bypassing the per-wallet adapter — see seeder.ts pinksale special case.
 *
 * Why: the per-wallet adapter calls `getUserNormalLocksLength(owner)`
 * which only counts CURRENTLY ACTIVE locks (i.e. locks whose unlockedAmount
 * < amount). Walker-discovered owners often had all their locks fully
 * withdrawn between discovery and seed-time, so the adapter returned []
 * for them and the seeder logged "0 streams fetched, 0 errors". Using
 * the walker's token-side enumeration (`getLocksForToken`) directly gives
 * us every active lock without the owner-side filter ambiguity.
 *
 * Returns null on early-fail conditions (no contract, totalTokens=0,
 * RPC dead) so the seeder can fall through to its existing path
 * cleanly.
 */
export async function fetchPinkSaleAllLocks(
  chainId: SupportedChainId,
): Promise<{
  locks:     PinkLockRaw[];
  tokenMeta: Map<string, { symbol: string; decimals: number }>;
  errors:    string[];
} | null> {
  const contract = PINKSALE_CONTRACTS[chainId];
  if (!contract) return null;

  const errors: string[] = [];
  const client = makeClient(chainId);

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
    errors.push(`allNormalTokenLockedCount failed: ${err instanceof Error ? err.message : String(err)}`);
    return { locks: [], tokenMeta: new Map(), errors };
  }
  if (totalTokens === 0n) return { locks: [], tokenMeta: new Map(), errors };

  const tokens = await fetchAllLockedTokens(chainId, contract, totalTokens, errors);
  if (tokens.length === 0) return { locks: [], tokenMeta: new Map(), errors };

  const lockCounts = await fetchLockCounts(chainId, contract, tokens, errors);
  const locks      = await fetchAllLocks(chainId, contract, lockCounts, errors);

  // Filter to ACTIVE locks (unlockedAmount < amount). This matches what the
  // per-wallet adapter would return for live owners — historical locks
  // that have been fully withdrawn don't belong in vesting_streams_cache
  // either.
  const activeLocks = locks.filter((l) => l.unlockedAmount < l.amount);

  // Token metadata lookup for every unique token referenced by an active
  // lock. Same shape the adapter expects.
  const distinctTokens = Array.from(new Set(activeLocks.map((l) => l.token.toLowerCase())));
  const tokenMeta      = await fetchTokenMeta(chainId, distinctTokens, errors);

  return { locks: activeLocks, tokenMeta, errors };
}

export async function discoverPinkSaleOwners(chainId: SupportedChainId): Promise<string[]> {
  const contract = PINKSALE_CONTRACTS[chainId];
  if (!contract) return [];

  const errors: string[] = [];
  const client = makeClient(chainId);

  let totalTokens: bigint;
  try {
    totalTokens = await withRetry("allNormalTokenLockedCount", () =>
      client.readContract({
        address:      contract,
        abi:          PINKSALE_ABI,
        functionName: "allNormalTokenLockedCount",
      }),
    ) as bigint;
    // Log on success too — without this, "0 recipients in 254ms" is
    // ambiguous between (a) contract genuinely says 0n (probably wrong
    // address for that chain) and (b) RPC swallowed an error. Vercel
    // logs now disambiguate at a glance.
    console.log(`[discoverPinkSaleOwners/${chainId}] totalTokens=${totalTokens.toString()} (contract=${contract})`);
  } catch (err) {
    console.error(`[discoverPinkSaleOwners/${chainId}] allNormalTokenLockedCount failed:`, err);
    return [];
  }

  if (totalTokens === 0n) {
    console.warn(`[discoverPinkSaleOwners/${chainId}] contract returned totalTokens=0 — verify contract address ${contract} is the live PinkLock V2 deployment for this chain`);
    return [];
  }

  const tokens = await fetchAllLockedTokens(chainId, contract, totalTokens, errors);
  if (tokens.length === 0) return [];

  const lockCounts = await fetchLockCounts(chainId, contract, tokens, errors);
  let totalLocks = 0;
  for (const n of lockCounts.values()) totalLocks += Number(n);
  const locks = await fetchAllLocks(chainId, contract, lockCounts, errors);

  const owners = new Set<string>();
  for (const lock of locks) {
    if (!lock.owner) continue;
    const lower = lock.owner.toLowerCase();
    if (lower === "0x0000000000000000000000000000000000000000") continue;
    owners.add(lower);
  }

  // Always log the enumeration shape so partial-coverage is visible in
  // ops without needing to dig through chunk-error logs. Useful signals:
  //   - tokens fetched < totalTokens → fetchAllLockedTokens lost some
  //   - locks fetched < totalLocks   → fetchAllLocks lost some
  //   - owners < locks               → normal (one owner per many locks)
  console.log(
    `[discoverPinkSaleOwners/${chainId}] enumeration: ` +
    `tokens=${tokens.length}/${totalTokens.toString()} ` +
    `locks=${locks.length}/${totalLocks} ` +
    `owners=${owners.size} ` +
    `errors=${errors.length}`,
  );

  if (errors.length > 0) {
    console.warn(`[discoverPinkSaleOwners/${chainId}] ${errors.length} non-fatal chunk errors during enumeration; recovered ${owners.size} owners regardless`);
  }

  return Array.from(owners);
}

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
