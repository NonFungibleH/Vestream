/**
 * GET /api/v1/wallet/{address}/vestings
 *
 * Returns all known vesting streams for a wallet address.
 * Served from the persistent cache — no live subgraph calls.
 *
 * Auth:    Authorization: Bearer vstr_live_...
 * Params:  ?protocol=sablier,uncx  (optional filter)
 *          ?chain=1,8453           (optional chain IDs)
 *          ?active_only=true       (omit fully-vested streams)
 *          ?limit=100              (1–500, default 100)
 *          ?offset=0               (≥0, default 0)
 *
 * Pagination — added because a power user / institutional wallet can have
 * 1000+ streams across our 9 protocols. Returning all of them in one
 * response (a) blows past Vercel's 4 MB serverless response cap on the
 * tail end and (b) wedges any MCP client trying to serialise the result
 * for an LLM context window. Bounded responses keep the API predictable.
 *
 * The wire shape always includes a `pagination` object, so callers that
 * don't pass `limit`/`offset` still see how many total streams exist and
 * whether more pages are available — they can opt into pagination
 * later without changing the unauth code path.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidWalletAddress } from "@/lib/address-validation";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";
import { eq, inArray, and, count } from "drizzle-orm";
import { authenticateApiKey, authErrorResponse, withRateLimitHeaders } from "@/lib/api-key-auth";
import { VestingStream } from "@/lib/vesting/types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  // Auth
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);

  const { address } = await params;

  if (!isValidWalletAddress(address)) {
    return NextResponse.json(
      { error: "Invalid wallet address. Expected an EVM 0x… address or a Solana base58 pubkey." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const protocolFilter  = searchParams.get("protocol")?.split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
  const chainFilter     = searchParams.get("chain")?.split(",").map(c => parseInt(c.trim())).filter(n => !isNaN(n));
  const activeOnly      = searchParams.get("active_only") === "true";

  // ── Pagination ──────────────────────────────────────────────────────────
  const rawLimit  = parseInt(searchParams.get("limit")  ?? "", 10);
  const rawOffset = parseInt(searchParams.get("offset") ?? "", 10);
  const limit  = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, rawLimit))
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  // Build query
  const conditions = [eq(vestingStreamsCache.recipient, address.toLowerCase())];
  if (activeOnly) {
    conditions.push(eq(vestingStreamsCache.isFullyVested, false));
  }
  if (protocolFilter?.length) {
    conditions.push(inArray(vestingStreamsCache.protocol, protocolFilter));
  }
  if (chainFilter?.length) {
    conditions.push(inArray(vestingStreamsCache.chainId, chainFilter));
  }
  const whereClause = and(...conditions);

  // Total count for the pagination header. Run in parallel with the page
  // query so the round-trip cost is one network hop.
  const [rows, totalRows] = await Promise.all([
    db.select()
      .from(vestingStreamsCache)
      .where(whereClause)
      .orderBy(vestingStreamsCache.endTime)
      .limit(limit)
      .offset(offset),
    db.select({ n: count() })
      .from(vestingStreamsCache)
      .where(whereClause),
  ]);
  const total = totalRows[0]?.n ?? 0;

  const streams: VestingStream[] = rows.map(r => r.streamData as unknown as VestingStream);

  const res = NextResponse.json({
    wallet:        address.toLowerCase(),
    count:         streams.length,
    last_indexed:  rows[0]?.lastRefreshedAt ?? null,
    pagination: {
      total,
      limit,
      offset,
      next_offset: offset + streams.length < total ? offset + streams.length : null,
    },
    streams,
  });

  return withRateLimitHeaders(res, auth);
}
