// src/lib/vesting/ingestors/jupiter-lock-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Jupiter Lock (Solana) claim event ingestor — snapshot-diff strategy.
//
// Same model as the Streamflow ingestor: Solana account state stores
// `total_claimed_amount` cumulatively, not per-claim events. We compare
// the SDK-reported total against the previously-cached total stored in
// `vestingStreamsCache.streamData.withdrawnAmount` and emit a synthetic
// claim_event for the delta.
//
// Differences from Streamflow:
//   - No SDK — we scan VestingEscrow accounts directly via
//     `getProgramAccounts` filtered by discriminator + recipient memcmp,
//     mirroring the read-side adapter at /lib/vesting/adapters/jupiter-lock.ts
//   - No `lastWithdrawnAt` field on the account, so the synthetic event
//     is dated at `now` (best we can do with this data model). Multiple
//     refreshes per day will emit at most one event per stream-day if a
//     claim happened, which is acceptable for tax granularity.
//
// Limitations honestly disclosed (same as Streamflow):
//   - First-run baseline emits one lump-sum event for pre-TokenVest history
//   - Multiple withdrawals between refreshes get bundled into one event
//   - Future Phase 4: Anchor instruction scanner via getSignaturesForAddress
//     for true per-event granularity
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "../../db";
import { vestingStreamsCache } from "../../db/schema";
import { eq } from "drizzle-orm";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

// ─── Program identity + account layout (mirrors read-side adapter) ──────────

const JUPITER_LOCK_PROGRAM_ID = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
const VESTING_ESCROW_DISCRIMINATOR_BS58 = "hteFiUjrzUz";
const ACCOUNT_SIZE = 296;

const OFFSET_RECIPIENT            = 8;
const OFFSET_TOKEN_MINT           = 40;
const OFFSET_TOTAL_CLAIMED_AMOUNT = 184;
const OFFSET_CANCELLED_AT         = 200;

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
    console.error("[jupiter-lock-claims] Jupiter token list fetch failed:", err);
    return jupiterCache ?? new Map();
  }
}

interface DecodedEscrow {
  escrowPubkey:       string;
  recipient:          string;
  tokenMint:          string;
  totalClaimedAmount: bigint;
  cancelledAt:        number;
}

function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function decodeEscrow(escrowPubkey: string, data: Buffer): DecodedEscrow | null {
  if (data.length < ACCOUNT_SIZE) return null;
  return {
    escrowPubkey,
    recipient:          new PublicKey(data.subarray(OFFSET_RECIPIENT,  OFFSET_RECIPIENT + 32)).toBase58(),
    tokenMint:          new PublicKey(data.subarray(OFFSET_TOKEN_MINT, OFFSET_TOKEN_MINT + 32)).toBase58(),
    totalClaimedAmount: readU64LE(data, OFFSET_TOTAL_CLAIMED_AMOUNT),
    cancelledAt:        Number(readU64LE(data, OFFSET_CANCELLED_AT)),
  };
}

/**
 * Ingest Jupiter Lock claim events using the snapshot-diff strategy.
 * Solana-only.
 *
 * Idempotent — re-runs are no-ops via the dedup unique index on
 * claim_events.
 */
export async function ingestJupiterLockClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds?: SupportedChainId[],
): Promise<number> {
  if (chainIds && !chainIds.includes(CHAIN_IDS.SOLANA)) return 0;
  if (wallets.length === 0) return 0;

  // Auto-skip on EVM-only deployments. Previously this was gated by an
  // explicit SOLANA_ENABLED=true flag — but in practice that flag was
  // missing in production despite SOLANA_RPC_URL being configured, so
  // Jupiter Lock claims silently never ingested. Auto-detection via
  // RPC presence is the more honest behaviour: if you have a Solana
  // RPC URL configured, we'll ingest; if not, we skip.
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) return 0;

  let connection: Connection;
  try {
    connection = new Connection(rpcUrl, "confirmed");
  } catch (err) {
    console.error("[jupiter-lock-claims] Connection construction failed:", err);
    return 0;
  }

  const programId = new PublicKey(JUPITER_LOCK_PROGRAM_ID);

  const escrows: DecodedEscrow[] = [];
  await Promise.all(
    wallets.map(async (wallet) => {
      try {
        new PublicKey(wallet);
      } catch {
        return;
      }
      try {
        const accounts = await connection.getProgramAccounts(programId, {
          commitment: "confirmed",
          filters: [
            { memcmp: { offset: 0, bytes: VESTING_ESCROW_DISCRIMINATOR_BS58 } },
            { memcmp: { offset: OFFSET_RECIPIENT, bytes: wallet } },
          ],
        });
        for (const { pubkey, account } of accounts) {
          const data = account.data instanceof Buffer ? account.data : Buffer.from(account.data);
          const decoded = decodeEscrow(pubkey.toBase58(), data);
          if (!decoded) continue;
          // Cancelled escrows: skip — they're historical, not active.
          if (decoded.cancelledAt > 0) continue;
          escrows.push(decoded);
        }
      } catch (err) {
        console.error(`[jupiter-lock-claims] fetch failed for ${wallet}:`, err);
      }
    }),
  );

  if (escrows.length === 0) return 0;

  // Cached withdrawn totals from prior runs
  const streamIds = escrows.map((e) => `jupiter-lock-${CHAIN_IDS.SOLANA}-${e.escrowPubkey}`);
  const cachedRows = await db
    .select({
      streamId:   vestingStreamsCache.streamId,
      streamData: vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(eq(vestingStreamsCache.protocol, "jupiter-lock"));

  const cachedWithdrawnByStreamId = new Map<string, bigint>();
  for (const row of cachedRows) {
    if (!streamIds.includes(row.streamId)) continue;
    const w = row.streamData?.withdrawnAmount;
    if (typeof w === "string") {
      try { cachedWithdrawnByStreamId.set(row.streamId, BigInt(w)); }
      catch { /* skip malformed cache */ }
    }
  }

  // Token metadata batch
  const uniqueMints = [...new Set(escrows.map((e) => e.tokenMint))];
  const jupiterList = await getJupiterTokenList();
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

  for (const e of escrows) {
    const streamId = `jupiter-lock-${CHAIN_IDS.SOLANA}-${e.escrowPubkey}`;
    const current  = e.totalClaimedAmount;
    const previous = cachedWithdrawnByStreamId.get(streamId) ?? 0n;
    if (current <= previous) continue;

    const delta = current - previous;
    if (delta === 0n) continue;

    const decimals = decimalsByMint.get(e.tokenMint) ?? 9;
    const symbol   = symbolsByMint.get(e.tokenMint)  ?? `${e.tokenMint.slice(0, 4)}…`;

    inputs.push({
      userId,
      streamId,
      protocol:      "jupiter-lock",
      chainId:       CHAIN_IDS.SOLANA,
      recipient:     e.recipient,
      tokenAddress:  e.tokenMint,
      tokenSymbol:   symbol,
      tokenDecimals: decimals,
      amount:        delta.toString(),
      claimedAt:     new Date(nowSec * 1000),
      // No lastWithdrawnAt on the account — synthetic txHash carries
      // the timestamp so dedup is stable for same-day re-runs.
      txHash:        syntheticTxHash(streamId, nowSec),
    });
  }

  return upsertClaimEvents(inputs);
}
