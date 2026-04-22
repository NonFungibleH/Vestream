// src/app/api/unlocks/upcoming/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns the N most imminent upcoming unlocks across all indexed protocols.
// Powers the /unlocks "next unlocks" ticker so the page feels forward-looking,
// not just a history log.
//
// Limit bounded to [1, 20] to prevent query abuse — default 10.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getUpcomingUnlocksAcross, type UnlockSummary } from "@/lib/vesting/protocol-stats";

export const dynamic = "force-dynamic";

export interface UpcomingUnlocksResponse {
  ok:    true;
  nowMs: number;
  unlocks: UnlockSummary[];
}

export async function GET(req: NextRequest) {
  const rawLimit = Number(new URL(req.url).searchParams.get("limit") ?? "10");
  const limit    = Math.max(1, Math.min(20, Number.isFinite(rawLimit) ? rawLimit : 10));

  try {
    const unlocks = await getUpcomingUnlocksAcross(limit);
    return NextResponse.json(
      {
        ok:    true,
        nowMs: Date.now(),
        unlocks,
      } satisfies UpcomingUnlocksResponse,
      {
        // Edge-cache lightly so we don't hit the DB on every visitor
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      },
    );
  } catch (err) {
    console.error("[upcoming] failed:", err);
    return NextResponse.json({ error: "Failed to load upcoming unlocks" }, { status: 500 });
  }
}
