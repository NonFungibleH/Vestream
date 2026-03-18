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
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { authenticateApiKey, authErrorResponse, withRateLimitHeaders } from "@/lib/api-key-auth";
import { VestingStream } from "@/lib/vesting/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  // Auth
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);

  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Invalid wallet address. Expected a 0x EVM address." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const protocolFilter  = searchParams.get("protocol")?.split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
  const chainFilter     = searchParams.get("chain")?.split(",").map(c => parseInt(c.trim())).filter(n => !isNaN(n));
  const activeOnly      = searchParams.get("active_only") === "true";

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

  const rows = await db
    .select()
    .from(vestingStreamsCache)
    .where(and(...conditions))
    .orderBy(vestingStreamsCache.endTime);

  const streams: VestingStream[] = rows.map(r => r.streamData as unknown as VestingStream);

  const res = NextResponse.json({
    wallet:        address.toLowerCase(),
    count:         streams.length,
    last_indexed:  rows[0]?.lastRefreshedAt ?? null,
    streams,
  });

  return withRateLimitHeaders(res, auth);
}
