// src/lib/vesting/ingestors/superfluid-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Superfluid VestingScheduler claim event ingestor.
//
// Superfluid is unusual: vesting payouts happen via a Continuous Flow
// Agreement (CFA) — the recipient's balance increases every block at
// `flowRate` tokens/second. Most "claim" value transfers smoothly without
// any discrete event. Only two on-chain events fire with concrete amounts:
//
//   1. VestingCliffAndFlowExecutedEvent  (cliffAmount discrete payout +
//      starts the flow)
//   2. VestingEndExecutedEvent           (earlyEndCompensation final
//      settlement; closes the flow)
//
// We ingest these two discrete events. The continuous flow accrual between
// them IS taxable income but isn't captured here as discrete claim_events
// — that needs a separate model (flow integration over the user's holding
// window, e.g. month-end snapshots). Tracked as a future enhancement.
//
// Token metadata: the events carry `superToken` (the wrapped Super Token,
// e.g. USDCx). For tax purposes we want the underlying ERC-20 the user
// can actually settle into a fiat exchange. SuperTokens implement
// `getUnderlyingToken()` on-chain — we read it once per unique super
// token and cache the (decimals, symbol) of the underlying.
//
// Schema verified via GraphQL introspection (April 2026).
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { mainnet, bsc, polygon, base } from "viem/chains";
import { upsertClaimEvents, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "https://subgraph-endpoints.superfluid.dev/eth-mainnet/vesting-scheduler",
  [CHAIN_IDS.BSC]:      "https://subgraph-endpoints.superfluid.dev/bsc-mainnet/vesting-scheduler",
  [CHAIN_IDS.POLYGON]:  "https://subgraph-endpoints.superfluid.dev/polygon-mainnet/vesting-scheduler",
  [CHAIN_IDS.BASE]:     "https://subgraph-endpoints.superfluid.dev/base-mainnet/vesting-scheduler",
};

const VIEM_CHAINS: Partial<Record<SupportedChainId, typeof mainnet | typeof bsc | typeof polygon | typeof base>> = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.BSC]:      bsc,
  [CHAIN_IDS.POLYGON]:  polygon,
  [CHAIN_IDS.BASE]:     base,
};

function getRpcUrl(chainId: SupportedChainId): string | undefined {
  if (chainId === CHAIN_IDS.ETHEREUM) return process.env.ALCHEMY_RPC_URL_ETH ?? "https://ethereum.publicnode.com";
  if (chainId === CHAIN_IDS.BSC)      return process.env.BSC_RPC_URL          ?? "https://bsc.publicnode.com";
  if (chainId === CHAIN_IDS.POLYGON)  return process.env.POLYGON_RPC_URL      ?? "https://polygon.publicnode.com";
  if (chainId === CHAIN_IDS.BASE)     return process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL ?? "https://base.publicnode.com";
  return undefined;
}

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.keys(SUBGRAPH_URLS).map(Number) as SupportedChainId[];

// SuperToken ABI — getUnderlyingToken() exists on every SuperToken (CFA + GDA).
// For native asset super tokens (e.g. ETHx) the underlying is address(0); we
// fall back to attributing claims to the SuperToken itself in that case.
const SUPER_TOKEN_ABI = parseAbi([
  "function getUnderlyingToken() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const CLIFF_AND_END_QUERY = `
  query GetSuperfluidExecutions($receivers: [Bytes!]!, $skip: Int!) {
    cliffEvents: vestingCliffAndFlowExecutedEvents(
      where: { receiver_in: $receivers }
      orderBy: timestamp
      orderDirection: asc
      first: 200
      skip: $skip
    ) {
      transactionHash
      timestamp
      superToken
      receiver
      cliffAmount
    }
    endEvents: vestingEndExecutedEvents(
      where: { receiver_in: $receivers, didCompensationFail: false }
      orderBy: timestamp
      orderDirection: asc
      first: 200
      skip: $skip
    ) {
      transactionHash
      timestamp
      superToken
      receiver
      earlyEndCompensation
    }
  }
`;

interface RawCliffEvent {
  transactionHash: string;
  timestamp:       string;
  superToken:      string;
  receiver:        string;
  cliffAmount:     string;
}

interface RawEndEvent {
  transactionHash:      string;
  timestamp:            string;
  superToken:           string;
  receiver:             string;
  earlyEndCompensation: string;
}

// In-memory cache: superToken → underlying { address, symbol, decimals }
// Key: "{chainId}:{superToken.lowercase()}"
const superTokenMetaCache = new Map<string, {
  address:  string;
  symbol:   string;
  decimals: number;
}>();

async function getUnderlying(
  chainId:    SupportedChainId,
  superToken: string,
): Promise<{ address: string; symbol: string; decimals: number }> {
  const key = `${chainId}:${superToken.toLowerCase()}`;
  const cached = superTokenMetaCache.get(key);
  if (cached) return cached;

  const rpcUrl = getRpcUrl(chainId);
  const chain  = VIEM_CHAINS[chainId];
  if (!rpcUrl || !chain) {
    const fallback = { address: superToken.toLowerCase(), symbol: "", decimals: 18 };
    superTokenMetaCache.set(key, fallback);
    return fallback;
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  let underlying: `0x${string}` = "0x0000000000000000000000000000000000000000";
  try {
    underlying = (await client.readContract({
      address:      superToken as `0x${string}`,
      abi:          SUPER_TOKEN_ABI,
      functionName: "getUnderlyingToken",
    })) as `0x${string}`;
  } catch {
    // Native-asset super tokens revert / underlying is zero — fall through.
  }

  // Address(0) means the SuperToken IS the asset (e.g. ETHx wraps native ETH).
  // Read the SuperToken's own decimals/symbol in that case.
  const isNative =
    underlying.toLowerCase() === "0x0000000000000000000000000000000000000000";
  const target  = isNative ? (superToken as `0x${string}`) : underlying;

  let decimals = 18;
  let symbol   = "";
  try {
    const [d, s] = await Promise.all([
      client.readContract({ address: target, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>,
      client.readContract({ address: target, abi: ERC20_ABI, functionName: "symbol" })   as Promise<string>,
    ]);
    decimals = Number(d);
    symbol   = String(s);
  } catch {
    // Best-effort; leave defaults.
  }

  const meta = { address: target.toLowerCase(), symbol, decimals };
  superTokenMetaCache.set(key, meta);
  return meta;
}

/**
 * Ingest Superfluid VestingScheduler discrete claim events for one user
 * across all tracked wallets and the chains where the subgraph is hosted.
 *
 * Captures cliff payouts (cliffAmount) and end-of-vesting compensations
 * (earlyEndCompensation). Continuous flow accrual between cliff and end
 * is NOT captured as claim_events here — see header comment.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events.
 */
export async function ingestSuperfluidClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  // Bytes filter on the subgraph — needs lowercase 0x-prefixed addresses.
  const receivers = wallets.map((w) => {
    try {
      return getAddress(w).toLowerCase();
    } catch {
      return w.toLowerCase();
    }
  });

  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const url = SUBGRAPH_URLS[chainId];
    if (!url) continue;

    let skip = 0;
    while (true) {
      let json: {
        data?: {
          cliffEvents?: RawCliffEvent[];
          endEvents?:   RawEndEvent[];
        };
        errors?: unknown;
      };
      try {
        const res = await fetch(url, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept":       "application/json",
          },
          body: JSON.stringify({
            query:     CLIFF_AND_END_QUERY,
            variables: { receivers, skip },
          }),
          cache: "no-store",
        });
        if (!res.ok) {
          console.error(`[superfluid-claims] subgraph (chain ${chainId}) HTTP ${res.status}`);
          break;
        }
        json = await res.json();
      } catch (err) {
        console.error(`[superfluid-claims] subgraph (chain ${chainId}) fetch error:`, err);
        break;
      }

      if (json.errors) {
        console.error(`[superfluid-claims] subgraph (chain ${chainId}) errors:`, json.errors);
        break;
      }

      const cliffPage = json.data?.cliffEvents ?? [];
      const endPage   = json.data?.endEvents   ?? [];

      for (const evt of cliffPage) {
        const amt = BigInt(evt.cliffAmount);
        if (amt === 0n) continue; // many schedules use 0 cliff + flow only

        const meta = await getUnderlying(chainId, evt.superToken);
        const ts = Number(evt.timestamp);
        const streamId = `superfluid-${chainId}-${evt.superToken.toLowerCase()}-${evt.receiver.toLowerCase()}`;

        inputs.push({
          userId,
          streamId,
          protocol:      "superfluid",
          chainId,
          recipient:     evt.receiver.toLowerCase(),
          tokenAddress:  meta.address,
          tokenSymbol:   meta.symbol || null,
          tokenDecimals: meta.decimals,
          amount:        amt.toString(),
          claimedAt:     new Date(ts * 1000),
          txHash:        evt.transactionHash.toLowerCase(),
        });
      }

      for (const evt of endPage) {
        const amt = BigInt(evt.earlyEndCompensation);
        if (amt === 0n) continue;

        const meta = await getUnderlying(chainId, evt.superToken);
        const ts = Number(evt.timestamp);
        const streamId = `superfluid-${chainId}-${evt.superToken.toLowerCase()}-${evt.receiver.toLowerCase()}`;

        inputs.push({
          userId,
          streamId,
          protocol:      "superfluid",
          chainId,
          recipient:     evt.receiver.toLowerCase(),
          tokenAddress:  meta.address,
          tokenSymbol:   meta.symbol || null,
          tokenDecimals: meta.decimals,
          amount:        amt.toString(),
          claimedAt:     new Date(ts * 1000),
          txHash:        evt.transactionHash.toLowerCase(),
        });
      }

      // Pagination: continue if either result page was full.
      const moreCliff = cliffPage.length >= 200;
      const moreEnd   = endPage.length   >= 200;
      if (!moreCliff && !moreEnd) break;
      skip += 200;
    }
  }

  return upsertClaimEvents(inputs);
}
