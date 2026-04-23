// src/components/TvlComparisonBar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Server component — renders a horizontal bar chart comparing TVL across
// every indexed vesting protocol. Sized relative to the leader so eyeballs
// can quickly judge protocol share.
//
// Each row shows:
//   • Protocol name (brand colour)
//   • Horizontal bar: width = tvl / maxTvl
//   • USD amount (right-aligned, compact: "$1.24B", "$412M")
//   • Priced-token coverage (right-aligned, muted) — gives an honest
//     confidence score so the viewer isn't misled by thin coverage
//
// Empty state (coverage = 0 for all): shows a subtle "Indexing…" hint.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { ProtocolMeta } from "@/lib/protocol-constants";
import type { ProtocolTvl } from "@/lib/vesting/tvl";

export interface TvlComparisonRow {
  protocol: ProtocolMeta;
  tvl:      ProtocolTvl | null;
}

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function TvlComparisonBar({ rows }: { rows: TvlComparisonRow[] }) {
  const sorted   = [...rows].sort((a, b) => (b.tvl?.tvlUsd ?? 0) - (a.tvl?.tvlUsd ?? 0));
  const maxTvl   = Math.max(1, ...sorted.map((r) => r.tvl?.tvlUsd ?? 0));
  const totalTvl = sorted.reduce((s, r) => s + (r.tvl?.tvlUsd ?? 0), 0);
  const anyPriced = sorted.some((r) => (r.tvl?.tokensPriced ?? 0) > 0);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 4px 24px rgba(37,99,235,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 md:px-5 py-3 gap-3 flex-wrap"
        style={{
          background: "linear-gradient(90deg, rgba(37,99,235,0.05), rgba(124,58,237,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#2563eb" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#2563eb" }} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>
            Live TVL by protocol
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#64748b" }}>
          <span className="font-mono font-semibold tabular-nums" style={{ color: "#0f172a" }}>
            {compactUsd(totalTvl)}
          </span>
          <span>locked across {sorted.length} protocols</span>
        </div>
      </div>

      {/* Rows */}
      <div className="px-4 md:px-5 py-4">
        {!anyPriced ? (
          <div className="py-6 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: "#0f172a" }}>
              Pricing indexed tokens…
            </div>
            <div className="text-xs" style={{ color: "#94a3b8" }}>
              TVL appears here as soon as we&apos;ve priced the locked assets.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(({ protocol, tvl }) => {
              const tvlUsd       = tvl?.tvlUsd ?? 0;
              const coveragePct  = tvl ? Math.round(tvl.coverage * 100) : 0;
              const widthPct     = Math.max(2, (tvlUsd / maxTvl) * 100); // min 2% so the bar is always visible
              const hasValue     = tvlUsd > 0;

              return (
                <Link
                  key={protocol.slug}
                  href={`/unlocks/${protocol.slug}`}
                  className="block group"
                >
                  <div className="flex items-center gap-3 mb-1">
                    {/* Icon tile */}
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
                      style={{
                        background: protocol.bg,
                        border:     `1px solid ${protocol.border}`,
                        color:      protocol.color,
                      }}
                    >
                      {protocol.name.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                      {protocol.name}
                    </span>
                    <div className="flex-1" />
                    <span className="text-sm font-bold tabular-nums" style={{ color: hasValue ? "#0f172a" : "#94a3b8" }}>
                      {compactUsd(tvlUsd)}
                    </span>
                    <span
                      className="text-[10px] font-semibold tabular-nums whitespace-nowrap"
                      style={{ color: "#94a3b8", minWidth: 52, textAlign: "right" }}
                      title={`${tvl?.tokensPriced ?? 0}/${tvl?.totalTokens ?? 0} tokens priced`}
                    >
                      {tvl?.totalTokens ? `${coveragePct}% priced` : "no data"}
                    </span>
                  </div>
                  {/* Bar */}
                  <div
                    className="w-full h-2 rounded-full overflow-hidden"
                    style={{ background: "rgba(0,0,0,0.04)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all group-hover:brightness-110"
                      style={{
                        width:      hasValue ? `${widthPct}%` : "0%",
                        background: `linear-gradient(90deg, ${protocol.color}, ${protocol.color}dd)`,
                      }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer note — honest caveat */}
      <div
        className="px-4 md:px-5 py-2.5 text-[10.5px] leading-relaxed"
        style={{
          background:  "rgba(0,0,0,0.015)",
          borderTop:   "1px solid rgba(0,0,0,0.05)",
          color:       "#94a3b8",
        }}
      >
        TVL = sum of locked tokens × DexScreener spot price. Only tokens with liquid DEX pairs (&gt;$1k) are counted.
        Coverage shows the share of indexed tokens we could price — the rest fall out of the total.
      </div>
    </div>
  );
}
