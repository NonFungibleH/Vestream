import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  nextUnlockTime,
} from "../types";
import { createPublicClient, http } from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";

// ─── Superfluid VestingScheduler ──────────────────────────────────────────────
// Uses Superfluid's own hosted subgraph infrastructure — no GRAPH_API_KEY needed.
// Docs: https://docs.superfluid.finance/docs/protocol/advanced-topics/vesting-scheduler

const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/vesting-scheduler",
  [CHAIN_IDS.BSC]:      "https://subgraph-endpoints.superfluid.dev/bsc-mainnet/vesting-scheduler",
  [CHAIN_IDS.POLYGON]:  "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/vesting-scheduler",
  [CHAIN_IDS.BASE]:     "https://subgraph-endpoints.superfluid.dev/base-mainnet/vesting-scheduler",
};

// ─── viem clients for ERC-20 metadata ─────────────────────────────────────────

function getRpcUrl(chainId: SupportedChainId): string {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return process.env.ALCHEMY_RPC_URL_ETH  ?? "https://ethereum.publicnode.com";
    case CHAIN_IDS.BSC:      return process.env.BSC_RPC_URL           ?? "https://bsc.publicnode.com";
    case CHAIN_IDS.POLYGON:  return process.env.POLYGON_RPC_URL       ?? "https://polygon.publicnode.com";
    case CHAIN_IDS.BASE:     return process.env.ALCHEMY_RPC_URL_BASE  ?? "https://base.publicnode.com";
    default:                 return "https://ethereum.publicnode.com";
  }
}

function getViemChain(chainId: SupportedChainId) {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM: return mainnet;
    case CHAIN_IDS.BSC:      return bsc;
    case CHAIN_IDS.POLYGON:  return polygon;
    case CHAIN_IDS.BASE:     return base;
    default:                 return mainnet;
  }
}

const ERC20_ABI = [
  { name: "symbol",   type: "function" as const, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" as const },
  { name: "decimals", type: "function" as const, inputs: [], outputs: [{ type: "uint8"  }], stateMutability: "view" as const },
] as const;

/** Fetch symbol + decimals for a set of ERC-20 / Super Token addresses on one chain. */
async function fetchTokenMeta(
  tokenAddresses: string[],
  chainId: SupportedChainId
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const result = new Map<string, { symbol: string; decimals: number }>();
  if (tokenAddresses.length === 0) return result;

  const client = createPublicClient({
    chain:     getViemChain(chainId),
    transport: http(getRpcUrl(chainId)),
  });

  const contracts = tokenAddresses.flatMap((addr) => [
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol"   as const },
    { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" as const },
  ]);

  try {
    const results = await client.multicall({ contracts, allowFailure: true });
    for (let i = 0; i < tokenAddresses.length; i++) {
      const symResult = results[i * 2];
      const decResult = results[i * 2 + 1];
      result.set(tokenAddresses[i].toLowerCase(), {
        symbol:   symResult.status === "success"  ? String(symResult.result)  : "???",
        decimals: decResult.status === "success"  ? Number(decResult.result)  : 18,
      });
    }
  } catch (err) {
    console.error(`Superfluid token metadata (chain ${chainId}):`, err);
    for (const addr of tokenAddresses) {
      result.set(addr.toLowerCase(), { symbol: "???", decimals: 18 });
    }
  }

  return result;
}

// ─── GraphQL query ─────────────────────────────────────────────────────────────

const VESTING_SCHEDULES_QUERY = `
  query GetVestingSchedules($receivers: [String!]!) {
    vestingSchedules(
      where: { receiver_in: $receivers, deletedAt: null }
      first: 200
    ) {
      id
      superToken
      sender
      receiver
      startDate
      cliffAndFlowDate
      cliffAmount
      flowRate
      endDate
      totalAmount
      settledAmount
      cliffAndFlowExecutedAt
      endExecutedAt
      deletedAt
    }
  }
`;

interface RawVestingSchedule {
  id:                      string;
  superToken:              string;
  sender:                  string;
  receiver:                string;
  startDate:               string;
  cliffAndFlowDate:        string;
  cliffAmount:             string;  // raw token units (bigint string)
  flowRate:                string;  // tokens/second (bigint string)
  endDate:                 string;
  totalAmount:             string;  // raw token units (bigint string)
  settledAmount:           string;  // already settled/paid out (bigint string)
  cliffAndFlowExecutedAt:  string | null;
  endExecutedAt:           string | null;
  deletedAt:               string | null;
}

// ─── Vesting math ──────────────────────────────────────────────────────────────
// Superfluid VestingScheduler:
//   Before cliffAndFlowDate → 0 tokens vested
//   At/after cliffAndFlowDate → cliffAmount pays out instantly, then flowRate/sec streams
//   totalVested = cliffAmount + flowRate * (now - cliffAndFlowDate)  [clamped to totalAmount]

function computeSuperfluidVesting(
  total:            bigint,
  settled:          bigint,
  cliffAmount:      bigint,
  flowRate:         bigint,
  cliffAndFlowDate: number,
  endDate:          number,
  nowSec:           number
): { claimableNow: bigint; lockedAmount: bigint; isFullyVested: boolean } {
  let totalVested: bigint;

  if (nowSec < cliffAndFlowDate) {
    totalVested = 0n;
  } else if (nowSec >= endDate) {
    totalVested = total;
  } else {
    const elapsed = BigInt(nowSec - cliffAndFlowDate);
    totalVested   = cliffAmount + flowRate * elapsed;
    if (totalVested > total) totalVested = total;
  }

  const claimableNow = totalVested > settled ? totalVested - settled : 0n;
  const lockedAmount = total > totalVested    ? total - totalVested   : 0n;
  const isFullyVested = nowSec >= endDate;

  return { claimableNow, lockedAmount, isFullyVested };
}

// ─── Main fetch ────────────────────────────────────────────────────────────────

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());

  let json: { data?: { vestingSchedules?: unknown[] }; errors?: unknown };
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body:    JSON.stringify({ query: VESTING_SCHEDULES_QUERY, variables: { receivers: lowercased } }),
      next:    { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`Superfluid subgraph (chain ${chainId}) HTTP ${res.status}`);
      return [];
    }
    json = await res.json();
  } catch (err) {
    console.error(`Superfluid subgraph (chain ${chainId}) fetch error:`, err);
    return [];
  }

  if (json.errors) {
    console.error(`Superfluid subgraph (chain ${chainId}) errors:`, json.errors);
    return [];
  }

  const rawSchedules = (json.data?.vestingSchedules ?? []) as RawVestingSchedule[];
  if (rawSchedules.length === 0) return [];

  // Fetch token metadata for all unique super tokens in one batch
  const uniqueTokens = [...new Set(rawSchedules.map((s) => s.superToken.toLowerCase()))];
  const tokenMeta    = await fetchTokenMeta(uniqueTokens, chainId);

  const nowSec = Math.floor(Date.now() / 1000);

  return rawSchedules.map((raw): VestingStream => {
    const cliffAndFlowDate = Number(raw.cliffAndFlowDate);
    const endDate          = Number(raw.endDate);
    const startDate        = Number(raw.startDate);
    const total            = BigInt(raw.totalAmount   || "0");
    const settled          = BigInt(raw.settledAmount || "0");
    const cliffAmount      = BigInt(raw.cliffAmount   || "0");
    const flowRate         = BigInt(raw.flowRate      || "0");

    const { claimableNow, lockedAmount, isFullyVested } = computeSuperfluidVesting(
      total, settled, cliffAmount, flowRate, cliffAndFlowDate, endDate, nowSec
    );

    const meta = tokenMeta.get(raw.superToken.toLowerCase()) ?? { symbol: "???", decimals: 18 };

    // cliffTime = cliffAndFlowDate when there's a non-trivial cliff amount
    const cliffTime = cliffAmount > 0n ? cliffAndFlowDate : null;

    return {
      id:              `superfluid-${chainId}-${raw.id}`,
      protocol:        "superfluid",
      chainId,
      recipient:       raw.receiver.toLowerCase(),
      tokenAddress:    raw.superToken.toLowerCase(),
      tokenSymbol:     meta.symbol,
      tokenDecimals:   meta.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: settled.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime:       startDate,
      endTime:         endDate,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, cliffTime ?? cliffAndFlowDate, endDate),
      cancelable:      true,   // Superfluid VestingScheduler supports cancellation
      shape:           "linear",
    };
  });
}

export const superfluidAdapter: VestingAdapter = {
  id:   "superfluid",
  name: "Superfluid",
  supportedChainIds: [
    CHAIN_IDS.ETHEREUM,
    CHAIN_IDS.BSC,
    CHAIN_IDS.POLYGON,
    CHAIN_IDS.BASE,
  ],
  fetch: fetchForChain,
};
