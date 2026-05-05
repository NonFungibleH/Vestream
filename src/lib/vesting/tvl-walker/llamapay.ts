// src/lib/vesting/tvl-walker/llamapay.ts
// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive LlamaPay walker — paginates The Graph (decentralized network)
// per-chain LlamaPay subgraphs, aggregating accrued-but-unclaimed token
// amounts across every active, non-paused stream. Self-indexed replacement
// for the DefiLlama `chainTvls.vesting` passthrough.
//
// Why self-index instead of DefiLlama:
//   - DefiLlama sums LlamaPay TVL across EVERY chain it deploys on.
//     Vestream tracks 6 mainnet chains; the DefiLlama figure includes
//     deployments we don't index, so the /protocols card has been
//     mixing apples (other protocols' Vestream-scope numbers) with
//     oranges (LlamaPay's global number).
//   - Self-indexing gives us coverage transparency: "Vestream LlamaPay TVL
//     = X across our 6 supported chains".
//   - Removes the silent DefiLlama outage failure mode.
//
// What we count:
//   LlamaPay streams have NO fixed total amount — they flow continuously
//   at `amountPerSec` until the payer cancels, the deposit runs out, or
//   the stream is paused. The closest analogue to "TVL locked in the
//   contract" is the streamed-but-unclaimed balance per stream:
//
//     streamedSoFar = amountPerSec × (now - createdTimestamp) / 10**(20-decimals)
//     unclaimed     = streamedSoFar - Σ(historical Withdraw events)
//
//   That's what's literally sitting inside the LlamaPay contract waiting
//   to be withdrawn — the same number the per-wallet adapter surfaces as
//   `claimableNow` (see src/lib/vesting/adapters/llamapay.ts). Aggregated
//   across all active streams per token, it's a defensible TVL definition
//   that mirrors traditional "value held in the protocol" semantics.
//
// What we DON'T count:
//   - Future commitments (amountPerSec extrapolated forward indefinitely):
//     these aren't escrowed in the contract — the payer can stop paying
//     at any time. Including them would inflate TVL beyond what's
//     actually locked.
//   - Inactive or paused streams.
//
// Decimal handling: amountPerSec is stored at 20 decimals internally; we
// divide by 10**(20-tokenDecimals) to recover token-native units. Same
// math as the per-wallet adapter.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "../types";
import type { WalkerResult, TokenAggregate } from "./types";
import { buildGraphUrl } from "../graph";

// LlamaPay subgraph deployment IDs — keep in sync with the per-wallet adapter
// (src/lib/vesting/adapters/llamapay.ts). The walker queries the same data
// source; only the filter changes (no recipient list, paginated full scan).
const SUBGRAPH_IDS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "5Ac1MryeCPqmzmXGMcchhmKsdaVKwzQ796KApoLGNtqZ",
  [CHAIN_IDS.BSC]:      "4e3YbwrXML1gFuRSmtqvt89N4APWjyfvkBA8pDDuYZAD",
  [CHAIN_IDS.POLYGON]:  "egF47mBwB7ytP3aQafhRNHAdtAFHUaZUGy5Me7bq2ew",
  [CHAIN_IDS.ARBITRUM]: "6ULAzMy7FSRdHngU9S725hr51tq9zqB5Q6LbRYHMSSuy",
  [CHAIN_IDS.OPTIMISM]: "Hw2mERc7LMD9papcf1QPq4puBpHJqh4tNrEZYRC65Hqe",
  [CHAIN_IDS.BASE]:     "9LPDj38RmbDzyPaPWKSkxHPm9Bzv6oRCHJ2oMxr4LPaz",
};

const SUPPORTED_CHAINS: SupportedChainId[] = Object.keys(SUBGRAPH_IDS).map(
  (id) => Number(id) as SupportedChainId,
);

const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // 200k streams cap per chain — generous headroom

// Walker query — we paginate by createdTimestamp to keep ordering stable
// across pages. Pull each stream's Withdraw events (capped at 100 per
// stream) so we can compute claimable = streamedSoFar − Σ(withdrawals).
//
// 100 withdraws/stream is way past what's realistic — even daily-claiming
// over 5 years caps at 1825. If a hot stream blows past 100, we under-
// count its withdrawals (and slightly OVERSTATE TVL), which is the safe
// direction (closer to "all streamed funds are still in the contract").
const STREAMS_QUERY = /* GraphQL */ `
  query WalkLlamaPay($skip: Int!, $first: Int!) {
    streams(
      where: { active: true, paused: false }
      orderBy: createdTimestamp
      orderDirection: asc
      first: $first
      skip:  $skip
    ) {
      id
      token { address symbol decimals }
      amountPerSec
      createdTimestamp
      historicalEvents(
        where: { eventType: "Withdraw" }
        orderBy: createdTimestamp
        orderDirection: desc
        first: 100
      ) {
        amount
      }
    }
  }
`;

interface RawStream {
  id:               string;
  token:            { address: string; symbol: string | null; decimals: string };
  amountPerSec:     string;
  createdTimestamp: string;
  historicalEvents: Array<{ amount: string }>;
}

// ─── Walker ──────────────────────────────────────────────────────────────────

export async function walkLlamapay(chainId: SupportedChainId): Promise<WalkerResult> {
  const started = Date.now();

  if (!SUPPORTED_CHAINS.includes(chainId)) {
    return {
      protocol:    "llamapay",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "chain not supported by LlamaPay walker",
      elapsedMs:   Date.now() - started,
    };
  }

  const subgraphId = SUBGRAPH_IDS[chainId];
  if (!subgraphId) {
    return {
      protocol:    "llamapay",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "no subgraph deployment id for chain",
      elapsedMs:   Date.now() - started,
    };
  }

  const url = buildGraphUrl(subgraphId);
  if (!url) {
    return {
      protocol:    "llamapay",
      chainId,
      tokens:      [],
      streamCount: 0,
      error:       "GRAPH_API_KEY missing — cannot build subgraph URL",
      elapsedMs:   Date.now() - started,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Aggregate as we paginate — keyed by lowercase asset address.
  const byToken = new Map<
    string,
    { lockedAmount: bigint; streamCount: number; symbol: string | null; decimals: number }
  >();
  let totalStreams = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const skip = page * PAGE_SIZE;
    let json: { data?: { streams?: RawStream[] }; errors?: unknown };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
        },
        body: JSON.stringify({
          query:     STREAMS_QUERY,
          variables: { skip, first: PAGE_SIZE },
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        return {
          protocol:    "llamapay",
          chainId,
          tokens:      [],
          streamCount: totalStreams,
          error:       `subgraph HTTP ${res.status} on page ${page}`,
          elapsedMs:   Date.now() - started,
        };
      }
      json = await res.json();
    } catch (err) {
      return {
        protocol:    "llamapay",
        chainId,
        tokens:      [],
        streamCount: totalStreams,
        error:       `fetch error on page ${page}: ${err instanceof Error ? err.message : String(err)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    if (json.errors) {
      return {
        protocol:    "llamapay",
        chainId,
        tokens:      [],
        streamCount: totalStreams,
        error:       `graphql errors on page ${page}: ${JSON.stringify(json.errors).slice(0, 200)}`,
        elapsedMs:   Date.now() - started,
      };
    }

    const batch = json.data?.streams ?? [];
    if (batch.length === 0) break;

    for (const s of batch) {
      const decimals = Number(s.token.decimals);
      if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) continue;

      // Recover token-native amountPerSec by stripping LlamaPay's 20-decimal
      // internal scaling. Anything with > 20 decimals would underflow (no
      // production tokens have this).
      const divisor      = 10n ** BigInt(Math.max(0, 20 - decimals));
      const amountPerSec = BigInt(s.amountPerSec || "0");
      const createdAt    = Number(s.createdTimestamp);
      const elapsedSec   = Math.max(0, nowSec - createdAt);
      if (amountPerSec === 0n || elapsedSec === 0) continue;

      const streamedToken = (amountPerSec * BigInt(elapsedSec)) / divisor;
      const withdrawnToken = s.historicalEvents.reduce(
        (acc, ev) => acc + BigInt(ev.amount || "0"),
        0n,
      );

      // Locked-in-contract = streamed - withdrawn. Floor at 0n for the
      // race condition where the indexer sees a Withdraw before its
      // accompanying timestamp tick.
      const locked = streamedToken > withdrawnToken
        ? streamedToken - withdrawnToken
        : 0n;
      if (locked === 0n) continue;

      const tokenKey = s.token.address.toLowerCase();
      const existing = byToken.get(tokenKey);
      if (existing) {
        existing.lockedAmount += locked;
        existing.streamCount  += 1;
      } else {
        byToken.set(tokenKey, {
          lockedAmount: locked,
          streamCount:  1,
          symbol:       s.token.symbol,
          decimals,
        });
      }
    }

    totalStreams += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }

  const tokens: TokenAggregate[] = Array.from(byToken.entries()).map(([addr, agg]) => ({
    chainId,
    tokenAddress:  addr,
    tokenSymbol:   agg.symbol,
    tokenDecimals: agg.decimals,
    lockedAmount:  agg.lockedAmount.toString(),
    streamCount:   agg.streamCount,
  }));

  return {
    protocol:    "llamapay",
    chainId,
    tokens,
    streamCount: totalStreams,
    error:       null,
    elapsedMs:   Date.now() - started,
  };
}
