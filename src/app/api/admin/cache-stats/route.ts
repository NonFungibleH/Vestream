// src/app/api/admin/cache-stats/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only per-(protocol × chain) rollup of the vesting_streams_cache table.
//
// Purpose: make "is the seeder actually producing data everywhere?" a
// one-HTTP-request question instead of a guessing-game from UI widgets.
// The /unlocks (soon /protocols) page summarises everything into a single TVL
// bar per protocol, which can hide "chain X has 0 streams" behind chain Y
// carrying the numbers. This endpoint is the ground-truth readout.
//
// Gated by `vestr_admin` cookie — same gate the other admin surfaces use.
// Response is purely diagnostic — no PII, no raw stream data.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { getCacheStatsCells, type CacheStatsCell } from "@/lib/vesting/cache-stats";

export const dynamic = "force-dynamic";

export interface CacheStatsResponse {
  ok:        true;
  nowMs:     number;
  totalRows: number;
  cells:     CacheStatsCell[];
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cells     = await getCacheStatsCells();
    const totalRows = cells.reduce((sum, c) => sum + c.streams, 0);

    return NextResponse.json(
      {
        ok:       true,
        nowMs:    Date.now(),
        totalRows,
        cells,
      } satisfies CacheStatsResponse,
    );
  } catch (err) {
    console.error("[admin/cache-stats] query failed:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
