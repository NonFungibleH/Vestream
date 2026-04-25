// src/lib/vesting/tvl-walker/superfluid.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Superfluid walker — paginates the `vestingSchedules` entity across
// every supported mainnet chain WITHOUT a receiver filter, aggregating remaining
// locked amounts by SuperToken. Uses Superfluid's own hosted subgraph
// infrastructure (no GRAPH_API_KEY needed).
//
// Endpoint format:
//   https://subgraph-endpoints.superfluid.dev/{chain}/vesting-scheduler
//   where {chain} ∈ eth-mainnet | bsc-mainnet | polygon-mainnet | base-mainnet
//
// We keep the `deletedAt: null` filter because deleted schedules have
// settledAmount frozen and no remaining locked value — not a recipient filter.
//
// Vesting math (mirrors adapters/superfluid.ts#computeSuperfluidVesting):
//   nowSec < cliffAndFlowDate → totalVested = 0
//   nowSec ≥ endDate          → totalVested = total
//   else                       → totalVested = cliff + rate*(now-cliffDate),
//                                 clamped to total
//   locked = max(0, total - totalVested)
//
// SuperTokens are ERC-20s with their own metadata. We collect distinct
// addresses seen during pagination, then one viem multicall per chain fetches
// symbol+decimals (same pattern as the adapter's fetchTokenMeta).
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http } from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/vesting-scheduler",
  [CHAIN_IDS.BSC]:      "https://subgraph-endpoints.superfluid.dev/bsc-mainnet/vesting-scheduler",
  [CHAIN_IDS.POLYGON]:  "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/vesting-scheduler",
  [CHAIN_IDS.BASE]:     "https://subgraph-endpoints.superfluid.dev/base-mainnet/vesting-scheduler",
};

const PAGE_SIZE = 1000;   // The Graph's hard cap
const MAX_PAGES = 200;    // 200 × 1000 = 200k schedules
const SCHEDULES_QUERY = `
  query WalkVestingSchedules($skip: Int!, $first: Int!) {
    vestingSchedules(
      where: { deletedAt: null }
      orderBy: id
      orderDirection: asc
      first: $first
      skip: $skip
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
  cliffAmount:             string;
  flowRate:                string;
  endDate:                 string;
  totalAmount:             string;
  settledAmount:           string;
  cliffAndFlowExecutedAt:  string | null;
  endExecutedAt:           string | null;
  deletedAt:               string | null;
}

// ─── viem helpers for SuperToken metadata ──────────────────────────────────────

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

async function fetchTokenMeta(
  tokenAddresses: string[],
  chainId:        SupportedChainId,
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
        symbol:   symResult.status === "success" ? String(symResult.result) : "???",
        decimals: decResult.status === "success" ? Number(decResult.result) : 18,
      });
    }
  } catch {
    for (const addr of tokenAddresses) {
      result.set(addr.toLowerCase(), { symbol: "???", decimals: 18 });
    }
  }

  return result;
}

// ─── Vesting math (inlined from adapter — walker stays self-contained) ────────

function computeLocked(
  total:            bigint,
  settled:          bigint,
  cliffAmount:      bigint,
  flowRate:         bigint,
  cliffAndFlowDate: number,
  endDate:          number,
  nowSec:           number,
): bigint {
  void settled; // settled is the already-paid-out amount; it does not affect `locked` (which tracks the schedule's unvested remainder)
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
  return total > totalVested ? total - totalVested : 0n;
}

// ─── Walker ────────────────────────────────────────────────────────────────────

export async function walkSuperfluid(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();
  const url     = SUBGRAPH_URLS[chainId];
  if (!url) {
    return {
      protocol:    "superfluid",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "no subgraph configured for this chain",
      elapsedMs:   Date.now() - started,
    };
  }

  const nowSec       = Math.floor(Date.now() / 1000);
  const schedules:  { superToken: string; locked: bigint }[] = [];
  const tokenSet    = new Set<string>();
  let   totalSchedules = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const skip = page * PAGE_SIZE;
    let json: { data?: { vestingSchedules?: RawVestingSchedule[] }; errors?: unknown };

    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
        },
        body:    JSON.stringify({ query: SCHEDULES_QUERY, variables: { skip, first: PAGE_SIZE } }),
        cache:   "no-store",
      });
      if (!res.ok) {
        return {
          protocol:    "superfluid",
          chainId,
          tokens:      [],
          streamCount: totalSchedules,
          error:       `subgraph HTTP ${res.status} on page ${page}`,
          elapsedMs:   Date.now() - started,
        };
      }
      json = await res.json();
    } catch (err) {
      return {
        protocol:    "superfluid",
        chainId,
        tokens:      [],
        streamCount: totalSchedules,
        error:       `fetch error on page ${page}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    if (json.errors) {
      return {
        protocol:    "superfluid",
        chainId,
        tokens:      [],
        streamCount: totalSchedules,
        error:       `graphql errors on page ${page}: ${JSON.stringify(json.errors).slice(0, 200)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    const batch = json.data?.vestingSchedules ?? [];
    if (batch.length === 0) break;

    for (const raw of batch) {
      const total       = BigInt(raw.totalAmount   || "0");
      const settled     = BigInt(raw.settledAmount || "0");
      const cliffAmount = BigInt(raw.cliffAmount   || "0");
      const flowRate    = BigInt(raw.flowRate      || "0");
      const locked      = computeLocked(
        total, settled, cliffAmount, flowRate,
        Number(raw.cliffAndFlowDate), Number(raw.endDate), nowSec,
      );
      if (locked === 0n) continue;

      const tokenKey = raw.superToken.toLowerCase();
      tokenSet.add(tokenKey);
      schedules.push({ superToken: tokenKey, locked });
    }

    totalSchedules += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }

  // Resolve SuperToken metadata in one multicall per chain.
  const tokenMeta = await fetchTokenMeta(Array.from(tokenSet), chainId);

  const byToken = new Map<string, TokenAggregate>();
  for (const { superToken, locked } of schedules) {
    const existing = byToken.get(superToken);
    if (existing) {
      existing.lockedAmount = (BigInt(existing.lockedAmount) + locked).toString();
      existing.streamCount += 1;
    } else {
      const meta = tokenMeta.get(superToken) ?? { symbol: "???", decimals: 18 };
      byToken.set(superToken, {
        chainId,
        tokenAddress:  superToken,
        tokenSymbol:   meta.symbol,
        tokenDecimals: meta.decimals,
        lockedAmount:  locked.toString(),
        streamCount:   1,
      });
    }
  }

  return {
    protocol:    "superfluid",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: totalSchedules,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
