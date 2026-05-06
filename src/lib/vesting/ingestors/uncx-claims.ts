// src/lib/vesting/ingestors/uncx-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNCX (Token Locker / TokenVesting V3) claim event ingestor.
//
// UNCX V3's hosted subgraph exposes a `WithdrawEvent` entity — one row per
// on-chain withdrawal — with the txHash, timestamp, and before/after share
// counts. We compute the per-event amount from the delta:
//
//   amount = sharesWithdrawnAfter − sharesWithdrawnBefore
//
// (UNCX's "shares" model accounts for fee-on-transfer + reflection tokens —
// the share count is what's tracked, while the underlying token transfer
// is what the user actually receives. For Token Locker V3 standard tokens
// these match; for rebase tokens this is the canonical accounting unit.)
//
// Schema verified via GraphQL introspection (April 2026):
//   WithdrawEvent {
//     lockId, owner { id }, token { id symbol decimals },
//     sharesWithdrawnBefore, sharesWithdrawnAfter,
//     timestamp, transaction
//   }
//
// Pipeline:
//   1. For each chain with a configured subgraph: paginate `withdrawEvents`
//      filtered by owner_in: [user wallets, lowercased]
//   2. Map each row → ClaimEventInput with the delta as the amount
//   3. Hand off to upsertClaimEvents() for historical-price enrichment
// ─────────────────────────────────────────────────────────────────────────────

import { upsertClaimEvents, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { resolveSubgraphUrl } from "../graph";

const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string | undefined>> = {
  [CHAIN_IDS.ETHEREUM]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_ETH,
    "Dp7Nvr9EESRYJC1sVhVdrRiDU2bxPa8G1Zhqdh4vyHnE"
  ),
  [CHAIN_IDS.BSC]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_BSC,
    "Bq3CVVspv1gunmEhYkAwfRZcMZK5QyaydyCRarCwgE8P"
  ),
  // Polygon: hosted ID was deprecated upstream; skipped until UNCX republishes.
  [CHAIN_IDS.POLYGON]: resolveSubgraphUrl(
    process.env.UNCX_SUBGRAPH_URL_POLYGON,
    undefined
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

const SUPPORTED_CHAINS: SupportedChainId[] =
  Object.entries(SUBGRAPH_URLS)
    .filter(([, url]) => url)
    .map(([id]) => Number(id) as SupportedChainId);

const WITHDRAW_EVENTS_QUERY = `
  query GetUncxWithdraws($owners: [String!]!, $skip: Int!) {
    withdrawEvents(
      where: { owner_: { id_in: $owners } }
      orderBy: timestamp
      orderDirection: asc
      first: 200
      skip: $skip
    ) {
      lockId
      owner { id }
      token { id symbol decimals }
      sharesWithdrawnBefore
      sharesWithdrawnAfter
      timestamp
      transaction
    }
  }
`;

interface RawWithdrawEvent {
  lockId:                 string;
  owner:                  { id: string };
  token:                  { id: string; symbol: string; decimals: number };
  sharesWithdrawnBefore:  string;
  sharesWithdrawnAfter:   string;
  timestamp:              string;
  transaction:            string;
}

/**
 * Ingest UNCX (Token Locker V3) claim events for one user across all
 * tracked wallets and the chains where the subgraph is published.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events.
 */
export async function ingestUncxClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  const lowercased = wallets.map((w) => w.toLowerCase());
  const inputs: ClaimEventInput[] = [];

  for (const chainId of chainIds) {
    const url = SUBGRAPH_URLS[chainId];
    if (!url) continue;

    let skip = 0;
    while (true) {
      let json: { data?: { withdrawEvents?: RawWithdrawEvent[] }; errors?: unknown };
      try {
        const res = await fetch(url, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept":       "application/json",
            "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
          },
          body: JSON.stringify({
            query:     WITHDRAW_EVENTS_QUERY,
            variables: { owners: lowercased, skip },
          }),
          // Non-cached — refresh-on-demand path
          cache: "no-store",
        });
        if (!res.ok) {
          console.error(`[uncx-claims] subgraph (chain ${chainId}) HTTP ${res.status}`);
          break;
        }
        json = await res.json();
      } catch (err) {
        console.error(`[uncx-claims] subgraph (chain ${chainId}) fetch error:`, err);
        break;
      }

      if (json.errors) {
        console.error(`[uncx-claims] subgraph (chain ${chainId}) errors:`, json.errors);
        break;
      }

      const page = json.data?.withdrawEvents ?? [];
      for (const evt of page) {
        const before = BigInt(evt.sharesWithdrawnBefore);
        const after  = BigInt(evt.sharesWithdrawnAfter);
        const delta  = after > before ? after - before : 0n;
        if (delta === 0n) continue;

        const ts = Number(evt.timestamp);
        const streamId = `uncx-${chainId}-${evt.lockId}`;

        inputs.push({
          userId,
          streamId,
          protocol:      "uncx",
          chainId,
          recipient:     evt.owner.id.toLowerCase(),
          tokenAddress:  evt.token.id.toLowerCase(),
          tokenSymbol:   evt.token.symbol || null,
          tokenDecimals: Number(evt.token.decimals) || 18,
          amount:        delta.toString(),
          claimedAt:     new Date(ts * 1000),
          txHash:        evt.transaction.toLowerCase(),
        });
      }

      if (page.length < 200) break;
      skip += 200;
    }
  }

  return upsertClaimEvents(inputs);
}
