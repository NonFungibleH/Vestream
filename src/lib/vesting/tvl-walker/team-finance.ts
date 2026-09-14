// src/lib/vesting/tvl-walker/team-finance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Team Finance walker — paginates the Squid's `vestingFactoryVestings`
// root entity across every supported mainnet chain WITHOUT a recipient filter,
// aggregating locked amounts by locked token.
//
// Unlike the adapter (adapters/team-finance.ts), which is wallet-scoped via the
// REST API, the walker targets the Squid directly because it exposes a native
// "all vestings" root entity. No REST calls, no per-wallet plumbing.
//
// Endpoint: https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql
//
// Subsquid quirks vs The Graph:
//   • pagination uses `limit` / `offset` (not `first` / `skip`)
//   • equality filters use `_eq` / `_in` suffixes (not bare field names)
//
// Locked per vesting: tokenTotal − claimed. Skip when ≤ 0.
//
// Known upstream issue: the BASE chain currently returns 0 rows from the Squid.
// We log this but treat it as a non-error (empty result is the correct shape
// given the data available to us).
//
// Token metadata: resolved in a second phase via viem multicall on symbol() +
// decimals(), mirroring the pattern in tvl-walker/superfluid.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { makeFallbackClient } from "../rpc";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";

const SQUID_URL =
  "https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql";

// Base dropped + Avalanche added 2026-07-06 (see adapter/protocol-constants):
// TF's Squid indexes Avax (147 vestings) but zero Base.
const SUPPORTED_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.AVALANCHE,
  // zkSync added 2026-09-14: their Squid reports 111 vestings on chain 324,
  // measured before building. Monad, Robinhood and Base were checked at the
  // same time and all return ZERO, so they are deliberately absent.
  CHAIN_IDS.ZKSYNC,
];

const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // 200 × 1000 = 200k vestings, plenty of headroom

const VESTINGS_QUERY = `
  query WalkVestings($chainId: Int!, $limit: Int!, $offset: Int!) {
    vestingFactoryVestings(
      where: { chainId_eq: $chainId }
      orderBy: id_ASC
      limit: $limit
      offset: $offset
    ) {
      id
      address
      token
      tokenTotal
      claimed
    }
  }
`;

interface RawVesting {
  id:          string;
  address:     string;
  token:       string;
  tokenTotal:  string;
  claimed:     string;
}

// ─── viem helpers for ERC-20 metadata ─────────────────────────────────────────

// getRpcUrl/getViemChain used to live here as two switch statements with a
// `default: mainnet` fallback — so any chain added to SUPPORTED_CHAINS without
// also editing both would silently read that chain's ERC-20 metadata FROM
// ETHEREUM and report confident nonsense. Adding zkSync on 2026-09-14 would
// have done exactly that. makeFallbackClient already knows every chain and
// falls back across the whole pool, so the duplication is gone with the trap.
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

  // Contract reads only (ERC-20 symbol/decimals), so the default pool is right
  // — no forLogs filter needed.
  const client = makeFallbackClient(chainId);
  if (!client) {
    for (const addr of tokenAddresses) result.set(addr.toLowerCase(), { symbol: "???", decimals: 18 });
    return result;
  }

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

// ─── Walker ────────────────────────────────────────────────────────────────────

export async function walkTeamFinance(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  if (!SUPPORTED_CHAINS.includes(chainId)) {
    return {
      protocol:    "team-finance",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "chain not supported by team-finance walker",
      elapsedMs:   Date.now() - started,
    };
  }

  const vestings:  { token: string; locked: bigint }[] = [];
  const tokenSet   = new Set<string>();
  let   totalVestings = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    let json: { data?: { vestingFactoryVestings?: RawVesting[] }; errors?: unknown };

    try {
      const res = await fetch(SQUID_URL, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
        },
        body:    JSON.stringify({
          query:     VESTINGS_QUERY,
          variables: { chainId, limit: PAGE_SIZE, offset },
        }),
        cache:   "no-store",
      });
      if (!res.ok) {
        return {
          protocol:    "team-finance",
          chainId,
          tokens:      [],
          streamCount: totalVestings,
          error:       `squid HTTP ${res.status} on page ${page}`,
          elapsedMs:   Date.now() - started,
        };
      }
      json = await res.json();
    } catch (err) {
      return {
        protocol:    "team-finance",
        chainId,
        tokens:      [],
        streamCount: totalVestings,
        error:       `fetch error on page ${page}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    if (json.errors) {
      return {
        protocol:    "team-finance",
        chainId,
        tokens:      [],
        streamCount: totalVestings,
        error:       `graphql errors on page ${page}: ${JSON.stringify(json.errors).slice(0, 200)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    const batch = json.data?.vestingFactoryVestings ?? [];
    if (batch.length === 0) break;   // exhausted

    for (const raw of batch) {
      if (!raw.token || !raw.tokenTotal) continue;
      const total   = BigInt(raw.tokenTotal || "0");
      const claimed = BigInt(raw.claimed    || "0");
      const locked  = total > claimed ? total - claimed : 0n;
      if (locked <= 0n) continue;

      const tokenKey = raw.token.toLowerCase();
      tokenSet.add(tokenKey);
      vestings.push({ token: tokenKey, locked });
    }

    totalVestings += batch.length;
    if (batch.length < PAGE_SIZE) break;  // last page
  }

  // Upstream note: Base currently returns 0 rows from the Squid. Empty is
  // correct given the data — log once so the signal isn't lost in telemetry.
  if (chainId === CHAIN_IDS.BASE && totalVestings === 0) {
    console.error("team-finance walker: Base returned 0 vestings (known upstream Squid issue)");
  }

  // Resolve token metadata in one multicall per chain.
  const tokenMeta = await fetchTokenMeta(Array.from(tokenSet), chainId);

  const byToken = new Map<string, TokenAggregate>();
  for (const { token, locked } of vestings) {
    const existing = byToken.get(token);
    if (existing) {
      existing.lockedAmount = (BigInt(existing.lockedAmount) + locked).toString();
      existing.streamCount += 1;
    } else {
      const meta = tokenMeta.get(token) ?? { symbol: "???", decimals: 18 };
      byToken.set(token, {
        chainId,
        tokenAddress:  token,
        tokenSymbol:   meta.symbol,
        tokenDecimals: meta.decimals,
        lockedAmount:  locked.toString(),
        streamCount:   1,
      });
    }
  }

  return {
    protocol:    "team-finance",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: totalVestings,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
