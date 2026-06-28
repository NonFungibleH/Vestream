import Link from "next/link";
import { protocolBrand, chainBrand } from "@/lib/protocol-constants";
import { db } from "@/lib/db";
import {
  waitlist, apiAccessRequests, apiKeys, users, wallets, vestingStreamsCache,
  notificationPreferences, betaFeedback, streamAnnotations, mobileTokens,
  protocolTvlSnapshots,
} from "@/lib/db/schema";
import { desc, sql, count, gt } from "drizzle-orm";
import { ApproveButton } from "./ApproveButton";
import { RevokeButton } from "./RevokeButton";

export const dynamic = "force-dynamic";

const BETA_MAX = 100;

const CHAIN_NAMES: Record<number, string> = {
  1:        "Ethereum",
  56:       "BNB Chain",
  137:      "Polygon",
  8453:     "Base",
  42161:    "Arbitrum",
  10:       "Optimism",
  101:      "Solana",
  11155111: "Sepolia",
  84532:    "Base Sepolia",
};

// Protocol + chain colours come from the single source of truth
// (protocol-constants.ts → protocolBrand / chainBrand).

function formatDate(d: Date | null | string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "#141720", border: `1px solid ${accent ? accent + "33" : "#1e2330"}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#4b5563" }}>{label}</p>
      <p className="text-3xl font-bold tracking-tight" style={{ color: accent ?? "white", letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "#4b5563" }}>{sub}</p>}
    </div>
  );
}

function HBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-right shrink-0" style={{ color: "#9ca3af" }}>{label}</div>
      <div className="flex-1 h-2 rounded-full" style={{ background: "#1e2330" }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-16 text-xs shrink-0" style={{ color: "#9ca3af" }}>
        {value.toLocaleString()} {sub && <span style={{ color: "#4b5563" }}>{sub}</span>}
      </div>
    </div>
  );
}

export default async function AdminPage() {
  // Use allSettled + 10 s timeout so a slow query never blocks the whole page
  function withTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
    return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  }

  const results = await Promise.allSettled([
    withTimeout(db.select().from(waitlist).orderBy(desc(waitlist.createdAt))),
    withTimeout(db.select().from(apiAccessRequests).orderBy(desc(apiAccessRequests.createdAt))),
    withTimeout(db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt))),

    withTimeout(db.select().from(users).orderBy(desc(users.createdAt))),
    withTimeout(db.select().from(wallets)),

    withTimeout(db.select({ protocol: vestingStreamsCache.protocol, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.protocol).orderBy(sql`count(*) desc`)),

    withTimeout(db.select({ chainId: vestingStreamsCache.chainId, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.chainId).orderBy(sql`count(*) desc`)),

    withTimeout(db.select({ symbol: vestingStreamsCache.tokenSymbol, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.tokenSymbol).orderBy(sql`count(*) desc`).limit(8)),

    withTimeout(db.select({ isFullyVested: vestingStreamsCache.isFullyVested, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.isFullyVested)),

    withTimeout(db.select({ cnt: count() }).from(notificationPreferences).where(sql`email_enabled = true`)),

    withTimeout(db.select().from(betaFeedback).orderBy(desc(betaFeedback.createdAt)).limit(10)),

    withTimeout(db.select({
      day: sql<string>`date_trunc('day', created_at)::date::text`,
      cnt: count(),
    }).from(users).where(sql`created_at >= now() - interval '30 days'`)
      .groupBy(sql`date_trunc('day', created_at)::date`).orderBy(sql`date_trunc('day', created_at)::date`)),

    // ── Index Health (12: unique recipients excl. testnets) ──────────────────
    // The headline marketing number — distinct wallets vested-to across all
    // active mainnet protocols. Exclude testnets so the count is credible.
    withTimeout(db.select({
      uniqueWallets: sql<number>`count(distinct ${vestingStreamsCache.recipient})::int`,
    }).from(vestingStreamsCache).where(sql`chain_id NOT IN (11155111, 84532)`)),

    // ── Index Health (13: USD value indexed) ────────────────────────────────
    // Sum the latest TVL snapshot rows per (protocol, chainId). Each row is
    // already the result of the daily TVL cron — credible methodology
    // (DefiLlama-vesting passthrough or our own walker + DexScreener pricing
    // with confidence bands). See CLAUDE.md "TVL Methodology" for details.
    withTimeout(db.select({
      tvlUsd: sql<string>`coalesce(sum(${protocolTvlSnapshots.tvlUsd}), 0)::text`,
      rows:   count(),
    }).from(protocolTvlSnapshots)),

    // ── Index Health (14: annotation adoption) ──────────────────────────────
    // How many users have set ≥1 custom name or note. Total annotations.
    // Direct measure of the stickiness feature shipped May 2026.
    withTimeout(db.select({
      totalAnnotations: count(),
      uniqueUsers:      sql<number>`count(distinct ${streamAnnotations.userId})::int`,
    }).from(streamAnnotations)),

    // ── Index Health (15: mobile push adoption) ─────────────────────────────
    // Live (non-expired) mobile bearer tokens — proxy for installed-and-
    // signed-in mobile users. Each device gets one token, so this also
    // approximates the device count.
    withTimeout(db.select({ cnt: count() })
      .from(mobileTokens)
      .where(gt(mobileTokens.expiresAt, new Date()))),

    // ── Index Health (16: cache freshness rollup) ───────────────────────────
    // How many (protocol, chain) cells have been refreshed in the last
    // 24h vs are stale. Quick health-check — surfaces silently-broken
    // pipelines like the Hedgey BSC/Polygon/Base 8.85-day staleness we
    // hit on May 2.
    withTimeout(db.select({
      protocol: vestingStreamsCache.protocol,
      chainId:  vestingStreamsCache.chainId,
      streams:  count(),
      // Treat lastRefreshedAt as "last time any row in this cell moved"
      // (semantic shift from `df6a6b3` setWhere optimisation — see
      // CLAUDE.md). For a "did the cron run?" signal use Vercel logs.
      freshestSec: sql<number>`extract(epoch from max(${vestingStreamsCache.lastRefreshedAt}))::int`,
    }).from(vestingStreamsCache)
      .where(sql`chain_id NOT IN (11155111, 84532)`)
      .groupBy(vestingStreamsCache.protocol, vestingStreamsCache.chainId)),

    // ── Index Health (17: streams added in last 24h) ─────────────────────────
    // Count rows where firstSeenAt is within the last 24h. Direct measure of
    // index growth — how much new data did yesterday's cron pull in.
    withTimeout(db.select({ cnt: count() })
      .from(vestingStreamsCache)
      .where(sql`first_seen_at >= now() - interval '24 hours' AND chain_id NOT IN (11155111, 84532)`)),
  ]);

  // Unwrap allSettled results — fall back to empty arrays so timed-out queries degrade gracefully
  function ok<T>(r: PromiseSettledResult<T>, fallback: T): T {
    return r.status === "fulfilled" ? r.value : (console.error("admin query failed:", (r as PromiseRejectedResult).reason), fallback);
  }
  const waitlistRows       = ok(results[0],  []);
  const requestRows        = ok(results[1],  []);
  const keyRows            = ok(results[2],  []);
  const userRows           = ok(results[3],  []);
  const walletRows         = ok(results[4],  []);
  const streamsByProtocol  = ok(results[5],  []);
  const streamsByChain     = ok(results[6],  []);
  const streamsByToken     = ok(results[7],  []);
  const streamTotals       = ok(results[8],  []);
  const emailAlertsCount   = ok(results[9],  [{ cnt: 0 }]);
  const feedbackRows       = ok(results[10], []);
  const signupTrend        = ok(results[11], []);

  // ── Index Health unwrap ──────────────────────────────────────────────────
  const uniqueWalletsRow   = ok(results[12], [{ uniqueWallets: 0 }]);
  const tvlSummaryRow      = ok(results[13], [{ tvlUsd: "0", rows: 0 }]);
  const annotationStatsRow = ok(results[14], [{ totalAnnotations: 0, uniqueUsers: 0 }]);
  const mobileTokenCount   = ok(results[15], [{ cnt: 0 }]);
  const freshnessCells     = ok(results[16], []);
  const newStreams24h      = ok(results[17], [{ cnt: 0 }]);

  const uniqueRecipients   = Number(uniqueWalletsRow[0]?.uniqueWallets ?? 0);
  const totalUsdIndexed    = Number(tvlSummaryRow[0]?.tvlUsd ?? "0");
  const tvlSnapshotRows    = Number(tvlSummaryRow[0]?.rows ?? 0);
  const annotationsTotal   = Number(annotationStatsRow[0]?.totalAnnotations ?? 0);
  const annotationsUsers   = Number(annotationStatsRow[0]?.uniqueUsers ?? 0);
  const mobileDevices      = Number(mobileTokenCount[0]?.cnt ?? 0);
  const newStreamsLast24h  = Number(newStreams24h[0]?.cnt ?? 0);

  // Cache freshness rollup — count cells fresh / stale by 6h, 24h, 7d windows.
  const nowSec = Math.floor(Date.now() / 1000);
  const SIX_H  = 6 * 60 * 60;
  const ONE_D  = 24 * 60 * 60;
  const ONE_W  = 7 * 24 * 60 * 60;
  let cellsFresh6h = 0, cellsFresh24h = 0, cellsStale7d = 0;
  for (const c of freshnessCells) {
    const ageSec = nowSec - Number(c.freshestSec ?? 0);
    if (ageSec < SIX_H) cellsFresh6h++;
    if (ageSec < ONE_D) cellsFresh24h++;
    if (ageSec > ONE_W) cellsStale7d++;
  }
  const totalCells = freshnessCells.length;

  const pendingRequests = requestRows.filter(r => !r.reviewed);
  const activeKeys      = keyRows.filter(k => !k.revokedAt);

  // ── Derived analytics ───────────────────────────────────────────────────────
  const totalUsers    = userRows.length;
  const totalWallets  = walletRows.length;
  const totalStreams   = streamsByProtocol.reduce((s, r) => s + Number(r.cnt), 0);
  const activeStreams  = streamTotals.find(r => !r.isFullyVested)?.cnt ?? 0;
  const emailAlerts   = Number(emailAlertsCount[0]?.cnt ?? 0);
  const avgRating     = feedbackRows.filter(f => f.rating).length > 0
    ? (feedbackRows.filter(f => f.rating).reduce((s, f) => s + (f.rating ?? 0), 0) / feedbackRows.filter(f => f.rating).length).toFixed(1)
    : "—";

  const maxProtocolStreams = Math.max(...streamsByProtocol.map(r => Number(r.cnt)), 1);
  const maxChainStreams    = Math.max(...streamsByChain.map(r => Number(r.cnt)), 1);
  const maxTokenStreams    = Math.max(...streamsByToken.map(r => Number(r.cnt)), 1);

  // tier breakdown
  const tierCounts = userRows.reduce<Record<string, number>>((acc, u) => {
    acc[u.tier] = (acc[u.tier] ?? 0) + 1; return acc;
  }, {});

  // wallet chain preference (null = all chains)
  const chainFilterCounts = walletRows.reduce<Record<string, number>>((acc, w) => {
    const key = w.chains?.length ? w.chains.join(",") : "all";
    acc[key] = (acc[key] ?? 0) + 1; return acc;
  }, {});
  const walletsAllChains = chainFilterCounts["all"] ?? 0;

  // sign-up trend: fill in zeros for missing days (last 14 days)
  const today = new Date();
  const trendDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const trendMap = Object.fromEntries(signupTrend.map(r => [r.day, Number(r.cnt)]));
  const trendData = trendDays.map(d => ({ day: d, cnt: trendMap[d] ?? 0 }));
  const maxTrend = Math.max(...trendData.map(d => d.cnt), 1);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d0f14", color: "white" }}>

      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1e2330" }}>
        <div className="flex items-center gap-3">
          <img src="/logo-icon-dark.svg" alt="Vestream" className="w-8 h-8" />
          <div>
            <span className="font-bold text-base">Vestream</span>
            <span className="text-xs ml-2 px-2 py-0.5 rounded-md font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/growth" className="text-xs font-semibold" style={{ color: "#60a5fa" }}>
            Growth dashboard →
          </Link>
          <Link href="/admin/cache-stats" className="text-xs" style={{ color: "#4b5563" }}>
            Cache stats
          </Link>
          <Link href="/" className="text-xs" style={{ color: "#4b5563" }}>← Back to site</Link>
        </div>
      </header>

      <div className="px-8 py-8 max-w-6xl mx-auto">

        {/* ── Beta Analytics ─────────────────────────────────────────────────── */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-bold text-xl">Beta Analytics</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(15,138,138,0.2)", color: "#1CB8B8" }}>
              {totalUsers} / {BETA_MAX} spots
            </span>
          </div>

          {/* Row 1: key metrics */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <StatCard label="Beta users" value={totalUsers} sub={`${BETA_MAX - totalUsers} spots left`} accent="#0F8A8A" />
            <StatCard label="Wallets tracked" value={totalWallets} sub={`${(totalWallets / Math.max(totalUsers, 1)).toFixed(1)} avg / user`} accent="#1CB8B8" />
            <StatCard label="Streams cached" value={totalStreams.toLocaleString()} sub={`${Number(activeStreams).toLocaleString()} active`} accent="#2563EB" />
            <StatCard label="Email alerts" value={emailAlerts} sub={`${Math.round((emailAlerts / Math.max(totalUsers, 1)) * 100)}% adoption`} accent="#F0992E" />
            <StatCard label="Waitlist" value={waitlistRows.length} sub="all time" />
            <StatCard label="Feedback" value={feedbackRows.length} sub={avgRating !== "—" ? `avg ${avgRating}★` : "no ratings yet"} accent="#F0992E" />
          </div>

          {/* Row 2: beta cap bar + sign-up trend */}
          <div className="grid grid-cols-2 gap-4 mb-4">

            {/* Beta capacity */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Beta capacity</p>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-bold" style={{ color: "white", letterSpacing: "-0.03em" }}>{totalUsers}</span>
                <span className="text-lg mb-1" style={{ color: "#4b5563" }}>/ {BETA_MAX}</span>
              </div>
              <div className="w-full h-3 rounded-full mb-3" style={{ background: "#1e2330" }}>
                <div className="h-3 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (totalUsers / BETA_MAX) * 100)}%`,
                    background: totalUsers >= BETA_MAX ? "#B3322E" : "#1CB8B8",
                  }} />
              </div>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(tierCounts).map(([tier, n]) => (
                  <span key={tier} className="text-xs px-2 py-0.5 rounded-md font-semibold"
                    style={{
                      background: tier === "fund" ? "rgba(45,179,106,0.15)" : tier === "pro" ? "rgba(28,184,184,0.15)" : "rgba(75,85,99,0.2)",
                      color: tier === "fund" ? "#2563EB" : tier === "pro" ? "#1CB8B8" : "#9ca3af",
                    }}>
                    {n} {tier}
                  </span>
                ))}
              </div>
            </div>

            {/* Sign-up trend sparkline */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Sign-ups · last 14 days</p>
              <div className="flex items-end gap-1 h-16">
                {trendData.map(({ day, cnt }) => (
                  <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                    <div className="w-full rounded-sm transition-all"
                      style={{
                        height: `${Math.max(4, (cnt / maxTrend) * 100)}%`,
                        background: cnt > 0 ? "linear-gradient(180deg, #0F8A8A, #1CB8B8)" : "#1e2330",
                        minHeight: "4px",
                      }} />
                    {/* tooltip on hover */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10
                      text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                      style={{ background: "#0d0f14", border: "1px solid #1e2330", color: "#9ca3af" }}>
                      {day.slice(5)} · {cnt}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{trendDays[0].slice(5)}</span>
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{trendDays[13].slice(5)}</span>
              </div>
            </div>
          </div>

          {/* Row 3: protocol breakdown + chain breakdown + top tokens */}
          <div className="grid grid-cols-3 gap-4 mb-4">

            {/* Protocol breakdown */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Streams by protocol</p>
              {streamsByProtocol.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No streams cached yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {streamsByProtocol.map(r => {
                    const label = r.protocol === "team-finance" ? "Team Finance"
                      : r.protocol === "uncx-vm" ? "UNCX VM"
                      : r.protocol.charAt(0).toUpperCase() + r.protocol.slice(1);
                    const color = protocolBrand(r.protocol).color;
                    return (
                      <HBar key={r.protocol} label={label} value={Number(r.cnt)} max={maxProtocolStreams} color={color} />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chain breakdown */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Streams by chain</p>
              {streamsByChain.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No streams cached yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {streamsByChain.map(r => {
                    const label = CHAIN_NAMES[r.chainId] ?? `Chain ${r.chainId}`;
                    const color = chainBrand(r.chainId).color;
                    return (
                      <HBar key={r.chainId} label={label} value={Number(r.cnt)} max={maxChainStreams} color={color} />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top tokens */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Top tokens tracked</p>
              {streamsByToken.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No streams cached yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {streamsByToken.map(r => (
                    <HBar key={r.symbol ?? "?"} label={r.symbol ?? "Unknown"} value={Number(r.cnt)} max={maxTokenStreams} color="#1CB8B8" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 4: wallet config + feedback */}
          <div className="grid grid-cols-2 gap-4">

            {/* Wallet config */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Wallet configuration</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{walletsAllChains}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>watching all chains</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{totalWallets - walletsAllChains}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>chain-specific filter</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{emailAlerts}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>email alerts enabled</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{walletRows.filter(w => w.tokenAddress).length}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>token-specific filter</p>
                </div>
              </div>
              {/* Users breakdown */}
              <div className="pt-4" style={{ borderTop: "1px solid #1e2330" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#4b5563" }}>Avg wallets per user</span>
                  <span className="text-xs font-semibold" style={{ color: "white" }}>
                    {(totalWallets / Math.max(totalUsers, 1)).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs" style={{ color: "#4b5563" }}>Users with 0 wallets</span>
                  <span className="text-xs font-semibold" style={{ color: "#f87171" }}>
                    {userRows.filter(u => !walletRows.some(w => w.userId === u.id)).length}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs" style={{ color: "#4b5563" }}>Users at wallet limit (3)</span>
                  <span className="text-xs font-semibold" style={{ color: "#F0B83D" }}>
                    {userRows.filter(u => walletRows.filter(w => w.userId === u.id).length >= 3).length}
                  </span>
                </div>
              </div>
            </div>

            {/* Feedback */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4b5563" }}>Beta feedback</p>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(n => (
                    <span key={n} className="text-sm"
                      style={{ color: avgRating !== "—" && n <= Math.round(Number(avgRating)) ? "#F0992E" : "#1e2330" }}>★</span>
                  ))}
                  <span className="text-xs ml-1" style={{ color: "#9ca3af" }}>{avgRating}</span>
                </div>
              </div>
              {feedbackRows.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No feedback yet.</p>
              ) : (
                <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-1">
                  {feedbackRows.map(f => (
                    <div key={f.id} className="rounded-xl px-4 py-3" style={{ background: "#0d0f14", border: "1px solid #1e2330" }}>
                      <div className="flex items-center gap-2 mb-1">
                        {f.rating && (
                          <span className="text-xs font-semibold" style={{ color: "#F0992E" }}>{"★".repeat(f.rating)}</span>
                        )}
                        <span className="text-[10px]" style={{ color: "#4b5563" }}>{formatDate(f.createdAt)}</span>
                        {f.userAddress && (
                          <code className="text-[10px]" style={{ color: "#4b5563" }}>
                            {f.userAddress.slice(0, 6)}…{f.userAddress.slice(-4)}
                          </code>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>{f.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Index Health ───────────────────────────────────────────────────── */}
        {/*
          Investor + marketing pull-quotes plus daily pipeline-health checks.
          The headline metrics (unique recipients, USD indexed) are the
          numbers that go into pitch decks and "X tracked" marketing copy.
          Cache freshness + new-streams-24h are the operational signals that
          tell us if the seeder is doing real work.
        */}
        <div className="mb-12" style={{ borderTop: "1px solid #1e2330", paddingTop: "2rem" }}>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-bold text-xl">Index Health</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}>
              live
            </span>
            <span className="text-[11px]" style={{ color: "#4b5563" }}>
              mainnet only · testnets excluded
            </span>
          </div>

          {/* Headline metrics — investor-deck row */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <StatCard
              label="Unique recipients"
              value={uniqueRecipients.toLocaleString()}
              sub="distinct wallets vested-to"
              accent="#1CB8B8"
            />
            <StatCard
              label="USD indexed"
              value={
                totalUsdIndexed >= 1_000_000_000
                  ? `$${(totalUsdIndexed / 1_000_000_000).toFixed(2)}B`
                  : totalUsdIndexed >= 1_000_000
                  ? `$${(totalUsdIndexed / 1_000_000).toFixed(1)}M`
                  : `$${totalUsdIndexed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              }
              sub={`${tvlSnapshotRows} (proto, chain) rows`}
              accent="#0F8A4A"
            />
            <StatCard
              label="Streams indexed"
              value={totalStreams.toLocaleString()}
              sub={`+${newStreamsLast24h.toLocaleString()} in last 24h`}
              accent="#2563EB"
            />
            <StatCard
              label="Mobile devices"
              value={mobileDevices.toLocaleString()}
              sub="active bearer tokens"
              accent="#F0992E"
            />
            <StatCard
              label="Annotations"
              value={annotationsTotal.toLocaleString()}
              sub={`${annotationsUsers} users · ${
                totalUsers > 0
                  ? Math.round((annotationsUsers / totalUsers) * 100)
                  : 0
              }% adoption`}
              accent="#A26B3F"
            />
            <StatCard
              label="Cache cells fresh < 24h"
              value={`${cellsFresh24h}/${totalCells}`}
              sub={cellsStale7d > 0 ? `${cellsStale7d} stale > 7d ⚠` : "all cells healthy"}
              accent={cellsStale7d > 0 ? "#F0B83D" : "#0F8A4A"}
            />
          </div>

          {/* Cache freshness panel — per-cell breakdown so we can spot the
              "Hedgey BSC stuck for 8 days" pattern at a glance. Cells are
              sorted oldest-first so the most concerning ones float to the
              top of the list. */}
          <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4b5563" }}>
                Cache freshness · per (protocol, chain)
              </p>
              <div className="flex items-center gap-3 text-[10px]" style={{ color: "#9ca3af" }}>
                <span><span style={{ color: "#0F8A4A" }}>●</span> &lt;6h</span>
                <span><span style={{ color: "#1CB8B8" }}>●</span> &lt;24h</span>
                <span><span style={{ color: "#F0B83D" }}>●</span> &lt;7d</span>
                <span><span style={{ color: "#B3322E" }}>●</span> &gt;7d</span>
              </div>
            </div>
            {freshnessCells.length === 0 ? (
              <p className="text-xs" style={{ color: "#4b5563" }}>No cache rows yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {[...freshnessCells]
                  .sort((a, b) => Number(a.freshestSec ?? 0) - Number(b.freshestSec ?? 0))
                  .map((c) => {
                    const ageSec  = nowSec - Number(c.freshestSec ?? 0);
                    const ageMin  = Math.floor(ageSec / 60);
                    const ageHr   = Math.floor(ageSec / 3600);
                    const ageD    = Math.floor(ageSec / 86400);
                    const ageStr  = ageD >= 1 ? `${ageD}d` : ageHr >= 1 ? `${ageHr}h` : `${ageMin}m`;
                    const dot     = ageSec < SIX_H ? "#0F8A4A"
                                  : ageSec < ONE_D ? "#1CB8B8"
                                  : ageSec < ONE_W ? "#F0B83D"
                                  : "#B3322E";
                    const protoLabel = c.protocol === "team-finance" ? "Team Finance"
                      : c.protocol === "uncx-vm" ? "UNCX VM"
                      : c.protocol === "jupiter-lock" ? "Jupiter Lock"
                      : c.protocol.charAt(0).toUpperCase() + c.protocol.slice(1);
                    const chainLabel = CHAIN_NAMES[c.chainId] ?? `chain ${c.chainId}`;
                    return (
                      <div key={`${c.protocol}-${c.chainId}`}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md"
                        style={{ background: "#0d0f14", border: "1px solid #1e2330" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ color: dot, fontSize: 10 }}>●</span>
                          <span className="text-xs truncate" style={{ color: "white" }}>{protoLabel}</span>
                          <span className="text-[10px]" style={{ color: "#4b5563" }}>·</span>
                          <span className="text-[10px] truncate" style={{ color: "#9ca3af" }}>{chainLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] tabular-nums" style={{ color: "#4b5563" }}>
                            {Number(c.streams).toLocaleString()} streams
                          </span>
                          <span className="text-[10px] tabular-nums font-semibold" style={{ color: dot, minWidth: 32, textAlign: "right" }}>
                            {ageStr}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            <p className="text-[10px] mt-4" style={{ color: "#4b5563" }}>
              Freshness = max(last_refreshed_at) per cell. Since the May 2026
              setWhere optimisation, this means &ldquo;last time data actually
              moved&rdquo; — frozen cells could mean genuinely-quiet protocols
              OR silently broken pipelines. Cross-check with Vercel cron logs
              for cells stuck &gt; 24h.
            </p>
          </div>
        </div>

        {/* ── Operations ─────────────────────────────────────────────────────── */}
        <div className="mb-6" style={{ borderTop: "1px solid #1e2330", paddingTop: "2rem" }}>
          <h2 className="font-bold text-xl mb-6">Operations</h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          <StatCard label="Waitlist" value={waitlistRows.length} sub="total signups" />
          <StatCard label="API Requests" value={requestRows.length} sub={`${pendingRequests.length} pending review`} />
          <StatCard label="Active Keys" value={activeKeys.length} sub={`${keyRows.length} total issued`} />
          <StatCard label="Revoked Keys" value={keyRows.length - activeKeys.length} sub="all time" />
        </div>

        {/* Pending API Access Requests */}
        {pendingRequests.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-lg">Pending API requests</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                {pendingRequests.length} pending
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {pendingRequests.map(r => (
                <div key={r.id} className="rounded-2xl p-6"
                  style={{ background: "#141720", border: "1px solid #1CB8B833" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="font-semibold text-sm">{r.name}</span>
                        {r.company && (
                          <span className="text-xs px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}>
                            {r.company}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: "#4b5563" }}>{r.email}</span>
                        <span className="text-xs" style={{ color: "#4b5563" }}>{formatDate(r.createdAt)}</span>
                      </div>
                      <p className="text-sm leading-relaxed mb-3" style={{ color: "#9ca3af" }}>{r.useCase}</p>
                      {r.protocols && r.protocols.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {r.protocols.map(p => (
                            <span key={p} className="text-xs px-2 py-0.5 rounded-md"
                              style={{ background: "rgba(15,138,138,0.15)", color: "#1CB8B8" }}>
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ApproveButton
                      requestId={r.id}
                      email={r.email}
                      name={r.name}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active API Keys */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4">Active API keys ({activeKeys.length})</h2>
          {activeKeys.length === 0 ? (
            <p className="text-sm" style={{ color: "#4b5563" }}>No keys issued yet.</p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2330" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#141720", borderBottom: "1px solid #1e2330" }}>
                    {["Owner", "Key prefix", "Tier", "Usage", "Last used", "Issued", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "#4b5563" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeKeys.map((k, i) => (
                    <tr key={k.id} style={{ borderBottom: i < activeKeys.length - 1 ? "1px solid #1e2330" : "none" }}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: "white" }}>{k.ownerEmail}</div>
                        {k.ownerName && <div className="text-xs" style={{ color: "#4b5563" }}>{k.ownerName}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs" style={{ color: "#1CB8B8" }}>{k.keyPrefix}...</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-md font-semibold"
                          style={{
                            background: k.tier === "pro" ? "rgba(15,138,138,0.15)" : "rgba(37,99,235,0.1)",
                            color:      k.tier === "pro" ? "#1CB8B8"               : "#34d399",
                          }}>
                          {k.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: "#9ca3af" }}>
                          {k.usageThisMonth} / {k.monthlyLimit}
                        </span>
                        <div className="w-20 h-1 rounded-full mt-1" style={{ background: "#1e2330" }}>
                          <div className="h-1 rounded-full" style={{
                            background: "#1CB8B8",
                            width: `${Math.min(100, (k.usageThisMonth / k.monthlyLimit) * 100)}%`,
                          }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>
                        {formatDate(k.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>
                        {formatDate(k.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <RevokeButton keyId={k.id} keyPrefix={k.keyPrefix} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* All API Requests (reviewed) */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4">All API requests ({requestRows.length})</h2>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2330" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#141720", borderBottom: "1px solid #1e2330" }}>
                  {["Name / Company", "Email", "Use case", "Protocols", "Status", "Date"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "#4b5563" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requestRows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < requestRows.length - 1 ? "1px solid #1e2330" : "none" }}>
                    <td className="px-4 py-3">
                      <div style={{ color: "white" }}>{r.name}</div>
                      {r.company && <div className="text-xs" style={{ color: "#4b5563" }}>{r.company}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.email}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "#9ca3af" }}>{r.useCase}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.protocols ?? []).map(p => (
                          <span key={p} className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(15,138,138,0.12)", color: "#1CB8B8" }}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: r.reviewed ? "rgba(37,99,235,0.1)"  : "rgba(245,158,11,0.1)",
                          color:      r.reviewed ? "#34d399"                : "#F0B83D",
                        }}>
                        {r.reviewed ? "reviewed" : "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Waitlist */}
        <section>
          <h2 className="font-bold text-lg mb-4">Waitlist ({waitlistRows.length})</h2>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2330" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#141720", borderBottom: "1px solid #1e2330" }}>
                  {["Email", "Signed up"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "#4b5563" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waitlistRows.map((w, i) => (
                  <tr key={w.id} style={{ borderBottom: i < waitlistRows.length - 1 ? "1px solid #1e2330" : "none" }}>
                    <td className="px-4 py-3" style={{ color: "#9ca3af" }}>{w.email}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
