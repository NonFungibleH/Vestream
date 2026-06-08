// POST /api/dashboard/pnl/:token/detect-sales?chainId=
// ─────────────────────────────────────────────────────────────────────────────
// Auto sell-detection scan. For each of the user's tracked wallets on the given
// (supported) chain, pulls outbound ERC-20 transfers of :token via Alchemy,
// maps them to disposal candidates, prices each at the time of disposal, and
// upserts them into disposal_candidates (onConflictDoNothing — re-scans never
// resurrect a dismissed/confirmed row). Returns the token's PENDING candidates.
//
// Auth: iron-session (vestr_session). Pro dashboard route.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { wallets, disposalCandidates } from "@/lib/db/schema";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import {
  fetchOutboundTransfers,
  transfersToCandidates,
  isSellDetectSupported,
  baseToWhole,
} from "@/lib/vesting/sell-detect";
import { getHistoricalPrice } from "@/lib/vesting/historical-prices";

export const runtime = "nodejs";
export const maxDuration = 60;

function normaliseTokenAddress(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 8 || trimmed.length > 80) return null;
  return trimmed;
}

async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session.address) return null;
  const user = await getUserByAddress(session.address);
  return user?.id ?? null;
}

interface CandidateRow {
  id: string; chainId: number; tokenAddress: string; txHash: string;
  toAddress: string; amountRaw: string; decimals: number;
  occurredAt: Date; priceUsdAtTime: string | null; internalTransfer: boolean; status: string;
}

function serialize(c: CandidateRow) {
  return {
    id:               c.id,
    chainId:          c.chainId,
    txHash:           c.txHash,
    toAddress:        c.toAddress,
    amount:           baseToWhole(c.amountRaw, c.decimals),
    priceUsd:         c.priceUsdAtTime != null ? Number(c.priceUsdAtTime) : null,
    occurredAt:       c.occurredAt.toISOString(),
    internalTransfer: c.internalTransfer,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const tokenAddress = normaliseTokenAddress(token);
  if (!tokenAddress) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const chainId = Number.parseInt(req.nextUrl.searchParams.get("chainId") ?? "", 10);
  if (!Number.isFinite(chainId) || !isSellDetectSupported(chainId)) {
    return NextResponse.json({ error: "Sell scanning isn't available on this chain yet." }, { status: 400 });
  }

  // Alchemy calls are metered — cap scans per user.
  const rl = await checkRateLimit("detect-sales", userId, 5, "5 m");
  const blocked = rateLimitResponse(rl, "Too many scans — try again in a few minutes.");
  if (blocked) return blocked;

  const userWallets = await db.select({ address: wallets.address }).from(wallets).where(eq(wallets.userId, userId));
  const addrs = userWallets.map((w) => w.address.toLowerCase());
  if (addrs.length === 0) return NextResponse.json({ candidates: [], scanned: 0 });

  // Fetch outbound transfers for every wallet, combine, map to candidates.
  const raw = (await Promise.all(addrs.map((a) => fetchOutboundTransfers(chainId, a, tokenAddress)))).flat();
  const candidates = transfersToCandidates(raw, addrs, chainId, tokenAddress);

  // Price each by unique day (getHistoricalPrice is cached per date).
  const priceByDay = new Map<string, number | null>();
  for (const c of candidates) {
    const day = c.occurredAt.slice(0, 10);
    if (!priceByDay.has(day)) {
      try {
        const p = await getHistoricalPrice(chainId, tokenAddress, Math.floor(Date.parse(c.occurredAt) / 1000));
        priceByDay.set(day, p.usd ?? null);
      } catch {
        priceByDay.set(day, null);
      }
    }
  }

  if (candidates.length > 0) {
    await db.insert(disposalCandidates).values(
      candidates.map((c) => {
        const price = priceByDay.get(c.occurredAt.slice(0, 10));
        return {
          userId,
          chainId:          c.chainId,
          tokenAddress:     c.tokenAddress,
          txHash:           c.txHash,
          uniqueId:         c.uniqueId,
          toAddress:        c.toAddress,
          amountRaw:        c.amountRaw,
          decimals:         c.decimals,
          occurredAt:       new Date(c.occurredAt),
          priceUsdAtTime:   price != null ? String(price) : null,
          internalTransfer: c.internalTransfer,
        };
      }),
    ).onConflictDoNothing();
  }

  const pending = await db
    .select()
    .from(disposalCandidates)
    .where(and(
      eq(disposalCandidates.userId, userId),
      eq(disposalCandidates.tokenAddress, tokenAddress),
      eq(disposalCandidates.status, "pending"),
    ))
    .orderBy(disposalCandidates.occurredAt);

  return NextResponse.json({ candidates: pending.map((c) => serialize(c as CandidateRow)), scanned: candidates.length });
}
