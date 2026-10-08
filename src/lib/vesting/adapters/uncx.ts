import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeLinearVesting,
  nextUnlockTime,
} from "../types";
import { resolveSubgraphUrl } from "../graph";
import { makeFallbackClient } from "../rpc";

// ─── In-app claim contracts (UNCX TokenVesting V3) ───────────────────────────
// The per-chain TokenVesting deployment whose `withdraw(uint256 lockID,
// uint256 shares)` the recipient calls to claim. VERIFIED on-chain 2026-06-17
// (selector scan + impersonated eth_call from a real lock owner against live
// positions; `getWithdrawableTokens(lockID)` matched our cached claimableNow
// within snapshot drift, and a non-owner call reverts with "OWNER"):
//   ETH  0xdba68f07d1b7ca219f78ae8582c213d975c25caf
//   BSC  0xeaed594b5926a7d5fbbc61985390baaf936a6b8d
//   Base 0xa82685520c463a752d5319e6616e4e5fd0215e33
// Claim is owner-only and the shares arg = getWithdrawableShares(lockID)
// computed AT CLAIM TIME (passing uint256.max reverts) — the mobile recipe
// reads it just before the write. Polygon/Arbitrum omitted: their subgraphs
// have no allocations so we don't index claimable locks there.
const UNCX_CLAIM_CONTRACTS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "0xdba68f07d1b7ca219f78ae8582c213d975c25caf",
  [CHAIN_IDS.BSC]:      "0xeaed594b5926a7d5fbbc61985390baaf936a6b8d",
  [CHAIN_IDS.BASE]:     "0xa82685520c463a752d5319e6616e4e5fd0215e33",
};

// ─── Subgraph URLs ─────────────────────────────────────────────────────────────
// Each chain falls back to building the URL from GRAPH_API_KEY + bare subgraph ID.
const SUBGRAPH_URLS: Record<SupportedChainId, string | undefined> = {
  // UNCX is not deployed on Arc. Both entries exist only because this map
  // is exhaustive over SupportedChainId; undefined means "no subgraph".
  [CHAIN_IDS.ARC]:          undefined,
  [CHAIN_IDS.ARC_TESTNET]:  undefined,
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
    [CHAIN_IDS.MONAD]:        undefined,
  [CHAIN_IDS.ZKSYNC]:         undefined,  // UNCX not deployed
  [CHAIN_IDS.BLAST]:          undefined,  // UNCX not deployed
  [CHAIN_IDS.BERACHAIN]:      undefined,  // UNCX not deployed  // UNCX has no Monad deployment
[CHAIN_IDS.SEPOLIA]:      resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_SEPOLIA,
                              "5foyqAtEVWtcSJX62sMC6fVR7FmetsFy8eYRKRT2E7DU"
                            ),
  [CHAIN_IDS.BASE_SEPOLIA]: undefined, // UNCX is on Sepolia, not Base Sepolia
  // Arbitrum: TokenVesting V3 subgraph exists (6WJvVn4AFimpn8JfmeZA17ZWbGkj3c1a4Ate4z3Z7dya)
  // and the contract is live at 0x8cb0300af2a801dc9992225d45399ac56888cbcd.
  // However the subgraph has "no allocations" on the decentralised Graph
  // Network — no indexers are currently serving it (same state as UNCX
  // Polygon). Set UNCX_SUBGRAPH_URL_ARBITRUM to an alternative endpoint
  // (Goldsky mirror, self-hosted, etc.) to enable Arbitrum scanning.
  // Checked 2026-06-01.
  [CHAIN_IDS.ARBITRUM]:     resolveSubgraphUrl(
                              process.env.UNCX_SUBGRAPH_URL_ARBITRUM,
                              undefined,
                            ),
  // Optimism: same status as Arbitrum — TokenVesting V3 subgraph not
  // publicly catalogued. Action to unblock: ask UNCX team.
  [CHAIN_IDS.OPTIMISM]:     undefined,
  [CHAIN_IDS.AVALANCHE]:    undefined, // UNCX has no Avalanche TokenVesting subgraph
  [CHAIN_IDS.ROBINHOOD]:    undefined, // UNCX not on Robinhood Chain
  [CHAIN_IDS.SOLANA]:       undefined, // UNCX does not deploy on Solana
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

// ─── On-chain lock state ───────────────────────────────────────────────────────
//
// The subgraph is wrong after transferLockOwnership / splitLock. On-chain both
// create a NEW lock id and empty the old one, but the subgraph keeps the old
// entity frozen with its pre-transfer shares (so the previous owner still sees
// a full balance) and stamps the new entity's `lockID` with the PARENT's id (so
// an in-app claim would call withdraw(parentId) and revert "OWNER"). Measured
// 2026-10-06: 2,628 such phantom finished locks across ETH/BSC/Base.
//
// So: take the real id from the entity id (locker address + lock id), and
// confirm owner and amounts with the contract's own getLock(), which returns
// TOKEN amounts (the contract's share conversion), not raw shares.

const UNCX_LOCKER_ABI = [{
  type: "function", name: "getLock", stateMutability: "view",
  inputs:  [{ name: "lockId", type: "uint256" }],
  outputs: [
    { name: "lockID",           type: "uint256" },
    { name: "tokenAddress",     type: "address" },
    { name: "tokensDeposited",  type: "uint256" },
    { name: "tokensWithdrawn",  type: "uint256" },
    { name: "sharesDeposited",  type: "uint256" },
    { name: "sharesWithdrawn",  type: "uint256" },
    { name: "startEmission",    type: "uint256" },
    { name: "endEmission",      type: "uint256" },
    { name: "owner",            type: "address" },
    { name: "condition",        type: "address" },
  ],
}] as const;

interface OnChainLock {
  tokensDeposited: bigint;
  tokensWithdrawn: bigint;
  startEmission:   number;
  endEmission:     number;
  owner:           string;
}

/** The real lock id: the subgraph entity id is `${lockerAddress}${lockId}`. */
export function uncxLockIdFromEntity(entityId: string, fallback: string): string {
  const suffix = /^0x[0-9a-fA-F]{40}(\d+)$/.exec(entityId)?.[1];
  return suffix ?? fallback;
}

async function readLocks(chainId: SupportedChainId, ids: string[]): Promise<Map<string, OnChainLock> | null> {
  const locker = UNCX_CLAIM_CONTRACTS[chainId];
  const client = locker ? makeFallbackClient(chainId, { batch: true }) : undefined;
  if (!locker || !client || ids.length === 0) return null;
  const out = new Map<string, OnChainLock>();
  const PAGE = 50; // keep each multicall response under free-RPC caps
  for (let i = 0; i < ids.length; i += PAGE) {
    const page = ids.slice(i, i + PAGE);
    try {
      const res = await client.multicall({
        contracts: page.map((id) => ({
          address: locker as `0x${string}`, abi: UNCX_LOCKER_ABI, functionName: "getLock" as const, args: [BigInt(id)] as const,
        })),
        allowFailure: true,
      });
      page.forEach((id, j) => {
        const r = res[j];
        if (r?.status !== "success") return;
        const v = r.result as readonly [bigint, string, bigint, bigint, bigint, bigint, bigint, bigint, string, string];
        out.set(id, {
          tokensDeposited: v[2], tokensWithdrawn: v[3],
          startEmission: Number(v[6]), endEmission: Number(v[7]),
          owner: v[8].toLowerCase(),
        });
      });
    } catch (err) {
      console.warn(`[uncx] getLock read failed (chain ${chainId}, page ${i}):`, err);
      return null; // fall back to subgraph values rather than show a partial set
    }
  }
  return out;
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
          "User-Agent": "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
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
  const wanted = new Set(lowercased);

  // Real lock ids, de-duplicated (a split can surface the same id twice).
  const withIds = all.map((raw) => ({ raw, lockId: uncxLockIdFromEntity(raw.id, raw.lockID) }));
  const seen = new Set<string>();
  const unique = withIds.filter(({ lockId }) => (seen.has(lockId) ? false : (seen.add(lockId), true)));
  const onChain = await readLocks(chainId, unique.map((u) => u.lockId));

  return unique.flatMap(({ raw, lockId }): VestingStream[] => {
    const live = onChain?.get(lockId);
    // Drop ghosts: the lock now belongs to someone else (transferred/split away).
    if (onChain && (!live || !wanted.has(live.owner))) return [];

    // startEmission is 0 on pure-cliff locks — fall back to lockDate
    const startTime = (live ? live.startEmission : Number(raw.startEmission)) || Number(raw.lockDate);
    const endTime   = live ? live.endEmission : Number(raw.endEmission);
    // On-chain values are token amounts; the subgraph fallback is shares.
    const total     = live ? live.tokensDeposited : BigInt(raw.sharesDeposited);
    const withdrawn = live ? live.tokensWithdrawn : BigInt(raw.sharesWithdrawn);
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

    return [{
      id:              `uncx-${chainId}-${lockId}`,
      protocol:        "uncx",
      category:        "vesting",
      chainId,
      recipient:       live ? live.owner : raw.owner.id,
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
      // In-app claiming: withdraw(lockID, shares) on the per-chain TokenVesting
      // contract; shares are read on-device at claim time. Only set where we
      // have a verified contract (ETH/BSC/Base) — absence ⇒ web-claim fallback.
      claimContract:   UNCX_CLAIM_CONTRACTS[chainId] ?? null,
      claimNativeId:   lockId,
    }];
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
    CHAIN_IDS.ARBITRUM, // subgraph has no allocations, skips silently unless UNCX_SUBGRAPH_URL_ARBITRUM is set
    CHAIN_IDS.SEPOLIA,
  ],
  fetch: fetchForChain,
};
