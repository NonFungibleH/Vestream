// src/lib/vesting/ingestors/unvest-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unvest claim event ingestor.
//
// Unvest's hosted subgraph exposes a `Claim` entity — one row per on-chain
// claim — with the txHash, timestamp, amount, and the recipient ("claimer").
// The vestingToken → underlyingToken nested relation gives us the ERC-20
// metadata (id, symbol, decimals) without a second contract read.
//
// Schema verified via GraphQL introspection (April 2026):
//   Claim {
//     id, claimer, amount, blockTimestamp, transactionHash,
//     vestingToken { id, underlyingToken { id symbol decimals } }
//   }
//
// Pipeline:
//   1. For each chain with a configured subgraph: paginate `claims`
//      filtered by claimer_in: [user wallets, lowercased]
//   2. Map each row → ClaimEventInput
//   3. Hand off to upsertClaimEvents() for historical-price enrichment
//
// Note on streamId: Unvest's `id` on a Claim is the txHash + log index,
// not the vesting position id. We synthesise the streamId from
// vestingToken.id since one VestingToken contract = one schedule per
// recipient — same ID format the read-side adapter uses.
// ─────────────────────────────────────────────────────────────────────────────

import { upsertClaimEvents, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { resolveSubgraphUrl } from "../graph";

const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string | undefined>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(
    process.env.UNVEST_SUBGRAPH_URL_ETH,
    "HR7owbk45vXNgf8XXyDd7fRLuVo6QGYY6XbGjRCPgUuD"
  ),
  [CHAIN_IDS.BSC]: resolveSubgraphUrl(
    process.env.UNVEST_SUBGRAPH_URL_BSC,
    "5RiFDxL1mDFdSojrC7tRkVXqiiQgysf77iC7c1KK5CAp"
  ),
  [CHAIN_IDS.POLYGON]: resolveSubgraphUrl(
    process.env.UNVEST_SUBGRAPH_URL_POLYGON,
    "7EwmQS7MyeY9BZC5xeAr25WgjcgbRNpAY95dZNBvqgja"
  ),
  [CHAIN_IDS.BASE]: resolveSubgraphUrl(
    process.env.UNVEST_SUBGRAPH_URL_BASE,
    "8DdThKxMS2LxEtyDCdwqtecwRu4qD8GbE77n3ANvkN2M"
  ),
};

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.entries(SUBGRAPH_URLS)
    .filter(([, url]) => url)
    .map(([id]) => Number(id) as SupportedChainId);

const CLAIMS_QUERY = `
  query GetUnvestClaims($claimers: [Bytes!]!, $skip: Int!) {
    claims(
      where: { claimer_in: $claimers }
      orderBy: blockTimestamp
      orderDirection: asc
      first: 200
      skip: $skip
    ) {
      claimer
      amount
      blockTimestamp
      transactionHash
      vestingToken {
        id
        underlyingToken {
          id
          symbol
          decimals
        }
      }
    }
  }
`;

interface RawClaim {
  claimer:         string;
  amount:          string;
  blockTimestamp:  string;
  transactionHash: string;
  vestingToken: {
    id: string;
    underlyingToken: {
      id:       string;
      symbol:   string;
      decimals: number;
    } | null;
  } | null;
}

/**
 * Ingest Unvest claim events for one user across all tracked wallets
 * and the chains where the subgraph is published.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events.
 */
export async function ingestUnvestClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  // Unvest stores `claimer` as Bytes — lowercase 0x-prefixed.
  const lowercased = wallets.map((w) => w.toLowerCase());
  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const url = SUBGRAPH_URLS[chainId];
    if (!url) continue;

    let skip = 0;
    while (true) {
      let json: { data?: { claims?: RawClaim[] }; errors?: unknown };
      try {
        const res = await fetch(url, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept":       "application/json",
            "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
          },
          body: JSON.stringify({
            query:     CLAIMS_QUERY,
            variables: { claimers: lowercased, skip },
          }),
          cache: "no-store",
        });
        if (!res.ok) {
          console.error(`[unvest-claims] subgraph (chain ${chainId}) HTTP ${res.status}`);
          break;
        }
        json = await res.json();
      } catch (err) {
        console.error(`[unvest-claims] subgraph (chain ${chainId}) fetch error:`, err);
        break;
      }

      if (json.errors) {
        console.error(`[unvest-claims] subgraph (chain ${chainId}) errors:`, json.errors);
        break;
      }

      const page = json.data?.claims ?? [];
      for (const c of page) {
        if (!c.vestingToken?.underlyingToken) continue;

        const amount = BigInt(c.amount);
        if (amount === 0n) continue;

        const ts = Number(c.blockTimestamp);
        const underlying = c.vestingToken.underlyingToken;
        // VestingToken contract is the "schedule" — one per token deployment.
        // Mirrors the read-side adapter's id-construction pattern.
        const streamId = `unvest-${chainId}-${c.vestingToken.id.toLowerCase()}`;

        inputs.push({
          userId,
          streamId,
          protocol:      "unvest",
          chainId,
          recipient:     c.claimer.toLowerCase(),
          tokenAddress:  underlying.id.toLowerCase(),
          tokenSymbol:   underlying.symbol || null,
          tokenDecimals: Number(underlying.decimals) || 18,
          amount:        amount.toString(),
          claimedAt:     new Date(ts * 1000),
          txHash:        c.transactionHash.toLowerCase(),
        });
      }

      if (page.length < 200) break;
      skip += 200;
    }
  }

  return upsertClaimEvents(inputs);
}
