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
import { publicChainIds } from "@/lib/protocol-constants";
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
  walletCount: number | null; topHolderShare: number | null;
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
async function getUpcomingTable(limit = 25): Promise<UpcomingRow[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = nowSec + 30 * 86_400;

  // Per-chain fan-out rather than one unscoped call.
  //
  // Measured on prod: an UNSCOPED getUnlocksInWindow does not return inside its
  // timeout in the Vercel runtime, while the CHAIN-SCOPED form is fast — the
  // /chains/[chain] pages render 20 unlock rows each in ~0.5s off the very same
  // function. That is also why every window count on this page renders "–" and
  // /unlocks/[range] is empty in production: a pre-existing outage of the
  // unscoped path, not something this table introduced. Nine scoped queries at
  // roughly half a second each comfortably beat one that never lands.
  //
  // Sequential, one pooler connection at a time, matching getWindowCounts above.
  const groups = [];
  for (const chainId of publicChainIds()) {
    const win = await withTimeout(
      getUnlocksInWindow(nowSec, endSec, 300, undefined, [chainId]),
      6_000,
      EMPTY_WINDOW_RESULT,
      `unlocks-table:chain-${chainId}`,
    );
    groups.push(...win.groups);
  }
  if (groups.length === 0) return [];

  const priced = await enrichGroupsWithUsd(groups, { redis: false, liveFallback: false });
  const next = [...priced].sort((a, b) => a.eventTime - b.eventTime).slice(0, limit);

  // Rollups are a best-effort enrichment: roughly 1 in 5 rows has no row yet
  // (a token the rollup cron has not covered), and those render "–" rather
  // than dropping the unlock, which is the more honest failure.
  const rollups = await withTimeout(
    readTokenRollups(next.map((g) => ({ chainId: g.chainId, tokenAddress: g.tokenAddress }))),
    5_000,
    new Map(),
    "unlocks-table:rollups",
  );

  return next.map((g) => {
    const r = rollups.get(`${g.chainId}:${g.tokenAddress.toLowerCase()}`)
           ?? rollups.get(`${g.chainId}:${g.tokenAddress}`);
    return {
      symbol: g.tokenSymbol, address: g.tokenAddress, chainId: g.chainId,
      protocol: g.protocol, eventTime: g.eventTime, amount: g.amount,
      decimals: g.tokenDecimals, usdValue: g.usdValue ?? null,
      walletCount: r?.walletCount ?? null, topHolderShare: r?.topHolderShare ?? null,
    };
  });
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

async function getWindowCounts(): Promise<Map<string, WindowCount>> {
  // SEQUENTIAL — one pooler connection at a time (the concurrent 8-at-once
  // version caused the ECHECKOUTTIMEOUT saturation). Uses the proven
  // getUnlocksInWindow; each window has a 10s budget and degrades to "–" on
  // failure without hanging the page.
  const out = new Map<string, WindowCount>();
  for (const slug of ALL_WINDOW_SLUGS) {
    const range = WINDOWS[slug].range();
    const result = await withTimeout(
      getUnlocksInWindow(range.startSec, range.endSec, 500),
      10_000,
      EMPTY_WINDOW_RESULT,
      `unlocks-index:${slug}`,
    );
    out.set(slug, {
      slug,
      unlockCount: result.stats.unlockCount,
      tokenCount:  result.stats.tokenCount,
      chainCount:  result.stats.chainCount,
    });
  }
  return out;
}

export default async function UnlocksIndex() {
  const counts = await getWindowCounts();
  // After the counts, not concurrently — same pooler discipline as above.
  const upcoming = await getUpcomingTable(25);

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
            Including who actually holds them — a $4M unlock reads very differently when one wallet owns
            most of it than when it&apos;s split across hundreds.
          </p>

          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            {/* Wide table scrolls inside its own container, never the page body. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: "760px" }}>
                <thead>
                  <tr style={{ background: "rgba(21,23,26,0.02)" }}>
                    {["Token", "Protocol", "Unlocks", "Amount", "Value", "Holders", "Top holder"].map((h, i) => (
                      <th
                        key={h}
                        className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                        style={{
                          color: "#8B8E92",
                          textAlign: i >= 3 ? "right" : "left",
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
                    // Concentration drives the colour: a single wallet holding
                    // most of an unlock is the thing worth noticing.
                    // topHolderShare is stored as a FRACTION (0-1), not a
                    // percentage — see token-rollups.ts, which divides by 1e6,
                    // and the maxTopHolder < 1 filter. Rendering it raw showed
                    // a 90%-concentrated token as "1%".
                    const sharePct = u.topHolderShare != null ? u.topHolderShare * 100 : null;
                    const shareColor = sharePct == null ? "#B8BABD"
                      : sharePct >= 75 ? "#DC2626" : sharePct >= 40 ? "#D97706" : "#0F8A8A";
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
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: "#475569", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {amt ?? "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: u.usdValue != null ? "#0F8A8A" : "#B8BABD", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {u.usdValue != null ? fmtUsd(u.usdValue) : "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: u.walletCount != null ? "#475569" : "#B8BABD", borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {u.walletCount != null ? u.walletCount.toLocaleString("en-US") : "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: shareColor, borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                          {sharePct != null ? `${sharePct < 1 ? sharePct.toFixed(1) : sharePct.toFixed(0)}%` : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] mt-3" style={{ color: "#B8BABD" }}>
            Holders and top-holder share come from Vestream&apos;s per-wallet index. A dash means we haven&apos;t
            finished indexing that token&apos;s recipients yet.
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
