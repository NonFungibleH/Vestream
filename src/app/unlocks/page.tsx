// /unlocks – index page for all date-windowed unlock landing pages.
//
// Why this exists: Google ranks date-stamped, time-sensitive pages well, but
// only when there's a clear hub linking them. This index serves as the parent
// for all /unlocks/[range] pages, surfacing each window's live count so the
// page itself isn't thin.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ALL_WINDOW_SLUGS, WINDOWS, getUnlocksInWindow, EMPTY_WINDOW_RESULT, enrichGroupsWithUsd } from "@/lib/vesting/unlock-windows";
import { readTokenRollups } from "@/lib/vesting/token-rollups";
import { after } from "next/server";
import { getLastGoodUnlocksData, setLastGoodUnlocksData } from "@/lib/vesting/page-data-fallback";
import { UnlockCountdown } from "@/components/UnlockCountdown";
import { getProtocol, chainBrand } from "@/lib/protocol-constants";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";
import { withTimeout } from "@/lib/with-timeout";

// ISR (30-min). Renders once per revalidation (background — no request-timeout
// pressure), NOT per request. The force-dynamic version fired window scans on
// EVERY request and exhausted the Supabase pooler (ECHECKOUTTIMEOUT), slowing
// the whole site. Counts now run SEQUENTIALLY (one connection at a time) using
// the proven getUnlocksInWindow. Build bakes "–"; the first revalidation after
// deploy fills the real numbers.
export const revalidate = 1800;

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
  title:       "Token Unlock Calendar – All Upcoming Vesting Events | Vestream",
  description: "Live calendar of upcoming token unlocks across 11+ vesting protocols and 9+ chains. View by today, this week, this month, or rolling 30/60/90-day windows.",
  alternates:  { canonical: "https://www.vestream.io/unlocks" },
  openGraph: {
    title:       "Token Unlock Calendar – Vestream",
    description: "Live calendar of upcoming token unlocks across 11+ vesting protocols and 9+ chains.",
    url:         "https://www.vestream.io/unlocks",
    siteName:    "Vestream",
    type:        "website",
  },
};

type WindowCount = { slug: string; unlockCount: number; tokenCount: number; chainCount: number };

/** One row of the next-unlocks table. */
type UpcomingRow = {
  symbol: string | null; address: string; chainId: number; protocol: string;
  eventTime: number; amount: string | null; decimals: number; usdValue: number | null;
  // Concentration — the columns nobody else has. Sourced from
  // token_vesting_rollups, which the refresh-rollups cron keeps warm.
  walletCount: number | null;
  // Total locked for the token, so a row can say how big THIS unlock is
  // relative to everything still vesting (explorer-style context).
  totalLocked: bigint | null;
};

/**
 * The next 25 unlocks across every protocol and chain, joined with holder
 * concentration.
 *
 * The differentiator vs a CoinGecko/DropsTab unlock table is the last two
 * columns: how many wallets share the unlock and what share the largest holder
 * takes. "$4M unlocks Friday" reads very differently when one wallet owns 90%
 * of it than when it is split across 300 — and that split is exactly what our
 * per-wallet indexing knows and a purely token-level dataset cannot.
 *
 * Cost measured before building: 30d window at pool 1000 is ~1.5s + 0.35s
 * pricing + 0.4s rollups. liveFallback:false keeps pricing pure-DB (the
 * explorer's opt-out); bounded so a slow read degrades to hiding the table
 * rather than hanging an ISR render.
 */
/**
 * ONE query powers the whole page.
 *
 * This used to be nine: eight window-count queries plus the table's own. All
 * eight counts were rendering "-" in production and still charging their full
 * timeout, roughly 20s of pure waiting per render, and the table query then ran
 * on an exhausted pool and timed out too. The page took 33s to produce nothing.
 * Every window is a sub-range of the widest one, so a single 90-day fetch
 * answers all of them and the counts become in-memory filters.
 *
 * Counts are computed BEFORE USD enrichment (they need no prices); only the
 * ~25 rows actually rendered get priced.
 */
type Persisted = { counts: WindowCount[]; upcoming: Array<Omit<UpcomingRow, "totalLocked"> & { totalLocked: string | null }> };

/** Last good render, so a degraded read never shows an empty page. */
async function lastGood(): Promise<{ counts: Map<string, WindowCount>; upcoming: UpcomingRow[] } | null> {
  const saved = await getLastGoodUnlocksData<Persisted>();
  if (!saved || saved.upcoming.length === 0) return null;
  return {
    counts: new Map(saved.counts.map((c) => [c.slug, c])),
    // BigInt does not survive JSON, so totalLocked round-trips as a string.
    upcoming: saved.upcoming.map((u) => ({ ...u, totalLocked: u.totalLocked == null ? null : BigInt(u.totalLocked) })),
  };
}

async function getPageData(limit = 25): Promise<{ counts: Map<string, WindowCount>; upcoming: UpcomingRow[] }> {
  const empty = { counts: new Map<string, WindowCount>(), upcoming: [] as UpcomingRow[] };
  // Build phase: serve the last good render rather than baking an empty page.
  if (process.env.NEXT_PHASE === "phase-production-build") return (await lastGood()) ?? empty;

  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = nowSec + 90 * 86_400;   // widest window any card asks for

  // Pool 1000, not 2000. Measured against prod: 90d at pool 2000 costs 2,447ms
  // and returns 1,367 groups; at pool 1000 it costs 320ms for 782 — 7.6x
  // cheaper, and 782 groups over 90 days is ample for eight window counts plus
  // a 25-row table. The wider pool is what pushed this render past the route's
  // 60s ceiling, which made the page serve empty again.
  // Bound is 15s rather than 25s so a slow read fails fast and leaves budget
  // for the rest of the render instead of consuming it.
  const win = await withTimeout(
    getUnlocksInWindow(nowSec, endSec, 1000),
    15_000,
    EMPTY_WINDOW_RESULT,
    "unlocks:all",
  );
  const groups = win.groups;
  if (groups.length === 0) return (await lastGood()) ?? empty;

  const counts = new Map<string, WindowCount>();
  for (const slug of ALL_WINDOW_SLUGS) {
    const r = WINDOWS[slug].range();
    const inWindow = groups.filter((g) => g.eventTime >= r.startSec && g.eventTime <= r.endSec);
    counts.set(slug, {
      slug,
      unlockCount: inWindow.length,
      tokenCount:  new Set(inWindow.map((g) => `${g.chainId}:${g.tokenAddress.toLowerCase()}`)).size,
      chainCount:  new Set(inWindow.map((g) => g.chainId)).size,
    });
  }

  const next = [...groups].sort((x, y) => x.eventTime - y.eventTime).slice(0, limit);
  // redis:false is ISR-safe; liveFallback:false keeps pricing pure-DB (the
  // explorer's own opt-out) so no DexScreener latency lands on the render path.
  const priced = await enrichGroupsWithUsd(next, { redis: false, liveFallback: false });

  // Rollups are best-effort: roughly 1 in 5 tokens has no row yet and renders
  // "-" rather than the unlock being dropped.
  const rollups = await withTimeout(
    readTokenRollups(priced.map((g) => ({ chainId: g.chainId, tokenAddress: g.tokenAddress }))),
    5_000,
    new Map(),
    "unlocks:rollups",
  );

  const upcoming: UpcomingRow[] = priced.map((g) => {
    const r = rollups.get(`${g.chainId}:${g.tokenAddress.toLowerCase()}`)
           ?? rollups.get(`${g.chainId}:${g.tokenAddress}`);
    return {
      symbol: g.tokenSymbol, address: g.tokenAddress, chainId: g.chainId,
      protocol: g.protocol, eventTime: g.eventTime, amount: g.amount,
      decimals: g.tokenDecimals, usdValue: g.usdValue ?? null,
      walletCount: r?.walletCount ?? null,
      totalLocked: r?.totalLocked ?? null,
    };
  });

  // Good render: keep the durable copy fresh. In after() so the write cannot
  // flip this ISR render dynamic.
  if (upcoming.length > 0) {
    after(() => setLastGoodUnlocksData<Persisted>({
      counts: [...counts.values()],
      upcoming: upcoming.map((u) => ({ ...u, totalLocked: u.totalLocked == null ? null : u.totalLocked.toString() })),
    }));
  }
  return { counts, upcoming };
}

function fmtAmt(amount: string | null, decimals: number): string | null {
  if (!amount) return null;
  try {
    const v = Number(BigInt(amount)) / 10 ** decimals;
    if (!Number.isFinite(v) || v <= 0) return null;
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toFixed(2);
  } catch { return null; }
}

function whenLabel(sec: number): { date: string; rel: string } {
  const d = new Date(sec * 1000);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const days = Math.round((sec * 1000 - Date.now()) / 86_400_000);
  const rel = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`;
  return { date, rel };
}

export default async function UnlocksIndex() {
  // Table FIRST: it is the page's actual content, and it must not be starved by
  // the window counts (which are a secondary nav aid and currently all "–").
  const { counts, upcoming } = await getPageData(25);

  const indexJsonLd = {
    "@context": "https://schema.org",
    "@type":    "CollectionPage",
    name:       "Token Unlock Calendar",
    url:        "https://www.vestream.io/unlocks",
    description: "Live calendar of upcoming token unlocks across vesting protocols and chains.",
    hasPart: ALL_WINDOW_SLUGS.map((slug) => ({
      "@type": "WebPage",
      name:    WINDOWS[slug].label,
      url:     `https://www.vestream.io/unlocks/${slug}`,
    })),
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(indexJsonLd) }}
      />

      <SiteNav theme="light" />

      {/* ── Hero (breadcrumb integrated, no separate bordered bar) ─────── */}
      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-12 md:pb-16 max-w-5xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Unlocks</li>
          </ol>
        </nav>
        <div className="text-center mb-6">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
            Live Unlock Calendar
          </p>
          <h1 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
            Every upcoming token unlock,<br />
            <span style={{ color: "#1CB8B8" }}>indexed live.</span>
          </h1>
          <p className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: "#475569" }}>
            View upcoming unlocks across 11+ vesting protocols and 9+ chains. Pick a window – today, this week, this month, or rolling 30/60/90-day – to see exactly what unlocks when.
          </p>
        </div>
      </section>

      {/* ── Next unlocks table ────────────────────────────────────────
          The hub used to be window cards only — a reader had to pick a
          window before seeing a single unlock. This puts the actual data
          first, and carries the two columns competitors can't: how many
          wallets share each unlock, and what the largest holder takes. */}
      {upcoming.length > 0 && (
        <section className="px-4 md:px-8 pb-14 max-w-6xl mx-auto w-full">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h2 className="text-xl md:text-2xl font-bold" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
              The next 25 unlocks
            </h2>
            <span className="text-xs" style={{ color: "#8B8E92" }}>Across every protocol and chain we index</span>
          </div>
          <p className="text-sm mb-5" style={{ color: "#475569" }}>
            Every protocol and chain we index, soonest first, with a live countdown to each one and how
            much of the token&apos;s locked supply it releases.
          </p>

          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            {/* Wide table scrolls inside its own container, never the page body. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: "880px" }}>
                <thead>
                  <tr style={{ background: "rgba(21,23,26,0.02)" }}>
                    {["Token", "Protocol", "Unlocks", "Countdown", "Amount", "Value", "% of locked", "Holders"].map((h, i) => (
                      <th
                        key={h}
                        className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                        style={{
                          color: "#8B8E92",
                          textAlign: i >= 4 ? "right" : "left",
                          borderBottom: "1px solid rgba(21,23,26,0.08)",
                        }}
                      >{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((u, i) => {
                    const p = getProtocol(u.protocol);
                    const b = chainBrand(u.chainId);
                    const w = whenLabel(u.eventTime);
                    const amt = fmtAmt(u.amount, u.decimals);
                    // How much of everything still locked for this token is
                    // releasing in THIS event. Both sides are raw base units of
                    // the same token, so decimals cancel and no conversion is
                    // needed; done in BigInt to avoid precision loss on large
                    // supplies, then scaled to a percent.
                    const pctLocked = (() => {
                      if (!u.amount || u.totalLocked == null || u.totalLocked <= 0n) return null;
                      try {
                        const bps = (BigInt(u.amount) * 10_000n) / u.totalLocked;
                        const v = Number(bps) / 100;
                        return Number.isFinite(v) ? Math.min(100, v) : null;
                      } catch { return null; }
                    })();
                    return (
                      <tr key={`${u.chainId}-${u.address}-${u.eventTime}-${i}`} className="transition-colors hover:bg-black/[0.015]">
                        <td className="px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          <Link href={`/token/${u.chainId}/${u.address}`} className="font-semibold hover:underline" style={{ color: "#1A1D20" }}>
                            {u.symbol || `${u.address.slice(0, 6)}…${u.address.slice(-4)}`}
                          </Link>
                          <span className="ml-2 text-[11px]" style={{ color: b.color }}>{b.name}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          <span className="text-xs font-medium" style={{ color: p?.color ?? "#8B8E92" }}>{p?.name ?? u.protocol}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          <span style={{ color: "#1A1D20" }}>{w.date}</span>
                          <span className="ml-1.5 text-[11px]" style={{ color: "#8B8E92" }}>{w.rel}</span>
                        </td>
                        {/* Live ticking countdown. Client island, mount-gated,
                            so the server markup stays stable and this cannot
                            cause a hydration mismatch. */}
                        <td className="px-4 py-3 whitespace-nowrap" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          <UnlockCountdown unlockTimeSec={u.eventTime} compact />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: "#475569", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {amt ?? "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: u.usdValue != null ? "#0F8A8A" : "#B8BABD", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {u.usdValue != null ? fmtUsd(u.usdValue) : "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: pctLocked != null ? "#475569" : "#B8BABD", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {pctLocked != null ? `${pctLocked < 1 ? pctLocked.toFixed(1) : pctLocked.toFixed(0)}%` : "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: u.walletCount != null ? "#475569" : "#B8BABD", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {u.walletCount != null ? u.walletCount.toLocaleString("en-US") : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] mt-3" style={{ color: "#B8BABD" }}>
            Holder counts come from Vestream&apos;s per-wallet index. A dash means we haven&apos;t finished
            indexing that token&apos;s recipients yet.
          </p>
        </section>
      )}

      {/* ── Window cards ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 md:pb-28 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ALL_WINDOW_SLUGS.map((slug) => {
            const def = WINDOWS[slug];
            const c   = counts.get(slug);
            const hasData = c && c.unlockCount > 0;
            return (
              <Link
                key={slug}
                href={`/unlocks/${slug}`}
                className="rounded-2xl p-5 transition-all hover:-translate-y-0.5"
                style={{
                  background: "white",
                  border:     "1px solid rgba(21,23,26,0.10)",
                  boxShadow:  "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                <h2 className="text-base font-bold mb-1" style={{ color: "#1A1D20" }}>
                  {def.dynamicLabel?.() ?? def.label}
                </h2>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "#8B8E92" }}>
                  {def.dynamicDescription?.() ?? def.description}
                </p>
                <div className="flex items-baseline gap-3 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <div>
                    <div className="font-semibold text-lg tabular-nums" style={{ color: hasData ? "#0F8A8A" : "#B8BABD" }}>
                      {hasData ? c.unlockCount : "–"}
                    </div>
                    <div className="text-[10px]" style={{ color: "#B8BABD" }}>
                      unlock{c?.unlockCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  {hasData && (
                    <>
                      <div>
                        <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>{c.tokenCount}</div>
                        <div className="text-[10px]" style={{ color: "#B8BABD" }}>token{c.tokenCount === 1 ? "" : "s"}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-sm tabular-nums" style={{ color: "#1A1D20" }}>{c.chainCount}</div>
                        <div className="text-[10px]" style={{ color: "#B8BABD" }}>chain{c.chainCount === 1 ? "" : "s"}</div>
                      </div>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Monthly reports, dated, shareable summaries of each month's unlocks. */}
        <div className="mt-6 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#1A1D20" }}>Monthly Token Unlock Reports</h2>
            <p className="text-xs leading-relaxed mt-1" style={{ color: "#8B8E92" }}>
              The biggest unlocks each month, ranked by USD value across every protocol and chain.
            </p>
          </div>
          <Link href="/unlocks/report"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap self-start"
            style={{ background: "#0F8A8A", color: "white" }}>
            View reports →
          </Link>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
