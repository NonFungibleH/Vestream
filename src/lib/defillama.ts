// src/lib/defillama.ts
// ─────────────────────────────────────────────────────────────────────────────
// DefiLlama protocol TVL fetcher.
//
// Used for protocols where we don't operate our own indexer (currently just
// Streamflow — Solana has no seeder in v1 so local cache-based TVL would
// read as $0 at launch). DefiLlama has tracked Streamflow for years and
// returns a full cross-chain breakdown with a live total.
//
// Response shape (from https://api.llama.fi/protocol/{slug}):
//   {
//     name, category, chain, chains: [...],
//     tvl: [{ date, totalLiquidityUSD }, ...],   // time-series (payments only)
//     currentChainTvls: {
//       Solana: 516088.80,                       // current (e.g. "Payments" TVL)
//       Solana-vesting: 751961730.44,            // current vesting TVL
//       vesting: 767653655.78,                   // aggregate across chains
//       ...
//     }
//   }
//
// For Streamflow we want the vesting-category totals, not "Payments" —
// hence the optional `category` filter on fetchDefiLlamaTvl.
//
// Cached in-process for 5 minutes; DefiLlama's own data refreshes on a
// similar cadence so caching longer buys nothing.
// ─────────────────────────────────────────────────────────────────────────────

interface DefiLlamaProtocolResponse {
  name:             string;
  currentChainTvls: Record<string, number>;
}

export interface DefiLlamaTvlSnapshot {
  totalUsd:   number;
  perChain:   Array<{ chain: string; usd: number }>;
  fetchedAt:  string;
}

interface CacheEntry {
  value:     DefiLlamaTvlSnapshot | null;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Fetch TVL for a protocol from DefiLlama.
 *
 * @param slug      DefiLlama protocol slug (lowercase — matches the URL on defillama.com)
 * @param category  Optional filter — "vesting", "payments", etc.
 *                  When set, we read the aggregate `{category}` key and the
 *                  per-chain `{Chain}-{category}` keys. When unset, we use
 *                  the raw per-chain keys (summed). Streamflow wants
 *                  `category: "vesting"` to get $752M rather than the $516k
 *                  Payments TVL.
 */
export async function fetchDefiLlamaTvl(
  slug:      string,
  category?: string,
): Promise<DefiLlamaTvlSnapshot | null> {
  const cacheKey = `${slug}:${category ?? "all"}`;
  const hit = CACHE.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const res = await fetch(`https://api.llama.fi/protocol/${slug}`, {
      next:    { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[defillama] HTTP ${res.status} for protocol/${slug}`);
      CACHE.set(cacheKey, { value: null, expiresAt: Date.now() + 60_000 });
      return null;
    }
    const data = (await res.json()) as DefiLlamaProtocolResponse;
    const chainTvls = data.currentChainTvls ?? {};

    let totalUsd: number;
    let perChain: Array<{ chain: string; usd: number }>;

    if (category) {
      const suffix = `-${category}`;
      totalUsd = chainTvls[category] ?? 0;
      perChain = Object.entries(chainTvls)
        .filter(([k, v]) => k.endsWith(suffix) && v > 0)
        .map(([k, usd]) => ({ chain: k.slice(0, k.length - suffix.length), usd }))
        .sort((a, b) => b.usd - a.usd);
      // If no explicit aggregate key, sum the per-chain slices
      if (totalUsd === 0 && perChain.length > 0) {
        totalUsd = perChain.reduce((s, r) => s + r.usd, 0);
      }
    } else {
      perChain = Object.entries(chainTvls)
        .filter(([k, v]) => !k.includes("-") && v > 0)
        .map(([chain, usd]) => ({ chain, usd }))
        .sort((a, b) => b.usd - a.usd);
      totalUsd = perChain.reduce((s, r) => s + r.usd, 0);
    }

    const snapshot: DefiLlamaTvlSnapshot = {
      totalUsd,
      perChain,
      fetchedAt: new Date().toISOString(),
    };
    CACHE.set(cacheKey, { value: snapshot, expiresAt: Date.now() + TTL_MS });
    return snapshot;
  } catch (err) {
    console.error(`[defillama] fetch failed for ${slug}:`, err);
    CACHE.set(cacheKey, { value: null, expiresAt: Date.now() + 60_000 });
    return null;
  }
}
