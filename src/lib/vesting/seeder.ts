// src/lib/vesting/seeder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Populates the `vestingStreamsCache` table with real on-chain vesting data
// from the four subgraph-based adapters — without needing any end-user to
// first search their wallet.
//
// Why: before this seeder, the cache was populated *reactively* (only when a
// visitor searched their wallet). That meant the public /unlocks landing pages
// looked empty ("0 streams indexed") until organic traffic filled the cache.
// With the seeder, we pre-index a representative sample of each protocol on
// each chain — so crawlers + cold-cache visitors always see live, plausible
// numbers.
//
// How: for each subgraph adapter we run a "discovery" query that surfaces
// a batch of recent/notable streams. We extract the unique recipient
// addresses, then feed them into the adapter's existing `fetch(recipients,
// chainId)` method. That produces fully-normalised VestingStream objects, which
// we upsert via `writeToCache`.
//
// Scope: four subgraph adapters × four mainnet chains = 16 (adapter, chain)
// pairs. Hedgey, PinkSale, UNCX-VM, Team Finance all have non-subgraph or
// non-trivial discovery paths and are intentionally deferred here — they'll
// still appear in the cache when real visitors search their wallets.
//
// Run by `/api/cron/seed-cache` on the Vercel cron schedule (every 6 hours).
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "./types";
import { writeToCache } from "./dbcache";
import { ADAPTER_REGISTRY } from "./adapters";
import { resolveSubgraphUrl } from "./graph";

// ─── Per-chain subgraph URLs (mirror the adapter files) ──────────────────────
//
// These are duplicated from the adapters (rather than imported) because each
// adapter's URL map is a private module const, and adding an export just for
// the seeder would bloat the adapter surface area. If an adapter's URL ever
// changes, update both here AND in the adapter file — or extract into a
// shared const in a follow-up. For now, explicit duplication is safer.

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

// ─── Discovery queries ────────────────────────────────────────────────────────
//
// Each query returns the newest `first` streams on that chain. We only need
// the `recipient` field — everything else gets re-fetched normalised by the
// adapter's fetch() method. This keeps the seeder stateless: it doesn't
// attempt to reproduce any adapter's math or schema interpretation.

const SEED_LIMIT = 200;  // recipients per (adapter, chain) per run

async function postGraph<T>(url: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   "Mozilla/5.0 (compatible; Vestream-Seeder/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({ query, variables }),
      // No Next revalidate: seeder wants fresh data every run
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[seeder] HTTP ${res.status} ${url.slice(0, 80)}`);
      return null;
    }
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) {
      console.error(`[seeder] graphql errors:`, JSON.stringify(json.errors).slice(0, 300));
      return null;
    }
    return (json.data ?? null) as T | null;
  } catch (err) {
    console.error(`[seeder] fetch failed:`, err);
    return null;
  }
}

/** Sablier V2.1 uses `recipient: Bytes!`; sort by createdTime desc to get newest streams. */
async function discoverSablierRecipients(chainId: SupportedChainId): Promise<string[]> {
  const url = SABLIER_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedSablier($first: Int!) {
      streams(
        where: { canceled: false }
        orderBy: startTime
        orderDirection: desc
        first: $first
      ) { recipient }
    }
  `;
  const data = await postGraph<{ streams?: Array<{ recipient: string }> }>(url, query, { first: SEED_LIMIT });
  return dedupeAddresses((data?.streams ?? []).map((s) => s.recipient));
}

/** UNCX locks schema — owner.id is the recipient. Sort by lockDate desc for recent. */
async function discoverUncxRecipients(chainId: SupportedChainId): Promise<string[]> {
  const url = UNCX_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedUncx($first: Int!) {
      locks(orderBy: lockDate, orderDirection: desc, first: $first) {
        owner { id }
      }
    }
  `;
  const data = await postGraph<{ locks?: Array<{ owner: { id: string } }> }>(url, query, { first: SEED_LIMIT });
  return dedupeAddresses((data?.locks ?? []).map((l) => l.owner.id));
}

/** Unvest HolderBalance schema — user = recipient. */
async function discoverUnvestRecipients(chainId: SupportedChainId): Promise<string[]> {
  const url = UNVEST_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedUnvest($first: Int!) {
      holderBalances(
        where: { isRecipient: true }
        orderBy: updatedAt
        orderDirection: desc
        first: $first
      ) { user }
    }
  `;
  const data = await postGraph<{ holderBalances?: Array<{ user: string }> }>(url, query, { first: SEED_LIMIT });
  return dedupeAddresses((data?.holderBalances ?? []).map((h) => h.user));
}

/** Superfluid VestingScheduler — receiver is the recipient. */
async function discoverSuperfluidRecipients(chainId: SupportedChainId): Promise<string[]> {
  const url = SUPERFLUID_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedSuperfluid($first: Int!) {
      vestingSchedules(
        where: { deletedAt: null }
        orderBy: startDate
        orderDirection: desc
        first: $first
      ) { receiver }
    }
  `;
  const data = await postGraph<{ vestingSchedules?: Array<{ receiver: string }> }>(url, query, { first: SEED_LIMIT });
  return dedupeAddresses((data?.vestingSchedules ?? []).map((v) => v.receiver));
}

function dedupeAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export interface SeedJob {
  adapterId: string;
  chainId:   SupportedChainId;
  /** Discovery fn — produces recipients for this (adapter, chain) pair. */
  discover:  (chainId: SupportedChainId) => Promise<string[]>;
}

export interface SeedRunResult {
  adapterId:            string;
  chainId:              number;
  recipientsDiscovered: number;
  streamsCached:        number;
  error?:               string;
}

const SEED_JOBS: SeedJob[] = [
  // Sablier — ETH, BSC, Polygon, Base
  { adapterId: "sablier",    chainId: CHAIN_IDS.ETHEREUM, discover: discoverSablierRecipients },
  { adapterId: "sablier",    chainId: CHAIN_IDS.BSC,      discover: discoverSablierRecipients },
  { adapterId: "sablier",    chainId: CHAIN_IDS.POLYGON,  discover: discoverSablierRecipients },
  { adapterId: "sablier",    chainId: CHAIN_IDS.BASE,     discover: discoverSablierRecipients },
  // UNCX — four mainnets
  { adapterId: "uncx",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverUncxRecipients },
  { adapterId: "uncx",       chainId: CHAIN_IDS.BSC,      discover: discoverUncxRecipients },
  { adapterId: "uncx",       chainId: CHAIN_IDS.POLYGON,  discover: discoverUncxRecipients },
  { adapterId: "uncx",       chainId: CHAIN_IDS.BASE,     discover: discoverUncxRecipients },
  // Unvest — four mainnets
  { adapterId: "unvest",     chainId: CHAIN_IDS.ETHEREUM, discover: discoverUnvestRecipients },
  { adapterId: "unvest",     chainId: CHAIN_IDS.BSC,      discover: discoverUnvestRecipients },
  { adapterId: "unvest",     chainId: CHAIN_IDS.POLYGON,  discover: discoverUnvestRecipients },
  { adapterId: "unvest",     chainId: CHAIN_IDS.BASE,     discover: discoverUnvestRecipients },
  // Superfluid — four mainnets
  { adapterId: "superfluid", chainId: CHAIN_IDS.ETHEREUM, discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid", chainId: CHAIN_IDS.BSC,      discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid", chainId: CHAIN_IDS.POLYGON,  discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid", chainId: CHAIN_IDS.BASE,     discover: discoverSuperfluidRecipients },
];

/** How many recipients to feed into a single adapter.fetch() call. */
const BATCH_SIZE = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runJob(job: SeedJob): Promise<SeedRunResult> {
  const adapter = ADAPTER_REGISTRY.find((a) => a.id === job.adapterId);
  if (!adapter) {
    return { adapterId: job.adapterId, chainId: job.chainId, recipientsDiscovered: 0, streamsCached: 0, error: "adapter not registered" };
  }

  let recipients: string[];
  try {
    recipients = await job.discover(job.chainId);
  } catch (err) {
    return { adapterId: job.adapterId, chainId: job.chainId, recipientsDiscovered: 0, streamsCached: 0, error: `discover: ${String(err)}` };
  }

  if (recipients.length === 0) {
    return { adapterId: job.adapterId, chainId: job.chainId, recipientsDiscovered: 0, streamsCached: 0 };
  }

  let totalStreams = 0;
  for (const batch of chunk(recipients, BATCH_SIZE)) {
    try {
      const streams = await adapter.fetch(batch, job.chainId);
      if (streams.length > 0) {
        await writeToCache(streams);
        totalStreams += streams.length;
      }
    } catch (err) {
      // Keep going with remaining batches — one bad batch shouldn't sink the whole job
      console.error(`[seeder] ${job.adapterId}/${job.chainId} batch failed:`, err);
    }
  }

  return {
    adapterId:            job.adapterId,
    chainId:              job.chainId,
    recipientsDiscovered: recipients.length,
    streamsCached:        totalStreams,
  };
}

/**
 * Seed the cache across every (adapter, chain) pair. Runs jobs in parallel,
 * three at a time, to avoid hammering the subgraph gateway.
 */
export async function seedAll(): Promise<SeedRunResult[]> {
  const PARALLEL = 3;
  const results: SeedRunResult[] = [];
  for (let i = 0; i < SEED_JOBS.length; i += PARALLEL) {
    const batch   = SEED_JOBS.slice(i, i + PARALLEL);
    const batchR  = await Promise.all(batch.map(runJob));
    results.push(...batchR);
  }
  return results;
}

/** Lightweight inspection hook — used by the cron route for the response body. */
export function summariseRun(results: SeedRunResult[]): {
  totalRecipients: number;
  totalStreams:    number;
  errors:          number;
} {
  return results.reduce(
    (acc, r) => ({
      totalRecipients: acc.totalRecipients + r.recipientsDiscovered,
      totalStreams:    acc.totalStreams    + r.streamsCached,
      errors:          acc.errors + (r.error ? 1 : 0),
    }),
    { totalRecipients: 0, totalStreams: 0, errors: 0 },
  );
}
