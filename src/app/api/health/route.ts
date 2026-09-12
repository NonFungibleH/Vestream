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
//   - per-row alarms (2026-09-09): WHICH protocol/chain is stalled, failing
//     or walking to zero. The coarse checks above answer "is something
//     wrong"; without the subjects you still have to go digging, and three
//     failures ran for months (one for 102 days) because "tvl snapshot
//     failing ×6" never said pinksale/137.
//
// No secrets are exposed — only coarse ages + a healthy/degraded verdict.
// Read-only, single bounded query, force-dynamic so it never serves a cached
// verdict.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getPipelineAlarms } from "@/lib/vesting/cache-stats";

export const dynamic  = "force-dynamic";
export const revalidate = 0;

// Thresholds are deliberately generous — this alerts on "silently stopped",
// not "a bit late". Seeds + derived tables run at least daily; TVL heartbeats
// climb one per failed daily attempt.
const STALE_SEED_HOURS       = 40;  // daily seed + weekend/margin
const STALE_DERIVED_HOURS    = 28;  // rollups hourly, summaries/status daily
const MAX_TVL_FAILURES       = 5;   // ~5 consecutive failed daily snapshots

export async function GET(req: Request) {
  // `?strict=1` keeps the old behaviour: 503 whenever the pipeline is
  // degraded. The DEFAULT is now 200-with-a-body, because the two questions
  // an uptime monitor and an operator ask are different ones:
  //
  //   "is the site up?"          → 200/503. Only a DB outage is an outage.
  //   "is the pipeline healthy?" → status/failures in the body.
  //
  // Conflating them made the probe useless for uptime: it has been returning
  // 503 continuously for four long-standing pipeline issues (a stalled Hedgey
  // BSC cursor, guard-held TVL snapshots), so any monitor pointed at it would
  // alarm forever and be muted within a day. A monitor should watch the
  // default; alerting on pipeline health reads `status` or uses ?strict=1.
  const strict = new URL(req.url).searchParams.get("strict") === "1";
  try {
    const rows = (await db.execute(sql`
      SELECT
        extract(epoch from (now() - (SELECT max(last_refreshed_at) FROM vesting_streams_cache)))/3600  AS seed_hours,
        extract(epoch from (now() - (SELECT max(computed_at)        FROM token_vesting_rollups)))/3600  AS rollups_hours,
        extract(epoch from (now() - (SELECT max(computed_at)        FROM protocol_summaries)))/3600      AS summaries_hours,
        extract(epoch from (now() - (SELECT max(computed_at)        FROM status_summary)))/3600          AS status_hours,
        -- Only count snapshots that actually FAILED. A "guard kept prior row"
        -- heartbeat means the pricing guards did their job and refused to
        -- publish a number they could not stand behind (thin coverage, or a
        -- >50% drop) — that is the safety system working, not a fault. Every
        -- genuine fault was fixed on 2026-09-12 and all six remaining rows
        -- were guard holds, so the probe was reporting degraded permanently
        -- on nothing but healthy refusals. A monitor that always alarms gets
        -- muted, which is worse than no monitor.
        (SELECT max(consecutive_failures) FROM protocol_tvl_snapshots
          WHERE last_error IS NULL OR last_error NOT LIKE 'guard kept prior row%')     AS tvl_fails,
        (SELECT count(*) FROM protocol_tvl_snapshots
          WHERE last_error LIKE 'guard kept prior row%')::int                          AS tvl_guard_holds
    `)) as unknown as Array<{
      seed_hours: number | null; rollups_hours: number | null;
      summaries_hours: number | null; status_hours: number | null;
      tvl_fails: number | null; tvl_guard_holds: number | null;
    }>;

    const r = rows[0] ?? {};
    const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

    const checks = {
      seedAgeHours:      num(r.seed_hours),
      rollupsAgeHours:   num(r.rollups_hours),
      summariesAgeHours: num(r.summaries_hours),
      statusAgeHours:    num(r.status_hours),
      tvlMaxConsecutiveFailures: r.tvl_fails == null ? 0 : Number(r.tvl_fails),
      // Surfaced but NOT a failure: guards holding a prior row on purpose.
      tvlGuardHolds: r.tvl_guard_holds == null ? 0 : Number(r.tvl_guard_holds),
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
    // Name the broken things. Best-effort: getPipelineAlarms never throws and
    // returns [] on failure, so a probe already reporting degraded is never
    // downgraded to healthy by this call.
    const alarms = await getPipelineAlarms().catch(() => []);
    const stalled = alarms.filter((a) => a.kind === "indexer-stalled");
    const zeroed  = alarms.filter((a) => a.kind === "walker-zero");
    // Stalled cursors and zero-walking walkers are invisible to the coarse
    // checks above, so they have to be able to fail the probe themselves.
    const stillHealthy = healthy && stalled.length === 0 && zeroed.length === 0;
    for (const a of [...stalled, ...zeroed]) failures.push(`${a.subject}: ${a.detail}`);

    return NextResponse.json(
      {
        status: stillHealthy ? "ok" : "degraded",
        failures,
        checks,
        alarms,
        ts: new Date().toISOString(),
      },
      // Reachable DB = the service is up, whatever the pipeline is doing.
      { status: stillHealthy || !strict ? 200 : 503 },
    );
  } catch (err) {
    // DB unreachable is itself a critical health signal.
    return NextResponse.json(
      // The one genuine outage: we could not reach the database at all.
      { status: "error", error: err instanceof Error ? err.message : String(err), ts: new Date().toISOString() },
      { status: 503 },
    );
  }
}
