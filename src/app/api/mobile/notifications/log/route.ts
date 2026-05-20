// GET → returns the most recent N notifications sent to this user.
//       Powers the "Recent alerts" section at the bottom of the
//       mobile Alerts tab so the user can see a paper trail of
//       what they've been pushed about.
//
// 2026-05-20: introduced. The mobile-side ask was "let users see
// what we've sent them, so they can confirm alerts are firing and
// understand the cadence." Pulls from the `notifications_sent`
// dedup table directly — no need for a separate log table.
//
// Response shape:
//   { items: [{ streamId, tokenSymbol, sentAt, eventTime }] }
// Items are sorted newest-first. tokenSymbol is best-effort: we
// look up the latest cache row for the stream. If the cache has
// been evicted (rare on a 24h-gcTime cache), tokenSymbol may be
// the streamId fallback.

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { notificationsSent, vestingStreamsCache } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT     = 100;

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(MAX_LIMIT, Math.floor(limitParam))
      : DEFAULT_LIMIT;

  // Pull the most-recent N rows for this user.
  const rows = await db
    .select({
      id:              notificationsSent.id,
      streamId:        notificationsSent.streamId,
      unlockTimestamp: notificationsSent.unlockTimestamp,
      sentAt:          notificationsSent.sentAt,
    })
    .from(notificationsSent)
    .where(eq(notificationsSent.userId, userId))
    .orderBy(desc(notificationsSent.sentAt))
    .limit(limit);

  if (rows.length === 0) return NextResponse.json({ items: [] });

  // Resolve token symbols in one batch using vesting_streams_cache.
  // The cache row's `id` matches the streamId we stored (same
  // "{protocol}-{chainId}-{nativeId}" composite).
  const streamIds = Array.from(new Set(rows.map(r => r.streamId).filter(id => id !== "__test__")));
  let symbolByStreamId: Record<string, string> = {};
  if (streamIds.length > 0) {
    const cacheRows = await db
      .select({
        streamId:    vestingStreamsCache.streamId,
        tokenSymbol: vestingStreamsCache.tokenSymbol,
      })
      .from(vestingStreamsCache)
      .where(inArray(vestingStreamsCache.streamId, streamIds));
    symbolByStreamId = Object.fromEntries(
      cacheRows
        .filter((c): c is { streamId: string; tokenSymbol: string } => typeof c.tokenSymbol === "string")
        .map(c => [c.streamId, c.tokenSymbol]),
    );
  }

  const items = rows.map(r => ({
    id:           r.id,
    streamId:     r.streamId,
    // Test pushes (synthetic stream id "__test__") get a sentinel
    // tokenSymbol the mobile client recognises.
    tokenSymbol:  r.streamId === "__test__"
      ? "TEST"
      : (symbolByStreamId[r.streamId] ?? "UNKNOWN"),
    isTest:       r.streamId === "__test__",
    sentAt:       r.sentAt.toISOString(),
    eventTime:    r.unlockTimestamp.toISOString(),
  }));

  return NextResponse.json({ items });
}
