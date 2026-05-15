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
import { after } from "next/server";
import { refreshProtocolSummaries } from "@/lib/vesting/protocol-stats";
import { refreshStatusSummary } from "@/lib/vesting/cache-stats";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

// Each refresh is a single heavy GROUP BY against vesting_streams_cache.
// Vercel side allows up to 300s; Cloudflare in front of vestream.io
// caps gateway responses at 100s. Combined refresh time can exceed
// 100s under load, so we return 202 immediately and run the work in
// after() — same pattern as seed-cache's per-group fan-out.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!bearerEquals(authHeader, env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Background execution — caller gets sub-second 202; work runs to
  // completion within Vercel's maxDuration (300s) even when both
  // refreshes together push past Cloudflare's 100s gateway timeout.
  // PromiseAllSettled inside so a failure in one doesn't block the
  // other from committing.
  after(async () => {
    const startedAt = Date.now();
    const settled = await Promise.allSettled([
      refreshProtocolSummaries(),
      refreshStatusSummary(),
    ]);
    const protocolResult = settled[0].status === "fulfilled" ? settled[0].value : null;
    const statusResult   = settled[1].status === "fulfilled" ? settled[1].value : null;
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "rejected") {
        const name = ["refreshProtocolSummaries", "refreshStatusSummary"][i];
        console.error(`[cron/refresh-rollups] ${name} failed:`, r.reason);
      }
    }
    const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
    console.log(`[cron/refresh-rollups] complete in ${elapsedSec}s — protocol=${protocolResult?.rows ?? "?"} status=${statusResult?.rows ?? "?"}`);
  });

  return NextResponse.json({
    ok:        true,
    accepted:  true,
    message:   "Rollup refresh queued in background. Check Vercel logs for completion.",
    startedAt: new Date().toISOString(),
  }, { status: 202 });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
