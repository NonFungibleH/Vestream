// /chains - index of per-chain token-unlock pages, as a vesting-TVL leaderboard.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Provenance } from "@/components/Provenance";
import { chainSlug, chainBrand, chainIcon, listProtocols, getProtocol } from "@/lib/protocol-constants";
import { getChainsOverview, getUpcomingUnlocksAcrossChains } from "@/lib/vesting/chain-stats";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 600;

// Vercel's default function duration is short (~15s) unless a route raises it,
// and it applies to ISR REGENERATION too. This page's data work runs well past
// that — the per-chain unlock fan-out alone measures ~10.6s in the production
// runtime — so every regeneration was being killed mid-render and Vercel kept
// serving the empty build-time prerender indefinitely. That, not a slow query,
// is why the unlock calendar showed "-" for every window and the tables were
// blank in production: an /api/admin/unlocks-debug probe run inside the real
// runtime returned the unscoped window query in 1,076ms with 237 groups, so
// the data layer was healthy the whole time.
//
// /status and /admin/growth already set this for the same reason.
export const maxDuration = 60;


export const metadata: Metadata = {
  title: "Token Unlocks by Chain · Vestream",
  description:
    "Vesting TVL leaderboard by blockchain: Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, Solana, and Robinhood Chain. See TVL, protocols, and upcoming unlocks per chain.",
  alternates: { canonical: "https://www.vestream.io/chains" },
  openGraph: {
    title: "Token Unlocks by Chain",
    description: "Vesting TVL, protocols, and upcoming unlocks for every chain Vestream indexes.",
    url: "https://www.vestream.io/chains", siteName: "Vestream", type: "website",
  },
};

function n(x: number) { return x.toLocaleString("en-US"); }

/**
 * Faint grid texture for hero sections.
 *
 * The page was flat #F5F5F3 with nothing behind it, so it read as a blank
 * sheet rather than a surface. Two repeating gradients cost nothing (no image
 * request) and give the eye something to register depth against; kept at ~3%
 * so it reads as paper, not graph paper.
 */
const GRID_TEXTURE = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(21,23,26,0.028) 0 1px, transparent 1px 64px)," +
    "repeating-linear-gradient(90deg, rgba(21,23,26,0.028) 0 1px, transparent 1px 64px)",
  maskImage:        "radial-gradient(ellipse 75% 65% at 50% 20%, #000 30%, transparent 78%)",
  WebkitMaskImage:  "radial-gradient(ellipse 75% 65% at 50% 20%, #000 30%, transparent 78%)",
} as const;

/** Same idea on the dark band, drawn in light instead of ink. */
const GRID_TEXTURE_DARK = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 64px)," +
    "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 64px)",
  maskImage:        "radial-gradient(ellipse 70% 70% at 50% 0%, #000 20%, transparent 75%)",
  WebkitMaskImage:  "radial-gradient(ellipse 70% 70% at 50% 0%, #000 20%, transparent 75%)",
} as const;

function fmtUnlockDate(sec: number) {
  return new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ChainsIndexPage() {
  // Sequential, not Promise.all: both are heavy DB reads and running them
  // concurrently had them fighting for the same pool connections.
  const feed = await getUpcomingUnlocksAcrossChains(8);
  const o    = await getChainsOverview();
  const max = o.chains[0]?.tvlUsd ?? 0;
  const total = o.chains.reduce((sum, c) => sum + (c.tvlUsd > 0 ? c.tvlUsd : 0), 0);
  const protocolCount = listProtocols().length;
  const protoMeta = new Map(listProtocols().map((p) => [p.slug, p]));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Token vesting by chain",
    itemListElement: o.chains.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: chainBrand(c.chainId).name,
      url: `https://www.vestream.io/chains/${chainSlug(c.chainId)}`,
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-12 md:pt-32 md:pb-16 px-4 md:px-8 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 85% 55% at 50% -5%, rgba(28,184,184,0.16) 0%, rgba(28,184,184,0.05) 45%, transparent 72%)",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={GRID_TEXTURE} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: "linear-gradient(90deg, transparent, rgba(28,184,184,0.3), transparent)",
        }} />

        <div className="relative max-w-4xl mx-auto">
          {/* Live stats pill — mirrors /protocols */}
          <div
            className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-4 py-2 rounded-full border text-xs sm:text-sm font-semibold mb-8"
            style={{ background: "rgba(28,184,184,0.06)", borderColor: "rgba(28,184,184,0.2)", color: "#0F8A8A" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#1CB8B8" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#1CB8B8" }} />
              </span>
              <span className="uppercase tracking-wide" style={{ letterSpacing: "0.08em" }}>Live</span>
            </span>
            {o.totalTvl > 0 && <>
              <span aria-hidden style={{ color: "rgba(28,184,184,0.4)" }}>·</span>
              <span><span className="font-bold tabular-nums" style={{ color: "#0B6E6E" }}>{fmtUsd(o.totalTvl)}</span> TVL</span>
            </>}
            <span aria-hidden style={{ color: "rgba(28,184,184,0.4)" }}>·</span>
            <span><span className="font-bold tabular-nums" style={{ color: "#0B6E6E" }}>{n(o.chains.length)}</span> chains</span>
            <span aria-hidden style={{ color: "rgba(28,184,184,0.4)" }}>·</span>
            <span><span className="font-bold tabular-nums" style={{ color: "#0B6E6E" }}>{n(protocolCount)}</span> protocols</span>
            {o.totalStreams > 0 && <>
              <span aria-hidden style={{ color: "rgba(28,184,184,0.4)" }}>·</span>
              <span><span className="font-bold tabular-nums" style={{ color: "#0B6E6E" }}>{n(o.totalStreams)}</span> streams</span>
            </>}
          </div>

          <h1 className="font-bold tracking-tight mb-6" style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.03em", color: "#1A1D20" }}>
            Token vesting on every chain,<br />
            <span style={{ color: "#1CB8B8" }}>in one live index</span>
          </h1>

          <p className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: "#8B8E92" }}>
            Every major EVM chain plus Solana and Robinhood Chain, indexed in real time. Pick a chain to see its vesting TVL, the protocols on it, and every upcoming unlock.
          </p>
          <div className="mt-5 flex justify-center">
            <Provenance updatedISO={o.computedAt} />
          </div>

          {/* The whole index as ONE shape. Nine separate cards never showed the
              reader how the total splits — this does it before they scroll,
              and gives the hero something to look at besides text. */}
          {total > 0 && (
            <div className="mt-10 max-w-3xl mx-auto">
              <div
                className="h-4 rounded-full overflow-hidden flex"
                style={{ background: "rgba(15,138,138,0.06)", boxShadow: "inset 0 1px 2px rgba(21,23,26,0.06)" }}
              >
                {o.chains.filter((c) => c.tvlUsd > 0).map((c) => {
                  const b = chainBrand(c.chainId);
                  return (
                    <div
                      key={c.chainId}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${(c.tvlUsd / total) * 100}%`, background: b.color, boxShadow: "inset -1px 0 0 rgba(255,255,255,0.7)" }}
                      title={`${b.name}: ${fmtUsd(c.tvlUsd)}`}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {o.chains.filter((c) => c.tvlUsd > 0).slice(0, 5).map((c) => {
                  const b = chainBrand(c.chainId);
                  return (
                    <span key={c.chainId} className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#475569" }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                      {b.name}
                      <span className="tabular-nums" style={{ color: "#8B8E92" }}>{Math.round((c.tvlUsd / total) * 100)}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── TVL leaderboard — rich, clickable card per chain ─────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-4xl mx-auto w-full">
        <h2 className="text-xl md:text-2xl font-bold mb-6" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          Vesting TVL by chain
        </h2>
        <div className="space-y-3">
          {o.chains.map((c, i) => {
            const brand = chainBrand(c.chainId);
            const icon  = chainIcon(c.chainId);
            const slug  = chainSlug(c.chainId);
            // Only used for the no-composition fallback bar below, where there
            // is nothing to show proportions BETWEEN, so share-of-leader is the
            // only meaningful thing the bar can encode.
            const pct   = max > 0 && c.tvlUsd > 0 ? Math.max(2, (c.tvlUsd / max) * 100) : 0;
            const share = total > 0 && c.tvlUsd > 0 ? (c.tvlUsd / total) * 100 : 0;
            const feat  = i < 3 && c.tvlUsd > 0;

            // Protocol composition on this chain — sorted by TVL, for the
            // stacked bar + top-protocol chips (replaces the scroll matrix).
            const comp = Object.entries(c.byProtocol)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1]);
            const compTotal = comp.reduce((s, [, v]) => s + v, 0);

            return (
              <Link
                key={c.chainId}
                href={`/chains/${slug}`}
                className="block p-4 md:p-5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  background: "white",
                  border: `1px solid ${feat ? "rgba(15,138,138,0.18)" : "rgba(21,23,26,0.08)"}`,
                  boxShadow: feat
                    ? "0 2px 10px rgba(15,138,138,0.07), 0 1px 3px rgba(0,0,0,0.03)"
                    : "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div className="flex items-center gap-3 md:gap-4">
                  <span
                    className="text-sm font-bold tabular-nums w-5 text-center flex-shrink-0"
                    style={{ color: feat ? "#0F8A8A" : "#B8BABD" }}
                  >{i + 1}</span>
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: brand.bg, border: `1px solid ${brand.border}` }}>
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" width={40} height={40} className="w-full h-full object-contain p-1.5" />
                    ) : (
                      <span className="font-extrabold text-base" style={{ color: brand.color }}>{brand.name[0]}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold text-base truncate" style={{ color: "#1A1D20" }}>{brand.name}</p>
                      <p className="text-base font-bold tabular-nums flex-shrink-0" style={{ color: "#0F8A8A" }}>{c.tvlUsd > 0 ? fmtUsd(c.tvlUsd) : "–"}</p>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "#8B8E92" }}>
                      {share > 0 && (
                        <span className="font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>
                          {share >= 1 ? share.toFixed(0) : share.toFixed(1)}% of index
                        </span>
                      )}
                      {share > 0 ? " · " : ""}
                      {n(c.protocolCount)} {c.protocolCount === 1 ? "protocol" : "protocols"}
                      {c.streamCount > 0 ? ` · ${n(c.streamCount)} streams` : ""}
                    </p>
                  </div>
                </div>

                {/* Composition bar: one segment per protocol, coloured by
                    protocol brand. Falls back to a single scaled teal bar
                    when we have no per-protocol split (e.g. cold data). */}
                <div
                  className="mt-3 h-2.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(21,23,26,0.04)", boxShadow: "inset 0 1px 2px rgba(21,23,26,0.05)" }}
                >
                  {/* Full-width composition, not scaled by share-of-leader.
                      Scaling the fill made the split unreadable exactly where
                      it matters most: a chain holding 0.1% of the index had its
                      three protocols crammed into a 2px stub. Magnitude is
                      already carried by the TVL figure and the "% of index"
                      label next to it, so the bar is free to do the one job a
                      bar is good at, which is showing proportion. */}
                  <div className="h-full rounded-full overflow-hidden flex" style={{ width: "100%" }}>
                    {comp.length > 0 && compTotal > 0
                      ? comp.map(([slugP, v]) => {
                          const m = protoMeta.get(slugP);
                          return (
                            <div
                              key={slugP}
                              className="h-full"
                              style={{ width: `${(v / compTotal) * 100}%`, background: m?.color ?? "#94a3b8", boxShadow: "inset -1px 0 0 rgba(255,255,255,0.6)" }}
                              title={`${m?.name ?? slugP}: ${fmtUsd(v)}`}
                            />
                          );
                        })
                      : <div className="h-full" style={{ width: `${pct}%`, background: brand.color }} />}
                  </div>
                </div>

                {/* Top-protocol legend chips */}
                {comp.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {comp.slice(0, 4).map(([slugP, v]) => {
                      const m = protoMeta.get(slugP);
                      return (
                        <span key={slugP} className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#475569" }}>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m?.color ?? "#94a3b8" }} />
                          {m?.name ?? slugP}
                          <span className="tabular-nums" style={{ color: "#8B8E92" }}>{fmtUsd(v)}</span>
                        </span>
                      );
                    })}
                    {comp.length > 4 && (
                      <span className="text-[11px] font-medium" style={{ color: "#B8BABD" }}>+{comp.length - 4} more</span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Dark band ────────────────────────────────────────────────────
          One dark section mid-page. Every Vestream surface was the same
          off-white value, so nothing carried emphasis; a light -> dark -> light
          rhythm is what gives the page a centre of gravity, and it costs
          nothing in palette terms (this navy is the same #0d1b35 the
          /developer page already owns). The content is deliberately the
          highest-value thing we have: live money, dated, across every chain. */}
      {feed.length > 0 && (
        <section className="relative overflow-hidden px-4 md:px-8 py-16 md:py-24" style={{ background: "#0d1b35" }}>
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(28,184,184,0.14) 0%, transparent 70%)",
          }} />
          <div className="absolute inset-0 pointer-events-none" style={GRID_TEXTURE_DARK} />
          <div className="absolute top-0 left-0 right-0 h-px" style={{
            background: "linear-gradient(90deg, transparent, rgba(28,184,184,0.45), transparent)",
          }} />

          <div className="relative max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-5"
                style={{ background: "rgba(28,184,184,0.1)", borderColor: "rgba(28,184,184,0.28)", color: "#5FD4D4" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#1CB8B8" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#1CB8B8" }} />
                </span>
                NEXT 7 DAYS
              </div>
              <h2 className="font-bold mb-3" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", letterSpacing: "-0.03em", color: "white", lineHeight: 1.1 }}>
                The biggest unlocks coming up
              </h2>
              <p className="text-sm md:text-base max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
                Across every chain and protocol we index, ranked by value at today&apos;s prices.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {feed.map((u, i) => {
                const b  = chainBrand(u.chainId);
                const pr = getProtocol(u.protocol);
                return (
                  <Link
                    key={`${u.chainId}-${u.address}-${u.eventTime}-${i}`}
                    href={`/token/${u.chainId}/${u.address}`}
                    className="flex items-center gap-3 p-4 rounded-2xl transition-all duration-200 hover:-translate-y-0.5"
                    style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold"
                      style={{ background: `${b.color}1f`, border: `1px solid ${b.color}44`, color: b.color }}
                      title={b.name}
                    >{b.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: "white" }}>
                        {u.symbol || `${u.address.slice(0, 6)}…${u.address.slice(-4)}`}
                        {pr && <span className="ml-2 text-[11px] font-medium" style={{ color: pr.color }}>{pr.name}</span>}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                        {b.name} · {fmtUnlockDate(u.eventTime)}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "#5FD4D4" }}>
                      {u.usdValue != null ? fmtUsd(u.usdValue) : "–"}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/unlocks"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", color: "white", boxShadow: "0 4px 20px rgba(28,184,184,0.28)" }}
              >
                See the full unlock calendar →
              </Link>
            </div>
          </div>
        </section>
      )}

      <SiteFooter theme="light" />
    </div>
  );
}
