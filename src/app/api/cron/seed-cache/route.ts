// src/app/api/cron/seed-cache/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Populates the `vestingStreamsCache` table with real vesting streams from
// every adapter × mainnet chain.
//
// Why a cron: before this job, the cache only filled when a visitor searched
// their own wallet. Public /protocols/* landing pages would start life with
// "0 streams indexed" until organic traffic rolled in. This endpoint runs on
// a Vercel cron schedule and seeds the cache ahead of demand.
//
// Two modes:
//   - incremental (default, daily) — SEED_LIMIT=500 recipients per job.
//     Catches new streams since the previous pass.
//   - deep (?mode=deep, ad-hoc or weekly) — DEEP_SEED_LIMIT=5000 recipients
//     per job via subgraph skip pagination. Used to backfill historical
//     coverage after a schema change, a coverage audit, or an initial deploy.
//
// ── Fan-out pattern (May 2026) ─────────────────────────────────────────────
// One Vercel function invocation only gets 300s. The previous "run all jobs
// in this single invocation" pattern timed out reliably whenever PinkSale's
// 4-chain multicall walk landed at the front of the queue — every protocol
// after PinkSale never refreshed.
//
// Fix: when the route is hit WITHOUT a `?group=` param, it acts as a
// dispatcher. It fires three self-fetches in parallel — one per SEED_GROUPS
// entry — and returns 202 immediately. Each of those self-fetches is its
// own independent function invocation, so each gets a fresh 300s budget.
// Same single Vercel cron entry, three independent runtimes.
//
// When the route is hit WITH `?group=heavy|solana|subgraphs`, it runs only
// that group inline. This is the "leaf" path that the dispatcher's fetches
// hit; it's also useful for ad-hoc terminal reruns.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — same pattern as demo-push.
//       The fan-out forwards the same Bearer header to each child fetch.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import {
  seedAll,
  summariseRun,
  parseSeedGroup,
  SEED_GROUPS,
  type SeedMode,
  type SeedGroup,
} from "@/lib/vesting/seeder";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

// Each group fits inside 300s. The dispatcher path returns 202 in <1s.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

function parseMode(req: NextRequest): SeedMode {
  const raw = req.nextUrl.searchParams.get("mode");
  return raw === "deep" ? "deep" : "incremental";
}

/** Build the absolute URL of this same route for self-fan-out fetches. */
function selfUrl(req: NextRequest, group: SeedGroup, mode: SeedMode): string {
  const base = req.nextUrl.origin;
  return `${base}/api/cron/seed-cache?group=${group}&mode=${mode}`;
}

/**
 * Dispatcher path — fires one background fetch per group, returns 202.
 *
 * Each child fetch is its own Vercel function invocation with its own 300s
 * budget. Failures are swallowed per-child so a single group hitting an
 * adapter exception doesn't kill the others.
 *
 * We use `after()` to schedule the fan-out so the response goes out
 * immediately (<1s) even though the children take minutes — the cron
 * caller doesn't need to wait for them.
 */
async function dispatchFanOut(
  req:        NextRequest,
  mode:       SeedMode,
  authHeader: string,
): Promise<NextResponse> {
  after(async () => {
    const startedAt = Date.now();
    const children = SEED_GROUPS.map(async (group) => {
      const url = selfUrl(req, group, mode);
      try {
        const res = await fetch(url, {
          method:  "POST",
          headers: { authorization: authHeader },
          // Don't cache fan-out fetches — every cron tick should fire fresh.
          cache:   "no-store",
        });
        const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
        console.log(`[cron/seed-cache] group="${group}" finished status=${res.status} (+${elapsed}s)`);
      } catch (err) {
        console.error(`[cron/seed-cache] group="${group}" fetch failed:`, err);
      }
    });
    await Promise.allSettled(children);
    const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
    console.log(`[cron/seed-cache] fan-out complete in ${elapsed}s — ${SEED_GROUPS.length} groups dispatched`);
  });

  return NextResponse.json({
    ok:        true,
    mode,
    accepted:  true,
    fanOut:    SEED_GROUPS,
    message:   `Dispatched ${SEED_GROUPS.length} background seed groups in parallel. Each group has its own 300s budget. Poll /api/admin/cache-stats in 5–10 min.`,
    startedAt: new Date().toISOString(),
  }, { status: 202 });
}

/**
 * Leaf path — runs a single group's jobs IN THE BACKGROUND via `after()`,
 * returns 202 immediately.
 *
 * Was inline until 2026-05-03. The inline path hit Cloudflare's ~100s
 * gateway timeout (524 errors) for the heavy group (PinkSale × 4 chains
 * routinely takes 2-3 min). Vercel itself allows 300s — the bottleneck
 * was the CDN in front of vestream.io.
 *
 * Background pattern matches the dispatcher: caller (human OR dispatcher
 * self-fetch) gets a sub-second 202 confirming the work is queued, then
 * the seeder runs to completion within Vercel's maxDuration (300s).
 */
function runOneGroup(group: SeedGroup, mode: SeedMode): NextResponse {
  after(async () => {
    const startedAt = Date.now();
    try {
      const results = await seedAll(mode, group);
      const summary = summariseRun(results);
      const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
      console.log(`[cron/seed-cache] group="${group}" mode="${mode}" complete in ${elapsed}s —`, summary);
      // Fresh data landed in vesting_streams_cache. Bust the
      // /protocols + /status page caches so users see the new freshness
      // matrix on their next pageview instead of waiting out the 5-min
      // unstable_cache TTL. Both pages tag this same key.
      try {
        revalidateTag("protocols-page", "max");
        revalidateTag("status-page",    "max");
      } catch (err) {
        console.warn(`[cron/seed-cache] revalidateTag failed (non-fatal):`, err);
      }
    } catch (err) {
      console.error(`[cron/seed-cache] group="${group}" job failed:`, err);
    }
  });
  return NextResponse.json({
    ok:        true,
    group,
    mode,
    accepted:  true,
    message:   `Group "${group}" queued in background. Check Vercel logs for completion.`,
    startedAt: new Date().toISOString(),
  }, { status: 202 });
}

async function handle(req: NextRequest) {
  // Pull the header once — used both for the constant-time auth check
  // AND the fan-out (each child invocation re-uses the same bearer).
  const authHeader = req.headers.get("authorization");
  if (!bearerEquals(authHeader, env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode  = parseMode(req);
  const group = parseSeedGroup(req.nextUrl.searchParams.get("group"));
  const sync  = req.nextUrl.searchParams.get("sync") === "1";

  // Diagnostic sync path: blocks until seedAll() completes and returns the
  // actual per-job results. Use sparingly — caller pays the full latency
  // (potentially 200s+ for the heavy group). Required for debugging when
  // the background `after()` path swallows errors silently.
  if (sync && group) {
    const startedAt = Date.now();
    try {
      const results = await seedAll(mode, group);
      const summary = summariseRun(results);
      return NextResponse.json({
        ok:      true,
        group,
        mode,
        elapsedSec: Math.round((Date.now() - startedAt) / 100) / 10,
        summary,
        results: results.map((r) => ({
          adapterId:            r.adapterId,
          chainId:              r.chainId,
          recipientsDiscovered: r.recipientsDiscovered,
          streamsFetched:       r.streamsFetched,
          streamsWritten:       r.streamsWritten,
          batchFetchErrors:     r.batchFetchErrors,
          batchWriteErrors:     r.batchWriteErrors,
          error:                r.error ?? null,
        })),
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        group,
        mode,
        elapsedSec: Math.round((Date.now() - startedAt) / 100) / 10,
        error: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }

  // Leaf path — caller (or dispatcher) asked for a specific group. Run inline.
  if (group) {
    return runOneGroup(group, mode);
  }

  // Dispatcher path — fan out into 3 background self-fetches and return 202.
  // authHeader is non-null here — bearerEquals() above returns false on null
  // and we'd have returned 401 already. The explicit `?? ""` keeps TS happy
  // without weakening any runtime invariant.
  return dispatchFanOut(req, mode, authHeader ?? "");
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
