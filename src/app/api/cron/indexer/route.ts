// src/app/api/cron/indexer/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Event-driven indexer cron route.
//
// Generic — picks up the protocol/chain pair from query params and dispatches
// to the matching registered Indexer. One cron entry per (protocol, chainId)
// in vercel.json. Each tick scans a bounded block window (~5000 blocks for
// UNCX-VM, tunable per indexer) and writes any new VestingStream rows to
// vesting_streams_cache.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` — Vercel cron injects this
//       when CRON_SECRET is set as a project env var. Manual triggers use
//       `curl -H "Authorization: Bearer $CRON_SECRET"`.
//
// Usage:
//   GET  /api/cron/indexer?protocol=uncx-vm&chainId=1
//   POST /api/cron/indexer?protocol=uncx-vm&chainId=1
//
// Why both methods: Vercel cron uses GET; manual ops scripts default to POST.
// Both routes converge on the same handler.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { findIndexer, runIndexer } from "@/lib/vesting/indexer";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

// Indexer ticks are fast (single window, single multicall, ~few hundred
// streams max). 60s is generous; most runs complete in <5s. We don't need
// the full 300s budget the seed-cache route requires.
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!bearerEquals(authHeader, env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const protocol = req.nextUrl.searchParams.get("protocol");
  const chainRaw = req.nextUrl.searchParams.get("chainId");

  if (!protocol || !chainRaw) {
    return NextResponse.json(
      {
        error:   "Missing required params: protocol, chainId",
        example: "/api/cron/indexer?protocol=uncx-vm&chainId=1",
      },
      { status: 400 },
    );
  }

  const chainId = Number(chainRaw);
  if (!Number.isFinite(chainId)) {
    return NextResponse.json({ error: `Invalid chainId: ${chainRaw}` }, { status: 400 });
  }

  const indexer = findIndexer(protocol, chainId);
  if (!indexer) {
    return NextResponse.json(
      { error: `No indexer registered for (protocol="${protocol}", chainId=${chainId})` },
      { status: 404 },
    );
  }

  try {
    const result = await runIndexer(indexer);
    return NextResponse.json({
      ok:         !result.error,
      protocol:   result.protocol,
      chainId:    result.chainId,
      fromBlock:  result.fromBlock.toString(),
      toBlock:    result.toBlock.toString(),
      eventCount: result.eventCount,
      durationMs: result.durationMs,
      skipped:    result.skipped,
      error:      result.error ?? null,
    }, { status: result.error ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/indexer] unhandled error for ${protocol}/${chainId}:`, err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
