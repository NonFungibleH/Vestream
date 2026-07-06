// src/app/api/cron/refresh-rollups/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hourly refresh of the two rollup tables that power /protocols + /status:
//
//   - protocol_summaries     (powers ProtocolStats on /protocols/[slug])
//   - status_summary         (powers /api/admin/cache-stats + /status page)
//   - token_vesting_rollups  (powers the Vesting Explorer's per-token
//                             aggregates — total locked, top-holder %,
//                             wallet/round counts, span, cliff. Moved OFF
//                             the request path here to kill the recurring
//                             Cloudflare 524s; the explorer now reads this
//                             table instead of aggregating live.)
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
import { revalidateTag, revalidatePath } from "next/cache";
import { refreshProtocolSummaries } from "@/lib/vesting/protocol-stats";
import { refreshStatusSummary } from "@/lib/vesting/cache-stats";
import { refreshTokenRollups } from "@/lib/vesting/token-rollups";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

// Flush the ISR Data Cache tags that wrap the pages these rollups feed.
// Refreshing the DB tables is NOT enough on its own: /protocols/[slug] and
// /protocols wrap their data in `unstable_cache` with a 1h TTL (see
// CACHE_TTL_SECONDS in those pages), so without an explicit tag flush the UI
// keeps serving the pre-refresh numbers for up to an hour. The seed-cache cron
// already does this; refresh-rollups did NOT, which is why a fresh rollup could
// still show stale counts. Next 16 requires the cache-profile arg ("max" =
// expire as fully as possible). Non-fatal — a flush failure just means the
// pages catch up on their own TTL.
function flushTags(tags: string[]): void {
  try {
    for (const t of tags) revalidateTag(t, "max");
  } catch (e) {
    console.warn("[cron/refresh-rollups] revalidateTag failed (non-fatal):", e);
  }
}

// Run the three refreshes SEQUENTIALLY, awaited to completion.
//
// The previous version wrapped all three in `after()` and ran them in PARALLEL.
// Two problems: (1) `after()` work is best-effort on Vercel and gets killed, so
// the rollups silently FROZE on 2026-06-21 — the Vesting Explorer's Upcoming tab
// (which reads token_vesting_rollups) went blank, and Team Finance (re-enabled
// 2026-06-30) never got indexed at all; (2) three heavy GROUP BYs hitting the
// pooler at once amplified contention. Vercel cron invokes the function directly
// (it is NOT subject to Cloudflare's 100s gateway cap — the tvl-snapshot cron
// already runs ~191s synchronously this way), so we simply AWAIT the work.
// Sequential keeps peak pooler load low; total ~170s, comfortably under the 300s
// maxDuration. A per-step try/catch means one failure doesn't sink the others.
//
// CHEAP-FIRST ordering (2026-07-06): the two summary refreshes are quick GROUP
// BYs; the token rollup is the heavy one. Running the summaries first — and
// flushing their page caches immediately — means a slow/timing-out token rollup
// can never starve the protocol-hero + /status stats again (the bug that left
// the Team Finance hero frozen at 504 after a reseed).
async function runAll(): Promise<{ tokens: number | null; protocol: number | null; status: number | null }> {
  const out = { tokens: null as number | null, protocol: null as number | null, status: null as number | null };

  // Cheap summaries first — they power the protocol hero + /status.
  try { out.protocol = (await refreshProtocolSummaries()).rows; } catch (e) { console.error("[cron/refresh-rollups] refreshProtocolSummaries failed:", e); }
  try { out.status   = (await refreshStatusSummary()).rows;     } catch (e) { console.error("[cron/refresh-rollups] refreshStatusSummary failed:", e); }
  // Flush the summary-backed caches now, so even if the heavy token rollup
  // below stalls, the hero/index/status pages already reflect fresh numbers.
  flushTags(["protocol-page", "protocols-page", "status-page"]);

  // Heavy token rollup last — the Explorer's per-token aggregates.
  try { out.tokens = (await refreshTokenRollups()).rows; } catch (e) { console.error("[cron/refresh-rollups] refreshTokenRollups failed:", e); }
  // Flush the explorer/calendar caches after the token rollup lands.
  flushTags(["protocol-unlocks", "protocols-page"]);
  // The sitemap reads token_vesting_rollups (top symbols + tokens), which we
  // just refreshed — regenerate it so its ~2k long-tail URLs stay fresh AND
  // so it recovers from the empty build-time version after every deploy
  // (time-based ISR would otherwise hold that empty version for up to an hour).
  try { revalidatePath("/sitemap.xml"); } catch (e) { console.warn("[cron/refresh-rollups] sitemap revalidate failed (non-fatal):", e); }

  return out;
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!bearerEquals(authHeader, env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `?background=true` keeps a fire-and-forget path for MANUAL calls made through
  // the Cloudflare-fronted vestream.io domain (which would 524 at 100s on the
  // synchronous path). The scheduled Vercel cron hits the function directly and
  // uses the default synchronous path, which reliably runs to completion.
  if (req.nextUrl.searchParams.get("background") === "true") {
    after(async () => {
      const t = Date.now();
      const r = await runAll();
      console.log(`[cron/refresh-rollups] background complete in ${((Date.now() - t) / 1000).toFixed(1)}s — ${JSON.stringify(r)}`);
    });
    return NextResponse.json({ ok: true, accepted: true, message: "Refresh running in background." }, { status: 202 });
  }

  const startedAt = Date.now();
  const result = await runAll();
  const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
  console.log(`[cron/refresh-rollups] complete in ${elapsedSec}s — ${JSON.stringify(result)}`);
  return NextResponse.json({ ok: true, durationSec: elapsedSec, ...result });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
