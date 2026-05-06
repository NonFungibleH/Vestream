// src/lib/vesting/adapters/llamapay.ts
// ─────────────────────────────────────────────────────────────────────────────
// LlamaPay — per-second token streaming used for both team vesting and
// crypto-native payroll.
//
// Schema mapping note (LlamaPay is structurally different from cliff-vesting):
//
//   LlamaPay streams have NO fixed `totalAmount` and NO fixed `endTime`.
//   They flow continuously at `amountPerSec` until either (a) the payer
//   cancels, (b) the payer's deposit balance runs out, or (c) the stream
//   is paused. We map the continuous model into our VestingStream shape
//   as a "fully-vested-up-to-now snapshot":
//
//     totalAmount     = streamedSoFar (at fetch time)
//     withdrawnAmount = sum of historical Withdraw events
//     claimableNow    = totalAmount − withdrawnAmount
//     lockedAmount    = 0n   (the streamed portion has no future lockup)
//     startTime       = createdTimestamp
//     endTime         = nowSec
//     isFullyVested   = true
//     nextUnlockTime  = null (continuous; claim anytime)
//
//   The "totals" advance on every refresh as more time elapses — the
//   user sees their accrued balance grow each time the dashboard is
//   re-fetched. The progress bar reads 100% because what's streamed
//   really IS fully vested.
//
// Decimal normalisation: LlamaPay stores amountPerSec at 20 decimals
// internally (DECIMALS_DIVISOR = 10**(20 - tokenDecimals)). Withdraw
// event amounts are emitted post-divisor (in token native decimals).
// We compute streamed-so-far in token-native units by multiplying then
// dividing by 10**(20 - decimals).
//
// Pause/cancel handling: filter to `active: true, paused: false` on the
// subgraph query. Cancelled streams keep their entity but flip `active`
// to false; paused streams have `paused: true`. Both should disappear
// from the user's portfolio.
// ─────────────────────────────────────────────────────────────────────────────

import { VestingAdapter } from "./index";
import {
  VestingStream, SupportedChainId, CHAIN_IDS,
} from "../types";
import { buildGraphUrl } from "../graph";

// ─── Subgraph deployment IDs (The Graph decentralized network) ───────────────
//
// LlamaPay's subgraphs migrated from the hosted service to The Graph network
// in 2024. Each chain has its own deployment ID. See:
// github.com/LlamaPay/interface → lib/networkDetails.ts

// Only ETHEREUM + OPTIMISM are currently indexed by The Graph network.
// BSC/Polygon/Arbitrum/Base subgraphs return "subgraph not found: no
// allocations" or "bad indexers" — the deployment hashes are registered
// but no indexers are economically allocating to them. Verified May 5
// 2026 by querying each ID directly:
//
//   ETHEREUM  → OK
//   OPTIMISM  → OK
//   BSC       → FAIL (bad indexers: 0xbdfb5...Unavailable)
//   POLYGON   → FAIL (no allocations)
//   ARBITRUM  → FAIL (no allocations)
//   BASE      → FAIL (no allocations)
//
// Action: enable only the working chains here. The TVL pipeline still
// covers BSC/Polygon/Arbitrum/Base via DefiLlama's per-chain breakdown
// (those chains have small LlamaPay TVL, ~$5M combined). The per-wallet
// stream view returns [] for users on the 4 broken chains until
// LlamaPay redeploys their subgraphs OR we build a non-subgraph
// adapter (e.g. on-chain factory reads).
const SUBGRAPH_IDS: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "5Ac1MryeCPqmzmXGMcchhmKsdaVKwzQ796KApoLGNtqZ",
  [CHAIN_IDS.OPTIMISM]: "Hw2mERc7LMD9papcf1QPq4puBpHJqh4tNrEZYRC65Hqe",
  // Re-enable when working IDs are available:
  // [CHAIN_IDS.BSC]:      "4e3YbwrXML1gFuRSmtqvt89N4APWjyfvkBA8pDDuYZAD",
  // [CHAIN_IDS.POLYGON]:  "egF47mBwB7ytP3aQafhRNHAdtAFHUaZUGy5Me7bq2ew",
  // [CHAIN_IDS.ARBITRUM]: "6ULAzMy7FSRdHngU9S725hr51tq9zqB5Q6LbRYHMSSuy",
  // [CHAIN_IDS.BASE]:     "9LPDj38RmbDzyPaPWKSkxHPm9Bzv6oRCHJ2oMxr4LPaz",
};

const SUPPORTED_CHAINS: SupportedChainId[] = Object.keys(SUBGRAPH_IDS).map(
  (id) => Number(id) as SupportedChainId,
);

// ─── Query ───────────────────────────────────────────────────────────────────
//
// Fetch up to 200 active, non-paused streams whose payee is in the wallet
// list. Pull each stream's Withdraw history (capped at 50 events) so we can
// compute claimable = streamedSoFar − Σ(withdrawals).
//
// LlamaPay's subgraph schema flattens `Stream.payee` into a `User` entity
// with a single `id` field (the lowercased address). Same for payer.

const STREAMS_QUERY = /* GraphQL */ `
  query LlamaPayStreams($recipients: [String!]!) {
    streams(
      where: {
        active: true
        paused: false
        payee_in: $recipients
      }
      orderBy: createdTimestamp
      orderDirection: asc
      first: 200
    ) {
      id
      streamId
      payer { id }
      payee { id }
      token {
        address
        symbol
        decimals
      }
      amountPerSec
      createdTimestamp
      historicalEvents(
        where: { eventType: "Withdraw" }
        orderBy: createdTimestamp
        orderDirection: desc
        first: 50
      ) {
        amount
        createdTimestamp
        txHash
      }
    }
  }
`;

interface RawStream {
  id:               string;
  streamId:         string;
  payer:            { id: string };
  payee:            { id: string };
  token:            { address: string; symbol: string; decimals: string };
  amountPerSec:     string;
  createdTimestamp: string;
  historicalEvents: Array<{
    amount:           string;
    createdTimestamp: string;
    txHash:           string;
  }>;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  const subgraphId = SUBGRAPH_IDS[chainId];
  if (!subgraphId) return [];
  if (wallets.length === 0) return [];

  const url = buildGraphUrl(subgraphId);
  if (!url) return []; // GRAPH_API_KEY missing — handled by buildGraphUrl warning

  const lowercased = wallets.map((a) => a.toLowerCase());

  let json: { data?: { streams?: RawStream[] }; errors?: unknown };
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({
        query:     STREAMS_QUERY,
        variables: { recipients: lowercased },
      }),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`[llamapay/${chainId}] HTTP ${res.status}`);
      return [];
    }
    json = await res.json();
  } catch (err) {
    console.error(`[llamapay/${chainId}] fetch error:`, err);
    return [];
  }

  if (json.errors) {
    console.error(
      `[llamapay/${chainId}] subgraph errors:`,
      JSON.stringify(json.errors).slice(0, 300),
    );
    return [];
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const raw    = json.data?.streams ?? [];

  return raw.map((s): VestingStream => {
    const decimals      = Number(s.token.decimals);
    // DECIMALS_DIVISOR per LlamaPay.sol: amountPerSec is stored at 20
    // decimals; divide by 10**(20-tokenDecimals) to recover token-native
    // units. Use BigInt throughout — amountPerSec * elapsed can easily
    // exceed Number.MAX_SAFE_INTEGER.
    const divisor       = 10n ** BigInt(20 - decimals);
    const amountPerSec  = BigInt(s.amountPerSec);
    const createdAt     = Number(s.createdTimestamp);
    const elapsedSec    = Math.max(0, nowSec - createdAt);
    const streamedRaw   = amountPerSec * BigInt(elapsedSec);
    const streamedToken = streamedRaw / divisor;

    // historicalEvents.amount is the raw `amountToTransfer` from the
    // Withdraw event — already in token-native decimals (post-divisor).
    const withdrawnToken = s.historicalEvents.reduce(
      (acc, ev) => acc + BigInt(ev.amount),
      0n,
    );

    // Clamp claimable to >= 0n. `streamedSoFar - withdrawn` can briefly
    // go negative if the subgraph sees a Withdraw event before its
    // accompanying timestamp tick (race condition between block timestamp
    // and indexer); rather than show a misleading negative we floor at 0.
    const claimable = streamedToken > withdrawnToken
      ? streamedToken - withdrawnToken
      : 0n;
    const total     = streamedToken;

    return {
      id:              `llamapay-${chainId}-${s.id}`,
      protocol:        "llamapay",
      // LlamaPay is the canonical "stream" — continuous per-second flow.
      // Drives UI to show streaming-rate + runway instead of cliff/unlock.
      category:        "stream",
      chainId,
      recipient:       s.payee.id,
      tokenAddress:    s.token.address,
      tokenSymbol:     s.token.symbol,
      tokenDecimals:   decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawnToken.toString(),
      claimableNow:    claimable.toString(),
      // Continuous streams have no "future locked" amount in the vesting
      // sense — the payer's escrowed balance is on a separate contract
      // and not committed to this stream. lockedAmount = 0.
      lockedAmount:    "0",
      startTime:       createdAt,
      // endTime tracks the snapshot — the streamed slice is fully vested
      // as of `now`. On next fetch, both totalAmount and endTime advance.
      endTime:         nowSec,
      cliffTime:       null,
      isFullyVested:   true,
      // Continuous stream — there's no next discrete unlock; the user can
      // claim accrued balance any time. Setting to null suppresses the
      // "next unlock in Xd" UI rows.
      nextUnlockTime:  null,
      cancelable:      true,
      shape:           "linear",
      claimEvents: s.historicalEvents.map((ev) => ({
        timestamp: Number(ev.createdTimestamp),
        amount:    ev.amount,
      })),
    };
  });
}

export const llamapayAdapter: VestingAdapter = {
  id:                "llamapay",
  name:              "LlamaPay",
  supportedChainIds: SUPPORTED_CHAINS,
  fetch:             fetchForChain,
};
