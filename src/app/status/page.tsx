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
  const cells     = await getCacheStatsCells();
  const nowSec    = Math.floor(Date.now() / 1000);

  // Build a quick { "protocol|chainId" → freshestSec } lookup.
  const cellMap = new Map<string, number | null>();
  for (const c of cells) {
    cellMap.set(`${c.protocol}|${c.chainId}`, c.freshestSec ?? null);
  }

  // Aggregate freshness across the whole matrix for a top-line summary.
  let freshCount = 0, staleCount = 0, stuckCount = 0, noneCount = 0;
  for (const proto of protocols) {
    for (const chainId of CHAIN_COLUMNS) {
      if (!proto.chainIds.includes(chainId)) continue;
      const b = bucket(cellMap.get(`${proto.adapterIds[0]}|${chainId}`) ?? null, nowSec);
      if (b.kind === "fresh") freshCount++;
      else if (b.kind === "stale") staleCount++;
      else if (b.kind === "stuck") stuckCount++;
      else noneCount++;
    }
  }
  const totalCells = freshCount + staleCount + stuckCount + noneCount;
  const overall: { label: string; color: string } =
    stuckCount > 0
      ? { label: "Indexer issue", color: "#dc2626" }
      : staleCount > totalCells / 2
      ? { label: "Slow refresh", color: "#d97706" }
      : { label: "All systems normal", color: "#10b981" };

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <SiteNav theme="light" />

      <main className="mx-auto max-w-5xl px-4 md:px-8 pb-24 pt-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span
              style={{ background: overall.color, boxShadow: `0 0 12px ${overall.color}80` }}
              className="inline-block h-2.5 w-2.5 rounded-full"
            />
            <h1 className="text-3xl font-semibold" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>
              {overall.label}
            </h1>
          </div>
          <p className="text-sm" style={{ color: "#64748b" }}>
            Live indexing freshness across every supported protocol × chain. Auto-refreshes every minute.
          </p>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {([
            ["Fresh",  freshCount, "#10b981"],
            ["Slow",   staleCount, "#d97706"],
            ["Stuck",  stuckCount, "#dc2626"],
            ["Not indexed", noneCount, "#94a3b8"],
          ] as const).map(([label, count, color]) => (
            <div
              key={label}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: `${color}14`,
                border: `1px solid ${color}33`,
                color,
              }}
            >
              <span>{label}</span>
              <span style={{ opacity: 0.85 }}>{count}</span>
            </div>
          ))}
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
                    if (!proto.chainIds.includes(chainId)) {
                      return (
                        <td
                          key={chainId}
                          className="px-3 py-3 text-xs"
                          style={{ color: "#cbd5e1" }}
                        >
                          —
                        </td>
                      );
                    }
                    const freshestSec = cellMap.get(`${proto.adapterIds[0]}|${chainId}`) ?? null;
                    const b           = bucket(freshestSec, nowSec);
                    return (
                      <td key={chainId} className="px-3 py-3 text-xs">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono"
                          style={{
                            background: b.kind === "none" ? "transparent" : `${b.color}14`,
                            color:      b.color,
                            border:     b.kind === "none" ? "none" : `1px solid ${b.color}33`,
                          }}
                        >
                          {b.kind !== "none" && (
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: b.color }}
                            />
                          )}
                          {b.label}
                        </span>
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
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>—</span> = chain not supported by that protocol, or not yet indexed.
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
