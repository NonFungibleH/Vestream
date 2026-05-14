// src/app/api/admin/indexer-status/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Admin diagnostic for the event-driven indexer.
//
// One row per registered (protocol, chainId), joined against the
// indexer_state table. Surfaces:
//   - lastScannedBlock / lastConfirmedBlock — how far the indexer has caught up
//   - lastRunAt / lastAttemptAt — staleness
//   - lastError — most recent failure (null on success)
//   - lastEventCount — events from the most recent successful tick
//   - rpcHealth — current quarantine snapshot (which providers are sick)
//
// Sister endpoint to /api/admin/cache-stats. Cache-stats answers "is the
// cache populated?"; this answers "are the indexers running?".
//
// Gated by `vestr_admin` cookie OR Bearer CRON_SECRET — same dual-auth as
// the other admin diagnostics.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { indexerState } from "@/lib/db/schema";
import { INDEXERS, getRpcHealthSnapshot } from "@/lib/vesting/indexer";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  if (isAdminAuthorized(req)) return true;
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stateRows = await db.select().from(indexerState);

    // Index state rows by (protocol, chainId) for cheap lookup.
    const stateByKey = new Map(
      stateRows.map((r) => [`${r.protocol}-${r.chainId}`, r]),
    );

    const now = Date.now();
    const rows = INDEXERS.map((indexer) => {
      const state = stateByKey.get(`${indexer.protocol}-${indexer.chainId}`);
      const lastRunAt     = state?.lastRunAt?.getTime() ?? null;
      const lastAttemptAt = state?.lastAttemptAt?.getTime() ?? null;
      return {
        protocol:           indexer.protocol,
        chainId:            indexer.chainId,
        genesisBlock:       indexer.genesisBlock.toString(),
        maxBlocksPerScan:   indexer.maxBlocksPerScan.toString(),
        reorgLag:           indexer.reorgLag.toString(),
        lastScannedBlock:   state?.lastScannedBlock   ?? null,
        lastConfirmedBlock: state?.lastConfirmedBlock ?? null,
        lastRunAt,
        lastAttemptAt,
        lastError:          state?.lastError      ?? null,
        lastEventCount:     state?.lastEventCount ?? null,
        // Convenience: minutes since last successful run. Null when the
        // indexer has never run (cold). >5min on a 5-min-cron schedule is
        // a yellow flag; >15min is red.
        minutesSinceLastRun: lastRunAt != null
          ? Math.floor((now - lastRunAt) / 60_000)
          : null,
      };
    });

    return NextResponse.json({
      ok:    true,
      nowMs: now,
      indexers: rows,
      // Snapshot of quarantined RPC URLs across the whole pool. Empty array
      // = everything healthy. Each entry: { url, quarantinedFor } where
      // `quarantinedFor` is ms remaining before the URL is retry-eligible.
      rpcHealth: getRpcHealthSnapshot(),
    });
  } catch (err) {
    console.error("[admin/indexer-status] query failed:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
