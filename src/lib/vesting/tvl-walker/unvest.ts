// src/lib/vesting/tvl-walker/unvest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive Unvest walker — paginates the `holderBalances` subgraph entity
// across every supported mainnet chain WITHOUT a recipient filter, aggregating
// remaining locked amounts by underlying token. Uses the pre-computed `locked`
// field from the subgraph directly (no need to re-derive from milestones).
//
// We keep the `isRecipient: true` filter because it's a natural schema filter
// (it separates recipient balances from granter balances) — not a wallet
// filter. Without it we'd double-count each allocation.
//
// Base Sepolia uses the legacy `tokenLocks` schema and is testnet-only —
// skipped entirely (not in scope for TVL).
//
// Schema (HolderBalance — Unvest V3.1+):
//   holderBalances(where: { isRecipient: true, id_gt: $lastId }, first, orderBy: id) {
//     id, user, allocation, claimed, claimable, locked,
//     vestingToken { id, underlyingToken { id, symbol, decimals } }
//   }
//
// Pagination: cursor-based on `id` (id_gt). The Graph rejects skip > 5000, so
// for chains with >5k recipient balances (e.g. ETH) we'd otherwise be cut off
// mid-walk. id_gt + orderBy: id, asc is The Graph's standard exhaustive-walk
// pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "../types";
import { resolveSubgraphUrl } from "../graph";
import type { WalkerResult, TokenAggregate } from "./types";

// Same subgraph IDs as adapters/unvest.ts — duplicated intentionally (walker
// files stay self-contained; do not cross-import module-private consts).
const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string | undefined>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_ETH,     "HR7owbk45vXNgf8XXyDd7fRLuVo6QGYY6XbGjRCPgUuD"),
  [CHAIN_IDS.BSC]:      resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_BSC,     "5RiFDxL1mDFdSojrC7tRkVXqiiQgysf77iC7c1KK5CAp"),
  [CHAIN_IDS.POLYGON]:  resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_POLYGON, "7EwmQS7MyeY9BZC5xeAr25WgjcgbRNpAY95dZNBvqgja"),
  [CHAIN_IDS.BASE]:     resolveSubgraphUrl(process.env.UNVEST_SUBGRAPH_URL_BASE,    "8DdThKxMS2LxEtyDCdwqtecwRu4qD8GbE77n3ANvkN2M"),
};

const PAGE_SIZE = 1000;   // The Graph's hard cap
const MAX_PAGES = 200;    // 200 × 1000 = 200k holder balances — plenty of headroom
const HOLDERS_QUERY = `
  query WalkHolderBalances($lastId: String!, $first: Int!) {
    holderBalances(
      where: { isRecipient: true, id_gt: $lastId }
      orderBy: id
      orderDirection: asc
      first: $first
    ) {
      id
      user
      allocation
      claimed
      claimable
      locked
      vestingToken {
        id
        underlyingToken { id symbol decimals }
      }
    }
  }
`;

interface RawHolderBalance {
  id:         string;
  user:       string;
  allocation: string;
  claimed:    string;
  claimable:  string;
  locked:     string;
  vestingToken: {
    id: string;
    underlyingToken: { id: string; symbol: string; decimals: number } | null;
  } | null;
}

/** Walk one chain's Unvest subgraph and return per-underlying-token aggregates. */
export async function walkUnvest(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();
  const url     = SUBGRAPH_URLS[chainId];
  if (!url) {
    return {
      protocol:    "unvest",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "no subgraph configured for this chain",
      elapsedMs:   Date.now() - started,
    };
  }

  const byToken     = new Map<string, TokenAggregate>();
  let   totalHolders = 0;
  let   lastId      = "";   // empty string is less-than every real ID

  for (let page = 0; page < MAX_PAGES; page++) {
    let json: { data?: { holderBalances?: RawHolderBalance[] }; errors?: unknown };

    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
        },
        body:    JSON.stringify({ query: HOLDERS_QUERY, variables: { lastId, first: PAGE_SIZE } }),
        cache:   "no-store",
      });
      if (!res.ok) {
        return {
          protocol:    "unvest",
          chainId,
          tokens:      Array.from(byToken.values()),
          streamCount: totalHolders,
          error:       `subgraph HTTP ${res.status} on page ${page}`,
          elapsedMs:   Date.now() - started,
        };
      }
      json = await res.json();
    } catch (err) {
      return {
        protocol:    "unvest",
        chainId,
        tokens:      Array.from(byToken.values()),
        streamCount: totalHolders,
        error:       `fetch error on page ${page}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    if (json.errors) {
      return {
        protocol:    "unvest",
        chainId,
        tokens:      Array.from(byToken.values()),
        streamCount: totalHolders,
        error:       `graphql errors on page ${page}: ${JSON.stringify(json.errors).slice(0, 200)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    const batch = json.data?.holderBalances ?? [];
    if (batch.length === 0) break;   // exhausted

    for (const raw of batch) {
      const locked = BigInt(raw.locked || "0");
      if (locked === 0n) continue;                         // fully vested — skip

      const underlying = raw.vestingToken?.underlyingToken;
      if (!underlying?.id) continue;                       // malformed row — skip

      const tokenKey = underlying.id.toLowerCase();
      const existing = byToken.get(tokenKey);
      if (existing) {
        existing.lockedAmount = (BigInt(existing.lockedAmount) + locked).toString();
        existing.streamCount += 1;
      } else {
        byToken.set(tokenKey, {
          chainId,
          tokenAddress:  tokenKey,
          tokenSymbol:   underlying.symbol ?? null,
          tokenDecimals: Number(underlying.decimals) || 18,
          lockedAmount:  locked.toString(),
          streamCount:   1,
        });
      }
    }

    totalHolders += batch.length;
    if (batch.length < PAGE_SIZE) break;  // last page

    // Advance cursor to the LAST id in this page (rows arrive in id-asc order).
    lastId = batch[batch.length - 1].id;
  }

  return {
    protocol:    "unvest",
    chainId,
    tokens:      Array.from(byToken.values()),
    streamCount: totalHolders,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
