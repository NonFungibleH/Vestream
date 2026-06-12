// src/app/api/notifications/history/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Web sibling of /api/mobile/notifications/log. Powers the "Recent alerts"
// section on /dashboard/alerts so a Pro user can see, from their desktop,
// the paper trail of what we've pushed/emailed them about.
//
// Wider rendering surface than mobile, so the response is richer:
// tokenSymbol + tokenAddress + chainId + protocol, all best-effort from
// the vesting cache. Falls back to "UNKNOWN" cleanly when the cache row
// has been evicted.
//
// Iron-session gated (same gate as the rest of /api/notifications/*).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { notificationsSent, vestingStreamsCache } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUserByAddress(session.address);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(MAX_LIMIT, Math.floor(limitParam))
    : DEFAULT_LIMIT;

  const rows = await db
    .select({
      id:              notificationsSent.id,
      streamId:        notificationsSent.streamId,
      unlockTimestamp: notificationsSent.unlockTimestamp,
      sentAt:          notificationsSent.sentAt,
    })
    .from(notificationsSent)
    .where(eq(notificationsSent.userId, user.id))
    .orderBy(desc(notificationsSent.sentAt))
    .limit(limit);

  if (rows.length === 0) return NextResponse.json({ items: [] });

  // Enrich with cached stream metadata in one IN query. The cache row's
  // streamId matches the {protocol}-{chainId}-{nativeId} composite stored
  // in notifications_sent.
  const streamIds = Array.from(new Set(rows.map((r) => r.streamId).filter((id) => id !== "__test__")));
  const meta = new Map<string, {
    tokenSymbol:  string | null;
    tokenAddress: string | null;
    chainId:      number | null;
    protocol:     string | null;
  }>();
  if (streamIds.length > 0) {
    const cacheRows = await db
      .select({
        streamId:     vestingStreamsCache.streamId,
        tokenSymbol:  vestingStreamsCache.tokenSymbol,
        tokenAddress: vestingStreamsCache.tokenAddress,
        chainId:      vestingStreamsCache.chainId,
        protocol:     vestingStreamsCache.protocol,
      })
      .from(vestingStreamsCache)
      .where(inArray(vestingStreamsCache.streamId, streamIds));
    for (const c of cacheRows) {
      meta.set(c.streamId, {
        tokenSymbol:  c.tokenSymbol  ?? null,
        tokenAddress: c.tokenAddress ?? null,
        chainId:      c.chainId      ?? null,
        protocol:     c.protocol     ?? null,
      });
    }
  }

  const items = rows.map((r) => {
    const m = meta.get(r.streamId);
    return {
      id:           r.id,
      streamId:     r.streamId,
      isTest:       r.streamId === "__test__",
      tokenSymbol:  r.streamId === "__test__" ? "TEST" : (m?.tokenSymbol ?? "UNKNOWN"),
      tokenAddress: m?.tokenAddress ?? null,
      chainId:      m?.chainId      ?? null,
      protocol:     m?.protocol     ?? null,
      sentAt:       r.sentAt.toISOString(),
      eventTime:    r.unlockTimestamp.toISOString(),
    };
  });

  return NextResponse.json({ items });
}
