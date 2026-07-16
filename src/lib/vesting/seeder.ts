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

import { createPublicClient, http, type Hex } from "viem";
import { mainnet, bsc, polygon, base, arbitrum, optimism, sepolia } from "viem/chains";
import { Connection, PublicKey } from "@solana/web3.js";
import { CHAIN_IDS, type SupportedChainId } from "./types";
import { writeToCache } from "./dbcache";
import { refreshStatusSummary } from "./cache-stats";
import { refreshProtocolSummaries } from "./protocol-stats";
import { ADAPTER_REGISTRY } from "./adapters";
import { resolveSubgraphUrl } from "./graph";
import { PINKSALE_SEED_WALLETS } from "./seed-wallets";
import { normaliseAddress } from "@/lib/address-validation";
import { isAdapterEnabled } from "@/lib/protocol-constants";

// ─── Per-chain subgraph URLs (mirror the adapter files) ──────────────────────
//
// These are duplicated from the adapters (rather than imported) because each
// adapter's URL map is a private module const, and adding an export just for
// the seeder would bloat the adapter surface area. If an adapter's URL ever
// changes, update both here AND in the adapter file — or extract into a
// shared const in a follow-up. For now, explicit duplication is safer.

// Sablier moved off The Graph onto Envio; one unified multi-chain endpoint
// now serves every network, with chainId filtered inside the query. See the
// commentary in adapters/sablier.ts for the full migration context.
const SABLIER_ENVIO_URL =
  process.env.SABLIER_ENVIO_URL ?? "https://indexer.hyperindex.xyz/53b7e25/v1/graphql";

const UNCX_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_ETH,     "Dp7Nvr9EESRYJC1sVhVdrRiDU2bxPa8G1Zhqdh4vyHnE") ?? "",
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_BSC,     "Bq3CVVspv1gunmEhYkAwfRZcMZK5QyaydyCRarCwgE8P") ?? "",
  // Polygon: hosted subgraph was deprecated ("no allocations"); skipping
  // until UNCX publishes a replacement. See adapters/uncx.ts for full note.
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_POLYGON) ?? "",
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_BASE,    "CUQ2qwQcVfivLPF9TsoLaLnJGmPRb3sDYFVRXbtUy78z") ?? "",
  // Sepolia — testnet coverage for QA. Subgraph ID mirrors adapters/uncx.ts.
  [CHAIN_IDS.SEPOLIA]:  resolveSubgraphUrl(process.env.UNCX_SUBGRAPH_URL_SEPOLIA, "5foyqAtEVWtcSJX62sMC6fVR7FmetsFy8eYRKRT2E7DU") ?? "",
};

const UNVEST_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_ETH,      "HR7owbk45vXNgf8XXyDd7fRLuVo6QGYY6XbGjRCPgUuD") ?? "",
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_BSC,      "5RiFDxL1mDFdSojrC7tRkVXqiiQgysf77iC7c1KK5CAp") ?? "",
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_POLYGON,  "7EwmQS7MyeY9BZC5xeAr25WgjcgbRNpAY95dZNBvqgja") ?? "",
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_BASE,     "8DdThKxMS2LxEtyDCdwqtecwRu4qD8GbE77n3ANvkN2M") ?? "",
  [CHAIN_IDS.ARBITRUM]: resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_ARBITRUM, "9soNvLk5RWaJ3HtgJSsr9m5Nafo985kNyrArPM7iopUV") ?? "",
  [CHAIN_IDS.OPTIMISM]: resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_OPTIMISM, "J7QQ4hkWLvfNBMAMxcYhzEfWw7ChJ9DM5qQsXcad5ewb") ?? "",
};

const SUPERFLUID_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/vesting-scheduler",
  [CHAIN_IDS.BSC]:      "https://subgraph-endpoints.superfluid.dev/bsc-mainnet/vesting-scheduler",
  [CHAIN_IDS.POLYGON]:  "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/vesting-scheduler",
  [CHAIN_IDS.BASE]:     "https://subgraph-endpoints.superfluid.dev/base-mainnet/vesting-scheduler",
  // Arbitrum uses the bare `arbitrum-one` slug — no `-mainnet` suffix.
  // Verified 2026-05-02 via direct GraphQL probe (real schedules indexed).
  [CHAIN_IDS.ARBITRUM]: "https://subgraph-endpoints.superfluid.dev/arbitrum-one/vesting-scheduler",
  // Optimism uses `optimism-mainnet` — verified 2026-05-02 via direct probe.
  [CHAIN_IDS.OPTIMISM]: "https://subgraph-endpoints.superfluid.dev/optimism-mainnet/vesting-scheduler",
};

// LlamaPay — The Graph decentralized network deployments. IDs cross-checked
// with the adapter file (src/lib/vesting/adapters/llamapay.ts) — keep the
// two maps in sync if a new chain is added or a deployment is migrated.
const LLAMAPAY_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.LLAMAPAY_SUBGRAPH_URL_ETH,      "5Ac1MryeCPqmzmXGMcchhmKsdaVKwzQ796KApoLGNtqZ") ?? "",
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.LLAMAPAY_SUBGRAPH_URL_BSC,      "4e3YbwrXML1gFuRSmtqvt89N4APWjyfvkBA8pDDuYZAD") ?? "",
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.LLAMAPAY_SUBGRAPH_URL_POLYGON,  "egF47mBwB7ytP3aQafhRNHAdtAFHUaZUGy5Me7bq2ew")  ?? "",
  [CHAIN_IDS.ARBITRUM]: resolveSubgraphUrl(process.env.LLAMAPAY_SUBGRAPH_URL_ARBITRUM, "6ULAzMy7FSRdHngU9S725hr51tq9zqB5Q6LbRYHMSSuy") ?? "",
  [CHAIN_IDS.OPTIMISM]: resolveSubgraphUrl(process.env.LLAMAPAY_SUBGRAPH_URL_OPTIMISM, "Hw2mERc7LMD9papcf1QPq4puBpHJqh4tNrEZYRC65Hqe") ?? "",
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.LLAMAPAY_SUBGRAPH_URL_BASE,     "9LPDj38RmbDzyPaPWKSkxHPm9Bzv6oRCHJ2oMxr4LPaz") ?? "",
};

// ─── Discovery queries ────────────────────────────────────────────────────────
//
// Each query returns the newest `first` streams on that chain. We only need
// the `recipient` field — everything else gets re-fetched normalised by the
// adapter's fetch() method. This keeps the seeder stateless: it doesn't
// attempt to reproduce any adapter's math or schema interpretation.

// Seed limits — per (adapter, chain) per run.
//
//   SEED_LIMIT       — default "incremental" cron run. Bumped 200→500 after
//                      the April 2026 coverage audit revealed UNCX/Team
//                      Finance TVL was understated by 2+ orders of magnitude
//                      because 200 sampled wallets caught almost none of the
//                      mainstream high-liquidity vestings on either protocol.
//                      500 gives us 5× the coverage at similar runtime
//                      because the adapter fetch step batches 50 recipients
//                      per query (so ~10 batches vs ~4 before — still well
//                      inside the 300s maxDuration).
//
//   DEEP_SEED_LIMIT  — opt-in "deep" pass invoked from /api/cron/seed-cache
//                      with ?mode=deep. Paginates through subgraph `skip`
//                      up to 5000 recipients per (adapter, chain). Meant to
//                      be run manually or via a separate weekly cron — not
//                      the daily incremental path.
const SEED_LIMIT      = 500;
const DEEP_SEED_LIMIT = 5000;

// Streamflow-specific caps. Solana free-tier RPCs (Alchemy / Helius) burn
// compute units faster than they replenish once you push past a couple of
// hundred per-wallet `client.get()` calls in quick succession — the
// 2026-05-13 03:00 UTC solana group log shows 49,579 recipients discovered
// but the resulting per-recipient fan-out 429'd within ~30s of starting,
// landing zero enriched streams in the cache.
//
// The Streamflow adapter throttles via mapBounded(concurrency=4,
// batchDelay=100ms) which is ~40 calls/sec sustained. The Alchemy free
// CU/s ceiling lets ~150-200 of those land before back-pressure kicks in.
// Capping the per-run recipient list to those sustainable numbers means
// we always hydrate SOMETHING, even if a full deep walk would 429 out.
//
// Re-raise these when SOLANA_RPC_URL is repointed at a paid tier — the
// limits exist because the free tier is the bottleneck, not the discovery
// path (which is one cheap getProgramAccounts call).
const STREAMFLOW_INCREMENTAL_LIMIT = 200;
const STREAMFLOW_DEEP_LIMIT        = 500;

// Subgraph single-query cap. Most The Graph deployments enforce
// first ≤ 1000; Envio (Sablier) supports higher but 1000 is a safe universal.
const PAGE_SIZE = 1000;

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

// ─── Pagination helper ──────────────────────────────────────────────────────
//
// Most The Graph subgraphs cap `first` at 1000 and `skip` at 5000. Rather
// than duplicate pagination across every discover fn, `paginateDiscover`
// iterates pages until it hits the requested limit OR the subgraph returns
// a short/empty page. Each page calls the adapter-specific `fetchPage(first,
// skip)` closure, which returns an array of addresses for that slice.
//
// For incremental mode (limit=500) this runs one page. For deep mode
// (limit=5000) it runs up to 5 pages, which is the subgraph skip ceiling
// — going beyond that requires cursor-based pagination per-adapter which
// we defer until we see a concrete need.

async function paginateDiscover(
  limit:     number,
  fetchPage: (first: number, skip: number) => Promise<string[]>,
): Promise<string[]> {
  const out: string[] = [];
  let skip = 0;
  while (out.length < limit) {
    const want = Math.min(PAGE_SIZE, limit - out.length);
    let page: string[];
    try {
      page = await fetchPage(want, skip);
    } catch (err) {
      console.error(`[seeder:paginate] page at skip=${skip} threw:`, err);
      break;
    }
    if (page.length === 0) break;
    out.push(...page);
    skip += page.length;
    // If the subgraph returned fewer than we asked, we've hit the end
    if (page.length < want) break;
  }
  return out;
}

/**
 * Sablier discovery — Envio/Hasura schema. Entity is `LockupStream`, filter
 * syntax is `{ _eq, _in }`, order is `order_by: {field: desc}`, chainId is
 * filtered inside the query (one endpoint for every chain).
 *
 * Envio does not enforce the 5000-skip ceiling that The Graph does, so
 * Sablier deep-seeds can in principle page beyond — but we still cap at
 * DEEP_SEED_LIMIT so the job stays bounded.
 */
async function discoverSablierRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const tag = `sablier/${chainId}`;
  const query = `
    query SeedSablier($first: Int!, $skip: Int!, $chainId: numeric!) {
      LockupStream(
        where: {
          chainId:  { _eq: $chainId }
          canceled: { _eq: false }
        }
        order_by: { startTime: desc }
        limit:  $first
        offset: $skip
      ) {
        recipient
      }
    }
  `;
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ LockupStream?: Array<{ recipient: string }> }>(
      SABLIER_ENVIO_URL, query, { first, skip, chainId }, tag,
    );
    return (data?.LockupStream ?? []).map((s) => s.recipient);
  });
  return dedupeAddresses(all);
}

/**
 * Sablier Flow discovery — same Envio endpoint as Lockup, different entity
 * (`FlowStream`). Filter to currently-flowing streams (not paused or voided)
 * so we don't waste a seed slot on terminated history. `recipient` is the
 * payee; `startTime` is the per-row creation time.
 */
async function discoverSablierFlowRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const tag = `sablier-flow/${chainId}`;
  const query = `
    query SeedSablierFlow($first: Int!, $skip: Int!, $chainId: numeric!) {
      FlowStream(
        where: {
          chainId: { _eq: $chainId }
          paused:  { _eq: false }
          voided:  { _eq: false }
        }
        order_by: { startTime: desc }
        limit:  $first
        offset: $skip
      ) {
        recipient
      }
    }
  `;
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ FlowStream?: Array<{ recipient: string }> }>(
      SABLIER_ENVIO_URL, query, { first, skip, chainId }, tag,
    );
    return (data?.FlowStream ?? []).map((s) => s.recipient);
  });
  return dedupeAddresses(all);
}

/** UNCX locks schema — owner.id is the recipient. Sort by lockDate desc for recent. */
async function discoverUncxRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const url = UNCX_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedUncx($first: Int!, $skip: Int!) {
      locks(orderBy: lockDate, orderDirection: desc, first: $first, skip: $skip) {
        owner { id }
      }
    }
  `;
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ locks?: Array<{ owner: { id: string } }> }>(
      url, query, { first, skip }, `uncx/${chainId}`,
    );
    return (data?.locks ?? []).map((l) => l.owner.id);
  });
  return dedupeAddresses(all);
}

/** Unvest HolderBalance schema — user = recipient. */
async function discoverUnvestRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const url = UNVEST_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedUnvest($first: Int!, $skip: Int!) {
      holderBalances(
        where: { isRecipient: true }
        orderBy: updatedAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) { user }
    }
  `;
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ holderBalances?: Array<{ user: string }> }>(
      url, query, { first, skip }, `unvest/${chainId}`,
    );
    return (data?.holderBalances ?? []).map((h) => h.user);
  });
  return dedupeAddresses(all);
}

/** LlamaPay — payee is the recipient. Filter to actively-flowing streams
 *  (active && !paused) so we don't waste a seed slot on cancelled history.
 *  The User entity has `id` = lowercased payee address. */
async function discoverLlamapayRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const url = LLAMAPAY_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedLlamapay($first: Int!, $skip: Int!) {
      streams(
        where: { active: true, paused: false }
        orderBy: createdTimestamp
        orderDirection: desc
        first: $first
        skip: $skip
      ) { payee { id } }
    }
  `;
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ streams?: Array<{ payee: { id: string } }> }>(
      url, query, { first, skip }, `llamapay/${chainId}`,
    );
    return (data?.streams ?? []).map((s) => s.payee.id);
  });
  return dedupeAddresses(all);
}

/** Superfluid VestingScheduler — receiver is the recipient. */
async function discoverSuperfluidRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const url = SUPERFLUID_URLS[chainId];
  if (!url) return [];
  const query = `
    query SeedSuperfluid($first: Int!, $skip: Int!) {
      vestingSchedules(
        where: { deletedAt: null }
        orderBy: startDate
        orderDirection: desc
        first: $first
        skip: $skip
      ) { receiver }
    }
  `;
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ vestingSchedules?: Array<{ receiver: string }> }>(
      url, query, { first, skip }, `superfluid/${chainId}`,
    );
    return (data?.vestingSchedules ?? []).map((v) => v.receiver);
  });
  return dedupeAddresses(all);
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
//
// 2026-05-26: Added cached-recipients fallback (same pattern as PinkSale).
// Root cause of 600h staleness: `vestingClaims` returns wallets that recently
// CLAIMED — but a wallet that just claimed its ENTIRE allocation now has
// `userTotal: 0` in the REST API, which the adapter filters out. So every
// seed run discovers valid claimants, fetches 0 streams, and the heartbeat
// never fires. Old cached rows (from wallets that claimed long ago) never
// get re-fetched because those wallets don't appear in recent claims.
//
// The fix: union Squid claimants with wallets already in cache. This
// re-fetches existing records every run, updating their balances (or marking
// them fully vested if the REST API now returns userTotal = 0).

const TEAM_FINANCE_SQUID = "https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql";

async function discoverTeamFinanceRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  // Squid supports offset/limit pagination with standard semantics; we can
  // iterate the same way as the subgraph discoverers.
  const query = `
    query SeedTeamFinance($chainId: Int!, $first: Int!, $skip: Int!) {
      vestingClaims(
        where: { chainId_eq: $chainId }
        orderBy: timestamp_DESC
        limit:  $first
        offset: $skip
      ) { account }
    }
  `;

  // Run Squid discovery and cached-recipient lookup in parallel.
  const [squidRecipients, cachedRecipients] = await Promise.all([
    paginateDiscover(limit, async (first, skip) => {
      const data = await postGraph<{ vestingClaims?: Array<{ account: string }> }>(
        TEAM_FINANCE_SQUID, query, { chainId, first, skip }, `team-finance/${chainId}`,
      );
      return (data?.vestingClaims ?? []).map((v) => v.account);
    }),
    getCachedRecipients("team-finance", chainId, limit).catch((err) => {
      console.error(`[seeder:team-finance/${chainId}] cached recipient query failed:`, err);
      return [] as string[];
    }),
  ]);

  // Cached first so re-refreshes of existing records take priority over
  // brand-new claimants when `limit` truncates. Mirrored from PinkSale.
  const recipients = dedupeAddresses([...cachedRecipients, ...squidRecipients]);

  console.log(
    `[seeder:team-finance/${chainId}] discovery: squid=${squidRecipients.length}, cached=${cachedRecipients.length}, combined=${recipients.length}`,
  );

  return recipients.slice(0, limit);
}

// ─── Hedgey discovery (on-chain ERC721Enumerable reads) ─────────────────────
//
// TokenVestingPlans is ERC721Enumerable. The previous implementation scanned
// a 10k-block window of Transfer(0x0 → *) events, which failed on every
// chain — 10k blocks = ~5h on Polygon/Base, and if no plan was minted in
// that window the discovery returned zero recipients. Popular as Hedgey is,
// "a plan every 5 hours" is NOT a safe assumption.
//
// Instead, we enumerate the current holder set directly via the ERC721
// enumerable extension:
//   totalSupply()          → current plan count N
//   tokenByIndex(i)        → tokenId at enumeration slot i (in [0, N))
//   ownerOf(tokenId)       → current holder of that plan
//
// Both tokenByIndex and ownerOf are bundled into a single Multicall3 call,
// so the full discovery is two RPC round-trips per chain regardless of how
// many plans we inspect. That trivially beats getLogs for seeding.
//
// We take the LAST SEED_LIMIT slots (slots [N-SEED_LIMIT, N)) so seeds bias
// toward recent plans — which are more likely to still be active.

const HEDGEY_CONTRACTS: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BSC]:      "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.POLYGON]:  "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  [CHAIN_IDS.BASE]:     "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  // Arbitrum: same address as the other mainnets — verified 2026-05-02
  // (totalSupply returned 1,191 plans via arb1.arbitrum.io/rpc).
  [CHAIN_IDS.ARBITRUM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  // Optimism: same address — verified 2026-05-02 (totalSupply returned
  // 422 plans via optimism.drpc.org).
  [CHAIN_IDS.OPTIMISM]: "0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C",
  // Sepolia deploys a different address (same bytecode) — mirrors adapters/hedgey.ts.
  [CHAIN_IDS.SEPOLIA]:  "0x68b6986416c7A38F630cBc644a2833A0b78b3631",
};

const VIEM_CHAIN_MAP = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.POLYGON]:  polygon,
  [CHAIN_IDS.BASE]:     base,
  [CHAIN_IDS.ARBITRUM]: arbitrum,
  [CHAIN_IDS.OPTIMISM]: optimism,
  [CHAIN_IDS.SEPOLIA]:  sepolia,
} as const;

// Seeder RPC URLs — now go through the shared multi-RPC pool in
// `src/lib/vesting/rpc.ts`. Each call rotates through providers, so retries
// hit different endpoints and rate limits compound across the pool.
//
// Lesson learned the hard way (commit bec6fc9 documented this): for the
// chains where the seeder does eth_getLogs (PinkSale, UNCX-VM event scans),
// publicnode endpoints prune historical logs aggressively (BSC ~17 days,
// Polygon ~10 days). The shared pool tags publicnode entries with
// `excludeForLogs: true` and we pass `{ forLogs: true }` here so the seeder
// only ever gets pool members that retain historical logs.
import { getRpcUrl as getRpcUrlPool, getSolanaRpcUrls, makeFallbackClient } from "./rpc";
function getRpcUrl(chainId: SupportedChainId): string | undefined {
  return getRpcUrlPool(chainId, { forLogs: true });
}

// Minimal ERC721Enumerable ABI fragment — inlined here so the adapter's own
// ABI (which focuses on plans() + balanceOf/tokenOfOwnerByIndex for
// user-centric reads) doesn't have to grow with seeder-specific functions.
const HEDGEY_ENUMERABLE_ABI = [
  { name: "totalSupply",  type: "function", stateMutability: "view", inputs: [],
    outputs: [{ type: "uint256" }] },
  { name: "tokenByIndex", type: "function", stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "ownerOf",      type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

// Multicall page size for hedgey discovery.
//
// Free-tier RPCs cap response sizes — Polygon at ~100KB, BSC and Base similar.
// A single multicall of 500-5000 calls easily exceeds that, viem throws,
// the catch returns []. Symptom we hit: hedgey BSC/Polygon/Base went 8.5
// days without ANY freshestSec update because every discovery run silently
// returned [] (commit cache-stats audit, May 2 2026).
//
// 100 calls per page is conservative enough for the smallest cap (Polygon
// 100KB) — each tokenByIndex/ownerOf response is ~200 bytes inside the
// aggregate3 envelope. 100 calls × ~200 bytes = ~20KB per page, well under
// the cap. Pages are run in series so transient RPC errors only invalidate
// one page, not the whole run.
const HEDGEY_PAGE_SIZE = 100;

export async function discoverHedgeyRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const contract = HEDGEY_CONTRACTS[chainId];
  if (!contract) {
    console.log(`[seeder:hedgey/${chainId}] skipped — no contract address configured`);
    return [];
  }

  const tag = `hedgey/${chainId}`;
  try {
    // Use makeFallbackClient (full RPC pool with per-URL quarantine) instead of
    // a single getRpcUrl() pick. BSC/Polygon multicall discovery was returning
    // 0 unique owners when the single-URL rotation landed on 1rpc.io or ankr —
    // providers that silently fail multicalls or cap responses. The fallback
    // client retries down the pool on any single-provider failure.
    const client = makeFallbackClient(chainId, { batch: true });
    if (!client) {
      console.log(`[seeder:hedgey/${chainId}] skipped — no fallback client available`);
      return [];
    }

    const totalSupply = await client.readContract({
      address: contract,
      abi: HEDGEY_ENUMERABLE_ABI,
      functionName: "totalSupply",
    }) as bigint;

    if (totalSupply === 0n) {
      console.log(`[seeder:${tag}] totalSupply=0 — no plans minted yet on this chain`);
      return [];
    }

    // Slot range [start, N) — newest `limit` entries (or all of them if
    // the contract has fewer than `limit` plans outstanding).
    const N     = Number(totalSupply);
    const start = Math.max(0, N - limit);
    const indices: number[] = [];
    for (let i = start; i < N; i++) indices.push(i);

    // Round 1 — tokenByIndex(i): paginated multicall.
    //
    // Single 500-5000-call multicalls overflow free-tier response caps on
    // BSC/Polygon/Base. We page through the indices in HEDGEY_PAGE_SIZE
    // chunks; per-page failures are logged but don't abort the run, so
    // partial coverage is preserved across transient RPC errors.
    const tokenIds: bigint[] = [];
    let pageFailures = 0;
    for (let p = 0; p < indices.length; p += HEDGEY_PAGE_SIZE) {
      const page = indices.slice(p, p + HEDGEY_PAGE_SIZE);
      try {
        const pageResults = await client.multicall({
          contracts: page.map((i) => ({
            address: contract,
            abi:     HEDGEY_ENUMERABLE_ABI,
            functionName: "tokenByIndex" as const,
            args:    [BigInt(i)] as const,
          })),
          allowFailure: true,
        });
        for (const r of pageResults) {
          if (r.status === "success") tokenIds.push(r.result as bigint);
        }
      } catch (err) {
        pageFailures++;
        console.warn(`[seeder:${tag}] tokenByIndex page ${p}-${p + page.length} failed:`, err);
      }
    }

    if (tokenIds.length === 0) {
      console.warn(`[seeder:${tag}] tokenByIndex multicall returned 0 usable tokenIds (totalSupply=${totalSupply}, pageFailures=${pageFailures})`);
      return [];
    }

    // Round 2 — ownerOf(tokenId): paginated multicall using the same page size.
    const owners: string[] = [];
    let ownerPageFailures = 0;
    for (let p = 0; p < tokenIds.length; p += HEDGEY_PAGE_SIZE) {
      const page = tokenIds.slice(p, p + HEDGEY_PAGE_SIZE);
      try {
        const pageResults = await client.multicall({
          contracts: page.map((tokenId) => ({
            address: contract,
            abi:     HEDGEY_ENUMERABLE_ABI,
            functionName: "ownerOf" as const,
            args:    [tokenId] as const,
          })),
          allowFailure: true,
        });
        for (const r of pageResults) {
          if (r.status === "success") owners.push(r.result as string);
        }
      } catch (err) {
        ownerPageFailures++;
        console.warn(`[seeder:${tag}] ownerOf page ${p}-${p + page.length} failed:`, err);
      }
    }

    const recipients = dedupeAddresses(owners);
    console.log(
      `[seeder:${tag}] enumerated ${indices.length} slots (of ${totalSupply} total) → ` +
      `${tokenIds.length} tokenIds → ${recipients.length} unique owners ` +
      `(pageFailures: tokenByIndex=${pageFailures}, ownerOf=${ownerPageFailures})`
    );
    return recipients;
  } catch (err) {
    console.error(`[seeder:${tag}] enumerable read failed:`, err);
    return [];
  }
}

// ─── PinkSale discovery (contract enumeration via walker) ──────────────────
//
// We delegate to the TVL walker's `discoverPinkSaleOwners` helper, which
// uses PinkLock V2's built-in enumeration functions
// (`allNormalTokenLockedCount` → `getCumulativeNormalTokenLockInfo` →
// `getLocksForToken`) via Multicall3. NO eth_getLogs. This is what makes
// the walker work on free-tier RPCs and what makes the seeder work now —
// previously the seeder used eth_getLogs which is rate-limited everywhere
// (Alchemy free caps at 10 blocks, publicnode prunes at ~17d, dRPC has
// range caps), causing the seeder to silently return 0 recipients.
//
// See src/lib/vesting/tvl-walker/pinksale.ts:1-23 for the full rationale.
// The walker has been doing this successfully in production for the TVL
// snapshot since b0f3cce / bcdcad2 / 744458f.
//
// The curated list in seed-wallets.ts stays as a safety net. Zero cost if
// it's empty (the default).

import { discoverPinkSaleOwners, fetchPinkSaleAllLocks } from "./tvl-walker/pinksale";
import { locksToVestingStreams as pinksaleLocksToStreams } from "./adapters/pinksale";
import { fetchAllJupiterLockEscrows } from "./adapters/jupiter-lock";
import { getCachedRecipients, bumpSeedHeartbeat, recordSeederAttempt } from "./dbcache";

export async function discoverPinksaleRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const tag = `pinksale/${chainId}`;
  const curated = PINKSALE_SEED_WALLETS[chainId] ?? [];

  // Walker discovers owners via the contract's TOKEN-side data structure
  // (every lock that ever existed). Some of those owners have had all
  // their locks withdrawn since — `getUserNormalLocksLength` returns 0
  // for them, so the per-wallet adapter returns 0 streams and the
  // seeder's "0 streams fetched, 0 errors" silent failure mode kicks in.
  // (Diagnosed May 6 2026 via the new ?sync=1 path.)
  //
  // Mitigation: also pull recipients from the existing cache. Anyone
  // whose stream landed in the cache during a previous seed run had
  // active locks recently and is far more likely to still have
  // something than a freshly-enumerated walker owner.
  const [walkerOwners, cachedOwners] = await Promise.all([
    discoverPinkSaleOwners(chainId).catch((err) => {
      console.error(`[seeder:${tag}] walker enumeration failed:`, err);
      return [] as string[];
    }),
    getCachedRecipients("pinksale", chainId, limit).catch((err) => {
      console.error(`[seeder:${tag}] cached recipient query failed:`, err);
      return [] as string[];
    }),
  ]);

  console.log(
    `[seeder:${tag}] discovery sources: walker=${walkerOwners.length}, ` +
    `cached=${cachedOwners.length}, curated=${curated.length}`,
  );

  // Union all three — dedupeAddresses normalises case so overlap is
  // harmless. Cached first so they get fetched first if `limit` truncates.
  return dedupeAddresses([...cachedOwners, ...walkerOwners, ...curated]).slice(0, limit);
}

// ─── Streamflow discovery (Solana getProgramAccounts + dataSlice) ───────────
//
// Streamflow has no subgraph (it's Solana) but Solana's RPC exposes a
// getProgramAccounts primitive with filters, which is all we need to
// enumerate every Contract account owned by the Streamflow program.
//
// Two tricks keep this cheap on a free-tier RPC:
//   1. memcmp filter on offset 0 with the 8-byte CONTRACT_DISCRIMINATOR —
//      excludes the program's config / fee / oracle accounts and returns
//      only Contract (i.e. stream) accounts
//   2. dataSlice { offset: 113, length: 32 } — asks the RPC to return ONLY
//      the 32-byte recipient pubkey from each account, not the full
//      ~700-byte Contract struct. Shrinks the response payload ~20×.
//
// The offsets / discriminator come from @streamflow/stream's exports
// (STREAM_STRUCT_OFFSET_RECIPIENT, CONTRACT_DISCRIMINATOR) — verified
// against the installed v11 SDK at module load time.
//
// Alchemy free-tier Solana (30M CU/mo) easily handles this; the full
// result set for mainnet Streamflow is on the order of tens of thousands
// of accounts, returned in a single call.

// Solana RPC retry helper.
//
// Alchemy's free Solana tier (and most others) cap compute-units-per-second.
// A single getProgramAccounts call against a busy program (Streamflow,
// Jupiter Lock) routinely 429s on the first attempt — Alchemy's own error
// message reads: "If you have retries enabled, you can safely ignore this
// message." The seeder previously had no retry, so a single 429 produced
// 0 recipients with a thrown error.
//
// Backoff schedule: 1s, 2s, 4s, 8s, 16s (max 31s total wait + call time).
// Fits inside the diagnostic endpoint's 60s lambda budget AND the
// cron's 300s budget.
//
// Match conditions:
//   - HTTP 429 in the error message
//   - any error message containing "compute units per second"
//   - any error message containing "rate limit"
// Anything else throws immediately (real bugs shouldn't be retried).
async function withSolanaRetry<T>(
  label:    string,
  fn:       () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimited =
        msg.includes("429") ||
        msg.toLowerCase().includes("compute units per second") ||
        msg.toLowerCase().includes("rate limit");
      if (!isRateLimited || attempt === maxAttempts) {
        lastErr = err;
        break;
      }
      const waitMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s, 16s
      console.log(`[${label}] attempt ${attempt}/${maxAttempts} rate-limited; retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

// URL-level Solana fallback. Tries each configured Solana RPC in order.
// Rate limits (429) are retried on the same URL via withSolanaRetry;
// quota exhaustion or other hard errors immediately advance to the next URL.
// This means a Helius-quota-exhausted run automatically falls through to
// SOLANA_RPC_URL_2 (e.g. Alchemy Solana) without manual intervention.
async function withSolanaFallback<T>(
  label: string,
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  const urls = getSolanaRpcUrls();
  if (urls.length === 0) {
    throw new Error(`[${label}] No Solana RPC URLs configured — set SOLANA_RPC_URL`);
  }
  let lastErr: unknown;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const connection = new Connection(url, "confirmed");
      return await withSolanaRetry(label, () => fn(connection));
    } catch (err) {
      const urlShort = url.replace(/api[-_]?key=[^&?]+/i, "api-key=***").slice(0, 60);
      if (i < urls.length - 1) {
        console.warn(
          `[${label}] ${urlShort} failed (${err instanceof Error ? err.message.slice(0, 80) : err}) ` +
          `— falling back to SOLANA_RPC_URL_${i + 2}`
        );
      }
      lastErr = err;
    }
  }
  throw lastErr;
}

// Streamflow mainnet-beta vesting program. Matches the SDK's
// PROGRAM_ID.mainnet constant so we don't hard-code it twice.
const STREAMFLOW_MAINNET_PROGRAM_ID = "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m";
const STREAMFLOW_RECIPIENT_OFFSET    = 113;
// Streamflow's `Contract` struct is exactly 1104 bytes on mainnet. Filtering
// by data size is FAR more reliable than filtering by Anchor discriminator
// for two reasons:
//   (1) Discriminators can change across program upgrades; the byte length
//       of the struct stays stable barring an explicit schema migration.
//   (2) Some RPC providers handle memcmp filters inconsistently. Diagnostic
//       run on 2026-04-29 with Helius confirmed that the same query
//       returned `[]` with a memcmp discriminator filter but returned real
//       Contract accounts with this dataSize filter — the discriminator
//       filter was finding nothing despite the correct base58 encoding.
//
// Trade-off: any other 1104-byte account owned by this program would also
// be returned. Streamflow's only other known structs (config, treasury,
// metadata) are different sizes, so this is unique-enough in practice.
const STREAMFLOW_CONTRACT_SIZE       = 1104;

export async function discoverStreamflowRecipients(
  chainId: SupportedChainId,
  limit:   number,
): Promise<string[]> {
  if (chainId !== CHAIN_IDS.SOLANA) return [];
  if (process.env.SOLANA_ENABLED !== "true") {
    console.log("[seeder:streamflow] SOLANA_ENABLED flag off — skipping discovery");
    return [];
  }
  if (getSolanaRpcUrls().length === 0) {
    console.error("[seeder:streamflow] SOLANA_RPC_URL not configured");
    return [];
  }

  const tag = `streamflow/${chainId}`;
  // NOTE: errors are NOT swallowed here. They bubble up to runJob (which
  // catches them as job-level errors and continues with other protocols),
  // and to the seed-diagnostic endpoint (which surfaces them in errors[]).
  // Previously this catch returned [] silently — useful in production but
  // catastrophic for debugging, because a misconfigured RPC looked
  // identical to "0 recipients legitimately found".
  //
  // withSolanaFallback tries SOLANA_RPC_URL first, then SOLANA_RPC_URL_2 if
  // the first fails (quota exhausted, 429 after all retries, etc.).
  const programId = new PublicKey(STREAMFLOW_MAINNET_PROGRAM_ID);

  const accounts = await withSolanaFallback(`seeder:${tag}`, (connection) =>
    connection.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [
        // dataSize filter — see STREAMFLOW_CONTRACT_SIZE comment for why
        // we use this instead of memcmp on the Anchor discriminator.
        { dataSize: STREAMFLOW_CONTRACT_SIZE },
      ],
      // Returns ONLY the 32-byte recipient field from each account.
      dataSlice: { offset: STREAMFLOW_RECIPIENT_OFFSET, length: 32 },
    }),
  );

  // Each account.data is a 32-byte Uint8Array (the recipient pubkey).
  // Wrap in PublicKey() + toBase58() to serialise. Skip any with
  // unexpected length (shouldn't happen, but defensive).
  const recipients: string[] = [];
  for (const { account } of accounts) {
    const bytes = account.data;
    if (bytes.length === 32) {
      try {
        recipients.push(new PublicKey(bytes).toBase58());
      } catch {
        /* malformed pubkey — skip */
      }
    }
  }

  // Streamflow-specific cap. The seeder's generic SEED_LIMIT / DEEP_SEED_LIMIT
  // are tuned for subgraph adapters where 500-5000 recipients is one cheap
  // GraphQL page. Solana's free-tier RPCs throttle hard on per-wallet
  // `client.get()` fan-out (see STREAMFLOW_*_LIMIT comments). Cap the
  // returned set so the downstream hydration actually completes instead of
  // 429-ing into zero writes. `limit` (the generic incremental/deep number)
  // is the upper bound — we only ever go lower, never higher.
  const isDeep         = limit > SEED_LIMIT;
  const streamflowCap  = isDeep ? STREAMFLOW_DEEP_LIMIT : STREAMFLOW_INCREMENTAL_LIMIT;
  const effectiveLimit = Math.min(limit, streamflowCap);

  console.log(`[seeder:${tag}] getProgramAccounts returned ${accounts.length} Contract accounts → ${recipients.length} recipients (capped to ${effectiveLimit} for free-tier Solana RPC)`);

  // dedupeAddresses now preserves Solana base58 casing (ecosystem-aware).
  return dedupeAddresses(recipients).slice(0, effectiveLimit);
}

// ─── Jupiter Lock discovery (Solana getProgramAccounts + dataSlice) ────────
//
// Same trick as Streamflow: getProgramAccounts with a discriminator memcmp
// filter + a 32-byte dataSlice at the recipient offset returns every active
// escrow's recipient pubkey in one call with a tiny payload.
//
// Program: LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
// Account: VestingEscrow, recipient field at offset 8 (immediately after
//          the 8-byte Anchor discriminator).

const JUPITER_LOCK_PROGRAM_ID = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
const JUPITER_LOCK_RECIPIENT_OFFSET = 8;
// Jupiter Lock's `VestingEscrow` struct is 296 bytes on mainnet.
// Verified via direct Helius getProgramAccounts query (2026-04-29):
//   - 296-byte accounts = VestingEscrow (the ones we want)
//   - 70-byte accounts  = small PDA / config accounts (skip)
//
// Same dataSize-filter approach as Streamflow's Contract — see comment
// on STREAMFLOW_CONTRACT_SIZE for full rationale. The previous
// memcmp-on-discriminator filter returned [] under the same conditions
// the Streamflow filter did, so we use the same proven workaround.
const JUPITER_LOCK_ESCROW_SIZE = 296;

export async function discoverJupiterLockRecipients(
  chainId: SupportedChainId,
  limit:   number,
): Promise<string[]> {
  if (chainId !== CHAIN_IDS.SOLANA) return [];
  if (process.env.SOLANA_ENABLED !== "true") {
    console.log("[seeder:jupiter-lock] SOLANA_ENABLED flag off — skipping discovery");
    return [];
  }
  if (getSolanaRpcUrls().length === 0) {
    console.error("[seeder:jupiter-lock] SOLANA_RPC_URL not configured");
    return [];
  }

  const tag = `jupiter-lock/${chainId}`;
  // Same no-swallow rationale as discoverStreamflowRecipients above.
  // withSolanaFallback tries SOLANA_RPC_URL first, then SOLANA_RPC_URL_2.
  const programId = new PublicKey(JUPITER_LOCK_PROGRAM_ID);

  const accounts = await withSolanaFallback(`seeder:${tag}`, (connection) =>
    connection.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [
        // dataSize filter — see JUPITER_LOCK_ESCROW_SIZE comment.
        { dataSize: JUPITER_LOCK_ESCROW_SIZE },
      ],
      dataSlice: { offset: JUPITER_LOCK_RECIPIENT_OFFSET, length: 32 },
    }),
  );

  const recipients: string[] = [];
  for (const { account } of accounts) {
    const bytes = account.data;
    if (bytes.length === 32) {
      try {
        recipients.push(new PublicKey(bytes).toBase58());
      } catch {
        /* skip malformed pubkey */
      }
    }
  }

  console.log(`[seeder:${tag}] getProgramAccounts returned ${accounts.length} VestingEscrow accounts → ${recipients.length} recipients`);
  return dedupeAddresses(recipients).slice(0, limit);
}

// ─── UNCX VestingManager discovery (on-chain event scan, no filter) ─────────
//
// The uncx-vm adapter performs per-wallet event scans filtered by
// topic[2]=beneficiary — which is a chicken-and-egg problem for seeding
// (you can only see the wallet's plans if you already know the wallet).
// For discovery we scan the same VestingCreated event WITHOUT the
// beneficiary filter and then extract topic[2] from every log — that's the
// indexed beneficiary field, padded to 32 bytes. Strip the padding and we
// have a fresh recipient set.
//
// VestingManager was deployed mid-August 2025. We scan the last ~500k
// blocks (which on every supported chain is at least ~5 days of activity)
// in 50k-block chunks, parallelised 10 at a time. If a chain's contract
// has seen fewer than 500k blocks of existence we scan from its deploy
// block instead.

const UNCX_VM_CONFIG: Partial<Record<SupportedChainId, {
  contract:  `0x${string}`;
  fromBlock: bigint;
}>> = {
  [CHAIN_IDS.ETHEREUM]: { contract: "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5", fromBlock: 23_143_944n },
  [CHAIN_IDS.BASE]:     { contract: "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45", fromBlock: 43_187_425n },
  [CHAIN_IDS.BSC]:      { contract: "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa", fromBlock: 85_818_300n },
};
const UNCX_VM_VESTING_CREATED_TOPIC =
  "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f" as Hex;
// dRPC tightened their free-tier eth_getLogs limit to 10k blocks per call
// (verified on the Apr 29 2026 cron run: every chunk on BSC + Base failed
// with "ranges over 10000 blocks are not supported on freetier"). Their
// previous 50k cap is now paid-tier-only. Using 9_999 to stay under the
// inclusive boundary.
//
// Trade-off: 5x more chunks per scan, but at PARALLEL=10 batches the
// total wall time stays similar. We compensated by reducing the per-chain
// windows in UNCX_VM_WINDOWS — see the comment there for sizing maths.
const UNCX_VM_CHUNK  = 9_999n;

// Per-chain scan windows.
//
// Sizing: chunk = 10_000 blocks (dRPC free-tier limit). PARALLEL = 10 means
// each batch of 10 chunks scans 100k blocks. Cron has ~250s budget for
// UNCX-VM (the rest goes to other protocols). Conservatively, ~50 batches
// = 500k blocks per scan in 60s, and we run that for 2-3 minutes.
//
// Window targets (chosen to fit ~250s on dRPC free):
//   ETH:  500k blocks (≈ 69 days at 12s blocks)
//   BSC:  600k blocks (≈ 21 days at 3s blocks)  — was 3M, cut to keep
//                                                  dRPC chunked-scan under
//                                                  budget. Catches recent
//                                                  activity.
//   Base: 600k blocks (≈ 14 days at 2s blocks)  — same reasoning
//
// Trade-off: BSC/Base coverage went from "8+ months" with the old 50k chunks
// to ~2-3 weeks now. Old streams won't be discovered through this scan; they
// remain accessible via the per-wallet adapter path (where users connect a
// wallet and we fetch THEIR streams directly). For seeding TVL+aggregate
// stats, recent-activity coverage is what matters most.
//
// If we want full historical coverage for BSC/Base later, options are:
//   1. Pay for dRPC (or move to BSC_RPC_URL/ALCHEMY_RPC_URL_BASE env vars)
//   2. Run a one-shot deep historical seed via a dedicated maintenance cron
//      that has a longer budget (e.g. 15 min) and runs weekly, not daily
const UNCX_VM_WINDOWS: Record<SupportedChainId, bigint> = {
  [CHAIN_IDS.ETHEREUM]:        500_000n,
  [CHAIN_IDS.BSC]:             600_000n,
  [CHAIN_IDS.BASE]:            600_000n,
  [CHAIN_IDS.POLYGON]:               0n, // not in UNCX_VM_CONFIG
  [CHAIN_IDS.ARBITRUM]:              0n, // UNCX-VM not yet wired for Arbitrum
  [CHAIN_IDS.OPTIMISM]:              0n, // UNCX-VM not yet wired for Optimism
  [CHAIN_IDS.AVALANCHE]:             0n, // UNCX-VM not on Avalanche
  [CHAIN_IDS.SOLANA]:                0n, // EVM-only
  [CHAIN_IDS.SEPOLIA]:               0n,
  [CHAIN_IDS.BASE_SEPOLIA]:          0n,
};

export async function discoverUncxVmRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const config = UNCX_VM_CONFIG[chainId];
  const rpcUrl = getRpcUrl(chainId);
  const chain  = VIEM_CHAIN_MAP[chainId as keyof typeof VIEM_CHAIN_MAP];
  if (!config || !rpcUrl || !chain) {
    console.log(`[seeder:uncx-vm/${chainId}] skipped — chain not supported or RPC not configured`);
    return [];
  }

  const tag    = `uncx-vm/${chainId}`;
  const window = UNCX_VM_WINDOWS[chainId] ?? 500_000n;
  try {
    const client      = createPublicClient({ chain, transport: http(rpcUrl) });
    const latestBlock = await client.getBlockNumber();
    const fromBlock   = latestBlock > window + config.fromBlock
      ? latestBlock - window
      : config.fromBlock;

    // Build 50k-block chunks.
    const chunks: Array<{ from: bigint; to: bigint }> = [];
    for (let from = fromBlock; from <= latestBlock; from += UNCX_VM_CHUNK + 1n) {
      chunks.push({ from, to: from + UNCX_VM_CHUNK > latestBlock ? latestBlock : from + UNCX_VM_CHUNK });
    }

    // Parallel batches of 10 — matches the adapter's pattern.
    const BATCH    = 10;
    const rawLogs: Array<{ topics: readonly (Hex | null | undefined)[] }> = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch   = chunks.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(({ from, to }) =>
          client.getLogs({
            address:   config.contract,
            event:     undefined, // topic-only filter; keeps the payload tiny
            args:      undefined,
            fromBlock: from,
            toBlock:   to,
          }).then((logs) =>
            // Filter to VestingCreated topic client-side (getLogs's `topics`
            // array is brittle across viem versions; post-filter is cheap).
            logs.filter((l) => l.topics[0] === UNCX_VM_VESTING_CREATED_TOPIC),
          ),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") rawLogs.push(...r.value);
        else                          console.error(`[seeder:${tag}] chunk error:`, r.reason);
      }
    }

    // topic[2] = beneficiary (indexed address, left-padded to 32 bytes).
    // Strip the 12-byte pad → 20-byte address, lowercase via dedupeAddresses.
    const beneficiaries: string[] = [];
    for (const log of rawLogs) {
      const t2 = log.topics[2];
      if (typeof t2 === "string" && t2.length === 66) {
        beneficiaries.push(`0x${t2.slice(26)}`);
      }
    }

    const recipients = dedupeAddresses(beneficiaries).slice(0, limit);
    console.log(`[seeder:${tag}] scanned ${chunks.length} chunks (blocks ${fromBlock}..${latestBlock}), ${rawLogs.length} VestingCreated → ${recipients.length} unique recipients`);
    return recipients;
  } catch (err) {
    console.error(`[seeder:${tag}] discovery failed:`, err);
    return [];
  }
}

function dedupeAddresses(addresses: string[]): string[] {
  // Ecosystem-aware normalisation — EVM addresses get lowercased, Solana
  // base58 pubkeys are preserved (they're case-sensitive, lowercasing
  // corrupts them). normaliseAddress handles the branch.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    if (!raw) continue;
    const norm = normaliseAddress(raw);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export interface SeedJob {
  adapterId: string;
  chainId:   SupportedChainId;
  /** Discovery fn — produces up to `limit` recipients for this (adapter, chain) pair. */
  discover:  (chainId: SupportedChainId, limit: number) => Promise<string[]>;
}

export type SeedMode = "incremental" | "deep";

function limitFor(mode: SeedMode): number {
  return mode === "deep" ? DEEP_SEED_LIMIT : SEED_LIMIT;
}

/**
 * Workload partitions for the seed-cache fan-out pattern. Each group is
 * meant to fit comfortably inside a single 300s function invocation. The
 * /api/cron/seed-cache route fires three background fetches in parallel —
 * one per group — so no single invocation has to budget for everything.
 *
 * Group rationale:
 *   - "heavy"     PinkSale × 4 chains. The slowest workload by far —
 *                 paginated multicall against `getUserNormalLockAtIndex`,
 *                 plus large discovery wallet lists. Used to time the
 *                 entire seedAll out by itself.
 *   - "solana"    Streamflow + Jupiter Lock. Throttled to 4 concurrent
 *                 calls vs Helius free CU/s — predictable but not fast.
 *                 Isolated so a Helius rate-limit can't starve EVM jobs.
 *   - "subgraphs" UNCX / UNCX-VM / Unvest / LlamaPay. Mostly The Graph
 *                 subgraph queries; 14 jobs, well under 300s.
 *   - "hedgey"   Hedgey × 7 chains. ERC721Enumerable multicall discovery
 *                 is slow and was reliably starving the tail of "subgraphs".
 *                 Own group gives Hedgey a full 300s budget.
 */
// 2026-06-02: "solana" group split into "streamflow" + "solana" (Jupiter Lock only).
// When both Streamflow and Jupiter Lock shared the "solana" group they ran in
// parallel (PARALLEL=6), both hitting Helius simultaneously (if SOLANA_RPC_URL
// points to Helius). Combined traffic saturated Helius's free-tier CU/s limit
// causing sustained 429 storms and Vercel 300s timeouts. Running sequentially
// in separate cron jobs with a 30-min gap eliminates the contention.
// Streamflow runs daily; Jupiter Lock every 2 days.
export type SeedGroup = "heavy" | "solana" | "streamflow" | "subgraphs" | "sablier" | "superfluid" | "hedgey" | "team-finance" | "unvest";

export const SEED_GROUPS: readonly SeedGroup[] = ["heavy", "solana", "streamflow", "subgraphs", "sablier", "superfluid", "hedgey", "team-finance", "unvest"] as const;

function groupFor(adapterId: string): SeedGroup {
  if (adapterId === "pinksale")      return "heavy";
  if (adapterId === "streamflow")    return "streamflow"; // own group — runs daily, separate from JL
  if (adapterId === "jupiter-lock") return "solana";      // "solana" group = Jupiter Lock only
  if (adapterId === "sablier")       return "sablier";
  // 2026-05-28: sablier-flow moved from "subgraphs" to "sablier" group.
  // Both adapters use the same Envio Hasura endpoint and have comparable
  // runtime profiles. With sablier-flow × 6 chains in "subgraphs", that
  // group had 27 jobs — enough to reliably time out at Vercel's 300s hard
  // limit, leaving UNCX/Unvest with stale data. Moving here costs the
  // sablier group ~10–15s extra and drops subgraphs from 27 to 21 jobs,
  // giving UNCX/Unvest/Hedgey comfortable headroom.
  if (adapterId === "sablier-flow")  return "sablier";
  // 2026-05-26: Superfluid split out of "subgraphs" into its own group.
  // Reason: Superfluid runs across 6 chains (ETH/BSC/Polygon/Base/Arb/Op),
  // each calling its own hosted subgraph endpoint. When sharing the
  // 300s "subgraphs" budget with Hedgey + UNCX + UNCX-VM + Unvest,
  // Superfluid's last 3 chains (Base/Arbitrum/Optimism) consistently
  // got starved out — observed 2026-05-26 with those 3 chains stuck
  // at 10d stale while ETH/BSC/Polygon refreshed normally. Own group
  // gives Superfluid a full 300s for all 6 chains.
  if (adapterId === "superfluid") return "superfluid";
  // 2026-05-28: Hedgey split out of "subgraphs" into its own group.
  // Hedgey discovery uses ERC721Enumerable multicall reads (HEDGEY_PAGE_SIZE=100)
  // which are significantly slower than pure subgraph queries. With 7 chains
  // (ETH/BSC/Polygon/Base/Arbitrum/Optimism/Sepolia) at the tail of the 21-job
  // "subgraphs" run, Hedgey was consistently getting cut off at the 300s limit.
  // Moving here gives Hedgey its own full 300s budget and drops "subgraphs"
  // from 21 → 14 jobs — comfortable headroom for UNCX/Unvest/LlamaPay.
  if (adapterId === "hedgey") return "hedgey";
  // 2026-07-13: Team Finance split out of "subgraphs" into its own group.
  // TF was added back to "subgraphs" with the June re-enable + Avalanche work
  // (5 chains: ETH/BSC/Polygon/Avax/Sepolia). That pushed the group back over
  // its 300s budget and starved TF at the tail — Unvest (earlier in the group)
  // stayed fresh while TF ETH/BSC/Polygon aged to 2-3 days. Same failure mode
  // that split out Superfluid/Hedgey/Sablier-Flow. Own group = own 300s budget.
  if (adapterId === "team-finance") return "team-finance";
  // 2026-07-13: Unvest split out of "subgraphs" too. seeder_state showed the
  // subgraphs group was timing out mid-Unvest — ETH/BSC/Polygon/Base ran daily
  // but Arbitrum + Optimism (the last two Unvest jobs) hadn't been ATTEMPTED in
  // ~17 days. Splitting TF out doesn't help those two (they die before TF in the
  // order), so Unvest needs its own 300s budget for all 6 chains. Leaves
  // "subgraphs" as just UNCX + UNCX-VM + LlamaPay — comfortably under budget.
  if (adapterId === "unvest") return "unvest";
  return "subgraphs";
}

function isSeedGroup(s: string): s is SeedGroup {
  return (SEED_GROUPS as readonly string[]).includes(s);
}

export function parseSeedGroup(raw: string | null | undefined): SeedGroup | null {
  if (!raw) return null;
  return isSeedGroup(raw) ? raw : null;
}

export interface SeedRunResult {
  adapterId:            string;
  chainId:              number;
  recipientsDiscovered: number;
  /** Streams returned by adapter.fetch(). Upper bound — not every fetched stream
   *  necessarily landed in the cache (see `streamsWritten`). */
  streamsFetched:       number;
  /** Streams that actually made it into the DB (post-dedupe, post-upsert). */
  streamsWritten:       number;
  /** Number of batches that threw during fetch(). */
  batchFetchErrors:     number;
  /** Number of batches where writeToCache returned 0 despite having streams to write. */
  batchWriteErrors:     number;
  /** Present only if the entire job failed (e.g. discover threw, adapter missing). */
  error?:               string;
}

// Job ordering matters because seedAll runs jobs in batches of 3 with
// Promise.all. If the lambda hits its 300s budget mid-run, late jobs
// don't execute. Order chosen by priority (most-impactful protocols
// first) and by failure-mode visibility (cheap-to-fail Solana protocols
// up front so a Solana RPC issue is detected within seconds, not at
// minute-5 of the run).
//
// Apr 29 2026 reorder: heavy protocols (PinkSale × 4 chains, Solana ×
// 2 programs) moved to the FRONT after the Apr 29 deep-seed timeout
// at 16:53:38 UTC reached only the lighter protocols and orphaned
// these. Lighter, faster protocols (Sablier, Hedgey, etc.) are now
// the buffer at the end — if THEY get partially seeded, that's fine;
// they re-fetch on the next cron tick and the data quality stays
// high because they have subgraphs (vs the contract-read protocols
// where every cron run is a fresh enumeration).
const SEED_JOBS: SeedJob[] = [
  // ─── HIGH PRIORITY (most-impactful, most-broken) ───
  // PinkSale — four mainnets (curated wallet list; see seed-wallets.ts).
  // Adapter doesn't support Sepolia. Contract-read enumeration; can be
  // slow on BSC due to data volume but completes within budget alone.
  { adapterId: "pinksale",     chainId: CHAIN_IDS.ETHEREUM, discover: discoverPinksaleRecipients },
  { adapterId: "pinksale",     chainId: CHAIN_IDS.BSC,      discover: discoverPinksaleRecipients },
  { adapterId: "pinksale",     chainId: CHAIN_IDS.POLYGON,  discover: discoverPinksaleRecipients },
  { adapterId: "pinksale",     chainId: CHAIN_IDS.BASE,     discover: discoverPinksaleRecipients },
  // Streamflow + Jupiter Lock — Solana mainnet only. Guarded at adapter
  // level by SOLANA_ENABLED flag; safe to list unconditionally because
  // their discover fns return [] when the flag is off.
  { adapterId: "streamflow",    chainId: CHAIN_IDS.SOLANA,   discover: discoverStreamflowRecipients },
  // Jupiter Lock per-stream seed — RE-ENABLED 2026-05-11 via the bulk-
  // fetch path (runJupiterLockViaBulkFetch in this file). That path does
  // ONE getProgramAccounts call (~30s) instead of 44k per-recipient
  // fetches, so it fits inside the 300s seed budget even on free-tier
  // Solana RPCs that don't disable getProgramAccounts.
  //
  // History: this entry was commented out 2026-05-06 when SOLANA_RPC_URL
  // pointed at Helius free tier, which rate-limited the per-recipient
  // fan-out. The 2026-05-11 fix had two parts:
  //   1. SOLANA_RPC_URL repointed at Alchemy Solana (free tier supports
  //      getProgramAccounts; previously assumed Helius was the only
  //      free option that did).
  //   2. SEED_JOBS uncommented (this line) — runJob dispatches to
  //      runJupiterLockViaBulkFetch for jupiter-lock and never calls
  //      the discover function for the per-recipient path.
  //
  // If the bulk fetch starts failing again (Alchemy free-tier limits
  // tightened, getProgramAccounts rate-limited, etc.), comment this
  // single line back out — JL TVL display still works because the TVL
  // walker uses its own separate daily cron path.
  { adapterId: "jupiter-lock",  chainId: CHAIN_IDS.SOLANA,   discover: discoverJupiterLockRecipients },

  // ─── STANDARD (subgraph-based, generally fast and reliable) ───
  // Sablier — ETH, BSC, Polygon, Base + Sepolia (testnet). Single Envio
  // endpoint; Sepolia is filtered in-query via the chainId variable.
  { adapterId: "sablier",      chainId: CHAIN_IDS.ETHEREUM, discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.BSC,      discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.POLYGON,  discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.BASE,     discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.ARBITRUM, discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.OPTIMISM, discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.SEPOLIA,  discover: discoverSablierRecipients },
  // ── Worker-pivot stream protocols (LlamaPay + Sablier Flow) ──
  // Promoted to run BEFORE Hedgey because the Hedgey discovery path
  // can eat the 300s subgraphs budget when one or more chains hit the
  // multicall pagination failure mode. Stream-category cells were
  // showing Pending forever as a result. Both adapters are
  // single-endpoint subgraph queries (fast — ~1-2s per chain), so
  // putting them up front costs the run almost nothing if they were
  // previously fitting inside the budget.
  // LlamaPay: BSC / Polygon / Base / Arbitrum subgraphs dropped May 5 2026
  // — "subgraph not found: no allocations" / "bad indexers" on The Graph
  // network. Adapter's SUPPORTED_CHAINS in llamapay.ts is the source of
  // truth — these SEED_JOBS must match. Adding chains back here without
  // re-enabling SUBGRAPH_IDS in the adapter produces noisy 0-result jobs
  // every run (logs from 2026-05-13 03:00 UTC cron showed this).
  { adapterId: "llamapay",     chainId: CHAIN_IDS.ETHEREUM, discover: discoverLlamapayRecipients },
  { adapterId: "llamapay",     chainId: CHAIN_IDS.OPTIMISM, discover: discoverLlamapayRecipients },
  { adapterId: "sablier-flow", chainId: CHAIN_IDS.ETHEREUM, discover: discoverSablierFlowRecipients },
  { adapterId: "sablier-flow", chainId: CHAIN_IDS.BSC,      discover: discoverSablierFlowRecipients },
  { adapterId: "sablier-flow", chainId: CHAIN_IDS.POLYGON,  discover: discoverSablierFlowRecipients },
  { adapterId: "sablier-flow", chainId: CHAIN_IDS.BASE,     discover: discoverSablierFlowRecipients },
  { adapterId: "sablier-flow", chainId: CHAIN_IDS.ARBITRUM, discover: discoverSablierFlowRecipients },
  { adapterId: "sablier-flow", chainId: CHAIN_IDS.OPTIMISM, discover: discoverSablierFlowRecipients },
  // UNCX (TokenVesting V3) — ETH/BSC/Base + Sepolia. Polygon subgraph is
  // deprecated; skipping until a replacement publishes.
  { adapterId: "uncx",         chainId: CHAIN_IDS.ETHEREUM, discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.BSC,      discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.POLYGON,  discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.BASE,     discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.SEPOLIA,  discover: discoverUncxRecipients },
  // UNCX VestingManager — ETHEREUM ONLY.
  //
  // BSC + Base were dropped Apr 29 2026 because dRPC's free tier no
  // longer serves eth_getLogs on those chains at all (every chunk
  // returned "Request timeout on the free tier, please upgrade your
  // tier to the paid one"). Spending lambda budget on doomed chunks
  // wasted 30-60s and pushed the late protocols (PinkSale, Solana)
  // past the 300s deadline. Re-add when we're on paid dRPC or when
  // BSC_RPC_URL/ALCHEMY_RPC_URL_BASE env vars get set (currently
  // intentionally absent — see CLAUDE.md landmine note).
  //
  // ETH still works because dRPC ETH free-tier doesn't have the same
  // restriction yet, and our non-env fallback for ETH is publicnode.
  { adapterId: "uncx-vm",      chainId: CHAIN_IDS.ETHEREUM, discover: discoverUncxVmRecipients },
  // Unvest — four mainnets. Sepolia subgraph URL is undefined in the
  // adapter; adding a job would just log "0 recipients discovered" on every
  // run. Omitting keeps the summary cleaner.
  { adapterId: "unvest",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.BSC,      discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.POLYGON,  discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.BASE,     discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.ARBITRUM, discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.OPTIMISM, discover: discoverUnvestRecipients },
  // Superfluid — four mainnets. Its hosted subgraph endpoints don't include
  // a Sepolia deployment, so no testnet job.
  { adapterId: "superfluid",   chainId: CHAIN_IDS.ETHEREUM, discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.BSC,      discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.POLYGON,  discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.BASE,     discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.ARBITRUM, discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.OPTIMISM, discover: discoverSuperfluidRecipients },
  // Team Finance — ETH/BSC/Polygon + Sepolia (Squid GraphQL, different stack).
  // Base dropped 2026-07-06: TF's Squid indexes zero Base vestings, so there's
  // nothing to discover there; re-add if TF starts indexing Base upstream.
  { adapterId: "team-finance", chainId: CHAIN_IDS.ETHEREUM, discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.BSC,      discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.POLYGON,  discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.AVALANCHE, discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.SEPOLIA,  discover: discoverTeamFinanceRecipients },
  // Hedgey — four mainnets + Sepolia (ERC721Enumerable reads via Multicall3).
  { adapterId: "hedgey",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.BSC,      discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.POLYGON,  discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.BASE,     discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.ARBITRUM, discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.OPTIMISM, discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.SEPOLIA,  discover: discoverHedgeyRecipients },
  // (LlamaPay + Sablier Flow moved up to the top of STANDARD — they
  // were timing out at the tail of the run when Hedgey's slower
  // discovery path consumed the 300s subgraphs budget.)
  // (PinkSale + Streamflow + Jupiter Lock moved to the FRONT of this list
  // — see "HIGH PRIORITY" block above. Apr 29 2026 reorder.)
];

/** How many recipients to feed into a single adapter.fetch() call. */
const BATCH_SIZE = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function emptyResult(job: SeedJob, error?: string): SeedRunResult {
  return {
    adapterId:            job.adapterId,
    chainId:              job.chainId,
    recipientsDiscovered: 0,
    streamsFetched:       0,
    streamsWritten:       0,
    batchFetchErrors:     0,
    batchWriteErrors:     0,
    ...(error ? { error } : {}),
  };
}

/**
 * PinkSale dedicated seed path: bypass per-wallet adapter, use walker
 * directly. The walker's `fetchPinkSaleAllLocks` returns every active
 * lock + token metadata in one pass (token-side enumeration via
 * `getLocksForToken`). Locks are converted into VestingStream rows with
 * the same math the per-wallet adapter uses (computeStepVesting on
 * tgeBps/cycleBps schedules) and written to vesting_streams_cache.
 *
 * Why we needed this: see runJob's pinksale branch comment.
 */
async function runPinkSaleViaWalker(job: SeedJob): Promise<SeedRunResult> {
  const tag = `pinksale/${job.chainId}`;
  const result = await fetchPinkSaleAllLocks(job.chainId).catch((err) => {
    console.error(`[seeder:${tag}] walker fetch threw:`, err);
    return null;
  });
  if (!result) {
    return emptyResult(job, "walker returned null (no contract or RPC dead)");
  }

  const { locks, tokenMeta, errors } = result;
  console.log(
    `[seeder:${tag}] walker returned ${locks.length} active locks across ${tokenMeta.size} tokens (${errors.length} non-fatal errors)`,
  );
  if (locks.length === 0) {
    return emptyResult(job);
  }

  // Convert raw walker locks → VestingStream[] using the adapter's
  // shared helper. Identical schedule math; the only difference vs the
  // adapter's per-wallet path is the SOURCE of the locks (token-side
  // vs owner-side).
  const streams = pinksaleLocksToStreams(locks, tokenMeta, job.chainId);
  if (streams.length === 0) {
    return emptyResult(job);
  }

  // Write in chunks so a single BATCH_SIZE-sized write failure (e.g.
  // a single bad token amount triggering a Postgres numeric overflow)
  // doesn't cost us the whole walk.
  let streamsWritten   = 0;
  let batchWriteErrors = 0;
  for (const batch of chunk(streams, BATCH_SIZE)) {
    const written = await writeToCache(batch);
    if (written === 0) {
      batchWriteErrors++;
      console.error(`[seeder:${tag}] batch write failed (${batch.length} streams dropped)`);
      continue;
    }
    streamsWritten += written;
  }

  // Distinct owners — used by the freshness UI and reflects "how many
  // wallets does this protocol×chain touch right now".
  const distinctOwners = new Set(streams.map((s) => s.recipient.toLowerCase())).size;
  console.log(
    `[seeder:${tag}] walker-direct: streams_fetched=${streams.length} streams_written=${streamsWritten} distinct_owners=${distinctOwners}`,
  );
  // Heartbeat: keeps the freshness UI showing "we ran" even if no
  // stream data moved (writeToCache's setWhere optimization skips
  // unchanged rows so MAX(lastRefreshedAt) wouldn't otherwise advance).
  await bumpSeedHeartbeat(job.adapterId, job.chainId);
  return {
    adapterId:            job.adapterId,
    chainId:              job.chainId,
    recipientsDiscovered: distinctOwners,
    streamsFetched:       streams.length,
    streamsWritten,
    batchFetchErrors:     0,
    batchWriteErrors,
  };
}

/**
 * Jupiter Lock dedicated seed path: ONE bulk getProgramAccounts call
 * returns every active escrow on Solana in a single ~30s round-trip.
 * The per-wallet adapter path (44k wallets × 2-filter getProgramAccounts)
 * timed out the 300s budget reliably; this finishes in well under it.
 */
async function runJupiterLockViaBulkFetch(job: SeedJob): Promise<SeedRunResult> {
  const tag = `jupiter-lock/${job.chainId}`;
  const streams = await fetchAllJupiterLockEscrows().catch((err) => {
    console.error(`[seeder:${tag}] bulk fetch threw:`, err);
    return null;
  });
  if (streams === null) {
    // Bump the heartbeat even on failure so the protocols-page freshness
    // UI shows "the seeder ran (and got nothing)" rather than a 26d-old
    // timestamp. The root cause here is usually the Solana RPC provider
    // returning 0 pubkeys for the Jupiter Lock program — see the comment
    // in fetchAllJupiterLockEscrows about Alchemy silently returning [].
    // FIX: set JUPITER_LOCK_RPC_URL to a provider that fully indexes the
    // program (e.g. Helius free tier — the original provider before the
    // May 2026 Alchemy migration). Until then, the heartbeat keeps the
    // staleness display honest ("cron ran, RPC returned nothing").
    await bumpSeedHeartbeat(job.adapterId, job.chainId);
    return emptyResult(job, "bulk fetch returned null (Solana disabled / RPC dead)");
  }
  console.log(`[seeder:${tag}] bulk fetch: ${streams.length} active escrows decoded`);
  if (streams.length === 0) {
    await bumpSeedHeartbeat(job.adapterId, job.chainId);
    return emptyResult(job);
  }

  let streamsWritten   = 0;
  let batchWriteErrors = 0;
  for (const batch of chunk(streams, BATCH_SIZE)) {
    const written = await writeToCache(batch);
    if (written === 0) {
      batchWriteErrors++;
      console.error(`[seeder:${tag}] batch write failed (${batch.length} streams dropped)`);
      continue;
    }
    streamsWritten += written;
  }
  const distinctOwners = new Set(streams.map((s) => s.recipient.toLowerCase())).size;
  console.log(
    `[seeder:${tag}] bulk: streams_fetched=${streams.length} streams_written=${streamsWritten} distinct_owners=${distinctOwners}`,
  );
  await bumpSeedHeartbeat(job.adapterId, job.chainId);
  return {
    adapterId:            job.adapterId,
    chainId:              job.chainId,
    recipientsDiscovered: distinctOwners,
    streamsFetched:       streams.length,
    streamsWritten,
    batchFetchErrors:     0,
    batchWriteErrors,
  };
}

async function runJob(job: SeedJob, limit: number): Promise<SeedRunResult> {
  const tag = `${job.adapterId}/${job.chainId}`;
  const adapter = ADAPTER_REGISTRY.find((a) => a.id === job.adapterId);
  if (!adapter) {
    console.error(`[seeder:${tag}] adapter not registered`);
    return emptyResult(job, "adapter not registered");
  }

  // ── PinkSale special path ──────────────────────────────────────────────────
  // The walker enumerates locks via `getLocksForToken` (token-side data
  // structure) — every active lock, regardless of owner. Going via the
  // per-wallet adapter required `getUserNormalLocksLength(owner)` to be
  // > 0 for each discovered owner, which silently failed for thousands of
  // owners whose locks had withdrawn since discovery (May 6 2026 root
  // cause). Walker → cache directly closes that gap entirely.
  if (job.adapterId === "pinksale") {
    return runPinkSaleViaWalker(job);
  }
  // ── Jupiter Lock special path ──────────────────────────────────────────────
  // 44k+ recipients × per-wallet getProgramAccounts (each with two memcmp
  // filters) overran the 300s seed budget on Helius free even with the
  // group split. Walker-style: ONE bulk getProgramAccounts call returns
  // every active escrow in ~30s, decoded in-process, written to cache
  // in batches.
  if (job.adapterId === "jupiter-lock") {
    return runJupiterLockViaBulkFetch(job);
  }

  let recipients: string[];
  try {
    recipients = await job.discover(job.chainId, limit);
  } catch (err) {
    console.error(`[seeder:${tag}] discover threw:`, err);
    return emptyResult(job, `discover: ${String(err)}`);
  }

  if (recipients.length === 0) {
    // Not an error — empty discovery is legitimate for curated-list adapters
    // (PinkSale) and for chains with no active protocol presence. Log at info
    // level so dashboards can distinguish "empty" from "broken".
    console.log(`[seeder:${tag}] 0 recipients discovered`);
    return emptyResult(job);
  }

  let streamsFetched    = 0;
  let streamsWritten    = 0;
  let batchFetchErrors  = 0;
  let batchWriteErrors  = 0;
  for (const batch of chunk(recipients, BATCH_SIZE)) {
    let streams: Awaited<ReturnType<typeof adapter.fetch>>;
    try {
      streams = await adapter.fetch(batch, job.chainId);
    } catch (err) {
      // Keep going with remaining batches — one bad batch shouldn't sink the whole job
      batchFetchErrors++;
      console.error(`[seeder:${tag}] batch fetch failed:`, err);
      continue;
    }

    if (streams.length === 0) continue;
    streamsFetched += streams.length;

    // writeToCache never throws — it catches internally and returns 0 on
    // failure. A positive return means the batch actually landed in Postgres.
    const written = await writeToCache(streams);
    if (written === 0) {
      batchWriteErrors++;
      // Don't log the error detail here; writeToCache already logged it via
      // `[vesting-cache] write failed:` — this line ties it back to the job.
      console.error(`[seeder:${tag}] batch write failed (${streams.length} streams dropped)`);
      continue;
    }
    streamsWritten += written;
  }

  const errorSuffix =
    (batchFetchErrors || batchWriteErrors)
      ? ` (fetch errors: ${batchFetchErrors}, write errors: ${batchWriteErrors})`
      : "";
  console.log(
    `[seeder:${tag}] discovered ${recipients.length} recipients → fetched ${streamsFetched} streams → wrote ${streamsWritten}${errorSuffix}`,
  );
  // Heartbeat — keeps freshestSec advancing even when stream data hasn't
  // changed (or when the adapter correctly returns 0 streams because all
  // discovered wallets have fully claimed their allocation). Fires whenever
  // we had recipients to try; skipped only when discovery itself returned 0.
  // 2026-05-26: Widened from `streamsFetched > 0` to always-when-recipients.
  // Root cause: team-finance claimants (and similar) often have userTotal=0
  // after claiming, so the adapter returns 0 streams and the heartbeat never
  // fired — making the status page show 25d stale even though the seeder ran.
  await bumpSeedHeartbeat(job.adapterId, job.chainId);
  return {
    adapterId:            job.adapterId,
    chainId:              job.chainId,
    recipientsDiscovered: recipients.length,
    streamsFetched,
    streamsWritten,
    batchFetchErrors,
    batchWriteErrors,
  };
}

/**
 * Seed the cache across every (adapter, chain) pair. Runs jobs in parallel,
 * three at a time, to avoid hammering the subgraph gateway.
 *
 * `mode`:
 *   - `"incremental"` (default) uses SEED_LIMIT recipients per job — the
 *     daily cron pass. Fast, bounded, under the Vercel 300s maxDuration.
 *   - `"deep"` uses DEEP_SEED_LIMIT recipients per job — a much thicker
 *     sweep for filling historical coverage. Expected to take multiple
 *     minutes; run via the `?mode=deep` query parameter on the cron route
 *     (manually or via a separate weekly cron), not on every tick.
 */
export async function seedAll(
  mode:       SeedMode    = "incremental",
  group:      SeedGroup | null = null,
  /** Optional: restrict to a single adapter ID within the group.
   *  Used by the seed-cache route's ?protocol=X param so an operator
   *  can re-seed just one protocol without running the whole group.
   *  Example: group="subgraphs"&protocol="unvest" → only Unvest jobs. */
  protocolId: string | null = null,
): Promise<SeedRunResult[]> {
  const limit    = limitFor(mode);
  // Parallel job count within a single group invocation. Was 3; bumped to
  // 6 May 4 2026 because subgraphs has 30+ jobs (Sablier × 7 chains, LlamaPay
  // × 6, Sablier Flow × 6, etc.) and at PARALLEL=3 the tail jobs (typically
  // Sablier Flow) were getting cut off when Hedgey Polygon's broken multicall
  // ate the 300s budget. Subgraph queries are I/O-bound so doubling
  // concurrency is essentially free; the gateway endpoints handle 6
  // concurrent requests easily and Postgres writes are batched per job.
  const PARALLEL = 6;
  const results: SeedRunResult[] = [];

  // Filter out jobs whose protocol is flagged `disabled: true` in the
  // protocol-constants registry. This is the temporary-pause hatch — see
  // ProtocolMeta.disabled docstring. Disabled adapters make NO outbound
  // calls; their existing cache rows are left in place so re-enabling is a
  // single flag flip + a deep-seed.
  let jobs = SEED_JOBS.filter((j) => {
    const enabled = isAdapterEnabled(j.adapterId);
    if (!enabled) {
      console.log(`[seeder] skipping ${j.adapterId}/${j.chainId} — protocol is disabled`);
    }
    return enabled;
  });

  // Optional group filter.
  if (group) {
    jobs = jobs.filter((j) => groupFor(j.adapterId) === group);
    console.log(`[seeder] running group="${group}" — ${jobs.length} job(s)`);
  }

  // Optional protocol filter — narrows within the group to a single adapter.
  if (protocolId) {
    jobs = jobs.filter((j) => j.adapterId === protocolId);
    console.log(`[seeder] protocol filter="${protocolId}" — ${jobs.length} job(s)`);
  }

  for (let i = 0; i < jobs.length; i += PARALLEL) {
    const batch   = jobs.slice(i, i + PARALLEL);
    const batchR  = await Promise.all(batch.map((j) => runJob(j, limit)));
    results.push(...batchR);
    // Record one seeder_state row per job — success or failure — so the
    // admin /status grid can show "checked Xh ago" for every cell even
    // when discover() returned 0 recipients or the cell has no cache rows
    // yet (the two cases bumpSeedHeartbeat silently misses). Diagnostic
    // only; recordSeederAttempt swallows its own errors.
    await Promise.all(
      batchR.map((r) =>
        recordSeederAttempt(r.adapterId, r.chainId, r.streamsWritten, r.error ?? null),
      ),
    );
  }

  // Materialise the (protocol × chain) rollup into status_summary so
  // /status reads from a small fixed-size table instead of GROUP BY-ing
  // the full vesting_streams_cache. Runs once at the end of each group's
  // seed pass — independent failure mode (logged but doesn't break the
  // seed run, which is what the caller actually asked for).
  try {
    const refreshed = await refreshStatusSummary();
    console.log(`[seeder] status_summary refreshed: ${refreshed.rows} cells`);
  } catch (err) {
    console.error("[seeder] status_summary refresh failed:", err);
  }

  // Same idea for protocol_summaries — drives /protocols/[slug] and the
  // /protocols index page. Migration 0018 introduced the table; before
  // this hook ran for the first time, those pages used to do a slow
  // GROUP BY at render time (5+ seconds for Sablier). Now sub-30ms.
  try {
    const refreshed = await refreshProtocolSummaries();
    console.log(`[seeder] protocol_summaries refreshed: ${refreshed.rows} protocols`);
  } catch (err) {
    console.error("[seeder] protocol_summaries refresh failed:", err);
  }

  return results;
}

/**
 * Lightweight inspection hook — used by the cron route for the response body.
 *
 * The `errors` count is now the sum of:
 *   • job-level errors (adapter missing, discover() threw)
 *   • batch-level fetch errors (adapter.fetch() threw for one sub-batch)
 *   • batch-level write errors (writeToCache returned 0 — e.g. Postgres type
 *     overflow, ON CONFLICT dup, or connection drop)
 *
 * Previously we only surfaced job-level errors, which meant a seed run could
 * log dozens of `[vesting-cache] write failed: value out of range` messages
 * and still return `errors: 0` to the caller. The new definition matches
 * what ops actually needs to know: "did every stream we fetched land in
 * Postgres? if not, how many fell out?".
 */
export function summariseRun(results: SeedRunResult[]): {
  totalRecipients: number;
  totalStreamsFetched: number;
  totalStreamsWritten: number;
  errors: number;
  jobErrors: number;
  batchFetchErrors: number;
  batchWriteErrors: number;
} {
  return results.reduce(
    (acc, r) => {
      const jobErr = r.error ? 1 : 0;
      return {
        totalRecipients:     acc.totalRecipients     + r.recipientsDiscovered,
        totalStreamsFetched: acc.totalStreamsFetched + r.streamsFetched,
        totalStreamsWritten: acc.totalStreamsWritten + r.streamsWritten,
        jobErrors:           acc.jobErrors           + jobErr,
        batchFetchErrors:    acc.batchFetchErrors    + r.batchFetchErrors,
        batchWriteErrors:    acc.batchWriteErrors    + r.batchWriteErrors,
        errors:              acc.errors + jobErr + r.batchFetchErrors + r.batchWriteErrors,
      };
    },
    {
      totalRecipients: 0,
      totalStreamsFetched: 0,
      totalStreamsWritten: 0,
      errors: 0,
      jobErrors: 0,
      batchFetchErrors: 0,
      batchWriteErrors: 0,
    },
  );
}
