// src/lib/vesting/tvl-walker/uncx-vm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive UNCX VestingManager walker — event-driven. No subgraph, so we
// enumerate VestingCreated logs in 49,999-block chunks (10 in flight), then
// batch-read getVestingSchedule via multicall (500 per call), compute locked
// per schedule (sum of future-tranche amounts clamped to total-released;
// cancelled → 0), and multicall symbol()/decimals() on the distinct tokens.
// Polygon is not deployed → returns empty result cleanly.
// MAX_LOG_WINDOW caps the LOG scan so an RPC misconfig can't cause an
// hours-long walk. That clamp alone silently zeroed this walker: the window
// only covers recent blocks, VestingManager schedules are mostly older, so
// every chain found zero ids and reported $0 TVL with no error while 5,023
// schedules sat in the cache (found 2026-09-09). Discovery is therefore
// cache-first now — the event indexer already owns full history behind a
// persistent cursor — and the bounded log scan is kept only to catch
// schedules created since the indexer's last tick. The two sets are unioned,
// so neither source alone can zero the result.
// ─────────────────────────────────────────────────────────────────────────────

import { type Hex } from "viem";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { makeFallbackClient } from "../rpc";
import type { WalkerResult, TokenAggregate } from "./types";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { withTimeout } from "@/lib/with-timeout";

// ─── Per-chain config ──────────────────────────────────────────────────────────

// 2026-09-12: this used to carry a viem chain object and its own hardcoded
// RPC per chain — a second copy of knowledge that already lives in rpc.ts, and
// it defaulted to dRPC, whose free plan cannot serve eth_getLogs on ANY chain
// (probed on all seven). So this walker was pointed straight at a provider
// that could not answer its only query. It now goes through
// makeFallbackClient, which knows which providers can serve logs and falls
// back across the whole pool, and the config is reduced to the two things
// that genuinely differ per chain.
const CHAIN_CONFIG: Partial<Record<SupportedChainId, {
  contractAddress: `0x${string}`;
  fromBlock:       bigint;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    contractAddress: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    fromBlock:       23_143_944n,
  },
  [CHAIN_IDS.BASE]: {
    contractAddress: "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45",
    fromBlock:       43_187_425n,
  },
  [CHAIN_IDS.BSC]: {
    contractAddress: "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa",
    fromBlock:       85_818_300n,
  },
  // Robinhood Chain — UNCX's V2 token vesting, live since block 59,662,330.
  // Mirrors UNCX_VM_CONFIG in indexer/uncx-vm.ts.
  //
  // KNOWN GAP (2026-09-12): this walker returns 0 for Robinhood and the chain
  // therefore has no TVL. Discovery is fine — the ids come from the cache and
  // resolve to 127 and 128 — but the getVestingSchedule struct DIFFERS on
  // UNCX's Robinhood deployment, and decoding fails with
  //   "Bytes value ... is not a valid boolean"
  // i.e. the field layout below does not match that contract. The indexer is
  // unaffected because it reads from the VestingCreated event topics, which is
  // why the positions are indexed correctly (GWOOD, FLYWHEEL) while the dollar
  // value is missing. /protocols/uncx hides zero-TVL chains, so nothing false
  // is displayed — the chain is simply absent from the value breakdown.
  //
  // To finish: pull the verified ABI for 0xB31eAEFA... from the Robinhood
  // explorer and give this walker a per-chain struct, the same way the
  // indexer already keeps a per-chain scan window.
  [CHAIN_IDS.ROBINHOOD]: {
    contractAddress: "0xB31eAEFA2A0bdC53Df6D7a7f0f289b6eE1a8AAF3",
    fromBlock:       59_662_330n,
  },
};

// 9_999 to fit dRPC's free-tier 10k-block cap on eth_getLogs. Going higher
// is fine if a paid Alchemy/QuickNode URL is set in env (their block-range
// caps are much higher), but the default fallback enforces the lower limit.
const CHUNK_SIZE       = 9_999n;
const CHUNK_BATCH      = 3;            // concurrent getLogs calls, tuned low for free-tier RPC rate limits
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

/**
 * Vesting ids already indexed for this chain, from vesting_streams_cache.
 * Stream ids are `uncx-vm-{chainId}-{vestingId}`. Returns an empty set on any
 * DB error so the walker degrades to the log scan rather than failing.
 */
async function readCachedVestingIds(chainId: SupportedChainId): Promise<bigint[]> {
  try {
    // Bounded: this walker runs inside a cron with a hard ceiling, and the
    // log scan below is a complete (if narrower) fallback, so a slow or
    // unreachable DB degrades the result rather than hanging the snapshot.
    const r = await withTimeout(
      db.execute(sql`
        SELECT split_part(stream_id, '-', 4) AS vid
          FROM vesting_streams_cache
         WHERE protocol = 'uncx-vm' AND chain_id = ${chainId}
      `),
      10_000,
      null,
      `uncx-vm:cached-ids:${chainId}`,
    );
    if (r == null) return [];
    const rows = (r as unknown as { rows?: { vid: string }[] }).rows ?? (r as unknown as { vid: string }[]);
    const out: bigint[] = [];
    for (const row of rows) {
      if (row.vid && /^\d+$/.test(row.vid)) out.push(BigInt(row.vid));
    }
    return out;
  } catch (err) {
    console.error(`[uncx-vm/${chainId}] cached-id read failed:`, err);
    return [];
  }
}

function empty(chainId: SupportedChainId, started: number, error: string | null = null): WalkerResult {
  return { protocol: "uncx-vm", chainId, tokens: [], streamCount: 0, error, elapsedMs: Date.now() - started };
}

export async function walkUncxVm(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  const config = CHAIN_CONFIG[chainId];
  // Polygon (or any other un-deployed chain) — clean empty result.
  if (!config) return empty(chainId, started);


  // forLogs:true so the transport only contains providers that can actually
  // serve eth_getLogs — this walker's whole first phase is a log scan.
  const client = makeFallbackClient(chainId, { forLogs: true });
  if (!client) return empty(chainId, started, "no log-capable RPC in the pool for this chain");

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

  // Union the bounded log scan with everything the event indexer has already
  // recorded, so a clamped window (or a stalled chain) cannot zero the walk.
  for (const id of await readCachedVestingIds(chainId)) vestingIds.add(id);

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
