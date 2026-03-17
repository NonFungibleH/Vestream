/**
 * Token Vesting Explorer — queries protocol subgraphs by TOKEN ADDRESS
 * (not wallet address) to surface all vesting schedules for a given token globally.
 *
 * Protocols: Sablier V2.1, UNCX TokenVesting V3, UNCX VestingManager, Team Finance V3
 */

import { createPublicClient, http, erc20Abi, type Hex } from "viem";
import { mainnet, bsc, base } from "viem/chains";
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

// Fallback: no orderBy (in case startEmission is not indexed for token queries)
const UNCX_TOKEN_QUERY_NO_SORT = `
  query GetLocksByTokenNoSort($token: String!, $skip: Int!) {
    locks(
      where: { token_: { id: $token } }
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

async function uncxRunQuery(
  url: string,
  query: string,
  token: string,
  skip: number,
): Promise<{ data?: { locks?: RawUNCXLock[] }; errors?: unknown } | null> {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, variables: { token, skip } }),
      next:    { revalidate: 120 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
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
  // Determine which query to use — try sorted first, fall back to unsorted
  let activeQuery = UNCX_TOKEN_QUERY;

  while (true) {
    const json = await uncxRunQuery(url, activeQuery, token, skip);
    if (!json) break;

    if (json.errors) {
      if (activeQuery === UNCX_TOKEN_QUERY) {
        // Primary query (with orderBy) failed — retry this page without ordering
        console.warn(`[UNCX explorer] sorted query failed on chain ${chainId}, retrying without orderBy:`, json.errors);
        activeQuery = UNCX_TOKEN_QUERY_NO_SORT;
        const json2 = await uncxRunQuery(url, activeQuery, token, skip);
        if (!json2 || json2.errors) {
          console.error(`[UNCX explorer] fallback query also failed on chain ${chainId}:`, json2?.errors);
          break;
        }
        const page2 = json2.data?.locks ?? [];
        all.push(...(page2 as RawUNCXLock[]));
        if (page2.length < 200) break;
        skip += 200;
        continue;
      }
      // Fallback also failed
      console.error(`[UNCX explorer] query failed on chain ${chainId}:`, json.errors);
      break;
    }

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
//
// The TF Squid stores FACTORY-LEVEL vestings (one row per vesting contract,
// not per individual recipient) in `vestingFactoryVestings`.
// Fields: id, address (contract), token, chainId, tokenTotal, claimed, creator.
//
// Individual recipient data isn't available via the Squid; the REST API
// (/api/app/vesting/{wallet}) is per-wallet only.
// For the explorer we surface each factory contract as one aggregate entry.

const TF_SQUID_URL = "https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql";

const TF_EXPLORER_QUERY = `
  query TFExplorerFactoryVestings($token: String!, $chainId: Int!, $skip: Int!) {
    vestingFactoryVestings(
      where: { token_eq: $token, chainId_eq: $chainId }
      limit: 200
      offset: $skip
      orderBy: [tokenTotal_DESC]
    ) {
      id
      address
      token
      chainId
      tokenTotal
      claimed
      creator
    }
  }
`;

interface RawTFFactoryVesting {
  id:         string;
  address:    string;  // vesting contract address
  token:      string;  // token contract address
  chainId:    number;
  tokenTotal: string;  // decimal BigInt string
  claimed:    string;  // decimal BigInt string
  creator:    string;  // wallet that deployed the contract
}

export async function explorerFetchTeamFinance(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const token  = tokenAddress.toLowerCase();
  const all: RawTFFactoryVesting[] = [];
  let skip = 0;

  while (true) {
    let json: { data?: { vestingFactoryVestings?: RawTFFactoryVesting[] }; errors?: unknown };
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

    if (json.errors) {
      console.error("[TF explorer] query failed:", json.errors);
      break;
    }
    const page = json.data?.vestingFactoryVestings ?? [];
    all.push(...(page as RawTFFactoryVesting[]));
    if (page.length < 200) break;
    skip += 200;
  }

  return all
    .map((v): VestingStream | null => {
      let total: bigint, claimed: bigint;
      try {
        total   = BigInt(v.tokenTotal ?? "0");
        claimed = BigInt(v.claimed    ?? "0");
      } catch { return null; }

      if (total === 0n) return null;

      const locked        = total > claimed ? total - claimed : 0n;
      const isFullyVested = locked === 0n;

      // The Squid doesn't expose individual recipients or vesting schedule.
      // We surface each factory contract as one aggregate entry so the explorer
      // can still report total locked / claimed amounts for the token.
      return {
        id:              `team-finance-explorer-${chainId}-${v.id}`,
        protocol:        "team-finance",
        chainId,
        // recipient = the vesting CONTRACT address (not an individual wallet)
        recipient:       v.address,
        tokenAddress:    v.token,
        tokenSymbol:     "",   // not available from factory Squid; page falls back to "TOKEN"
        tokenDecimals:   18,   // not available; amounts shown may be off if token uses other decimals
        totalAmount:     total.toString(),
        withdrawnAmount: claimed.toString(),
        claimableNow:    "0",  // per-recipient amounts not available at factory level
        lockedAmount:    locked.toString(),
        startTime:       0,
        endTime:         0,
        cliffTime:       null,
        isFullyVested,
        nextUnlockTime:  null,
        shape:           "linear" as const,
      };
    })
    .filter(Boolean) as VestingStream[];
}

// ─── UNCX VestingManager explorer ────────────────────────────────────────────
// Queries on-chain logs for VestingCreated events filtered by token address (topic[3]),
// then reads each schedule via getVestingSchedule(vestingId).

const UNCX_VM_EXPLORER_CONTRACTS: Partial<Record<SupportedChainId, {
  address:   `0x${string}`;
  fromBlock: bigint;
  chain:     typeof mainnet | typeof bsc | typeof base;
  getRpcUrl: () => string | undefined;
}>> = {
  [CHAIN_IDS.ETHEREUM]: {
    address:   "0xa98f06312b7614523d0f5e725e15fd20fb1b99f5",
    fromBlock: 23_143_944n,
    chain:     mainnet,
    getRpcUrl: () => process.env.ALCHEMY_RPC_URL_ETH,
  },
  [CHAIN_IDS.BASE]: {
    address:   "0xcb08B6d865b6dE9a5ca04b886c9cECEf70211b45",
    fromBlock: 43_187_425n,
    chain:     base,
    getRpcUrl: () => process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL,
  },
  [CHAIN_IDS.BSC]: {
    address:   "0xEc76C87EAB54217F581cc703DAea0554D825d1Fa",
    fromBlock: 85_818_300n,
    chain:     bsc,
    getRpcUrl: () => process.env.BSC_RPC_URL,
  },
};

// event VestingCreated(uint256 indexed vestingId, address indexed beneficiary, address indexed token, ...)
const UNCX_VM_TOPIC = "0xcfcd2ea84a9e988255710b3adc4919275a012aa72f68b63acf1e9f67296e134f" as Hex;
const UNCX_VM_CHUNK = 49_999n;

const UNCX_VM_SCHEDULE_ABI = [
  {
    name: "getVestingSchedule",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "vestingId", type: "uint256" }],
    outputs: [{
      name: "", type: "tuple",
      components: [
        { name: "token",       type: "address" },
        { name: "creator",     type: "address" },
        { name: "beneficiary", type: "address" },
        { name: "totalAmount", type: "uint256" },
        { name: "isSoft",      type: "bool"    },
        { name: "isNftized",   type: "bool"    },
        { name: "isTopable",   type: "bool"    },
        { name: "released",    type: "uint256" },
        { name: "cancelled",   type: "bool"    },
        { name: "vestingType", type: "uint8"   },
        { name: "tranches",    type: "tuple[]",
          components: [
            { name: "time",   type: "uint256" },
            { name: "amount", type: "uint256" },
          ],
        },
      ],
    }],
  },
] as const;

export async function explorerFetchUNCXVM(
  tokenAddress: string,
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  const config = UNCX_VM_EXPLORER_CONTRACTS[chainId];
  if (!config) return [];
  const rpcUrl = config.getRpcUrl();
  if (!rpcUrl) return [];

  const client  = createPublicClient({ chain: config.chain, transport: http(rpcUrl) });
  const nowSec  = Math.floor(Date.now() / 1000);

  // Pad token address for topic[3] filter
  const paddedToken = `0x${"0".repeat(24)}${tokenAddress.toLowerCase().slice(2)}` as Hex;

  let latestBlock: bigint;
  try { latestBlock = await client.getBlockNumber(); }
  catch { return []; }

  // Chunk log scan
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let from = config.fromBlock; from <= latestBlock; from += UNCX_VM_CHUNK + 1n) {
    chunks.push({ from, to: from + UNCX_VM_CHUNK > latestBlock ? latestBlock : from + UNCX_VM_CHUNK });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawLogs: any[] = [];
  const BATCH = 8;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const results = await Promise.allSettled(
      chunks.slice(i, i + BATCH).map(({ from, to }) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client.getLogs as any)({
          address:   config.address,
          topics:    [UNCX_VM_TOPIC, null, null, paddedToken], // topic[3] = token
          fromBlock: from,
          toBlock:   to,
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") rawLogs.push(...r.value);
      else console.warn(`[UNCX-VM explorer] chunk error chain ${chainId}:`, r.reason);
    }
  }

  // Extract unique vestingIds from topic[1]
  const vestingIds = [...new Set(
    rawLogs
      .map((log) => log.topics?.[1] as Hex | undefined)
      .filter((t): t is Hex => !!t)
      .map((t) => BigInt(t))
  )];

  if (vestingIds.length === 0) return [];

  // Resolve token symbol + decimals
  let tokenSymbol = "TOKEN";
  let tokenDecimals = 18;
  try {
    const [sym, dec] = await Promise.all([
      client.readContract({ address: tokenAddress as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: tokenAddress as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
    ]);
    tokenSymbol   = sym as string;
    tokenDecimals = Number(dec);
  } catch { /* use defaults */ }

  // Batch-fetch schedules
  const scheduleResults = await Promise.allSettled(
    vestingIds.map((vestingId) =>
      client.readContract({
        address:      config.address,
        abi:          UNCX_VM_SCHEDULE_ABI,
        functionName: "getVestingSchedule",
        args:         [vestingId],
      })
    )
  );

  const streams: VestingStream[] = [];

  for (let i = 0; i < scheduleResults.length; i++) {
    const r = scheduleResults[i];
    if (r.status !== "fulfilled") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = r.value as any;
    if (s.cancelled) continue;

    const total    = BigInt(s.totalAmount ?? 0n);
    const released = BigInt(s.released    ?? 0n);
    if (total === 0n) continue;

    const tranches: { time: bigint; amount: bigint }[] = s.tranches ?? [];
    const unlockSteps = tranches
      .map((t) => ({ timestamp: Number(t.time), amount: t.amount.toString() }))
      .sort((a, b) => a.timestamp - b.timestamp);

    let claimableNow: bigint, lockedAmount: bigint, isFullyVested: boolean;
    let startTime = 0, endTime = 0, cliffTime: number | null = null;

    if (unlockSteps.length > 0) {
      startTime = unlockSteps[0].timestamp;
      endTime   = unlockSteps[unlockSteps.length - 1].timestamp;
      ({ claimableNow, lockedAmount, isFullyVested } = computeStepVesting(total, released, unlockSteps, nowSec));
    } else {
      // Linear fallback (vestingType === 0)
      isFullyVested  = released >= total;
      const remaining = total > released ? total - released : 0n;
      claimableNow   = isFullyVested ? remaining : 0n;
      lockedAmount   = isFullyVested ? 0n : remaining;
    }

    streams.push({
      id:              `uncx-vm-${chainId}-${vestingIds[i].toString()}`,
      protocol:        "uncx-vm",
      chainId,
      recipient:       (s.beneficiary as string).toLowerCase(),
      tokenAddress:    tokenAddress.toLowerCase(),
      tokenSymbol,
      tokenDecimals,
      totalAmount:     total.toString(),
      withdrawnAmount: released.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  unlockSteps.length > 0
        ? nextUnlockTimeForSteps(nowSec, unlockSteps)
        : nextUnlockTime(isFullyVested, nowSec, null, endTime),
      shape:       unlockSteps.length > 0 ? "steps" : "linear",
      unlockSteps: unlockSteps.length > 0 ? unlockSteps : undefined,
    });
  }

  return streams;
}

// ─── Combined fetch (all protocols in parallel) ────────────────────────────────

export async function explorerFetch(
  tokenAddress: string,
  chainId: SupportedChainId
): Promise<VestingStream[]> {
  const [sablier, uncx, uncxVm, teamFinance] = await Promise.all([
    explorerFetchSablier(tokenAddress, chainId),
    explorerFetchUNCX(tokenAddress, chainId),
    explorerFetchUNCXVM(tokenAddress, chainId),
    explorerFetchTeamFinance(tokenAddress, chainId),
  ]);
  // Deduplicate by stream id (shouldn't overlap, but belt + braces)
  const seen = new Set<string>();
  return [...sablier, ...uncx, ...uncxVm, ...teamFinance].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}
