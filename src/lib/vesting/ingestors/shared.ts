// src/lib/vesting/ingestors/shared.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types + the universal upsert helper for all per-protocol claim
// event ingestors. Every ingestor produces ClaimEventInput[] from its
// protocol's data source, then hands the array to upsertClaimEvents()
// which:
//   1. Looks up the historical USD price at claim time (cached forever
//      per (chain, address, date) — see historical-prices.ts)
//   2. Computes USD value at claim
//   3. Upserts into claim_events with onConflictDoNothing on the dedup
//      unique index so re-runs are no-ops
//
// Adapter responsibility: just produce well-formed ClaimEventInput rows
// from your protocol's source. Everything downstream is uniform.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "../../db";
import { claimEvents } from "../../db/schema";
import { getHistoricalPrice } from "../historical-prices";

export interface ClaimEventInput {
  userId:        string;
  /** Composite stream id matching vestingStreamsCache.streamId, e.g.
   *  "sablier-1-0xabc". */
  streamId:      string;
  /** Adapter id — sablier, hedgey, uncx, uncx-vm, unvest, team-finance,
   *  superfluid, pinksale, streamflow, jupiter-lock. */
  protocol:      string;
  chainId:       number;
  /** Recipient wallet (canonical lowercase). */
  recipient:     string;
  /** Token contract (canonical lowercase). */
  tokenAddress:  string;
  tokenSymbol:   string | null;
  tokenDecimals: number;
  /** Stringified bigint in token base units. */
  amount:        string;
  /** Wall-clock time of the claim event. */
  claimedAt:     Date;
  /** Source transaction hash. Synthetic form
   *  "synthetic:{streamId}:{ts}" allowed when the data source doesn't
   *  expose the real hash — keeps the dedup index intact. */
  txHash:        string;
}

/**
 * Bulk insert claim events with historical-price enrichment.
 *
 * For each row: lookup USD-at-claim price (cached after first call per
 * (chain, address, date)), convert raw token amount × price → USD value,
 * upsert. Existing rows (same chain+tx+recipient+token) become no-ops
 * via onConflictDoNothing on the unique index.
 *
 * Returns the count of newly-inserted rows. Idempotent on re-run.
 */
export async function upsertClaimEvents(inputs: ClaimEventInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  let inserted = 0;

  for (const e of inputs) {
    const price = await getHistoricalPrice(
      e.chainId,
      e.tokenAddress,
      Math.floor(e.claimedAt.getTime() / 1000),
    );

    let usdValueAtClaim: string | null = null;
    if (price.usd !== null) {
      try {
        const tokensWhole = Number(BigInt(e.amount)) / Math.pow(10, e.tokenDecimals);
        usdValueAtClaim = (tokensWhole * price.usd).toFixed(6);
      } catch {
        // Malformed amount string — leave usdValueAtClaim null; UI will
        // prompt for a manual cost basis on that row.
      }
    }

    try {
      const result = await db
        .insert(claimEvents)
        .values({
          userId:           e.userId,
          streamId:         e.streamId,
          protocol:         e.protocol,
          chainId:          e.chainId,
          recipient:        e.recipient,
          tokenAddress:     e.tokenAddress,
          tokenSymbol:      e.tokenSymbol,
          tokenDecimals:    e.tokenDecimals,
          amount:           e.amount,
          claimedAt:        e.claimedAt,
          txHash:           e.txHash,
          // gasNative + gasUsdValueAtClaim are populated by an optional
          // post-pass that fetches tx receipts. Phase 2 enhancement —
          // a single eth_getTransactionReceipt RPC per claim. Skipped
          // here so v1 ingestion stays cheap.
          gasNative:           null,
          usdValueAtClaim:     usdValueAtClaim,
          priceConfidence:     price.confidence,
          gasUsdValueAtClaim:  null,
        })
        .onConflictDoNothing({
          target: [claimEvents.chainId, claimEvents.txHash, claimEvents.recipient, claimEvents.tokenAddress],
        })
        .returning({ id: claimEvents.id });
      if (result.length > 0) inserted++;
    } catch (err) {
      console.error(`[ingestors] insert failed for ${e.protocol} ${e.streamId}:`, err);
    }
  }

  return inserted;
}

/** Build a synthetic txHash when the data source doesn't expose the real
 *  one. Embeds dedup-relevant context so the unique index still collapses
 *  duplicate ingestion of the same event. */
export function syntheticTxHash(streamId: string, claimedAtSec: number): string {
  return `synthetic:${streamId}:${claimedAtSec}`;
}
