// src/app/api/unlocks/live-activity/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns a live feed of the most recent on-chain vesting activity across
// every protocol we index. Used by the ticker on /unlocks so the landing page
// feels live — numbers move, rows stream in, the platform never looks idle.
//
// Two shapes are returned:
//
//   - aggregate:  per-protocol totals (streams, active, last indexed) — the
//                 same thing the protocol-cards show, but returned in a
//                 single round-trip so the client can refresh them all.
//
//   - recent:     the N most recently cached/refreshed streams, regardless of
//                 protocol. Powers a scrolling ticker of "just indexed" rows.
//
// Both views are scoped to the platform-wide `vestingStreamsCache` table,
// so they surface activity from ALL users of Vestream, not just the current
// visitor.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export interface LiveActivityRow {
  streamId:    string;
  protocol:    string;        // adapter ID: "sablier" | "hedgey" | ...
  chainId:     number;
  tokenSymbol: string | null;
  recipient:   string;        // lowercase 0x address
  totalAmount: string | null; // stringified bigint
  endTime:     number | null; // unix seconds
  /** ISO timestamp of the latest refresh — drives "X min ago" in the UI. */
  lastRefreshedAt: string;
  /** ISO timestamp of first discovery — distinguishes brand-new rows. */
  firstSeenAt: string;
}

export interface LiveActivityAggregate {
  protocol:        string;
  totalStreams:    number;
  activeStreams:   number;
  lastIndexedAt:   string | null;
}

export interface LiveActivityResponse {
  ok:        true;
  nowMs:     number;
  grand: {
    totalStreams:  number;
    activeStreams: number;
    /** Count of streams first-seen within the last hour. */
    newInLastHour: number;
  };
  aggregate: LiveActivityAggregate[];
  recent:    LiveActivityRow[];
}

export async function GET() {
  try {
    // Per-protocol aggregate stats — one scan of the table
    const aggregateRows = await db
      .select({
        protocol:      vestingStreamsCache.protocol,
        total:         sql<number>`count(*)::int`,
        active:        sql<number>`count(*) filter (where ${vestingStreamsCache.isFullyVested} = false)::int`,
        lastIndexed:   sql<Date | string | null>`max(${vestingStreamsCache.lastRefreshedAt})`,
      })
      .from(vestingStreamsCache)
      .groupBy(vestingStreamsCache.protocol);

    const aggregate: LiveActivityAggregate[] = aggregateRows.map((r) => ({
      protocol:       r.protocol,
      totalStreams:   r.total  ?? 0,
      activeStreams:  r.active ?? 0,
      lastIndexedAt:  toIso(r.lastIndexed),
    }));

    // Most-recent 12 rows across all protocols
    const recentRows = await db
      .select({
        streamId:        vestingStreamsCache.streamId,
        protocol:        vestingStreamsCache.protocol,
        chainId:         vestingStreamsCache.chainId,
        tokenSymbol:     vestingStreamsCache.tokenSymbol,
        recipient:       vestingStreamsCache.recipient,
        endTime:         vestingStreamsCache.endTime,
        streamData:      vestingStreamsCache.streamData,
        firstSeenAt:     vestingStreamsCache.firstSeenAt,
        lastRefreshedAt: vestingStreamsCache.lastRefreshedAt,
      })
      .from(vestingStreamsCache)
      .orderBy(desc(vestingStreamsCache.lastRefreshedAt))
      .limit(12);

    const recent: LiveActivityRow[] = recentRows.map((r) => {
      const sd = r.streamData as { totalAmount?: string };
      return {
        streamId:        r.streamId,
        protocol:        r.protocol,
        chainId:         r.chainId,
        tokenSymbol:     r.tokenSymbol,
        recipient:       r.recipient,
        totalAmount:     sd.totalAmount ?? null,
        endTime:         r.endTime,
        firstSeenAt:     (toIso(r.firstSeenAt) ?? new Date().toISOString()),
        lastRefreshedAt: (toIso(r.lastRefreshedAt) ?? new Date().toISOString()),
      };
    });

    // Grand totals + "new in last hour" for the banner chip
    const grand = aggregate.reduce(
      (acc, a) => {
        acc.totalStreams  += a.totalStreams;
        acc.activeStreams += a.activeStreams;
        return acc;
      },
      { totalStreams: 0, activeStreams: 0 },
    );

    // Pass the timestamp as an ISO string (not a Date object). postgres-js
    // serialises Dates correctly when prepared statements are enabled, but
    // the fallback path used with the PgBouncer transaction pooler throws
    // ERR_INVALID_ARG_TYPE on Date. ISO strings work in both modes.
    const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ newInLastHour = 0 } = { newInLastHour: 0 }] = await db
      .select({ newInLastHour: sql<number>`count(*)::int` })
      .from(vestingStreamsCache)
      .where(sql`${vestingStreamsCache.firstSeenAt} > ${hourAgoIso}`);

    return NextResponse.json(
      {
        ok:    true,
        nowMs: Date.now(),
        grand: { ...grand, newInLastHour },
        aggregate,
        recent,
      } satisfies LiveActivityResponse,
      {
        // Cache briefly at the edge — 10s feels live enough but spares the DB
        headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
      },
    );
  } catch (err) {
    console.error("[live-activity] query failed:", err);
    return NextResponse.json({ error: "Failed to load live activity" }, { status: 500 });
  }
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
