// src/lib/vesting/rpc.ts
// ─────────────────────────────────────────────────────────────────────────────
// Multi-RPC pool with round-robin fall-through. Single source of truth that
// the seeder, the per-protocol walkers, the adapters, and the claim ingestors
// all import — so a fix here propagates everywhere instead of having to chase
// hardcoded URLs across N files (the same drift bug that bit PinkSale's
// contract addresses, addressed in PINKSALE_CONTRACT_ADDRESSES).
//
// ── Strategy ───────────────────────────────────────────────────────────────
// Free-tier RPCs each have their own quotas, response-size caps, and
// occasional outages. ANY single provider is unreliable under load. But
// quotas are PER-PROVIDER — three free providers in rotation give 3× the
// effective throughput, and a fall-through retry pattern survives any one
// of them being down.
//
// `getRpcUrl(chainId)` returns the NEXT URL in rotation each call. Combined
// with the existing 5-attempt retry helpers in seeder.ts and tvl-walker
// pinksale.ts, retries naturally hit different providers — so the typical
// pattern is "first call rate-limited on provider A → retry hits provider
// B → succeeds".
//
// Counter is in-memory; resets each cold lambda start. That's fine: the
// failure mode this guards against is sustained throttling within a single
// run, not cross-request stickiness.
//
// ── Provider notes ─────────────────────────────────────────────────────────
// dRPC (`*.drpc.org`)        — free, no auth, supports historical logs,
//                              paid tier raises rate limits massively.
// publicnode                 — free, no auth. Prunes logs aggressively (BSC
//                              ~17d, Polygon ~10d) — DO NOT use for
//                              event-scan workloads. Safe for eth_call.
// 1RPC                       — free, no auth, modest rate limits.
// Binance/MeowRPC/etc        — chain-native or community RPCs, free.
// Alchemy/Infura/QuickNode   — only via env vars (paid keys).
//
// IMPORTANT: env-var providers (`ALCHEMY_RPC_URL_*`, `BSC_RPC_URL`, etc) are
// FIRST in the pool when set. They typically have the highest rate limits
// (because they're paid) so we want them tried first. Fall-through to the
// free pool only happens if the paid call fails.
//
// EXCLUDE publicnode from EVENT-SCAN workloads (the seeder's eth_getLogs
// path) — see CLAUDE.md landmine note for why. The exclusion is enforced
// here by `excludeForLogs: true` on those entries.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "./types";

interface Provider {
  url: string;
  /** True = skip this provider for eth_getLogs callers (publicnode prunes). */
  excludeForLogs?: boolean;
}

/**
 * Build the per-chain provider list. Env-var providers go FIRST so paid
 * RPCs (when configured) get used before free pool members. Empty/missing
 * env vars get filtered out so the pool only contains live URLs.
 */
function buildPool(envValue: string | undefined, freeFallbacks: Provider[]): Provider[] {
  const out: Provider[] = [];
  if (envValue) out.push({ url: envValue });
  out.push(...freeFallbacks);
  return out;
}

const POOL: Record<SupportedChainId, Provider[]> = {
  [CHAIN_IDS.ETHEREUM]: buildPool(process.env.ALCHEMY_RPC_URL_ETH, [
    { url: "https://eth.drpc.org" },
    { url: "https://ethereum-rpc.publicnode.com",  excludeForLogs: true },
    { url: "https://1rpc.io/eth" },
    { url: "https://eth.llamarpc.com" },
  ]),
  [CHAIN_IDS.BSC]: buildPool(process.env.BSC_RPC_URL, [
    { url: "https://bsc.drpc.org" },
    { url: "https://bsc-rpc.publicnode.com",       excludeForLogs: true },
    { url: "https://1rpc.io/bnb" },
    // Binance's official public RPC — historically unrestricted.
    { url: "https://bsc-dataseed.binance.org" },
    { url: "https://bsc-dataseed1.defibit.io" },
    { url: "https://bsc-dataseed1.ninicoin.io" },
  ]),
  [CHAIN_IDS.POLYGON]: buildPool(process.env.POLYGON_RPC_URL, [
    { url: "https://polygon.drpc.org" },
    { url: "https://polygon-rpc.publicnode.com",   excludeForLogs: true },
    { url: "https://1rpc.io/matic" },
    { url: "https://polygon-bor-rpc.publicnode.com", excludeForLogs: true },
    { url: "https://polygon-rpc.com" },
  ]),
  [CHAIN_IDS.BASE]: buildPool(process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL, [
    { url: "https://base.drpc.org" },
    { url: "https://base-rpc.publicnode.com",      excludeForLogs: true },
    { url: "https://1rpc.io/base" },
    { url: "https://base.meowrpc.com" },
    { url: "https://mainnet.base.org" },
  ]),
  // Arbitrum One. Free pool drawn from the same provider universe as our
  // other EVM chains. publicnode is `excludeForLogs: true` because they
  // historically prune logs aggressively (matches BSC/Polygon/Base
  // behaviour — see header comment). Arbitrum's own public RPC
  // (arb1.arbitrum.io/rpc) and Arbitrum-native dRPC/1RPC are the
  // log-safe fallbacks.
  [CHAIN_IDS.ARBITRUM]: buildPool(process.env.ARBITRUM_RPC_URL, [
    { url: "https://arbitrum.drpc.org" },
    { url: "https://arbitrum-one-rpc.publicnode.com", excludeForLogs: true },
    { url: "https://1rpc.io/arb" },
    { url: "https://arb1.arbitrum.io/rpc" },
  ]),
  // OP Mainnet (Optimism). Same provider universe as Arbitrum: dRPC + 1RPC
  // free tiers, publicnode (logs-pruned), Optimism's own public RPC as
  // the log-safe fallback.
  [CHAIN_IDS.OPTIMISM]: buildPool(process.env.OPTIMISM_RPC_URL, [
    { url: "https://optimism.drpc.org" },
    { url: "https://optimism-rpc.publicnode.com", excludeForLogs: true },
    { url: "https://1rpc.io/op" },
    { url: "https://mainnet.optimism.io" },
  ]),
  [CHAIN_IDS.SEPOLIA]: buildPool(process.env.SEPOLIA_RPC_URL, [
    { url: "https://ethereum-sepolia-rpc.publicnode.com" },
    { url: "https://1rpc.io/sepolia" },
  ]),
  [CHAIN_IDS.BASE_SEPOLIA]: buildPool(process.env.BASE_SEPOLIA_RPC_URL, [
    { url: "https://base-sepolia-rpc.publicnode.com" },
    { url: "https://sepolia.base.org" },
  ]),
  [CHAIN_IDS.SOLANA]: buildPool(process.env.SOLANA_RPC_URL, [
    // Most free Solana RPCs disable getProgramAccounts (the workhorse for
    // our Solana adapters). SOLANA_RPC_URL is expected to be set to a
    // Helius / dRPC / Alchemy URL that supports it. We DON'T add free
    // fallbacks here because they'd just fail silently — better to error
    // loudly if the env var is missing.
  ]),
};

// Per-chain round-robin counter. Module-level so it persists for the
// lifetime of a single lambda invocation (which is exactly the scope we
// want — round-robin within one seed run, but no cross-request memory).
const counters = new Map<SupportedChainId, number>();

/**
 * Returns the next RPC URL in rotation for the given chain.
 *
 * Each call advances the counter. When combined with retry-on-error
 * patterns (e.g. seeder.ts withRetry), retries naturally hit different
 * providers — that's the whole point.
 *
 * @param chainId target chain
 * @param opts.forLogs - if true, skips providers marked excludeForLogs
 *                       (publicnode et al that prune historical logs)
 */
export function getRpcUrl(
  chainId: SupportedChainId,
  opts: { forLogs?: boolean } = {},
): string | undefined {
  const allProviders = POOL[chainId];
  if (!allProviders || allProviders.length === 0) return undefined;

  const providers = opts.forLogs
    ? allProviders.filter((p) => !p.excludeForLogs)
    : allProviders;
  if (providers.length === 0) return undefined;

  const idx = (counters.get(chainId) ?? 0) % providers.length;
  counters.set(chainId, idx + 1);
  return providers[idx].url;
}

/**
 * Returns ALL RPC URLs for a chain (in rotation order). Useful when a
 * caller wants to hit each provider explicitly rather than through retry-
 * driven rotation. We don't use this in the seeder/walker today, but it's
 * here for the cases where it's the cleaner pattern (e.g. health-check
 * pings across all providers).
 */
export function getAllRpcUrls(
  chainId: SupportedChainId,
  opts: { forLogs?: boolean } = {},
): string[] {
  const allProviders = POOL[chainId];
  if (!allProviders) return [];
  const filtered = opts.forLogs
    ? allProviders.filter((p) => !p.excludeForLogs)
    : allProviders;
  return filtered.map((p) => p.url);
}

/**
 * Pool depth — how many providers are configured for this chain. Helpful
 * for tuning retry counts: if pool has 5 providers, 5 retries guarantees
 * at least one attempt against each.
 */
export function getRpcPoolSize(chainId: SupportedChainId, opts: { forLogs?: boolean } = {}): number {
  return getAllRpcUrls(chainId, opts).length;
}

/**
 * Bounded-concurrency map. Like Promise.all but caps the number of
 * in-flight tasks at `concurrency`. Critical for RPC-heavy workloads
 * against free-tier providers where a 50-wallet batch fired in parallel
 * triggers immediate 429 storms.
 *
 * Use this in place of `await Promise.all(items.map(...))` whenever each
 * item makes an RPC call. Sensible defaults:
 *   - Helius free Solana   → concurrency 4-6
 *   - dRPC free EVM        → concurrency 8-10
 *   - Paid providers       → concurrency 20-50 (set via env-var-tuned wrappers)
 *
 * Optionally adds `interBatchDelayMs` of sleep between completed batches.
 * Useful when even bounded concurrency overruns the provider — pace-limit
 * burst rate as well.
 */
export async function mapBounded<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<U>,
  interBatchDelayMs: number = 0,
): Promise<PromiseSettledResult<U>[]> {
  if (items.length === 0) return [];
  const out: PromiseSettledResult<U>[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const result = await fn(items[i], i);
        out[i] = { status: "fulfilled", value: result };
      } catch (err) {
        out[i] = { status: "rejected", reason: err };
      }
      if (interBatchDelayMs > 0 && i + concurrency < items.length) {
        await new Promise((r) => setTimeout(r, interBatchDelayMs));
      }
    }
  }

  // Spin up `concurrency` workers, each draining the work queue.
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
