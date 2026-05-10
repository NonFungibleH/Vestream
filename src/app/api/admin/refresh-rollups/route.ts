// src/app/api/admin/refresh-rollups/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manual trigger for the two materialised rollup tables that drive
// /status and /protocols:
//
//   • status_summary       — populated by refreshStatusSummary()
//   • protocol_summaries   — populated by refreshProtocolSummaries()
//
// Both run automatically at the END of every seedAll() group invocation.
// This endpoint exists for two cases:
//
//   1. Rollup recovery: a Supabase pooler drop killed the rollup-refresh
//      step at end-of-cron. The seeder still wrote fresh rows to
//      vesting_streams_cache, but /status reads from the rollups so the
//      page shows 4d-stale until the next successful cron. POST here
//      rebuilds the rollups WITHOUT re-running the (slow) seeder.
//
//   2. Post-deploy migration: a new column or a schema change lands in
//      cache-stats / protocol-stats. POST here fills the rollups with
//      the new shape without waiting for the 03:00 UTC cron.
//
// Auth: same dual-auth as /api/admin/cache-stats — admin cookie OR
// Authorization: Bearer ${CRON_SECRET}.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { refreshStatusSummary } from "@/lib/vesting/cache-stats";
import { refreshProtocolSummaries } from "@/lib/vesting/protocol-stats";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  if (isAdminAuthorized(req)) return true;
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  // Each refresh has its own try/catch so a failure in one rollup
  // doesn't block the other (status and protocols are independent
  // surfaces with independent rollup tables).
  let statusRows: number | null = null;
  let statusError: string | null = null;
  try {
    const r = await refreshStatusSummary();
    statusRows = r.rows;
  } catch (err) {
    statusError = err instanceof Error ? err.message : String(err);
    console.error("[admin/refresh-rollups] status_summary refresh failed:", err);
  }

  let protocolRows: number | null = null;
  let protocolError: string | null = null;
  try {
    const r = await refreshProtocolSummaries();
    protocolRows = r.rows;
  } catch (err) {
    protocolError = err instanceof Error ? err.message : String(err);
    console.error("[admin/refresh-rollups] protocol_summaries refresh failed:", err);
  }

  const ok = statusError === null && protocolError === null;
  return NextResponse.json(
    {
      ok,
      durationMs: Date.now() - startedAt,
      statusSummary:     { rows: statusRows,   error: statusError   },
      protocolSummaries: { rows: protocolRows, error: protocolError },
    },
    { status: ok ? 200 : 500 },
  );
}
