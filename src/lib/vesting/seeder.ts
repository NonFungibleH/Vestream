// src/lib/vesting/seeder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Populates the `vestingStreamsCache` table with real on-chain vesting data
// across every supported adapter — without needing any end-user to first
// search their wallet.
//
// Discovery strategies per protocol:
//
//   Sablier / UNCX / Unvest / Superfluid   → subgraph queries (The Graph,
//                                            Superfluid hosted). Cheap, pull
//                                            ~200 recipients per chain per
//                                            run. Original approach.
//
//   Team Finance                            → Squid GraphQL (different stack,
//                                            different schema than The Graph).
//                                            We query `vestingClaims` for
//                                            recent claim events and extract
//                                            claimant addresses — a decent
//                                            proxy for "wallets with active
//                                            Team Finance vestings".
//
//   Hedgey                                  → on-chain event scan. The
//                                            TokenVestingPlans contract is
//                                            ERC721, so recipient wallets are
//                                            the `to` addresses of mint
//                                            Transfer events. We scan the
//                                            last ~N blocks each run.
//
//   PinkSale                                → curated wallet list at
//                                            `src/lib/vesting/seed-wallets.ts`.
//                                            PinkLock V2 has no subgraph and
//                                            its events require more
//                                            introspection than a single
//                                            seeder commit can produce; the
//                                            list is where ops adds wallets
//                                            as they're discovered in the
//                                            wild.
//
//   UNCX VestingManager (uncx-vm)           → still deferred; the VM schema
//                                            overlaps with main UNCX in ways
//                                            that make a dedicated discovery
//                                            query risky. Revisit once we
//                                            have real user traffic.
//
// Once discovery produces recipient addresses, every adapter uses the same
// `adapter.fetch(recipients, chainId)` method to produce fully-normalised
// VestingStream objects, which we upsert via `writeToCache`.
//
// Run by `/api/cron/seed-cache` on the Vercel cron schedule (daily at 03:00 UTC).
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http, parseAbiItem } from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";
import { CHAIN_IDS, type SupportedChainId } from "./types";
import { writeToCache } from "./dbcache";
import { ADAPTER_REGISTRY } from "./adapters";
import { resolveSubgraphUrl } from "./graph";
import { PINKSALE_SEED_WALLETS } from "./seed-wallets";

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

/**
 * POST a GraphQL query against `url`. Logs enough per-failure context that
 * Vercel-side diagnosis doesn't need a DB dump:
 *   - `[seeder:{tag}] HTTP 400 https://gateway...` on non-2xx
 *   - `[seeder:{tag}] graphql errors: {message: "..."}` on schema drift
 *   - `[seeder:{tag}] fetch failed: TypeError: ...` on network/DNS
 * The `tag` argument identifies the specific discovery call in logs so
 * "which protocol on which chain just broke" is greppable at a glance.
 */
async function postGraph<T>(
  url:       string,
  query:     string,
  variables: Record<string, unknown>,
  tag:       string,
): Promise<T | null> {
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
      const body = await res.text().catch(() => "");
      console.error(`[seeder:${tag}] HTTP ${res.status} ${url.slice(0, 80)} :: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors) {
      console.error(`[seeder:${tag}] graphql errors:`, JSON.stringify(json.errors).slice(0, 400));
      return null;
    }
    return (json.data ?? null) as T | null;
  } catch (err) {
    console.error(`[seeder:${tag}] fetch failed:`, err);
    return null;
  }
}

/**
 * Sablier V2.1 uses `recipient: Bytes!`; sort by startTime desc for newest
 * streams. If the primary query (which filters canceled:false) returns zero
 * recipients, we retry WITHOUT the filter — Sablier's subgraph has
 * occasionally returned empty-with-no-error when a where-clause field has
 * been renamed or a boolean becomes nullable, and the cheapest way to tell
 * "schema changed" from "genuinely zero streams" is to ask without the
 * filter and compare.
 */
async function discoverSablierRecipients(chainId: SupportedChainId): Promise<string[]> {
  const url = SABLIER_URLS[chainId];
  if (!url) return [];
  const tag = `sablier/${chainId}`;

  // Primary: filter out canceled streams (what we actually want to seed).
  const primary = `
    query SeedSablierPrimary($first: Int!) {
      streams(
        where: { canceled: false }
        orderBy: startTime
        orderDirection: desc
        first: $first
      ) { recipient }
    }
  `;
  const data1 = await postGraph<{ streams?: Array<{ recipient: string }> }>(url, primary, { first: SEED_LIMIT }, tag);
  const recipients1 = dedupeAddresses((data1?.streams ?? []).map((s) => s.recipient));
  if (recipients1.length > 0) return recipients1;

  // Fallback: same query without the canceled filter. If THIS one returns
  // rows, the `canceled` field (or its boolean type) likely changed in the
  // subgraph schema — we at least populate the cache and the discrepancy
  // surfaces in the logs next run.
  console.warn(`[seeder:${tag}] primary returned 0 recipients; retrying without the canceled filter`);
  const fallback = `
    query SeedSablierFallback($first: Int!) {
      streams(
        orderBy: startTime
        orderDirection: desc
        first: $first
      ) { recipient }
    }
  `;
  const data2 = await postGraph<{ streams?: Array<{ recipient: string }> }>(url, fallback, { first: SEED_LIMIT }, `${tag}/fallback`);
  const recipients2 = dedupeAddresses((data2?.streams ?? []).map((s) => s.recipient));
  if (recipients2.length > 0) {
    console.warn(`[seeder:${tag}] fallback succeeded with ${recipients2.length} recipients — schema change likely (canceled filter)`);
  }
  return recipients2;
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
  const data = await postGraph<{ locks?: Array<{ owner: { id: string } }> }>(url, query, { first: SEED_LIMIT }, `uncx/${chainId}`);
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
  const data = await postGraph<{ holderBalances?: Array<{ user: string }> }>(url, query, { first: SEED_LIMIT }, `unvest/${chainId}`);
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
  const data = await postGraph<{ vestingSchedules?: Array<{ receiver: string }> }>(url, query, { first: SEED_LIMIT }, `superfluid/${chainId}`);
  return dedupeAddresses((data?.vestingSchedules ?? []).map((v) => v.receiver));
}

// ─── Team Finance discovery (Squid, not The Graph) ──────────────────────────
//
// Team Finance publishes a Squid GraphQL endpoint at teamfinance.squids.live.
// The schema uses Subsquid conventions (`_DESC`, `limit`, `_eq`) which differ
// slightly from The Graph's — hence a dedicated discovery fn instead of
// shoehorning into postGraph. We query `vestingClaims` (recent claim events)
// and extract claimant addresses, which is a decent proxy for "wallets with
// active Team Finance vestings". Misses wallets with vestings they've never
// claimed from, but those would appear via organic user traffic.

const TEAM_FINANCE_SQUID = "https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql";

async function discoverTeamFinanceRecipients(chainId: SupportedChainId): Promise<string[]> {
  const query = `
    query SeedTeamFinance($chainId: Int!, $first: Int!) {
      vestingClaims(
        where: { chainId_eq: $chainId }
        orderBy: timestamp_DESC
        limit: $first
      ) { account }
    }
  `;
  const data = await postGraph<{ vestingClaims?: Array<{ account: string }> }>(
    TEAM_FINANCE_SQUID,
    query,
    { chainId, first: SEED_LIMIT },
    `team-finance/${chainId}`,
  );
  return dedupeAddresses((data?.vestingClaims ?? []).map((v) => v.account));
}

// ─── Hedgey discovery (on-chain event scan) ─────────────────────────────────
//
// TokenVestingPlans is ERC721 — every minted plan corresponds to a Transfer
// event from the zero address. We scan the last LOG_BLOCK_WINDOW blocks on
// each chain for Transfer(0x0 → recipient) events, and extract recipients.
// Works without a subgraph. RPC cost per run: one eth_getLogs per chain,
// which all major providers support within their free-tier budgets.

const HEDGEY_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.POLYGON]:  "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
};

const VIEM_CHAIN_MAP = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.POLYGON]:  polygon,
  [CHAIN_IDS.BASE]:     base,
} as const;

function getRpcUrl(chainId: SupportedChainId): string | undefined {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return process.env.ALCHEMY_RPC_URL_ETH;
    case CHAIN_IDS.BSC:      return process.env.BSC_RPC_URL;
    case CHAIN_IDS.POLYGON:  return process.env.POLYGON_RPC_URL;
    case CHAIN_IDS.BASE:     return process.env.ALCHEMY_RPC_URL_BASE;
    default:                 return undefined;
  }
}

/** Block range to scan for recent events. 10k blocks ≈ 5h-33h depending on chain —
 *  enough to find the dozens of recipients per chain we need for a seed, small
 *  enough to fit inside a single eth_getLogs call on every major RPC provider. */
const LOG_BLOCK_WINDOW = 10_000n;

async function discoverHedgeyRecipients(chainId: SupportedChainId): Promise<string[]> {
  const contract = HEDGEY_CONTRACTS[chainId];
  const rpcUrl   = getRpcUrl(chainId);
  if (!contract || !rpcUrl) return [];

  const chain = VIEM_CHAIN_MAP[chainId as keyof typeof VIEM_CHAIN_MAP];
  if (!chain) return [];

  const tag = `hedgey/${chainId}`;
  try {
    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    const head   = await client.getBlockNumber();
    const from   = head > LOG_BLOCK_WINDOW ? head - LOG_BLOCK_WINDOW : 0n;

    // ERC-721 Transfer. Filter on `from = zero address` to isolate mints —
    // that's how new plans are issued to recipients.
    const logs = await client.getLogs({
      address:  contract,
      event:    parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"),
      args:     { from: "0x0000000000000000000000000000000000000000" as `0x${string}` },
      fromBlock: from,
      toBlock:   head,
    });

    const recipients = dedupeAddresses(logs.map((l) => l.args.to).filter(Boolean) as string[]);
    console.log(`[seeder:${tag}] scanned blocks ${from}..${head}, ${logs.length} mint events → ${recipients.length} recipients`);
    return recipients;
  } catch (err) {
    console.error(`[seeder:${tag}] log scan failed:`, err);
    return [];
  }
}

/**
 * PinkSale discovery — reads from the curated wallet list in seed-wallets.ts.
 * Kept as a static list because PinkLock V2's event signatures haven't been
 * fully mapped into the seeder yet, and guessing them risks sending garbage
 * addresses into adapter.fetch() (which silently returns [] for non-locks
 * but wastes RPC budget).
 */
async function discoverPinksaleRecipients(chainId: SupportedChainId): Promise<string[]> {
  const wallets = PINKSALE_SEED_WALLETS[chainId] ?? [];
  if (wallets.length === 0) {
    console.log(`[seeder:pinksale/${chainId}] curated wallet list empty; protocol card will show 'no data' until populated`);
  }
  return dedupeAddresses(wallets);
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
  // Sablier — ETH, BSC, Polygon, Base (Sepolia omitted: no cache value in
  // surfacing testnet streams on the public /unlocks page)
  { adapterId: "sablier",      chainId: CHAIN_IDS.ETHEREUM, discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.BSC,      discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.POLYGON,  discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.BASE,     discover: discoverSablierRecipients },
  // UNCX — four mainnets
  { adapterId: "uncx",         chainId: CHAIN_IDS.ETHEREUM, discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.BSC,      discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.POLYGON,  discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.BASE,     discover: discoverUncxRecipients },
  // Unvest — four mainnets
  { adapterId: "unvest",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.BSC,      discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.POLYGON,  discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.BASE,     discover: discoverUnvestRecipients },
  // Superfluid — four mainnets
  { adapterId: "superfluid",   chainId: CHAIN_IDS.ETHEREUM, discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.BSC,      discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.POLYGON,  discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.BASE,     discover: discoverSuperfluidRecipients },
  // Team Finance — four mainnets (Squid GraphQL, different stack)
  { adapterId: "team-finance", chainId: CHAIN_IDS.ETHEREUM, discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.BSC,      discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.POLYGON,  discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.BASE,     discover: discoverTeamFinanceRecipients },
  // Hedgey — four mainnets (ERC721 Transfer event scan via RPC)
  { adapterId: "hedgey",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.BSC,      discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.POLYGON,  discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.BASE,     discover: discoverHedgeyRecipients },
  // PinkSale — four mainnets (curated wallet list; see seed-wallets.ts)
  { adapterId: "pinksale",     chainId: CHAIN_IDS.ETHEREUM, discover: discoverPinksaleRecipients },
  { adapterId: "pinksale",     chainId: CHAIN_IDS.BSC,      discover: discoverPinksaleRecipients },
  { adapterId: "pinksale",     chainId: CHAIN_IDS.POLYGON,  discover: discoverPinksaleRecipients },
  { adapterId: "pinksale",     chainId: CHAIN_IDS.BASE,     discover: discoverPinksaleRecipients },
];

/** How many recipients to feed into a single adapter.fetch() call. */
const BATCH_SIZE = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runJob(job: SeedJob): Promise<SeedRunResult> {
  const tag = `${job.adapterId}/${job.chainId}`;
  const adapter = ADAPTER_REGISTRY.find((a) => a.id === job.adapterId);
  if (!adapter) {
    console.error(`[seeder:${tag}] adapter not registered`);
    return { adapterId: job.adapterId, chainId: job.chainId, recipientsDiscovered: 0, streamsCached: 0, error: "adapter not registered" };
  }

  let recipients: string[];
  try {
    recipients = await job.discover(job.chainId);
  } catch (err) {
    console.error(`[seeder:${tag}] discover threw:`, err);
    return { adapterId: job.adapterId, chainId: job.chainId, recipientsDiscovered: 0, streamsCached: 0, error: `discover: ${String(err)}` };
  }

  if (recipients.length === 0) {
    // Not an error — empty discovery is legitimate for curated-list adapters
    // (PinkSale) and for chains with no active protocol presence. Log at info
    // level so dashboards can distinguish "empty" from "broken".
    console.log(`[seeder:${tag}] 0 recipients discovered`);
    return { adapterId: job.adapterId, chainId: job.chainId, recipientsDiscovered: 0, streamsCached: 0 };
  }

  let totalStreams = 0;
  let batchErrors  = 0;
  for (const batch of chunk(recipients, BATCH_SIZE)) {
    try {
      const streams = await adapter.fetch(batch, job.chainId);
      if (streams.length > 0) {
        await writeToCache(streams);
        totalStreams += streams.length;
      }
    } catch (err) {
      // Keep going with remaining batches — one bad batch shouldn't sink the whole job
      batchErrors++;
      console.error(`[seeder:${tag}] batch failed:`, err);
    }
  }

  console.log(`[seeder:${tag}] discovered ${recipients.length} recipients → cached ${totalStreams} streams${batchErrors ? ` (${batchErrors} batch errors)` : ""}`);
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
