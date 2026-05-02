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
import {
  seedAll,
  summariseRun,
  parseSeedGroup,
  SEED_GROUPS,
  type SeedMode,
  type SeedGroup,
} from "@/lib/vesting/seeder";
import { env } from "@/lib/env";

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

/** Leaf path — runs a single group's jobs inline up to maxDuration. */
async function runOneGroup(group: SeedGroup, mode: SeedMode): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const results = await seedAll(mode, group);
    const summary = summariseRun(results);
    const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
    console.log(`[cron/seed-cache] group="${group}" mode="${mode}" complete in ${elapsed}s —`, summary);
    return NextResponse.json({
      ok:            true,
      group,
      mode,
      elapsedSec:    elapsed,
      summary,
      perJobResults: results,
    });
  } catch (err) {
    console.error(`[cron/seed-cache] group="${group}" job failed:`, err);
    return NextResponse.json({ error: "Seeder job failed", group }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode  = parseMode(req);
  const group = parseSeedGroup(req.nextUrl.searchParams.get("group"));

  // Leaf path — caller (or dispatcher) asked for a specific group. Run inline.
  if (group) {
    return runOneGroup(group, mode);
  }

  // Dispatcher path — fan out into 3 background self-fetches and return 202.
  return dispatchFanOut(req, mode, authHeader);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
