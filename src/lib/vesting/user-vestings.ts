// src/lib/vesting/user-vestings.ts
// ─────────────────────────────────────────────────────────────────────────────
// "Vestings-first" data for the Tax Reports page: one entry per token a user
// has a tracked vesting in, enriched with their claim totals (income).
//
//   token list   ← vesting_streams_cache rows for the user's wallet addresses
//   claim totals ← claim_events aggregated per (chain, token) for the user
//
// The merge is a pure function (unit-tested); getUserVestingTokens() does the
// two DB reads + folds them. Both reads hit small/indexed sets (the user's own
// streams + their claim rows), never a full table scan.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { vestingStreamsCache, wallets, claimEvents } from "../db/schema";

export interface VestingToken {
  chainId:         number;
  tokenAddress:    string;
  tokenSymbol:     string;
  protocols:       string[];
  claimCount:      number;
  totalClaimedUsd: number | null;
  lastClaimAt:     string | null;   // ISO
}

export interface StreamTokenRow { chainId: number; tokenAddress: string | null; tokenSymbol: string | null; protocol: string; }
export interface ClaimAggRow    { chainId: number; tokenAddress: string; claimCount: number; totalUsd: number | null; lastClaimAt: Date | null; }

const key = (c: number, a: string) => `${c}:${a.toLowerCase()}`;

/** Fold the user's stream rows + claim aggregates into one entry per token. */
export function mergeVestingTokens(streams: StreamTokenRow[], claims: ClaimAggRow[]): VestingToken[] {
  const claimMap = new Map(claims.map((c) => [key(c.chainId, c.tokenAddress), c]));
  const byToken = new Map<string, VestingToken>();

  for (const s of streams) {
    if (!s.tokenAddress) continue; // can't scope/export a token without a contract address
    const k = key(s.chainId, s.tokenAddress);
    let e = byToken.get(k);
    if (!e) {
      const cl = claimMap.get(k);
      e = {
        chainId:         s.chainId,
        tokenAddress:    s.tokenAddress.toLowerCase(),
        tokenSymbol:     s.tokenSymbol ?? `${s.tokenAddress.slice(0, 6)}…`,
        protocols:       [],
        claimCount:      cl?.claimCount ?? 0,
        totalClaimedUsd: cl?.totalUsd ?? null,
        lastClaimAt:     cl?.lastClaimAt ? cl.lastClaimAt.toISOString() : null,
      };
      byToken.set(k, e);
    }
    if (!e.protocols.includes(s.protocol)) e.protocols.push(s.protocol);
  }

  return [...byToken.values()].sort(
    (a, b) => (b.totalClaimedUsd ?? 0) - (a.totalClaimedUsd ?? 0) || a.tokenSymbol.localeCompare(b.tokenSymbol),
  );
}

export async function getUserVestingTokens(userId: string): Promise<VestingToken[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];

  const w = await db.select({ address: wallets.address }).from(wallets).where(eq(wallets.userId, userId));
  const addrs = w.map((r) => r.address.toLowerCase());
  if (addrs.length === 0) return [];

  // recipient is stored lowercase (cache convention) → match on lowercased wallets.
  const streams = await db
    .select({
      chainId:      vestingStreamsCache.chainId,
      tokenAddress: vestingStreamsCache.tokenAddress,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      protocol:     vestingStreamsCache.protocol,
    })
    .from(vestingStreamsCache)
    .where(inArray(vestingStreamsCache.recipient, addrs));

  const claims = await db
    .select({
      chainId:      claimEvents.chainId,
      tokenAddress: claimEvents.tokenAddress,
      claimCount:   sql<number>`count(*)::int`,
      totalUsd:     sql<string | null>`sum(${claimEvents.usdValueAtClaim})`,
      lastClaimAt:  sql<string | null>`max(${claimEvents.claimedAt})`,
    })
    .from(claimEvents)
    .where(eq(claimEvents.userId, userId))
    .groupBy(claimEvents.chainId, claimEvents.tokenAddress);

  return mergeVestingTokens(
    streams,
    claims.map((c) => ({
      chainId:     c.chainId,
      tokenAddress: c.tokenAddress,
      claimCount:  Number(c.claimCount),
      totalUsd:    c.totalUsd != null ? Number(c.totalUsd) : null,
      lastClaimAt: c.lastClaimAt ? new Date(c.lastClaimAt) : null,
    })),
  );
}
