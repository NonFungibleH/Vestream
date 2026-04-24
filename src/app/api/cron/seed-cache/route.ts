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
//     Runs in ~2 min, catches new streams since the previous pass.
//   - deep (?mode=deep, ad-hoc or weekly) — DEEP_SEED_LIMIT=5000 recipients
//     per job via subgraph skip pagination. Several minutes of runtime. Used
//     to backfill historical coverage after a schema change, a coverage
//     audit, or an initial deploy.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — same pattern as demo-push.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { seedAll, summariseRun, type SeedMode } from "@/lib/vesting/seeder";
import { env } from "@/lib/env";

// Seeder jobs can take a while (many subgraph round-trips). Lift the default
// 10s Vercel function timeout with the app-router config.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

function parseMode(req: NextRequest): SeedMode {
  const raw = req.nextUrl.searchParams.get("mode");
  return raw === "deep" ? "deep" : "incremental";
}

async function handle(req: NextRequest) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode      = parseMode(req);
  const startedAt = Date.now();

  try {
    const results = await seedAll(mode);
    const summary = summariseRun(results);
    const elapsed = Math.round((Date.now() - startedAt) / 100) / 10; // tenths of seconds

    return NextResponse.json({
      ok:            true,
      mode,
      elapsedSec:    elapsed,
      summary,
      perJobResults: results,
    });
  } catch (err) {
    console.error("[cron/seed-cache] job failed:", err);
    return NextResponse.json({ error: "Seeder job failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
