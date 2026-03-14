/**
 * Token Vesting Explorer — queries protocol subgraphs by TOKEN ADDRESS
 * (not wallet address) to surface all vesting schedules for a given token globally.
 *
 * Protocols: Sablier V2.1, UNCX TokenVesting V3, Team Finance V3
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

// ─── Team Finance subgraph (Squid) ────────────────────────────────────────────

const TF_SQUID_URL = "https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql";

// The Squid entity name may vary; we attempt both common names defensively.
const TF_EXPLORER_QUERY = `
  query TFExplorerVestings($token: String!, $chainId: Int!, $skip: Int!) {
    vestings(
      where: { token_eq: $token, chainId_eq: $chainId }
      limit: 200
      offset: $skip
      orderBy: [id_ASC]
    ) {
      id
      address
      beneficiary
      token
      tokenSymbol
      tokenDecimals
      userTotal
      start
      end
      percentageOnStart
      revocable
      chainId
    }
  }
`;

interface RawTFVesting {
  id:                string;
  address:           string;
  beneficiary:       string;  // recipient wallet
  token:             string;
  tokenSymbol:       string;
  tokenDecimals:     number;
  userTotal:         string;  // hex bigint e.g. "0x083d6c7aab63600000"
  start:             number;
  end:               number;
  percentageOnStart: number;
  revocable:         boolean;
  chainId:           number;
}

export async function explorerFetchTeamFinance(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const token  = tokenAddress.toLowerCase();
  const all: RawTFVesting[] = [];
  let skip = 0;

  while (true) {
    let json: { data?: { vestings?: RawTFVesting[] }; errors?: unknown };
    try {
      const res = await fetch(TF_SQUID_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: TF_EXPLORER_QUERY, variables: { token, chainId, skip } }),
        next:    { revalidate: 120 },
      });
      if (!res.ok) break;
      json = await res.json();
    } catch { break; }

    // If the schema doesn't have this entity the Squid returns a GraphQL error — bail out gracefully
    if (json.errors) break;
    const page = json.data?.vestings ?? [];
    all.push(...(page as RawTFVesting[]));
    if (page.length < 200) break;
    skip += 200;
  }

  const nowSec = Math.floor(Date.now() / 1000);

  return all
    .map((v): VestingStream | null => {
      const startTime = Number(v.start)  || 0;
      const endTime   = Number(v.end)    || 0;
      if (!v.userTotal || !endTime || !v.beneficiary) return null;

      let total: bigint;
      try {
        total = BigInt(v.userTotal);
      } catch { return null; }

      const pct          = typeof v.percentageOnStart === "number" && isFinite(v.percentageOnStart)
        ? v.percentageOnStart : 0;
      const bps          = BigInt(Math.round(pct * 100));
      const initialUnlock = (total * bps) / 10000n;
      const linearPortion = total - initialUnlock;

      let vested: bigint;
      if (nowSec < startTime || endTime <= startTime) {
        vested = 0n;
      } else if (nowSec >= endTime) {
        vested = total;
      } else {
        const elapsed  = BigInt(nowSec - startTime);
        const duration = BigInt(endTime - startTime);
        vested = initialUnlock + (linearPortion * elapsed) / duration;
      }

      const claimableNow  = vested > 0n ? vested : 0n; // explorer: no withdrawn data from Squid
      const lockedAmount  = total > vested ? total - vested : 0n;
      const isFullyVested = vested >= total;

      return {
        id:              `team-finance-${chainId}-${v.address}-${v.beneficiary.toLowerCase()}`,
        protocol:        "team-finance",
        chainId,
        recipient:       v.beneficiary,
        tokenAddress:    v.token,
        tokenSymbol:     v.tokenSymbol     ?? "???",
        tokenDecimals:   v.tokenDecimals   ?? 18,
        totalAmount:     total.toString(),
        withdrawnAmount: "0",
        claimableNow:    claimableNow.toString(),
        lockedAmount:    lockedAmount.toString(),
        startTime,
        endTime,
        cliffTime:       null,
        isFullyVested,
        nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, null, endTime),
        cancelable:      v.revocable,
        shape:           "linear",
      };
    })
    .filter(Boolean) as VestingStream[];
}

// ─── Combined fetch (all protocols in parallel) ────────────────────────────────

export async function explorerFetch(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const [sablier, uncx, teamFinance] = await Promise.all([
    explorerFetchSablier(tokenAddress, chainId),
    explorerFetchUNCX(tokenAddress, chainId),
    explorerFetchTeamFinance(tokenAddress, chainId),
  ]);
  // Deduplicate by stream id (shouldn't overlap, but belt + braces)
  const seen = new Set<string>();
  return [...sablier, ...uncx, ...teamFinance].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}
