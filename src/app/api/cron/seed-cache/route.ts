// src/app/api/cron/seed-cache/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Populates the `vestingStreamsCache` table with a representative sample of
// real vesting streams from every subgraph-based adapter × mainnet chain.
//
// Why a cron: before this job, the cache only filled when a visitor searched
// their own wallet. That meant public /protocols/* landing pages started life
// with "0 streams indexed" and stayed that way until organic traffic rolled
// in. This endpoint runs on a Vercel cron schedule (every 6 hours) and seeds
// ~200 recipients × 4 adapters × 4 chains ≈ 3.2K stream rows per run. After
// the first run the public pages show live, meaningful numbers.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — same pattern as demo-push.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { seedAll, summariseRun } from "@/lib/vesting/seeder";
import { env } from "@/lib/env";

// Seeder jobs can take a while (many subgraph round-trips). Lift the default
// 10s Vercel function timeout with the app-router config.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const results = await seedAll();
    const summary = summariseRun(results);
    const elapsed = Math.round((Date.now() - startedAt) / 100) / 10; // tenths of seconds

    return NextResponse.json({
      ok:            true,
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
