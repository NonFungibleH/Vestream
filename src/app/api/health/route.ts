// src/app/api/health/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public, unauthenticated pipeline-health probe. Point a free uptime monitor
// (UptimeRobot, Better Uptime, etc.) at it: it returns HTTP 200 when the data
// pipeline is flowing and 503 when it has silently stalled — which, per the
// July 2026 CTO audit, is the missing alerting layer (the platform's failure
// HANDLING is mature; its failure REPORTING was nonexistent, so a 45-day-stale
// Jupiter Lock seed went unnoticed).
//
// It checks the cheap, high-signal things:
//   - DB reachable at all
//   - the seeder is still writing fresh rows (max last_refreshed_at age)
//   - no TVL snapshot cell is stuck failing (max consecutive_failures)
//   - the derived tables (rollups / summaries / status) are being refreshed
//
// No secrets are exposed — only coarse ages + a healthy/degraded verdict.
// Read-only, single bounded query, force-dynamic so it never serves a cached
// verdict.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic  = "force-dynamic";
export const revalidate = 0;

// Thresholds are deliberately generous — this alerts on "silently stopped",
// not "a bit late". Seeds + derived tables run at least daily; TVL heartbeats
// climb one per failed daily attempt.
const STALE_SEED_HOURS       = 40;  // daily seed + weekend/margin
const STALE_DERIVED_HOURS    = 28;  // rollups hourly, summaries/status daily
const MAX_TVL_FAILURES       = 5;   // ~5 consecutive failed daily snapshots

export async function GET() {
  try {
    const rows = (await db.execute(sql`
      SELECT
        extract(epoch from (now() - (SELECT max(last_refreshed_at) FROM vesting_streams_cache)))/3600  AS seed_hours,
        extract(epoch from (now() - (SELECT max(computed_at)        FROM token_vesting_rollups)))/3600  AS rollups_hours,
        extract(epoch from (now() - (SELECT max(computed_at)        FROM protocol_summaries)))/3600      AS summaries_hours,
        extract(epoch from (now() - (SELECT max(computed_at)        FROM status_summary)))/3600          AS status_hours,
        (SELECT max(consecutive_failures) FROM protocol_tvl_snapshots)                                   AS tvl_fails
    `)) as unknown as Array<{
      seed_hours: number | null; rollups_hours: number | null;
      summaries_hours: number | null; status_hours: number | null; tvl_fails: number | null;
    }>;

    const r = rows[0] ?? {};
    const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

    const checks = {
      seedAgeHours:      num(r.seed_hours),
      rollupsAgeHours:   num(r.rollups_hours),
      summariesAgeHours: num(r.summaries_hours),
      statusAgeHours:    num(r.status_hours),
      tvlMaxConsecutiveFailures: r.tvl_fails == null ? 0 : Number(r.tvl_fails),
    };

    const failures: string[] = [];
    if (checks.seedAgeHours == null || checks.seedAgeHours > STALE_SEED_HOURS)
      failures.push(`seed stale (${checks.seedAgeHours ?? "no rows"}h)`);
    if (checks.rollupsAgeHours != null && checks.rollupsAgeHours > STALE_DERIVED_HOURS)
      failures.push(`rollups stale (${checks.rollupsAgeHours}h)`);
    if (checks.statusAgeHours != null && checks.statusAgeHours > STALE_DERIVED_HOURS)
      failures.push(`status stale (${checks.statusAgeHours}h)`);
    if (checks.tvlMaxConsecutiveFailures >= MAX_TVL_FAILURES)
      failures.push(`tvl snapshot failing ×${checks.tvlMaxConsecutiveFailures}`);

    const healthy = failures.length === 0;
    return NextResponse.json(
      { status: healthy ? "ok" : "degraded", failures, checks, ts: new Date().toISOString() },
      { status: healthy ? 200 : 503 },
    );
  } catch (err) {
    // DB unreachable is itself a critical health signal.
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() },
      { status: 503 },
    );
  }
}
