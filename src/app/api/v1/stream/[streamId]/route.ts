/**
 * GET /api/v1/stream/{streamId}
 *
 * Returns a single vesting stream by its composite ID.
 * Format: {protocol}-{chainId}-{nativeId}  e.g. "sablier-1-12345"
 *
 * Auth: Authorization: Bearer vstr_live_...
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey, authErrorResponse, withRateLimitHeaders } from "@/lib/api-key-auth";
import { VestingStream } from "@/lib/vesting/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> }
) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);

  const { streamId } = await params;

  const [row] = await db
    .select()
    .from(vestingStreamsCache)
    .where(eq(vestingStreamsCache.streamId, streamId))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      {
        error: "Stream not found. The stream may not have been indexed yet — " +
               "it will appear after the recipient wallet is queried via /api/v1/wallet/{address}/vestings.",
      },
      { status: 404 }
    );
  }

  const stream = row.streamData as unknown as VestingStream;

  const res = NextResponse.json({
    stream,
    last_indexed: row.lastRefreshedAt,
    first_seen:   row.firstSeenAt,
  });

  return withRateLimitHeaders(res, auth);
}
