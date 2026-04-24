import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeLinearVesting,
  nextUnlockTime,
} from "../types";
import { resolveSubgraphUrl } from "../graph";

// ─── Subgraph URLs ─────────────────────────────────────────────────────────────
// Each chain falls back to building the URL from GRAPH_API_KEY + bare subgraph ID.
const SUBGRAPH_URLS: Record<SupportedChainId, string | undefined> = {
  // Ethereum mainnet — UNCX TokenVesting V3
  [CHAIN_IDS.ETHEREUM]:     resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_ETH,
                              "Dp7Nvr9EESRYJC1sVhVdrRiDU2bxPa8G1Zhqdh4vyHnE"
                            ),
  [CHAIN_IDS.BSC]:          resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_BSC,
                              "Bq3CVVspv1gunmEhYkAwfRZcMZK5QyaydyCRarCwgE8P"
                            ),
  // Polygon: the previously-used hosted subgraph ID
  // (Ln3stVsr8YYQ7YDQf3LhMV4gUaBQWbis5db5hzHgkMD) was deprecated — The Graph
  // gateway now responds with `subgraph not found: no allocations`, meaning
  // no indexer is picking it up. UNCX has not published a replacement at the
  // time of writing, so we skip Polygon by default rather than 404 every
  // seed run. Set UNCX_SUBGRAPH_URL_POLYGON when a new one becomes available.
  [CHAIN_IDS.POLYGON]:      resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_POLYGON,
                              undefined,
                            ),
  [CHAIN_IDS.BASE]:         resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_BASE,
                              "CUQ2qwQcVfivLPF9TsoLaLnJGmPRb3sDYFVRXbtUy78z"
                            ),
  // Sepolia testnet — UNCX Vesting V1
  [CHAIN_IDS.SEPOLIA]:      resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_SEPOLIA,
                              "5foyqAtEVWtcSJX62sMC6fVR7FmetsFy8eYRKRT2E7DU"
                            ),
  [CHAIN_IDS.BASE_SEPOLIA]: undefined, // UNCX is on Sepolia, not Base Sepolia
};

// ─── GraphQL query ─────────────────────────────────────────────────────────────
// The V3 schema uses `locks` (not `tokenVestings`) with `owner { id }` (not
// `recipient`). The `releaseSchedule` enum distinguishes Linear from Cliff locks.
const LOCKS_QUERY = `
  query GetLocks($owners: [String!]!, $skip: Int!) {
    locks(
      where: { owner_: { id_in: $owners } }
      orderBy: startEmission
      orderDirection: asc
      first: 200
      skip: $skip
    ) {
      id
      lockID
      releaseSchedule
      token { id symbol decimals }
      sharesDeposited
      sharesWithdrawn
      shares
      startEmission
      endEmission
      lockDate
      condition
      owner { id }
    }
  }
`;

interface RawLock {
  id:              string;
  lockID:          string;
  releaseSchedule: "Linear" | "Cliff";
  token:           { id: string; symbol: string; decimals: number };
  sharesDeposited: string;
  sharesWithdrawn: string;
  shares:          string;
  startEmission:   string;
  endEmission:     string;
  lockDate:        string;
  condition:       string;   // "0x000…" = no condition (unconditional release)
  owner:           { id: string };
}

// ─── Per-chain fetcher ─────────────────────────────────────────────────────────
async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());
  const all: RawLock[] = [];
  let skip = 0;

  // Paginate — The Graph caps each page at 1 000; we use 200 for safety
  while (true) {
    let json: { data?: { locks?: RawLock[] }; errors?: unknown };
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
        },
        body:    JSON.stringify({
          query:     LOCKS_QUERY,
          variables: { owners: lowercased, skip },
        }),
        next: { revalidate: 60 },
      });
      if (!res.ok) {
        console.error(`UNCX subgraph (chain ${chainId}) HTTP ${res.status}`);
        return [];
      }
      json = await res.json();
    } catch (err) {
      console.error(`UNCX subgraph (chain ${chainId}) fetch error:`, err);
      return [];
    }

    if (json.errors) {
      console.error(`UNCX subgraph (chain ${chainId}) errors:`, json.errors);
      return [];
    }

    const page = json.data?.locks ?? [];
    all.push(...page);
    if (page.length < 200) break;
    skip += 200;
  }

  const nowSec = Math.floor(Date.now() / 1000);

  return all.map((raw): VestingStream => {
    // startEmission is 0 on pure-cliff locks — fall back to lockDate
    const startTime = Number(raw.startEmission) || Number(raw.lockDate);
    const endTime   = Number(raw.endEmission);
    const total     = BigInt(raw.sharesDeposited);
    const withdrawn = BigInt(raw.sharesWithdrawn);
    const isCliff   = raw.releaseSchedule === "Cliff";

    let claimableNow: bigint;
    let lockedAmount: bigint;
    let isFullyVested: boolean;
    let cliffTime: number | null = null;

    if (isCliff) {
      // Cliff: nothing claimable until endEmission, then the full remaining balance unlocks
      isFullyVested  = nowSec >= endTime;
      const remaining = total > withdrawn ? total - withdrawn : 0n;
      claimableNow   = isFullyVested ? remaining : 0n;
      lockedAmount   = isFullyVested ? 0n        : remaining;
      cliffTime      = endTime; // cliff date = unlock date for pure-cliff locks
    } else {
      // Linear: smoothly vests from startEmission → endEmission
      const computed = computeLinearVesting(total, withdrawn, startTime, endTime, nowSec);
      claimableNow   = computed.claimableNow;
      lockedAmount   = computed.lockedAmount;
      isFullyVested  = computed.isFullyVested;
    }

    return {
      id:              `uncx-${chainId}-${raw.lockID}`,
      protocol:        "uncx",
      chainId,
      recipient:       raw.owner.id,
      tokenAddress:    raw.token.id,
      tokenSymbol:     raw.token.symbol,
      tokenDecimals:   raw.token.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, cliffTime, endTime),
    };
  });
}

// ─── Adapter export ────────────────────────────────────────────────────────────
export const uncxAdapter: VestingAdapter = {
  id:   "uncx",
  name: "UNCX Network",
  supportedChainIds: [
    CHAIN_IDS.ETHEREUM,
    CHAIN_IDS.BSC,
    CHAIN_IDS.POLYGON,
    CHAIN_IDS.BASE,
    CHAIN_IDS.SEPOLIA,
  ],
  fetch: fetchForChain,
};
