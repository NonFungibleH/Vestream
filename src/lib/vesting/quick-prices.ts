// src/lib/vesting/quick-prices.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight per-token USD pricing for UI surfaces that show <50 unlocks.
//
// Distinct from the cron-driven snapshot pipeline in `tvl.ts` (which prices
// thousands of tokens for the daily TVL refresh). This helper takes a small
// list of (chainId, address) pairs and returns USD prices via DexScreener's
// batch endpoint, with edge-cache friendly fetch options so repeat hits in
// the same minute don't actually round-trip.
//
// Used to attach `usdValue` to:
//   - Protocol detail page Latest / Next / Upcoming queue cards
//   - The cross-protocol /api/unlocks/upcoming response (homepage widget)
//
// Confidence rules MATCH the snapshot pipeline (high ≥ $10k DEX liquidity,
// medium ≥ $1k, thin < $1k excluded). Same source-of-truth so the USD shown
// on the unlock card and the headline TVL on /protocols never disagree.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchWithRetry } from "../fetch-with-retry";

// Mirror of the chain-slug map in tvl.ts. Kept local so callers don't need
// the (heavier) tvl.ts import path.
const DS_CHAIN_SLUG: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  137:  "polygon",
  8453: "base",
  // Solana — DexScreener uses the chain slug "solana"; chainId 101 is our
  // synthetic ID for the SVM ecosystem.
  101:  "solana",
};

const LIQUIDITY_HIGH      = 10_000;
const LIQUIDITY_MEDIUM    = 1_000;
const LIQUIDITY_FLOOR_USD = 1_000;

const DS_BATCH_SIZE = 30;

interface DexPair {
  chainId:    string;
  baseToken:  { address: string; symbol: string };
  priceUsd?:  string;
  volume?:    { h24?: number };
  liquidity?: { usd?: number };
}

export interface QuickPrice {
  priceUsd:    number;
  /** "high" if liquidity ≥ $10k, "medium" if ≥ $1k. Below $1k filtered out. */
  confidence:  "high" | "medium";
}

/**
 * Map key shape: `${chainId}:${addressLower}` — same convention as tvl.ts so
 * caller's lookup loop stays consistent across surfaces.
 */
export type QuickPriceMap = Map<string, QuickPrice>;

const priceKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

/**
 * Quick-batch price for ≤ 30 (chainId, address) pairs. Pairs on chains we
 * don't have a DexScreener slug for are silently skipped. Tokens with
 * insufficient liquidity (<$1k) are excluded — the caller treats their
 * absence from the returned map as "unknown price".
 */
export async function getQuickUsdPrices(
  pairs: ReadonlyArray<{ chainId: number; address: string }>,
): Promise<QuickPriceMap> {
  const out: QuickPriceMap = new Map();
  if (pairs.length === 0) return out;

  // De-dup by (chainId, lower address). The DexScreener endpoint takes a
  // comma-separated address list and returns matched pairs across ALL
  // chains, so chain-grouping is purely a slot-management concern.
  const seen = new Set<string>();
  const uniquePairs: Array<{ chainId: number; address: string }> = [];
  for (const p of pairs) {
    if (!DS_CHAIN_SLUG[p.chainId]) continue;
    const k = priceKey(p.chainId, p.address);
    if (seen.has(k)) continue;
    seen.add(k);
    uniquePairs.push({ chainId: p.chainId, address: p.address.toLowerCase() });
  }
  if (uniquePairs.length === 0) return out;

  const addresses = uniquePairs.map((p) => p.address);
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += DS_BATCH_SIZE) {
    batches.push(addresses.slice(i, i + DS_BATCH_SIZE));
  }

  // Group by chain we want to keep — DexScreener returns pairs from any
  // chain that mentions one of these addresses (cross-chain bridged
  // tokens). We pin pairs back to the requested chain via the response's
  // chain slug so a USDC-on-Ethereum hit doesn't get mis-applied to a
  // USDC-on-Base unlock card.
  const wantedSlugs = new Set(uniquePairs.map((p) => DS_CHAIN_SLUG[p.chainId]));

  for (const batch of batches) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`;
      const res = await fetchWithRetry(url, {
        next:    { revalidate: 60 },
        headers: { Accept: "application/json" },
      }, { tag: "dexscreener-quick", retries: 1 });
      if (!res || !res.ok) continue;
      const data = (await res.json()) as { pairs?: DexPair[] };

      // Pick the highest-volume pair per (chain-slug, address) that passes
      // the liquidity floor. Mirrors DexScreener's primary-pair ranking.
      const best = new Map<string, DexPair>();
      for (const pair of data.pairs ?? []) {
        if (!wantedSlugs.has(pair.chainId)) continue;
        const liqUsd = pair.liquidity?.usd ?? 0;
        if (liqUsd < LIQUIDITY_FLOOR_USD) continue;
        const price = parseFloat(pair.priceUsd ?? "0");
        if (!Number.isFinite(price) || price <= 0) continue;

        const k = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
        const ex = best.get(k);
        if (!ex || (pair.volume?.h24 ?? 0) > (ex.volume?.h24 ?? 0)) {
          best.set(k, pair);
        }
      }

      // Project chain-slug-keyed pairs back to chainId-keyed entries so the
      // caller can look up by their numeric chainId.
      for (const [, pair] of best) {
        const liqUsd = pair.liquidity?.usd ?? 0;
        const conf: "high" | "medium" = liqUsd >= LIQUIDITY_HIGH ? "high"
                                       : liqUsd >= LIQUIDITY_MEDIUM ? "medium"
                                       : "medium"; // unreachable due to floor
        const matchedPair = uniquePairs.find(
          (p) => DS_CHAIN_SLUG[p.chainId] === pair.chainId
              && p.address === pair.baseToken.address.toLowerCase(),
        );
        if (!matchedPair) continue;
        out.set(priceKey(matchedPair.chainId, matchedPair.address), {
          priceUsd:   parseFloat(pair.priceUsd!),
          confidence: conf,
        });
      }
    } catch (err) {
      console.warn("[quick-prices] batch failed:", err);
    }
  }

  return out;
}

/**
 * Convenience: given a stringified bigint amount, decimals, and a price entry,
 * produce a USD value. Returns null when any input is missing so the caller
 * can render "—" cleanly. Bounded against unsafe integer overflow by going
 * through a Number division at scaled precision.
 */
export function toUsdValue(
  amountRaw: string | null | undefined,
  decimals:  number,
  price:     QuickPrice | undefined,
): number | null {
  if (!amountRaw || !price) return null;
  try {
    const safeDecimals = Math.min(Math.max(decimals, 0), 36);
    const amt = BigInt(amountRaw);
    // Scale through a 6-dp intermediate to keep precision for stablecoins
    // without overflowing on huge supplies.
    const scale6 = 10n ** 6n;
    const denom  = 10n ** BigInt(safeDecimals);
    if (denom === 0n) return null;
    const scaled = (amt * scale6) / denom;
    const tokens = Number(scaled) / 1_000_000;
    if (!Number.isFinite(tokens) || tokens <= 0) return null;
    const usd = tokens * price.priceUsd;
    return Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}

/**
 * Friendly USD formatter. Compact for ≥ $1k, two-decimal for ≥ $1, four-
 * decimal for sub-dollar (relevant for stablecoin dust + memecoin trickle).
 */
export function formatUsdCompact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  if (usd >= 1)   return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
