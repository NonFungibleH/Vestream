// src/app/admin/cache-stats/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin diagnostic — per-(protocol × chain) rollup of the vesting streams
// cache. Pivot layout: rows = protocols, columns = chains, cells = stream
// counts + quality signals.
//
// Gated by middleware (vestr_admin cookie). Middleware redirects unauthenticated
// visitors to /admin/login before reaching this page, so we don't repeat the
// check in the component itself.
//
// No CTA, no marketing chrome. One table, clearly-labelled columns, done.
// Links back to the main /admin page sit in the header for navigation.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { getCacheStatsCells, type CacheStatsCell } from "@/lib/vesting/cache-stats";

export const dynamic = "force-dynamic";

// Chains we care about, in display order. Any chain returned from the DB
// that isn't listed here falls into an "Other" column at the end.
const CHAIN_ORDER: { id: number; label: string }[] = [
  { id: 1,         label: "Ethereum" },
  { id: 56,        label: "BNB"      },
  { id: 137,       label: "Polygon"  },
  { id: 8453,      label: "Base"     },
  { id: 11155111,  label: "Sepolia"  },
];

// Protocol display order — matches the /protocols page ordering (biggest by TVL
// first, roughly) for consistency. Unknown protocols appear at the end in
// whatever order the DB returns them.
const PROTOCOL_ORDER = [
  "sablier",
  "hedgey",
  "superfluid",
  "unvest",
  "team-finance",
  "uncx",
  "uncx-vm",
  "pinksale",
];

function protocolLabel(id: string): string {
  switch (id) {
    case "sablier":       return "Sablier";
    case "hedgey":        return "Hedgey";
    case "superfluid":    return "Superfluid";
    case "unvest":        return "Unvest";
    case "team-finance":  return "Team Finance";
    case "uncx":          return "UNCX (TokenVesting)";
    case "uncx-vm":       return "UNCX (VestingManager)";
    case "pinksale":      return "PinkSale";
    default:              return id;
  }
}

function relSince(unixSec: number | null, nowMs: number): string {
  if (!unixSec) return "—";
  const diffSec = Math.max(0, Math.floor(nowMs / 1000) - unixSec);
  if (diffSec < 60)    return `${diffSec}s ago`;
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
  return `${Math.floor(diffSec / 86400)} d ago`;
}

interface GridCell {
  streams: number;
  active:  number;
  withTokenSymbol: number;
  distinctTokens:  number;
  freshestSec:     number | null;
}

function buildGrid(cells: CacheStatsCell[]): Map<string, Map<number, GridCell>> {
  const grid = new Map<string, Map<number, GridCell>>();
  for (const c of cells) {
    if (!grid.has(c.protocol)) grid.set(c.protocol, new Map());
    grid.get(c.protocol)!.set(c.chainId, {
      streams:         c.streams,
      active:          c.active,
      withTokenSymbol: c.withTokenSymbol,
      distinctTokens:  c.distinctTokens,
      freshestSec:     c.freshestSec,
    });
  }
  return grid;
}

export default async function CacheStatsPage() {
  const nowMs = Date.now();
  const cells = await getCacheStatsCells();
  const grid  = buildGrid(cells);

  // Build the full protocol list: the canonical ordered set, plus any extras
  // the DB returned that we haven't enumerated yet (future-proof).
  const knownProtocols = new Set(PROTOCOL_ORDER);
  const extraProtocols = Array.from(grid.keys()).filter((p) => !knownProtocols.has(p));
  const protocols      = [...PROTOCOL_ORDER, ...extraProtocols].filter((p) => grid.has(p));

  // Column totals
  const chainTotals = new Map<number, { streams: number; active: number }>();
  const grandTotals = { streams: 0, active: 0 };
  for (const c of cells) {
    const t = chainTotals.get(c.chainId) ?? { streams: 0, active: 0 };
    t.streams += c.streams;
    t.active  += c.active;
    chainTotals.set(c.chainId, t);
    grandTotals.streams += c.streams;
    grandTotals.active  += c.active;
  }

  return (
    <main className="min-h-screen" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>
              Cache stats
            </h1>
            <p className="text-sm mt-1" style={{ color: "#8B8E92" }}>
              Rows per (protocol × chain) in <code>vesting_streams_cache</code>. Use this to verify the seeder is producing data on every chain before trusting public numbers.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#1A1D20" }}
            >
              ← Admin home
            </Link>
          </div>
        </div>

        {/* Grand totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Total streams" value={grandTotals.streams.toLocaleString()} />
          <Stat label="Active streams" value={grandTotals.active.toLocaleString()} />
          <Stat label="Protocols with data" value={protocols.length.toString()} />
          <Stat label="Generated" value={new Date(nowMs).toLocaleTimeString("en-GB")} />
        </div>

        {/* Pivot table */}
        <div
          className="rounded-2xl overflow-x-auto"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(21,23,26,0.10)" }}>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "#8B8E92" }}>
                  Protocol
                </th>
                {CHAIN_ORDER.map((c) => (
                  <th key={c.id} className="text-right px-3 py-3 font-semibold" style={{ color: "#8B8E92" }}>
                    {c.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-semibold" style={{ color: "#1A1D20" }}>
                  Total
                </th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: "#8B8E92" }}>
                  Freshest
                </th>
              </tr>
            </thead>
            <tbody>
              {protocols.length === 0 && (
                <tr>
                  <td colSpan={CHAIN_ORDER.length + 3} className="px-4 py-8 text-center" style={{ color: "#B8BABD" }}>
                    Cache is empty. Trigger a seed-cache run and refresh.
                  </td>
                </tr>
              )}
              {protocols.map((p) => {
                const rowMap      = grid.get(p)!;
                const rowStreams  = Array.from(rowMap.values()).reduce((s, c) => s + c.streams, 0);
                const rowFreshest = Array.from(rowMap.values())
                  .map((c) => c.freshestSec)
                  .filter((x): x is number => x !== null)
                  .reduce<number | null>((a, b) => (a == null || b > a ? b : a), null);
                return (
                  <tr key={p} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{protocolLabel(p)}</td>
                    {CHAIN_ORDER.map((c) => {
                      const cell = rowMap.get(c.id);
                      return (
                        <td key={c.id} className="text-right px-3 py-3 tabular-nums whitespace-nowrap">
                          {cell ? <CellContent cell={cell} /> : <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-3 tabular-nums font-semibold">
                      {rowStreams.toLocaleString()}
                    </td>
                    <td className="text-right px-4 py-3 whitespace-nowrap" style={{ color: "#8B8E92" }}>
                      {relSince(rowFreshest, nowMs)}
                    </td>
                  </tr>
                );
              })}
              {/* Column totals footer */}
              {protocols.length > 0 && (
                <tr style={{ background: "rgba(0,0,0,0.02)" }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: "#8B8E92" }}>
                    Total
                  </td>
                  {CHAIN_ORDER.map((c) => {
                    const t = chainTotals.get(c.id);
                    return (
                      <td key={c.id} className="text-right px-3 py-3 tabular-nums font-semibold">
                        {t ? t.streams.toLocaleString() : <span style={{ color: "#cbd5e1" }}>0</span>}
                      </td>
                    );
                  })}
                  <td className="text-right px-4 py-3 tabular-nums font-semibold">
                    {grandTotals.streams.toLocaleString()}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div
          className="mt-4 rounded-xl p-4 text-xs"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", color: "#8B8E92", lineHeight: 1.7 }}
        >
          <div className="font-semibold mb-1.5" style={{ color: "#1A1D20" }}>
            Reading a cell
          </div>
          <div>
            <strong>Top number:</strong> total cached streams for that (protocol, chain).
            {" "}<strong>Second line:</strong> active streams (not fully vested).
            {" "}<strong>Symbol %:</strong> share with a resolved tokenSymbol — a low value here usually means the token-metadata reads failed on that chain.
            {" "}<strong>Tokens:</strong> distinct token contracts seen.
          </div>
          <div className="mt-2">
            A cell showing <span style={{ color: "#cbd5e1" }}>—</span> means <em>zero rows cached</em>. If you expected data on that chain, check the seed-cache per-job results in Vercel logs for that (protocol, chain) pair.
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Small presentational helpers (co-located since they're page-local) ────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#B8BABD" }}>
        {label}
      </div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function CellContent({ cell }: { cell: GridCell }) {
  const symbolPct = cell.streams > 0
    ? Math.round((cell.withTokenSymbol / cell.streams) * 100)
    : 0;
  // Highlight low tokenSymbol coverage — the classic "RPC flaked, rows are
  // in the DB but we couldn't read symbols" signal.
  const symbolColor = symbolPct >= 90 ? "#3FA568"
    : symbolPct >= 70 ? "#E89A3D"
    : "#B3322E";

  return (
    <div>
      <div className="font-semibold" style={{ color: "#1A1D20" }}>
        {cell.streams.toLocaleString()}
      </div>
      <div className="text-[11px] leading-tight mt-0.5" style={{ color: "#B8BABD" }}>
        {cell.active.toLocaleString()} active
      </div>
      <div className="text-[10px] leading-tight mt-0.5" style={{ color: symbolColor }}>
        {symbolPct}% symbol · {cell.distinctTokens} tokens
      </div>
    </div>
  );
}
