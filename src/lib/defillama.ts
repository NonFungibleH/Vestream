// src/lib/defillama.ts
// ─────────────────────────────────────────────────────────────────────────────
// DefiLlama protocol TVL fetcher.
//
// Used for protocols where we don't operate our own indexer (currently
// Streamflow, Sablier, Hedgey, UNCX, Team Finance, Superfluid, PinkSale —
// almost every major protocol has a DefiLlama entry that's more accurate
// than our sampled on-chain index).
//
// Endpoint choice matters — /protocol/{slug} returns 5-50MB of HISTORICAL
// TVL per protocol which pummeled the /protocols page (7 × slow calls =
// ~1 minute cold start + exceeded Next's 2MB fetch-cache ceiling). The
// /protocols endpoint returns ALL protocols with current TVL in a single
// ~8MB response that we fetch once, parse once, and serve every slug
// lookup from the parsed map.
//
// Cache strategy:
//   - One in-process Map keyed by slug, populated from a single /protocols
//     fetch.
//   - TTL 5 min. DefiLlama's own data refreshes ~hourly; 5min is a good
//     compromise between freshness and fetch cost.
//   - Fetch is shared by all concurrent callers via an in-flight promise
//     so a burst of 8 getProtocolsTvl calls still trigger a single HTTP.
//   - `next.revalidate: 300` on the fetch so Vercel's shared data cache
//     can serve repeat requests across serverless instances (response
//     exceeds 2MB so Next logs a warning but doesn't break).
//
// Response shape from https://api.llama.fi/protocols:
//   [ { slug, name, tvl, chainTvls: { vesting?, ethereum?, ... }, ... }, ... ]
//
// We prefer chainTvls.vesting if present (correct for protocols that also
// run Payments or other products e.g. Streamflow, Sablier). Otherwise fall
// back to the top-level tvl field (correct for single-product protocols
// like PinkSale, Team Finance).
// ─────────────────────────────────────────────────────────────────────────────

interface DefiLlamaProtocolEntry {
  slug:      string;
  name:      string;
  tvl:       number | null;
  chainTvls: Record<string, number>;
  chains:    string[];
}

export interface DefiLlamaTvlSnapshot {
  totalUsd:  number;
  perChain:  Array<{ chain: string; usd: number }>;
  fetchedAt: string;
}

// Per-process cache of the parsed /protocols response, keyed by slug.
interface AllProtocolsCache {
  bySlug:    Map<string, DefiLlamaTvlSnapshot>;
  expiresAt: number;
}

let cache: AllProtocolsCache | null = null;
let inFlight: Promise<AllProtocolsCache> | null = null;

const TTL_MS  = 5 * 60 * 1000;
const API_URL = "https://api.llama.fi/protocols";

async function loadAllProtocols(): Promise<AllProtocolsCache> {
  // Concurrent callers share one fetch.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(API_URL, {
        next:    { revalidate: 300 },
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        console.error(`[defillama] /protocols HTTP ${res.status}`);
        return cache ?? { bySlug: new Map(), expiresAt: Date.now() + 60_000 };
      }

      const data = (await res.json()) as DefiLlamaProtocolEntry[];
      const bySlug = new Map<string, DefiLlamaTvlSnapshot>();
      const fetchedAt = new Date().toISOString();

      for (const p of data) {
        if (!p.slug) continue;
        const chainTvls = p.chainTvls ?? {};

        // Prefer vesting-category breakdown when present. For protocols
        // that ship multiple products (Streamflow vesting + payments,
        // Sablier lockup + linear, Hedgey plans), the vesting-category
        // total is what we actually want on the /protocols page.
        const vestingAggregate = chainTvls["vesting"];
        const hasVestingBreakdown = typeof vestingAggregate === "number" && vestingAggregate > 0;

        let totalUsd: number;
        let perChain: Array<{ chain: string; usd: number }>;

        if (hasVestingBreakdown) {
          totalUsd = vestingAggregate;
          const suffix = "-vesting";
          perChain = Object.entries(chainTvls)
            .filter(([k, v]) => k.endsWith(suffix) && v > 0)
            .map(([k, usd]) => ({ chain: k.slice(0, k.length - suffix.length), usd }))
            .sort((a, b) => b.usd - a.usd);
        } else {
          totalUsd = p.tvl ?? 0;
          perChain = Object.entries(chainTvls)
            .filter(([k, v]) => !k.includes("-") && k !== "vesting" && v > 0)
            .map(([chain, usd]) => ({ chain, usd }))
            .sort((a, b) => b.usd - a.usd);
        }

        if (totalUsd > 0) {
          bySlug.set(p.slug, { totalUsd, perChain, fetchedAt });
        }
      }

      const next: AllProtocolsCache = { bySlug, expiresAt: Date.now() + TTL_MS };
      cache = next;
      return next;
    } catch (err) {
      console.error("[defillama] /protocols fetch failed:", err);
      return cache ?? { bySlug: new Map(), expiresAt: Date.now() + 60_000 };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Fetch TVL for a protocol from DefiLlama.
 *
 * @param slug      DefiLlama protocol slug. Accepts either a single string
 *                  or an array — arrays are summed. Array form is used when
 *                  DefiLlama splits one protocol into multiple entries
 *                  (e.g. UNCX = `uncx-network-v2` + `uncx-network-v3`).
 * @param category  Accepted for API compatibility but currently ignored;
 *                  the /protocols endpoint already surfaces a
 *                  `chainTvls.vesting` aggregate which we prefer when
 *                  present. Left in the signature so call sites on
 *                  protocol-constants.ts don't need to change.
 */
export async function fetchDefiLlamaTvl(
  slug:     string | readonly string[],
  _category?: string,
): Promise<DefiLlamaTvlSnapshot | null> {
  void _category;

  const now = Date.now();
  const source = cache && cache.expiresAt > now
    ? cache
    : await loadAllProtocols();

  // Single-slug path — unchanged behaviour for every call site except UNCX.
  if (typeof slug === "string") {
    return source.bySlug.get(slug) ?? null;
  }

  // Multi-slug path — sum totals, merge per-chain rows.
  let totalUsd = 0;
  const perChainMap = new Map<string, number>();
  let fetchedAt = new Date().toISOString();
  let any = false;

  for (const s of slug) {
    const snap = source.bySlug.get(s);
    if (!snap) continue;
    any = true;
    totalUsd += snap.totalUsd;
    fetchedAt = snap.fetchedAt; // Any entry's timestamp is fine — same fetch
    for (const row of snap.perChain) {
      perChainMap.set(row.chain, (perChainMap.get(row.chain) ?? 0) + row.usd);
    }
  }

  if (!any) return null;
  return {
    totalUsd,
    perChain:  Array.from(perChainMap.entries())
                 .map(([chain, usd]) => ({ chain, usd }))
                 .sort((a, b) => b.usd - a.usd),
    fetchedAt,
  };
}
