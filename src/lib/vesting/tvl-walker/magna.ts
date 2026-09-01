// src/lib/vesting/tvl-walker/magna.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Magna (Airlock) walker — factory-deployed merkle vesters.
//
// Magna deploys one "vester" contract per token distribution from published
// per-chain factories (docs.magna.so → Magna Contract Deployments):
//   - Airlock V2.1 factory: MerkleFactoryV2, event
//       MerkleCreated(address indexed benefactor, address indexed calendar, string id)
//     → vester address is topics[2].
//   - Airlock V1 factory: unverified, event 0x13c091a4… with
//       topics[1] = vested TOKEN, data = (address vester, string id)
//     → vester address is the first data word. (Verified on-chain: the data
//     address answers token() and returns exactly topics[1].)
//
// Allocation data lives in merkle LEAVES (off-chain) — only roots go on-chain —
// so per-recipient enumeration is impossible here. But TVL is fully on-chain:
// each Claim-type vester ESCROWS the tokens it distributes, so
// balanceOf(vester) of vester.token() = remaining undistributed value
// (locked + claimable-but-unclaimed). That escrow balance is what this walker
// aggregates — the honest measurable "value locked" for a merkle protocol
// (Direct-Transfer-type distributions don't escrow and contribute 0, which is
// correct: nothing is locked on-chain for those).
//
// Vester discovery is three-way, because free-tier RPCs cap eth_getLogs
// ranges (dRPC: 10k blocks) and factory genesis can be years back:
//   1. Static seed (magna-seed.ts) — full explorer backfill as of 2026-08-31.
//   2. magna_vesters DB registry — every vester any prior walk discovered.
//   3. Recent-window factory log scan (RECENT_WINDOW blocks) — new vesters,
//      which are then UPSERTED into the registry so they survive aging out
//      of the window. Registry write failures degrade gracefully (that walk
//      still counts the vester; durability catches up next run).
// ─────────────────────────────────────────────────────────────────────────────

import { type Hex } from "viem";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { magnaVesters } from "@/lib/db/schema";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";
import { makeFallbackClient } from "../rpc";
import { MAGNA_SEED_VESTERS } from "./magna-seed";

// ─── Per-chain factory config ────────────────────────────────────────────────
// Addresses from docs.magna.so "Magna Contract Deployments" (verified live
// against on-chain code + event activity 2026-08-31).

interface FactoryCfg { address: `0x${string}`; version: "v1" | "v2.1" }

const FACTORIES: Partial<Record<SupportedChainId, FactoryCfg[]>> = {
  [CHAIN_IDS.ETHEREUM]: [
    { address: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", version: "v2.1" },
    { address: "0x47546C3A473aa5150F8de23561fFE4e0ceb367a7", version: "v1"   },
  ],
  [CHAIN_IDS.BASE]: [
    { address: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", version: "v2.1" },
    { address: "0x0F15a081b6f28f3863EE0206EA512C011A24b37C", version: "v1"   },
  ],
  [CHAIN_IDS.BSC]: [
    { address: "0xaD1b1887CA414cAcF7F19288FE234c3f738dFEA2", version: "v2.1" },
    { address: "0x7fE21700152CB26065B79dfeDd03173e0238E568", version: "v1"   },
  ],
  [CHAIN_IDS.POLYGON]: [
    { address: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", version: "v2.1" },
    { address: "0xC6cC1A91082471dB3D15202cf40CfC953d8CA966", version: "v1"   },
  ],
  [CHAIN_IDS.ARBITRUM]: [
    { address: "0x76Abb45629189E3227E7b544a1949207a7d24dd5", version: "v2.1" },
    { address: "0xbD69143518303Eacfa41Ec0af91Df1E02b61f897", version: "v1"   },
  ],
  [CHAIN_IDS.OPTIMISM]: [
    { address: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", version: "v2.1" },
    { address: "0x87c4FbeB13Bfa441Ce561670020C85bf93625428", version: "v1"   },
  ],
  [CHAIN_IDS.AVALANCHE]: [
    { address: "0x11A7e1f79A5c7AE62c09Ec8CA0326ade8Ba7A5E9", version: "v2.1" },
    { address: "0xe3286f4220ecCeF9747D6e6e329FE5E73B965455", version: "v1"   },
  ],
};

// Verified topic hashes (recon 2026-08-31, per-chain explorer log histograms).
const MERKLE_CREATED_V21 = "0xb19be3f669df1f0238815b36efeeda9af7b6921ac4a36ae4e9bea6f03aa52754" as Hex;
const CREATED_V1         = "0x13c091a474cc422eb5bbc53fbf66ccd93e043d23b03db1bad730ea303fa32276" as Hex;

// 9_999 fits dRPC's free-tier 10k-block eth_getLogs cap (see uncx-vm walker).
const CHUNK_SIZE    = 9_999n;
const CHUNK_BATCH   = 3;
// Recent-window depth. New-vester deployments are RARE (dozens per year per
// chain), so the window only needs to comfortably out-pace the daily cron
// cadence; the DB registry provides the long-term memory. 300k blocks covers
// ≥2.6 days on the fastest chain we index (BSC sub-second blocks).
const RECENT_WINDOW = 300_000n;
const MULTICALL_BATCH = 150; // stay under free-RPC ~100KB response caps

const VESTER_ABI = [
  { name: "token", type: "function" as const, inputs: [], outputs: [{ type: "address" }], stateMutability: "view" as const },
] as const;
const ERC20_ABI = [
  { name: "balanceOf", type: "function" as const, inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" as const },
  { name: "symbol",    type: "function" as const, inputs: [], outputs: [{ type: "string" }],  stateMutability: "view" as const },
  { name: "decimals",  type: "function" as const, inputs: [], outputs: [{ type: "uint8" }],   stateMutability: "view" as const },
] as const;

// Same transient-error retry as the sibling walkers (see pinksale.ts).
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const transient = msg.includes("temporary internal error") || msg.includes("too many request")
        || msg.includes("rate limit") || msg.includes("503") || msg.includes("502");
      if (!transient || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

function empty(chainId: SupportedChainId, started: number, error: string | null = null): WalkerResult {
  return { protocol: "magna", chainId, tokens: [], streamCount: 0, error, elapsedMs: Date.now() - started };
}

// ─── Registry (DB) helpers — graceful on failure ─────────────────────────────

async function readRegistry(chainId: number): Promise<string[]> {
  try {
    const rows = await db.select({ address: magnaVesters.address })
      .from(magnaVesters)
      .where(sql`${magnaVesters.chainId} = ${chainId}`);
    return rows.map((r) => r.address);
  } catch (err) {
    console.warn(`[magna/${chainId}] registry read failed (continuing with seed only):`, err);
    return [];
  }
}

function writeRegistry(chainId: number, found: { address: string; version: string; block: number }[]): void {
  if (found.length === 0) return;
  // Fire-and-forget from the walker's perspective, but awaited by callers via
  // the returned promise chain being intentionally dropped — a failed write
  // just means re-discovery next run.
  db.insert(magnaVesters)
    .values(found.map((f) => ({
      chainId, address: f.address, factoryVersion: f.version, discoveredBlock: f.block,
    })))
    .onConflictDoNothing()
    .catch((err) => console.warn(`[magna/${chainId}] registry write failed:`, err));
}

// ─── Walker ──────────────────────────────────────────────────────────────────

export async function walkMagna(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  const factories = FACTORIES[chainId];
  if (!factories) return empty(chainId, started); // not deployed on this chain

  // forLogs: the recent-window scan does eth_getLogs — skip pruning providers.
  const client = makeFallbackClient(chainId, { batch: true, forLogs: true });
  if (!client) return empty(chainId, started, "no RPC pool configured");

  const errors: string[] = [];

  // ── Discovery: seed ∪ DB registry ∪ recent-window scan ─────────────────────
  const seeded = (MAGNA_SEED_VESTERS[chainId as number] ?? []).map((a) => a.toLowerCase());
  const vesters = new Set<string>(seeded);
  const known = await readRegistry(chainId as number);
  for (const a of known) vesters.add(a.toLowerCase());

  // Persist the static seed into the registry on first run, so downstream
  // consumers (the Phase 2 claim indexer) can rely on the DB alone rather than
  // re-importing the seed file. onConflictDoNothing makes this a no-op after.
  if (seeded.length > known.length) {
    writeRegistry(chainId as number, seeded.map((a) => ({ address: a, version: "seed", block: 0 })));
  }

  try {
    const latest = await withRetry(() => client.getBlockNumber());
    const fromBlock = latest > RECENT_WINDOW ? latest - RECENT_WINDOW : 0n;
    const chunks: { from: bigint; to: bigint }[] = [];
    for (let from = fromBlock; from <= latest; from += CHUNK_SIZE + 1n) {
      chunks.push({ from, to: from + CHUNK_SIZE > latest ? latest : from + CHUNK_SIZE });
    }
    const fresh: { address: string; version: string; block: number }[] = [];
    for (const f of factories) {
      for (let i = 0; i < chunks.length; i += CHUNK_BATCH) {
        const batch = chunks.slice(i, i + CHUNK_BATCH);
        const results = await Promise.allSettled(
          batch.map(({ from, to }) => withRetry(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (client.getLogs as any)({ address: f.address, fromBlock: from, toBlock: to }))),
        );
        if (i + CHUNK_BATCH < chunks.length) await new Promise((r) => setTimeout(r, 350));
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (r.status !== "fulfilled") {
            errors.push(`scan ${f.version} ${batch[j].from}-${batch[j].to}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
            continue;
          }
          for (const log of r.value as { topics: readonly (Hex | null)[]; data: Hex; blockNumber: bigint }[]) {
            let addr: string | null = null;
            if (log.topics[0] === MERKLE_CREATED_V21 && log.topics[2]) {
              addr = "0x" + (log.topics[2] as string).slice(26);
            } else if (log.topics[0] === CREATED_V1 && log.data && log.data.length >= 66) {
              addr = "0x" + log.data.slice(26, 66);
            }
            if (addr) {
              addr = addr.toLowerCase();
              if (!vesters.has(addr)) {
                vesters.add(addr);
                fresh.push({ address: addr, version: f.version, block: Number(log.blockNumber ?? 0n) });
              }
            }
          }
        }
      }
    }
    writeRegistry(chainId as number, fresh);
  } catch (err) {
    // Discovery-scan failure isn't fatal — the seed + registry still walk.
    errors.push(`recent-scan: ${err instanceof Error ? err.message : String(err)}`);
  }

  const vesterList = Array.from(vesters) as `0x${string}`[];
  if (vesterList.length === 0) {
    return empty(chainId, started, errors.length ? errors.join("; ").slice(0, 500) : null);
  }

  // ── token() per vester ─────────────────────────────────────────────────────
  const vesterToken = new Map<string, string>(); // vester -> token (lowercase)
  for (let i = 0; i < vesterList.length; i += MULTICALL_BATCH) {
    const slice = vesterList.slice(i, i + MULTICALL_BATCH);
    try {
      const results = await withRetry(() => client.multicall({
        contracts: slice.map((v) => ({ address: v, abi: VESTER_ABI, functionName: "token" as const })),
        allowFailure: true,
      }));
      for (let j = 0; j < slice.length; j++) {
        const r = results[j];
        if (r.status === "success") vesterToken.set(slice[j], String(r.result).toLowerCase());
      }
    } catch (err) {
      errors.push(`token() batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── balanceOf(vester) escrow reads ─────────────────────────────────────────
  const pairs = Array.from(vesterToken.entries()); // [vester, token]
  const escrow: { token: string; balance: bigint }[] = [];
  for (let i = 0; i < pairs.length; i += MULTICALL_BATCH) {
    const slice = pairs.slice(i, i + MULTICALL_BATCH);
    try {
      const results = await withRetry(() => client.multicall({
        contracts: slice.map(([vester, token]) => ({
          address: token as `0x${string}`, abi: ERC20_ABI,
          functionName: "balanceOf" as const, args: [vester as `0x${string}`],
        })),
        allowFailure: true,
      }));
      for (let j = 0; j < slice.length; j++) {
        const r = results[j];
        if (r.status === "success") escrow.push({ token: slice[j][1], balance: r.result as bigint });
      }
    } catch (err) {
      errors.push(`balanceOf batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Token metadata + aggregate ─────────────────────────────────────────────
  const tokenSet = Array.from(new Set(escrow.filter((e) => e.balance > 0n).map((e) => e.token)));
  const meta = new Map<string, { symbol: string; decimals: number }>();
  for (let i = 0; i < tokenSet.length; i += MULTICALL_BATCH / 2) {
    const slice = tokenSet.slice(i, i + MULTICALL_BATCH / 2);
    try {
      const results = await withRetry(() => client.multicall({
        contracts: slice.flatMap((t) => [
          { address: t as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" as const },
          { address: t as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" as const },
        ]),
        allowFailure: true,
      }));
      for (let j = 0; j < slice.length; j++) {
        const sym = results[j * 2], dec = results[j * 2 + 1];
        meta.set(slice[j], {
          symbol:   sym.status === "success" ? String(sym.result) : "???",
          decimals: dec.status === "success" ? Number(dec.result) : 18,
        });
      }
    } catch { /* metadata is cosmetic — ??? / 18 fallback below */ }
  }

  const byToken = new Map<string, TokenAggregate>();
  let streamCount = 0;
  for (const { token, balance } of escrow) {
    if (balance === 0n) continue; // fully distributed / Direct Transfer — nothing escrowed
    streamCount += 1; // one funded vester = one distribution
    const existing = byToken.get(token);
    if (existing) {
      existing.lockedAmount = (BigInt(existing.lockedAmount) + balance).toString();
      existing.streamCount += 1;
    } else {
      const m = meta.get(token) ?? { symbol: "???", decimals: 18 };
      byToken.set(token, {
        chainId, tokenAddress: token, tokenSymbol: m.symbol,
        tokenDecimals: m.decimals, lockedAmount: balance.toString(), streamCount: 1,
      });
    }
  }

  return {
    protocol:    "magna",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount,
    error:       errors.length ? errors.join("; ").slice(0, 500) : null,
    elapsedMs:   Date.now() - started,
  };
}
