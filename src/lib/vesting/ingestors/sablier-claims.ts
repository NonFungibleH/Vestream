// src/lib/vesting/ingestors/sablier-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sablier-specific claim event ingestor.
//
// Pulls withdrawal events from the Sablier Envio endpoint per (chain, wallet),
// computes USD value at claim time via historical-prices.ts, and upserts
// rows into the `claim_events` table for downstream tax-export consumers.
//
// PoC adapter for Phase 1. Hedgey / UNCX / Team Finance / Superfluid /
// Streamflow / Jupiter Lock / PinkSale ingestors follow the same shape:
//   1. Fetch withdrawal events from the protocol's data source
//   2. Map to a normalised ClaimEventInput
//   3. Hand off to upsertClaimEvents() which enriches with historical price
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "../../db";
import { claimEvents, vestingStreamsCache } from "../../db/schema";
import { sql, and, eq } from "drizzle-orm";
import { getHistoricalPrice } from "../historical-prices";
import type { SupportedChainId } from "../types";

const SABLIER_ENVIO_URL = "https://indexer.bigdevenergy.link/3b4ea6b/v1/graphql";

const SUPPORTED_CHAINS: SupportedChainId[] = [1, 56, 137, 8453, 11155111] as SupportedChainId[];

// Pull withdrawal events for a recipient list. Same shape as the main
// adapter but we ONLY need actions, asset, subgraphId — not the full
// stream lifecycle.
const ACTIONS_QUERY = `
  query SablierActions($recipients: [String!]!, $chainId: numeric!) {
    LockupStream(
      where: {
        chainId:   { _eq: $chainId }
        recipient: { _in: $recipients }
      }
      limit: 200
    ) {
      subgraphId
      chainId
      recipient
      asset { address symbol decimals }
      actions(
        where: { category: { _eq: "Withdraw" } }
        limit: 100
        order_by: { timestamp: desc }
      ) {
        amountB
        timestamp
        hash
      }
    }
  }
`;

interface RawAction {
  amountB:   string | null;
  timestamp: string;
  hash:      string | null;
}

interface RawStream {
  subgraphId: string;
  chainId:    string;
  recipient:  string;
  asset:      { address: string; symbol: string; decimals: string };
  actions:    RawAction[] | null;
}

export interface ClaimEventInput {
  userId:        string;
  streamId:      string;
  protocol:      string;
  chainId:       number;
  recipient:     string;
  tokenAddress:  string;
  tokenSymbol:   string | null;
  tokenDecimals: number;
  amount:        string;       // bigint as string
  claimedAt:     Date;
  txHash:        string;       // synthetic if real hash unavailable
}

/**
 * Ingest Sablier withdrawal events for one user across all their tracked
 * wallets. Only pulls events — does NOT manage the watcher cron; that's
 * a separate scheduling concern.
 *
 * Returns the count of newly-inserted rows. Re-running is safe: the
 * unique index on (chainId, txHash, recipient, tokenAddress) makes
 * duplicates a no-op.
 */
export async function ingestSablierClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;
  const lowercased = wallets.map((a) => a.toLowerCase());

  const inputs: ClaimEventInput[] = [];

  // Fetch per-chain so a slow chain doesn't block the others.
  for (const chainId of chainIds) {
    const raw = await fetchSablierActions(lowercased, chainId);
    for (const stream of raw) {
      const decimals = Number(stream.asset.decimals);
      const tokenAddress = stream.asset.address.toLowerCase();
      const tokenSymbol  = stream.asset.symbol;
      const streamId     = `sablier-${chainId}-${stream.subgraphId}`;
      for (const action of stream.actions ?? []) {
        if (!action.amountB) continue;
        const claimedAtSec = Number(action.timestamp);
        if (!Number.isFinite(claimedAtSec) || claimedAtSec <= 0) continue;

        // txHash from Envio when present; synthetic otherwise. Synthetic
        // form embeds the dedup-relevant context (stream + timestamp) so
        // the unique index still collapses replays.
        const txHash = action.hash
          ? action.hash.toLowerCase()
          : `synthetic:${streamId}:${claimedAtSec}`;

        inputs.push({
          userId,
          streamId,
          protocol:      "sablier",
          chainId,
          recipient:     stream.recipient.toLowerCase(),
          tokenAddress,
          tokenSymbol,
          tokenDecimals: decimals,
          amount:        action.amountB,
          claimedAt:     new Date(claimedAtSec * 1000),
          txHash,
        });
      }
    }
  }

  return upsertClaimEvents(inputs);
}

/**
 * Bulk insert claim events with historical-price enrichment.
 *
 * For each row: look up USD-at-claim price (cached after first call),
 * convert raw token amount × price → USD value, and upsert. Existing rows
 * (same chain+tx+recipient+token) are no-ops.
 */
export async function upsertClaimEvents(inputs: ClaimEventInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  let inserted = 0;

  for (const e of inputs) {
    // Pricing is per-token-per-day-cached, so even thousands of events
    // collapse to a small number of CoinGecko fetches.
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
      } catch { /* malformed amount — leave null */ }
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
          // gasNative + gasUsdValueAtClaim left null in v1 — adding tx
          // receipt fetching is a Phase 2 enhancement (one extra RPC call
          // per claim, mostly for gas-aware tax exports).
          gasNative:        null,
          usdValueAtClaim:  usdValueAtClaim,
          priceConfidence:  price.confidence,
          gasUsdValueAtClaim: null,
        })
        .onConflictDoNothing({
          target: [claimEvents.chainId, claimEvents.txHash, claimEvents.recipient, claimEvents.tokenAddress],
        })
        .returning({ id: claimEvents.id });
      if (result.length > 0) inserted++;
    } catch (err) {
      console.error("[sablier-claims] insert failed:", err);
    }
  }

  return inserted;
}

async function fetchSablierActions(
  recipients: string[],
  chainId:    SupportedChainId,
): Promise<RawStream[]> {
  try {
    const res = await fetch(SABLIER_ENVIO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({
        query:     ACTIONS_QUERY,
        variables: { recipients, chainId },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[sablier-claims] HTTP ${res.status} for chain ${chainId}`);
      return [];
    }
    const data = await res.json() as { data?: { LockupStream?: RawStream[] }; errors?: unknown };
    if (data.errors) {
      console.error(`[sablier-claims] GraphQL errors for chain ${chainId}:`, JSON.stringify(data.errors).slice(0, 300));
      return [];
    }
    return data.data?.LockupStream ?? [];
  } catch (err) {
    console.error(`[sablier-claims] fetch error for chain ${chainId}:`, err);
    return [];
  }
}

/**
 * For the API handler — return chronological claim events for a user.
 * Heavy enrichment already happened at ingestion time, so this is a
 * straight DB read.
 */
export async function getClaimHistoryForUser(
  userId:        string,
  opts: { since?: Date; until?: Date; protocol?: string } = {},
) {
  const conditions = [eq(claimEvents.userId, userId)];
  if (opts.since)    conditions.push(sql`${claimEvents.claimedAt} >= ${opts.since}`);
  if (opts.until)    conditions.push(sql`${claimEvents.claimedAt} <= ${opts.until}`);
  if (opts.protocol) conditions.push(eq(claimEvents.protocol, opts.protocol));

  return db
    .select()
    .from(claimEvents)
    .where(and(...conditions))
    .orderBy(sql`${claimEvents.claimedAt} desc`);
}

// Mark `vestingStreamsCache` as a touched import to silence the "unused
// import" linter — we'll wire stream-id validation against it in Phase 2.
void vestingStreamsCache;
