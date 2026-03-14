/**
 * Token Vesting Explorer — queries protocol subgraphs by TOKEN ADDRESS
 * (not wallet address) to surface all vesting schedules for a given token globally.
 *
 * Protocols: Sablier V2.1, UNCX TokenVesting V3
 */

import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeLinearVesting,
  computeStepVesting,
  nextUnlockTime,
  nextUnlockTimeForSteps,
} from "./types";
import { resolveSubgraphUrl } from "./graph";

// ─── Sablier subgraph URLs (V2.1 — all mainnet chains) ────────────────────────

const SABLIER_URLS: Partial<Record<SupportedChainId, string | undefined>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(
    process.env.SABLIER_SUBGRAPH_URL_ETH,
    "AvDAMYYHGaEwn9F9585uqq6MM5CfvRtYcb7KjK7LKPCt"
  ),
  [CHAIN_IDS.BSC]: resolveSubgraphUrl(
    process.env.SABLIER_SUBGRAPH_URL_BSC,
    "A8Vc9hi7j45u7P8Uw5dg4uqYJgPo4x1rB4oZtTVaiccK"
  ),
  [CHAIN_IDS.BASE]: resolveSubgraphUrl(
    process.env.SABLIER_SUBGRAPH_URL_BASE ?? process.env.SABLIER_SUBGRAPH_URL,
    "778GfecD9tsyB4xNnz4wfuAyfHU6rqGr79VCPZKu3t2F"
  ),
  [CHAIN_IDS.SEPOLIA]: resolveSubgraphUrl(
    process.env.SABLIER_SUBGRAPH_URL_SEPOLIA,
    "5yDtFSxyRuqyjvGJyyuQhMEW3Uah7Ddy2KFSKVhy9VMa"
  ),
};

const SABLIER_TOKEN_QUERY = `
  query GetStreamsByToken($token: String!, $skip: Int!) {
    streams(
      where: { asset: $token, canceled: false }
      orderBy: depositAmount
      orderDirection: desc
      first: 200
      skip: $skip
    ) {
      id
      subgraphId
      recipient
      asset { id symbol decimals }
      depositAmount
      withdrawnAmount
      startTime
      endTime
      cliff
      cliffTime
      canceled
      cancelable
      category
      tranches { amount endTime }
    }
  }
`;

interface RawSablierStream {
  id: string;
  subgraphId: string;
  recipient: string;
  asset: { id: string; symbol: string; decimals: number };
  depositAmount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
  cliff: boolean | null;
  cliffTime: string | null;
  canceled: boolean;
  cancelable: boolean;
  category: string | null;
  tranches: Array<{ amount: string; endTime: string }> | null;
}

export async function explorerFetchSablier(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const url = SABLIER_URLS[chainId];
  if (!url) return [];

  const token = tokenAddress.toLowerCase();
  const all: RawSablierStream[] = [];
  let skip = 0;

  while (true) {
    let json: { data?: { streams?: RawSablierStream[] }; errors?: unknown };
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: SABLIER_TOKEN_QUERY, variables: { token, skip } }),
        next:    { revalidate: 120 },
      });
      if (!res.ok) break;
      json = await res.json();
    } catch { break; }

    if (json.errors) break;
    const page = json.data?.streams ?? [];
    all.push(...(page as RawSablierStream[]));
    if (page.length < 200) break;
    skip += 200;
  }

  const nowSec = Math.floor(Date.now() / 1000);

  return all.map((raw): VestingStream => {
    const startTime = Number(raw.startTime);
    const endTime   = Number(raw.endTime);
    const cliffTime = raw.cliffTime && Number(raw.cliffTime) > startTime
      ? Number(raw.cliffTime) : null;
    const total     = BigInt(raw.depositAmount);
    const withdrawn = BigInt(raw.withdrawnAmount);

    const isStep      = raw.category === "LockupTranched" && !!raw.tranches?.length;
    const unlockSteps = isStep
      ? raw.tranches!
          .map((t) => ({ timestamp: Number(t.endTime), amount: t.amount }))
          .sort((a, b) => a.timestamp - b.timestamp)
      : undefined;

    let claimableNow: bigint, lockedAmount: bigint, isFullyVested: boolean;
    if (isStep && unlockSteps) {
      ({ claimableNow, lockedAmount, isFullyVested } = computeStepVesting(total, withdrawn, unlockSteps, nowSec));
    } else {
      ({ claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(total, withdrawn, startTime, endTime, nowSec));
    }

    return {
      id:              `sablier-${chainId}-${raw.subgraphId}`,
      protocol:        "sablier",
      chainId,
      recipient:       raw.recipient,
      tokenAddress:    raw.asset.id,
      tokenSymbol:     raw.asset.symbol,
      tokenDecimals:   raw.asset.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  isStep && unlockSteps
        ? nextUnlockTimeForSteps(nowSec, unlockSteps)
        : nextUnlockTime(isFullyVested, nowSec, cliffTime, endTime),
      cancelable:      raw.cancelable,
      shape:           isStep ? "steps" : "linear",
      unlockSteps,
    };
  });
}

// ─── UNCX subgraph URLs ────────────────────────────────────────────────────────

const UNCX_URLS: Partial<Record<SupportedChainId, string | undefined>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_ETH,
    "Dp7Nvr9EESRYJC1sVhVdrRiDU2bxPa8G1Zhqdh4vyHnE"
  ),
  [CHAIN_IDS.BSC]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_BSC,
    "Bq3CVVspv1gunmEhYkAwfRZcMZK5QyaydyCRarCwgE8P"
  ),
  [CHAIN_IDS.BASE]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_BASE,
    "CUQ2qwQcVfivLPF9TsoLaLnJGmPRb3sDYFVRXbtUy78z"
  ),
  [CHAIN_IDS.SEPOLIA]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_SEPOLIA,
    "5foyqAtEVWtcSJX62sMC6fVR7FmetsFy8eYRKRT2E7DU"
  ),
};

const UNCX_TOKEN_QUERY = `
  query GetLocksByToken($token: String!, $skip: Int!) {
    locks(
      where: { token_: { id: $token } }
      orderBy: sharesDeposited
      orderDirection: desc
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

interface RawUNCXLock {
  id: string;
  lockID: string;
  releaseSchedule: "Linear" | "Cliff";
  token: { id: string; symbol: string; decimals: number };
  sharesDeposited: string;
  sharesWithdrawn: string;
  shares: string;
  startEmission: string;
  endEmission: string;
  lockDate: string;
  condition: string;
  owner: { id: string };
}

export async function explorerFetchUNCX(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const url = UNCX_URLS[chainId];
  if (!url) return [];

  const token = tokenAddress.toLowerCase();
  const all: RawUNCXLock[] = [];
  let skip = 0;

  while (true) {
    let json: { data?: { locks?: RawUNCXLock[] }; errors?: unknown };
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: UNCX_TOKEN_QUERY, variables: { token, skip } }),
        next:    { revalidate: 120 },
      });
      if (!res.ok) break;
      json = await res.json();
    } catch { break; }

    if (json.errors) break;
    const page = json.data?.locks ?? [];
    all.push(...(page as RawUNCXLock[]));
    if (page.length < 200) break;
    skip += 200;
  }

  const nowSec = Math.floor(Date.now() / 1000);

  return all.map((raw): VestingStream => {
    const startTime = Number(raw.startEmission) || Number(raw.lockDate);
    const endTime   = Number(raw.endEmission);
    const total     = BigInt(raw.sharesDeposited);
    const withdrawn = BigInt(raw.sharesWithdrawn);
    const isCliff   = raw.releaseSchedule === "Cliff";

    let claimableNow: bigint, lockedAmount: bigint, isFullyVested: boolean;
    let cliffTime: number | null = null;

    if (isCliff) {
      isFullyVested  = nowSec >= endTime;
      const remaining = total > withdrawn ? total - withdrawn : 0n;
      claimableNow   = isFullyVested ? remaining : 0n;
      lockedAmount   = isFullyVested ? 0n : remaining;
      cliffTime      = endTime;
    } else {
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

// ─── Combined fetch (all protocols in parallel) ────────────────────────────────

export async function explorerFetch(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const [sablier, uncx] = await Promise.all([
    explorerFetchSablier(tokenAddress, chainId),
    explorerFetchUNCX(tokenAddress, chainId),
  ]);
  // Deduplicate by stream id (shouldn't overlap, but belt + braces)
  const seen = new Set<string>();
  return [...sablier, ...uncx].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}
