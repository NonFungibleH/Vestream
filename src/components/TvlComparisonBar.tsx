// src/components/TvlComparisonBar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Server component — horizontal bar chart comparing TVL across every indexed
// protocol, with honest confidence-band reporting.
//
// Each row shows:
//   • Protocol brand tile + name
//   • Horizontal bar: width = tvl / maxTvl
//   • USD total (all bands combined)
//   • Priced-token coverage (tokens we priced / tokens indexed)
//
// The header reports both the all-bands total AND the high-confidence subset,
// so a reader gets directional accuracy without having to trust the long
// tail. The footer explains the methodology in plain English — two pricing
// sources (DexScreener + CoinGecko) and the three liquidity bands that
// determine confidence.
//
// Empty state (no priced tokens anywhere): shows a subtle "Indexing…" hint.
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

export function TvlComparisonBar({
  rows,
  externallySourced,
  snapshotAgeHours,
}: {
  rows:               TvlComparisonRow[];
  /** Slugs whose TVL came from an external source (e.g. DefiLlama)
   *  rather than our own priced-cache computation. Rendered with a
   *  small attribution tag so the reader can distinguish the two. */
  externallySourced?: Set<string>;
  /** Age of the oldest snapshot row (hours). Surfaced in the (i) tooltip
   *  as a "last verified X ago" signal so the reader knows how fresh the
   *  numbers are. Null when no snapshot exists yet. */
  snapshotAgeHours?:  number | null;
}) {
  const sorted = [...rows].sort((a, b) => (b.tvl?.tvlUsd ?? 0) - (a.tvl?.tvlUsd ?? 0));
  const maxTvl = Math.max(1, ...sorted.map((r) => r.tvl?.tvlUsd ?? 0));

  // Aggregate totals across all protocols, split by confidence.
  const totalAll  = sorted.reduce((s, r) => s + (r.tvl?.tvlUsd ?? 0), 0);
  const totalHigh = sorted.reduce((s, r) => s + (r.tvl?.tvlByBand.high ?? 0), 0);
  const totalMed  = sorted.reduce((s, r) => s + (r.tvl?.tvlByBand.medium ?? 0), 0);
  // tvlByBand.low intentionally NOT summed for display — see the sub-header
  // comment block. The thin-band aggregate is forensic-audit data only.

  const anyPriced   = sorted.some((r) => (r.tvl?.tokensPriced ?? 0) > 0);
  const hasExternal = !!externallySourced && externallySourced.size > 0;

  return (
    // overflow-visible so the methodology tooltip can extend past the card
    // edge without being clipped. Rounded corners still look clean because
    // each internal section clips to its own padding.
    <div
      className="rounded-2xl flex flex-col h-full relative"
      style={{
        background: "white",
        border: "1px solid rgba(21,23,26,0.10)",
        boxShadow: "0 4px 24px rgba(28,184,184,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 md:px-5 py-3 gap-3 flex-wrap rounded-t-2xl"
        style={{
          background: "linear-gradient(90deg, rgba(28,184,184,0.05), rgba(15,138,138,0.04))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#1CB8B8" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#1CB8B8" }} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#1CB8B8" }}>
            Vesting TVL by protocol
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#8B8E92" }}>
          <span className="font-mono font-semibold tabular-nums" style={{ color: "#1A1D20" }}>
            {compactUsd(totalAll)}
          </span>
          <span>across {sorted.length} protocols</span>
          {/* Methodology info tooltip. Uses a containing element with a wider
              bounding box + left-positioned tooltip (anchored to the RIGHT
              side of the card instead of the icon) so the tooltip never
              extends past the left edge on a narrow card. */}
          <span
            className="group relative inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help flex-shrink-0"
            style={{ background: "rgba(0,0,0,0.04)", color: "#8B8E92" }}
            tabIndex={0}
            aria-label="Pricing methodology"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            {/* Tooltip — appears on hover (desktop) or focus (keyboard).
                Width caps at 18rem but shrinks on narrow viewports so it
                never exceeds the screen width. Positioned BELOW + slight
                LEFT of the icon; arrow → icon. Mobile tap triggers focus
                via tabIndex=0, so the tooltip is still reachable without
                hover. */}
            <span
              className="pointer-events-none absolute top-full mt-2 p-3 rounded-lg text-[10.5px] leading-relaxed opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-20 shadow-lg"
              style={{
                width:      "min(20rem, calc(100vw - 2rem))",
                right:      "-4px",
                background: "white",
                border:     "1px solid rgba(21,23,26,0.10)",
                color:      "#475569",
                boxShadow:  "0 8px 24px rgba(15,23,42,0.12)",
              }}
              role="tooltip"
            >
              Every number here is <span className="font-semibold" style={{ color: "#1A1D20" }}>vesting-specific TVL</span>
              {" "}— no LP locks, no launchpad escrows, no staking. Two methodologies, depending on the protocol:
              <br /><br />
              <span className="font-semibold" style={{ color: "#0F8A8A" }}>via DefiLlama</span> — for Sablier, Hedgey, and Streamflow, we use DefiLlama&apos;s
              {" "}<span className="font-mono text-[10px]">chainTvls.vesting</span> aggregate, which they already report as a vesting-only slice.
              <br /><br />
              <span className="font-semibold" style={{ color: "#1CB8B8" }}>Self-indexed</span> — for every other protocol, we walk the protocol&apos;s data
              source exhaustively (subgraph, contract events, or Solana program accounts), sum the remaining locked token amounts, and price each
              token via DexScreener with CoinGecko as fallback. Tokens with ≥$10k DEX liquidity are <span className="font-semibold" style={{ color: "#1A1D20" }}>high</span> confidence,
              {" "}$1k–$10k <span className="font-semibold" style={{ color: "#1A1D20" }}>medium</span>; the headline excludes anything thinner. Single-token
              contributions over $200M must be high-confidence to count.
              {snapshotAgeHours !== null && snapshotAgeHours !== undefined && (
                <>
                  <br /><br />
                  <span style={{ color: "#B8BABD" }}>
                    Last verified {snapshotAgeHours < 1 ? "less than an hour" : `${snapshotAgeHours}h`} ago.
                    Refreshes daily.
                  </span>
                </>
              )}
            </span>
          </span>
        </div>
      </div>

      {/* High-confidence sub-header — reassures the reader the top line isn't
          inflated by long-tail thin-liquidity entries.
          Note: we deliberately DON'T surface the THIN band total here. It's
          a forensic-audit field (tvl_low column = capped-overflow + thin-
          liquidity contributions held back from the headline) and can
          aggregate to absurd-looking totals (e.g. $2.7 TRILLION) when memecoin
          dust is in play. The methodology tooltip explains why; the actual
          number is queryable per row in Supabase for ops audits. Keeping it
          off the public page is the whole point of having a cap. */}
      {anyPriced && (
        <div
          className="px-4 md:px-5 py-1.5 flex items-center gap-2 text-[11px]"
          style={{
            borderBottom: "1px solid rgba(0,0,0,0.04)",
            background:   "rgba(28,184,184,0.02)",
            color:        "#8B8E92",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#1CB8B8" }}
          />
          <span>
            <span className="font-semibold tabular-nums" style={{ color: "#1A1D20" }}>
              {compactUsd(totalHigh)}
            </span>
            <span className="ml-1" style={{ color: "#8B8E92" }}>
              high-confidence (≥$10k DEX liquidity)
            </span>
            {totalMed > 0 && (
              <>
                <span className="mx-1.5" style={{ color: "#cbd5e1" }}>·</span>
                <span className="font-semibold tabular-nums" style={{ color: "#334155" }}>
                  {compactUsd(totalMed)}
                </span>
                <span className="ml-1">medium</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Rows — flex-1 so the card stretches to match the sibling column.
          We use divide-y + per-row py-2.5 (instead of space-y-3) to match the
          row rhythm of the UpcomingUnlockTicker sibling exactly — otherwise
          the two columns on /protocols drift out of alignment by a few pixels
          per row, which compounds to a visible offset over 9 rows. */}
      <div className="flex-1 flex flex-col">
        {!anyPriced ? (
          <div className="px-4 md:px-5 py-6 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: "#1A1D20" }}>
              Pricing indexed tokens…
            </div>
            <div className="text-xs" style={{ color: "#B8BABD" }}>
              TVL appears here as soon as we&apos;ve priced the locked assets.
            </div>
          </div>
        ) : (
          <div className="divide-y flex-1 flex flex-col" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
            {sorted.map(({ protocol, tvl }) => {
              const tvlUsd      = tvl?.tvlUsd ?? 0;
              const coveragePct = tvl ? Math.round(tvl.coverage * 100) : 0;
              const widthPct    = Math.max(2, (tvlUsd / maxTvl) * 100);
              const hasValue    = tvlUsd > 0;
              const isExternal  = externallySourced?.has(protocol.slug) ?? false;
              // Rows where we have NO data yet (zero priced tokens, no external
              // source) get the "Indexing…" label instead of a terse "no data"
              // — makes the empty state feel intentional rather than broken.
              // Currently only Jupiter Lock (Solana, no DefiLlama entry, cache
              // not yet seeded) lands here.
              const isIndexing = !isExternal && !hasValue;

              return (
                <Link
                  key={protocol.slug}
                  href={`/protocols/${protocol.slug}`}
                  className="block group px-4 md:px-5 py-2.5 flex-1 flex flex-col justify-center"
                >
                  <div className="flex items-center gap-3 mb-1.5">
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
                    <span className="text-sm font-semibold" style={{ color: "#1A1D20" }}>
                      {protocol.name}
                    </span>
                    <div className="flex-1" />
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: hasValue ? "#1A1D20" : "#B8BABD" }}
                    >
                      {isIndexing ? "—" : compactUsd(tvlUsd)}
                    </span>
                    {isExternal ? (
                      <span
                        className="text-[10px] font-semibold tabular-nums whitespace-nowrap"
                        style={{ color: "#0F8A8A", minWidth: 66, textAlign: "right" }}
                        title="Sourced from DefiLlama's protocol API"
                      >
                        via DefiLlama
                      </span>
                    ) : isIndexing ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                        style={{ color: protocol.color, minWidth: 66, justifyContent: "flex-end" }}
                        title="Coverage starting — we're indexing this protocol now"
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span
                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                            style={{ background: protocol.color }}
                          />
                          <span
                            className="relative inline-flex rounded-full h-1.5 w-1.5"
                            style={{ background: protocol.color }}
                          />
                        </span>
                        Indexing
                      </span>
                    ) : (
                      // Self-indexed walker rows: keep coverage info accessible
                      // via tooltip (for ops + curious users) but DON'T splash
                      // a "11% priced" label that reads as "broken" to the
                      // average user. The 89% are usually pre-launch dust with
                      // no DEX listing — that's expected, not missing data.
                      // Show "self-indexed" instead, mirroring the "via
                      // DefiLlama" pattern as a methodology attribution.
                      <span
                        className="text-[10px] font-semibold whitespace-nowrap"
                        style={{ color: "#8B8E92", minWidth: 66, textAlign: "right" }}
                        title={`Self-indexed · ${tvl?.tokensPriced ?? 0}/${tvl?.totalTokens ?? 0} tokens priced (${coveragePct}%)`}
                      >
                        self-indexed
                      </span>
                    )}
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

      {/* Footer intentionally removed — methodology moved into the (i) tooltip
          next to the header total. Keeps the card visually balanced with its
          UpcomingUnlockTicker sibling in the /protocols grid, and the detail
          stays one hover away for anyone who wants it. */}
    </div>
  );
}
