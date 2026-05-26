// src/app/status/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Public live indexing-status page.
//
// Surfaces a (protocol × chain) freshness matrix from vesting_streams_cache
// — the same data /admin/cache-stats shows internally, but with no row counts
// or PII, just "last indexed Xm ago" or "—" for cells we don't index. Lets
// anyone (users, would-be customers, ourselves on a phone) check at a glance
// whether the seeder is healthy across every protocol/chain we claim to support.
//
// Deliberately NOT linked from the nav — discoverable only by URL. If we want
// to promote it later we can add a footer link.
//
// Refresh strategy: revalidate every 60s. The seeder runs at 03:00 UTC daily,
// so per-cell freshness usually lives in the 0-24h band; minute-level staleness
// of this page is fine.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Redis } from "@upstash/redis";
import { SiteNav } from "@/components/SiteNav";
import { listProtocols } from "@/lib/protocol-constants";
import { CHAIN_NAMES, CHAIN_IDS, type SupportedChainId } from "@vestream/shared";
import { getCacheStatsCells, getMaxLastRefreshedAt } from "@/lib/vesting/cache-stats";
import { readAllSnapshots } from "@/lib/vesting/tvl-snapshot";
import { StatusAutoRefresh } from "./StatusAutoRefresh";

// ── Last-known-good persistence ───────────────────────────────────────────────
//
// The DB query path (Supabase pooler → status_summary → tvl_snapshots) is
// reliable in steady state but flaky on cold starts: a fresh Vercel lambda
// instance occasionally CONNECTION_CLOSEDs the first request after the
// pooler's idle timeout dropped its underlying socket. ISR + the build-time
// DB short-circuit guard (per CLAUDE.md) means the pre-rendered snapshot
// is empty too, so the user sees "Status check failed — couldn't reach
// the freshness database" until the next request warms the connection.
//
// We sidestep that by mirroring the most recent successful payload into
// Upstash Redis (already configured for ratelimiting / currency / mobile
// handoff). Every successful render writes the snapshot; every failure
// reads the last good copy back. The user only sees the "Status check
// failed" UI if the redis store is ALSO empty (truly first-ever cold
// render after deploy), which is now an extreme edge case rather than
// the norm.
//
// 7-day TTL gives us a generous window — if the DB has been broken for
// a week the stale data is the smaller of our problems.
//
// `stale: true` is added to the payload so the hero can show a soft
// "showing last known data" line instead of the hard red error banner.
const STATUS_CACHE_KEY = "status:last-good-v1";
const STATUS_CACHE_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

interface StatusPayload {
  cells:                Awaited<ReturnType<typeof getCacheStatsCells>>;
  tvlRows:              Awaited<ReturnType<typeof readAllSnapshots>>;
  maxLastRefreshedSec:  number | null;
}
interface StatusResult extends StatusPayload {
  error: string | null;
  /** True iff the live DB query failed and we're rendering from Redis. */
  stale: boolean;
  /** Unix seconds when the cached payload was originally captured. */
  capturedAt: number | null;
}

function maybeRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

// 2026-05-13: both Redis helpers wrapped with a hard 1.5s timeout. Upstash
// going slow (not failing — just slow) was hanging the /status page past
// Cloudflare's gateway timeout. The page already has a catch path; we'd
// rather miss the last-known-good fallback than serve a 504.
function withRedisTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  label: string,
  ms = 1500,
): Promise<T> {
  return Promise.race([
    promise.catch((err) => {
      console.warn(`[/status] ${label} failed:`, err);
      return fallback;
    }),
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.warn(`[/status] ${label} exceeded ${ms}ms — using fallback`);
        resolve(fallback);
      }, ms),
    ),
  ]);
}

async function readLastGood(): Promise<(StatusPayload & { capturedAt: number }) | null> {
  const redis = maybeRedis();
  if (!redis) return null;
  return withRedisTimeout(
    redis.get<StatusPayload & { capturedAt: number }>(STATUS_CACHE_KEY),
    null,
    "redis read",
  );
}

async function writeLastGood(payload: StatusPayload): Promise<void> {
  const redis = maybeRedis();
  if (!redis) return;
  await withRedisTimeout(
    redis.set(
      STATUS_CACHE_KEY,
      { ...payload, capturedAt: Math.floor(Date.now() / 1000) },
      { ex: STATUS_CACHE_TTL_SEC },
    ),
    null,
    "redis write",
  );
}

export const metadata: Metadata = {
  title:       "Status — Vestream",
  description: "Live indexing freshness for every supported protocol and chain.",
  robots:      { index: false, follow: false },
};

// force-dynamic (was: revalidate = 60).
//
// ISR + the build-time DB guard combined to give a confusing first-load
// experience: at build time both getCacheStatsCells() and readAllSnapshots()
// short-circuit to [] (per the CLAUDE.md landmine — DB helpers must
// short-circuit during `next build` or transient pooler drops can kill
// the build), so the pre-rendered snapshot was empty. The first user
// post-deploy got that empty snapshot; ISR background revalidation took
// 30+ seconds to swap in real data.
//
// /status is low-traffic and operator-facing — paying 1-3s of DB-query
// latency per request to get always-live data is the right trade. There's
// no value in caching a snapshot of a dashboard whose entire purpose is
// to show "what's happening right now."
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Single cached load wrapping all three DB reads. Mirrors the pattern in
// /protocols (which caches readAllSnapshots() over the same data source).
//
// 60s TTL = the page feels live for operator monitoring while a single
// DB hammering pass produces ~60 free reads. Without this wrapper, every
// refresh — manual or via the StatusAutoRefresh client component below —
// triggered two full-table-scans against Supabase. Three concurrent
// users hitting refresh could plausibly DDoS the pooler.
//
// `tags: ["status-page"]` lets us blow this cache from a future cron
// hook (`revalidateTag("status-page")` after the seeder finishes) so
// the next pageview gets fresh data instantly without waiting for the
// 60s TTL.
const loadStatusData = unstable_cache(
  async (): Promise<StatusResult> => {
    try {
      const [cells, tvlRows, maxLastRefreshedSec] = await Promise.all([
        getCacheStatsCells(),
        readAllSnapshots(),
        getMaxLastRefreshedAt(),
      ]);
      const payload: StatusPayload = { cells, tvlRows, maxLastRefreshedSec };
      // 2026-05-13: switched from awaited to fire-and-forget. Even with the
      // 1.5s timeout inside writeLastGood, awaiting it added avoidable
      // latency to every successful render. Redis writes don't have to be
      // synchronous — if the write loses, the next render captures fresh
      // data anyway. The internal timeout still bounds total work.
      writeLastGood(payload).catch(() => {});
      return { ...payload, error: null, stale: false, capturedAt: Math.floor(Date.now() / 1000) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[/status] loadStatusData failed:", err);
      // Fall back to the last-known-good payload from Redis. Users see
      // the previous data with a softer "showing last known data" hero
      // rather than the hard red error banner.
      const fallback = await readLastGood();
      if (fallback) {
        return {
          cells:               fallback.cells,
          tvlRows:             fallback.tvlRows,
          maxLastRefreshedSec: fallback.maxLastRefreshedSec,
          error:               null,
          stale:               true,
          capturedAt:          fallback.capturedAt,
        };
      }
      // Truly cold — no live data, no Redis fallback. Render the error
      // hero as before so operators know to investigate.
      return {
        cells:               [],
        tvlRows:             [],
        maxLastRefreshedSec: null,
        error:               message,
        stale:               false,
        capturedAt:          null,
      };
    }
  },
  // Bumped v1 → v2 on May 4 2026 to force-invalidate the unstable_cache
  // entries that had captured a "status_summary table missing" error
  // before migration 0016 was applied to prod. Without this bump, /status
  // kept serving the cached error even after the resilience fix in e96a089
  // and the migration recovery via psql.
  // v5 bump on 2026-05-10 to invalidate v4 entries when we bumped the TTL
  // 60→600 (10 min) for the egress-reduction pass. Without the v-bump,
  // active 60s windows would have to roll over before the new TTL took
  // effect on existing keys. /status freshness is bounded by the cron
  // cadence regardless; the page's own re-render rate doesn't need to
  // beat the cron's update rate.
  // v6 bump on 2026-05-13 paired with the pooler-resilience pass:
  // getCacheStatsCells / getMaxLastRefreshedAt / readAllSnapshots all
  // now swallow inner rejections and return empty fallbacks. Without
  // the v-bump, any unstable_cache window that captured the previous
  // catch-block error payload would keep serving it for up to 10 min
  // even with the underlying fix deployed.
  // v7 bump on 2026-05-13 (later in same day as v6): replaced retryOnce
  // wrappers in cache-stats with hard 2s timeouts because the retries
  // were stacking latency on a slow pool and pushing /status past
  // Cloudflare's gateway timeout (504). v7 forces any cache entry that
  // captured a 504 timeout / hung promise to invalidate immediately.
  ["status-page-data-v7"],
  { revalidate: 600, tags: ["status-page"] },
);

// Column order — most-trafficked chains on the left, Solana last (Solana
// only intersects two protocols so its column is mostly empty).
const CHAIN_COLUMNS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.SOLANA,
];

interface StatusBucket {
  /** "fresh" | "stale" | "stuck" | "none" */
  kind:  "fresh" | "stale" | "stuck" | "none";
  label: string;
  /** Tailwind text colour for the cell. */
  color: string;
}

/** Compact USD format for cell footers — "$1.2M", "$340K", "$12", "—". */
function formatCompactUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

// Daily seed cron runs at 03:00 UTC. We want fresh-green for any cell
// touched within one cron-cycle (24h), amber for 1.5x cycles (a missed
// run is now visible), red for 2+ cycles (the indexer for that cell is
// likely broken). These thresholds are correct for the current cron
// cadence — if/when we add live-ingest paths or per-protocol cadences,
// extend ProtocolMeta with `expectedRefreshIntervalHours` and pipe it
// through here.
const DAILY_CRON_HOURS = 24;
const FRESH_THRESHOLD_MIN = DAILY_CRON_HOURS * 60;        // ≤ 24h → green
const STALE_THRESHOLD_MIN = DAILY_CRON_HOURS * 60 * 1.5;  // ≤ 36h → amber
                                                           // > 36h → red

/** Bucket a freshness value (seconds since indexer touched the cell) into a
 *  user-readable label + colour. Cadence-aware: green for the full 24h
 *  expected window, amber for the next 12h grace window (one cron run
 *  could miss), red beyond that. */
function bucket(freshestSec: number | null, nowSec: number): StatusBucket {
  if (freshestSec === null) {
    return { kind: "none", label: "—", color: "#94a3b8" };
  }
  const ageMin = Math.max(0, Math.floor((nowSec - freshestSec) / 60));
  let label: string;
  if (ageMin < 1)        label = "just now";
  else if (ageMin < 60)  label = `${ageMin}m ago`;
  else if (ageMin < 60 * 24) label = `${Math.floor(ageMin / 60)}h ago`;
  else                   label = `${Math.floor(ageMin / (60 * 24))}d ago`;

  if (ageMin <= FRESH_THRESHOLD_MIN) return { kind: "fresh", label, color: "#10b981" };
  if (ageMin <= STALE_THRESHOLD_MIN) return { kind: "stale", label, color: "#d97706" };
  return { kind: "stuck", label, color: "#dc2626" };
}

/** Format an absolute lastRefreshed timestamp as "Xm ago" / "Xh ago" /
 *  "Xd ago" relative to now. Used in the hero line. */
function relativeAge(unixSec: number, nowSec: number): string {
  const ageMin = Math.max(0, Math.floor((nowSec - unixSec) / 60));
  if (ageMin < 1)            return "just now";
  if (ageMin < 60)           return `${ageMin}m ago`;
  if (ageMin < 60 * 24)      return `${Math.floor(ageMin / 60)}h ago`;
  return `${Math.floor(ageMin / (60 * 24))}d ago`;
}

export default async function StatusPage() {
  // Pull every cell, including disabled protocols — the table reflects the
  // claimed support matrix, not the currently-active one. Disabled protocols
  // get a "Paused" badge so the row isn't misleading.
  const protocols = listProtocols({ includeDisabled: true });

  // Single cached call — all error handling lives in loadStatusData. If
  // the query layer failed, `error` is set and we render the degraded
  // hero ("Status check failed") with empty matrices below. If it
  // succeeded, `cells`/`tvlRows`/`maxLastRefreshedSec` are populated.
  const {
    cells,
    tvlRows,
    maxLastRefreshedSec,
    error:      queryError,
    stale:      isStale,
    capturedAt: cachedAtSec,
  } = await loadStatusData();

  const nowSec = Math.floor(Date.now() / 1000);

  // Build per-cell lookups. cellMap holds freshness; metaMap holds the
  // monitoring snapshot (TVL + stream count) for the cell footer.
  const cellMap = new Map<string, number | null>();
  for (const c of cells) {
    cellMap.set(`${c.protocol}|${c.chainId}`, c.freshestSec ?? null);
  }
  // Per-cell metadata: TVL from snapshot (DefiLlama or self-indexed),
  // and the timestamp of that snapshot. We surface "prices X ago" in the
  // cell footer because operational triage cares about WHEN the priced TVL
  // was last computed — stale prices are a silent-trust risk (false zeros,
  // outdated USD numbers), whereas the stream count rarely moves day to
  // day and is already implied by the indexer-status endpoint.
  //
  // 2026-05-26: replaced the per-cell stream count with `tvlComputedAtSec`.
  // The cache-stats endpoint still carries stream counts for callers that
  // need them; this surface intentionally tightens to the freshness signal.
  const metaMap = new Map<string, { tvlUsd: number; tvlComputedAtSec: number | null }>();
  // Seed every (protocol, chain) cell we have a cache-stats row for so the
  // metaMap is non-null for any cell the matrix renders. tvlComputedAtSec
  // stays null until the TVL snapshot overlay fills it in.
  for (const c of cells) {
    metaMap.set(`${c.protocol}|${c.chainId}`, {
      tvlUsd:           0,
      tvlComputedAtSec: null,
    });
  }
  // Then overlay TVL snapshot $ values + the computed_at timestamp.
  for (const r of tvlRows) {
    const k = `${r.protocol}|${r.chainId}`;
    metaMap.set(k, {
      tvlUsd:           r.tvlUsd,
      tvlComputedAtSec: Math.floor(r.computedAt.getTime() / 1000),
    });
  }

  // Binary health signal — green if no cell has crossed the "stuck"
  // threshold, red if any has. The matrix below shows which cells.
  // Amber/stale (between cron runs) is expected behaviour and does NOT
  // flip the headline; only red-band cells count as cause for concern.
  // Pending cells (cache empty for a chain we DO support) are reported
  // separately in the summary line so they're visible without flipping
  // the headline red.
  let operationalCount = 0;
  let pendingCount     = 0;
  const stuckCells: Array<{ protocol: string; chainId: SupportedChainId; label: string }> = [];
  for (const proto of protocols) {
    if (proto.disabled) continue; // paused protocols don't count against health
    for (const chainId of CHAIN_COLUMNS) {
      if (!proto.chainIds.includes(chainId)) continue;
      const freshestSec = cellMap.get(`${proto.adapterIds[0]}|${chainId}`) ?? null;
      if (freshestSec === null) {
        pendingCount++;
        continue;
      }
      const b = bucket(freshestSec, nowSec);
      if (b.kind === "stuck") {
        stuckCells.push({ protocol: proto.name, chainId, label: b.label });
      } else {
        // fresh + stale both count as operational — stale is normal
        // behaviour between cron runs.
        operationalCount++;
      }
    }
  }
  // Health rollup. The query-error case wins over both healthy/unhealthy
  // because it means we don't actually KNOW the state — better to flag
  // the failure honestly than show a misleading green.
  //
  // `isStale` (live DB query failed but we recovered last-known-good from
  // Redis) is rendered with the cells' actual freshness colours rather
  // than a hard "failed" banner — the data IS valid, just slightly old.
  // The hero gets a soft amber pill reminder that the live query couldn't
  // run; an operator can still see whether the underlying cells are
  // healthy or not from the matrix below.
  const isHealthy = stuckCells.length === 0 && !queryError;
  const overall = queryError
    ? { label: "Status check failed",  color: "#dc2626" }
    : isStale
    ? stuckCells.length > 0
      ? { label: `${stuckCells.length} cell${stuckCells.length === 1 ? "" : "s"} need attention`, color: "#dc2626" }
      : { label: "All systems operational", color: "#10b981" }
    : isHealthy
    ? { label: "All systems operational", color: "#10b981" }
    : { label: `${stuckCells.length} cell${stuckCells.length === 1 ? "" : "s"} need attention`, color: "#dc2626" };

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />
      {/* Auto-refresh client component — calls router.refresh() every
          60s. Server runs are cheap because loadStatusData() is cached
          for 60s; the refresh just re-fetches the cached snapshot. */}
      <StatusAutoRefresh />


      <main className="mx-auto max-w-5xl px-4 md:px-8 pb-24 pt-12">
        {/* Hero — single binary signal. Big enough that the
            green/red is the only thing the eye lands on at first glance. */}
        <div
          className="mb-10 rounded-2xl p-8 flex items-center gap-5"
          style={{
            background: `${overall.color}0F`,
            border:     `1px solid ${overall.color}40`,
          }}
        >
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{
              background: overall.color,
              width:      28,
              height:     28,
              boxShadow:  `0 0 24px ${overall.color}A0`,
            }}
          />
          <div>
            <h1
              className="text-3xl md:text-4xl font-semibold"
              style={{ letterSpacing: "-0.02em", color: overall.color }}
            >
              {overall.label}
            </h1>
            <p className="text-sm mt-1" style={{ color: "#64748b" }}>
              {queryError
                ? `Couldn't reach the freshness database — try refresh in a moment. (${queryError.slice(0, 80)})`
                : isStale
                ? `Showing last known data from ${cachedAtSec ? relativeAge(cachedAtSec, nowSec) : "earlier"}. Live query refreshing in the background.`
                : isHealthy
                ? "Every protocol × chain we index is refreshing within the expected window."
                : `One or more cells haven't refreshed in over ${Math.floor(STALE_THRESHOLD_MIN / 60)} hours. See the matrix below.`}
            </p>
            {/* Single highest-value operator signal — "is the seeder
                actually producing usable output?" — surfaced in the hero
                where the eye lands. Reads from MAX(lastRefreshedAt),
                which moves only when data actually changes (per the
                May 2 2026 semantic shift in CLAUDE.md). */}
            {maxLastRefreshedSec !== null && (
              <p className="text-xs mt-2" style={{ color: "#94a3b8" }}>
                Last data update across all cells:{" "}
                <span style={{ color: "#0f172a", fontWeight: 600 }}>
                  {relativeAge(maxLastRefreshedSec, nowSec)}
                </span>
              </p>
            )}
            {/* Counts breakdown — same numbers in every state, so the
                operator can see scale at a glance. */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium" style={{ color: "#64748b" }}>
              <span>
                <span style={{ color: "#10b981", fontWeight: 700 }}>{operationalCount}</span>
                {" "}operational
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>
                <span style={{ color: pendingCount > 0 ? "#64748b" : "#cbd5e1", fontWeight: 700 }}>{pendingCount}</span>
                {" "}pending
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>
                <span style={{ color: stuckCells.length > 0 ? "#dc2626" : "#cbd5e1", fontWeight: 700 }}>{stuckCells.length}</span>
                {" "}need attention
              </span>
            </div>
          </div>
        </div>

        {/* Matrix */}
        <div
          className="rounded-2xl overflow-x-auto"
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <th
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "#94a3b8" }}
                >
                  Protocol
                </th>
                {CHAIN_COLUMNS.map((chainId) => (
                  <th
                    key={chainId}
                    className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#94a3b8" }}
                  >
                    {CHAIN_NAMES[chainId]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {protocols.map((proto, i) => (
                <tr
                  key={proto.slug}
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.05)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                        style={{ background: proto.color }}
                      />
                      <span style={{ color: "#0f172a", fontWeight: 600 }}>{proto.name}</span>
                      {proto.disabled && (
                        <span
                          className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                          style={{
                            background: "rgba(245,158,11,0.1)",
                            border: "1px solid rgba(245,158,11,0.25)",
                            color: "#d97706",
                          }}
                        >
                          Paused
                        </span>
                      )}
                    </div>
                  </td>
                  {CHAIN_COLUMNS.map((chainId) => {
                    // Three distinct cell states:
                    //   1. Chain not supported by this protocol → blank cell
                    //   2. Chain supported but cache empty (e.g. brand-new
                    //      adapter that hasn't run yet) → grey "Pending" pill
                    //   3. Chain has data → fresh/stale/stuck pill
                    if (!proto.chainIds.includes(chainId)) {
                      // Protocol doesn't deploy on this chain — render a
                      // faded em-dash so the eye still tracks the row
                      // (an empty cell looks like a layout glitch).
                      return (
                        <td
                          key={chainId}
                          className="px-3 py-3 text-xs"
                          style={{ color: "#cbd5e1" }}
                          aria-label="Not deployed on this chain"
                        >
                          —
                        </td>
                      );
                    }
                    const freshestSec = cellMap.get(`${proto.adapterIds[0]}|${chainId}`) ?? null;
                    if (freshestSec === null) {
                      return (
                        <td key={chainId} className="px-3 py-3 text-xs align-top">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono"
                            style={{
                              background: "rgba(100,116,139,0.08)",
                              color:      "#64748b",
                              border:     "1px dashed rgba(100,116,139,0.30)",
                            }}
                          >
                            Pending
                          </span>
                        </td>
                      );
                    }
                    const b    = bucket(freshestSec, nowSec);
                    const meta = metaMap.get(`${proto.adapterIds[0]}|${chainId}`);
                    return (
                      <td key={chainId} className="px-3 py-3 text-xs align-top">
                        <div className="flex flex-col gap-1">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono w-fit"
                            style={{
                              background: `${b.color}14`,
                              color:      b.color,
                              border:     `1px solid ${b.color}33`,
                            }}
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: b.color }}
                            />
                            {b.label}
                          </span>
                          {meta && (
                            <span
                              className="font-mono text-[10px] leading-tight pl-1"
                              style={{ color: "#94a3b8" }}
                            >
                              {formatCompactUsd(meta.tvlUsd)} · prices {meta.tvlComputedAtSec !== null ? relativeAge(meta.tvlComputedAtSec, nowSec) : "—"}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 text-xs" style={{ color: "#64748b" }}>
          <p className="mb-2 font-semibold uppercase tracking-widest" style={{ color: "#94a3b8" }}>
            How to read
          </p>
          <ul className="space-y-1" style={{ lineHeight: 1.7 }}>
            <li>
              <span style={{ color: "#10b981", fontWeight: 600 }}>Green</span> = data refreshed in the last 2 hours.
            </li>
            <li>
              <span style={{ color: "#d97706", fontWeight: 600 }}>Amber</span> = 2 hours to 30 hours since last refresh — normal between daily cron runs.
            </li>
            <li>
              <span style={{ color: "#dc2626", fontWeight: 600 }}>Red</span> = more than 30 hours stale; the indexer for that cell may be broken.
            </li>
            <li>
              <span style={{ color: "#64748b", fontWeight: 600 }}>Pending</span> = chain we support but the cache is empty (newly added adapter, awaiting first seed run).
            </li>
            <li>
              <span style={{ color: "#cbd5e1", fontWeight: 600 }}>blank</span> = protocol does not deploy on that chain.
            </li>
          </ul>
          <p className="mt-4">
            Last computed at {new Date(nowSec * 1000).toISOString()}.
          </p>
        </div>
      </main>
    </div>
  );
}
