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
// ── Per-group cron pattern (May 2026 — refactor v2) ─────────────────────────
// One Vercel function invocation only gets 300s. Running every adapter in
// one invocation reliably timed out whenever PinkSale's 4-chain multicall
// walk landed at the front — every protocol after PinkSale never refreshed.
//
// The earlier fix (v1, abandoned May 2026) had a single cron dispatch a
// background fan-out via `after()` + three self-`fetch()` calls. Vercel
// strips the `Authorization` header on internal function-to-function
// fetches, so the three children every 401'd in 0.1s and zero data ever
// refreshed. Logs:
//   group="heavy"     finished status=401 (+0.1s)
//   group="subgraphs" finished status=401 (+0.1s)
//   group="solana"    finished status=401 (+0.1s)
//
// v2 fix: kill the self-fanout entirely. Each of the four SeedGroups gets
// its own cron entry in vercel.json that calls this route with an explicit
// `?group=heavy|subgraphs|sablier|solana` param. Vercel's scheduler injects
// the Authorization header on every cron call — never gets stripped
// because those are inbound calls, not internal self-fetches. Each cron
// call is its own function invocation with its own 300s budget. Same
// total runtime as v1; one fewer hop; no auth fragility.
//
// `sablier` extracted from `subgraphs` 2026-05-13 — Sablier alone takes
// 80-90s × 4 chains and was monopolising the subgraphs slot, leaving the
// other ~35 subgraph jobs timing out at Vercel's 300s limit. Splitting
// gives each lane its own runway.
//
// When the route is hit WITH `?group=…`, it runs that group via `after()`
// in the background. Hit without `?group=` returns 400 with a helpful
// message — bare `/api/cron/seed-cache` is no longer a valid cron target.
//
// For ad-hoc manual deep seeds (rare), curl all four paths in parallel:
//   for g in heavy subgraphs sablier solana; do
//     curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//       "https://www.vestream.io/api/cron/seed-cache?group=$g&mode=deep" &
//   done; wait
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — Vercel cron sets this
//       automatically when CRON_SECRET is set as a Vercel env var.
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

// Each group fits inside 300s. Per-group paths schedule via `after()` so
// the response returns 202 in <1s even while the work runs in background.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

function parseMode(req: NextRequest): SeedMode {
  const raw = req.nextUrl.searchParams.get("mode");
  return raw === "deep" ? "deep" : "incremental";
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

  // Per-group path — Vercel cron / curl asked for a specific group. Run inline.
  if (group) {
    return runOneGroup(group, mode);
  }

  // No `?group=` provided — return 400 with a usage hint. The fan-out
  // dispatcher used to live here; killed in v2 (May 2026) after Vercel's
  // internal auth-header stripping made it unworkable. Each SeedGroup now
  // has its own cron entry in vercel.json. See the file header for the
  // history + the recommended manual-trigger curl loop.
  return NextResponse.json(
    {
      error: `Missing 'group' param. Use one of: ${SEED_GROUPS.join(", ")}.`,
      example: `/api/cron/seed-cache?group=heavy&mode=incremental`,
      docs: "https://github.com/NonFungibleH/Vestream/tree/main/src/app/api/cron/seed-cache",
    },
    { status: 400 },
  );
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
