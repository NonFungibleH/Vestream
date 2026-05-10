// src/app/api/admin/cache-stats/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only per-(protocol × chain) rollup of the vesting_streams_cache table.
//
// Purpose: make "is the seeder actually producing data everywhere?" a
// one-HTTP-request question instead of a guessing-game from UI widgets.
// The /protocols page summarises everything into a single TVL
// bar per protocol, which can hide "chain X has 0 streams" behind chain Y
// carrying the numbers. This endpoint is the ground-truth readout.
//
// Gated by `vestr_admin` cookie — same gate the other admin surfaces use.
// Response is purely diagnostic — no PII, no raw stream data.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  getCacheStatsCells,
  getMaxLastRefreshedAt,
  type CacheStatsCell,
} from "@/lib/vesting/cache-stats";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export interface CacheStatsResponse {
  ok:        true;
  nowMs:     number;
  totalRows: number;
  /**
   * Set when ?live=1 is passed. The default rollup path reads from
   * `status_summary`, which is only updated at the end of a successful
   * seedAll() run — so a stale rollup is ambiguous between "seeder
   * never ran" and "seeder ran but died before refreshStatusSummary".
   * `liveMaxLastRefreshedAt` queries vesting_streams_cache directly:
   * if this is recent but `cells[].freshestSec` is 4d-stale, the
   * seeder IS writing and the rollup-refresh step is what's broken.
   */
  liveMaxLastRefreshedAtSec?: number | null;
  cells:     CacheStatsCell[];
}

// Accept admin cookie OR Bearer token (CRON_SECRET) — same dual-auth pattern
// as /api/admin/seed-diagnostic. Bearer lets ops invoke from a terminal
// without the cookie-extraction dance; cookie is still the canonical
// admin gate.
function isAuthorized(req: NextRequest): boolean {
  if (isAdminAuthorized(req)) return true;
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const live = req.nextUrl.searchParams.get("live") === "1";

  try {
    const cells     = await getCacheStatsCells();
    const totalRows = cells.reduce((sum, c) => sum + c.streams, 0);

    // ?live=1 — bypass the status_summary rollup and read MAX(last_refreshed_at)
    // straight from vesting_streams_cache. Used to disambiguate "seeder didn't
    // run" from "seeder ran but the rollup-refresh step failed". Cheap (single
    // index-only aggregate, ~10ms), but kept opt-in so the default fast path
    // remains a single read against the small rollup table.
    let liveMaxLastRefreshedAtSec: number | null | undefined = undefined;
    if (live) {
      try {
        liveMaxLastRefreshedAtSec = await getMaxLastRefreshedAt();
      } catch (err) {
        console.error("[admin/cache-stats] live max query failed:", err);
        liveMaxLastRefreshedAtSec = null;
      }
    }

    return NextResponse.json(
      {
        ok:       true,
        nowMs:    Date.now(),
        totalRows,
        ...(live ? { liveMaxLastRefreshedAtSec } : {}),
        cells,
      } satisfies CacheStatsResponse,
    );
  } catch (err) {
    console.error("[admin/cache-stats] query failed:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
