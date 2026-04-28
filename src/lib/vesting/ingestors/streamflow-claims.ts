// src/lib/vesting/ingestors/streamflow-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Streamflow (Solana) claim event ingestor — snapshot-diff strategy.
//
// Solana doesn't expose `eth_getLogs`-style indexed event scanning. Streamflow
// streams hold cumulative state on-chain (`withdrawnAmount`, `lastWithdrawnAt`)
// — not a per-claim event log. To produce per-event claim_events without
// building a full Solana program-instruction scanner, we use a snapshot-diff
// pipeline:
//
//   1. Read every active Streamflow stream for the user via the SDK
//   2. For each stream, compare the SDK-reported `withdrawnAmount` against
//      the previously-known total stored in vestingStreamsCache.streamData
//   3. If the new total > cached total, emit ONE synthetic claim_event for
//      the delta, dated at `lastWithdrawnAt` (or `now` if missing)
//   4. The dedup unique index on (chainId, txHash, recipient, tokenAddress)
//      makes re-runs idempotent — synthetic txHash format includes the
//      timestamp so a same-stream same-day delta only inserts once.
//
// Limitations honestly disclosed:
//   - Multiple withdrawals between two refreshes get bundled into one event,
//     dated at the latest `lastWithdrawnAt`. For users who refresh frequently
//     this is fine; for sparse refreshes it under-attributes timing precision.
//   - Pre-Vestream-activation history materialises as a single baseline
//     event on first run (delta = current cumulative, dated at
//     `lastWithdrawnAt`). Tax tools see one lump sum at one date instead of
//     N discrete events at N dates. Documented in the Exports tab.
//
// Future work: Phase 4 program-instruction scanner via
// `getSignaturesForAddress` + Anchor instruction decoding for true
// per-event granularity. Out of scope for v1.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "../../db";
import { vestingStreamsCache } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  SolanaStreamClient,
  StreamType,
  StreamDirection,
  Contract as StreamflowContract,
  AlignedContract,
} from "@streamflow/stream";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

const JUPITER_TOKEN_LIST_URL = "https://token.jup.ag/all";
const JUPITER_TTL_MS = 30 * 60 * 1000;

let jupiterCache: Map<string, { symbol: string; decimals: number }> | null = null;
let jupiterCacheFetchedAt = 0;

async function getJupiterTokenList(): Promise<Map<string, { symbol: string; decimals: number }>> {
  const now = Date.now();
  if (jupiterCache && now - jupiterCacheFetchedAt < JUPITER_TTL_MS) {
    return jupiterCache;
  }
  try {
    const res = await fetch(JUPITER_TOKEN_LIST_URL, {
      next: { revalidate: 1800 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return jupiterCache ?? new Map();
    const tokens = (await res.json()) as Array<{ address: string; symbol: string; decimals: number }>;
    const map = new Map<string, { symbol: string; decimals: number }>();
    for (const t of tokens) {
      if (t.address && t.symbol) map.set(t.address, { symbol: t.symbol, decimals: t.decimals });
    }
    jupiterCache = map;
    jupiterCacheFetchedAt = now;
    return map;
  } catch (err) {
    console.error("[streamflow-claims] Jupiter token list fetch failed:", err);
    return jupiterCache ?? new Map();
  }
}

/**
 * Ingest Streamflow claim events using the snapshot-diff strategy
 * described above. Solana-only.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events. Cache row is updated on each run with the new
 * `withdrawnAmount` so subsequent runs only emit deltas.
 */
export async function ingestStreamflowClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds?: SupportedChainId[],
): Promise<number> {
  // Adapter only runs on Solana. Honour the chainIds filter when supplied.
  if (chainIds && !chainIds.includes(CHAIN_IDS.SOLANA)) return 0;
  if (process.env.SOLANA_ENABLED !== "true") return 0;
  if (wallets.length === 0) return 0;

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.error("[streamflow-claims] SOLANA_RPC_URL not configured");
    return 0;
  }

  let client: SolanaStreamClient;
  try {
    client = new SolanaStreamClient(rpcUrl);
  } catch (err) {
    console.error("[streamflow-claims] client construction failed:", err);
    return 0;
  }

  // Fetch active streams for every wallet
  const allStreams: Array<[string, StreamflowContract]> = [];
  await Promise.all(
    wallets.map(async (wallet) => {
      try {
        new PublicKey(wallet);
        const result = await client.get({
          address:   wallet,
          type:      StreamType.All,
          direction: StreamDirection.All,
        });
        for (const [id, stream] of result) {
          if (stream instanceof AlignedContract) continue;
          allStreams.push([id, stream]);
        }
      } catch (err) {
        console.error(`[streamflow-claims] fetch failed for ${wallet}:`, err);
      }
    }),
  );

  if (allStreams.length === 0) return 0;

  // Load cached withdrawn totals so we can emit deltas only.
  // streamId format matches the read-side adapter: "streamflow-{chainId}-{id}"
  const streamIds = allStreams.map(([id]) => `streamflow-${CHAIN_IDS.SOLANA}-${id}`);
  const cachedRows = await db
    .select({
      streamId:   vestingStreamsCache.streamId,
      streamData: vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(eq(vestingStreamsCache.protocol, "streamflow"));

  const cachedWithdrawnByStreamId = new Map<string, bigint>();
  for (const row of cachedRows) {
    if (!streamIds.includes(row.streamId)) continue;
    const w = row.streamData?.withdrawnAmount;
    if (typeof w === "string") {
      try { cachedWithdrawnByStreamId.set(row.streamId, BigInt(w)); }
      catch { /* skip malformed cache row */ }
    }
  }

  // Token metadata batch
  const uniqueMints  = [...new Set(allStreams.map(([, s]) => s.mint))];
  const connection   = new Connection(rpcUrl);
  const jupiterList  = await getJupiterTokenList();
  const decimalsByMint = new Map<string, number>();
  const symbolsByMint  = new Map<string, string>();
  await Promise.all(
    uniqueMints.map(async (mint) => {
      const fromJupiter = jupiterList.get(mint);
      try {
        const mintInfo = await getMint(connection, new PublicKey(mint));
        decimalsByMint.set(mint, mintInfo.decimals);
      } catch {
        decimalsByMint.set(mint, fromJupiter?.decimals ?? 9);
      }
      symbolsByMint.set(mint, fromJupiter?.symbol ?? `${mint.slice(0, 4)}…`);
    }),
  );

  const inputs: ClaimEventInput[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (const [id, stream] of allStreams) {
    const streamId = `streamflow-${CHAIN_IDS.SOLANA}-${id}`;
    const current  = BigInt(stream.withdrawnAmount.toString());
    const previous = cachedWithdrawnByStreamId.get(streamId) ?? 0n;
    if (current <= previous) continue;

    const delta = current - previous;
    if (delta === 0n) continue;

    // lastWithdrawnAt is a unix-second number on Streamflow. Falls back
    // to `now` for streams where the SDK didn't populate it (rare —
    // means the stream was just initialised but not yet withdrawn from).
    const ts = stream.lastWithdrawnAt && stream.lastWithdrawnAt > 0
      ? stream.lastWithdrawnAt
      : nowSec;

    const decimals = decimalsByMint.get(stream.mint) ?? 9;
    const symbol   = symbolsByMint.get(stream.mint)   ?? `${stream.mint.slice(0, 4)}…`;

    inputs.push({
      userId,
      streamId,
      protocol:      "streamflow",
      chainId:       CHAIN_IDS.SOLANA,
      recipient:     stream.recipient,
      tokenAddress:  stream.mint,
      tokenSymbol:   symbol,
      tokenDecimals: decimals,
      amount:        delta.toString(),
      claimedAt:     new Date(ts * 1000),
      // Synthetic txHash — Solana tx signatures aren't surfaced through
      // the on-chain account; the snapshot-diff model has no canonical
      // tx anyway. Stable per (streamId, ts) so dedup index works.
      txHash:        syntheticTxHash(streamId, ts),
    });
  }

  return upsertClaimEvents(inputs);
}
