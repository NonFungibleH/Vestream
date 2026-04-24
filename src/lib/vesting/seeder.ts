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
import { mainnet, bsc, polygon, base, sepolia } from "viem/chains";
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
        "User-Agent":   "Mozilla/5.0 (compatible; TokenVest-Seeder/1.0; +https://vestream.io)",
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
  const all = await paginateDiscover(limit, async (first, skip) => {
    const data = await postGraph<{ vestingClaims?: Array<{ account: string }> }>(
      TEAM_FINANCE_SQUID, query, { chainId, first, skip }, `team-finance/${chainId}`,
    );
    return (data?.vestingClaims ?? []).map((v) => v.account);
  });
  const recipients = dedupeAddresses(all);

  // Team Finance's Squid indexer has no Base data as of writing — verified
  // directly against the endpoint. ETH/BSC/Polygon have tens of thousands
  // of claims each; Base has zero. Not our bug — upstream. Log this
  // distinctly so the next time someone sees "team-finance/8453: 0" they
  // don't waste an hour debugging the query.
  if (recipients.length === 0 && chainId === CHAIN_IDS.BASE) {
    console.log(
      `[seeder:team-finance/${CHAIN_IDS.BASE}] upstream Squid has no indexed claims or vestings for Base; nothing to seed — this will fix itself when Team Finance starts indexing Base`,
    );
  }
  return recipients;
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
  // Sepolia deploys a different address (same bytecode) — mirrors adapters/hedgey.ts.
  [CHAIN_IDS.SEPOLIA]:  "0x68b6986416c7A38F630cBc644a2833A0b78b3631",
};

const VIEM_CHAIN_MAP = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.POLYGON]:  polygon,
  [CHAIN_IDS.BASE]:     base,
  [CHAIN_IDS.SEPOLIA]:  sepolia,
} as const;

function getRpcUrl(chainId: SupportedChainId): string | undefined {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return process.env.ALCHEMY_RPC_URL_ETH;
    case CHAIN_IDS.BSC:      return process.env.BSC_RPC_URL;
    case CHAIN_IDS.POLYGON:  return process.env.POLYGON_RPC_URL;
    case CHAIN_IDS.BASE:     return process.env.ALCHEMY_RPC_URL_BASE;
    case CHAIN_IDS.SEPOLIA:  return process.env.SEPOLIA_RPC_URL;
    default:                 return undefined;
  }
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

async function discoverHedgeyRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const contract = HEDGEY_CONTRACTS[chainId];
  const rpcUrl   = getRpcUrl(chainId);
  if (!contract || !rpcUrl) {
    console.log(`[seeder:hedgey/${chainId}] skipped — RPC env var not configured`);
    return [];
  }

  const chain = VIEM_CHAIN_MAP[chainId as keyof typeof VIEM_CHAIN_MAP];
  if (!chain) return [];

  const tag = `hedgey/${chainId}`;
  try {
    const client = createPublicClient({ chain, transport: http(rpcUrl) });

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

    // Round 1: tokenByIndex(i) for every slot.
    const tokenIdResults = await client.multicall({
      contracts: indices.map((i) => ({
        address: contract,
        abi:     HEDGEY_ENUMERABLE_ABI,
        functionName: "tokenByIndex" as const,
        args:    [BigInt(i)] as const,
      })),
      allowFailure: true,
    });
    const tokenIds = tokenIdResults
      .map((r) => (r.status === "success" ? (r.result as bigint) : null))
      .filter((x): x is bigint => x !== null);

    if (tokenIds.length === 0) {
      console.warn(`[seeder:${tag}] tokenByIndex multicall returned 0 usable tokenIds (totalSupply=${totalSupply})`);
      return [];
    }

    // Round 2: ownerOf(tokenId) for each of those tokenIds.
    const ownerResults = await client.multicall({
      contracts: tokenIds.map((tokenId) => ({
        address: contract,
        abi:     HEDGEY_ENUMERABLE_ABI,
        functionName: "ownerOf" as const,
        args:    [tokenId] as const,
      })),
      allowFailure: true,
    });
    const owners = ownerResults
      .map((r) => (r.status === "success" ? (r.result as string) : null))
      .filter((x): x is string => x !== null);

    const recipients = dedupeAddresses(owners);
    console.log(`[seeder:${tag}] enumerated ${indices.length} slots (of ${totalSupply} total) → ${recipients.length} unique owners`);
    return recipients;
  } catch (err) {
    console.error(`[seeder:${tag}] enumerable read failed:`, err);
    return [];
  }
}

// ─── PinkSale discovery (on-chain event scan) ──────────────────────────────
//
// PinkLock V2 has no subgraph. Prior to this commit the seeder relied on a
// hand-curated wallet list (seed-wallets.ts) which shipped empty at launch
// and required ops to add wallets manually — the /protocols card for
// PinkSale consequently read "no data" indefinitely.
//
// Replaced with a proper event scan mirroring the uncx-vm approach:
//   - LockAdded(uint256 indexed id, address token, address indexed owner, uint256 amount, uint256 unlockDate)
//   - topic[0] = signature hash (precomputed below from viem keccak256)
//   - topic[2] = owner (the indexed address we care about)
// Scan the last PINKSALE_WINDOW blocks in PINKSALE_CHUNK-sized requests,
// parallelised 10 at a time.
//
// The curated list in seed-wallets.ts is UNIONed in as a safety net — if
// event discovery throws or returns zero (RPC outage, topic hash drift, a
// fresh deploy with no locks yet), we still seed whatever ops has
// hand-populated. Zero cost if the list is empty (the default).

const PINKSALE_CONTRACTS_SEEDER: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]: "0x33d4cc8716beb13f814f538ad3b2de3b036f5e2a",
  [CHAIN_IDS.BSC]:      "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe",
  [CHAIN_IDS.POLYGON]:  "0x6C9A0D8B1c7a95a323d744dE30cf027694710633",
  [CHAIN_IDS.BASE]:     "0xdd6e31a046b828cbbafb939c2a394629aff8bbdc",
};

// keccak256("LockAdded(uint256,address,address,uint256,uint256)")
const PINKSALE_LOCK_ADDED_TOPIC =
  "0x694af1cc8727cdd0afbdd53d9b87b69248bd490224e9dd090e788546506e076f" as Hex;

const PINKSALE_CHUNK  = 49_999n;   // PublicNode caps eth_getLogs at 50k blocks
const PINKSALE_WINDOW = 2_000_000n; // ~10 months ETH, ~6 weeks BSC, ~6 weeks Polygon, ~45 days Base

async function discoverPinksaleRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const contract = PINKSALE_CONTRACTS_SEEDER[chainId];
  const rpcUrl   = getRpcUrl(chainId);
  const chain    = VIEM_CHAIN_MAP[chainId as keyof typeof VIEM_CHAIN_MAP];
  const tag      = `pinksale/${chainId}`;

  // Safety-net list (usually empty; populated by ops for emergencies).
  const curated = PINKSALE_SEED_WALLETS[chainId] ?? [];
  // `limit` is used to cap the returned set after dedupe, not the scan window
  // (PinkLock volume is too high to size the window off a recipient count).

  if (!contract || !rpcUrl || !chain) {
    console.log(`[seeder:${tag}] no contract / RPC / chain config; falling back to curated list (${curated.length})`);
    return dedupeAddresses(curated);
  }

  let eventRecipients: string[] = [];
  try {
    const client      = createPublicClient({ chain, transport: http(rpcUrl) });
    const latestBlock = await client.getBlockNumber();
    const fromBlock   = latestBlock > PINKSALE_WINDOW ? latestBlock - PINKSALE_WINDOW : 0n;

    // Build 50k-block chunks.
    const chunks: Array<{ from: bigint; to: bigint }> = [];
    for (let from = fromBlock; from <= latestBlock; from += PINKSALE_CHUNK + 1n) {
      chunks.push({ from, to: from + PINKSALE_CHUNK > latestBlock ? latestBlock : from + PINKSALE_CHUNK });
    }

    // Parallel batches of 10 — matches uncx-vm.
    const BATCH = 10;
    const rawLogs: Array<{ topics: readonly (Hex | null | undefined)[] }> = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch   = chunks.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(({ from, to }) =>
          client.getLogs({
            address:   contract,
            event:     undefined,
            args:      undefined,
            fromBlock: from,
            toBlock:   to,
          }).then((logs) =>
            logs.filter((l) => l.topics[0] === PINKSALE_LOCK_ADDED_TOPIC),
          ),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") rawLogs.push(...r.value);
        else                          console.error(`[seeder:${tag}] chunk error:`, r.reason);
      }
    }

    // topic[2] = owner (indexed address, left-padded to 32 bytes).
    for (const log of rawLogs) {
      const t2 = log.topics[2];
      if (typeof t2 === "string" && t2.length === 66) {
        eventRecipients.push(`0x${t2.slice(26)}`);
      }
    }

    console.log(`[seeder:${tag}] scanned ${chunks.length} chunks (blocks ${fromBlock}..${latestBlock}), ${rawLogs.length} LockAdded → ${eventRecipients.length} raw owners`);
  } catch (err) {
    console.error(`[seeder:${tag}] event scan failed; falling back to curated list:`, err);
    eventRecipients = [];
  }

  // Union event scan + curated safety-net list. dedupeAddresses handles
  // case-normalisation, so overlap is harmless. Cap at `limit` so the deep
  // cron can ask for a bigger sweep than the daily pass.
  return dedupeAddresses([...eventRecipients, ...curated]).slice(0, limit);
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
const UNCX_VM_CHUNK  = 49_999n;  // PublicNode caps eth_getLogs at 50k blocks
const UNCX_VM_WINDOW = 500_000n; // ~69 days ETH, ~11 days BSC, ~11 days Base

async function discoverUncxVmRecipients(chainId: SupportedChainId, limit: number): Promise<string[]> {
  const config = UNCX_VM_CONFIG[chainId];
  const rpcUrl = getRpcUrl(chainId);
  const chain  = VIEM_CHAIN_MAP[chainId as keyof typeof VIEM_CHAIN_MAP];
  if (!config || !rpcUrl || !chain) {
    console.log(`[seeder:uncx-vm/${chainId}] skipped — chain not supported or RPC not configured`);
    return [];
  }

  const tag = `uncx-vm/${chainId}`;
  try {
    const client      = createPublicClient({ chain, transport: http(rpcUrl) });
    const latestBlock = await client.getBlockNumber();
    const fromBlock   = latestBlock > UNCX_VM_WINDOW + config.fromBlock
      ? latestBlock - UNCX_VM_WINDOW
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
    // Stripe the 12-byte pad → 20-byte address, lowercase via dedupeAddresses.
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
  /** Discovery fn — produces up to `limit` recipients for this (adapter, chain) pair. */
  discover:  (chainId: SupportedChainId, limit: number) => Promise<string[]>;
}

export type SeedMode = "incremental" | "deep";

function limitFor(mode: SeedMode): number {
  return mode === "deep" ? DEEP_SEED_LIMIT : SEED_LIMIT;
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

const SEED_JOBS: SeedJob[] = [
  // Sablier — ETH, BSC, Polygon, Base + Sepolia (testnet). Single Envio
  // endpoint; Sepolia is filtered in-query via the chainId variable.
  { adapterId: "sablier",      chainId: CHAIN_IDS.ETHEREUM, discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.BSC,      discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.POLYGON,  discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.BASE,     discover: discoverSablierRecipients },
  { adapterId: "sablier",      chainId: CHAIN_IDS.SEPOLIA,  discover: discoverSablierRecipients },
  // UNCX (TokenVesting V3) — ETH/BSC/Base + Sepolia. Polygon subgraph is
  // deprecated; skipping until a replacement publishes.
  { adapterId: "uncx",         chainId: CHAIN_IDS.ETHEREUM, discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.BSC,      discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.POLYGON,  discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.BASE,     discover: discoverUncxRecipients },
  { adapterId: "uncx",         chainId: CHAIN_IDS.SEPOLIA,  discover: discoverUncxRecipients },
  // UNCX VestingManager — ETH/BSC/Base only (not deployed on Polygon or
  // Sepolia). On-chain event scan via getLogs; see discoverUncxVmRecipients.
  { adapterId: "uncx-vm",      chainId: CHAIN_IDS.ETHEREUM, discover: discoverUncxVmRecipients },
  { adapterId: "uncx-vm",      chainId: CHAIN_IDS.BSC,      discover: discoverUncxVmRecipients },
  { adapterId: "uncx-vm",      chainId: CHAIN_IDS.BASE,     discover: discoverUncxVmRecipients },
  // Unvest — four mainnets. Sepolia subgraph URL is undefined in the
  // adapter; adding a job would just log "0 recipients discovered" on every
  // run. Omitting keeps the summary cleaner.
  { adapterId: "unvest",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.BSC,      discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.POLYGON,  discover: discoverUnvestRecipients },
  { adapterId: "unvest",       chainId: CHAIN_IDS.BASE,     discover: discoverUnvestRecipients },
  // Superfluid — four mainnets. Its hosted subgraph endpoints don't include
  // a Sepolia deployment, so no testnet job.
  { adapterId: "superfluid",   chainId: CHAIN_IDS.ETHEREUM, discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.BSC,      discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.POLYGON,  discover: discoverSuperfluidRecipients },
  { adapterId: "superfluid",   chainId: CHAIN_IDS.BASE,     discover: discoverSuperfluidRecipients },
  // Team Finance — four mainnets + Sepolia (Squid GraphQL, different stack).
  // Note: Base returns 0 because Team Finance's Squid doesn't index Base
  // yet; that's logged distinctly inside the discover fn.
  { adapterId: "team-finance", chainId: CHAIN_IDS.ETHEREUM, discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.BSC,      discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.POLYGON,  discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.BASE,     discover: discoverTeamFinanceRecipients },
  { adapterId: "team-finance", chainId: CHAIN_IDS.SEPOLIA,  discover: discoverTeamFinanceRecipients },
  // Hedgey — four mainnets + Sepolia (ERC721Enumerable reads via Multicall3).
  { adapterId: "hedgey",       chainId: CHAIN_IDS.ETHEREUM, discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.BSC,      discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.POLYGON,  discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.BASE,     discover: discoverHedgeyRecipients },
  { adapterId: "hedgey",       chainId: CHAIN_IDS.SEPOLIA,  discover: discoverHedgeyRecipients },
  // PinkSale — four mainnets (curated wallet list; see seed-wallets.ts).
  // Adapter doesn't support Sepolia.
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

async function runJob(job: SeedJob, limit: number): Promise<SeedRunResult> {
  const tag = `${job.adapterId}/${job.chainId}`;
  const adapter = ADAPTER_REGISTRY.find((a) => a.id === job.adapterId);
  if (!adapter) {
    console.error(`[seeder:${tag}] adapter not registered`);
    return emptyResult(job, "adapter not registered");
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
export async function seedAll(mode: SeedMode = "incremental"): Promise<SeedRunResult[]> {
  const limit    = limitFor(mode);
  const PARALLEL = 3;
  const results: SeedRunResult[] = [];
  for (let i = 0; i < SEED_JOBS.length; i += PARALLEL) {
    const batch   = SEED_JOBS.slice(i, i + PARALLEL);
    const batchR  = await Promise.all(batch.map((j) => runJob(j, limit)));
    results.push(...batchR);
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
