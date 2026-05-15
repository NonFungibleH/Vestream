// src/app/api/cron/refresh-rollups/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hourly refresh of the two rollup tables that power /protocols + /status:
//
//   - protocol_summaries (powers ProtocolStats on /protocols/[slug])
//   - status_summary     (powers /api/admin/cache-stats + /status page)
//
// Why this exists separately from seed-cache:
//   The seed-cache cron used to run daily and call both refresh helpers at
//   the end of its run. We disabled the automated seed-cache cron (commit
//   25f5f7d, "manual run each day") but the new event-driven indexers
//   write directly to vesting_streams_cache every 5 min — they DON'T
//   touch the rollup tables. Without an explicit refresher, the rollups
//   freeze at whatever the last manual seed wrote, which then makes the
//   /protocols + /status pages look like data is days stale even though
//   the underlying cache is being updated continuously.
//
// Hourly is fast enough that /protocols TVL numbers stay accurate while
// being light enough that the heavy GROUP BY queries (which scan the
// full 130K-row cache) only fire 24 times per day.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — same convention as the
// other cron routes. Vercel cron sets this automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { refreshProtocolSummaries } from "@/lib/vesting/protocol-stats";
import { refreshStatusSummary } from "@/lib/vesting/cache-stats";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

// Each refresh is a single heavy GROUP BY against vesting_streams_cache.
// 60s is plenty of headroom — the queries take ~5-15s combined depending
// on cache size.
export const maxDuration = 90;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!bearerEquals(authHeader, env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  // PromiseAllSettled — if status_summary fails, we still want
  // protocol_summaries to commit (or vice versa). They're independent
  // table writes serving independent surfaces.
  const settled = await Promise.allSettled([
    refreshProtocolSummaries(),
    refreshStatusSummary(),
  ]);

  const protocolResult = settled[0].status === "fulfilled" ? settled[0].value : null;
  const statusResult   = settled[1].status === "fulfilled" ? settled[1].value : null;
  const errors: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "rejected") {
      const name = ["refreshProtocolSummaries", "refreshStatusSummary"][i];
      const msg  = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[cron/refresh-rollups] ${name} failed:`, r.reason);
      errors.push(`${name}: ${msg}`);
    }
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
  console.log(`[cron/refresh-rollups] complete in ${elapsedSec}s — protocol=${protocolResult?.rows ?? "?"} status=${statusResult?.rows ?? "?"}`);

  return NextResponse.json({
    ok:       errors.length === 0,
    elapsedSec,
    protocolSummaries: protocolResult,
    statusSummary:     statusResult,
    errors:   errors.length > 0 ? errors : undefined,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
