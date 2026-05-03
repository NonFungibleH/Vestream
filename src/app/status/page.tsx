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
import { SiteNav } from "@/components/SiteNav";
import { listProtocols } from "@/lib/protocol-constants";
import { CHAIN_NAMES, CHAIN_IDS, type SupportedChainId } from "@vestream/shared";
import { getCacheStatsCells } from "@/lib/vesting/cache-stats";
import { readAllSnapshots } from "@/lib/vesting/tvl-snapshot";

export const metadata: Metadata = {
  title:       "Status — Vestream",
  description: "Live indexing freshness for every supported protocol and chain.",
  robots:      { index: false, follow: false },
};

// Re-render at most once a minute. Per-cell staleness is dominated by the
// daily seed cron, so finer freshness on this page is wasted effort.
export const revalidate = 60;

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

/** Bucket a freshness value (seconds since indexer touched the cell) into a
 *  user-readable label + colour. Thresholds calibrated to our daily seeder:
 *    < 2h        green   (just ran or live-ingest update)
 *    2-30h       amber   (normal — between cron runs)
 *    > 30h       red     (cron likely missed or adapter broken)
 *    null        grey "—" (we don't index this cell)
 */
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

  if (ageMin <= 120)        return { kind: "fresh", label, color: "#10b981" };
  if (ageMin <= 60 * 30)    return { kind: "stale", label, color: "#d97706" };
  return { kind: "stuck", label, color: "#dc2626" };
}

export default async function StatusPage() {
  // Pull every cell, including disabled protocols — the table reflects the
  // claimed support matrix, not the currently-active one. Disabled protocols
  // get a "Paused" badge so the row isn't misleading.
  const protocols = listProtocols({ includeDisabled: true });
  // Parallel reads — both queries are independent and the page already
  // has a 60s revalidate budget.
  const [cells, tvlRows] = await Promise.all([
    getCacheStatsCells(),
    readAllSnapshots(),
  ]);
  const nowSec = Math.floor(Date.now() / 1000);

  // Build per-cell lookups. cellMap holds freshness; metaMap holds the
  // monitoring snapshot (TVL + stream count) for the cell footer.
  const cellMap = new Map<string, number | null>();
  for (const c of cells) {
    cellMap.set(`${c.protocol}|${c.chainId}`, c.freshestSec ?? null);
  }
  const metaMap = new Map<string, { tvlUsd: number; streams: number }>();
  for (const r of tvlRows) {
    metaMap.set(`${r.protocol}|${r.chainId}`, {
      tvlUsd:  r.tvlUsd,
      streams: r.streamCount,
    });
  }
  // Fall back to cache-stats stream count when there's no TVL snapshot
  // (e.g. brand-new adapter that hasn't had its first daily TVL run).
  for (const c of cells) {
    const k = `${c.protocol}|${c.chainId}`;
    if (!metaMap.has(k)) {
      metaMap.set(k, { tvlUsd: 0, streams: c.streams });
    }
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
  const isHealthy = stuckCells.length === 0;
  const overall = isHealthy
    ? { label: "All systems operational", color: "#10b981" }
    : { label: `${stuckCells.length} cell${stuckCells.length === 1 ? "" : "s"} need attention`, color: "#dc2626" };

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />

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
              {isHealthy
                ? "Every protocol × chain we index is refreshing within the expected window."
                : "One or more cells haven't refreshed in over 30 hours. See the matrix below for which."}
            </p>
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
                              {formatCompactUsd(meta.tvlUsd)} · {meta.streams.toLocaleString()} stream{meta.streams === 1 ? "" : "s"}
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
