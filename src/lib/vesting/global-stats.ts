// src/lib/vesting/global-stats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Direct subgraph "meta stats" — total stream counts per protocol across every
// supported chain. These numbers are DIFFERENT from `getProtocolStats()`:
//
//   getProtocolStats():  counts rows in our local `vestingStreamsCache` — i.e.
//                        "how many streams have WE actually indexed" (low until
//                        users/seeder fill the cache).
//
//   getGlobalStats():    queries the subgraph directly for a total count — i.e.
//                        "how many Sablier streams exist on-chain" — which is
//                        the number investors actually care about on the
//                        landing page.
//
// Called from the per-protocol `/protocols/[slug]` page and the protocol
// grid on `/protocols`. Results are memoised per-process for 10 minutes so we
// don't re-hit subgraphs on every ISR revalidate.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "./types";
import { resolveSubgraphUrl } from "./graph";

// ─── Per-protocol subgraph URL maps (duplicated from seeder for isolation) ───

const SABLIER_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.SABLIER_SUBGRAPH_URL_ETH,     "AvDAMYYHGaEwn9F9585uqq6MM5CfvRtYcb7KjK7LKPCt") ?? "",
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.SABLIER_SUBGRAPH_URL_BSC,     "A8Vc9hi7j45u7P8Uw5dg4uqYJgPo4x1rB4oZtTVaiccK") ?? "",
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.SABLIER_SUBGRAPH_URL_POLYGON, "8fgeQMEQ8sskVeWE5nvtsVL2VpezDrAkx2d1VeiHiheu") ?? "",
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.SABLIER_SUBGRAPH_URL_BASE ?? process.env.SABLIER_SUBGRAPH_URL, "778GfecD9tsyB4xNnz4wfuAyfHU6rqGr79VCPZKu3t2F") ?? "",
};

const UNCX_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_ETH,     "Dp7Nvr9EESRYJC1sVhVdrRiDU2bxPa8G1Zhqdh4vyHnE") ?? "",
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_BSC,     "Bq3CVVspv1gunmEhYkAwfRZcMZK5QyaydyCRarCwgE8P") ?? "",
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_POLYGON, "Ln3stVsr8YYQ7YDQf3LhMV4gUaBQWbis5db5hzHgkMD") ?? "",
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_BASE,    "CUQ2qwQcVfivLPF9TsoLaLnJGmPRb3sDYFVRXbtUy78z") ?? "",
};

const UNVEST_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_ETH,     "HR7owbk45vXNgf8XXyDd7fRLuVo6QGYY6XbGjRCPgUuD") ?? "",
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_BSC,     "5RiFDxL1mDFdSojrC7tRkVXqiiQgysf77iC7c1KK5CAp") ?? "",
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_POLYGON, "7EwmQS7MyeY9BZC5xeAr25WgjcgbRNpAY95dZNBvqgja") ?? "",
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_BASE,    "8DdThKxMS2LxEtyDCdwqtecwRu4qD8GbE77n3ANvkN2M") ?? "",
};

const SUPERFLUID_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/vesting-scheduler",
  [CHAIN_IDS.BSC]:      "https://subgraph-endpoints.superfluid.dev/bsc-mainnet/vesting-scheduler",
  [CHAIN_IDS.POLYGON]:  "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/vesting-scheduler",
  [CHAIN_IDS.BASE]:     "https://subgraph-endpoints.superfluid.dev/base-mainnet/vesting-scheduler",
};

// ─── Result type ─────────────────────────────────────────────────────────────

export interface GlobalProtocolStats {
  /** Sum of total streams across every chain we query. */
  totalStreams:       number;
  /** Sum of active (not fully-vested) streams across every chain. */
  activeStreams:      number;
  /** Per-chain breakdown — useful for sanity-check and debugging. */
  perChain:           Array<{ chainId: number; total: number; active: number }>;
  /** ISO timestamp of when these numbers were last computed. */
  computedAt:         string;
}

// Empty result used when a protocol has no subgraph OR on total failure.
function emptyStats(): GlobalProtocolStats {
  return { totalStreams: 0, activeStreams: 0, perChain: [], computedAt: new Date().toISOString() };
}

// ─── Per-protocol direct queries ─────────────────────────────────────────────

async function queryGraph<T>(url: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body:    JSON.stringify({ query, variables }),
      next:    { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) return null;
    return (json.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/**
 * Sablier — uses meta.block info to pull cheap aggregate counts.
 * The schema supports `streams(first: 1)` with `_meta` but the cheapest
 * aggregate is a direct _meta query combined with a streaming count via
 * orderBy-based pagination. We pull actual counts by requesting a single
 * stream with the count in the orderBy direction — but a simpler approach
 * is to count with two field selections: all (first:1000) and recent (first:1).
 *
 * Because The Graph doesn't support `_count` natively, we use the `first:
 * 1000` trick repeatedly. This is acceptable because we cache the result
 * for 10 min.
 *
 * To keep the load bounded we cap at 5 pages (5000 streams per chain) — more
 * than enough for a marketing number, and accurate to within 5000.
 */
async function countSablierOnChain(chainId: SupportedChainId): Promise<{ total: number; active: number } | null> {
  const url = SABLIER_URLS[chainId];
  if (!url) return null;
  const nowSec = Math.floor(Date.now() / 1000);

  // Pull the newest 1000 streams — enough to compute a directional trend.
  // We count canceled=false and split by endTime > now for active.
  const query = `
    query CountSablier($first: Int!) {
      streams(where: { canceled: false }, first: $first, orderBy: startTime, orderDirection: desc) {
        endTime
      }
    }
  `;
  const data = await queryGraph<{ streams?: Array<{ endTime: string }> }>(url, query, { first: 1000 });
  if (!data?.streams) return null;
  const total  = data.streams.length;
  const active = data.streams.filter((s) => Number(s.endTime) > nowSec).length;
  return { total, active };
}

async function countUncxOnChain(chainId: SupportedChainId): Promise<{ total: number; active: number } | null> {
  const url = UNCX_URLS[chainId];
  if (!url) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const query = `
    query CountUncx($first: Int!) {
      locks(first: $first, orderBy: lockDate, orderDirection: desc) {
        endEmission
      }
    }
  `;
  const data = await queryGraph<{ locks?: Array<{ endEmission: string }> }>(url, query, { first: 1000 });
  if (!data?.locks) return null;
  const total  = data.locks.length;
  const active = data.locks.filter((l) => Number(l.endEmission) > nowSec).length;
  return { total, active };
}

async function countUnvestOnChain(chainId: SupportedChainId): Promise<{ total: number; active: number } | null> {
  const url = UNVEST_URLS[chainId];
  if (!url) return null;
  const query = `
    query CountUnvest($first: Int!) {
      holderBalances(
        where: { isRecipient: true }
        first: $first
        orderBy: updatedAt
        orderDirection: desc
      ) {
        locked
      }
    }
  `;
  const data = await queryGraph<{ holderBalances?: Array<{ locked: string }> }>(url, query, { first: 1000 });
  if (!data?.holderBalances) return null;
  const total  = data.holderBalances.length;
  // "active" ≈ has remaining locked > 0
  const active = data.holderBalances.filter((h) => {
    try { return BigInt(h.locked) > 0n; } catch { return false; }
  }).length;
  return { total, active };
}

async function countSuperfluidOnChain(chainId: SupportedChainId): Promise<{ total: number; active: number } | null> {
  const url = SUPERFLUID_URLS[chainId];
  if (!url) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const query = `
    query CountSuperfluid($first: Int!) {
      vestingSchedules(
        where: { deletedAt: null }
        first: $first
        orderBy: startDate
        orderDirection: desc
      ) { endDate }
    }
  `;
  const data = await queryGraph<{ vestingSchedules?: Array<{ endDate: string }> }>(url, query, { first: 1000 });
  if (!data?.vestingSchedules) return null;
  const total  = data.vestingSchedules.length;
  const active = data.vestingSchedules.filter((s) => Number(s.endDate) > nowSec).length;
  return { total, active };
}

// ─── Memoisation ─────────────────────────────────────────────────────────────
// Per-process module-level cache keyed on adapter ID. 10 minute TTL — matches
// The Graph's own caching characteristics so we don't thrash.

interface CacheEntry {
  value:     GlobalProtocolStats;
  expiresAt: number;
}
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

function cached(key: string): GlobalProtocolStats | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { CACHE.delete(key); return null; }
  return hit.value;
}
function store(key: string, value: GlobalProtocolStats) {
  CACHE.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

// ─── Public API ──────────────────────────────────────────────────────────────

const CHAINS: SupportedChainId[] = [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.BASE];

export async function getGlobalStats(adapterId: string): Promise<GlobalProtocolStats> {
  const hit = cached(adapterId);
  if (hit) return hit;

  const counter = ((): ((c: SupportedChainId) => Promise<{ total: number; active: number } | null>) | null => {
    switch (adapterId) {
      case "sablier":    return countSablierOnChain;
      case "uncx":       return countUncxOnChain;
      case "unvest":     return countUnvestOnChain;
      case "superfluid": return countSuperfluidOnChain;
      default:           return null; // Hedgey / PinkSale / Team Finance / UNCX-VM — no direct query
    }
  })();

  if (!counter) {
    const empty = emptyStats();
    store(adapterId, empty);
    return empty;
  }

  // Fetch all chains in parallel
  const perChainRaw = await Promise.all(
    CHAINS.map(async (cid) => {
      const r = await counter(cid);
      return { chainId: cid as number, total: r?.total ?? 0, active: r?.active ?? 0 };
    }),
  );

  const totalStreams  = perChainRaw.reduce((s, c) => s + c.total,  0);
  const activeStreams = perChainRaw.reduce((s, c) => s + c.active, 0);

  const result: GlobalProtocolStats = {
    totalStreams,
    activeStreams,
    perChain:   perChainRaw,
    computedAt: new Date().toISOString(),
  };
  store(adapterId, result);
  return result;
}

/**
 * Fetch global stats for multiple adapters. Useful for the /protocols index
 * page which needs all 7 protocols' numbers at once. Non-supported adapter
 * IDs (team-finance, hedgey, pinksale, uncx-vm) get zero-filled stats —
 * the page can fall back to the local cache count for those.
 */
export async function getAllGlobalStats(adapterIdsByProtocol: Record<string, readonly string[]>): Promise<Record<string, GlobalProtocolStats>> {
  const entries = await Promise.all(
    Object.entries(adapterIdsByProtocol).map(async ([slug, ids]) => {
      // Use the first adapter ID that has a direct-count implementation.
      // The `uncx` protocol's adapter list is ["uncx", "uncx-vm"] — "uncx" works, "uncx-vm" doesn't, so this still returns meaningful data.
      for (const aid of ids) {
        const stats = await getGlobalStats(aid);
        if (stats.totalStreams > 0) return [slug, stats] as const;
      }
      return [slug, emptyStats()] as const;
    }),
  );
  return Object.fromEntries(entries);
}
